package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"lingxi-core/store"

	"github.com/gin-gonic/gin"
)

func userID(c *gin.Context) int64 {
	v, _ := c.Get("userID")
	id, _ := v.(int64)
	return id
}

// ListSessions GET /api/sessions?agent_id=N&mode=&project_path=
func ListSessions(c *gin.Context) {
	uid := userID(c)
	agentID, _ := strconv.ParseInt(c.Query("agent_id"), 10, 64)
	filter := store.SessionFilter{
		AgentID:     agentID,
		Mode:        c.Query("mode"),
		ProjectPath: c.Query("project_path"),
		ExcludeA2A:  true,
	}
	list, err := webStore.ListSessions(c.Request.Context(), uid, filter)
	if err != nil {
		slog.Warn("ListSessions", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, list)
}

// CreateSession POST /api/sessions
func CreateSession(c *gin.Context) {
	uid := userID(c)
	var body struct {
		Title          string `json:"title"`
		AgentID        int64  `json:"agent_id"`
		PermissionMode string `json:"permission_mode"`
		Mode           string `json:"mode"`
		ProjectPath    string `json:"project_path"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.Title == "" {
		body.Title = "新对话"
	}
	if body.PermissionMode == "" {
		body.PermissionMode = "trust"
	}
	sess := &store.Session{
		Title:          body.Title,
		AgentID:        body.AgentID,
		PermissionMode: body.PermissionMode,
		Mode:           body.Mode,
		ProjectPath:    body.ProjectPath,
	}
	id, err := webStore.CreateSession(c.Request.Context(), uid, sess)
	if err != nil {
		slog.Warn("CreateSession", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id": id, "title": body.Title, "agent_id": body.AgentID,
		"permission_mode": body.PermissionMode, "mode": body.Mode,
		"project_path": body.ProjectPath,
	})
}

// UpdateSession PATCH /api/sessions/:id
func UpdateSession(c *gin.Context) {
	uid := userID(c)
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var body struct {
		Title          *string `json:"title"`
		Pinned         *bool   `json:"pinned"`
		Folder         *string `json:"folder"`
		PermissionMode *string `json:"permission_mode"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if body.Title == nil && body.Pinned == nil && body.Folder == nil && body.PermissionMode == nil {
		c.Status(http.StatusBadRequest)
		return
	}
	patch := store.SessionPatch{
		Title:          body.Title,
		Pinned:         body.Pinned,
		Folder:         body.Folder,
		PermissionMode: body.PermissionMode,
	}
	if err := webStore.UpdateSession(c.Request.Context(), uid, sessionID, patch); err != nil {
		slog.Warn("UpdateSession", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusOK)
}

// DeleteSession DELETE /api/sessions/:id
func DeleteSession(c *gin.Context) {
	uid := userID(c)
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if err := webStore.DeleteSession(c.Request.Context(), uid, sessionID); err != nil {
		slog.Warn("DeleteSession", "err", err)
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

// BatchDeleteSessions POST /api/sessions/batch-delete
func BatchDeleteSessions(c *gin.Context) {
	uid := userID(c)
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}
	deleted, _ := webStore.BatchDeleteSessions(c.Request.Context(), uid, body.IDs)
	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
}

// SetSessionAgent POST /api/sessions/:id/agent
func SetSessionAgent(c *gin.Context) {
	uid := userID(c)
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var body struct {
		AgentID int64 `json:"agent_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if err := webStore.SetSessionAgent(c.Request.Context(), uid, sessionID, body.AgentID); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusOK)
}
