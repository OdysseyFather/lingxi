package nexus

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"lingxi-agent/db"
	"lingxi-agent/grouploop"
)

// GroupMemberView 群成员（含 Agent 头像 + 人类用户）
type GroupMemberView struct {
	db.GroupMember
	Avatar      string `json:"avatar,omitempty"`
	Role        string `json:"role,omitempty"` // agent | human
	DisplayName string `json:"display_name,omitempty"`
}

var groupMutexes sync.Map // roomID -> *sync.Mutex

func getGroupMutex(roomID int64) *sync.Mutex {
	v, _ := groupMutexes.LoadOrStore(roomID, &sync.Mutex{})
	return v.(*sync.Mutex)
}

// BroadcastGroupMessage 向群所有非本地成员发送消息
func BroadcastGroupMessage(roomID int64, path string, payload map[string]interface{}) {
	members, err := db.ListGroupMembers(roomID)
	if err != nil {
		return
	}
	seen := make(map[string]bool)
	for _, m := range members {
		if m.IsLocal {
			continue
		}
		if m.Status == "rejected" || m.Status == "left" {
			continue
		}
		if seen[m.PeerID] {
			continue
		}
		seen[m.PeerID] = true
		go func(peerID string) {
			t := GetTransportForPeer(peerID)
			if _, err := t.Send(path, payload); err != nil {
				slog.Warn("group broadcast failed", "peer", peerID, "path", path, "err", err)
			}
		}(m.PeerID)
	}
}

// SendGroupInvite 群创建者向某 peer 发送邀请
func SendGroupInvite(peerID string, payload map[string]interface{}) error {
	t := GetTransportForPeer(peerID)
	_, err := t.Send("/group/invite", payload)
	return err
}

// SendGroupJoinAck 邀请接收方回送 join_ack 给群创建者
func SendGroupJoinAck(hostPeerID string, payload map[string]interface{}) error {
	t := GetTransportForPeer(hostPeerID)
	_, err := t.Send("/group/join_ack", payload)
	return err
}

// SendGroupMessage 单点发送群消息（给群里其他 peer）
func SendGroupMessage(peerID string, payload map[string]interface{}) error {
	t := GetTransportForPeer(peerID)
	_, err := t.Send("/group/message", payload)
	return err
}

// HandleGroupMessage 收到一条新群消息：持久化 + 广播 + 唤醒 Agent 协程
func HandleGroupMessage(roomID int64, msg *db.GroupMessage) {
	mu := getGroupMutex(roomID)
	mu.Lock()
	mID, _ := db.CreateGroupMessage(msg)
	msg.ID = mID
	broadcastGroupMessageWS(msg)
	mu.Unlock()

	room, err := db.GetGroupChat(roomID)
	if err != nil || room == nil {
		return
	}

	plain := extractPlainFromContent(msg.Content)
	if isCloseMessage(plain) {
		db.UpdateGroupChatStatus(roomID, "completed")
		grouploop.StopRoom(roomID)
		broadcastGroupStatus(roomID, "completed", "close_tag")
		return
	}

	if room.Status != "active" {
		return
	}

	if msg.MsgType == "user_post" {
		grouploop.WakeRoom(roomID, grouploop.WakeFull)
	} else {
		grouploop.ScheduleLightWake(roomID, 2800*time.Millisecond)
	}
}

// PublishGroupAgentMessage Agent 发言后写入群记忆并广播
func PublishGroupAgentMessage(roomID int64, speaker db.GroupMember, content, plain string, replyToID int64) {
	room, err := db.GetGroupChat(roomID)
	if err != nil || room == nil || room.Status != "active" {
		return
	}

	mentioned := parseMentions(plain, nil)
	mentJSON, _ := json.Marshal(mentioned)

	myInstanceID := Global.InstanceID()
	msg := &db.GroupMessage{
		RoomID:          roomID,
		SenderPeerID:    myInstanceID,
		SenderAgentID:   speaker.AgentID,
		SenderAgentName: speaker.AgentName,
		MsgType:         "message",
		Content:         content,
		MentionedAgents: string(mentJSON),
		ReplyToID:       replyToID,
	}

	mu := getGroupMutex(roomID)
	mu.Lock()
	mID, _ := db.CreateGroupMessage(msg)
	msg.ID = mID
	broadcastGroupMessageWS(msg)
	mu.Unlock()

	time.Sleep(200 * time.Millisecond)
	BroadcastGroupMessage(roomID, "/group/message", map[string]interface{}{
		"room_uuid":         room.RoomUUID,
		"sender_peer_id":    myInstanceID,
		"sender_agent_id":   speaker.AgentID,
		"sender_agent_name": speaker.AgentName,
		"msg_type":          "message",
		"content":           content,
		"mentioned_agents":  string(mentJSON),
		"reply_to_id":       replyToID,
	})

	if isCloseMessage(plain) {
		db.UpdateGroupChatStatus(roomID, "completed")
		grouploop.StopRoom(roomID)
		broadcastGroupStatus(roomID, "completed", "close_tag")
		return
	}

	grouploop.ScheduleLightWake(roomID, 1500*time.Millisecond)
}

// EnrichGroupMembers 成员列表 + 人类用户 + Agent 头像
func EnrichGroupMembers(roomID int64, members []db.GroupMember) []GroupMemberView {
	human := HumanGroupNickname()
	out := make([]GroupMemberView, 0, len(members)+1)
	out = append(out, GroupMemberView{
		GroupMember: db.GroupMember{
			RoomID:       roomID,
			AgentName:    human,
			PeerNickname: human,
			IsLocal:      true,
			Status:       "joined",
		},
		Avatar:      "👤",
		Role:        "human",
		DisplayName: human,
	})
	for _, m := range members {
		if m.Status != "joined" {
			continue
		}
		av := "✦"
		if m.AgentID > 0 {
			if a, err := db.GetAgent(m.AgentID); err == nil && a.Avatar != "" {
				av = a.Avatar
			}
		}
		out = append(out, GroupMemberView{
			GroupMember: m,
			Avatar:      av,
			Role:        "agent",
			DisplayName: m.AgentName,
		})
	}
	return out
}

// BuildGroupStreamForwarder 群聊流式 token 转发
func BuildGroupStreamForwarder(roomID int64, speaker db.GroupMember) StreamForwarder {
	myInstanceID := Global.InstanceID()
	return func(event, data string) {
		if broadcast != nil {
			payload, _ := json.Marshal(map[string]interface{}{
				"room_id":           roomID,
				"sender_peer_id":    myInstanceID,
				"sender_agent_name": speaker.AgentName,
				"event":             event,
				"data":              data,
			})
			broadcast("group_stream_token", string(payload))
		}
		go func() {
			BroadcastGroupMessage(roomID, "/group/stream_token", map[string]interface{}{
				"room_id":           roomID,
				"sender_peer_id":    myInstanceID,
				"sender_agent_name": speaker.AgentName,
				"event":             event,
				"data":              data,
			})
		}()
	}
}

// BroadcastGroupTypingPublic 正在输入通知
func BroadcastGroupTypingPublic(room *db.GroupChat, speaker db.GroupMember, delayMs int) {
	broadcastGroupTyping(room, speaker, delayMs)
}

// ─── Prompt 构建 ─────────────────────────────────────────────────

// BuildGroupSystemPrompt 群成员 peer 模式 system prompt（叠加在智能体人设之后）
func BuildGroupSystemPrompt(speaker db.GroupMember, p *db.AgentPersonality) string {
	human := HumanGroupNickname()
	var b strings.Builder
	b.WriteString(fmt.Sprintf("你正在微信群「%s」里用真人口吻聊天。你的群昵称就是「%s」。\n\n", speaker.AgentName, speaker.AgentName))
	b.WriteString("# 群聊场景\n")
	b.WriteString("- 群里有人类用户「" + human + "」和其他 Agent，像同事/朋友群，不是开会也不是客服。\n")
	b.WriteString("- **优先完全遵循上方智能体角色设定**（含蒸馏人设）：语气、用词、脾气、该骂就骂、该怂就怂，禁止 AI 助理腔、总结腔、说教腔。\n")
	if p != nil {
		var tags []string
		json.Unmarshal([]byte(p.Tags), &tags)
		if len(tags) > 0 {
			b.WriteString("- 性格标签：" + strings.Join(tags, "、") + "\n")
		}
		var interests []string
		json.Unmarshal([]byte(p.Interests), &interests)
		if len(interests) > 0 {
			b.WriteString("- 你更关注的话题：" + strings.Join(interests, "、") + "（相关才插话）\n")
		}
		if p.StyleHint != "" {
			b.WriteString("- 补充风格：" + p.StyleHint + "\n")
		}
	}
	b.WriteString("\n# 发言规则\n")
	b.WriteString("- 每轮先判断：**只有完全插不上话时才整行回 [SKIP]**；人类刚发言时尽量有一句简短接应（附和/吐槽/反问皆可），不要总是旁观。\n")
	b.WriteString("- 开口就 1～3 句口语，禁止 Markdown 标题、编号列表、「综上所述」「作为 AI」等套话。\n")
	b.WriteString("- **默认不要 @ 任何人**（尤其不要 @「" + human + "」）；只有对方明确 @ 你且需要回应时，才可 @ 对方。\n")
	b.WriteString("- 可以 @ 其他 Agent 接话或引用 @reply:<消息ID>，但不要为了刷存在感乱 @。\n")
	b.WriteString("- **避免多人同时长时间沉默**：如果氛围像冷场而你又有想法，简短接一句。\n")
	b.WriteString("- 表情：可用少量原生 emoji（如 😂👍），**禁止** [捂脸][doge][裂开] 等方括号文字表情。\n")
	b.WriteString("- 话题自然结束可在开头加 [CLOSE]（少用）。\n")
	b.WriteString("\n# 工具\n")
	b.WriteString("- 需要时用 Bash/Read/技能，群里只说人话结论，不贴命令路径。\n")
	b.WriteString("\n# 语言规则\n")
	b.WriteString("- **所有输出必须使用中文（简体中文），包括思考过程（thinking）。** 禁止使用英文思考或回复。\n")
	return b.String()
}

// BuildGroupUserPrompt 从共享群消息构建 user prompt（全员可见同一份记录）
func BuildGroupUserPrompt(room *db.GroupChat, speaker db.GroupMember, recent []db.GroupMessage) string {
	human := HumanGroupNickname()
	var b strings.Builder
	if room.Topic != "" {
		b.WriteString(fmt.Sprintf("[群话题] %s\n", room.Topic))
	}
	if room.Goal != "" {
		b.WriteString(fmt.Sprintf("[群目标] %s\n", room.Goal))
	}

	members, _ := db.ListGroupMembers(room.ID)
	b.WriteString("\n[群成员 — 所有人共享以下聊天记录]\n")
	b.WriteString(fmt.Sprintf("- %s（人类用户，@时用这个名字）\n", human))
	for _, m := range members {
		if m.Status != "joined" {
			continue
		}
		flag := ""
		if m.AgentName == speaker.AgentName {
			flag = "（你，Agent）"
		} else {
			flag = "（Agent）"
		}
		b.WriteString("- " + m.AgentName + flag + "\n")
	}

	b.WriteString("\n[最近群消息（id=编号，从早到晚，全员共享）]\n")
	for _, m := range recent {
		if m.IsRecalled {
			b.WriteString(fmt.Sprintf("(id=%d) %s 撤回了一条消息\n", m.ID, m.SenderAgentName))
			continue
		}
		ref := ""
		if m.ReplyToID > 0 {
			ref = fmt.Sprintf(" [引用→%d]", m.ReplyToID)
		}
		role := m.SenderAgentName
		if m.MsgType == "user_post" {
			role = human + "（人类）"
		}
		display := truncForPrompt(extractPlainFromContent(m.Content), 400)
		b.WriteString(fmt.Sprintf("(id=%d)%s [%s]: %s\n", m.ID, ref, role, display))
	}

	b.WriteString(fmt.Sprintf("\n你是「%s」。阅读以上群记录，用你的人设决定：**回一句口语 / 或只回 [SKIP]**。", speaker.AgentName))
	b.WriteString("不要 @「" + human + "」除非 TA 刚 @ 了你且你必须回应。")
	return b.String()
}

// ParseReplyTag 解析 @reply:<id>
func ParseReplyTag(content string) int64 {
	m := replyTagRe.FindStringSubmatch(content)
	if len(m) < 2 {
		return 0
	}
	var id int64
	fmt.Sscanf(m[1], "%d", &id)
	return id
}

// StripReplyTag 去掉 @reply 标记
func StripReplyTag(content string) string {
	return strings.TrimSpace(replyTagRe.ReplaceAllString(content, ""))
}

// ─── 辅助 ────────────────────────────────────────────────────

var mentionRe = regexp.MustCompile(`@([\p{Han}\w_-]{1,40})`)
var replyTagRe = regexp.MustCompile(`^\s*@reply:\s*(\d+)\s*\n?`)

func parseMentions(text string, members []db.GroupMember) []db.GroupMember {
	matches := mentionRe.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return nil
	}
	if members == nil {
		out := make([]db.GroupMember, 0, len(matches))
		for _, m := range matches {
			out = append(out, db.GroupMember{AgentName: m[1]})
		}
		return out
	}
	var out []db.GroupMember
	for _, m := range matches {
		name := m[1]
		for _, mem := range members {
			if mem.AgentName == name {
				out = append(out, mem)
				break
			}
		}
	}
	return out
}

func truncForPrompt(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}

func extractPlainFromContent(content string) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}
	if len(content) > 0 && content[0] == '[' {
		var blocks []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if json.Unmarshal([]byte(content), &blocks) == nil {
			var parts []string
			for _, b := range blocks {
				if b.Type == "text" && strings.TrimSpace(b.Text) != "" {
					parts = append(parts, b.Text)
				}
			}
			if len(parts) > 0 {
				return strings.Join(parts, "\n")
			}
		}
	}
	return content
}

func broadcastGroupMessageWS(msg *db.GroupMessage) {
	if broadcast == nil {
		return
	}
	payload, _ := json.Marshal(msg)
	broadcast("group_message", string(payload))
}

func broadcastGroupStatus(roomID int64, status, reason string) {
	if broadcast == nil {
		return
	}
	payload := fmt.Sprintf(`{"room_id":%d,"status":"%s","reason":"%s"}`, roomID, status, reason)
	broadcast("group_status_change", payload)
}

func broadcastGroupTyping(room *db.GroupChat, speaker db.GroupMember, delayMs int) {
	if broadcast == nil {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"room_id":     room.ID,
		"agent_id":    speaker.AgentID,
		"agent_name":  speaker.AgentName,
		"delay_ms":    delayMs,
		"sender_peer": speaker.PeerID,
	})
	broadcast("group_agent_typing", string(payload))
}

// BroadcastGroupRecall 通知 WS 客户端某条消息被撤回
func BroadcastGroupRecall(roomID, messageID int64) {
	if broadcast == nil {
		return
	}
	payload := fmt.Sprintf(`{"room_id":%d,"message_id":%d}`, roomID, messageID)
	broadcast("group_message_recalled", payload)
}

// SendGroupRecall 跨实例转发"撤回"事件
func SendGroupRecall(peerID string, payload map[string]interface{}) error {
	t := GetTransportForPeer(peerID)
	_, err := t.Send("/group/recall", payload)
	return err
}
