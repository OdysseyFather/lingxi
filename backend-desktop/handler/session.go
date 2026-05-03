package handler

import (
	"database/sql"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"lingxi-agent/db"
	"lingxi-agent/model"
)

// ListSessions GET /api/sessions?agent_id=N
func ListSessions(c *gin.Context) {
	agentIDStr := c.Query("agent_id")
	var (
		rows *sql.Rows
		err  error
	)
	if agentIDStr != "" {
		agentID, _ := strconv.ParseInt(agentIDStr, 10, 64)
		rows, err = db.DB.Query(`
			SELECT id, title, message_count, COALESCE(agent_id,0), COALESCE(pinned,0), created_at, updated_at
			FROM sessions WHERE COALESCE(agent_id,0)=? ORDER BY COALESCE(pinned,0) DESC, updated_at DESC
		`, agentID)
	} else {
		rows, err = db.DB.Query(`
			SELECT id, title, message_count, COALESCE(agent_id,0), COALESCE(pinned,0), created_at, updated_at
			FROM sessions ORDER BY COALESCE(pinned,0) DESC, updated_at DESC
		`)
	}
	if err != nil {
		log.Printf("[session] list error: %v", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	sessions := make([]model.Session, 0)
	for rows.Next() {
		var s model.Session
		if err := rows.Scan(&s.ID, &s.Title, &s.MessageCount, &s.AgentID, &s.Pinned, &s.CreatedAt, &s.UpdatedAt); err != nil {
			continue
		}
		sessions = append(sessions, s)
	}
	c.JSON(http.StatusOK, sessions)
}

// CreateSession POST /api/sessions
func CreateSession(c *gin.Context) {
	var body struct {
		Title   string `json:"title"`
		AgentID int64  `json:"agent_id"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.Title == "" {
		body.Title = "新对话"
	}

	res, err := db.DB.Exec(`INSERT INTO sessions (title, agent_id) VALUES (?,?)`, body.Title, body.AgentID)
	if err != nil {
		log.Printf("[session] create error: %v", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusOK, gin.H{"id": id, "title": body.Title, "agent_id": body.AgentID})
}

// UpdateSession PATCH /api/sessions/:id
func UpdateSession(c *gin.Context) {
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	var body struct {
		Title  *string `json:"title"`
		Pinned *bool   `json:"pinned"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if body.Title == nil && body.Pinned == nil {
		c.Status(http.StatusBadRequest)
		return
	}

	if body.Title != nil && *body.Title != "" {
		db.DB.Exec(`UPDATE sessions SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, *body.Title, sessionID)
	}
	if body.Pinned != nil {
		pinVal := 0
		if *body.Pinned {
			pinVal = 1
		}
		db.DB.Exec(`UPDATE sessions SET pinned=? WHERE id=?`, pinVal, sessionID)
	}
	c.Status(http.StatusOK)
}

// DeleteSession DELETE /api/sessions/:id
func DeleteSession(c *gin.Context) {
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	db.DB.Exec(`DELETE FROM messages WHERE session_id=?`, sessionID)
	res, err := db.DB.Exec(`DELETE FROM sessions WHERE id=?`, sessionID)
	if err != nil {
		log.Printf("[session] delete error: %v", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.Status(http.StatusNotFound)
		return
	}
	c.Status(http.StatusOK)
}

// ListMessages GET /api/sessions/:id/messages
func ListMessages(c *gin.Context) {
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	var exists int
	err = db.DB.QueryRow(`SELECT COUNT(1) FROM sessions WHERE id=?`, sessionID).Scan(&exists)
	if err != nil || exists == 0 {
		c.Status(http.StatusNotFound)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, session_id, role, content, COALESCE(usage,''), COALESCE(feedback,''), created_at
		FROM messages WHERE session_id=? ORDER BY id ASC
	`, sessionID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	msgs := make([]model.Message, 0)
	for rows.Next() {
		var m model.Message
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &m.Usage, &m.Feedback, &m.CreatedAt); err != nil {
			continue
		}
		msgs = append(msgs, m)
	}
	c.JSON(http.StatusOK, msgs)
}

// SearchMessages GET /api/messages/search?q=keyword
func SearchMessages(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}

	rows, err := db.DB.Query(`
		SELECT m.id, m.session_id, m.role, m.content, COALESCE(m.usage,''), m.created_at,
		       COALESCE(s.title,'') AS session_title
		FROM messages m
		LEFT JOIN sessions s ON s.id = m.session_id
		WHERE m.content LIKE '%' || ? || '%'
		ORDER BY m.created_at DESC
		LIMIT 50
	`, q)
	if err != nil {
		log.Printf("[search] query error: %v", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type SearchResult struct {
		ID           int64  `json:"id"`
		SessionID    int64  `json:"session_id"`
		Role         string `json:"role"`
		Content      string `json:"content"`
		Usage        string `json:"usage,omitempty"`
		CreatedAt    string `json:"created_at"`
		SessionTitle string `json:"session_title"`
	}

	results := make([]SearchResult, 0)
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.ID, &r.SessionID, &r.Role, &r.Content, &r.Usage, &r.CreatedAt, &r.SessionTitle); err != nil {
			continue
		}
		results = append(results, r)
	}
	c.JSON(http.StatusOK, results)
}

// UpdateMessage PUT /api/messages/:id — 编辑用户消息并删除后续消息
func UpdateMessage(c *gin.Context) {
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

	var sessionID int64
	var role string
	err = db.DB.QueryRow(`SELECT session_id, role FROM messages WHERE id=?`, msgID).Scan(&sessionID, &role)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	if role != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "只能编辑用户消息"})
		return
	}

	_, _ = db.DB.Exec(`UPDATE messages SET content=? WHERE id=?`, body.Content, msgID)
	res, _ := db.DB.Exec(`DELETE FROM messages WHERE session_id=? AND id>?`, sessionID, msgID)
	deleted, _ := res.RowsAffected()
	if deleted > 0 {
		db.DB.Exec(`UPDATE sessions SET message_count=message_count-?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, deleted, sessionID)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "session_id": sessionID})
}

// SetMessageFeedback POST /api/messages/:id/feedback
func SetMessageFeedback(c *gin.Context) {
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

	res, err := db.DB.Exec(`UPDATE messages SET feedback=? WHERE id=?`, body.Feedback, msgID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.Status(http.StatusNotFound)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func getClaudeSessionID(sessionID int64) string {
	var cid string
	_ = db.DB.QueryRow(`SELECT claude_session_id FROM sessions WHERE id=?`, sessionID).Scan(&cid)
	return cid
}

func saveClaudeSessionID(sessionID int64, claudeID string) {
	_, _ = db.DB.Exec(`UPDATE sessions SET claude_session_id=? WHERE id=?`, claudeID, sessionID)
}

func appendMessage(sessionID int64, role, content string) {
	_, err := db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (?,?,?)`, sessionID, role, content)
	if err != nil {
		log.Printf("[msg] insert error: %v", err)
		return
	}
	_, _ = db.DB.Exec(`UPDATE sessions SET message_count=message_count+1, updated_at=CURRENT_TIMESTAMP WHERE id=?`, sessionID)
}

// appendMessageWithUsage 插入带 usage 摘要的消息，返回新消息 ID
func appendMessageWithUsage(sessionID int64, role, content, usageJSON string) int64 {
	res, err := db.DB.Exec(`INSERT INTO messages (session_id, role, content, usage) VALUES (?,?,?,?)`,
		sessionID, role, content, usageJSON)
	if err != nil {
		log.Printf("[msg] insert error: %v", err)
		return 0
	}
	id, _ := res.LastInsertId()
	_, _ = db.DB.Exec(`UPDATE sessions SET message_count=message_count+1, updated_at=CURRENT_TIMESTAMP WHERE id=?`, sessionID)
	return id
}

func updateSessionTitle(sessionID int64, title string) {
	_, _ = db.DB.Exec(`UPDATE sessions SET title=? WHERE id=? AND title='新对话'`, title, sessionID)
}

// EnsureSession 验证 session 存在（单机无需归属校验）
func ensureSession(sessionID int64) error {
	var exists int
	return db.DB.QueryRow(`SELECT COUNT(1) FROM sessions WHERE id=?`, sessionID).Scan(&exists)
}

var _ = sql.ErrNoRows // 避免 unused import

// GetPendingTask GET /api/sessions/:id/pending
func GetPendingTask(c *gin.Context) {
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	taskDesc, missingFields, found := db.GetPendingTask(sessionID)
	if !found {
		c.JSON(http.StatusOK, gin.H{"pending": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"pending": gin.H{
			"session_id":     sessionID,
			"task_desc":      taskDesc,
			"missing_fields": missingFields,
		},
	})
}

// ClearPendingTask DELETE /api/sessions/:id/pending
func ClearPendingTask(c *gin.Context) {
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	db.ClearPendingTask(sessionID)
	c.Status(http.StatusOK)
}
