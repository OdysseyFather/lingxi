package proxy

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// streamState 追踪流式转换的状态
type streamState struct {
	model         string
	msgID         string
	blockIndex    int
	inThinking    bool
	inText        bool
	inToolCall    bool
	toolCallIndex int
	// 累积的 tool call 信息
	toolCalls map[int]*toolCallAccum
	// usage
	inputTokens              int
	outputTokens             int
	cacheReadInputTokens     int
	cacheCreationInputTokens int
	// stop reason
	stopReason string
}

type toolCallAccum struct {
	ID         string
	Name       string
	ArgsJSON   string
	BlockIndex int
}

// StreamTransform 从 OpenAI SSE 流读取并逐事件写出 Anthropic SSE 格式。
// provider 参数决定如何解析上游特定的响应字段。
func StreamTransform(model string, reader io.Reader, writer io.Writer, provider Provider) error {
	st := &streamState{
		model:     model,
		msgID:     fmt.Sprintf("msg_%d", randID()),
		toolCalls: make(map[int]*toolCallAccum),
	}

	// 写 message_start
	writeAnthropicEvent(writer, "message_start", map[string]interface{}{
		"type": "message_start",
		"message": map[string]interface{}{
			"id":    st.msgID,
			"type":  "message",
			"role":  "assistant",
			"model": model,
			"content": []interface{}{},
			"usage": map[string]int{
				"input_tokens":  0,
				"output_tokens": 0,
			},
		},
	})

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 512*1024), 512*1024)

	for scanner.Scan() {
		line := scanner.Text()

		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk openAIChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) == 0 {
			// usage-only chunk
			if chunk.Usage != nil {
				st.inputTokens = chunk.Usage.PromptTokens
				st.outputTokens = chunk.Usage.CompletionTokens
				if chunk.Usage.PromptTokensDetails != nil {
					st.cacheReadInputTokens = chunk.Usage.PromptTokensDetails.CachedTokens
				}
				if chunk.Usage.CompletionTokensDetails != nil {
					st.outputTokens += chunk.Usage.CompletionTokensDetails.ReasoningTokens
				}
			}
			continue
		}

		delta := chunk.Choices[0].Delta
		finishReason := chunk.Choices[0].FinishReason

		// reasoning_content（DeepSeek、OpenRouter、Gemini 等）
		if rc := extractReasoningContent(delta); rc != "" {
			if !st.inThinking {
				st.inThinking = true
				writeAnthropicEvent(writer, "content_block_start", map[string]interface{}{
					"type":  "content_block_start",
					"index": st.blockIndex,
					"content_block": map[string]string{
						"type":    "thinking",
						"thinking": "",
					},
				})
			}
			writeAnthropicEvent(writer, "content_block_delta", map[string]interface{}{
				"type":  "content_block_delta",
				"index": st.blockIndex,
				"delta": map[string]string{
					"type":     "thinking_delta",
					"thinking": rc,
				},
			})
		}

		// content（正文文本）
		content, _ := delta["content"].(string)
		if content != "" {
			if st.inThinking {
				// 从 thinking 切换到 text
				writeAnthropicEvent(writer, "content_block_stop", map[string]interface{}{
					"type": "content_block_stop", "index": st.blockIndex,
				})
				st.blockIndex++
				st.inThinking = false
			}
			if !st.inText {
				st.inText = true
				writeAnthropicEvent(writer, "content_block_start", map[string]interface{}{
					"type":  "content_block_start",
					"index": st.blockIndex,
					"content_block": map[string]string{
						"type": "text",
						"text": "",
					},
				})
			}
			writeAnthropicEvent(writer, "content_block_delta", map[string]interface{}{
				"type":  "content_block_delta",
				"index": st.blockIndex,
				"delta": map[string]string{
					"type": "text_delta",
					"text": content,
				},
			})
		}

		// tool_calls（支持多个并行 tool call，每个独立 content block）
		if rawTC, ok := delta["tool_calls"]; ok {
			if tcList, ok := rawTC.([]interface{}); ok {
				for _, tc := range tcList {
					tcMap, ok := tc.(map[string]interface{})
					if !ok {
						continue
					}
					idx := int(jsonFloat(tcMap["index"]))
					fn, _ := tcMap["function"].(map[string]interface{})

					accum, exists := st.toolCalls[idx]
					if !exists {
						// 关闭之前打开的 block
						if st.inText {
							writeAnthropicEvent(writer, "content_block_stop", map[string]interface{}{
								"type": "content_block_stop", "index": st.blockIndex,
							})
							st.blockIndex++
							st.inText = false
						}
						if st.inThinking {
							writeAnthropicEvent(writer, "content_block_stop", map[string]interface{}{
								"type": "content_block_stop", "index": st.blockIndex,
							})
							st.blockIndex++
							st.inThinking = false
						}
						// 如果已经有一个 tool call 在进行中，先关闭它
						if st.inToolCall && st.toolCallIndex != idx {
							writeAnthropicEvent(writer, "content_block_stop", map[string]interface{}{
								"type": "content_block_stop", "index": st.blockIndex,
							})
							st.blockIndex++
						}

						toolID, _ := tcMap["id"].(string)
						toolName := ""
						if fn != nil {
							toolName, _ = fn["name"].(string)
						}
						accum = &toolCallAccum{ID: toolID, Name: toolName, BlockIndex: st.blockIndex}
						st.toolCalls[idx] = accum
						st.inToolCall = true
						st.toolCallIndex = idx

						writeAnthropicEvent(writer, "content_block_start", map[string]interface{}{
							"type":  "content_block_start",
							"index": st.blockIndex,
							"content_block": map[string]interface{}{
								"type":  "tool_use",
								"id":    toolID,
								"name":  toolName,
								"input": map[string]interface{}{},
							},
						})
					}

					if fn != nil {
						if args, _ := fn["arguments"].(string); args != "" {
							accum.ArgsJSON += args
							writeAnthropicEvent(writer, "content_block_delta", map[string]interface{}{
								"type":  "content_block_delta",
								"index": accum.BlockIndex,
								"delta": map[string]string{
									"type":         "input_json_delta",
									"partial_json": args,
								},
							})
						}
					}
				}
			}
		}

		// finish_reason
		if finishReason != "" {
			st.stopReason = mapFinishReason(finishReason)
		}

		// usage from choice
		if chunk.Usage != nil {
			st.inputTokens = chunk.Usage.PromptTokens
			st.outputTokens = chunk.Usage.CompletionTokens
			if chunk.Usage.PromptTokensDetails != nil {
				st.cacheReadInputTokens = chunk.Usage.PromptTokensDetails.CachedTokens
			}
			if chunk.Usage.CompletionTokensDetails != nil {
				st.outputTokens += chunk.Usage.CompletionTokensDetails.ReasoningTokens
			}
		}
	}

	// 关闭所有打开的 block
	if st.inThinking || st.inText || st.inToolCall {
		writeAnthropicEvent(writer, "content_block_stop", map[string]interface{}{
			"type": "content_block_stop", "index": st.blockIndex,
		})
	}

	// message_delta (stop reason + usage)
	if st.stopReason == "" {
		st.stopReason = "end_turn"
	}
	writeAnthropicEvent(writer, "message_delta", map[string]interface{}{
		"type":  "message_delta",
		"delta": map[string]string{"stop_reason": st.stopReason},
		"usage": map[string]int{
			"output_tokens":               st.outputTokens,
			"input_tokens":                st.inputTokens,
			"cache_read_input_tokens":     st.cacheReadInputTokens,
			"cache_creation_input_tokens": st.cacheCreationInputTokens,
		},
	})

	// message_stop
	writeAnthropicEvent(writer, "message_stop", map[string]interface{}{
		"type": "message_stop",
	})

	return scanner.Err()
}

// ── OpenAI SSE chunk 类型 ───────────────────────────────────────

type openAIChunk struct {
	ID      string         `json:"id"`
	Object  string         `json:"object"`
	Choices []openAIChoice `json:"choices"`
	Usage   *openAIUsage   `json:"usage,omitempty"`
}

type openAIChoice struct {
	Index        int                    `json:"index"`
	Delta        map[string]interface{} `json:"delta"`
	FinishReason string                 `json:"finish_reason"`
}

type openAIUsage struct {
	PromptTokens            int                  `json:"prompt_tokens"`
	CompletionTokens        int                  `json:"completion_tokens"`
	TotalTokens             int                  `json:"total_tokens"`
	PromptTokensDetails     *promptTokensDetails `json:"prompt_tokens_details,omitempty"`
	CompletionTokensDetails *complTokensDetails  `json:"completion_tokens_details,omitempty"`
}

type promptTokensDetails struct {
	CachedTokens int `json:"cached_tokens"`
}

type complTokensDetails struct {
	ReasoningTokens int `json:"reasoning_tokens"`
}

// ── 辅助函数 ────────────────────────────────────────────────────

func extractReasoningContent(delta map[string]interface{}) string {
	// Format 1: reasoning_content (DeepSeek v4, some OpenRouter models)
	if rc, ok := delta["reasoning_content"].(string); ok && rc != "" {
		return rc
	}
	// Format 2: reasoning (OpenRouter include_reasoning, Cerebras, Groq)
	if r, ok := delta["reasoning"].(string); ok && r != "" {
		return r
	}
	// Format 3: reasoning_details (OpenRouter structured reasoning)
	if rds, ok := delta["reasoning_details"].([]interface{}); ok && len(rds) > 0 {
		var parts []string
		for _, rd := range rds {
			if m, ok := rd.(map[string]interface{}); ok {
				if t, _ := m["type"].(string); t == "reasoning.text" {
					if text, ok := m["text"].(string); ok && text != "" {
						parts = append(parts, text)
					}
				}
			}
		}
		if len(parts) > 0 {
			return strings.Join(parts, "")
		}
	}
	// Format 4: thinking_blocks (OpenAI o-series)
	if tbs, ok := delta["thinking_blocks"].([]interface{}); ok && len(tbs) > 0 {
		var parts []string
		for _, tb := range tbs {
			if m, ok := tb.(map[string]interface{}); ok {
				if t, ok := m["thinking"].(string); ok && t != "" {
					parts = append(parts, t)
				}
			}
		}
		return strings.Join(parts, "")
	}
	return ""
}

func writeAnthropicEvent(w io.Writer, eventType string, data interface{}) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, string(jsonBytes))
}

func mapFinishReason(reason string) string {
	switch reason {
	case "stop":
		return "end_turn"
	case "length":
		return "max_tokens"
	case "tool_calls":
		return "tool_use"
	case "content_filter":
		return "end_turn"
	default:
		return "end_turn"
	}
}

func jsonFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	}
	return 0
}

var _randCounter int64

func randID() int64 {
	_randCounter++
	return _randCounter + int64(1e12)
}
