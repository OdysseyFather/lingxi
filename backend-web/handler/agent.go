package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"lingxi-core/store"

	"github.com/gin-gonic/gin"
)

// ListAgents GET /api/agents
func ListAgents(c *gin.Context) {
	uid := userID(c)
	list, err := webStore.ListAgents(c.Request.Context(), uid)
	if err != nil {
		slog.Warn("ListAgents", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, list)
}

// GetAgent GET /api/agents/:id
func GetAgent(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	a, err := webStore.GetAgent(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, a)
}

// UpsertAgent POST /api/agents
func UpsertAgent(c *gin.Context) {
	uid := userID(c)
	var body store.Agent
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, err := webStore.UpsertAgent(c.Request.Context(), uid, &body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// DeleteAgent DELETE /api/agents/:id
func DeleteAgent(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := webStore.DeleteAgent(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}
