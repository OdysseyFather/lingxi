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

	mu         sync.Mutex
	cardID     string
	replyMsgID string // 卡片消息的 message_id
	ackMsgID   string // "💭 正在思考..." 消息的 ID
	sequence   int

	// 严格追加式内容管理：lastFlushed 保存上一次成功 flush 到飞书的内容，
	// pendingAppend 保存自上次 flush 以来新增的内容。
	// 每次 flush 时发送 lastFlushed + pendingAppend，成功后把 pendingAppend 合并进 lastFlushed。
	// 这样确保每次发给飞书的内容一定是上次的前缀扩展，不会触发重新渲染。
	lastFlushed   string
	pendingAppend string

	// fullTextReply 累积所有 KindText 文本，用于完成后检测交互块
	fullTextReply strings.Builder
	// thinkingContent 累积所有 KindThinking 原始文本，完成后用折叠面板展示
	thinkingContent strings.Builder

	// 阶段状态：用于格式化不同类型的内容
	currentPhase string // "thinking" | "tool" | "text" | ""

	// 思考阶段已输出标记（只输出一次提示，不累积思考原文）
	thinkingEmitted bool
	// 工具调用阶段已输出标记
	toolSectionStarted bool

	// 工具调用聚合：收集当前连续工具调用组，切换到 text 阶段时一次性输出摘要
	pendingTools []string // 当前连续组中的工具名列表（如 ["Bash", "Bash", "Read", "Skill"]）
	toolGroupEmitted int  // 已输出的工具组数量

	pendingFlush  bool
	flushTimer    *time.Timer
	flushInterval time.Duration

	cardTitle string
	done      bool

	// doneCallback 流式完成后用于构建交互元素的回调（在 replaceCardFinal 中调用）
	doneCallback func() []map[string]interface{}

	// chatMembers 群成员名字→open_id 映射，用于在最终卡片中替换 @mention
	chatMembers map[string]string
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

// OnStreamCallback 多类型流式回调。
// 飞书卡片展示思考提示、工具调用概要和正文文本。
// - thinking：首次进入思考阶段时追加一行提示，不输出原始思考内容
// - tool：每次工具调用追加一行简洁标记
// - text：直接追加正文
// 所有内容严格前缀扩展，不覆盖已有内容。
func (s *feishuStreamSender) OnStreamCallback(kind StreamKind, payload string, done bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch kind {
	case KindThinking:
		if !s.thinkingEmitted {
			s.thinkingEmitted = true
			s.pendingAppend += "> 💭 正在分析问题...\n\n"
			s.currentPhase = "thinking"
		}
		// 累积思考原文，完成后在折叠面板中展示
		if payload != "" {
			s.thinkingContent.WriteString(payload)
		}

	case KindTool:
		// 提取工具名：payload 格式为 "🔧 工具名" 或纯工具名
		toolName := strings.TrimPrefix(payload, "🔧 ")
		toolName = strings.TrimSpace(toolName)
		if toolName == "" {
			toolName = "工具"
		}
		s.pendingTools = append(s.pendingTools, toolName)
		s.currentPhase = "tool"
		if !s.toolSectionStarted {
			s.toolSectionStarted = true
		}

	case KindText:
		if payload != "" {
			// 始终累积到 fullTextReply（用于完成后检测交互块）
			s.fullTextReply.WriteString(payload)

			// 从工具阶段切换到文本阶段：输出聚合的工具摘要
			if s.currentPhase != "text" {
				s.flushPendingTools()
				if s.thinkingEmitted || s.toolSectionStarted {
					s.pendingAppend += "\n"
				}
			}
			s.currentPhase = "text"
			s.pendingAppend += payload
		}
	}

	if done {
		// 输出剩余的工具调用摘要
		s.flushPendingTools()
		s.done = true
		if s.flushTimer != nil {
			s.flushTimer.Stop()
			s.flushTimer = nil
		}
		// 从最终内容中移除 choice/input JSON 块（避免原始 JSON 显示在卡片中）
		s.cleanInteractiveJSONFromContent()
		return s.flushLocked()
	}

	// 有新内容待 flush 时初始化卡片并触发定时 flush
	if s.pendingAppend != "" {
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
	}
	return nil
}

// cleanInteractiveJSONFromContent 从最终卡片内容中移除 choice/input JSON 块。
// 由于流式过程中 JSON 是作为 KindText 追加的，完成后需要清理以避免显示原始 JSON。
func (s *feishuStreamSender) cleanInteractiveJSONFromContent() {
	// 合并 lastFlushed + pendingAppend 为完整内容
	full := s.lastFlushed + s.pendingAppend

	// 尝试移除 JSON 块（代码围栏包裹的和裸 JSON）
	cleaned := removeInteractiveJSON(full)
	if cleaned != full {
		// 内容有变化，重置为清理后的内容
		s.lastFlushed = ""
		s.pendingAppend = strings.TrimRight(cleaned, "\n \t") + "\n"
	}
}

// removeInteractiveJSON 从文本中移除 choice/input 类型的 JSON 块
func removeInteractiveJSON(text string) string {
	var result strings.Builder
	i := 0
	for i < len(text) {
		// 检查代码围栏包裹的 JSON
		if i+3 < len(text) && text[i:i+3] == "```" {
			// 找到对应的结束围栏
			lineEnd := strings.IndexByte(text[i+3:], '\n')
			if lineEnd < 0 {
				result.WriteString(text[i:])
				break
			}
			bodyStart := i + 3 + lineEnd + 1
			endFence := strings.Index(text[bodyStart:], "```")
			if endFence >= 0 {
				body := text[bodyStart : bodyStart+endFence]
				fenceEnd := bodyStart + endFence + 3
				// 跳过围栏后的换行
				if fenceEnd < len(text) && text[fenceEnd] == '\n' {
					fenceEnd++
				}
				if isInteractiveJSON(strings.TrimSpace(body)) {
					i = fenceEnd
					continue
				}
			}
			result.WriteByte(text[i])
			i++
			continue
		}

		// 检查裸 JSON
		if text[i] == '{' {
			jsonStr, end := extractSingleJSON(text, i)
			if jsonStr != "" && isInteractiveJSON(jsonStr) {
				i = end
				// 跳过 JSON 后面的换行
				for i < len(text) && (text[i] == '\n' || text[i] == '\r') {
					i++
				}
				continue
			}
		}

		result.WriteByte(text[i])
		i++
	}
	return result.String()
}

// extractSingleJSON 从 text[start] 开始提取一个完整的 JSON 对象
func extractSingleJSON(text string, start int) (string, int) {
	depth := 0
	inString := false
	escape := false
	for j := start; j < len(text); j++ {
		ch := text[j]
		if escape {
			escape = false
			continue
		}
		if ch == '\\' && inString {
			escape = true
			continue
		}
		if ch == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		if ch == '{' {
			depth++
		} else if ch == '}' {
			depth--
			if depth == 0 {
				return text[start : j+1], j + 1
			}
		}
	}
	return "", start
}

// isInteractiveJSON 检查 JSON 字符串是否为 choice/input 交互块
func isInteractiveJSON(jsonStr string) bool {
	var obj map[string]interface{}
	if err := json.Unmarshal([]byte(jsonStr), &obj); err != nil {
		return false
	}
	t, _ := obj["type"].(string)
	return t == "choice" || t == "input"
}

// flushPendingTools 将聚合的工具调用输出为简洁摘要行。
// 例如：连续 3 次 Bash + 1 次 Read → "> 🔧 Bash ×3 · Read"
func (s *feishuStreamSender) flushPendingTools() {
	if len(s.pendingTools) == 0 {
		return
	}

	// 统计各工具出现次数（保持原始顺序）
	type toolCount struct {
		name  string
		count int
	}
	var ordered []toolCount
	seen := make(map[string]int) // name -> index in ordered
	for _, name := range s.pendingTools {
		if idx, ok := seen[name]; ok {
			ordered[idx].count++
		} else {
			seen[name] = len(ordered)
			ordered = append(ordered, toolCount{name: name, count: 1})
		}
	}

	// 格式化：Bash ×3 · Read · Skill
	var parts []string
	for _, tc := range ordered {
		if tc.count > 1 {
			parts = append(parts, fmt.Sprintf("%s ×%d", tc.name, tc.count))
		} else {
			parts = append(parts, tc.name)
		}
	}

	summary := strings.Join(parts, " · ")
	s.pendingAppend += "> 🔧 " + summary + "\n"
	s.pendingTools = nil
	s.toolGroupEmitted++
}

// SetDoneCallback 设置流式完成后的交互元素构建回调
func (s *feishuStreamSender) SetDoneCallback(cb func() []map[string]interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.doneCallback = cb
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
		if s.pendingAppend == "" {
			return nil
		}
		if err := s.initCard(); err != nil {
			return err
		}
		s.deleteAck()
	}

	s.flushTimer = nil
	s.pendingFlush = false

	if s.pendingAppend == "" && !s.done {
		return nil
	}

	token, err := GetTenantToken(s.appID, s.appSecret)
	if err != nil {
		return err
	}

	// 严格前缀扩展：新内容 = 上次已确认的内容 + 本次新增
	content := s.lastFlushed + s.pendingAppend
	if content == "" {
		content = "✅ 完成"
	}

	s.sequence++

	if s.done {
		// 完成后：用完整卡片 JSON 替换（关闭 streaming_mode + 最终内容），
		// 这样可以移除流式过程中输出的 choice JSON 等临时内容。
		if err := s.replaceCardFinal(token, content); err != nil {
			slog.Warn("[feishu-stream] replaceCardFinal failed, fallback to updateElement", "err", err)
			// 回退到普通更新
			if err2 := s.updateElement(token, content, s.sequence); err2 != nil {
				return err2
			}
		}
	} else {
		if err := s.updateElement(token, content, s.sequence); err != nil {
			return err
		}
	}

	// flush 成功，合并 pendingAppend 到 lastFlushed
	s.lastFlushed = content
	s.pendingAppend = ""
	return nil
}

// replaceCardFinal 用完整卡片 JSON 替换当前卡片（关闭流式模式 + 最终内容 + 交互元素）。
// 使用 PUT /cardkit/v1/cards/:card_id 整体替换卡片 JSON。
func (s *feishuStreamSender) replaceCardFinal(token, content string) error {
	// 替换 @名字 为飞书真实 @mention 格式
	if len(s.chatMembers) > 0 {
		content = replaceAtMentions(content, s.chatMembers)
	}

	var elements []map[string]interface{}

	// 如果有思考内容，用折叠面板展示（默认折叠）
	thinkingText := strings.TrimSpace(s.thinkingContent.String())
	if thinkingText != "" {
		// 从主内容中移除流式阶段的思考提示行
		content = strings.Replace(content, "> 💭 正在分析问题...\n\n", "", 1)
		content = strings.TrimLeft(content, "\n")

		// 截断过长的思考内容（飞书卡片有大小限制）
		if len(thinkingText) > 3000 {
			thinkingText = thinkingText[:3000] + "\n\n... (思考内容过长，已截断)"
		}

		elements = append(elements, map[string]interface{}{
			"tag":        "collapsible_panel",
			"element_id": "thinking_panel",
			"expanded":   false,
			"header": map[string]interface{}{
				"title": map[string]interface{}{
					"tag":     "plain_text",
					"content": "💭 思考过程",
				},
				"vertical_align": "center",
				"icon": map[string]interface{}{
					"tag":   "standard_icon",
					"token": "down-small-ccm_outlined",
					"size":  "16px 16px",
				},
				"icon_position":       "follow_text",
				"icon_expanded_angle": -180,
			},
			"border": map[string]interface{}{
				"color":         "grey",
				"corner_radius": "5px",
			},
			"vertical_spacing": "4px",
			"padding":          "8px",
			"elements": []map[string]interface{}{
				{
					"tag":     "markdown",
					"content": thinkingText,
				},
			},
		})
	}

	// 主内容
	elements = append(elements, map[string]interface{}{
		"tag":        "markdown",
		"element_id": "streaming_md",
		"content":    content,
	})

	// 追加交互元素（选择按钮 + 反馈按钮）
	if s.doneCallback != nil {
		interactiveElements := s.doneCallback()
		elements = append(elements, interactiveElements...)
	}

	card := map[string]interface{}{
		"schema": "2.0",
		"config": map[string]interface{}{
			"streaming_mode": false,
			"update_multi":   true,
			"width_mode":     "default",
		},
		"header": map[string]interface{}{
			"title":    map[string]interface{}{"tag": "plain_text", "content": s.cardTitle},
			"template": "blue",
		},
		"body": map[string]interface{}{
			"elements": elements,
		},
	}
	cardJSON, _ := json.Marshal(card)

	body, _ := json.Marshal(map[string]string{
		"type": "card_json",
		"data": string(cardJSON),
	})

	url := fmt.Sprintf("https://open.feishu.cn/open-apis/cardkit/v1/cards/%s", s.cardID)
	return doHTTPRequest("PUT", url, token, body)
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
				"content": "",
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
