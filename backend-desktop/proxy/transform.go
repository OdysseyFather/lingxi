package proxy

import (
	"encoding/json"
	"fmt"
	"strings"
)

// TransformRequest 将 Anthropic Messages API 请求转换为 OpenAI Chat Completions 请求。
// provider 参数决定供应商特定的请求适配策略。
func TransformRequest(req *AnthropicRequest, provider Provider) (*OpenAIRequest, error) {
	oaiReq := &OpenAIRequest{
		Model:       req.Model,
		Stream:      req.Stream,
		Temperature: req.Temperature,
		TopP:        req.TopP,
	}

	if req.Stream {
		oaiReq.StreamOptions = &StreamOptions{IncludeUsage: true}
	}

	// max_tokens
	if req.MaxTokens > 0 {
		oaiReq.MaxCompletionTok = &req.MaxTokens
	}

	// stop_sequences
	if len(req.StopSequences) > 0 {
		if len(req.StopSequences) == 1 {
			oaiReq.Stop = req.StopSequences[0]
		} else {
			oaiReq.Stop = req.StopSequences
		}
	}

	keepReasoningContent := provider == ProviderDeepSeek || provider == ProviderOpenRouter
	msgs := transformMessages(req.System, req.Messages, keepReasoningContent)
	oaiReq.Messages = msgs

	// tools
	if len(req.Tools) > 0 {
		oaiReq.Tools = transformTools(req.Tools)
	}

	// tool_choice
	if req.ToolChoice != nil {
		oaiReq.ToolChoice = transformToolChoice(req.ToolChoice)
	}

	// thinking / reasoning — 供应商适配
	if req.Thinking != nil {
		if req.Thinking.Type == "disabled" {
			// 显式禁用思考：不传 reasoning_effort，确保模型不返回思考内容
			switch provider {
			case ProviderDeepSeek:
				oaiReq.ReasoningEffort = "none"
			case ProviderGemini:
				oaiReq.ReasoningEffort = "none"
			default:
				oaiReq.ReasoningEffort = "none"
			}
		} else {
			switch provider {
			case ProviderGemini:
				// Gemini: 使用 reasoning_effort，不支持自定义 thinking 对象
				if req.Thinking.BudgetTokens > 0 {
					oaiReq.ReasoningEffort = budgetToEffort(req.Thinking.BudgetTokens, req.MaxTokens)
				} else if req.Thinking.Type == "enabled" {
					oaiReq.ReasoningEffort = "high"
				}
				// Gemini 强制 temperature=1 when thinking enabled
				if req.Thinking.Type == "enabled" {
					t := 1.0
					oaiReq.Temperature = &t
				}
			case ProviderDeepSeek:
				if req.Thinking.BudgetTokens > 0 {
					oaiReq.ReasoningEffort = budgetToEffort(req.Thinking.BudgetTokens, req.MaxTokens)
				} else if req.Thinking.Type == "enabled" {
					oaiReq.ReasoningEffort = "high"
				}
			default:
				if req.Thinking.BudgetTokens > 0 {
					oaiReq.ReasoningEffort = budgetToEffort(req.Thinking.BudgetTokens, req.MaxTokens)
				} else if req.Thinking.Type == "enabled" {
					oaiReq.ReasoningEffort = "high"
				}
			}
		}
	}

	// OpenRouter: include_reasoning 让上游返回 reasoning 字段
	if provider == ProviderOpenRouter {
		t := true
		oaiReq.IncludeReasoning = &t
	}

	// Gemini 不支持 max_completion_tokens，用 max_tokens
	if provider == ProviderGemini && oaiReq.MaxCompletionTok != nil {
		oaiReq.MaxTokens = oaiReq.MaxCompletionTok
		oaiReq.MaxCompletionTok = nil
	}

	// Ollama 不支持 stream_options
	if provider == ProviderOllama {
		oaiReq.StreamOptions = nil
	}

	return oaiReq, nil
}

func transformMessages(system interface{}, messages []AnthropicMessage, deepSeekCompat bool) []OpenAIMessage {
	var result []OpenAIMessage

	// system prompt → system message
	if system != nil {
		sysText := extractSystemText(system)
		if sysText != "" {
			result = append(result, OpenAIMessage{Role: "system", Content: sysText})
		}
	}

	for _, msg := range messages {
		switch msg.Role {
		case "user":
			result = append(result, transformUserMessage(msg)...)
		case "assistant":
			result = append(result, transformAssistantMessage(msg, deepSeekCompat))
		default:
			result = append(result, OpenAIMessage{Role: msg.Role, Content: msg.Content})
		}
	}

	return result
}

func extractSystemText(system interface{}) string {
	switch v := system.(type) {
	case string:
		return v
	case []interface{}:
		var parts []string
		for _, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				if t, _ := m["type"].(string); t == "text" {
					if text, ok := m["text"].(string); ok {
						parts = append(parts, text)
					}
				}
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

func transformUserMessage(msg AnthropicMessage) []OpenAIMessage {
	switch v := msg.Content.(type) {
	case string:
		return []OpenAIMessage{{Role: "user", Content: v}}
	case []interface{}:
		var parts []interface{}
		var toolResults []OpenAIMessage

		for _, block := range v {
			m, ok := block.(map[string]interface{})
			if !ok {
				continue
			}
			blockType, _ := m["type"].(string)

			switch blockType {
			case "text":
				text, _ := m["text"].(string)
				parts = append(parts, map[string]interface{}{
					"type": "text", "text": text,
				})
			case "image":
				source, _ := m["source"].(map[string]interface{})
				if source != nil {
					mediaType, _ := source["media_type"].(string)
					data, _ := source["data"].(string)
					parts = append(parts, map[string]interface{}{
						"type": "image_url",
						"image_url": map[string]string{
							"url": fmt.Sprintf("data:%s;base64,%s", mediaType, data),
						},
					})
				}
			case "tool_result":
				toolUseID, _ := m["tool_use_id"].(string)
				content := extractToolResultContent(m["content"])
				toolResults = append(toolResults, OpenAIMessage{
					Role:       "tool",
					Content:    content,
					ToolCallID: toolUseID,
				})
			}
		}

		var result []OpenAIMessage
		if len(parts) > 0 {
			result = append(result, OpenAIMessage{Role: "user", Content: parts})
		}
		result = append(result, toolResults...)
		return result
	}
	return []OpenAIMessage{{Role: "user", Content: msg.Content}}
}

func extractToolResultContent(content interface{}) string {
	switch v := content.(type) {
	case string:
		return v
	case []interface{}:
		var parts []string
		for _, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				if t, _ := m["type"].(string); t == "text" {
					if text, ok := m["text"].(string); ok {
						parts = append(parts, text)
					}
				}
			}
		}
		return strings.Join(parts, "\n")
	}
	b, _ := json.Marshal(content)
	return string(b)
}

func transformAssistantMessage(msg AnthropicMessage, deepSeekCompat bool) OpenAIMessage {
	oaiMsg := OpenAIMessage{Role: "assistant"}

	switch v := msg.Content.(type) {
	case string:
		oaiMsg.Content = v
		return oaiMsg
	case []interface{}:
		var textParts []string
		var toolCalls []map[string]interface{}
		var reasoningText string

		for _, block := range v {
			m, ok := block.(map[string]interface{})
			if !ok {
				continue
			}
			blockType, _ := m["type"].(string)

			switch blockType {
			case "text":
				text, _ := m["text"].(string)
				textParts = append(textParts, text)
			case "thinking":
				thinking, _ := m["thinking"].(string)
				if thinking != "" {
					reasoningText += thinking
				}
			case "tool_use":
				name, _ := m["name"].(string)
				id, _ := m["id"].(string)
				input := m["input"]
				inputJSON, _ := json.Marshal(input)
				toolCalls = append(toolCalls, map[string]interface{}{
					"id":   id,
					"type": "function",
					"function": map[string]interface{}{
						"name":      name,
						"arguments": string(inputJSON),
					},
				})
			}
		}

		if len(textParts) > 0 {
			oaiMsg.Content = strings.Join(textParts, "")
		}
		if len(toolCalls) > 0 {
			oaiMsg.ToolCalls = toolCalls
		}
		if reasoningText != "" && deepSeekCompat {
			oaiMsg.ReasoningContent = reasoningText
		}
	}

	return oaiMsg
}

func transformTools(tools []AnthropicTool) []OpenAITool {
	result := make([]OpenAITool, 0, len(tools))
	for _, t := range tools {
		result = append(result, OpenAITool{
			Type: "function",
			Function: OpenAIFunction{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  t.InputSchema,
			},
		})
	}
	return result
}

func transformToolChoice(choice interface{}) interface{} {
	switch v := choice.(type) {
	case string:
		switch v {
		case "auto":
			return "auto"
		case "any":
			return "required"
		case "none":
			return "none"
		}
	case map[string]interface{}:
		if t, _ := v["type"].(string); t == "tool" {
			if name, _ := v["name"].(string); name != "" {
				return map[string]interface{}{
					"type": "function",
					"function": map[string]string{
						"name": name,
					},
				}
			}
		}
	}
	return choice
}

func budgetToEffort(budgetTokens, maxTokens int) string {
	if maxTokens <= 0 {
		maxTokens = 8192
	}
	ratio := float64(budgetTokens) / float64(maxTokens)
	if ratio >= 0.8 {
		return "high"
	}
	if ratio >= 0.3 {
		return "medium"
	}
	return "low"
}
