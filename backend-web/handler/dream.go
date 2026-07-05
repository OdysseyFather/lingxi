package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// WebGetDreamConfig GET /api/dream/config
func WebGetDreamConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"enabled":        false,
		"interval_hours": 8,
		"min_memories":   5,
		"cooldown_hours": 48,
		"quiet_start":    -1,
		"quiet_end":      -1,
		"max_sessions":   20,
		"running":        false,
	})
}

// WebUpdateDreamConfig PUT /api/dream/config
func WebUpdateDreamConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebGetDreamStatus GET /api/dream/status
func WebGetDreamStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"running": false})
}

// WebTriggerDream POST /api/dream/trigger
func WebTriggerDream(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "Web 版 Dream 暂未实现完整引擎"})
}

// WebGetAgentDreamHistory GET /api/agents/:id/dream/history
func WebGetAgentDreamHistory(c *gin.Context) {
	uid := userID(c)
	agentID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 {
		limit = 20
	}

	logs, err := getEvoStore().ListDreamLogs(c.Request.Context(), uid, agentID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, logs)
}
