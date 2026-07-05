package connector

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ── 任务协调卡片构建工具 ────────────────────────────────────────

// TaskMainCardStatus 主卡片状态配置
type TaskMainCardStatus struct {
	Template string // header 颜色：orange / blue / green / red
	TagText  string // 状态标签文字
	TagColor string // 标签颜色
}

var (
	TaskStatusAccepted     = TaskMainCardStatus{"orange", "接单中", "orange"}
	TaskStatusInvestigating = TaskMainCardStatus{"blue", "排查中", "blue"}
	TaskStatusResolved     = TaskMainCardStatus{"green", "已结案", "green"}
	TaskStatusError        = TaskMainCardStatus{"red", "异常", "red"}
)

// BuildTaskMainCard 构建主任务卡片（普通 interactive，不开 streaming_mode）
// title: 任务标题，subtitle: 副标题，bodyMD: 正文 Markdown，status: 状态配置
func BuildTaskMainCard(title, subtitle, bodyMD string, status TaskMainCardStatus) string {
	card := map[string]interface{}{
		"schema": "2.0",
		"config": map[string]interface{}{
			"update_multi": true,
		},
		"header": map[string]interface{}{
			"title":    map[string]interface{}{"tag": "plain_text", "content": title},
			"subtitle": map[string]interface{}{"tag": "plain_text", "content": subtitle},
			"template": status.Template,
			"text_tag_list": []map[string]interface{}{
				{
					"tag":        "text_tag",
					"element_id": "status_tag",
					"text":       map[string]interface{}{"tag": "plain_text", "content": status.TagText},
					"color":      status.TagColor,
				},
			},
		},
		"body": map[string]interface{}{
			"elements": []map[string]interface{}{
				{
					"tag":        "markdown",
					"element_id": "summary_md",
					"content":    bodyMD,
				},
				{"tag": "hr", "element_id": "hr_1"},
				{
					"tag":        "markdown",
					"element_id": "status_md",
					"content":    "**进展**：\n- ⏳ 调度者已接单，正在分析中",
				},
			},
		},
	}
	b, _ := json.Marshal(card)
	return string(b)
}

// BuildTaskMainCardUpdate 构建更新后的主任务卡片（用于 PATCH）
func BuildTaskMainCardUpdate(title, subtitle, summaryMD, statusMD string, status TaskMainCardStatus) string {
	card := map[string]interface{}{
		"schema": "2.0",
		"config": map[string]interface{}{
			"update_multi": true,
		},
		"header": map[string]interface{}{
			"title":    map[string]interface{}{"tag": "plain_text", "content": title},
			"subtitle": map[string]interface{}{"tag": "plain_text", "content": subtitle},
			"template": status.Template,
			"text_tag_list": []map[string]interface{}{
				{
					"tag":        "text_tag",
					"element_id": "status_tag",
					"text":       map[string]interface{}{"tag": "plain_text", "content": status.TagText},
					"color":      status.TagColor,
				},
			},
		},
		"body": map[string]interface{}{
			"elements": []map[string]interface{}{
				{
					"tag":        "markdown",
					"element_id": "summary_md",
					"content":    summaryMD,
				},
				{"tag": "hr", "element_id": "hr_1"},
				{
					"tag":        "markdown",
					"element_id": "status_md",
					"content":    statusMD,
				},
			},
		},
	}
	b, _ := json.Marshal(card)
	return string(b)
}

// BuildTaskStreamingCard 构建流式思考卡片（用于调度者初始分析展示）
func BuildTaskStreamingCard(title string) string {
	card := map[string]interface{}{
		"schema": "2.0",
		"config": map[string]interface{}{
			"streaming_mode": true,
			"update_multi":   true,
			"summary":        map[string]interface{}{"content": "调度者分析中"},
			"streaming_config": map[string]interface{}{
				"print_frequency_ms": map[string]interface{}{"default": 50},
				"print_step":         map[string]interface{}{"default": 2},
				"print_strategy":     "fast",
			},
		},
		"header": map[string]interface{}{
			"title":    map[string]interface{}{"tag": "plain_text", "content": title},
			"template": "blue",
		},
		"body": map[string]interface{}{
			"elements": []map[string]interface{}{
				{
					"tag":        "markdown",
					"element_id": "stream_md_01",
					"content":    "",
				},
			},
		},
	}
	b, _ := json.Marshal(card)
	return string(b)
}

// BuildTaskProgressCard 构建进度卡片（非流式，用于后续 PATCH 更新进展日志）
func BuildTaskProgressCard(title string, lines []string) string {
	content := strings.Join(lines, "\n")
	if content == "" {
		content = "⏳ 等待分析结果..."
	}
	card := map[string]interface{}{
		"schema": "2.0",
		"config": map[string]interface{}{
			"update_multi": true,
		},
		"header": map[string]interface{}{
			"title":    map[string]interface{}{"tag": "plain_text", "content": title},
			"template": "blue",
		},
		"body": map[string]interface{}{
			"elements": []map[string]interface{}{
				{
					"tag":        "markdown",
					"element_id": "progress_md",
					"content":    content,
				},
			},
		},
	}
	b, _ := json.Marshal(card)
	return string(b)
}

// ── 任务分发相关 ──────────────────────────────────────────────

// DispatchTarget 分发目标
type DispatchTarget struct {
	OpenID string `json:"open_id"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Type   string `json:"type"` // "bot" / "user"
}

// ParseDispatchTargets 从 JSON 字符串解析分发目标
func ParseDispatchTargets(jsonStr string) []DispatchTarget {
	var targets []DispatchTarget
	if jsonStr == "" || jsonStr == "[]" {
		return targets
	}
	json.Unmarshal([]byte(jsonStr), &targets)
	return targets
}

// BuildDispatchTextMessage 构建分发文本消息（含 @mention，用于触发 im.message.received_v1）
// 飞书 text 消息中使用 <at open_id="ou_xxx">名字</at> 语法
func BuildDispatchTextMessage(openID, name, taskDesc string) string {
	return fmt.Sprintf(`<at open_id="%s">%s</at> 请协助处理以下任务：

%s`, openID, name, taskDesc)
}

// BuildDispatchCard 构建分发任务卡片（结构化展示任务详情）
// 作为话题回复发送，卡片内可以 @mention（使用 markdown 的 <at id=ou_xxx></at> 语法）
func BuildDispatchCard(openID, name, taskTitle, background, expectedOutput, context string) string {
	var contentParts []string
	contentParts = append(contentParts, fmt.Sprintf("<at id=%s></at> 请协助排查", openID))
	contentParts = append(contentParts, fmt.Sprintf("\n**任务**：%s", taskTitle))
	if background != "" {
		contentParts = append(contentParts, fmt.Sprintf("\n**背景**：\n%s", background))
	}
	if expectedOutput != "" {
		contentParts = append(contentParts, fmt.Sprintf("\n**期望输出**：\n%s", expectedOutput))
	}
	if context != "" {
		contentParts = append(contentParts, fmt.Sprintf("\n**上下文**：\n%s", context))
	}

	card := map[string]interface{}{
		"schema": "2.0",
		"config": map[string]interface{}{
			"update_multi": true,
		},
		"header": map[string]interface{}{
			"title":    map[string]interface{}{"tag": "plain_text", "content": "任务分派｜" + taskTitle},
			"template": "blue",
		},
		"body": map[string]interface{}{
			"elements": []map[string]interface{}{
				{
					"tag":     "markdown",
					"content": strings.Join(contentParts, "\n"),
				},
			},
		},
	}
	b, _ := json.Marshal(card)
	return string(b)
}
