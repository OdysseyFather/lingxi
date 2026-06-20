package connector

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	larkcore "github.com/larksuite/oapi-sdk-go/v3/core"
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
}

func (f *FeishuConnector) SetAgentID(id int64) { f.agentID = id }

func NewFeishuConnector(configJSON string) (*FeishuConnector, error) {
	cfg := FeishuConfig{BaseConfig: DefaultBaseConfig()}
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, err
	}
	client := lark.NewClient(cfg.AppID, cfg.AppSecret)
	return &FeishuConnector{cfg: cfg, client: client}, nil
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

	// 解析文本内容
	text := extractFeishuText(msgData)
	if text == "" {
		return nil
	}

	slog.Info("[feishu] received message",
		"sender", senderID,
		"chat_id", chatID,
		"msg_id", msgID,
		"text", text,
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

	msg := IMMessage{
		Platform:       "feishu",
		UserID:         senderID,
		ConversationID: chatID,
		Text:           text,
		AgentID:        f.agentID,
		BaseCfg:        f.cfg.BaseConfig,
		ReplyFunc:      replyFunc,
	}

	// 启用流式卡片时，注入 StreamCallback 并立即发送思考提示
	if f.cfg.StreamingEnabled {
		sender := newFeishuStreamSender(f.cfg.AppID, f.cfg.AppSecret, chatID, msgID, f.cfg)
		sender.SendAck()
		msg.StreamCallback = sender.OnStreamCallback
	}

	// 飞书回调同样要求快速返回，Claude 调用异步执行
	Dispatch(msg)
	return nil
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
