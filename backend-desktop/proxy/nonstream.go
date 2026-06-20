package proxy

import (
	"encoding/json"
	"fmt"
)

// OpenAI 非流式响应
type openAIResponse struct {
	ID      string             `json:"id"`
	Object  string             `json:"object"`
	Model   string             `json:"model"`
	Choices []openAIFullChoice `json:"choices"`
	Usage   *openAIUsage       `json:"usage,omitempty"`
}

type openAIFullChoice struct {
	Index        int            `json:"index"`
	Message      openAIRespMsg  `json:"message"`
	FinishReason string         `json:"finish_reason"`
}

type openAIRespMsg struct {
	Role             string      `json:"role"`
	Content          *string     `json:"content"`
	ToolCalls        interface{} `json:"tool_calls,omitempty"`
	ReasoningContent string      `json:"reasoning_content,omitempty"` // DeepSeek
	Reasoning        string      `json:"reasoning,omitempty"`         // OpenRouter
}

// Anthropic 非流式响应
type anthropicResponse struct {
	ID           string                 `json:"id"`
	Type         string                 `json:"type"`
	Role         string                 `json:"role"`
	Model        string                 `json:"model"`
	Content      []interface{}          `json:"content"`
	StopReason   string                 `json:"stop_reason"`
	StopSequence *string                `json:"stop_sequence"`
	Usage        map[string]int         `json:"usage"`
}

// TransformNonStreamResponse 将 OpenAI 非流式响应 JSON 转为 Anthropic Messages 格式。
func TransformNonStreamResponse(oaiBody []byte, requestModel string) ([]byte, error) {
	var resp openAIResponse
	if err := json.Unmarshal(oaiBody, &resp); err != nil {
		return nil, fmt.Errorf("parse openai response: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("openai response has no choices")
	}

	choice := resp.Choices[0]
	msg := choice.Message

	var content []interface{}

	// reasoning → thinking block（兼容多供应商格式）
	reasoningText := msg.ReasoningContent
	if reasoningText == "" {
		reasoningText = msg.Reasoning
	}
	if reasoningText != "" {
		content = append(content, map[string]interface{}{
			"type":     "thinking",
			"thinking": reasoningText,
		})
	}

	// text content
	if msg.Content != nil && *msg.Content != "" {
		content = append(content, map[string]interface{}{
			"type": "text",
			"text": *msg.Content,
		})
	}

	// tool_calls
	if msg.ToolCalls != nil {
		if tcList, ok := msg.ToolCalls.([]interface{}); ok {
			for _, tc := range tcList {
				tcMap, ok := tc.(map[string]interface{})
				if !ok {
					continue
				}
				fn, _ := tcMap["function"].(map[string]interface{})
				if fn == nil {
					continue
				}
				toolID, _ := tcMap["id"].(string)
				name, _ := fn["name"].(string)
				argsStr, _ := fn["arguments"].(string)

				var input interface{}
				if err := json.Unmarshal([]byte(argsStr), &input); err != nil {
					input = map[string]interface{}{}
				}

				content = append(content, map[string]interface{}{
					"type":  "tool_use",
					"id":    toolID,
					"name":  name,
					"input": input,
				})
			}
		}
	}

	if len(content) == 0 {
		content = append(content, map[string]interface{}{
			"type": "text",
			"text": "",
		})
	}

	model := requestModel
	if resp.Model != "" {
		model = resp.Model
	}

	usage := map[string]int{
		"input_tokens":  0,
		"output_tokens": 0,
	}
	if resp.Usage != nil {
		usage["input_tokens"] = resp.Usage.PromptTokens
		usage["output_tokens"] = resp.Usage.CompletionTokens
		if resp.Usage.PromptTokensDetails != nil {
			usage["cache_read_input_tokens"] = resp.Usage.PromptTokensDetails.CachedTokens
		}
		if resp.Usage.CompletionTokensDetails != nil {
			usage["output_tokens"] += resp.Usage.CompletionTokensDetails.ReasoningTokens
		}
	}

	result := anthropicResponse{
		ID:         fmt.Sprintf("msg_%s", resp.ID),
		Type:       "message",
		Role:       "assistant",
		Model:      model,
		Content:    content,
		StopReason: mapFinishReason(choice.FinishReason),
		Usage:      usage,
	}

	return json.Marshal(result)
}
