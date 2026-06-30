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
	"sync"

	"lingxi-agent/db"

	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher/callback"
)

// ── 卡片交互回调全局注册表 ────────────────────────────────────

// cardCallbackRegistry 存储 cardID -> 回调上下文，用于路由卡片按钮点击事件
var (
	cardCallbackMu sync.RWMutex
	cardCallbacks  = make(map[string]*CardCallbackCtx)
)

// CardCallbackCtx 保存一张交互卡片的上下文信息
type CardCallbackCtx struct {
	SessionID  int64  // 对应的灵犀会话 ID
	MessageID  int64  // 助手消息在 DB 中的 ID（用于写入 feedback）
	CardID     string // 飞书卡片实体 ID
	ChatID     string // 飞书群 ID（用于发送后续消息）
	MsgID      string // 飞书原始消息 ID（用于回复）
	AppID      string
	AppSecret  string
	AgentID    int64
	Connector  *FeishuConnector // 指向飞书连接器（用于 Dispatch 后续消息）

	// choices 保存 AI 输出的选择项（key -> label），用于按钮回调时还原用户选择
	Choices map[string]string
}

// RegisterCardCallback 注册卡片回调上下文
func RegisterCardCallback(cardID string, ctx *CardCallbackCtx) {
	cardCallbackMu.Lock()
	defer cardCallbackMu.Unlock()
	cardCallbacks[cardID] = ctx
}

// UnregisterCardCallback 移除卡片回调（可选，防止内存泄漏可定期清理）
func UnregisterCardCallback(cardID string) {
	cardCallbackMu.Lock()
	defer cardCallbackMu.Unlock()
	delete(cardCallbacks, cardID)
}

// lookupCardCallback 查找卡片回调上下文
func lookupCardCallback(cardID string) *CardCallbackCtx {
	cardCallbackMu.RLock()
	defer cardCallbackMu.RUnlock()
	return cardCallbacks[cardID]
}

// ── OnP2CardActionTrigger 回调处理 ────────────────────────────

// HandleCardAction 处理飞书卡片按钮点击回调。
// 通过 action.value 中的 type 字段区分不同交互类型。
func HandleCardAction(ctx context.Context, event *callback.CardActionTriggerEvent) (*callback.CardActionTriggerResponse, error) {
	if event == nil || event.Event == nil || event.Event.Action == nil {
		return nil, nil
	}

	action := event.Event.Action
	value := action.Value

	// 从 action.value 中取出卡片 ID 和交互类型
	cardID, _ := value["card_id"].(string)
	actionType, _ := value["type"].(string)

	slog.Info("[feishu-interactive] card action received",
		"card_id", cardID,
		"action_type", actionType,
		"tag", action.Tag,
		"value", value)

	cbCtx := lookupCardCallback(cardID)
	if cbCtx == nil {
		slog.Warn("[feishu-interactive] no callback context for card", "card_id", cardID)
		return &callback.CardActionTriggerResponse{
			Toast: &callback.Toast{Type: "info", Content: "操作已过期，请重新提问"},
		}, nil
	}

	switch actionType {
	case "feedback":
		return handleFeedback(ctx, cbCtx, value)
	case "choice":
		return handleChoice(ctx, cbCtx, value)
	case "input_submit":
		return handleInputSubmit(ctx, cbCtx, event)
	case "checker":
		return handleChecker(ctx, cbCtx, value)
	default:
		slog.Warn("[feishu-interactive] unknown action type", "type", actionType)
		return nil, nil
	}
}

// handleFeedback 处理 👍👎 反馈
func handleFeedback(ctx context.Context, cbCtx *CardCallbackCtx, value map[string]interface{}) (*callback.CardActionTriggerResponse, error) {
	feedback, _ := value["feedback"].(string) // "up" 或 "down"
	if feedback != "up" && feedback != "down" {
		return nil, nil
	}

	// 写入 DB
	if cbCtx.MessageID > 0 {
		_, err := db.DB.Exec(`UPDATE messages SET feedback=? WHERE id=?`, feedback, cbCtx.MessageID)
		if err != nil {
			slog.Warn("[feishu-interactive] set feedback error", "msg_id", cbCtx.MessageID, "err", err)
		} else {
			slog.Info("[feishu-interactive] feedback saved", "msg_id", cbCtx.MessageID, "feedback", feedback)
		}
	}

	emoji := "👍"
	if feedback == "down" {
		emoji = "👎"
	}
	return &callback.CardActionTriggerResponse{
		Toast: &callback.Toast{Type: "success", Content: fmt.Sprintf("感谢反馈 %s", emoji)},
	}, nil
}

// handleChoice 处理 AskQuestion 选择
func handleChoice(ctx context.Context, cbCtx *CardCallbackCtx, value map[string]interface{}) (*callback.CardActionTriggerResponse, error) {
	choiceKey, _ := value["choice_key"].(string)
	choiceLabel, _ := value["choice_label"].(string)

	if choiceLabel == "" && cbCtx.Choices != nil {
		choiceLabel = cbCtx.Choices[choiceKey]
	}
	if choiceLabel == "" {
		choiceLabel = choiceKey
	}

	slog.Info("[feishu-interactive] choice selected", "key", choiceKey, "label", choiceLabel)

	// 将选择结果作为新的用户消息发送给 AI 继续对话
	if cbCtx.Connector != nil {
		choiceText := fmt.Sprintf("[选择结果] %s", choiceLabel)
		replyFunc := func(reply string) error {
			return cbCtx.Connector.sendReply(ctx, cbCtx.MsgID, cbCtx.ChatID, reply)
		}

		dispatchMsg := IMMessage{
			Platform:       "feishu",
			UserID:         "card_interaction",
			ConversationID: cbCtx.ChatID,
			Text:           choiceText,
			AgentID:        cbCtx.AgentID,
			BaseCfg:        cbCtx.Connector.cfg.BaseConfig,
			ReplyFunc:      replyFunc,
		}

		// 如果启用流式，也注入流式回调
		if cbCtx.Connector.cfg.StreamingEnabled {
			sender := newFeishuStreamSender(cbCtx.AppID, cbCtx.AppSecret, cbCtx.ChatID, "", cbCtx.Connector.cfg)
			sender.SendAck()
			dispatchMsg.StreamCallback = sender.OnStreamCallback
		}

		Dispatch(dispatchMsg)
	}

	return &callback.CardActionTriggerResponse{
		Toast: &callback.Toast{Type: "success", Content: fmt.Sprintf("已选择：%s", choiceLabel)},
	}, nil
}

// handleInputSubmit 处理表单提交（输入框 + 提交按钮）
func handleInputSubmit(ctx context.Context, cbCtx *CardCallbackCtx, event *callback.CardActionTriggerEvent) (*callback.CardActionTriggerResponse, error) {
	action := event.Event.Action
	formValue := action.FormValue

	var sb strings.Builder
	sb.WriteString("[信息回复]\n")
	for k, v := range formValue {
		sb.WriteString(fmt.Sprintf("%s: %v\n", k, v))
	}
	inputText := strings.TrimSpace(sb.String())

	slog.Info("[feishu-interactive] input submitted", "form_value", formValue)

	if cbCtx.Connector != nil {
		replyFunc := func(reply string) error {
			return cbCtx.Connector.sendReply(ctx, cbCtx.MsgID, cbCtx.ChatID, reply)
		}
		dispatchMsg := IMMessage{
			Platform:       "feishu",
			UserID:         "card_interaction",
			ConversationID: cbCtx.ChatID,
			Text:           inputText,
			AgentID:        cbCtx.AgentID,
			BaseCfg:        cbCtx.Connector.cfg.BaseConfig,
			ReplyFunc:      replyFunc,
		}
		if cbCtx.Connector.cfg.StreamingEnabled {
			sender := newFeishuStreamSender(cbCtx.AppID, cbCtx.AppSecret, cbCtx.ChatID, "", cbCtx.Connector.cfg)
			sender.SendAck()
			dispatchMsg.StreamCallback = sender.OnStreamCallback
		}
		Dispatch(dispatchMsg)
	}

	return &callback.CardActionTriggerResponse{
		Toast: &callback.Toast{Type: "success", Content: "已提交"},
	}, nil
}

// handleChecker 处理勾选器交互（任务勾选/取消）
func handleChecker(ctx context.Context, cbCtx *CardCallbackCtx, value map[string]interface{}) (*callback.CardActionTriggerResponse, error) {
	itemKey, _ := value["item_key"].(string)
	itemLabel, _ := value["item_label"].(string)
	// checked 状态从 action 的 checked 字段获取（布尔值）
	checked, _ := value["checked"].(bool)

	status := "已完成"
	if !checked {
		status = "未完成"
	}

	slog.Info("[feishu-interactive] checker toggled",
		"item_key", itemKey,
		"item_label", itemLabel,
		"checked", checked)

	// 将勾选状态变更作为用户消息发给 AI
	if cbCtx.Connector != nil {
		checkerText := fmt.Sprintf("[任务状态更新] %s: %s", itemLabel, status)
		replyFunc := func(reply string) error {
			return cbCtx.Connector.sendReply(ctx, cbCtx.MsgID, cbCtx.ChatID, reply)
		}
		dispatchMsg := IMMessage{
			Platform:       "feishu",
			UserID:         "card_interaction",
			ConversationID: cbCtx.ChatID,
			Text:           checkerText,
			AgentID:        cbCtx.AgentID,
			BaseCfg:        cbCtx.Connector.cfg.BaseConfig,
			ReplyFunc:      replyFunc,
		}
		if cbCtx.Connector.cfg.StreamingEnabled {
			sender := newFeishuStreamSender(cbCtx.AppID, cbCtx.AppSecret, cbCtx.ChatID, "", cbCtx.Connector.cfg)
			sender.SendAck()
			dispatchMsg.StreamCallback = sender.OnStreamCallback
		}
		Dispatch(dispatchMsg)
	}

	return &callback.CardActionTriggerResponse{
		Toast: &callback.Toast{Type: "success", Content: fmt.Sprintf("任务「%s」%s", itemLabel, status)},
	}, nil
}

// ── 交互卡片构建工具 ────────────────────────────────────────

// ChoiceOption 选择项
type ChoiceOption struct {
	Key   string
	Label string
}

// buildFeedbackElements 构建 👍👎 反馈按钮元素列表（JSON 2.0 column_set + button + behaviors.callback）
func buildFeedbackElements(cardID string) []map[string]interface{} {
	return []map[string]interface{}{
		{
			"tag":              "column_set",
			"element_id":       "feedback_cols",
			"flex_mode":        "flow",
			"background_style": "default",
			"horizontal_spacing": "8px",
			"margin":           "8px 0 0 0",
			"columns": []map[string]interface{}{
				{
					"tag":    "column",
					"width":  "auto",
					"weight": 1,
					"elements": []map[string]interface{}{
						{
							"tag":        "button",
							"element_id": "btn_fb_up",
							"type":       "primary",
							"size":       "small",
							"text":       map[string]interface{}{"tag": "plain_text", "content": "👍 有帮助"},
							"behaviors": []map[string]interface{}{
								{
									"type": "callback",
									"value": map[string]interface{}{
										"type":     "feedback",
										"feedback": "up",
										"card_id":  cardID,
									},
								},
							},
						},
					},
				},
				{
					"tag":    "column",
					"width":  "auto",
					"weight": 1,
					"elements": []map[string]interface{}{
						{
							"tag":        "button",
							"element_id": "btn_fb_down",
							"type":       "default",
							"size":       "small",
							"text":       map[string]interface{}{"tag": "plain_text", "content": "👎 待改进"},
							"behaviors": []map[string]interface{}{
								{
									"type": "callback",
									"value": map[string]interface{}{
										"type":     "feedback",
										"feedback": "down",
										"card_id":  cardID,
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

// buildChoiceElements 构建选择按钮元素列表（JSON 2.0 镭射按钮 + behaviors.callback）
func buildChoiceElements(cardID, title string, choices []ChoiceOption) []map[string]interface{} {
	var elements []map[string]interface{}

	// 分隔线
	elements = append(elements, map[string]interface{}{
		"tag":        "hr",
		"element_id": "choice_hr",
	})

	// 标题
	if title != "" {
		elements = append(elements, map[string]interface{}{
			"tag":        "markdown",
			"element_id": "choice_title",
			"content":    "**" + title + "**",
		})
	}

	// 选择按钮使用 column_set 水平流式排列，首个使用镭射按钮（推荐选项）
	var columns []map[string]interface{}
	for i, c := range choices {
		btnType := "default"
		if i == 0 {
			btnType = "laser" // 首选项使用镭射按钮（最醒目）
		} else if i == 1 {
			btnType = "primary" // 第二选项使用蓝色
		}
		columns = append(columns, map[string]interface{}{
			"tag":    "column",
			"width":  "auto",
			"weight": 1,
			"elements": []map[string]interface{}{
				{
					"tag":        "button",
					"element_id": fmt.Sprintf("btn_choice_%d", i),
					"type":       btnType,
					"size":       "medium",
					"text":       map[string]interface{}{"tag": "plain_text", "content": c.Label},
					"behaviors": []map[string]interface{}{
						{
							"type": "callback",
							"value": map[string]interface{}{
								"type":         "choice",
								"choice_key":   c.Key,
								"choice_label": c.Label,
								"card_id":      cardID,
							},
						},
					},
				},
			},
		})
	}
	elements = append(elements, map[string]interface{}{
		"tag":                "column_set",
		"element_id":         "choice_cols",
		"flex_mode":          "flow",
		"background_style":   "default",
		"horizontal_spacing": "8px",
		"margin":             "4px 0 0 0",
		"columns":            columns,
	})

	return elements
}

// ── Input 交互块（表单容器 + 输入框 + 提交按钮） ───────────────────

// InputField 输入字段定义
type InputField struct {
	Key         string
	Label       string
	Placeholder string
	Required    bool
}

// ParseInputBlocks 从 AI 回复文本中提取 input 交互块
func ParseInputBlocks(text string) (title string, fields []InputField) {
	jsonBlocks := extractJSONBlocks(text)
	for _, jsonStr := range jsonBlocks {
		var block struct {
			Type   string `json:"type"`
			Title  string `json:"title"`
			Fields []struct {
				Key         string `json:"key"`
				Label       string `json:"label"`
				Placeholder string `json:"placeholder"`
				Required    bool   `json:"required"`
			} `json:"fields"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &block); err != nil {
			continue
		}
		if block.Type != "input" || len(block.Fields) == 0 {
			continue
		}
		title = block.Title
		for _, f := range block.Fields {
			key := f.Key
			if key == "" {
				key = f.Label
			}
			ph := f.Placeholder
			if ph == "" {
				ph = "请输入" + f.Label
			}
			fields = append(fields, InputField{
				Key:         key,
				Label:       f.Label,
				Placeholder: ph,
				Required:    f.Required,
			})
		}
		return title, fields
	}
	return "", nil
}

// buildInputElements 构建表单容器（input + submit 按钮）元素列表
func buildInputElements(cardID, title string, fields []InputField) []map[string]interface{} {
	var formElements []map[string]interface{}

	for i, f := range fields {
		formElements = append(formElements, map[string]interface{}{
			"tag":        "input",
			"element_id": fmt.Sprintf("inp_%d", i),
			"name":       fmt.Sprintf("input_%s", f.Key),
			"required":   f.Required,
			"input_type": "text",
			"width":      "fill",
			"placeholder": map[string]interface{}{
				"tag":     "plain_text",
				"content": f.Placeholder,
			},
			"label": map[string]interface{}{
				"tag":     "plain_text",
				"content": f.Label,
			},
			"label_position": "top",
		})
	}

	// 提交和重置按钮（水平排列）
	formElements = append(formElements, map[string]interface{}{
		"tag":                "column_set",
		"flex_mode":          "none",
		"background_style":   "default",
		"horizontal_spacing": "8px",
		"margin":             "8px 0 0 0",
		"columns": []map[string]interface{}{
			{
				"tag":   "column",
				"width": "auto",
				"elements": []map[string]interface{}{
					{
						"tag":         "button",
						"type":        "primary",
						"size":        "medium",
						"text":        map[string]interface{}{"tag": "plain_text", "content": "提交"},
						"action_type": "form_submit",
						"name":        "btn_submit",
						"behaviors": []map[string]interface{}{
							{
								"type": "callback",
								"value": map[string]interface{}{
									"type":    "input_submit",
									"card_id": cardID,
								},
							},
						},
					},
				},
			},
			{
				"tag":   "column",
				"width": "auto",
				"elements": []map[string]interface{}{
					{
						"tag":         "button",
						"type":        "default",
						"size":        "medium",
						"text":        map[string]interface{}{"tag": "plain_text", "content": "重置"},
						"action_type": "form_reset",
						"name":        "btn_reset",
					},
				},
			},
		},
	})

	// 外层用 form 容器包裹
	var elements []map[string]interface{}

	elements = append(elements, map[string]interface{}{
		"tag":        "hr",
		"element_id": "input_hr",
	})

	if title != "" {
		elements = append(elements, map[string]interface{}{
			"tag":        "markdown",
			"element_id": "input_title",
			"content":    "**" + title + "**",
		})
	}

	elements = append(elements, map[string]interface{}{
		"tag":        "form",
		"element_id": "input_form",
		"name":       "form_input",
		"elements":   formElements,
	})

	return elements
}

// ── 勾选器（Checker）交互块 ───────────────────────────────────────

// CheckerItem 勾选项定义
type CheckerItem struct {
	Key   string
	Label string
	Done  bool
}

// ParseCheckerBlocks 从 AI 回复文本中提取 todo/checklist 交互块
func ParseCheckerBlocks(text string) (title string, items []CheckerItem) {
	jsonBlocks := extractJSONBlocks(text)
	for _, jsonStr := range jsonBlocks {
		var block struct {
			Type  string `json:"type"`
			Title string `json:"title"`
			Items []struct {
				Key   string `json:"key"`
				ID    string `json:"id"`
				Label string `json:"label"`
				Text  string `json:"text"`
				Done  bool   `json:"done"`
			} `json:"items"`
			Tasks []struct {
				Key   string `json:"key"`
				ID    string `json:"id"`
				Label string `json:"label"`
				Text  string `json:"text"`
				Done  bool   `json:"done"`
			} `json:"tasks"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &block); err != nil {
			continue
		}
		if block.Type != "checklist" && block.Type != "todo" && block.Type != "tasks" {
			continue
		}

		title = block.Title
		list := block.Items
		if len(list) == 0 {
			list = block.Tasks
		}
		for _, it := range list {
			key := it.Key
			if key == "" {
				key = it.ID
			}
			label := it.Label
			if label == "" {
				label = it.Text
			}
			if key == "" {
				key = label
			}
			items = append(items, CheckerItem{Key: key, Label: label, Done: it.Done})
		}
		return title, items
	}
	return "", nil
}

// buildCheckerElements 构建勾选器元素列表（JSON 2.0 checker + behaviors.callback）
func buildCheckerElements(cardID, title string, items []CheckerItem) []map[string]interface{} {
	var elements []map[string]interface{}

	elements = append(elements, map[string]interface{}{
		"tag":        "hr",
		"element_id": "checker_hr",
	})

	if title != "" {
		elements = append(elements, map[string]interface{}{
			"tag":        "markdown",
			"element_id": "checker_title",
			"content":    "**📋 " + title + "**",
		})
	}

	for i, it := range items {
		elements = append(elements, map[string]interface{}{
			"tag":        "checker",
			"element_id": fmt.Sprintf("chk_%d", i),
			"name":       fmt.Sprintf("check_%s", it.Key),
			"checked":    it.Done,
			"text": map[string]interface{}{
				"tag":     "lark_md",
				"content": it.Label,
			},
			"overall_checkable": true,
			"checked_style": map[string]interface{}{
				"show_strikethrough": true,
				"opacity":            0.5,
			},
			"padding": "2px 2px 2px 2px",
			"behaviors": []map[string]interface{}{
				{
					"type": "callback",
					"value": map[string]interface{}{
						"type":       "checker",
						"item_key":   it.Key,
						"item_label": it.Label,
						"card_id":    cardID,
					},
				},
			},
		})
	}

	return elements
}

// ── AI 回复中的交互块检测 ─────────────────────────────────────

// ParseChoiceBlocks 从 AI 回复文本中提取 choice 交互块。
// 支持代码围栏和裸 JSON 两种格式，兼容 value/id 两种选项 key。
func ParseChoiceBlocks(text string) (title string, choices []ChoiceOption) {
	// 使用花括号配对扫描找到可能的 JSON 块
	jsonBlocks := extractJSONBlocks(text)

	for _, jsonStr := range jsonBlocks {
		var block struct {
			Type    string `json:"type"`
			Title   string `json:"title"`
			Options []struct {
				ID    string `json:"id"`
				Label string `json:"label"`
				Value string `json:"value"`
				Desc  string `json:"desc"`
			} `json:"options"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &block); err != nil {
			continue
		}
		if block.Type != "choice" || len(block.Options) == 0 {
			continue
		}
		title = block.Title
		for _, opt := range block.Options {
			key := opt.Value
			if key == "" {
				key = opt.ID
			}
			if key == "" {
				key = opt.Label
			}
			label := opt.Label
			if opt.Desc != "" {
				label = label + "（" + opt.Desc + "）"
			}
			choices = append(choices, ChoiceOption{Key: key, Label: label})
		}
		return title, choices
	}
	return "", nil
}

// extractJSONBlocks 从文本中提取所有完整的 JSON 对象（通过花括号配对）
func extractJSONBlocks(text string) []string {
	var blocks []string
	i := 0
	for i < len(text) {
		// 找到 { 开头
		start := strings.IndexByte(text[i:], '{')
		if start < 0 {
			break
		}
		start += i

		// 配对花括号
		depth := 0
		end := -1
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
					end = j
					break
				}
			}
		}

		if end < 0 {
			break
		}

		block := text[start : end+1]
		// 只保留包含 "type" 的 JSON 块（减少无关 JSON 噪音）
		if strings.Contains(block, `"type"`) {
			blocks = append(blocks, block)
		}
		i = end + 1
	}
	return blocks
}

// GetFullTextReply 获取 feishuStreamSender 累积的纯文本回复
func (s *feishuStreamSender) GetFullTextReply() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.fullTextReply.String()
}

// GetCardID 获取卡片 ID
func (s *feishuStreamSender) GetCardID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cardID
}

// ── HTTP 工具函数 ─────────────────────────────────────────────

func doHTTPRequest(method, urlStr, token string, body []byte) error {
	req, _ := http.NewRequest(method, urlStr, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}
