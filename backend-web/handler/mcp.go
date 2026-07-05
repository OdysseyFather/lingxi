package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"lingxi-core/store"

	"github.com/gin-gonic/gin"
)

// ListMCPServers GET /api/mcp
func ListMCPServers(c *gin.Context) {
	uid := userID(c)
	list, err := webStore.ListMCPServers(c.Request.Context(), uid)
	if err != nil {
		slog.Warn("ListMCPServers", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, list)
}

// UpsertMCPServer POST /api/mcp
func UpsertMCPServer(c *gin.Context) {
	uid := userID(c)
	var body store.MCPServer
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, err := webStore.UpsertMCPServer(c.Request.Context(), uid, &body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// DeleteMCPServer DELETE /api/mcp/:id
func DeleteMCPServer(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := webStore.DeleteMCPServer(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

// ToggleMCPServer POST /api/mcp/:id/toggle
func ToggleMCPServer(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if err := webStore.SetMCPServerEnabled(c.Request.Context(), uid, id, body.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
