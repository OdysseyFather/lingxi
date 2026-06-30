package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"lingxi-agent/db"
)

// GetProactiveConfig GET /api/proactive/config
func GetProactiveConfig(c *gin.Context) {
	var digestEnabled, digestTime, digestAgentID string
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='proactive_digest_enabled'`).Scan(&digestEnabled)
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='proactive_digest_time'`).Scan(&digestTime)
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='proactive_digest_agent_id'`).Scan(&digestAgentID)

	if digestTime == "" {
		digestTime = "09:00"
	}

	c.JSON(http.StatusOK, gin.H{
		"digest_enabled":  digestEnabled == "1",
		"digest_time":     digestTime,
		"digest_agent_id": digestAgentID,
	})
}

// UpdateProactiveConfig PUT /api/proactive/config
func UpdateProactiveConfig(c *gin.Context) {
	var body struct {
		DigestEnabled bool   `json:"digest_enabled"`
		DigestTime    string `json:"digest_time"`
		DigestAgentID string `json:"digest_agent_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	enabled := "0"
	if body.DigestEnabled {
		enabled = "1"
	}
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('proactive_digest_enabled', ?)`, enabled)
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('proactive_digest_time', ?)`, body.DigestTime)
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('proactive_digest_agent_id', ?)`, body.DigestAgentID)

	// 创建或更新对应的定时任务
	syncDigestScheduledTask(body.DigestEnabled, body.DigestTime)

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// TriggerDigest POST /api/proactive/trigger-digest
func TriggerDigest(c *gin.Context) {
	summary := buildDailySummary()
	if summary == "" {
		c.JSON(http.StatusOK, gin.H{"summary": "今天暂无活动记录。"})
		return
	}

	agentIDStr := ""
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='proactive_digest_agent_id'`).Scan(&agentIDStr)
	agentID, _ := strconv.ParseInt(agentIDStr, 10, 64)
	if agentID == 0 {
		agentID = 1
	}

	prompt := buildDigestPrompt(summary)
	reply, _, err := RunClaudeSync(prompt, 0, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"digest": reply, "raw_summary": summary})
}

// buildDailySummary 汇总今日活动数据
func buildDailySummary() string {
	today := time.Now().Format("2006-01-02")

	var parts []string

	// 今日对话数
	var sessionCount int
	db.DB.QueryRow(`SELECT COUNT(1) FROM sessions WHERE date(updated_at)=?`, today).Scan(&sessionCount)
	if sessionCount > 0 {
		parts = append(parts, fmt.Sprintf("今日活跃对话 %d 个", sessionCount))
	}

	// 今日消息数
	var msgCount int
	db.DB.QueryRow(`SELECT COUNT(1) FROM messages WHERE date(created_at)=?`, today).Scan(&msgCount)
	if msgCount > 0 {
		parts = append(parts, fmt.Sprintf("今日消息 %d 条", msgCount))
	}

	// 今日 token 用量
	var totalInput, totalOutput int64
	rows, _ := db.DB.Query(`SELECT usage FROM messages WHERE date(created_at)=? AND usage!=''`, today)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var usageStr string
			rows.Scan(&usageStr)
			totalInput += extractTokenField(usageStr, "input_tokens")
			totalOutput += extractTokenField(usageStr, "output_tokens")
		}
	}
	if totalInput > 0 || totalOutput > 0 {
		parts = append(parts, fmt.Sprintf("Token 用量：输入 %dK，输出 %dK", totalInput/1000, totalOutput/1000))
	}

	// 今日新记忆
	var memoryCount int
	db.DB.QueryRow(`SELECT COUNT(1) FROM memories WHERE date(created_at)=?`, today).Scan(&memoryCount)
	if memoryCount > 0 {
		parts = append(parts, fmt.Sprintf("新增记忆 %d 条", memoryCount))
	}

	// 进化事件
	var evoCount int
	db.DB.QueryRow(`SELECT COUNT(1) FROM evolution_logs WHERE date(created_at)=?`, today).Scan(&evoCount)
	if evoCount > 0 {
		parts = append(parts, fmt.Sprintf("Agent 进化 %d 次", evoCount))
	}

	// 最近 3 个会话的摘要
	var recentSummaries []string
	rows2, _ := db.DB.Query(`SELECT title, COALESCE(summary,'') FROM sessions WHERE date(updated_at)=? ORDER BY updated_at DESC LIMIT 3`, today)
	if rows2 != nil {
		defer rows2.Close()
		for rows2.Next() {
			var title, summary string
			rows2.Scan(&title, &summary)
			if summary != "" {
				recentSummaries = append(recentSummaries, fmt.Sprintf("- %s：%s", title, summary))
			} else if title != "" {
				recentSummaries = append(recentSummaries, fmt.Sprintf("- %s", title))
			}
		}
	}
	if len(recentSummaries) > 0 {
		parts = append(parts, "最近对话：\n"+strings.Join(recentSummaries, "\n"))
	}

	return strings.Join(parts, "\n")
}

func buildDigestPrompt(summary string) string {
	return fmt.Sprintf(`你是用户的 AI 助手。请根据以下今日活动数据，生成一份简洁友好的每日工作摘要。
要求：
1. 用自然语言总结今天的工作进展
2. 如果有明显的未完成事项，温柔提醒
3. 给出 1-2 个明天可以继续的建议
4. 语气像朋友一样亲切，不要太正式
5. 控制在 200 字以内

今日活动数据：
%s`, summary)
}

func extractTokenField(usageStr, field string) int64 {
	idx := strings.Index(usageStr, `"`+field+`"`)
	if idx < 0 {
		return 0
	}
	rest := usageStr[idx+len(field)+3:]
	colonIdx := strings.Index(rest, ":")
	if colonIdx < 0 {
		return 0
	}
	numStr := strings.TrimLeft(rest[colonIdx+1:], " ")
	end := strings.IndexAny(numStr, ",}")
	if end > 0 {
		numStr = numStr[:end]
	}
	val, _ := strconv.ParseInt(strings.TrimSpace(numStr), 10, 64)
	return val
}

// syncDigestScheduledTask 创建或更新日报定时任务
func syncDigestScheduledTask(enabled bool, digestTime string) {
	taskName := "[系统] 每日工作摘要"

	var taskID int64
	db.DB.QueryRow(`SELECT id FROM scheduled_tasks WHERE name=?`, taskName).Scan(&taskID)

	parts := strings.Split(digestTime, ":")
	hour := "9"
	minute := "0"
	if len(parts) >= 2 {
		hour = parts[0]
		minute = parts[1]
	}
	cron := fmt.Sprintf("%s %s * * *", minute, hour)

	if taskID == 0 && enabled {
		db.DB.Exec(`INSERT INTO scheduled_tasks (name, cron_expr, prompt, agent_id, stateful, enabled) VALUES (?, ?, ?, 1, 0, 1)`,
			taskName, cron, "请生成今日工作摘要。总结今天的对话内容和 AI 使用情况。")
	} else if taskID > 0 {
		enabledInt := 0
		if enabled {
			enabledInt = 1
		}
		db.DB.Exec(`UPDATE scheduled_tasks SET cron_expr=?, enabled=? WHERE id=?`, cron, enabledInt, taskID)
	}
}
