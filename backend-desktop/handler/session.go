package handler

import (
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os/exec"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"lingxi-agent/db"
	"lingxi-agent/model"
)

// ListSessions GET /api/sessions?agent_id=N&mode=coding&project_path=/path
func ListSessions(c *gin.Context) {
	agentIDStr := c.Query("agent_id")
	modeFilter := c.Query("mode")
	projectPath := c.Query("project_path")

	modeVal := ""
	if modeFilter != "" {
		modeVal = modeFilter
	}

	var (
		rows *sql.Rows
		err  error
	)

	baseSelect := `SELECT id, title, message_count, COALESCE(agent_id,0), COALESCE(pinned,0), COALESCE(folder,''), COALESCE(permission_mode,'trust'), COALESCE(project_path,''), created_at, updated_at FROM sessions`
	orderBy := ` ORDER BY COALESCE(pinned,0) DESC, updated_at DESC`

	if agentIDStr != "" {
		agentID, _ := strconv.ParseInt(agentIDStr, 10, 64)
		if projectPath != "" {
			rows, err = db.DB.Query(baseSelect+` WHERE COALESCE(agent_id,0)=? AND COALESCE(is_a2a,0)=0 AND COALESCE(mode,'')=? AND COALESCE(project_path,'')=?`+orderBy, agentID, modeVal, projectPath)
		} else {
			rows, err = db.DB.Query(baseSelect+` WHERE COALESCE(agent_id,0)=? AND COALESCE(is_a2a,0)=0 AND COALESCE(mode,'')=?`+orderBy, agentID, modeVal)
		}
	} else {
		if projectPath != "" {
			rows, err = db.DB.Query(baseSelect+` WHERE COALESCE(is_a2a,0)=0 AND COALESCE(mode,'')=? AND COALESCE(project_path,'')=?`+orderBy, modeVal, projectPath)
		} else {
			rows, err = db.DB.Query(baseSelect+` WHERE COALESCE(is_a2a,0)=0 AND COALESCE(mode,'')=?`+orderBy, modeVal)
		}
	}
	if err != nil {
		slog.Warn("list error", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	sessions := make([]model.Session, 0)
	for rows.Next() {
		var s model.Session
		if err := rows.Scan(&s.ID, &s.Title, &s.MessageCount, &s.AgentID, &s.Pinned, &s.Folder, &s.PermissionMode, &s.ProjectPath, &s.CreatedAt, &s.UpdatedAt); err != nil {
			continue
		}
		sessions = append(sessions, s)
	}
	c.JSON(http.StatusOK, sessions)
}

// CreateSession POST /api/sessions
func CreateSession(c *gin.Context) {
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

	res, err := db.DB.Exec(`INSERT INTO sessions (title, agent_id, permission_mode, mode, project_path) VALUES (?,?,?,?,?)`, body.Title, body.AgentID, body.PermissionMode, body.Mode, body.ProjectPath)
	if err != nil {
		slog.Warn("create error", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusOK, gin.H{"id": id, "title": body.Title, "agent_id": body.AgentID, "permission_mode": body.PermissionMode, "mode": body.Mode, "project_path": body.ProjectPath})
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
		Folder *string `json:"folder"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if body.Title == nil && body.Pinned == nil && body.Folder == nil {
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
	if body.Folder != nil {
		db.DB.Exec(`UPDATE sessions SET folder=? WHERE id=?`, *body.Folder, sessionID)
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
		slog.Warn("delete error", "err", err)
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

// BatchDeleteSessions POST /api/sessions/batch-delete
func BatchDeleteSessions(c *gin.Context) {
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}
	deleted := 0
	for _, id := range body.IDs {
		db.DB.Exec(`DELETE FROM messages WHERE session_id=?`, id)
		res, err := db.DB.Exec(`DELETE FROM sessions WHERE id=?`, id)
		if err != nil {
			continue
		}
		n, _ := res.RowsAffected()
		deleted += int(n)
	}
	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
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
		SELECT id, session_id, role, content, COALESCE(usage,''), COALESCE(feedback,''), COALESCE(pinned,0), created_at
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
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &m.Usage, &m.Feedback, &m.Pinned, &m.CreatedAt); err != nil {
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
		WHERE m.content LIKE '%' || ? || '%' AND COALESCE(s.is_a2a,0)=0
		ORDER BY m.created_at DESC
		LIMIT 50
	`, q)
	if err != nil {
		slog.Warn("query error", "err", err)
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

	if body.Feedback == "down" {
		var sessionID, agentID int64
		var content string
		db.DB.QueryRow(`SELECT session_id, content FROM messages WHERE id=?`, msgID).Scan(&sessionID, &content)
		if sessionID > 0 {
			db.DB.QueryRow(`SELECT agent_id FROM sessions WHERE id=?`, sessionID).Scan(&agentID)
			if agentID > 0 {
				ctx := buildConversationContext(sessionID, msgID)
				TryAutoEvolution(agentID, sessionID, ctx)
			}
		}
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
		slog.Warn("insert error", "err", err)
		return
	}
	_, _ = db.DB.Exec(`UPDATE sessions SET message_count=message_count+1, updated_at=CURRENT_TIMESTAMP WHERE id=?`, sessionID)
}

// appendMessageWithUsage 插入带 usage 摘要的消息，返回新消息 ID
func appendMessageWithUsage(sessionID int64, role, content, usageJSON string) int64 {
	res, err := db.DB.Exec(`INSERT INTO messages (session_id, role, content, usage) VALUES (?,?,?,?)`,
		sessionID, role, content, usageJSON)
	if err != nil {
		slog.Warn("insert error", "err", err)
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

func buildConversationContext(sessionID, aroundMsgID int64) string {
	var rows *sql.Rows
	var err error
	if aroundMsgID > 0 {
		rows, err = db.DB.Query(
			`SELECT role, content FROM messages WHERE session_id=? AND id >= ? - 5 AND id <= ? + 1 ORDER BY id`,
			sessionID, aroundMsgID, aroundMsgID,
		)
	} else {
		rows, err = db.DB.Query(
			`SELECT role, content FROM (SELECT role, content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 10) sub ORDER BY rowid`,
			sessionID,
		)
	}
	if err != nil {
		return ""
	}
	defer rows.Close()
	var parts []string
	for rows.Next() {
		var role, content string
		rows.Scan(&role, &content)
		parts = append(parts, fmt.Sprintf("[%s]: %s", role, content))
	}
	return strings.Join(parts, "\n\n")
}

// RestoreSession POST /api/sessions/:id/restore
// 回滚到指定消息之前：删除该消息及之后的所有消息 + 重置 claude_session_id + 可选 git checkout 还原代码
func RestoreSession(c *gin.Context) {
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var body struct {
		MessageID  int64  `json:"messageId"`
		WorkingDir string `json:"workingDir"`
		RevertCode bool   `json:"revertCode"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.MessageID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 messageId"})
		return
	}

	// 1. 删除目标消息及之后的所有消息
	res, err := db.DB.Exec(`DELETE FROM messages WHERE session_id=? AND id>=?`, sessionID, body.MessageID)
	if err != nil {
		slog.Warn("restore: delete messages error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除消息失败"})
		return
	}
	deleted, _ := res.RowsAffected()

	// 2. 更新消息计数
	var count int
	_ = db.DB.QueryRow(`SELECT COUNT(1) FROM messages WHERE session_id=?`, sessionID).Scan(&count)
	_, _ = db.DB.Exec(`UPDATE sessions SET message_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, count, sessionID)

	// 3. 重置 claude_session_id（回滚后需要创建新的 claude 会话）
	_, _ = db.DB.Exec(`UPDATE sessions SET claude_session_id='' WHERE id=?`, sessionID)

	// 4. 如果要求还原代码且有工作目录
	var revertResult string
	if body.RevertCode && body.WorkingDir != "" {
		revertResult = revertGitChanges(body.WorkingDir)
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":           true,
		"deleted":      deleted,
		"remaining":    count,
		"revertResult": revertResult,
	})
}

// revertGitChanges 在工作目录中还原所有未提交的代码变更
func revertGitChanges(workingDir string) string {
	dir := expandHome(workingDir)

	// git checkout -- . (还原已跟踪文件的修改)
	cmd1 := exec.Command("git", "checkout", "--", ".")
	cmd1.Dir = dir
	out1, err1 := cmd1.CombinedOutput()

	// git clean -fd (删除未跟踪的新文件)
	cmd2 := exec.Command("git", "clean", "-fd")
	cmd2.Dir = dir
	out2, err2 := cmd2.CombinedOutput()

	result := ""
	if err1 != nil {
		result += "checkout error: " + string(out1) + "; "
	} else {
		result += "checkout ok; "
	}
	if err2 != nil {
		result += "clean error: " + string(out2)
	} else {
		result += "clean ok"
	}
	slog.Info("revertGitChanges", "dir", dir, "result", result)
	return result
}
