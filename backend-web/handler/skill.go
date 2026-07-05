package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ListSkills GET /api/skills
func ListSkills(c *gin.Context) {
	uid := userID(c)
	list, err := webStore.ListSkills(c.Request.Context(), uid)
	if err != nil {
		slog.Warn("ListSkills", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, list)
}

// GetSkill GET /api/skills/:id
func GetSkill(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	sk, err := webStore.GetSkill(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, sk)
}

// DeleteSkill DELETE /api/skills/:id
func DeleteSkill(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := webStore.DeleteSkill(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}
