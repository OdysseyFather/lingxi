package handler

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"lingxi-web-agent/db/mysql"

	"github.com/gin-gonic/gin"
)

// ────────────────── 后台任务管理 ──────────────────

// WebListTasks GET /api/tasks?sessionId=xxx
func WebListTasks(c *gin.Context) {
	uid := userID(c)
	ctx := c.Request.Context()

	query := `SELECT id, user_id, session_id, created_at FROM tasks WHERE user_id=?`
	args := []interface{}{uid}

	if sid := c.Query("sessionId"); sid != "" {
		sessionID, err := strconv.ParseInt(sid, 10, 64)
		if err != nil {
			c.Status(http.StatusBadRequest)
			return
		}
		query += ` AND session_id=?`
		args = append(args, sessionID)
	}
	query += ` ORDER BY id DESC LIMIT 100`

	rows, err := mysql.DB.QueryContext(ctx, query, args...)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tasks []gin.H
	for rows.Next() {
		var id, userID, sessionID int64
		var createdAt string
		if err := rows.Scan(&id, &userID, &sessionID, &createdAt); err != nil {
			continue
		}
		tasks = append(tasks, gin.H{
			"id":         id,
			"session_id": sessionID,
			"created_at": createdAt,
		})
	}
	if tasks == nil {
		tasks = []gin.H{}
	}
	c.JSON(http.StatusOK, tasks)
}

// WebDeleteTask DELETE /api/tasks/:id
func WebDeleteTask(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	mysql.DB.ExecContext(c.Request.Context(),
		`DELETE FROM tasks WHERE user_id=? AND id=?`, uid, id)
	c.Status(http.StatusOK)
}

// ────────────────── 会话分叉 ──────────────────

// WebForkSession POST /api/sessions/:id/fork
func WebForkSession(c *gin.Context) {
	uid := userID(c)
	srcID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if srcID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}
	ctx := c.Request.Context()

	var src struct {
		Title   string
		AgentID int64
		Mode    string
	}
	err := mysql.DB.QueryRowContext(ctx,
		`SELECT COALESCE(title,''), COALESCE(agent_id,0), COALESCE(mode,'') FROM sessions WHERE user_id=? AND id=?`,
		uid, srcID).Scan(&src.Title, &src.AgentID, &src.Mode)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	res, err := mysql.DB.ExecContext(ctx,
		`INSERT INTO sessions (user_id, title, agent_id, mode) VALUES (?, ?, ?, ?)`,
		uid, src.Title+" (fork)", src.AgentID, src.Mode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	newID, _ := res.LastInsertId()

	mysql.DB.ExecContext(ctx,
		`INSERT INTO messages (user_id, session_id, role, content, created_at)
		SELECT ?, ?, role, content, created_at FROM messages WHERE user_id=? AND session_id=? ORDER BY id`,
		uid, newID, uid, srcID)

	c.JSON(http.StatusOK, gin.H{"id": newID, "source_id": srcID})
}

// ────────────────── 知识库高级功能 ──────────────────

// WebBatchDeleteKnowledge POST /api/knowledge/batch-delete
func WebBatchDeleteKnowledge(c *gin.Context) {
	uid := userID(c)
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}
	ctx := c.Request.Context()
	kbDir := webKnowledgeDir(uid)
	deleted := 0
	for _, id := range body.IDs {
		var relPath string
		err := mysql.DB.QueryRowContext(ctx,
			`SELECT file_path FROM knowledge WHERE user_id=? AND id=?`, uid, id).Scan(&relPath)
		if err != nil {
			continue
		}
		mysql.DB.ExecContext(ctx, `DELETE FROM knowledge WHERE user_id=? AND id=?`, uid, id)
		absPath := filepath.Join(kbDir, relPath)
		os.Remove(absPath)
		deleted++
	}
	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
}

// WebUpdateKnowledgeItemCategory PATCH /api/knowledge/:id/category
func WebUpdateKnowledgeItemCategory(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}
	var body struct {
		Category string `json:"category"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Category == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "分类不能为空"})
		return
	}
	_, err = mysql.DB.ExecContext(c.Request.Context(),
		`UPDATE knowledge SET category=? WHERE user_id=? AND id=?`, body.Category, uid, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebBatchImportKnowledgeFromURLs POST /api/knowledge/from-urls
func WebBatchImportKnowledgeFromURLs(c *gin.Context) {
	uid := userID(c)
	var body struct {
		URLs     []string `json:"urls" binding:"required"`
		Category string   `json:"category"`
		Tags     string   `json:"tags"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 urls 数组"})
		return
	}
	if len(body.URLs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "urls 不能为空"})
		return
	}
	if len(body.URLs) > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "一次最多 20 个 URL"})
		return
	}
	if body.Category == "" {
		body.Category = "docs"
	}
	if body.Tags == "" {
		body.Tags = "[]"
	}

	type result struct {
		URL   string `json:"url"`
		ID    int64  `json:"id,omitempty"`
		Title string `json:"title,omitempty"`
		Error string `json:"error,omitempty"`
	}

	results := make([]result, 0, len(body.URLs))
	successCount := 0

	for _, rawURL := range body.URLs {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}

		parsed, err := url.Parse(rawURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			results = append(results, result{URL: rawURL, Error: "无效的 URL"})
			continue
		}

		title, content, err := webFetchAndExtract(rawURL)
		if err != nil {
			results = append(results, result{URL: rawURL, Error: err.Error()})
			continue
		}
		if title == "" {
			title = parsed.Host + parsed.Path
		}

		id, _, err := webSaveWebContent(uid, title, content, rawURL, body.Category, body.Tags)
		if err != nil {
			results = append(results, result{URL: rawURL, Error: err.Error()})
			continue
		}
		results = append(results, result{URL: rawURL, ID: id, Title: title})
		successCount++
	}

	c.JSON(http.StatusOK, gin.H{
		"results": results,
		"success": successCount,
		"total":   len(results),
	})
}

// ────────────────── 技能高级功能 ──────────────────

// WebBatchDeleteSkills POST /api/skills/batch-delete
func WebBatchDeleteSkills(c *gin.Context) {
	uid := userID(c)
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}
	ctx := c.Request.Context()
	deleted := 0
	for _, id := range body.IDs {
		err := webStore.DeleteSkill(ctx, uid, id)
		if err != nil {
			continue
		}
		deleted++
	}
	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
}

// WebUpdateSkillContent PUT /api/skills/:id/content
func WebUpdateSkillContent(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
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

	skill, err := webStore.GetSkill(ctx, uid, id)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	skillDir := webSkillsDir(uid)
	zipPath := filepath.Join(skillDir, skill.FilePath)
	if _, err := os.Stat(zipPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "技能文件不存在"})
		return
	}

	skillMDPath := filepath.Join(skillDir, strings.TrimSuffix(skill.FilePath, ".zip"), "SKILL.md")
	os.MkdirAll(filepath.Dir(skillMDPath), 0755)
	if err := os.WriteFile(skillMDPath, []byte(body.Content), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ────────────────── 进化扫描器配置 + 手动提取 ──────────────────

// WebGetEvolutionScannerConfig GET /api/evolution/scanner-config
func WebGetEvolutionScannerConfig(c *gin.Context) {
	uid := userID(c)
	ctx := c.Request.Context()

	var enabled, intervalHours, minMessages, cooldownHours, quietStart, quietEnd string
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'0') FROM kv_store WHERE user_id=? AND `+"`key`"+`='evo_scanner_enabled'`, uid).Scan(&enabled)
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'6') FROM kv_store WHERE user_id=? AND `+"`key`"+`='evo_scanner_interval'`, uid).Scan(&intervalHours)
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'6') FROM kv_store WHERE user_id=? AND `+"`key`"+`='evo_scanner_min_msgs'`, uid).Scan(&minMessages)
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'4') FROM kv_store WHERE user_id=? AND `+"`key`"+`='evo_scanner_cooldown'`, uid).Scan(&cooldownHours)
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'0') FROM kv_store WHERE user_id=? AND `+"`key`"+`='evo_scanner_quiet_start'`, uid).Scan(&quietStart)
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'6') FROM kv_store WHERE user_id=? AND `+"`key`"+`='evo_scanner_quiet_end'`, uid).Scan(&quietEnd)

	ih, _ := strconv.Atoi(intervalHours)
	mm, _ := strconv.Atoi(minMessages)
	ch, _ := strconv.Atoi(cooldownHours)
	qs, _ := strconv.Atoi(quietStart)
	qe, _ := strconv.Atoi(quietEnd)

	c.JSON(http.StatusOK, gin.H{
		"enabled":              enabled == "1",
		"scan_interval_hours":  ih,
		"min_session_messages": mm,
		"cooldown_hours":       ch,
		"quiet_start":          qs,
		"quiet_end":            qe,
	})
}

// WebUpdateEvolutionScannerConfig PUT /api/evolution/scanner-config
func WebUpdateEvolutionScannerConfig(c *gin.Context) {
	uid := userID(c)
	var body struct {
		Enabled            *bool `json:"enabled"`
		ScanIntervalHours  *int  `json:"scan_interval_hours"`
		MinSessionMessages *int  `json:"min_session_messages"`
		CooldownHours      *int  `json:"cooldown_hours"`
		QuietStart         *int  `json:"quiet_start"`
		QuietEnd           *int  `json:"quiet_end"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	upsertKV := func(key, val string) {
		mysql.DB.ExecContext(ctx,
			`INSERT INTO kv_store (user_id, `+"`key`"+`, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)`,
			uid, key, val)
	}
	if body.Enabled != nil {
		v := "0"
		if *body.Enabled {
			v = "1"
		}
		upsertKV("evo_scanner_enabled", v)
	}
	if body.ScanIntervalHours != nil {
		upsertKV("evo_scanner_interval", strconv.Itoa(*body.ScanIntervalHours))
	}
	if body.MinSessionMessages != nil {
		upsertKV("evo_scanner_min_msgs", strconv.Itoa(*body.MinSessionMessages))
	}
	if body.CooldownHours != nil {
		upsertKV("evo_scanner_cooldown", strconv.Itoa(*body.CooldownHours))
	}
	if body.QuietStart != nil {
		upsertKV("evo_scanner_quiet_start", strconv.Itoa(*body.QuietStart))
	}
	if body.QuietEnd != nil {
		upsertKV("evo_scanner_quiet_end", strconv.Itoa(*body.QuietEnd))
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebManualExtract POST /api/agents/:id/evolution/extract
func WebManualExtract(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"ok":      false,
		"message": "Web 版手动提取功能暂未完整实现，请使用桌面版",
	})
}

// ────────────────── 主动式 Agent 配置 ──────────────────

// WebGetProactiveConfig GET /api/proactive/config
func WebGetProactiveConfig(c *gin.Context) {
	uid := userID(c)
	ctx := c.Request.Context()

	var digestEnabled, digestTime, digestAgentID string
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'0') FROM kv_store WHERE user_id=? AND `+"`key`"+`='proactive_digest_enabled'`, uid).Scan(&digestEnabled)
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'09:00') FROM kv_store WHERE user_id=? AND `+"`key`"+`='proactive_digest_time'`, uid).Scan(&digestTime)
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(value,'') FROM kv_store WHERE user_id=? AND `+"`key`"+`='proactive_digest_agent_id'`, uid).Scan(&digestAgentID)

	if digestTime == "" {
		digestTime = "09:00"
	}

	c.JSON(http.StatusOK, gin.H{
		"digest_enabled":  digestEnabled == "1",
		"digest_time":     digestTime,
		"digest_agent_id": digestAgentID,
	})
}

// WebUpdateProactiveConfig PUT /api/proactive/config
func WebUpdateProactiveConfig(c *gin.Context) {
	uid := userID(c)
	var body struct {
		DigestEnabled bool   `json:"digest_enabled"`
		DigestTime    string `json:"digest_time"`
		DigestAgentID string `json:"digest_agent_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	upsertKV := func(key, val string) {
		mysql.DB.ExecContext(ctx,
			`INSERT INTO kv_store (user_id, `+"`key`"+`, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)`,
			uid, key, val)
	}
	enabled := "0"
	if body.DigestEnabled {
		enabled = "1"
	}
	upsertKV("proactive_digest_enabled", enabled)
	upsertKV("proactive_digest_time", body.DigestTime)
	upsertKV("proactive_digest_agent_id", body.DigestAgentID)

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ────────────────── 批量对话 ──────────────────

// WebBatchChat POST /api/chat/batch
func WebBatchChat(c *gin.Context) {
	uid := userID(c)
	var body struct {
		Tasks []struct {
			Message   string `json:"message"`
			SessionID string `json:"sessionId"`
		} `json:"tasks"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Tasks) == 0 {
		c.Status(http.StatusBadRequest)
		return
	}
	type taskResult struct {
		SessionID int64  `json:"sessionId"`
		Status    string `json:"status"`
		Error     string `json:"error,omitempty"`
	}
	results := make([]taskResult, 0, len(body.Tasks))
	ctx := c.Request.Context()
	for _, task := range body.Tasks {
		sessionID, err := strconv.ParseInt(task.SessionID, 10, 64)
		if err != nil {
			results = append(results, taskResult{Status: "error", Error: "invalid sessionId"})
			continue
		}
		var exists int
		if err := mysql.DB.QueryRowContext(ctx,
			`SELECT COUNT(1) FROM sessions WHERE user_id=? AND id=?`, uid, sessionID).Scan(&exists); err != nil || exists == 0 {
			results = append(results, taskResult{SessionID: sessionID, Status: "error", Error: "session not found"})
			continue
		}
		webAppendMessage(uid, sessionID, "user", task.Message)
		runes := []rune(task.Message)
		title := string(runes)
		if len(runes) > 20 {
			title = string(runes[:20]) + "…"
		}
		mysql.DB.ExecContext(ctx, `UPDATE sessions SET title=? WHERE user_id=? AND id=?`, title, uid, sessionID)
		go WebRunClaudeSync(uid, task.Message, sessionID, nil)
		results = append(results, taskResult{SessionID: sessionID, Status: "accepted"})
	}
	c.JSON(http.StatusAccepted, gin.H{"tasks": results})
}

// webAppendMessage 插入用户消息到 messages 表
func webAppendMessage(uid, sessionID int64, role, content string) {
	mysql.DB.Exec(
		`INSERT INTO messages (user_id, session_id, role, content) VALUES (?, ?, ?, ?)`,
		uid, sessionID, role, content)
	mysql.DB.Exec(
		`UPDATE sessions SET message_count = message_count + 1, updated_at = NOW() WHERE user_id=? AND id=?`,
		uid, sessionID)
}

// ────────────────── Marketplace 代理（简化版） ──────────────────

// WebMarketplaceSearch GET /api/skills/marketplace
func WebMarketplaceSearch(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusOK, gin.H{"results": []interface{}{}})
		return
	}
	apiURL := "https://registry.smithery.ai/api/search?q=" + url.QueryEscape(q)
	resp, err := http.Get(apiURL)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"results": []interface{}{}, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	var result json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		c.JSON(http.StatusOK, gin.H{"results": []interface{}{}})
		return
	}
	c.Data(http.StatusOK, "application/json", result)
}
