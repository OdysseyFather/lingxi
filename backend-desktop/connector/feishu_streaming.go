package connector

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── 全局 tenant_access_token 缓存 ────────────────────────────────

var (
	globalTokenMu  sync.Mutex
	globalTokenMap = make(map[string]*tokenEntry) // appID -> entry
)

type tokenEntry struct {
	token  string
	expire time.Time
}

// GetTenantToken 获取 tenant_access_token（全局缓存，跨 sender 共享）
func GetTenantToken(appID, appSecret string) (string, error) {
	globalTokenMu.Lock()
	defer globalTokenMu.Unlock()

	if entry, ok := globalTokenMap[appID]; ok && time.Now().Before(entry.expire) {
		return entry.token, nil
	}

	body, _ := json.Marshal(map[string]string{
		"app_id":     appID,
		"app_secret": appSecret,
	})
	resp, err := http.Post(
		"https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
		"application/json", bytes.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
		Expire            int    `json:"expire"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Code != 0 {
		return "", fmt.Errorf("feishu auth error: code=%d msg=%s", result.Code, result.Msg)
	}

	globalTokenMap[appID] = &tokenEntry{
		token:  result.TenantAccessToken,
		expire: time.Now().Add(time.Duration(result.Expire-120) * time.Second),
	}
	return result.TenantAccessToken, nil
}

// PrewarmTenantToken 启动时预热 token（非阻塞）
func PrewarmTenantToken(appID, appSecret string) {
	go func() {
		if _, err := GetTenantToken(appID, appSecret); err != nil {
			slog.Warn("[feishu] prewarm token failed", "err", err)
		} else {
			slog.Info("[feishu] token prewarmed", "app_id", appID)
		}
	}()
}

// ── feishuStreamSender 封装飞书卡片流式更新 ────────────────────────

type feishuStreamSender struct {
	appID     string
	appSecret string
	chatID    string
	msgID     string // 原消息 ID

	mu             sync.Mutex
	cardID         string
	replyMsgID     string // 卡片消息的 message_id
	ackMsgID       string // "💭 正在思考..." 消息的 ID
	sequence       int
	fullText       string
	thinkingText   string
	toolText       string

	// 飞书 streaming_mode 要求每次 PUT 的 content 是前一次的前缀扩展（只追加不删除），
	// 否则客户端会从头重新渲染，导致"重复说话"的视觉效果。
	// frozenThinking / frozenTool 在对应阶段结束后冻结为最终文本，后续 flush 不再变化。
	frozenThinking string
	frozenTool     string
	thinkingDone   bool
	toolDone       bool

	pendingFlush  bool
	flushTimer    *time.Timer
	flushInterval time.Duration

	cardTitle string
	done      bool
}

func newFeishuStreamSender(appID, appSecret, chatID, msgID string, cfg FeishuConfig) *feishuStreamSender {
	title := cfg.StreamingCardTitle
	if title == "" {
		title = "灵犀"
	}
	interval := time.Duration(cfg.StreamingFlushMs) * time.Millisecond
	if interval < 50*time.Millisecond {
		interval = 80 * time.Millisecond
	}
	return &feishuStreamSender{
		appID:         appID,
		appSecret:     appSecret,
		chatID:        chatID,
		msgID:         msgID,
		flushInterval: interval,
		cardTitle:     title,
	}
}

// SendAck 立即发送"💭 正在思考..."文本提示，减少用户等待感知
func (s *feishuStreamSender) SendAck() {
	token, err := GetTenantToken(s.appID, s.appSecret)
	if err != nil {
		return
	}
	msgID, err := s.sendTextMessage(token, "💭 正在思考...")
	if err != nil {
		slog.Warn("[feishu-stream] send ack failed", "err", err)
		return
	}
	s.mu.Lock()
	s.ackMsgID = msgID
	s.mu.Unlock()
}

// OnStreamCallback 新版多类型流式回调
func (s *feishuStreamSender) OnStreamCallback(kind StreamKind, payload string, done bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch kind {
	case KindThinking:
		s.thinkingText += payload
	case KindTool:
		// thinking -> tool 阶段切换时，冻结 thinking 文本
		if !s.thinkingDone && s.thinkingText != "" {
			s.thinkingDone = true
			s.frozenThinking = s.thinkingText
		}
		s.toolText += payload
	case KindText:
		// thinking/tool -> text 阶段切换时，冻结前序文本
		if !s.thinkingDone && s.thinkingText != "" {
			s.thinkingDone = true
			s.frozenThinking = s.thinkingText
		}
		if !s.toolDone && s.toolText != "" {
			s.toolDone = true
			s.frozenTool = s.toolText
		}
		s.fullText += payload
	}

	if done {
		s.done = true
		if s.flushTimer != nil {
			s.flushTimer.Stop()
			s.flushTimer = nil
		}
		return s.flushLocked()
	}

	if s.cardID == "" {
		if err := s.initCard(); err != nil {
			return err
		}
		s.deleteAck()
	}

	s.pendingFlush = true
	if s.flushTimer == nil {
		s.flushTimer = time.AfterFunc(s.flushInterval, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if err := s.flushLocked(); err != nil {
				slog.Warn("[feishu-stream] flush error", "err", err)
			}
		})
	}
	return nil
}

// OnChunk 兼容旧版接口
func (s *feishuStreamSender) OnChunk(chunk string, done bool) error {
	return s.OnStreamCallback(KindText, chunk, done)
}

func (s *feishuStreamSender) deleteAck() {
	if s.ackMsgID == "" {
		return
	}
	go func() {
		token, err := GetTenantToken(s.appID, s.appSecret)
		if err != nil {
			return
		}
		s.deleteMessage(token, s.ackMsgID)
	}()
	s.ackMsgID = ""
}

func (s *feishuStreamSender) initCard() error {
	token, err := GetTenantToken(s.appID, s.appSecret)
	if err != nil {
		return fmt.Errorf("get tenant token: %w", err)
	}

	cardJSON := s.buildCardJSON()
	cardID, err := s.createCardEntity(token, cardJSON)
	if err != nil {
		return fmt.Errorf("create card: %w", err)
	}
	s.cardID = cardID

	replyMsgID, err := s.sendCardMessage(token, cardID)
	if err != nil {
		return fmt.Errorf("send card message: %w", err)
	}
	s.replyMsgID = replyMsgID
	slog.Info("[feishu-stream] card created", "cardID", cardID, "replyMsgID", replyMsgID)
	return nil
}

func (s *feishuStreamSender) flushLocked() error {
	if s.cardID == "" {
		if s.fullText == "" && s.thinkingText == "" && s.toolText == "" {
			return nil
		}
		if err := s.initCard(); err != nil {
			return err
		}
		s.deleteAck()
	}

	s.flushTimer = nil
	s.pendingFlush = false

	token, err := GetTenantToken(s.appID, s.appSecret)
	if err != nil {
		return err
	}

	// 构建多 element 内容
	content := s.buildStreamContent()
	if content == "" {
		return nil
	}

	s.sequence++
	return s.updateElement(token, content, s.sequence)
}

// buildStreamContent 构建飞书卡片 streaming element 内容。
// 关键约束：每次返回的内容必须是上次的前缀扩展（只追加不删除），
// 否则飞书客户端会从头重新渲染导致"重复说话"。
func (s *feishuStreamSender) buildStreamContent() string {
	var parts []string

	// thinking 部分：使用冻结文本（阶段结束后）或当前累积文本（阶段进行中）
	thinkingContent := s.thinkingText
	if s.thinkingDone {
		thinkingContent = s.frozenThinking
	}
	if thinkingContent != "" {
		label := "💭 思考中..."
		if s.thinkingDone {
			label = "💭 思考完成"
		}
		parts = append(parts, fmt.Sprintf("<font color='grey'>%s</font>\n> %s",
			label, strings.ReplaceAll(thinkingContent, "\n", "\n> ")))
	}

	// tool 部分：同理使用冻结文本
	toolContent := s.toolText
	if s.toolDone {
		toolContent = s.frozenTool
	}
	if toolContent != "" {
		parts = append(parts, fmt.Sprintf("🔧 **工具调用**\n```\n%s\n```", toolContent))
	}

	if s.fullText != "" {
		parts = append(parts, s.fullText)
	}

	if s.done && len(parts) == 0 {
		parts = append(parts, "✅ 完成")
	}

	return strings.Join(parts, "\n\n---\n\n")
}

// ── 飞书 API 调用 ────────────────────────────────────────────

func (s *feishuStreamSender) buildCardJSON() string {
	card := map[string]interface{}{
		"schema": "2.0",
		"config": map[string]interface{}{
			"streaming_mode": true,
			"streaming_config": map[string]interface{}{
				"print_frequency_ms": map[string]interface{}{"default": 50},
				"print_step":         map[string]interface{}{"default": 2},
				"print_strategy":     "fast",
			},
			"update_multi": true,
			"width_mode":   "default",
			"summary": map[string]interface{}{
				"content": "正在回复...",
			},
		},
		"header": map[string]interface{}{
			"title":    map[string]interface{}{"tag": "plain_text", "content": s.cardTitle},
			"template": "blue",
		},
		"body": map[string]interface{}{
			"elements": []map[string]interface{}{
				{
					"tag":        "markdown",
					"element_id": "streaming_md",
					"content":    "思考中...",
				},
			},
		},
	}
	b, _ := json.Marshal(card)
	return string(b)
}

func (s *feishuStreamSender) createCardEntity(token, cardDataJSON string) (string, error) {
	body, _ := json.Marshal(map[string]string{
		"type": "card_json",
		"data": cardDataJSON,
	})

	req, _ := http.NewRequest("POST", "https://open.feishu.cn/open-apis/cardkit/v1/cards", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			CardID string `json:"card_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("parse create card response: %w, body: %s", err, string(respBody))
	}
	if result.Code != 0 {
		return "", fmt.Errorf("create card error: code=%d msg=%s", result.Code, result.Msg)
	}
	return result.Data.CardID, nil
}

func (s *feishuStreamSender) sendCardMessage(token, cardID string) (string, error) {
	content, _ := json.Marshal(map[string]interface{}{
		"type": "card",
		"data": map[string]string{"card_id": cardID},
	})

	receiveType := "chat_id"
	if !strings.HasPrefix(s.chatID, "oc_") {
		receiveType = "open_id"
	}

	var url string
	var reqBody []byte

	if s.msgID != "" {
		// 回复原消息（线程模式）
		url = fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s/reply", s.msgID)
		reqBody, _ = json.Marshal(map[string]string{
			"msg_type": "interactive",
			"content":  string(content),
		})
	} else {
		url = fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=%s", receiveType)
		reqBody, _ = json.Marshal(map[string]string{
			"receive_id": s.chatID,
			"msg_type":   "interactive",
			"content":    string(content),
		})
	}

	req, _ := http.NewRequest("POST", url, bytes.NewReader(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("parse send message response: %w, body: %s", err, string(respBody))
	}
	if result.Code != 0 {
		return "", fmt.Errorf("send card message error: code=%d msg=%s", result.Code, result.Msg)
	}
	return result.Data.MessageID, nil
}

func (s *feishuStreamSender) updateElement(token, content string, seq int) error {
	body, _ := json.Marshal(map[string]interface{}{
		"content":  content,
		"sequence": seq,
	})

	url := fmt.Sprintf("https://open.feishu.cn/open-apis/cardkit/v1/cards/%s/elements/%s/content", s.cardID, "streaming_md")
	req, _ := http.NewRequest("PUT", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("update element error: status=%d body=%s", resp.StatusCode, string(respBody))
	}
	return nil
}

func (s *feishuStreamSender) sendTextMessage(token, text string) (string, error) {
	content, _ := json.Marshal(map[string]string{"text": text})

	receiveType := "chat_id"
	if !strings.HasPrefix(s.chatID, "oc_") {
		receiveType = "open_id"
	}

	var url string
	var reqBody []byte

	if s.msgID != "" {
		url = fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s/reply", s.msgID)
		reqBody, _ = json.Marshal(map[string]string{
			"msg_type": "text",
			"content":  string(content),
		})
	} else {
		url = fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=%s", receiveType)
		reqBody, _ = json.Marshal(map[string]string{
			"receive_id": s.chatID,
			"msg_type":   "text",
			"content":    string(content),
		})
	}

	req, _ := http.NewRequest("POST", url, bytes.NewReader(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}
	if result.Code != 0 {
		return "", fmt.Errorf("send text message error: code=%d msg=%s", result.Code, result.Msg)
	}
	return result.Data.MessageID, nil
}

func (s *feishuStreamSender) deleteMessage(token, messageID string) {
	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s", messageID)
	req, _ := http.NewRequest("DELETE", url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("[feishu-stream] delete message failed", "msgID", messageID, "err", err)
		return
	}
	resp.Body.Close()
}
