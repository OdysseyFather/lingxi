package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"lingxi-core/store"

	"github.com/gin-gonic/gin"
)

// ListMessages GET /api/sessions/:id/messages?before_id=&limit=
func ListMessages(c *gin.Context) {
	uid := userID(c)
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	beforeID, _ := strconv.ParseInt(c.Query("before_id"), 10, 64)
	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit < 0 || limit > 200 {
		limit = 0
	}
	page := store.MessagePage{BeforeID: beforeID, Limit: limit}
	msgs, err := webStore.ListMessages(c.Request.Context(), uid, sessionID, page)
	if err != nil {
		slog.Warn("ListMessages", "err", err)
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if limit > 0 {
		c.JSON(http.StatusOK, gin.H{
			"messages": msgs,
			"has_more": len(msgs) == limit,
		})
		return
	}
	c.JSON(http.StatusOK, msgs)
}

// SearchMessages GET /api/messages/search?q=keyword
func SearchMessages(c *gin.Context) {
	uid := userID(c)
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	hits, err := webStore.SearchMessages(c.Request.Context(), uid, q, 50)
	if err != nil {
		slog.Warn("SearchMessages", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, hits)
}

// UpdateMessage PUT /api/messages/:id
func UpdateMessage(c *gin.Context) {
	uid := userID(c)
	msgID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var body struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "content 不能为空"})
		return
	}
	ctx := c.Request.Context()
	msg, err := webStore.GetMessage(ctx, uid, msgID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	if msg.Role != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "只能编辑用户消息"})
		return
	}
	if err := webStore.UpdateMessage(ctx, uid, msgID, body.Content); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	deleted, _ := webStore.DeleteMessagesAfter(ctx, uid, msg.SessionID, msgID)
	_ = deleted
	c.JSON(http.StatusOK, gin.H{"ok": true, "session_id": msg.SessionID})
}

// SetMessageFeedback POST /api/messages/:id/feedback
func SetMessageFeedback(c *gin.Context) {
	uid := userID(c)
	msgID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var body struct {
		Feedback string `json:"feedback"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if body.Feedback != "" && body.Feedback != "up" && body.Feedback != "down" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "feedback 值只能为 up / down / 空"})
		return
	}
	if err := webStore.SetMessageFeedback(c.Request.Context(), uid, msgID, body.Feedback); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
