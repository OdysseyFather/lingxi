// Package usage：本地兜底定价表。
//
// claude-code CLI 仅对 Anthropic 官方模型返回 cost_usd；走 OpenAI 兼容 bridge
// 的请求 cost_usd 永远为 0。这里提供一份保守的 USD/百万 token 估价，
// 当上游未给出 cost 时由 Go 后端计算，便于在 UsagePage 展示费用。
//
// 数据是粗略估算（截至 2026-04），不保证实时；用户可在更新时编辑此表。
package usage

import "strings"

// modelPricing 返回 (input USD/MTok, output USD/MTok)。未命中返回 0。
func modelPricing(model string) (in, out float64) {
	m := strings.ToLower(model)
	switch {
	// ─── Anthropic 官方（兜底，正常 CLI 已返回）─────────────────
	case strings.Contains(m, "opus"):
		return 15.0, 75.0
	case strings.Contains(m, "sonnet"):
		return 3.0, 15.0
	case strings.Contains(m, "haiku"):
		return 0.8, 4.0

	// ─── 阿里 Qwen / DashScope（折算 CNY→USD ≈ 7.2）──────────
	case strings.Contains(m, "qwen-max") || strings.Contains(m, "qwen3-max"):
		return 1.6, 6.4
	case strings.Contains(m, "qwen3-coder"):
		return 0.5, 2.0
	case strings.Contains(m, "qwen-plus") || strings.Contains(m, "qwen3-plus") || strings.Contains(m, "qwen3.5-plus") || strings.Contains(m, "qwen3.6-plus"):
		return 0.4, 1.2
	case strings.Contains(m, "qwen-turbo") || strings.Contains(m, "qwen3-turbo"):
		return 0.05, 0.2
	case strings.Contains(m, "qwen"):
		return 0.4, 1.2 // qwen 系列默认按 plus 估

	// ─── DeepSeek ─────────────────────────────────────────────
	case strings.Contains(m, "deepseek-r1"):
		return 0.55, 2.19
	case strings.Contains(m, "deepseek-chat") || strings.Contains(m, "deepseek-v"):
		return 0.27, 1.10
	case strings.Contains(m, "deepseek"):
		return 0.27, 1.10

	// ─── GLM / 智谱 ────────────────────────────────────────────
	case strings.Contains(m, "glm-4.5") || strings.Contains(m, "glm-4-plus"):
		return 0.7, 2.0
	case strings.Contains(m, "glm-4"):
		return 0.5, 1.5
	case strings.Contains(m, "glm"):
		return 0.5, 1.5

	// ─── Moonshot ──────────────────────────────────────────────
	case strings.Contains(m, "kimi-k2") || strings.Contains(m, "moonshot-v1-128k"):
		return 8.0, 24.0
	case strings.Contains(m, "moonshot") || strings.Contains(m, "kimi"):
		return 1.5, 4.5

	// ─── Doubao / 火山 ─────────────────────────────────────────
	case strings.Contains(m, "doubao-pro") || strings.Contains(m, "doubao-1.5-pro"):
		return 0.5, 1.5
	case strings.Contains(m, "doubao"):
		return 0.3, 0.9

	// ─── Gemini（OpenAI 兼容接入）──────────────────────────────
	case strings.Contains(m, "gemini-2.5-pro") || strings.Contains(m, "gemini-2-pro"):
		return 1.25, 5.0
	case strings.Contains(m, "gemini-2.5-flash") || strings.Contains(m, "gemini-2-flash"):
		return 0.075, 0.3
	case strings.Contains(m, "gemini"):
		return 0.5, 1.5

	// ─── OpenAI 官方 ───────────────────────────────────────────
	case strings.Contains(m, "gpt-4o-mini"):
		return 0.15, 0.6
	case strings.Contains(m, "gpt-4o"):
		return 2.5, 10.0
	case strings.Contains(m, "o1-mini"):
		return 1.1, 4.4
	case strings.Contains(m, "o1"):
		return 15.0, 60.0
	case strings.Contains(m, "gpt-4"):
		return 10.0, 30.0
	case strings.Contains(m, "gpt-3.5"):
		return 0.5, 1.5
	}
	return 0, 0
}

// EstimateCost 输入 model 名与 token 数返回估算费用（USD）。
// 命中表则返回 >0；未命中返回 0。
func EstimateCost(model string, inputTokens, outputTokens int64) float64 {
	in, out := modelPricing(model)
	if in == 0 && out == 0 {
		return 0
	}
	const million = 1_000_000.0
	return float64(inputTokens)/million*in + float64(outputTokens)/million*out
}
