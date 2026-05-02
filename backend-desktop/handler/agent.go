package handler

import (
	"net/http"
	"strconv"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// ListAgents GET /api/agents
func ListAgents(c *gin.Context) {
	list, err := db.ListAgents()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// GetAgent GET /api/agents/:id
func GetAgent(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	a, err := db.GetAgent(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, a)
}

// UpsertAgent POST /api/agents
func UpsertAgent(c *gin.Context) {
	var body db.Agent
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	if body.Avatar == "" {
		body.Avatar = "✦"
	}
	if body.SkillIDs == "" {
		body.SkillIDs = "[]"
	}
	if body.MCPServerIDs == "" {
		body.MCPServerIDs = "[]"
	}
	if body.KnowledgeIDs == "" {
		body.KnowledgeIDs = "[]"
	}
	id, err := db.UpsertAgent(&body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	BroadcastEvent("agent_changed", map[string]any{"id": id})
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// DeleteAgent DELETE /api/agents/:id
func DeleteAgent(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := db.DeleteAgent(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	BroadcastEvent("agent_changed", map[string]any{"id": id, "deleted": true})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SetSessionAgent POST /api/sessions/:id/agent  body:{agent_id}
func SetSessionAgent(c *gin.Context) {
	sid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		AgentID int64 `json:"agent_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := db.SetSessionAgent(sid, body.AgentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

