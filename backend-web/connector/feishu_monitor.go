package connector

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
)

// handleMonitorMessage 处理监听模式下的非 @机器人 消息
// images 为已下载的飞书图片（base64），透传给 executeAction → IMMessage.Images
func (f *FeishuConnector) handleMonitorMessage(ctx context.Context, event *larkim.P2MessageReceiveV1, text string, images []IMImage, senderID, chatID, msgID string) {
	if f.connectorID == 0 {
		slog.Warn("[feishu-monitor] connectorID not set, skipping")
		return
	}

	rules, err := connDB.ListEnabledMonitorRules(f.connectorID)
	if err != nil {
		slog.Warn("[feishu-monitor] load rules error", "err", err)
		return
	}
	if len(rules) == 0 {
		return
	}

	msgType := ""
	if event.Event.Message.MessageType != nil {
		msgType = *event.Event.Message.MessageType
	}

	senderName := ""
	if event.Event.Sender != nil && event.Event.Sender.SenderId != nil {
		senderName = f.getUserName(ctx, *event.Event.Sender.SenderId.OpenId)
	}
	convTitle := ""
	if chatID != "" {
		convTitle = f.getChatName(ctx, chatID)
	}

	for _, rule := range rules {
		if matchRule(rule, text, senderID, chatID, msgType, f.botOpenID) {
			slog.Info("[feishu-monitor] rule matched",
				"rule_id", rule.ID, "rule_name", rule.Name,
				"chat_id", chatID, "sender", senderID, "action", rule.ActionType, "images", len(images))

			execErr := f.executeAction(ctx, rule, text, images, senderID, chatID, msgID, senderName, convTitle)

			logEntry := &FeishuMonitorLog{
				ConnectorID:  f.connectorID,
				RuleID:       rule.ID,
				RuleName:     rule.Name,
				ChatID:       chatID,
				SenderID:     senderID,
				SenderName:   senderName,
				MessageText:  text,
				ActionType:   rule.ActionType,
				ActionTarget: rule.ActionTarget,
				Result:       "success",
			}
			if execErr != nil {
				logEntry.Result = "error"
				logEntry.ErrorMsg = execErr.Error()
			}
			if insertErr := connDB.InsertMonitorLog(logEntry); insertErr != nil {
				slog.Warn("[feishu-monitor] insert log error", "err", insertErr)
			}
			return
		}
	}

	slog.Debug("[feishu-monitor] no rule matched", "chat_id", chatID, "sender", senderID)
}

// matchRule 检查消息是否命中规则
func matchRule(rule FeishuMonitorRule, text, senderID, chatID, msgType, botOpenID string) bool {
	// 排除机器人自己的消息
	if rule.ExcludeBotMsg && botOpenID != "" && senderID == botOpenID {
		return false
	}

	// 来源过滤：群 ID
	if rule.ChatIDs != "" && rule.ChatIDs != "[]" {
		var chatIDs []string
		if json.Unmarshal([]byte(rule.ChatIDs), &chatIDs) == nil && len(chatIDs) > 0 {
			found := false
			for _, id := range chatIDs {
				if id == chatID {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
	}

	// 来源过滤：发送者 ID
	if rule.SenderIDs != "" && rule.SenderIDs != "[]" {
		var senderIDs []string
		if json.Unmarshal([]byte(rule.SenderIDs), &senderIDs) == nil && len(senderIDs) > 0 {
			found := false
			for _, id := range senderIDs {
				if id == senderID {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
	}

	// 内容过滤：消息类型
	if rule.MsgTypes != "" && rule.MsgTypes != "[]" {
		var msgTypes []string
		if json.Unmarshal([]byte(rule.MsgTypes), &msgTypes) == nil && len(msgTypes) > 0 {
			found := false
			for _, t := range msgTypes {
				if t == msgType {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
	}

	// 内容过滤：关键词
	if rule.Keywords != "" && rule.Keywords != "[]" {
		var keywords []string
		if json.Unmarshal([]byte(rule.Keywords), &keywords) == nil && len(keywords) > 0 {
			textLower := strings.ToLower(text)
			mode := rule.KeywordMode
			if mode == "" {
				mode = "any"
			}
			if mode == "any" {
				anyMatch := false
				for _, kw := range keywords {
					if strings.Contains(textLower, strings.ToLower(kw)) {
						anyMatch = true
						break
					}
				}
				if !anyMatch {
					return false
				}
			} else {
				for _, kw := range keywords {
					if !strings.Contains(textLower, strings.ToLower(kw)) {
						return false
					}
				}
			}
		}
	}

	return true
}

// executeAction 根据规则的动作类型执行相应操作
// images 为已下载的飞书图片（base64），透传给 IMMessage.Images → Claude 多模态输入
func (f *FeishuConnector) executeAction(ctx context.Context, rule FeishuMonitorRule, text string, images []IMImage, senderID, chatID, msgID, senderName, convTitle string) error {
	messageText := text
	if rule.CustomPrompt != "" {
		messageText = "[监控指令] " + rule.CustomPrompt + "\n\n[原始消息] " + text
	}

	// agent_teams：多 Agent 协作模式（话题式任务协调）
	if rule.ActionType == "agent_teams" {
		slog.Info("[feishu-monitor] agent_teams mode triggered",
			"rule_id", rule.ID, "rule_name", rule.Name, "chat_id", chatID,
			"target_chat_id", rule.TargetChatID, "dispatch_targets", rule.DispatchTargets,
			"app_id", f.cfg.AppID, "app_secret_len", len(f.cfg.AppSecret))
		if df, err := os.OpenFile("/tmp/lingxi-task-debug.log", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644); err == nil {
			fmt.Fprintf(df, "[%s] WS-monitor agent_teams: rule=%d target=%s appID=%s\n",
				time.Now().Format("15:04:05"), rule.ID, rule.TargetChatID, f.cfg.AppID)
			df.Close()
		}
		tc := NewTaskCoordinator(f, &rule, f.cfg.AppID, f.cfg.AppSecret)
		go tc.StartTask(text, images, senderID, senderName, chatID, msgID)
		return nil
	}

	// desktop_notify：仅弹桌面通知，不走 AI 处理
	if rule.ActionType == "desktop_notify" {
		title := convTitle
		if title == "" {
			title = senderName
		}
		if title == "" {
			title = "飞书监听"
		}
		body := text
		if len([]rune(body)) > 200 {
			body = string([]rune(body)[:200]) + "..."
		}
		notif, _ := json.Marshal(map[string]string{
			"title": fmt.Sprintf("🔔 %s", title),
			"body":  body,
		})
		if broadcastWSEvent != nil {
			broadcastWSEvent("desktop_notify", string(notif))
		}
		return nil
	}

	// sentReplyMsgID 记录非流式回复时飞书返回的消息 ID（用于回复链映射）
	var sentReplyMsgID string
	var replyFunc func(string) error

	switch rule.ActionType {
	case "reply_original":
		replyFunc = func(reply string) error {
			rid, err := f.sendReplyReturnID(ctx, msgID, chatID, reply)
			if err == nil && rid != "" {
				sentReplyMsgID = rid
			}
			return err
		}
	case "silent":
		replyFunc = func(reply string) error {
			return nil
		}
	case "send_to_chat":
		targetChatID := rule.ActionTarget
		replyFunc = func(reply string) error {
			return f.sendToChat(ctx, targetChatID, reply)
		}
	case "send_to_user":
		targetUserID := rule.ActionTarget
		replyFunc = func(reply string) error {
			return f.sendToUser(ctx, targetUserID, reply)
		}
	default:
		replyFunc = func(reply string) error {
			rid, err := f.sendReplyReturnID(ctx, msgID, chatID, reply)
			if err == nil && rid != "" {
				sentReplyMsgID = rid
			}
			return err
		}
	}

	msg := IMMessage{
		Platform:       "feishu",
		UserID:         senderID,
		UserName:       senderName,
		ConversationID: chatID,
		ConvTitle:      convTitle,
		ConvType:       "group",
		Text:           messageText,
		AgentID:        f.agentID,
		BaseCfg:        f.cfg.BaseConfig,
		ReplyFunc:      replyFunc,
		Images:         images,
		SkipCancel:     true, // 串行化由 monitorProcessLoop 保证，不需要 Dispatch 层打断
	}

	// 群成员信息注入
	var chatMembers map[string]string
	if chatID != "" {
		chatMembers = f.getChatMembers(ctx, chatID)
		if len(chatMembers) > 0 {
			msg.MembersInfo = getMembersListForPrompt(chatMembers)
		}
	}

	// 流式卡片支持：非 silent 模式 + 开启了流式卡片 → 走流式路径
	if rule.ActionType != "silent" && f.cfg.StreamingEnabled {
		// 根据 action_type 决定流式卡片的发送目标
		streamChatID := chatID
		streamReplyMsgID := msgID
		switch rule.ActionType {
		case "send_to_chat":
			streamChatID = rule.ActionTarget
			streamReplyMsgID = "" // 发到别的群，不引用原消息
		case "send_to_user":
			streamChatID = "" // 发给用户用私聊，不走群卡片
		}

		// send_to_user 走非流式回退（飞书流式卡片目前只支持群聊）
		if rule.ActionType != "send_to_user" && streamChatID != "" {
			sender := newFeishuStreamSender(f.cfg.AppID, f.cfg.AppSecret, streamChatID, streamReplyMsgID, f.cfg)
			sender.chatMembers = chatMembers
			sender.SendAck()
			msg.StreamCallback = sender.OnStreamCallback

			var resolvedSessionID int64
			var resolvedMsgID int64

			sender.SetDoneCallback(func() []map[string]interface{} {
				var elems []map[string]interface{}
				fullReply := sender.GetFullTextReply()
				cardID := sender.GetCardID()
				if cardID == "" {
					return elems
				}

				cbCtx := &CardCallbackCtx{
					SessionID: resolvedSessionID,
					MessageID: resolvedMsgID,
					CardID:    cardID,
					ChatID:    streamChatID,
					MsgID:     streamReplyMsgID,
					AppID:     f.cfg.AppID,
					AppSecret: f.cfg.AppSecret,
					AgentID:   f.agentID,
					Connector: f,
				}

				if title, choices := ParseChoiceBlocks(fullReply); len(choices) > 0 {
					choiceMap := make(map[string]string)
					for _, c := range choices {
						choiceMap[c.Key] = c.Label
					}
					cbCtx.Choices = choiceMap
					elems = append(elems, buildChoiceElements(cardID, title, choices)...)
				}
				if title, fields := ParseInputBlocks(fullReply); len(fields) > 0 {
					elems = append(elems, buildInputElements(cardID, title, fields)...)
				}
				if title, items := ParseCheckerBlocks(fullReply); len(items) > 0 {
					elems = append(elems, buildCheckerElements(cardID, title, items)...)
				}
				elems = append(elems, buildFeedbackElements(cardID)...)
				RegisterCardCallback(cardID, cbCtx)
				return elems
			})

			msg.PostDoneFunc = func(sessionID int64, _ string) {
				resolvedSessionID = sessionID
				var lastMsgID int64
				if sessionID > 0 {
					connDB.RawDB().QueryRow(`SELECT id FROM messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1`, sessionID).Scan(&lastMsgID)
				}
				resolvedMsgID = lastMsgID
				cardID := sender.GetCardID()
				if cardID != "" {
					if ctx := lookupCardCallback(cardID); ctx != nil {
						ctx.SessionID = sessionID
						ctx.MessageID = lastMsgID
					}
				}
				// 回复链映射：记录流式卡片消息 ID → session ID
				if replyID := sender.GetReplyMsgID(); replyID != "" && sessionID > 0 {
					connDB.SaveReplySessionMapping(replyID, sessionID)
				}
			}
		}
	}

	// 非流式路径：记录回复链映射
	if msg.PostDoneFunc == nil {
		msg.PostDoneFunc = func(sessionID int64, _ string) {
			if sentReplyMsgID != "" && sessionID > 0 {
				connDB.SaveReplySessionMapping(sentReplyMsgID, sessionID)
			}
		}
	}

	// 阻塞等待 Agent 完成，保证 monitorProcessLoop 串行
	doneCh := make(chan struct{}, 1)
	origPostDone := msg.PostDoneFunc
	msg.PostDoneFunc = func(sessionID int64, reply string) {
		if origPostDone != nil {
			origPostDone(sessionID, reply)
		}
		select {
		case doneCh <- struct{}{}:
		default:
		}
	}

	Dispatch(msg)

	select {
	case <-doneCh:
	case <-time.After(5 * time.Minute):
		slog.Warn("[feishu-monitor] agent timeout (5min)", "chat_id", chatID, "msg_id", msgID)
	}
	return nil
}

// P2PDispatchParams 是 DispatchP2PMessage 的参数
type P2PDispatchParams struct {
	ConnectorID  int64
	ActionType   string // send_to_chat / send_to_user / desktop_notify
	ActionTarget string
	CustomPrompt string
	ReplyPrefix  string // 用户配置的回复前缀模板（支持 {source} {count} 变量）
	MessageText  string // 原始消息文本
	MsgCount     int    // 本轮消息数量
	SenderID     string
	ChatID       string
	ChatName     string
	OnDone       func() // Agent 处理完成后回调（可选，用于串行控制）
}

// DispatchP2PMessage 供 P2P watcher 调用，完整走 Agent + 流式卡片流程
func DispatchP2PMessage(params P2PDispatchParams) error {
	c, err := connDB.GetIMConnectorByID(params.ConnectorID)
	if err != nil || c == nil {
		return fmt.Errorf("connector %d not found: %v", params.ConnectorID, err)
	}

	var feishuCfg FeishuConfig
	if err := json.Unmarshal([]byte(c.Config), &feishuCfg); err != nil {
		return fmt.Errorf("parse feishu config: %w", err)
	}

	// 构建带来源说明的消息文本
	sourceLabel := params.ChatName
	if sourceLabel == "" {
		sourceLabel = "P2P 监听"
	}

	// 构造回复前缀指令（支持 {source} {count} 变量替换）
	prefixInstruction := ""
	if params.ReplyPrefix != "" {
		prefix := params.ReplyPrefix
		prefix = strings.ReplaceAll(prefix, "{source}", sourceLabel)
		prefix = strings.ReplaceAll(prefix, "{count}", fmt.Sprintf("%d", params.MsgCount))
		prefixInstruction = fmt.Sprintf("\n[回复格式] 请在回复最开头输出以下内容作为标题，然后换行继续正文分析：\n%s\n", prefix)
	} else {
		prefixInstruction = fmt.Sprintf("\n[回复格式] 请在回复开头简要说明你正在处理来自「%s」的 %d 条消息，然后继续分析。\n", sourceLabel, params.MsgCount)
	}

	messageText := params.MessageText
	if params.CustomPrompt != "" {
		messageText = fmt.Sprintf("[消息来源] %s\n[监控指令] %s%s\n[原始消息]\n%s",
			sourceLabel, params.CustomPrompt, prefixInstruction, params.MessageText)
	} else {
		messageText = fmt.Sprintf("[消息来源] %s%s\n[原始消息]\n%s",
			sourceLabel, prefixInstruction, params.MessageText)
	}

	agentID := c.AgentID
	baseCfg := feishuCfg.BaseConfig
	baseCfg.AgentID = agentID

	// 构建 replyFunc
	var replyFunc func(string) error
	switch params.ActionType {
	case "send_to_chat":
		replyFunc = func(reply string) error {
			return SendViaFeishu(params.ConnectorID, "chat", params.ActionTarget, reply)
		}
	case "send_to_user":
		replyFunc = func(reply string) error {
			return SendViaFeishu(params.ConnectorID, "user", params.ActionTarget, reply)
		}
	default:
		replyFunc = func(reply string) error {
			return SendViaFeishu(params.ConnectorID, "user", params.ActionTarget, reply)
		}
	}

	msg := IMMessage{
		Platform:       "feishu",
		UserID:         params.SenderID,
		UserName:       params.ChatName,
		ConversationID: params.ChatID,
		ConvTitle:      params.ChatName,
		ConvType:       "private",
		Text:           messageText,
		AgentID:        agentID,
		BaseCfg:        baseCfg,
		ReplyFunc:      replyFunc,
		SkipCancel:     true,
	}

	// 流式卡片支持：开启了流式卡片 + 有明确目标 → 走流式路径
	// send_to_chat: chatID = 目标群 ID (oc_xxx)
	// send_to_user: chatID = 用户 open_id (ou_xxx)，飞书卡片消息也支持私聊
	if feishuCfg.StreamingEnabled && params.ActionTarget != "" {
		streamTarget := params.ActionTarget
		sender := newFeishuStreamSender(feishuCfg.AppID, feishuCfg.AppSecret, streamTarget, "", feishuCfg)

		// 使用用户配置的前缀模板作为初始确认消息
		ackText := "💭 正在思考..."
		if params.ReplyPrefix != "" {
			ack := params.ReplyPrefix
			ack = strings.ReplaceAll(ack, "{source}", sourceLabel)
			ack = strings.ReplaceAll(ack, "{count}", fmt.Sprintf("%d", params.MsgCount))
			ackText = ack
		}
		sender.SendAckWithText(ackText)
		msg.StreamCallback = sender.OnStreamCallback

		var resolvedSessionID int64
		var resolvedMsgID int64

		sender.SetDoneCallback(func() []map[string]interface{} {
			var elems []map[string]interface{}
			fullReply := sender.GetFullTextReply()
			cardID := sender.GetCardID()
			if cardID == "" {
				return elems
			}

			cbCtx := &CardCallbackCtx{
				SessionID: resolvedSessionID,
				MessageID: resolvedMsgID,
				CardID:    cardID,
				ChatID:    streamTarget,
				AppID:     feishuCfg.AppID,
				AppSecret: feishuCfg.AppSecret,
				AgentID:   agentID,
			}

			slog.Info("[p2p-done-callback] parsing interactive blocks",
				"cardID", cardID, "replyLen", len(fullReply))

			if title, choices := ParseChoiceBlocks(fullReply); len(choices) > 0 {
				slog.Info("[p2p-done-callback] found choice block", "title", title, "count", len(choices))
				choiceMap := make(map[string]string)
				for _, ch := range choices {
					choiceMap[ch.Key] = ch.Label
				}
				cbCtx.Choices = choiceMap
				elems = append(elems, buildChoiceElements(cardID, title, choices)...)
			}
			if title, fields := ParseInputBlocks(fullReply); len(fields) > 0 {
				slog.Info("[p2p-done-callback] found input block", "title", title, "fields", len(fields))
				elems = append(elems, buildInputElements(cardID, title, fields)...)
			}
			if title, items := ParseCheckerBlocks(fullReply); len(items) > 0 {
				slog.Info("[p2p-done-callback] found checker block", "title", title, "items", len(items))
				elems = append(elems, buildCheckerElements(cardID, title, items)...)
			}
			elems = append(elems, buildFeedbackElements(cardID)...)
			RegisterCardCallback(cardID, cbCtx)
			slog.Info("[p2p-done-callback] total interactive elements", "count", len(elems))
			return elems
		})

		msg.PostDoneFunc = func(sessionID int64, _ string) {
			resolvedSessionID = sessionID
			var lastMsgID int64
			if sessionID > 0 {
				connDB.RawDB().QueryRow(`SELECT id FROM messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1`, sessionID).Scan(&lastMsgID)
			}
			resolvedMsgID = lastMsgID
			cardID := sender.GetCardID()
			if cardID != "" {
				if ctx := lookupCardCallback(cardID); ctx != nil {
					ctx.SessionID = sessionID
					ctx.MessageID = lastMsgID
				}
			}
		}
	}

	// 如果调用方提供了 OnDone 回调（串行控制），在 Agent 处理完成后调用
	if params.OnDone != nil {
		origPostDone := msg.PostDoneFunc
		msg.PostDoneFunc = func(sessionID int64, reply string) {
			if origPostDone != nil {
				origPostDone(sessionID, reply)
			}
			params.OnDone()
		}
	}

	slog.Info("[p2p-dispatch] dispatching to agent",
		"connector_id", params.ConnectorID, "agent_id", agentID,
		"action", params.ActionType, "streaming", feishuCfg.StreamingEnabled)

	Dispatch(msg)
	return nil
}
