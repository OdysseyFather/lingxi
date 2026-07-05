package handler

import (
	"net/http"
	"strconv"

	"lingxi-web-agent/db/mysql"

	"github.com/gin-gonic/gin"
)

func getEvoStore() *mysql.MySQLStore {
	return webStore.(*mysql.MySQLStore)
}

// WebGetEvolutionConfig GET /api/agents/:id/evolution
func WebGetEvolutionConfig(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	enabled := getEvoStore().GetAgentEvolutionEnabled(c.Request.Context(), uid, id)
	c.JSON(http.StatusOK, gin.H{"agent_id": id, "enabled": enabled})
}

// WebSetEvolutionConfig PUT /api/agents/:id/evolution
func WebSetEvolutionConfig(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := getEvoStore().SetAgentEvolutionEnabled(c.Request.Context(), uid, id, body.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebListEvolutionLogs GET /api/agents/:id/evolution/logs
func WebListEvolutionLogs(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	logs, err := getEvoStore().ListEvolutionLogs(c.Request.Context(), uid, id, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if logs == nil {
		logs = []mysql.EvolutionLog{}
	}
	c.JSON(http.StatusOK, logs)
}

// WebListAllEvolutionLogs GET /api/evolution/logs
func WebListAllEvolutionLogs(c *gin.Context) {
	uid := userID(c)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	logs, err := getEvoStore().ListAllEvolutionLogs(c.Request.Context(), uid, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if logs == nil {
		logs = []mysql.EvolutionLog{}
	}
	c.JSON(http.StatusOK, logs)
}

// WebGetEvolutionStats GET /api/evolution/stats
func WebGetEvolutionStats(c *gin.Context) {
	uid := userID(c)
	stats, err := getEvoStore().GetEvolutionStats(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// WebDeleteEvolutionLog DELETE /api/evolution/logs/:id
func WebDeleteEvolutionLog(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	getEvoStore().DeleteEvolutionLog(c.Request.Context(), uid, id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebClearEvolutionLogs DELETE /api/agents/:id/evolution/logs
func WebClearEvolutionLogs(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	getEvoStore().ClearEvolutionLogs(c.Request.Context(), uid, id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebRevertEvolutionLog POST /api/evolution/logs/:id/revert
func WebRevertEvolutionLog(c *gin.Context) {
	uid := userID(c)
	logID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	log, err := getEvoStore().GetEvolutionLog(c.Request.Context(), uid, logID)
	if err != nil || log == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "日志不存在"})
		return
	}
	if log.Status == "reverted" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该进化已被撤销"})
		return
	}

	switch log.Action {
	case "create_memory":
		if log.TargetID > 0 {
			getEvoStore().DeleteMemory(c.Request.Context(), uid, log.TargetID)
		}
	default:
		// 其他类型暂不支持撤销
	}

	getEvoStore().UpdateEvolutionLogStatus(c.Request.Context(), uid, logID, "reverted")
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已撤销: " + log.Summary})
}
