package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ListKnowledge GET /api/knowledge
func ListKnowledge(c *gin.Context) {
	uid := userID(c)
	list, err := webStore.ListKnowledge(c.Request.Context(), uid)
	if err != nil {
		slog.Warn("ListKnowledge", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, list)
}

// GetKnowledge GET /api/knowledge/:id
func GetKnowledge(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	item, err := webStore.GetKnowledge(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

// DeleteKnowledge DELETE /api/knowledge/:id
func DeleteKnowledge(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	_, err := webStore.DeleteKnowledge(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}
