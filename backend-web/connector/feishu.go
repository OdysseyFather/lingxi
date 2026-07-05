package connector

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkcore "github.com/larksuite/oapi-sdk-go/v3/core"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher/callback"
	larkcontact "github.com/larksuite/oapi-sdk-go/v3/service/contact/v3"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"
)

// FeishuConfig 是飞书连接器的配置
type FeishuConfig struct {
	BaseConfig
	AppID     string `json:"app_id"`
	AppSecret string `json:"app_secret"`

	// 流式卡片配置
	StreamingEnabled   bool   `json:"streaming_enabled"`    // 是否启用流式卡片
	StreamingCardTitle string `json:"streaming_card_title"` // 卡片标题，默认"灵犀"
	StreamingFlushMs   int    `json:"streaming_flush_ms"`   // 推送间隔毫秒，默认 80

	// 监听模式
	MonitorEnabled bool `json:"monitor_enabled"` // 是否启用群消息监听模式
}

// chatMembersEntry 群成员缓存条目
type chatMembersEntry struct {
	members map[string]string // 名字 -> open_id
	expire  time.Time
}

// monitorMsg 监听模式下的待处理消息
type monitorMsg struct {
	ctx      context.Context
	event    *larkim.P2MessageReceiveV1
	text     string
	images   []IMImage
	senderID string
	chatID   string
	msgID    string
}

// FeishuConnector 实现飞书 WebSocket 长连接机器人
type FeishuConnector struct {
	cfg          FeishuConfig
	client       *lark.Client
	cancel       context.CancelFunc
	agentID      int64
	connectorID  int64 // im_connectors.id，监听模式用于查找规则

	// 机器人自身的 open_id，用于群聊中判断消息是否 @了机器人
	botOpenID string

	// 群名/用户名缓存，避免每条消息都调 API
	chatNameCache sync.Map // chatID -> string
	userNameCache sync.Map // openID -> string

	// 群成员缓存：chatID -> chatMembersEntry，10 分钟刷新
	chatMembersCache sync.Map

	// 消息去重：防止飞书 SDK 网络重连后重复推送同一条消息
	processedMsgsMu sync.Mutex
	processedMsgs   map[string]time.Time // msgID -> 处理时间

	// 监听模式按 chatID 串行化队列：同一群的监听消息排队处理，
	// 避免上一条消息的 Agent 还没处理完就被新消息打断
	monitorQueueMu sync.Mutex
	monitorQueues  map[string]chan monitorMsg // chatID -> message channel
}

func (f *FeishuConnector) SetAgentID(id int64)      { f.agentID = id }
func (f *FeishuConnector) SetConnectorID(id int64)  { f.connectorID = id }

func NewFeishuConnector(configJSON string) (*FeishuConnector, error) {
	cfg := FeishuConfig{BaseConfig: DefaultBaseConfig()}
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, err
	}
	client := lark.NewClient(cfg.AppID, cfg.AppSecret)
	fc := &FeishuConnector{
		cfg:           cfg,
		client:        client,
		processedMsgs: make(map[string]time.Time),
		monitorQueues: make(map[string]chan monitorMsg),
	}
	// 定时清理过期的消息 ID（保留 10 分钟内的）
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			fc.cleanProcessedMsgs()
		}
	}()
	return fc, nil
}

// isDuplicate 检查消息是否已处理过，并标记为已处理
func (f *FeishuConnector) isDuplicate(msgID string) bool {
	if msgID == "" {
		return false
	}
	f.processedMsgsMu.Lock()
	defer f.processedMsgsMu.Unlock()
	if _, exists := f.processedMsgs[msgID]; exists {
		return true
	}
	f.processedMsgs[msgID] = time.Now()
	return false
}

func (f *FeishuConnector) cleanProcessedMsgs() {
	f.processedMsgsMu.Lock()
	defer f.processedMsgsMu.Unlock()
	cutoff := time.Now().Add(-10 * time.Minute)
	for id, t := range f.processedMsgs {
		if t.Before(cutoff) {
			delete(f.processedMsgs, id)
		}
	}
}

// enqueueMonitorMessage 将监听消息放入对应 chatID 的串行化队列。
// 如果该 chatID 还没有消费 goroutine，自动启动一个。
func (f *FeishuConnector) enqueueMonitorMessage(msg monitorMsg) {
	f.monitorQueueMu.Lock()
	ch, exists := f.monitorQueues[msg.chatID]
	if !exists {
		ch = make(chan monitorMsg, 50)
		f.monitorQueues[msg.chatID] = ch
		go f.monitorProcessLoop(msg.chatID, ch)
	}
	f.monitorQueueMu.Unlock()

	select {
	case ch <- msg:
	default:
		slog.Warn("[feishu-monitor] queue full, dropping message",
			"chat_id", msg.chatID, "msg_id", msg.msgID)
	}
}

// monitorProcessLoop 串行消费某个 chatID 的监听消息队列。
// 严格保证同一群同一时间只有一个 Agent 任务在执行，
// 前一条消息处理完毕后才处理下一条。
func (f *FeishuConnector) monitorProcessLoop(chatID string, ch <-chan monitorMsg) {
	slog.Info("[feishu-monitor] process loop started", "chat_id", chatID)
	for msg := range ch {
		slog.Info("[feishu-monitor] processing message (serial)",
			"chat_id", msg.chatID, "msg_id", msg.msgID)
		f.handleMonitorMessage(msg.ctx, msg.event, msg.text, msg.images, msg.senderID, msg.chatID, msg.msgID)
	}
	slog.Info("[feishu-monitor] process loop ended", "chat_id", chatID)
}

func (f *FeishuConnector) Platform() string { return "feishu" }

func (f *FeishuConnector) Start(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	f.cancel = cancel

	// 获取机器人自身的 open_id，用于群聊 @机器人 检测
	f.fetchBotOpenID(ctx)

	eventHandler := dispatcher.NewEventDispatcher("", "").
		OnP2MessageReceiveV1(func(ctx context.Context, event *larkim.P2MessageReceiveV1) error {
			return f.onMessage(ctx, event)
		}).
		OnP2CardActionTrigger(func(ctx context.Context, event *callback.CardActionTriggerEvent) (*callback.CardActionTriggerResponse, error) {
			return HandleCardAction(ctx, event)
		})

	wsClient := larkws.NewClient(f.cfg.AppID, f.cfg.AppSecret,
		larkws.WithEventHandler(eventHandler),
		larkws.WithLogLevel(larkcore.LogLevelInfo),
	)

	slog.Info("[feishu] starting ws client",
		"app_id", f.cfg.AppID,
		"monitor_enabled", f.cfg.MonitorEnabled,
		"connector_id", f.connectorID,
	)

	// 崩溃恢复：恢复活跃的 Agent Teams 任务
	go f.recoverActiveTasks()

	go func() {
		<-ctx.Done()
		// 飞书 SDK 没有显式 Close，依赖 ctx 取消
	}()
	return wsClient.Start(ctx)
}

func (f *FeishuConnector) Stop() {
	if f.cancel != nil {
		f.cancel()
	}
}

// recoverActiveTasks 启动时恢复活跃的 Agent Teams 任务
func (f *FeishuConnector) recoverActiveTasks() {
	instances, err := connDB.ListActiveTaskInstances()
	if err != nil {
		slog.Warn("[feishu] recover active tasks failed", "err", err)
		return
	}
	if len(instances) == 0 {
		return
	}

	slog.Info("[feishu] recovering active tasks", "count", len(instances))
	for _, inst := range instances {
		rule, err := connDB.GetMonitorRule(inst.RuleID)
		if err != nil {
			slog.Warn("[feishu] recover task: rule not found", "rule_id", inst.RuleID, "err", err)
			continue
		}

		tc := NewTaskCoordinator(f, rule, f.cfg.AppID, f.cfg.AppSecret)
		instCopy := inst
		tc.instance = &instCopy

		// 注册到全局路由表
		if inst.RootMessageID != "" {
			activeCoordinators.Store(inst.RootMessageID, tc)
		}

		// 重启全局超时
		timeoutMin := inst.ReplyTimeoutMinutes
		if timeoutMin <= 0 {
			timeoutMin = 10
		}
		tc.globalTimeout = time.AfterFunc(time.Duration(timeoutMin)*time.Minute, func() {
			tc.onGlobalTimeout()
		})

		slog.Info("[feishu] recovered task coordinator",
			"id", inst.ID, "root_msg", inst.RootMessageID, "status", inst.Status)
	}
}

func (f *FeishuConnector) onMessage(ctx context.Context, event *larkim.P2MessageReceiveV1) error {
	if event.Event == nil || event.Event.Message == nil {
		return nil
	}
	msgData := event.Event.Message
	senderID := ""
	if event.Event.Sender != nil && event.Event.Sender.SenderId != nil {
		senderID = *event.Event.Sender.SenderId.OpenId
	}
	chatID := ""
	if msgData.ChatId != nil {
		chatID = *msgData.ChatId
	}
	msgID := ""
	if msgData.MessageId != nil {
		msgID = *msgData.MessageId
	}
	parentMsgID := ""
	if msgData.ParentId != nil {
		parentMsgID = *msgData.ParentId
	}

	// 消息去重：飞书 SDK 可能在网络重连时重复推送同一条消息
	if f.isDuplicate(msgID) {
		slog.Info("[feishu] duplicate message, skipping", "msg_id", msgID)
		return nil
	}

	// Agent Teams 话题路由：如果消息有 root_id，检查是否有活跃的 TaskCoordinator
	rootID := ""
	if msgData.RootId != nil {
		rootID = *msgData.RootId
	}
	if rootID != "" {
		if tc := LookupCoordinator(rootID); tc != nil {
			text := extractFeishuText(msgData)
			senderName := ""
			if event.Event.Sender != nil && event.Event.Sender.SenderId != nil {
				senderName = f.getUserName(ctx, *event.Event.Sender.SenderId.OpenId)
			}
			mentionBot := f.isFeishuMentionBot(msgData)
			slog.Info("[feishu] routing thread reply to task coordinator",
				"root_id", rootID, "sender_id", senderID, "msg_id", msgID,
				"mention_bot", mentionBot)
			tc.OnThreadReply(senderID, senderName, text, msgID, mentionBot)
			return nil
		}
	}

	// 解析文本内容
	text := extractFeishuText(msgData)

	// 获取消息类型
	msgType := ""
	if msgData.MessageType != nil {
		msgType = *msgData.MessageType
	}

	// 检测 @所有人：飞书 mentions 中 key 为 "@_all" 表示 @所有人
	isMentionAll := isFeishuMentionAll(msgData)

	// 群聊过滤：只回复 @了机器人 的消息，忽略群内普通消息和只 @了其他人的消息
	chatType := ""
	if msgData.ChatType != nil {
		chatType = *msgData.ChatType
	}
	isMentionBot := f.isFeishuMentionBot(msgData)

	slog.Info("[feishu] received message",
		"sender", senderID,
		"chat_id", chatID,
		"msg_id", msgID,
		"msg_type", msgType,
		"text_len", len(text),
		"chat_type", chatType,
		"is_mention_all", isMentionAll,
		"is_mention_bot", isMentionBot,
		"monitor_enabled", f.cfg.MonitorEnabled,
	)

	// 回复链续接：如果群聊消息未 @bot 但回复了 bot 的消息，视为续接对话（走 @bot 路径）
	isReplyToBot := false
	if chatType == "group" && !isMentionBot && parentMsgID != "" {
		if sid := connDB.LookupSessionByReplyMsgID(parentMsgID); sid > 0 {
			isReplyToBot = true
			slog.Info("[feishu] reply-to-bot detected in group (no @), treating as @bot",
				"parent_msg_id", parentMsgID, "session_id", sid)
		}
	}

	// 群聊中：只有明确 @机器人 或回复 bot 消息才回复
	// @所有人 的消息交由 Dispatch 中的 ReplyToMentionAll 配置决定（默认不回复）
	// @其他人 或无 @ 的普通消息一律跳过
	if chatType == "group" && !isMentionBot && !isReplyToBot {
		// 监听模式：即使未 @机器人，也尝试规则匹配处理（允许空 text，如图片消息）
		if f.cfg.MonitorEnabled {
			slog.Info("[feishu] monitor mode: processing group message",
				"msg_id", msgID, "chat_id", chatID, "sender", senderID, "msg_type", msgType)
			// 监听模式下提前提取并下载图片，透传给 executeAction
			imageKeys := extractFeishuImageKeys(msgData)
			images := f.fetchFeishuImages(ctx, msgID, imageKeys)
			f.enqueueMonitorMessage(monitorMsg{
				ctx:      ctx,
				event:    event,
				text:     text,
				images:   images,
				senderID: senderID,
				chatID:   chatID,
				msgID:    msgID,
			})
			return nil
		}

		if !isMentionAll {
			slog.Info("[feishu] skipping group message (not mentioning bot)",
				"msg_id", msgID, "chat_id", chatID, "sender", senderID)
			return nil
		}
		if !f.cfg.ReplyToMentionAll {
			slog.Info("[feishu] skipping @all message (reply_to_mention_all=false, bot not mentioned)",
				"msg_id", msgID, "chat_id", chatID, "sender", senderID)
			return nil
		}
	}

	// 提取并下载图片（image / post 类型均可能携带 image_key）
	// 用户发送的图片必须用 message_id + file_key 走「获取消息中的资源文件」接口下载
	imageKeys := extractFeishuImageKeys(msgData)
	images := f.fetchFeishuImages(ctx, msgID, imageKeys)

	// text 为空且无图片则跳过（记录日志方便排查）
	if text == "" && len(images) == 0 {
		slog.Warn("[feishu] skipping message: empty text and no images",
			"msg_id", msgID, "chat_id", chatID, "msg_type", msgType,
			"raw_content", truncateStr(func() string {
				if msgData.Content != nil { return *msgData.Content }; return "<nil>"
			}(), 500))
		return nil
	}

	// sentReplyMsgID 记录非流式回复时飞书返回的消息 ID（用于回复链映射）
	var sentReplyMsgID string
	replyFunc := func(reply string) error {
		rid, err := f.sendReplyReturnID(ctx, msgID, chatID, reply)
		if err == nil && rid != "" {
			sentReplyMsgID = rid
		}
		return err
	}

	// 获取会话类型和群名
	convType := ""
	convTitle := ""
	if msgData.ChatType != nil {
		if *msgData.ChatType == "group" {
			convType = "group"
		} else if *msgData.ChatType == "p2p" {
			convType = "private"
		}
	}
	// 从飞书 API 获取群名称
	if convType == "group" && chatID != "" {
		convTitle = f.getChatName(ctx, chatID)
	}
	// 从 mentions 中尝试提取发送者名称（飞书事件中 sender 没有直接的昵称字段）
	senderName := ""
	if event.Event.Sender != nil && event.Event.Sender.SenderId != nil {
		senderName = f.getUserName(ctx, *event.Event.Sender.SenderId.OpenId)
	}

	// 回复链续接：如果用户回复了机器人的某条消息，查找对应的 session
	var resumeSessionID int64
	if parentMsgID != "" {
		if sid := connDB.LookupSessionByReplyMsgID(parentMsgID); sid > 0 {
			resumeSessionID = sid
			slog.Info("[feishu] reply-chain context found", "parent_msg_id", parentMsgID, "session_id", sid)
		}
	}

	msg := IMMessage{
		Platform:        "feishu",
		UserID:          senderID,
		UserName:        senderName,
		ConversationID:  chatID,
		ConvTitle:       convTitle,
		ConvType:        convType,
		Text:            text,
		AgentID:         f.agentID,
		IsMentionAll:    isMentionAll,
		BaseCfg:         f.cfg.BaseConfig,
		ReplyFunc:       replyFunc,
		Images:          images,
		ResumeSessionID: resumeSessionID,
	}

	// 群聊时获取群成员列表，用于 @mention 和提示词注入
	var chatMembers map[string]string
	if convType == "group" && chatID != "" {
		chatMembers = f.getChatMembers(ctx, chatID)
		if len(chatMembers) > 0 {
			msg.MembersInfo = getMembersListForPrompt(chatMembers)
		}
	}

	// 启用流式卡片时，注入 StreamCallback 并立即发送思考提示
	if f.cfg.StreamingEnabled {
		sender := newFeishuStreamSender(f.cfg.AppID, f.cfg.AppSecret, chatID, msgID, f.cfg)
		sender.chatMembers = chatMembers
		sender.SendAck()
		msg.StreamCallback = sender.OnStreamCallback

		// doneCallback 在流式完成时由 replaceCardFinal 调用，统一构建交互元素
		// 此时 sessionID 尚未知，需要在 PostDoneFunc 中设置
		var resolvedSessionID int64
		var resolvedMsgID int64

		sender.SetDoneCallback(func() []map[string]interface{} {
			var elems []map[string]interface{}
			cardID := sender.GetCardID()
			if cardID == "" {
				return elems
			}

			cbCtx := &CardCallbackCtx{
				SessionID: resolvedSessionID,
				MessageID: resolvedMsgID,
				CardID:    cardID,
				ChatID:    chatID,
				MsgID:     msgID,
				AppID:     f.cfg.AppID,
				AppSecret: f.cfg.AppSecret,
				AgentID:   f.agentID,
				Connector: f,
			}

			// 追加 👍👎 反馈按钮（不再追加 choice/input/checker 交互元素）
			elems = append(elems, buildFeedbackElements(cardID)...)
			RegisterCardCallback(cardID, cbCtx)
			return elems
		})

		// PostDoneFunc 在流式完成后解析 sessionID 和 messageID
		// 注意：doneCallback 在 done 阶段已被调用（此时 resolvedSessionID 为 0），
		// 所以需要在 PostDoneFunc 中更新回调注册表中的 session/message 信息
		msg.PostDoneFunc = func(sessionID int64, _ string) {
			resolvedSessionID = sessionID
			var lastMsgID int64
			if sessionID > 0 {
				connDB.RawDB().QueryRow(`SELECT id FROM messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1`, sessionID).Scan(&lastMsgID)
			}
			resolvedMsgID = lastMsgID

			// 更新已注册的回调上下文中的 session/message 信息
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
				slog.Info("[feishu] reply-chain mapping saved (stream)", "reply_msg_id", replyID, "session_id", sessionID)
			}
		}
	}

	// 非流式路径：也需要记录回复链映射
	if msg.PostDoneFunc == nil {
		msg.PostDoneFunc = func(sessionID int64, _ string) {
			if sentReplyMsgID != "" && sessionID > 0 {
				connDB.SaveReplySessionMapping(sentReplyMsgID, sessionID)
				slog.Info("[feishu] reply-chain mapping saved (sync)", "reply_msg_id", sentReplyMsgID, "session_id", sessionID)
			}
		}
	}

	Dispatch(msg)
	return nil
}

// isFeishuMentionAll 检测飞书消息是否为 @所有人 触发
// 飞书 @所有人时 mentions 数组中会有 key="@_all" 的元素
func isFeishuMentionAll(msg *larkim.EventMessage) bool {
	if msg.Mentions == nil {
		return false
	}
	for _, m := range msg.Mentions {
		if m.Key != nil && *m.Key == "@_all" {
			return true
		}
	}
	return false
}

// fetchBotOpenID 通过飞书 REST API 获取机器人自身的 open_id
// 首次启动时调用，如果失败会在收到消息时重试
func (f *FeishuConnector) fetchBotOpenID(ctx context.Context) {
	if f.botOpenID != "" {
		return
	}

	// 先获取 tenant_access_token
	tokenReqBody, _ := json.Marshal(map[string]string{
		"app_id":     f.cfg.AppID,
		"app_secret": f.cfg.AppSecret,
	})
	tokenResp, err := http.Post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
		"application/json", strings.NewReader(string(tokenReqBody)))
	if err != nil {
		slog.Warn("[feishu] failed to get tenant_access_token", "err", err)
		return
	}
	defer tokenResp.Body.Close()
	var tokenData struct {
		Code              int    `json:"code"`
		TenantAccessToken string `json:"tenant_access_token"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil || tokenData.Code != 0 {
		slog.Warn("[feishu] failed to parse tenant_access_token", "err", err, "code", tokenData.Code)
		return
	}

	// 调用 /bot/v3/info 获取机器人信息
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://open.feishu.cn/open-apis/bot/v3/info", nil)
	req.Header.Set("Authorization", "Bearer "+tokenData.TenantAccessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("[feishu] failed to get bot info", "err", err)
		return
	}
	defer resp.Body.Close()
	var botInfo struct {
		Code int `json:"code"`
		Bot  struct {
			OpenID string `json:"open_id"`
		} `json:"bot"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&botInfo); err != nil || botInfo.Code != 0 {
		slog.Warn("[feishu] failed to parse bot info", "err", err, "code", botInfo.Code)
		return
	}
	f.botOpenID = botInfo.Bot.OpenID
	slog.Info("[feishu] bot open_id resolved", "bot_open_id", f.botOpenID)
}

// isFeishuMentionBot 检测消息的 mentions 中是否包含机器人自身
func (f *FeishuConnector) isFeishuMentionBot(msg *larkim.EventMessage) bool {
	if msg.Mentions == nil || len(msg.Mentions) == 0 {
		return false
	}

	// botOpenID 未获取到时，尝试重新获取一次
	if f.botOpenID == "" {
		slog.Warn("[feishu] botOpenID is empty, retrying fetchBotOpenID")
		f.fetchBotOpenID(context.Background())
	}

	for _, m := range msg.Mentions {
		if m.Key != nil && *m.Key == "@_all" {
			continue
		}
		if f.botOpenID != "" && m.Id != nil && m.Id.OpenId != nil {
			if *m.Id.OpenId == f.botOpenID {
				return true
			}
		}
	}

	// botOpenID 仍然为空时，通过 mention 的 name 字段匹配机器人名称
	// 飞书 mention 中 name 字段包含被 @ 的实体名称
	// 如果 name 中包含"灵犀"等机器人关键词，认为是 @机器人
	// 否则不回复，避免误回复 @其他人 的消息
	if f.botOpenID == "" {
		slog.Warn("[feishu] botOpenID still empty after retry, falling back to conservative mode (not replying)")
		return false
	}
	return false
}

func extractFeishuText(msg *larkim.EventMessage) string {
	if msg.Content == nil {
		return ""
	}
	rawContent := *msg.Content
	var content map[string]interface{}
	if err := json.Unmarshal([]byte(rawContent), &content); err != nil {
		slog.Warn("[feishu] extractText unmarshal failed, using raw",
			"err", err, "raw", truncateStr(rawContent, 200))
		return rawContent
	}

	msgType := ""
	if msg.MessageType != nil {
		msgType = *msg.MessageType
	}

	// text 类型消息：{"text":"hello"}
	if t, ok := content["text"].(string); ok && t != "" {
		return t
	}
	// post（富文本）类型消息：从 content 中提取 title + 各段落文本
	if msgType == "post" {
		return extractPostText(content)
	}
	// image 类型：返回占位描述
	if msgType == "image" {
		return "[图片消息]"
	}
	// file 类型
	if msgType == "file" {
		if name, ok := content["file_name"].(string); ok {
			return "[文件: " + name + "]"
		}
		return "[文件消息]"
	}

	// 兜底：尝试 post 解析（有些消息虽然不是 post 类型但有 post 结构）
	if postText := extractPostText(content); postText != "" {
		return postText
	}

	slog.Warn("[feishu] extractText: unrecognized message format",
		"msg_type", msgType, "content_keys", mapKeys(content),
		"raw", truncateStr(rawContent, 300))
	return ""
}

// extractFeishuImageKeys 从飞书消息中提取所有 image_key
// 支持 image 类型（content.image_key）和 post 富文本（嵌套 tag:image 元素）
func extractFeishuImageKeys(msg *larkim.EventMessage) []string {
	if msg.Content == nil {
		return nil
	}
	var content map[string]interface{}
	if err := json.Unmarshal([]byte(*msg.Content), &content); err != nil {
		slog.Warn("[feishu] extractImageKeys unmarshal content failed",
			"err", err, "raw_content", *msg.Content)
		return nil
	}
	msgType := ""
	if msg.MessageType != nil {
		msgType = *msg.MessageType
	}
	slog.Info("[feishu] extractImageKeys",
		"msg_type", msgType, "content_keys", mapKeys(content), "raw_content", *msg.Content)

	var keys []string
	// image 类型：{"image_key":"img_xxx"}
	if msgType == "image" {
		if k, ok := content["image_key"].(string); ok && k != "" {
			keys = append(keys, k)
		}
	}
	// post 富文本：扫描各语言版本的 content 数组，提取 tag:image 的 image_key
	if msgType == "post" {
		for _, lang := range []string{"zh_cn", "en_us", "ja_jp"} {
			langData, ok := content[lang].(map[string]interface{})
			if !ok {
				continue
			}
			contentArr, ok := langData["content"].([]interface{})
			if !ok {
				continue
			}
			for _, para := range contentArr {
				paraArr, ok := para.([]interface{})
				if !ok {
					continue
				}
				for _, elem := range paraArr {
					elemMap, ok := elem.(map[string]interface{})
					if !ok {
						continue
					}
					if tag, _ := elemMap["tag"].(string); tag == "image" {
						if k, ok := elemMap["image_key"].(string); ok && k != "" {
							keys = append(keys, k)
						}
					}
				}
			}
		}
	}
	slog.Info("[feishu] extractImageKeys result", "keys", keys)
	return keys
}

// mapKeys 返回 map 的所有 key（仅用于日志）
func mapKeys(m map[string]interface{}) []string {
	var keys []string
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// downloadFeishuImage 通过飞书「获取消息中的资源文件」接口下载用户发送的图片二进制并 base64 编码。
// 飞书有两个图片下载 API：
//   - GET /open-apis/im/v1/images/{image_key}?image_type=message —— 只能下载机器人自己上传的图片
//   - GET /open-apis/im/v1/messages/{message_id}/resources/{file_key}?type=image —— 下载用户发送的消息资源
//
// 用户在私聊/群聊中发送的图片属于后者，必须用 message_id + file_key（即 image_key）下载。
func (f *FeishuConnector) downloadFeishuImage(ctx context.Context, messageID, fileKey string) (IMImage, error) {
	if messageID == "" || fileKey == "" {
		return IMImage{}, fmt.Errorf("empty message_id or file_key")
	}

	// 获取 tenant_access_token
	tokenReqBody, _ := json.Marshal(map[string]string{
		"app_id":     f.cfg.AppID,
		"app_secret": f.cfg.AppSecret,
	})
	tokenResp, err := http.Post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
		"application/json", strings.NewReader(string(tokenReqBody)))
	if err != nil {
		return IMImage{}, fmt.Errorf("get tenant_access_token: %w", err)
	}
	defer tokenResp.Body.Close()
	var tokenData struct {
		Code              int    `json:"code"`
		TenantAccessToken string `json:"tenant_access_token"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil || tokenData.Code != 0 {
		return IMImage{}, fmt.Errorf("parse tenant_access_token: code=%d err=%w", tokenData.Code, err)
	}
	if tokenData.TenantAccessToken == "" {
		return IMImage{}, fmt.Errorf("empty tenant_access_token")
	}

	// 下载用户发送的图片资源
	// 端点：GET /open-apis/im/v1/messages/{message_id}/resources/{file_key}?type=image
	url := "https://open.feishu.cn/open-apis/im/v1/messages/" + messageID +
		"/resources/" + fileKey + "?type=image"
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+tokenData.TenantAccessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return IMImage{}, fmt.Errorf("download image: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return IMImage{}, fmt.Errorf("download image status=%d body=%s", resp.StatusCode, string(errBody))
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return IMImage{}, fmt.Errorf("read image body: %w", err)
	}
	mediaType := resp.Header.Get("Content-Type")
	if mediaType == "" {
		mediaType = "image/jpeg"
	}
	// 飞书可能返回 image/jpg 等非标准 MIME，统一规范化
	switch mediaType {
	case "image/jpg", "image/jpeg":
		mediaType = "image/jpeg"
	case "image/png":
		mediaType = "image/png"
	case "image/gif":
		mediaType = "image/gif"
	case "image/webp":
		mediaType = "image/webp"
	default:
		mediaType = "image/jpeg"
	}
	return IMImage{
		MediaType: mediaType,
		Data:      base64.StdEncoding.EncodeToString(data),
	}, nil
}

// fetchFeishuImages 批量下载飞书图片，失败的图片跳过
// messageID 为该图片所属消息的 ID，所有 keys 都属于同一条消息
func (f *FeishuConnector) fetchFeishuImages(ctx context.Context, messageID string, keys []string) []IMImage {
	if len(keys) == 0 {
		slog.Info("[feishu] fetchFeishuImages: no keys to download")
		return nil
	}
	var images []IMImage
	for _, k := range keys {
		img, err := f.downloadFeishuImage(ctx, messageID, k)
		if err != nil {
			slog.Warn("[feishu] download image failed", "message_id", messageID, "file_key", k, "err", err)
			continue
		}
		images = append(images, img)
	}
	slog.Info("[feishu] downloaded images", "message_id", messageID, "total_keys", len(keys), "ok", len(images))
	return images
}

// extractPostText 从飞书 post（富文本）消息中提取纯文本
func extractPostText(content map[string]interface{}) string {
	var result string
	// 优先尝试常见语言，然后遍历所有 key 兜底
	tried := make(map[string]bool)
	priorities := []string{"zh_cn", "en_us", "ja_jp"}
	for _, lang := range priorities {
		tried[lang] = true
		if r := extractPostLangText(content, lang); r != "" {
			return r
		}
	}
	for key := range content {
		if tried[key] || key == "title" || key == "content" {
			continue
		}
		if r := extractPostLangText(content, key); r != "" {
			return r
		}
	}

	// 顶层直接有 title + content 数组的情况（无语言包装）
	if title, ok := content["title"].(string); ok && title != "" {
		result += title + "\n"
	}
	if contentArr, ok := content["content"].([]interface{}); ok {
		for _, para := range contentArr {
			if paraArr, ok := para.([]interface{}); ok {
				for _, elem := range paraArr {
					if elemMap, ok := elem.(map[string]interface{}); ok {
						if text, ok := elemMap["text"].(string); ok {
							result += text
						}
					}
				}
				result += "\n"
			}
		}
	}
	return strings.TrimSpace(result)
}

func extractPostLangText(content map[string]interface{}, lang string) string {
	langData, ok := content[lang].(map[string]interface{})
	if !ok {
		return ""
	}
	var result string
	if title, ok := langData["title"].(string); ok && title != "" {
		result += title + "\n"
	}
	if contentArr, ok := langData["content"].([]interface{}); ok {
		for _, para := range contentArr {
			if paraArr, ok := para.([]interface{}); ok {
				for _, elem := range paraArr {
					if elemMap, ok := elem.(map[string]interface{}); ok {
						if text, ok := elemMap["text"].(string); ok {
							result += text
						}
					}
				}
				result += "\n"
			}
		}
	}
	return strings.TrimSpace(result)
}

func (f *FeishuConnector) sendReply(ctx context.Context, msgID, chatID, text string) error {
	_, err := f.sendReplyReturnID(ctx, msgID, chatID, text)
	return err
}

// sendReplyReturnID 发送回复并返回飞书消息 ID（用于回复链映射）
func (f *FeishuConnector) sendReplyReturnID(ctx context.Context, msgID, chatID, text string) (string, error) {
	members := f.getChatMembers(ctx, chatID)
	text = replaceAtMentions(text, members)

	content, _ := json.Marshal(map[string]string{"text": text})
	msgType := "text"

	if msgID != "" {
		req := larkim.NewReplyMessageReqBuilder().
			MessageId(msgID).
			Body(larkim.NewReplyMessageReqBodyBuilder().
				MsgType(msgType).
				Content(string(content)).
				Build()).
			Build()
		resp, err := f.client.Im.Message.Reply(ctx, req)
		if err != nil {
			return "", err
		}
		if !resp.Success() {
			return "", fmt.Errorf("feishu reply error: code=%d msg=%s", resp.Code, resp.Msg)
		}
		if resp.Data != nil && resp.Data.MessageId != nil {
			return *resp.Data.MessageId, nil
		}
		return "", nil
	}

	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType("chat_id").
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).
			MsgType(msgType).
			Content(string(content)).
			Build()).
		Build()
	resp, err := f.client.Im.Message.Create(ctx, req)
	if err != nil {
		return "", err
	}
	if !resp.Success() {
		return "", fmt.Errorf("feishu send error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	if resp.Data != nil && resp.Data.MessageId != nil {
		return *resp.Data.MessageId, nil
	}
	return "", nil
}

// getChatName 获取飞书群名称，带内存缓存
func (f *FeishuConnector) getChatName(ctx context.Context, chatID string) string {
	if v, ok := f.chatNameCache.Load(chatID); ok {
		return v.(string)
	}
	req := larkim.NewGetChatReqBuilder().ChatId(chatID).Build()
	resp, err := f.client.Im.Chat.Get(ctx, req)
	if err != nil {
		slog.Debug("[feishu] getChatName API error", "chat_id", chatID, "err", err)
		return ""
	}
	if !resp.Success() || resp.Data == nil || resp.Data.Name == nil {
		slog.Debug("[feishu] getChatName failed", "chat_id", chatID, "code", resp.Code)
		return ""
	}
	name := *resp.Data.Name
	f.chatNameCache.Store(chatID, name)
	return name
}

// getUserName 获取飞书用户名称，带内存缓存
func (f *FeishuConnector) getUserName(ctx context.Context, openID string) string {
	if openID == "" {
		return ""
	}
	if v, ok := f.userNameCache.Load(openID); ok {
		return v.(string)
	}
	req := larkcontact.NewGetUserReqBuilder().
		UserId(openID).
		UserIdType("open_id").
		Build()
	resp, err := f.client.Contact.User.Get(ctx, req)
	if err != nil {
		slog.Debug("[feishu] getUserName API error", "open_id", openID, "err", err)
		return ""
	}
	if !resp.Success() || resp.Data == nil || resp.Data.User == nil || resp.Data.User.Name == nil {
		slog.Debug("[feishu] getUserName failed", "open_id", openID, "code", resp.Code)
		return ""
	}
	name := *resp.Data.User.Name
	f.userNameCache.Store(openID, name)
	return name
}

// getChatMembers 获取飞书群成员列表，返回 名字→open_id 映射，10 分钟缓存
func (f *FeishuConnector) getChatMembers(ctx context.Context, chatID string) map[string]string {
	if chatID == "" {
		return nil
	}
	if v, ok := f.chatMembersCache.Load(chatID); ok {
		entry := v.(*chatMembersEntry)
		if time.Now().Before(entry.expire) {
			return entry.members
		}
	}

	members := make(map[string]string)
	var pageToken *string
	for {
		reqBuilder := larkim.NewGetChatMembersReqBuilder().
			ChatId(chatID).
			MemberIdType("open_id")
		if pageToken != nil {
			reqBuilder.PageToken(*pageToken)
		}
		resp, err := f.client.Im.ChatMembers.Get(ctx, reqBuilder.Build())
		if err != nil {
			slog.Debug("[feishu] getChatMembers API error", "chat_id", chatID, "err", err)
			break
		}
		if !resp.Success() || resp.Data == nil {
			slog.Debug("[feishu] getChatMembers failed", "chat_id", chatID, "code", resp.Code)
			break
		}
		for _, m := range resp.Data.Items {
			if m.MemberId != nil && m.Name != nil {
				members[*m.Name] = *m.MemberId
			}
		}
		if resp.Data.PageToken == nil || *resp.Data.PageToken == "" || !*resp.Data.HasMore {
			break
		}
		pageToken = resp.Data.PageToken
	}

	if len(members) > 0 {
		f.chatMembersCache.Store(chatID, &chatMembersEntry{
			members: members,
			expire:  time.Now().Add(10 * time.Minute),
		})
		slog.Info("[feishu] cached chat members", "chat_id", chatID, "count", len(members))
	}
	return members
}

// replaceAtMentions 将文本中的 @名字 替换为飞书 <at id=open_id></at> 格式。
// 同时支持 @所有人 → <at id=all></at>
func replaceAtMentions(text string, members map[string]string) string {
	if len(members) == 0 && !strings.Contains(text, "@所有人") {
		return text
	}

	// 先处理 @所有人
	text = strings.ReplaceAll(text, "@所有人", "<at id=all></at>")

	// 按名字长度降序排列，避免短名字匹配到长名字的前缀
	type nameID struct {
		name string
		id   string
	}
	var sorted []nameID
	for name, id := range members {
		sorted = append(sorted, nameID{name, id})
	}
	// 按名字长度降序排序
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if len(sorted[j].name) > len(sorted[i].name) {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	for _, ni := range sorted {
		// 替换 @名字 为飞书 mention 格式
		atName := "@" + ni.name
		if strings.Contains(text, atName) {
			text = strings.ReplaceAll(text, atName, fmt.Sprintf("<at id=%s></at>", ni.id))
		}
	}
	return text
}

// getMembersListForPrompt 将群成员信息格式化为可注入提示词的字符串
func getMembersListForPrompt(members map[string]string) string {
	if len(members) == 0 {
		return ""
	}
	var lines []string
	for name := range members {
		lines = append(lines, "  - "+name)
	}
	return "群成员列表（你可以用 @名字 来真正艾特他们）:\n" + strings.Join(lines, "\n")
}

// sendToChat 主动发送消息到指定群
func (f *FeishuConnector) sendToChat(ctx context.Context, chatID, text string) error {
	body := larkim.NewCreateMessageReqBodyBuilder().
		ReceiveId(chatID).
		MsgType("text").
		Content(`{"text":"` + escapeJSONString(text) + `"}`).
		Build()
	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType("chat_id").
		Body(body).
		Build()
	resp, err := f.client.Im.Message.Create(ctx, req)
	if err != nil {
		return err
	}
	if !resp.Success() {
		return fmt.Errorf("feishu sendToChat error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}

// sendToUser 主动发送消息给指定用户
func (f *FeishuConnector) sendToUser(ctx context.Context, openID, text string) error {
	body := larkim.NewCreateMessageReqBodyBuilder().
		ReceiveId(openID).
		MsgType("text").
		Content(`{"text":"` + escapeJSONString(text) + `"}`).
		Build()
	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType("open_id").
		Body(body).
		Build()
	resp, err := f.client.Im.Message.Create(ctx, req)
	if err != nil {
		return err
	}
	if !resp.Success() {
		return fmt.Errorf("feishu sendToUser error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}

// escapeJSONString 转义 JSON 字符串中的特殊字符
func escapeJSONString(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	s = strings.ReplaceAll(s, "\t", `\t`)
	return s
}
