package connector

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	larkcore "github.com/larksuite/oapi-sdk-go/v3/core"
	larkcontact "github.com/larksuite/oapi-sdk-go/v3/service/contact/v3"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"
	lark "github.com/larksuite/oapi-sdk-go/v3"
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
}

// FeishuConnector 实现飞书 WebSocket 长连接机器人
type FeishuConnector struct {
	cfg     FeishuConfig
	client  *lark.Client
	cancel  context.CancelFunc
	agentID int64

	// 群名/用户名缓存，避免每条消息都调 API
	chatNameCache sync.Map // chatID -> string
	userNameCache sync.Map // openID -> string

	// 消息去重：防止飞书 SDK 网络重连后重复推送同一条消息
	processedMsgsMu sync.Mutex
	processedMsgs   map[string]time.Time // msgID -> 处理时间
}

func (f *FeishuConnector) SetAgentID(id int64) { f.agentID = id }

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

func (f *FeishuConnector) Platform() string { return "feishu" }

func (f *FeishuConnector) Start(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	f.cancel = cancel

	eventHandler := dispatcher.NewEventDispatcher("", "").
		OnP2MessageReceiveV1(func(ctx context.Context, event *larkim.P2MessageReceiveV1) error {
			return f.onMessage(ctx, event)
		})

	wsClient := larkws.NewClient(f.cfg.AppID, f.cfg.AppSecret,
		larkws.WithEventHandler(eventHandler),
		larkws.WithLogLevel(larkcore.LogLevelInfo),
	)

	slog.Info("starting ws client, app_id", "app_i_d", f.cfg.AppID)
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

	// 消息去重：飞书 SDK 可能在网络重连时重复推送同一条消息
	if f.isDuplicate(msgID) {
		slog.Info("[feishu] duplicate message, skipping", "msg_id", msgID)
		return nil
	}

	// 解析文本内容
	text := extractFeishuText(msgData)
	if text == "" {
		return nil
	}

	// 检测 @所有人：飞书 mentions 中 key 为 "@_all" 表示 @所有人
	isMentionAll := isFeishuMentionAll(msgData)

	slog.Info("[feishu] received message",
		"sender", senderID,
		"chat_id", chatID,
		"msg_id", msgID,
		"text", text,
		"is_mention_all", isMentionAll,
		"chat_type", func() string {
			if msgData.ChatType != nil { return *msgData.ChatType }
			return ""
		}(),
		"msg_type", func() string {
			if msgData.MessageType != nil { return *msgData.MessageType }
			return ""
		}(),
	)

	replyFunc := func(reply string) error {
		return f.sendReply(ctx, msgID, chatID, reply)
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

	msg := IMMessage{
		Platform:       "feishu",
		UserID:         senderID,
		UserName:       senderName,
		ConversationID: chatID,
		ConvTitle:      convTitle,
		ConvType:       convType,
		Text:           text,
		AgentID:        f.agentID,
		IsMentionAll:   isMentionAll,
		BaseCfg:        f.cfg.BaseConfig,
		ReplyFunc:      replyFunc,
	}

	// 启用流式卡片时，注入 StreamCallback 并立即发送思考提示
	if f.cfg.StreamingEnabled {
		sender := newFeishuStreamSender(f.cfg.AppID, f.cfg.AppSecret, chatID, msgID, f.cfg)
		sender.SendAck()
		msg.StreamCallback = sender.OnStreamCallback
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

func extractFeishuText(msg *larkim.EventMessage) string {
	if msg.Content == nil {
		return ""
	}
	// 飞书消息 content 是 JSON 字符串，如 {"text":"hello"}
	var content map[string]interface{}
	if err := json.Unmarshal([]byte(*msg.Content), &content); err != nil {
		return ""
	}
	if t, ok := content["text"].(string); ok {
		return t
	}
	return ""
}

func (f *FeishuConnector) sendReply(ctx context.Context, msgID, chatID, text string) error {
	content, _ := json.Marshal(map[string]string{"text": text})
	msgType := "text"

	if msgID != "" {
		// 回复具体消息
		req := larkim.NewReplyMessageReqBuilder().
			MessageId(msgID).
			Body(larkim.NewReplyMessageReqBodyBuilder().
				MsgType(msgType).
				Content(string(content)).
				Build()).
			Build()
		resp, err := f.client.Im.Message.Reply(ctx, req)
		if err != nil {
			return err
		}
		if !resp.Success() {
			return fmt.Errorf("feishu reply error: code=%d msg=%s", resp.Code, resp.Msg)
		}
		return nil
	}

	// 发送到群聊
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
		return err
	}
	if !resp.Success() {
		return fmt.Errorf("feishu send error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
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
