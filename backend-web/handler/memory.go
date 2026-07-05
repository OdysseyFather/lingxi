package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ListMemories GET /api/memories?agent_id=N
func ListMemories(c *gin.Context) {
	uid := userID(c)
	agentID, _ := strconv.ParseInt(c.DefaultQuery("agent_id", "0"), 10, 64)
	list, err := webStore.ListMemories(c.Request.Context(), uid, agentID, 200)
	if err != nil {
		slog.Warn("ListMemories", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, list)
}

// CreateMemory POST /api/memories
func CreateMemory(c *gin.Context) {
	uid := userID(c)
	var body struct {
		AgentID  int64  `json:"agent_id"`
		Content  string `json:"content"`
		Category string `json:"category"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "content 不能为空"})
		return
	}
	id, err := webStore.CreateMemory(c.Request.Context(), uid, body.AgentID, body.Content, body.Category)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// DeleteMemory DELETE /api/memories/:id
func DeleteMemory(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := webStore.DeleteMemory(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

// ClearMemories DELETE /api/memories/clear?agent_id=N
func ClearMemories(c *gin.Context) {
	uid := userID(c)
	agentID, _ := strconv.ParseInt(c.DefaultQuery("agent_id", "0"), 10, 64)
	if err := webStore.ClearMemories(c.Request.Context(), uid, agentID); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusOK)
}
