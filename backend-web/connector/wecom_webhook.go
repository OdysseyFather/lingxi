package connector

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// WecomWebhookConfig 企业微信群机器人 Webhook 配置
type WecomWebhookConfig struct {
	WebhookURL string `json:"webhook_url"`
}

// WecomWebhookConnector 企业微信群机器人 Webhook 连接器（仅发送通知，无需接收回复）
type WecomWebhookConnector struct {
	cfg WecomWebhookConfig
}

// NewWecomWebhookConnector 创建企业微信 Webhook 连接器
func NewWecomWebhookConnector(configJSON string) (*WecomWebhookConnector, error) {
	var cfg WecomWebhookConfig
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, err
	}
	if cfg.WebhookURL == "" {
		return nil, fmt.Errorf("webhook_url is required")
	}
	if !strings.HasPrefix(cfg.WebhookURL, "https://qyapi.weixin.qq.com/cgi-bin/webhook/send") {
		return nil, fmt.Errorf("invalid wecom webhook url")
	}
	return &WecomWebhookConnector{cfg: cfg}, nil
}

func (w *WecomWebhookConnector) Platform() string { return "wecom_webhook" }

func (w *WecomWebhookConnector) Start(ctx context.Context) error {
	slog.Info("[wecom_webhook] connector ready", "url", w.cfg.WebhookURL[:40]+"...")
	<-ctx.Done()
	return nil
}

func (w *WecomWebhookConnector) Stop() {}

// SendText 发送文本消息
func (w *WecomWebhookConnector) SendText(content string, mentionedList []string) error {
	payload := map[string]interface{}{
		"msgtype": "text",
		"text": map[string]interface{}{
			"content":        content,
			"mentioned_list": mentionedList,
		},
	}
	return w.post(payload)
}

// SendMarkdown 发送 Markdown 消息
func (w *WecomWebhookConnector) SendMarkdown(content string) error {
	payload := map[string]interface{}{
		"msgtype": "markdown",
		"markdown": map[string]string{
			"content": content,
		},
	}
	return w.post(payload)
}

func (w *WecomWebhookConnector) post(payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(w.cfg.WebhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("wecom webhook request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("wecom webhook parse response failed: %w", err)
	}
	if result.ErrCode != 0 {
		return fmt.Errorf("wecom webhook error: errcode=%d errmsg=%s", result.ErrCode, result.ErrMsg)
	}
	return nil
}

// GetWecomWebhookConnector 从 Manager 获取 WecomWebhookConnector 实例（用于 handler 调用 SendText/SendMarkdown）
var webhookInstances = make(map[int64]*WecomWebhookConnector)
var webhookMu = make(chan struct{}, 1)

func init() { webhookMu <- struct{}{} }

func RegisterWebhookInstance(connID int64, c *WecomWebhookConnector) {
	<-webhookMu
	webhookInstances[connID] = c
	webhookMu <- struct{}{}
}

func UnregisterWebhookInstance(connID int64) {
	<-webhookMu
	delete(webhookInstances, connID)
	webhookMu <- struct{}{}
}

func GetWebhookInstance(connID int64) *WecomWebhookConnector {
	<-webhookMu
	c := webhookInstances[connID]
	webhookMu <- struct{}{}
	return c
}
