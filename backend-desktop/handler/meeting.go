package handler

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"lingxi-agent/db"
	"lingxi-agent/grouploop"
	"lingxi-agent/nexus"
)

// 会议循环运行态：每个会议房间一个 goroutine + cancel
var (
	meetingMu      sync.Mutex
	meetingCancels = map[int64]context.CancelFunc{}
)

var meetingMentionRe = regexp.MustCompile(`@([\p{Han}\w_-]{1,40})`)

// DriveMeeting 由 grouploop 注入：工作会议模式的统一调度入口。
// trigger: "boot"(群启动/恢复) | "user"(用户发言推进) | "stop"(停止会议循环)
func DriveMeeting(roomID int64, trigger string) {
	switch trigger {
	case "stop":
		stopMeetingLoop(roomID)
	case "boot", "user":
		startMeetingLoop(roomID)
	}
}

func stopMeetingLoop(roomID int64) {
	meetingMu.Lock()
	defer meetingMu.Unlock()
	if cancel, ok := meetingCancels[roomID]; ok {
		cancel()
		delete(meetingCancels, roomID)
	}
}

// startMeetingLoop 幂等启动会议循环（已在进行则忽略）
func startMeetingLoop(roomID int64) {
	meetingMu.Lock()
	if _, running := meetingCancels[roomID]; running {
		meetingMu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	meetingCancels[roomID] = cancel
	meetingMu.Unlock()

	go func() {
		defer stopMeetingLoop(roomID)
		runMeeting(ctx, roomID)
	}()
}

// runMeeting 工作会议：主持人驱动的串行调度（开场→点名→推进→结论）
func runMeeting(ctx context.Context, roomID int64) {
	room, err := db.GetGroupChat(roomID)
	if err != nil || room == nil || room.Status != "active" || room.ChatMode != "meeting" {
		return
	}

	members, _ := db.ListGroupMembers(roomID)
	moderator := findLocalModerator(members, room.ModeratorAgentID)
	if moderator == nil {
		slog.Warn("meeting: no local moderator found", "room", roomID, "moderatorAgentID", room.ModeratorAgentID, "memberCount", len(members))
		for _, mm := range members {
			slog.Warn("meeting member dump", "agentID", mm.AgentID, "name", mm.AgentName, "isLocal", mm.IsLocal, "status", mm.Status)
		}
		saveSystemGroupMessage(roomID, "⚠️ 会议无法开始：主持人必须是本机的智能体（请在创建会议时把主持人设为本端 Agent）。")
		db.UpdateGroupChatStatus(roomID, "paused")
		BroadcastWSEvent("group_status_change", fmt.Sprintf(`{"room_id":%d,"status":"paused","reason":"no_local_moderator"}`, roomID))
		return
	}
	participants := localMeetingParticipants(members, room.ModeratorAgentID)

	maxRounds := room.MaxRounds
	if maxRounds <= 0 {
		maxRounds = 12
	}

	// 开场（仅当尚无 Agent 发言时；支持重启恢复不重复开场）
	recent, _ := db.GetRecentGroupMessages(roomID, 50)
	if countMeetingMessages(recent) == 0 {
		if ctx.Err() != nil {
			return
		}
		open := meetingSpeak(ctx, room, *moderator, "moderator",
			"现在由你开场主持：用 1-2 句话点明议题与目标，然后点名第一位参会者发言（写「@对方名字」）。")
		if open == "" || isCloseMeeting(open) {
			if isCloseMeeting(open) {
				finishMeeting(roomID)
			} else {
				saveSystemGroupMessage(roomID, "⚠️ 主持人开场失败，请检查模型接入点是否已配置并激活。你可以在右上角菜单中「继续群聊」重试。")
				db.UpdateGroupChatStatus(roomID, "paused")
				BroadcastWSEvent("group_status_change", fmt.Sprintf(`{"room_id":%d,"status":"paused","reason":"moderator_speak_failed"}`, roomID))
			}
			return
		}
	}

	for round := 0; round < maxRounds; round++ {
		if ctx.Err() != nil {
			return
		}
		room, _ = db.GetGroupChat(roomID)
		if room == nil || room.Status != "active" {
			return
		}
		recent, _ = db.GetRecentGroupMessages(roomID, 50)

		// 选下一位发言者：优先主持人点名的本地参会者；否则轮流
		var next *db.GroupMember
		if n := pickNextLocalSpeaker(recent, participants); n != nil {
			next = n
		} else if len(participants) > 0 {
			p := participants[round%len(participants)]
			next = &p
		}

		// 参会者发言（无本地参会者时跳过该步，由主持人独自推进）
		if next != nil {
			if ctx.Err() != nil {
				return
			}
			meetingSpeak(ctx, room, *next, "participant",
				"现在轮到你（被主持人点名）发言。紧扣主持人当前的问题和会议目标，给出你的专业观点或方案。")
		}

		if ctx.Err() != nil {
			return
		}
		// 主持人推进 / 收尾
		remain := maxRounds - round - 1
		instr := "请你点评刚才的发言、补充你自己的专业观点，然后点名下一位参会者继续（写「@名字」）。如果讨论已经充分、会议目标达成，就用「【结论】」开头输出结构化结论，并在最后单独一行写 [CLOSE]。"
		if remain <= 1 {
			instr = "会议即将到时。请基于以上全部讨论，用「【结论】」开头总结结构化结论（关键共识 / 决议 / 下一步行动），并在最后单独一行写 [CLOSE] 结束会议。"
		}
		drive := meetingSpeak(ctx, room, *moderator, "moderator", instr)
		db.UpdateGroupChatRound(roomID, round+1)
		if drive == "" {
			continue
		}
		if isCloseMeeting(drive) {
			finishMeeting(roomID)
			return
		}
	}

	// 轮数耗尽兜底：强制主持人总结结论
	if ctx.Err() != nil {
		return
	}
	room, _ = db.GetGroupChat(roomID)
	if room != nil && room.Status == "active" {
		meetingSpeak(ctx, room, *moderator, "moderator",
			"会议已达到最大发言轮数。请立刻用「【结论】」开头总结结构化结论（关键共识 / 决议 / 下一步行动），并在最后单独一行写 [CLOSE] 结束会议。")
		finishMeeting(roomID)
	}
}

// meetingSpeak 让指定 Agent 以会议角色发言，发布消息并返回纯文本
func meetingSpeak(ctx context.Context, room *db.GroupChat, speaker db.GroupMember, role, instruction string) string {
	if ctx.Err() != nil {
		return ""
	}
	personality, _ := db.GetPersonality(speaker.AgentID)
	recent, _ := db.GetRecentGroupMessages(room.ID, 50)
	members, _ := db.ListGroupMembers(room.ID)

	var systemPrompt string
	if role == "moderator" {
		systemPrompt = buildMeetingModeratorFullPrompt(speaker, personality, room, members)
	} else {
		systemPrompt = buildMeetingParticipantFullPrompt(speaker, personality, room)
	}
	userPrompt := nexus.BuildMeetingUserPrompt(room, speaker, recent, instruction)

	nexus.BroadcastGroupTypingPublic(room, speaker, 600)
	forwarder := nexus.BuildGroupStreamForwarder(room.ID, speaker)

	result, err := RunGroupAgentTurn(systemPrompt, userPrompt, speaker.AgentID, forwarder)
	if err != nil || result.Skipped {
		return ""
	}
	plain := strings.TrimSpace(result.PlainText)
	if plain == "" {
		return ""
	}
	content := result.BlocksJSON
	if content == "" {
		content = plain
	}
	nexus.PublishGroupAgentMessage(room.ID, speaker, content, plain, 0)
	// 串行节奏：给 UI / 网络转发与阅读留出时间
	time.Sleep(600 * time.Millisecond)
	return plain
}

func buildMeetingModeratorFullPrompt(speaker db.GroupMember, p *db.AgentPersonality, room *db.GroupChat, members []db.GroupMember) string {
	var b strings.Builder
	if speaker.AgentID > 0 {
		if a, err := db.GetAgent(speaker.AgentID); err == nil && !a.Builtin && strings.TrimSpace(a.SystemPrompt) != "" {
			b.WriteString(strings.TrimSpace(a.SystemPrompt))
			b.WriteString("\n\n---\n\n")
		}
	}
	b.WriteString(nexus.BuildMeetingModeratorSystemPrompt(speaker, p, room, joinedParticipantNames(members, room.ModeratorAgentID)))
	return b.String()
}

func buildMeetingParticipantFullPrompt(speaker db.GroupMember, p *db.AgentPersonality, room *db.GroupChat) string {
	var b strings.Builder
	if speaker.AgentID > 0 {
		if a, err := db.GetAgent(speaker.AgentID); err == nil && !a.Builtin && strings.TrimSpace(a.SystemPrompt) != "" {
			b.WriteString(strings.TrimSpace(a.SystemPrompt))
			b.WriteString("\n\n---\n\n")
		}
	}
	b.WriteString(nexus.BuildMeetingParticipantSystemPrompt(speaker, p, room))
	return b.String()
}

func finishMeeting(roomID int64) {
	db.UpdateGroupChatStatus(roomID, "completed")
	BroadcastWSEvent("group_status_change", fmt.Sprintf(`{"room_id":%d,"status":"completed","reason":"meeting_done"}`, roomID))
	grouploop.StopRoom(roomID)
}

// ─── 辅助 ────────────────────────────────────────────────────────

func findLocalModerator(members []db.GroupMember, modID int64) *db.GroupMember {
	// 精确匹配指定的主持人
	if modID > 0 {
		for i := range members {
			if members[i].IsLocal && members[i].Status == "joined" && members[i].AgentID == modID {
				return &members[i]
			}
		}
	}
	// fallback：任意本地已加入的 Agent 均可担任主持人
	for i := range members {
		if members[i].IsLocal && members[i].Status == "joined" && members[i].AgentID > 0 {
			slog.Info("meeting: moderator fallback", "requested", modID, "using", members[i].AgentID, "name", members[i].AgentName)
			return &members[i]
		}
	}
	return nil
}

func localMeetingParticipants(members []db.GroupMember, modID int64) []db.GroupMember {
	out := make([]db.GroupMember, 0, len(members))
	for _, m := range members {
		if m.IsLocal && m.Status == "joined" && m.AgentID > 0 && m.AgentID != modID {
			out = append(out, m)
		}
	}
	return out
}

func joinedParticipantNames(members []db.GroupMember, modID int64) []string {
	out := make([]string, 0, len(members))
	for _, m := range members {
		if m.Status != "joined" || m.AgentName == "" {
			continue
		}
		if m.AgentID == modID {
			continue
		}
		out = append(out, m.AgentName)
	}
	return out
}

// pickNextLocalSpeaker 从最近一条 Agent 消息（通常是主持人的点名）解析 @名字，匹配本地参会者
func pickNextLocalSpeaker(recent []db.GroupMessage, participants []db.GroupMember) *db.GroupMember {
	for i := len(recent) - 1; i >= 0; i-- {
		if recent[i].MsgType != "message" {
			continue
		}
		plain := ExtractGroupPlainText(recent[i].Content)
		for _, name := range parseMeetingMentionNames(plain) {
			for j := range participants {
				if participants[j].AgentName == name {
					p := participants[j]
					return &p
				}
			}
		}
		break // 只看最近一条 Agent 发言
	}
	return nil
}

func parseMeetingMentionNames(text string) []string {
	matches := meetingMentionRe.FindAllStringSubmatch(text, -1)
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		out = append(out, m[1])
	}
	return out
}

func countMeetingMessages(recent []db.GroupMessage) int {
	n := 0
	for _, m := range recent {
		if m.MsgType == "message" {
			n++
		}
	}
	return n
}

func isCloseMeeting(text string) bool {
	return strings.Contains(text, "[CLOSE]")
}
