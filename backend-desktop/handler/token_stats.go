package handler

import (
	gocontext "context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"lingxi-agent/db"
)

// GetSessionTokenStats GET /api/sessions/:id/token-stats
// 返回会话的总 token 用量和上下文窗口水位估算
func GetSessionTokenStats(c *gin.Context) {
	idStr := c.Param("id")
	sessionID, _ := strconv.ParseInt(idStr, 10, 64)
	if sessionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	rows, err := db.DB.Query(`SELECT usage FROM messages WHERE session_id=? AND usage != ''`, sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var totalInput, totalOutput, totalCacheRead, totalCacheWrite int64
	var totalCost float64
	var msgCount int

	for rows.Next() {
		var usageStr string
		rows.Scan(&usageStr)
		if usageStr == "" {
			continue
		}
		var u map[string]interface{}
		if json.Unmarshal([]byte(usageStr), &u) != nil {
			continue
		}
		totalInput += toInt64(u["input_tokens"])
		totalOutput += toInt64(u["output_tokens"])
		totalCacheRead += toInt64(u["cache_read_tokens"])
		totalCacheWrite += toInt64(u["cache_write_tokens"])
		totalCost += toFloat64(u["cost_usd"])
		msgCount++
	}

	// 估算当前上下文 token 数（最近一次 input_tokens 是最佳近似）
	var latestInputTokens int64
	var latestUsage string
	db.DB.QueryRow(`SELECT usage FROM messages WHERE session_id=? AND role='assistant' AND usage != '' ORDER BY id DESC LIMIT 1`, sessionID).Scan(&latestUsage)
	if latestUsage != "" {
		var u map[string]interface{}
		if json.Unmarshal([]byte(latestUsage), &u) == nil {
			latestInputTokens = toInt64(u["input_tokens"])
		}
	}

	// 默认上下文窗口大小（200k tokens）
	contextWindow := int64(200000)

	var summary string
	db.DB.QueryRow(`SELECT summary FROM sessions WHERE id=?`, sessionID).Scan(&summary)

	c.JSON(http.StatusOK, gin.H{
		"session_id":         sessionID,
		"message_count":      msgCount,
		"total_input_tokens": totalInput,
		"total_output_tokens": totalOutput,
		"total_cache_read":   totalCacheRead,
		"total_cache_write":  totalCacheWrite,
		"total_cost_usd":     totalCost,
		"context_tokens":     latestInputTokens,
		"context_window":     contextWindow,
		"water_level":        float64(latestInputTokens) / float64(contextWindow),
		"has_summary":        summary != "",
	})
}

// SummarizeSession POST /api/sessions/:id/summarize
// 调用 LLM 对会话生成摘要并存入 sessions.summary
func SummarizeSession(c *gin.Context) {
	idStr := c.Param("id")
	sessionID, _ := strconv.ParseInt(idStr, 10, 64)
	if sessionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	// 获取最近 20 条消息
	rows, err := db.DB.Query(
		`SELECT role, content FROM (SELECT role, content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 20) sub ORDER BY rowid`,
		sessionID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var context string
	for rows.Next() {
		var role, content string
		rows.Scan(&role, &content)
		context += "[" + role + "]: " + content + "\n\n"
	}

	if context == "" {
		c.JSON(http.StatusOK, gin.H{"summary": ""})
		return
	}

	summaryPrompt := "请用 3-5 句话简洁总结以下对话的核心内容和要点，保留关键结论和决策：\n\n" + context
	reply, usedSID, err := RunClaudeSyncCtx(c.Request.Context(), summaryPrompt, 0, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "summarize failed: " + err.Error()})
		return
	}
	_ = usedSID

	// 存入 sessions.summary
	db.DB.Exec(`UPDATE sessions SET summary=? WHERE id=?`, reply, sessionID)

	c.JSON(http.StatusOK, gin.H{"summary": reply})
}

func toInt64(v interface{}) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case json.Number:
		i, _ := n.Int64()
		return i
	}
	return 0
}

func toFloat64(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	}
	return 0
}

// tryAutoSummarize 在对话结束后自动生成摘要（异步，满足条件才触发）
// 条件：消息数>=6、尚无摘要、距离上次更新超过 1 分钟
func tryAutoSummarize(sessionID int64) {
	go func() {
		var msgCount int
		var summary string
		db.DB.QueryRow(`SELECT message_count FROM sessions WHERE id=?`, sessionID).Scan(&msgCount)
		db.DB.QueryRow(`SELECT COALESCE(summary,'') FROM sessions WHERE id=?`, sessionID).Scan(&summary)

		if msgCount < 6 || summary != "" {
			return
		}

		rows, err := db.DB.Query(
			`SELECT role, content FROM (SELECT role, content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 10) sub ORDER BY rowid`,
			sessionID,
		)
		if err != nil {
			return
		}
		defer rows.Close()

		var context string
		for rows.Next() {
			var role, content string
			rows.Scan(&role, &content)
			if len(content) > 500 {
				content = content[:500] + "..."
			}
			context += "[" + role + "]: " + content + "\n\n"
		}
		if context == "" {
			return
		}

		summaryPrompt := "用一句话（不超过50字）概括以下对话的主题和关键内容：\n\n" + context
		reply, _, err := RunClaudeSyncCtx(gocontext.Background(), summaryPrompt, 0, nil)
		if err != nil || reply == "" {
			return
		}

		if len(reply) > 200 {
			reply = reply[:200]
		}
		db.DB.Exec(`UPDATE sessions SET summary=? WHERE id=?`, reply, sessionID)
	}()
}
