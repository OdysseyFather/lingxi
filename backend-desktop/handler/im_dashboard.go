package handler

import (
	"net/http"
	"strconv"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// ListIMSessionsHandler 获取 IM 会话列表
// GET /api/im-dashboard/sessions?platform=feishu
func ListIMSessionsHandler(c *gin.Context) {
	platform := c.Query("platform")
	sessions, err := db.ListIMSessions(platform)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if sessions == nil {
		sessions = []db.IMSessionInfo{}
	}
	c.JSON(http.StatusOK, sessions)
}

// GetIMDashboardStatsHandler 获取 IM 看板统计
// GET /api/im-dashboard/stats
func GetIMDashboardStatsHandler(c *gin.Context) {
	stats, err := db.GetIMDashboardStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// GetIMSessionMessagesHandler 获取 IM 会话的消息列表
// GET /api/im-dashboard/sessions/:id/messages?limit=50&before=xxx
func GetIMSessionMessagesHandler(c *gin.Context) {
	imSessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	// 先查 im_sessions 拿到实际的 session_id
	var sessionID int64
	row := db.DB.QueryRow(`SELECT session_id FROM im_sessions WHERE id=?`, imSessionID)
	if err := row.Scan(&sessionID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "IM session not found"})
		return
	}

	limit := 50
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 200 {
		limit = l
	}
	beforeID := int64(0)
	if b, err := strconv.ParseInt(c.Query("before"), 10, 64); err == nil {
		beforeID = b
	}

	var msgs []map[string]interface{}
	var query string
	var args []interface{}

	if beforeID > 0 {
		query = `SELECT id, session_id, role, content, created_at FROM messages
		         WHERE session_id=? AND id < ? ORDER BY id DESC LIMIT ?`
		args = []interface{}{sessionID, beforeID, limit}
	} else {
		query = `SELECT id, session_id, role, content, created_at FROM messages
		         WHERE session_id=? ORDER BY id DESC LIMIT ?`
		args = []interface{}{sessionID, limit}
	}

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, sid int64
		var role, content, createdAt string
		if err := rows.Scan(&id, &sid, &role, &content, &createdAt); err != nil {
			continue
		}
		msgs = append(msgs, map[string]interface{}{
			"id":         id,
			"session_id": sid,
			"role":       role,
			"content":    content,
			"created_at": createdAt,
		})
	}

	// 翻转为正序
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	if msgs == nil {
		msgs = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, msgs)
}

// DeleteIMSessionHandler 删除 IM 会话映射
// DELETE /api/im-dashboard/sessions/:id
func DeleteIMSessionHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := db.DeleteIMSession(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
