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

	// 工具调用聚合
	allToolNames      []string // 全部工具名（用于最终卡片折叠面板）
	currentGroupTools []string // 当前活跃工具组的工具名（用于流式摘要行）
	// toolLineFlushed 标记当前工具摘要行是否已写入 lastFlushed
	toolLineFlushed bool
	// currentToolLine 当前的工具摘要行文本（不含换行），用于覆盖式更新
	currentToolLine string
	// textStarted 标记正文是否已开始输出。一旦正文开始，
	// 后续工具调用只静默记录到 allToolNames，不在流式卡片中显示
	textStarted bool

	pendingFlush  bool
	flushTimer    *time.Timer
	flushInterval time.Duration

	// heartbeatTimer：工具执行期间如果长时间没有新事件，
	// 自动追加进度指示器让用户知道 Agent 还在工作
	heartbeatTimer *time.Timer
	heartbeatCount int
	heartbeatSuffix string // 当前心跳后缀（用于覆盖式更新）

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

// SendAck 立即发送确认提示文本，减少用户等待感知
func (s *feishuStreamSender) SendAck() {
	s.SendAckWithText("💭 正在思考...")
}

// SendAckWithText 发送自定义确认提示文本
func (s *feishuStreamSender) SendAckWithText(text string) {
	token, err := GetTenantToken(s.appID, s.appSecret)
	if err != nil {
		return
	}
	msgID, err := s.sendTextMessage(token, text)
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
// - tool：覆盖式更新一行聚合摘要（如 "> 🔧 执行中：Bash ×3 · Read"）
// - text：直接追加正文
// 所有内容严格前缀扩展（相对于 lastFlushed），工具行在 pendingAppend 中可覆盖。
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
		if payload != "" {
			s.thinkingContent.WriteString(payload)
		}

	case KindTool:
		toolName := strings.TrimPrefix(payload, "🔧 ")
		toolName = strings.TrimSpace(toolName)
		if toolName == "" {
			toolName = "工具"
		}
		s.allToolNames = append(s.allToolNames, toolName)

		// 正文已开始输出后，后续工具调用只静默记录，不在卡片中显示。
		// 最终卡片的工具折叠面板会完整展示所有工具调用。
		if s.textStarted {
			s.currentPhase = "tool"
			break
		}

		if s.currentPhase == "text" {
			s.freezeCurrentToolLine()
		}
		s.currentPhase = "tool"
		s.currentGroupTools = append(s.currentGroupTools, toolName)
		s.heartbeatSuffix = ""
		s.updateToolSummaryLine()

	case KindText:
		if payload != "" {
			s.fullTextReply.WriteString(payload)

			if s.currentPhase != "text" {
				s.freezeCurrentToolLine()
				if s.thinkingEmitted || len(s.allToolNames) > 0 {
					s.pendingAppend += "\n---\n\n"
				}
				s.textStarted = true
			}
			s.currentPhase = "text"
			s.pendingAppend += payload
		}
	}

	s.resetHeartbeat()

	if done {
		s.freezeCurrentToolLine()
		s.done = true
		if s.flushTimer != nil {
			s.flushTimer.Stop()
			s.flushTimer = nil
		}
		s.stopHeartbeat()
		s.cleanInteractiveJSONFromContent()

		err := s.flushLocked()
		if err != nil {
			slog.Warn("[feishu-stream] done flush error", "err", err)
		}
		return err
	}

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

// updateToolSummaryLine 重新计算工具摘要行并覆盖 pendingAppend 中的旧摘要行。
// 如果旧摘要行已经被 flush 到飞书（toolLineFlushed=true），则只能追加新行。
func (s *feishuStreamSender) updateToolSummaryLine() {
	summary := s.buildToolSummary(s.currentGroupTools)
	newLine := "> 🔧 执行中：" + summary
	if s.heartbeatSuffix != "" {
		newLine += " " + s.heartbeatSuffix
	}

	if s.toolLineFlushed {
		s.pendingAppend += "\n" + newLine + "\n"
		s.toolLineFlushed = false
	} else if s.currentToolLine != "" {
		oldLine := s.currentToolLine
		idx := strings.LastIndex(s.pendingAppend, oldLine)
		if idx >= 0 {
			s.pendingAppend = s.pendingAppend[:idx] + newLine + s.pendingAppend[idx+len(oldLine):]
		} else {
			s.pendingAppend += newLine + "\n"
		}
	} else {
		s.pendingAppend += newLine + "\n"
	}
	s.currentToolLine = newLine
}

// freezeCurrentToolLine 冻结当前工具摘要行（不再覆盖），为进入 text 或新 tool 组做准备
func (s *feishuStreamSender) freezeCurrentToolLine() {
	if s.currentToolLine == "" {
		return
	}
	// 将"执行中"替换为"✅"
	frozenLine := strings.Replace(s.currentToolLine, "执行中：", "✅ ", 1)
	// 移除心跳后缀
	for _, suffix := range []string{" ⏳.", " ⏳..", " ⏳...", " ⏳"} {
		frozenLine = strings.TrimSuffix(frozenLine, suffix)
	}
	if s.currentToolLine != frozenLine {
		idx := strings.LastIndex(s.pendingAppend, s.currentToolLine)
		if idx >= 0 {
			s.pendingAppend = s.pendingAppend[:idx] + frozenLine + s.pendingAppend[idx+len(s.currentToolLine):]
		}
	}
	s.currentToolLine = ""
	s.currentGroupTools = nil
	s.toolLineFlushed = false
}

// buildToolSummary 构建工具摘要文本（如 "Bash ×3 · Read · Grep"）
func (s *feishuStreamSender) buildToolSummary(tools []string) string {
	type toolCount struct {
		name  string
		count int
	}
	var ordered []toolCount
	seen := make(map[string]int)
	for _, name := range tools {
		if idx, ok := seen[name]; ok {
			ordered[idx].count++
		} else {
			seen[name] = len(ordered)
			ordered = append(ordered, toolCount{name: name, count: 1})
		}
	}
	var parts []string
	for _, tc := range ordered {
		if tc.count > 1 {
			parts = append(parts, fmt.Sprintf("%s ×%d", tc.name, tc.count))
		} else {
			parts = append(parts, tc.name)
		}
	}
	return strings.Join(parts, " · ")
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

// isInteractiveJSON 检查 JSON 字符串是否为 choice/input/checker 交互块
func isInteractiveJSON(jsonStr string) bool {
	var obj map[string]interface{}
	if err := json.Unmarshal([]byte(jsonStr), &obj); err != nil {
		return false
	}
	t, _ := obj["type"].(string)
	return t == "choice" || t == "input" || t == "checker"
}

// flushLocked 后更新 toolLineFlushed 标记
func (s *feishuStreamSender) markToolLineFlushed() {
	if s.currentToolLine != "" && s.pendingAppend == "" {
		s.toolLineFlushed = true
	}
}

// resetHeartbeat 重置心跳定时器。
// 如果 15 秒内没有新事件（工具执行时间较长），更新工具摘要行的后缀指示器，
// 而非追加新行，避免心跳消息堆叠。
func (s *feishuStreamSender) resetHeartbeat() {
	if s.heartbeatTimer != nil {
		s.heartbeatTimer.Stop()
	}
	if s.done || s.cardID == "" {
		return
	}
	s.heartbeatTimer = time.AfterFunc(15*time.Second, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.done {
			return
		}
		s.heartbeatCount++
		dots := strings.Repeat(".", (s.heartbeatCount%3)+1)

		if s.currentPhase == "tool" && s.currentToolLine != "" && !s.toolLineFlushed && !s.textStarted {
			// 工具阶段（正文未开始）：更新工具行的后缀
			oldLine := s.currentToolLine
			s.heartbeatSuffix = "⏳" + dots
			newLine := strings.TrimSuffix(oldLine, " "+s.heartbeatSuffix)
			for _, sfx := range []string{" ⏳.", " ⏳..", " ⏳...", " ⏳"} {
				newLine = strings.TrimSuffix(newLine, sfx)
			}
			newLine += " " + s.heartbeatSuffix
			idx := strings.LastIndex(s.pendingAppend, oldLine)
			if idx >= 0 {
				s.pendingAppend = s.pendingAppend[:idx] + newLine + s.pendingAppend[idx+len(oldLine):]
				s.currentToolLine = newLine
			}
		} else if !s.textStarted {
			// 非工具阶段（正文未开始）：追加独立的进度行
			s.pendingAppend += fmt.Sprintf("> ⏳ 仍在处理中%s\n", dots)
		}
		// 正文已开始后不再追加任何进度指示（避免污染正文）

		if err := s.flushLocked(); err != nil {
			slog.Warn("[feishu-stream] heartbeat flush error", "err", err)
		}
		s.resetHeartbeat()
	})
}

func (s *feishuStreamSender) stopHeartbeat() {
	if s.heartbeatTimer != nil {
		s.heartbeatTimer.Stop()
		s.heartbeatTimer = nil
	}
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
		// 清理流式标记行（🔧 工具/💭 思考/⏳ 心跳），最终卡片用折叠面板展示
		content = removeToolMarkerLines(content)
		if err := s.replaceCardFinal(token, content); err != nil {
			slog.Warn("[feishu-stream] replaceCardFinal failed, fallback", "err", err)
			cleanContent := removeInteractiveJSON(content)
			cleanContent = removeSuggestionLines(cleanContent)
			if err2 := s.updateElement(token, cleanContent, s.sequence); err2 != nil {
				slog.Warn("[feishu-stream] updateElement fallback also failed", "err", err2)
			}
			// replaceCardFinal 失败后，单独发送一条交互卡片消息
			if s.doneCallback != nil {
				s.sendInteractiveCardSeparately(token)
			}
		}
	} else {
		// 流式过程中也实时过滤交互 JSON（避免用户看到原始 JSON）
		displayContent := removeInteractiveJSON(content)
		displayContent = removeSuggestionLines(displayContent)
		if err := s.updateElement(token, displayContent, s.sequence); err != nil {
			return err
		}
	}

	// flush 成功，合并 pendingAppend 到 lastFlushed
	// 注意：lastFlushed 保留原始内容（包含 JSON），因为 fullTextReply 和 cleanInteractiveJSONFromContent 需要完整内容
	s.lastFlushed = content
	s.pendingAppend = ""
	s.markToolLineFlushed()
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

	// 如果有工具调用，用折叠面板展示（默认折叠）
	if len(s.allToolNames) > 0 {
		toolSummary := s.buildToolSummary(s.allToolNames)
		toolTitle := fmt.Sprintf("🔧 执行了 %d 次工具调用", len(s.allToolNames))

		elements = append(elements, map[string]interface{}{
			"tag":        "collapsible_panel",
			"element_id": "tool_panel",
			"expanded":   false,
			"header": map[string]interface{}{
				"title": map[string]interface{}{
					"tag":     "plain_text",
					"content": toolTitle,
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
					"content": toolSummary,
				},
			},
		})
	}

	// 从正文中剥离裸 JSON 交互块（choice/input/checker），避免在卡片中显示原始 JSON
	beforeLen := len(content)
	content = removeInteractiveJSON(content)
	afterLen := len(content)
	if beforeLen != afterLen {
		slog.Info("[feishu-stream] replaceCardFinal: stripped interactive JSON",
			"beforeLen", beforeLen, "afterLen", afterLen, "removed", beforeLen-afterLen)
	} else {
		slog.Info("[feishu-stream] replaceCardFinal: no interactive JSON found to strip",
			"contentLen", len(content), "contentPreview", truncateStr(content, 200))
	}
	// 移除 ~?~ 建议问题行（这些是 Claude 的后续问题提示，在飞书卡片中无意义）
	content = removeSuggestionLines(content)
	// 移除流式阶段的工具调用标记行（> 🔧 Bash ×3 · Read 等）
	content = removeToolMarkerLines(content)
	// 清理连续空行
	content = collapseBlankLines(content)

	// 主内容
	elements = append(elements, map[string]interface{}{
		"tag":        "markdown",
		"element_id": "streaming_md",
		"content":    content,
	})

	// 追加交互元素（选择按钮 + 反馈按钮）
	if s.doneCallback != nil {
		interactiveElements := s.doneCallback()
		slog.Info("[feishu-stream] replaceCardFinal: appending interactive elements", "count", len(interactiveElements))
		elements = append(elements, interactiveElements...)
	}

	card := BuildPrettyCard(s.cardTitle, elements, false)
	cardJSON, _ := json.Marshal(card)

	slog.Info("[feishu-stream] replaceCardFinal sending card",
		"cardID", s.cardID,
		"elementsCount", len(elements),
		"cardJSONLen", len(cardJSON),
		"sequence", s.sequence)

	// PUT /cardkit/v1/cards/:card_id 需要 card={type, data} + sequence
	body, _ := json.Marshal(map[string]interface{}{
		"card": map[string]string{
			"type": "card_json",
			"data": string(cardJSON),
		},
		"sequence": s.sequence,
	})

	url := fmt.Sprintf("https://open.feishu.cn/open-apis/cardkit/v1/cards/%s", s.cardID)

	req, _ := http.NewRequest("PUT", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("[feishu-stream] replaceCardFinal HTTP error", "err", err)
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	slog.Info("[feishu-stream] replaceCardFinal response",
		"cardID", s.cardID, "status", resp.StatusCode,
		"resp", string(respBody))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("replaceCardFinal HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	if json.Unmarshal(respBody, &result) == nil && result.Code != 0 {
		return fmt.Errorf("replaceCardFinal code=%d: %s", result.Code, result.Msg)
	}
	return nil
}

// sendInteractiveCardSeparately 在 replaceCardFinal 失败时，单独发送一条交互卡片消息。
// 使用 CardKit 流程：创建卡片实体 → 引用 card_id 发送消息。
func (s *feishuStreamSender) sendInteractiveCardSeparately(token string) {
	if s.doneCallback == nil {
		return
	}
	interactiveElements := s.doneCallback()
	if len(interactiveElements) == 0 {
		return
	}

	card := map[string]interface{}{
		"schema": "2.0",
		"config": map[string]interface{}{
			"update_multi": true,
			"width_mode":   "default",
		},
		"body": map[string]interface{}{
			"elements": interactiveElements,
		},
	}
	cardJSON, _ := json.Marshal(card)

	// 创建卡片实体
	createBody, _ := json.Marshal(map[string]string{
		"type": "card_json",
		"data": string(cardJSON),
	})
	createReq, _ := http.NewRequest("POST", "https://open.feishu.cn/open-apis/cardkit/v1/cards", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createResp, err := http.DefaultClient.Do(createReq)
	if err != nil {
		slog.Warn("[feishu-stream] sendInteractiveCardSeparately create card error", "err", err)
		return
	}
	defer createResp.Body.Close()
	createRespBody, _ := io.ReadAll(createResp.Body)
	var createResult struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			CardID string `json:"card_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(createRespBody, &createResult); err != nil || createResult.Code != 0 {
		slog.Warn("[feishu-stream] sendInteractiveCardSeparately create card failed",
			"resp", string(createRespBody), "err", err)
		return
	}

	// 引用 card_id 发送消息
	msgContent, _ := json.Marshal(map[string]interface{}{
		"type": "card",
		"data": map[string]string{"card_id": createResult.Data.CardID},
	})

	idType := "chat_id"
	if strings.HasPrefix(s.chatID, "ou_") {
		idType = "open_id"
	}
	msgBody, _ := json.Marshal(map[string]string{
		"receive_id": s.chatID,
		"msg_type":   "interactive",
		"content":    string(msgContent),
	})
	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=%s", idType)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(msgBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("[feishu-stream] sendInteractiveCardSeparately send error", "err", err)
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	slog.Info("[feishu-stream] sendInteractiveCardSeparately response",
		"cardID", createResult.Data.CardID, "status", resp.StatusCode, "resp", string(respBody))
}

// ── 飞书 API 调用 ────────────────────────────────────────────

func (s *feishuStreamSender) buildCardJSON() string {
	elements := []map[string]interface{}{
		{
			"tag":        "markdown",
			"element_id": "streaming_md",
			"content":    "思考中...",
		},
	}
	card := BuildPrettyCard(s.cardTitle, elements, true)
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

func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// removeToolMarkerLines 移除流式阶段的所有标记行：
// - "> 🔧 ..." 工具调用（含 "执行中：" 和 "✅" 变体）
// - "> 💭 ..." 思考提示
// - "> ⏳ ..." 心跳指示
// - "---" 分隔线（流式阶段用于分隔工具区和正文区）
func removeToolMarkerLines(text string) string {
	lines := strings.Split(text, "\n")
	var out []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "> 🔧") || strings.HasPrefix(trimmed, "> \xf0\x9f\x94\xa7") {
			continue
		}
		if strings.HasPrefix(trimmed, "> 💭") || strings.HasPrefix(trimmed, "> \xf0\x9f\x92\xad") {
			continue
		}
		if strings.HasPrefix(trimmed, "> ⏳") || strings.HasPrefix(trimmed, "> \xe2\x8f\xb3") {
			continue
		}
		if trimmed == "---" {
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

// collapseBlankLines 将连续 3 行以上的空行缩减为 2 行
func collapseBlankLines(text string) string {
	lines := strings.Split(text, "\n")
	var out []string
	blankCount := 0
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			blankCount++
			if blankCount <= 2 {
				out = append(out, line)
			}
		} else {
			blankCount = 0
			out = append(out, line)
		}
	}
	return strings.TrimRight(strings.Join(out, "\n"), "\n \t")
}

// removeSuggestionLines 移除 ~?~ 开头的建议问题行
func removeSuggestionLines(text string) string {
	lines := strings.Split(text, "\n")
	var out []string
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "~?~") {
			continue
		}
		out = append(out, line)
	}
	return strings.TrimRight(strings.Join(out, "\n"), "\n \t")
}

// ── 卡片发送工具 ──────────────────────────────────────────────

// SendCardToChat 将完整的卡片 JSON 发送到指定群聊（先创建卡片实体，再发消息引用）。
func SendCardToChat(token, chatID, cardDataJSON string) error {
	// 1. 创建卡片实体
	createBody, _ := json.Marshal(map[string]string{
		"type": "card_json",
		"data": cardDataJSON,
	})
	createReq, _ := http.NewRequest("POST", "https://open.feishu.cn/open-apis/cardkit/v1/cards", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createResp, err := http.DefaultClient.Do(createReq)
	if err != nil {
		return fmt.Errorf("create card HTTP error: %w", err)
	}
	defer createResp.Body.Close()
	createRespBody, _ := io.ReadAll(createResp.Body)
	var createResult struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			CardID string `json:"card_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(createRespBody, &createResult); err != nil || createResult.Code != 0 {
		return fmt.Errorf("create card failed: code=%d msg=%s resp=%s", createResult.Code, createResult.Msg, string(createRespBody))
	}

	// 2. 发送引用 card_id 的消息
	msgContent, _ := json.Marshal(map[string]interface{}{
		"type": "card",
		"data": map[string]string{"card_id": createResult.Data.CardID},
	})
	idType := "chat_id"
	if strings.HasPrefix(chatID, "ou_") {
		idType = "open_id"
	}
	msgBody, _ := json.Marshal(map[string]string{
		"receive_id": chatID,
		"msg_type":   "interactive",
		"content":    string(msgContent),
	})
	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=%s", idType)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(msgBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("send message HTTP error: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var sendResult struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	if json.Unmarshal(respBody, &sendResult) == nil && sendResult.Code != 0 {
		return fmt.Errorf("send message failed: code=%d msg=%s", sendResult.Code, sendResult.Msg)
	}
	return nil
}

// ── 精美卡片构建工具 ─────────────────────────────────────────

// BuildPrettyCard 构建精美排版的飞书卡片 JSON map。
// streaming 为 true 时生成流式初始卡片（带 streaming_mode），false 为最终卡片。
func BuildPrettyCard(title string, elements []map[string]interface{}, streaming bool) map[string]interface{} {
	config := map[string]interface{}{
		"update_multi": true,
		"width_mode":   "fill",
	}
	if streaming {
		config["streaming_mode"] = true
		config["streaming_config"] = map[string]interface{}{
			"print_frequency_ms": map[string]interface{}{"default": 50},
			"print_step":         map[string]interface{}{"default": 2},
			"print_strategy":     "fast",
		}
		config["summary"] = map[string]interface{}{"content": ""}
	} else {
		config["streaming_mode"] = false
	}

	header := map[string]interface{}{
		"title": map[string]interface{}{
			"tag":     "plain_text",
			"content": title,
		},
		"subtitle": map[string]interface{}{
			"tag":     "plain_text",
			"content": "灵犀 AI Agent",
		},
		"ud_icon": map[string]interface{}{
			"tag":   "standard_icon",
			"token": "ai-colorful",
		},
		"template": "indigo",
	}

	return map[string]interface{}{
		"schema": "2.0",
		"config": config,
		"header": header,
		"body": map[string]interface{}{
			"elements": elements,
		},
	}
}

// buildPrettyCardWithContent 从 Markdown 文本内容构建完整的精美卡片 JSON（用于非流式场景）。
// agentName 用于标题，content 是 AI 回复的 Markdown 正文。
func buildPrettyCardWithContent(agentName, content string) map[string]interface{} {
	content = removeSuggestionLines(content)
	content = removeInteractiveJSON(content)

	var elements []map[string]interface{}
	elements = append(elements, map[string]interface{}{
		"tag":     "markdown",
		"content": content,
	})

	title := agentName
	if title == "" {
		title = "灵犀回复"
	}
	return BuildPrettyCard(title, elements, false)
}
