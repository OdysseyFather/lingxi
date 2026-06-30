package connector

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"lingxi-agent/db"

	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
)

// handleMonitorMessage 处理监听模式下的非 @机器人 消息
// images 为已下载的飞书图片（base64），透传给 executeAction → IMMessage.Images
func (f *FeishuConnector) handleMonitorMessage(ctx context.Context, event *larkim.P2MessageReceiveV1, text string, images []IMImage, senderID, chatID, msgID string) {
	if f.connectorID == 0 {
		slog.Warn("[feishu-monitor] connectorID not set, skipping")
		return
	}

	rules, err := db.ListEnabledMonitorRules(f.connectorID)
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

			logEntry := &db.FeishuMonitorLog{
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
			if insertErr := db.InsertMonitorLog(logEntry); insertErr != nil {
				slog.Warn("[feishu-monitor] insert log error", "err", insertErr)
			}
			return
		}
	}

	slog.Debug("[feishu-monitor] no rule matched", "chat_id", chatID, "sender", senderID)
}

// matchRule 检查消息是否命中规则
func matchRule(rule db.FeishuMonitorRule, text, senderID, chatID, msgType, botOpenID string) bool {
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
func (f *FeishuConnector) executeAction(ctx context.Context, rule db.FeishuMonitorRule, text string, images []IMImage, senderID, chatID, msgID, senderName, convTitle string) error {
	messageText := text
	if rule.CustomPrompt != "" {
		messageText = "[监控指令] " + rule.CustomPrompt + "\n\n[原始消息] " + text
	}

	var replyFunc func(string) error

	switch rule.ActionType {
	case "reply_original":
		replyFunc = func(reply string) error {
			return f.sendReply(ctx, msgID, chatID, reply)
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
			return f.sendReply(ctx, msgID, chatID, reply)
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
					db.DB.QueryRow(`SELECT id FROM messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1`, sessionID).Scan(&lastMsgID)
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
	}

	Dispatch(msg)
	return nil
}
