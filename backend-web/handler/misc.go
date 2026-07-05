package handler

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"lingxi-core/store"
	"lingxi-web-agent/db/mysql"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	readability "github.com/go-shiori/go-readability"
)

// ────────────────── 消息固定 ──────────────────

// WebToggleMessagePin POST /api/messages/:id/pin
func WebToggleMessagePin(c *gin.Context) {
	uid := userID(c)
	msgID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var body struct {
		Pinned bool `json:"pinned"`
	}
	_ = c.ShouldBindJSON(&body)
	pinnedInt := 0
	if body.Pinned {
		pinnedInt = 1
	}
	_, err = mysql.DB.ExecContext(c.Request.Context(),
		`UPDATE messages SET pinned=? WHERE user_id=? AND id=?`, pinnedInt, uid, msgID)
	if err != nil {
		slog.Warn("toggle pin error", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ────────────────── 会话批量导出 ──────────────────

// WebBatchExportSessions POST /api/sessions/batch-export
func WebBatchExportSessions(c *gin.Context) {
	uid := userID(c)
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}

	ctx := c.Request.Context()
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	for _, sid := range body.IDs {
		var title string
		err := mysql.DB.QueryRowContext(ctx,
			`SELECT COALESCE(title,'新对话') FROM sessions WHERE user_id=? AND id=?`, uid, sid).Scan(&title)
		if err != nil {
			continue
		}

		rows, err := mysql.DB.QueryContext(ctx,
			`SELECT role, content, created_at FROM messages WHERE user_id=? AND session_id=? ORDER BY id ASC`, uid, sid)
		if err != nil {
			continue
		}

		var lines []string
		lines = append(lines, fmt.Sprintf("# %s", title))
		lines = append(lines, "")
		lines = append(lines, fmt.Sprintf("> 导出时间：%s", time.Now().Format("2006-01-02 15:04:05")))
		lines = append(lines, "")

		for rows.Next() {
			var role, content string
			var createdAt time.Time
			if err := rows.Scan(&role, &content, &createdAt); err != nil {
				continue
			}
			if role == "user" {
				lines = append(lines, "## 👤 用户", "")
				text := content
				var obj map[string]interface{}
				if json.Unmarshal([]byte(content), &obj) == nil {
					if t, ok := obj["text"].(string); ok {
						text = t
					}
				}
				lines = append(lines, text, "")
			} else {
				lines = append(lines, "## 🤖 助理", "")
				var blocks []map[string]interface{}
				if json.Unmarshal([]byte(content), &blocks) == nil {
					for _, b := range blocks {
						btype, _ := b["type"].(string)
						btext, _ := b["text"].(string)
						switch btype {
						case "text":
							if btext != "" {
								lines = append(lines, btext, "")
							}
						case "thinking":
							if btext != "" {
								lines = append(lines, "<details><summary>思考过程</summary>", "", btext, "", "</details>", "")
							}
						case "tool":
							label, _ := b["label"].(string)
							name, _ := b["name"].(string)
							if label == "" {
								label = name
							}
							lines = append(lines, fmt.Sprintf("> 🔧 工具调用: %s", label), "")
						}
					}
				} else {
					lines = append(lines, content, "")
				}
			}
			lines = append(lines, "---", "")
		}
		rows.Close()

		safeTitle := strings.NewReplacer("/", "-", "\\", "-", "?", "", "%", "", "*", "", ":", "-", "|", "-", "\"", "", "<", "", ">", "").Replace(title)
		if safeTitle == "" {
			safeTitle = fmt.Sprintf("对话_%d", sid)
		}
		filename := fmt.Sprintf("%s_%d.md", safeTitle, sid)

		fw, err := zw.Create(filename)
		if err != nil {
			continue
		}
		fw.Write([]byte(strings.Join(lines, "\n")))
	}

	zw.Close()

	dateStr := time.Now().Format("20060102")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="灵犀对话导出-%s.zip"`, dateStr))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// ────────────────── 配额查询 ──────────────────

// WebGetUsageQuota GET /api/usage/quota
func WebGetUsageQuota(c *gin.Context) {
	uid := userID(c)
	st := webStore.(*mysql.MySQLStore)
	quota, err := st.GetUsageQuota(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"available": false, "reason": err.Error()})
		return
	}
	c.JSON(http.StatusOK, quota)
}

// ────────────────── 接入点测试 ──────────────────

type webTestStep struct {
	Success bool   `json:"success"`
	Latency string `json:"latency"`
	Status  int    `json:"status,omitempty"`
	Error   string `json:"error,omitempty"`
	Model   string `json:"model_used,omitempty"`
}

// WebTestAPIProfile POST /api/api-profiles/:id/test
func WebTestAPIProfile(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	_ = c.ShouldBindJSON(&body)

	ap, err := webStore.GetAPIProfile(c.Request.Context(), uid, id, false)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	token := body.Token
	if token == "" {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": "缺少 token"})
		return
	}

	baseURL := strings.TrimRight(ap.BaseURL, "/")
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": "base_url 为空"})
		return
	}

	isOpenAI := ap.ProviderProtocol == "openai"
	connResult := webTestConnectivity(baseURL, ap.Model, token, isOpenAI)

	c.JSON(http.StatusOK, gin.H{
		"ok":           connResult.Success,
		"connectivity": connResult,
		"status":       connResult.Status,
		"latency":      connResult.Latency,
		"error":        connResult.Error,
	})
}

func webTestConnectivity(baseURL, model, token string, isOpenAI bool) webTestStep {
	var reqURL string
	var reqBody []byte

	if isOpenAI {
		reqURL = baseURL
		if !strings.Contains(reqURL, "/chat/completions") {
			reqURL = strings.TrimRight(reqURL, "/") + "/v1/chat/completions"
		}
		reqBody, _ = json.Marshal(map[string]interface{}{
			"model": model, "max_tokens": 16, "stream": false,
			"messages": []map[string]string{{"role": "user", "content": "ping"}},
		})
	} else {
		reqURL = baseURL + "/v1/messages"
		reqBody, _ = json.Marshal(map[string]interface{}{
			"model": model, "max_tokens": 16,
			"messages": []map[string]string{{"role": "user", "content": "ping"}},
		})
	}

	httpReq, err := http.NewRequest("POST", reqURL, bytes.NewReader(reqBody))
	if err != nil {
		return webTestStep{Error: err.Error()}
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if isOpenAI {
		httpReq.Header.Set("Authorization", "Bearer "+token)
	} else {
		httpReq.Header.Set("anthropic-version", "2023-06-01")
		httpReq.Header.Set("x-api-key", token)
		httpReq.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	startTs := time.Now()
	resp, err := client.Do(httpReq)
	if err != nil {
		return webTestStep{Error: err.Error()}
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	latency := fmt.Sprintf("%dms", time.Since(startTs).Milliseconds())

	if resp.StatusCode >= 400 {
		return webTestStep{Status: resp.StatusCode, Latency: latency, Error: webTruncateStr(string(bodyBytes), 400)}
	}
	return webTestStep{Success: true, Status: resp.StatusCode, Latency: latency, Model: model}
}

func webTruncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// ────────────────── 获取模型列表 ──────────────────

// WebFetchModels POST /api/api-profiles/fetch-models
func WebFetchModels(c *gin.Context) {
	var body struct {
		BaseURL  string `json:"base_url"`
		Token    string `json:"token"`
		Protocol string `json:"protocol"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token required"})
		return
	}

	baseURL := strings.TrimRight(body.BaseURL, "/")
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{"ok": false, "models": []string{}, "error": "base_url 为空"})
		return
	}

	var modelsURL string
	if body.Protocol == "openai" {
		clean := baseURL
		for _, suffix := range []string{"/chat/completions", "/chat/completion"} {
			if strings.HasSuffix(clean, suffix) {
				clean = strings.TrimRight(clean[:len(clean)-len(suffix)], "/")
				break
			}
		}
		if !strings.HasSuffix(clean, "/v1") && !strings.HasSuffix(clean, "/v2") && !strings.HasSuffix(clean, "/v3") && !strings.HasSuffix(clean, "/v4") {
			clean = clean + "/v1"
		}
		modelsURL = clean + "/models"
	} else {
		modelsURL = baseURL + "/v1/models"
	}

	req, _ := http.NewRequest("GET", modelsURL, nil)
	req.Header.Set("Authorization", "Bearer "+body.Token)
	if body.Protocol == "anthropic" {
		req.Header.Set("x-api-key", body.Token)
		req.Header.Set("anthropic-version", "2023-06-01")
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "models": []string{}, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		c.JSON(http.StatusOK, gin.H{"ok": false, "models": []string{}, "error": webTruncateStr(string(respBody), 300)})
		return
	}

	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "models": []string{}, "error": "解析模型列表失败"})
		return
	}

	models := make([]string, 0, len(result.Data))
	for _, m := range result.Data {
		if m.ID != "" {
			models = append(models, m.ID)
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "models": models})
}

// ────────────────── MCP 导出 ──────────────────

// WebExportMCPConfig GET /api/mcp/export
func WebExportMCPConfig(c *gin.Context) {
	uid := userID(c)
	list, err := webStore.ListMCPServers(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := map[string]any{}
	for _, m := range list {
		if !m.Enabled {
			continue
		}
		entry := map[string]any{}
		switch m.Transport {
		case "stdio", "":
			entry["command"] = m.Command
			var args []string
			json.Unmarshal([]byte(m.Args), &args)
			entry["args"] = args
			var env map[string]string
			json.Unmarshal([]byte(m.Env), &env)
			if len(env) > 0 {
				entry["env"] = env
			}
		case "sse":
			entry["transport"] = "sse"
			entry["url"] = m.URL
			var headers map[string]string
			json.Unmarshal([]byte(m.Headers), &headers)
			if len(headers) > 0 {
				entry["headers"] = headers
			}
		case "http":
			entry["transport"] = "http"
			entry["url"] = m.URL
			var headers map[string]string
			json.Unmarshal([]byte(m.Headers), &headers)
			if len(headers) > 0 {
				entry["headers"] = headers
			}
		}
		out[m.Name] = entry
	}
	c.JSON(http.StatusOK, gin.H{"mcpServers": out})
}

// ────────────────── 数据备份导出 ──────────────────

// WebExportBackup GET /api/backup/export
// Web 版导出当前用户数据为 JSON 包
func WebExportBackup(c *gin.Context) {
	uid := userID(c)
	ctx := c.Request.Context()

	sessions, _ := webStore.ListSessions(ctx, uid, store.SessionFilter{})
	agents, _ := webStore.ListAgents(ctx, uid)
	memories, _ := webStore.ListMemories(ctx, uid, 0, 1000)
	skills, _ := webStore.ListSkills(ctx, uid)
	knowledge, _ := webStore.ListKnowledge(ctx, uid)

	data := gin.H{
		"export_time": time.Now().Format(time.RFC3339),
		"user_id":     uid,
		"sessions":    sessions,
		"agents":      agents,
		"memories":    memories,
		"skills":      skills,
		"knowledge":   knowledge,
	}

	bs, _ := json.MarshalIndent(data, "", "  ")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="lingxi-export-%s.json"`, time.Now().Format("20060102")))
	c.Data(http.StatusOK, "application/json", bs)
}

// ────────────────── Token 水位 ──────────────────

// WebGetSessionTokenStats GET /api/sessions/:id/token-stats
func WebGetSessionTokenStats(c *gin.Context) {
	uid := userID(c)
	sessionID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if sessionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	ctx := c.Request.Context()

	rows, err := mysql.DB.QueryContext(ctx,
		"SELECT `usage` FROM messages WHERE user_id=? AND session_id=? AND `usage` != ''", uid, sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var totalInput, totalOutput, totalCacheRead, totalCacheWrite int64
	var totalCost float64
	var msgCount int

	for rows.Next() {
		var usageStr string
		rows.Scan(&usageStr)
		if usageStr == "" {
			continue
		}
		var u map[string]interface{}
		if json.Unmarshal([]byte(usageStr), &u) != nil {
			continue
		}
		totalInput += webToInt64(u["input_tokens"])
		totalOutput += webToInt64(u["output_tokens"])
		totalCacheRead += webToInt64(u["cache_read_tokens"])
		totalCacheWrite += webToInt64(u["cache_write_tokens"])
		totalCost += webToFloat64(u["cost_usd"])
		msgCount++
	}

	var latestInputTokens int64
	var latestUsage string
	mysql.DB.QueryRowContext(ctx,
		"SELECT `usage` FROM messages WHERE user_id=? AND session_id=? AND role='assistant' AND `usage` != '' ORDER BY id DESC LIMIT 1",
		uid, sessionID).Scan(&latestUsage)
	if latestUsage != "" {
		var u map[string]interface{}
		if json.Unmarshal([]byte(latestUsage), &u) == nil {
			latestInputTokens = webToInt64(u["input_tokens"])
		}
	}

	contextWindow := int64(200000)

	var summary string
	mysql.DB.QueryRowContext(ctx, `SELECT COALESCE(summary,'') FROM sessions WHERE user_id=? AND id=?`, uid, sessionID).Scan(&summary)

	c.JSON(http.StatusOK, gin.H{
		"session_id":          sessionID,
		"message_count":       msgCount,
		"total_input_tokens":  totalInput,
		"total_output_tokens": totalOutput,
		"total_cache_read":    totalCacheRead,
		"total_cache_write":   totalCacheWrite,
		"total_cost_usd":      totalCost,
		"context_tokens":      latestInputTokens,
		"context_window":      contextWindow,
		"water_level":         float64(latestInputTokens) / float64(contextWindow),
		"has_summary":         summary != "",
	})
}

// WebSummarizeSession POST /api/sessions/:id/summarize
func WebSummarizeSession(c *gin.Context) {
	uid := userID(c)
	sessionID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if sessionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	ctx := c.Request.Context()

	rows, err := mysql.DB.QueryContext(ctx,
		`SELECT role, content FROM messages WHERE user_id=? AND session_id=? ORDER BY id DESC LIMIT 20`,
		uid, sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var parts []string
	for rows.Next() {
		var role, content string
		rows.Scan(&role, &content)
		parts = append(parts, "["+role+"]: "+content)
	}
	if len(parts) == 0 {
		c.JSON(http.StatusOK, gin.H{"summary": ""})
		return
	}

	// 反转（因为 ORDER BY id DESC）
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}
	conversationCtx := strings.Join(parts, "\n\n")

	summaryPrompt := "请用 3-5 句话简洁总结以下对话的核心内容和要点，保留关键结论和决策：\n\n" + conversationCtx
	reply, usedSID, err := WebRunClaudeSyncCtx(ctx, uid, summaryPrompt, 0, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "summarize failed: " + err.Error()})
		return
	}
	_ = usedSID

	mysql.DB.ExecContext(ctx, `UPDATE sessions SET summary=? WHERE user_id=? AND id=?`, reply, uid, sessionID)

	c.JSON(http.StatusOK, gin.H{"summary": reply})
}

func webToInt64(v interface{}) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case json.Number:
		i, _ := n.Int64()
		return i
	}
	return 0
}

func webToFloat64(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	}
	return 0
}

// ────────────────── 挂起任务 ──────────────────

// WebGetPendingTask GET /api/sessions/:id/pending
func WebGetPendingTask(c *gin.Context) {
	uid := userID(c)
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var taskDesc, missingFields string
	err = mysql.DB.QueryRowContext(c.Request.Context(),
		`SELECT task_desc, missing_fields FROM pending_tasks WHERE user_id=? AND session_id=?`,
		uid, sessionID).Scan(&taskDesc, &missingFields)
	if err != nil {
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

// WebClearPendingTask DELETE /api/sessions/:id/pending
func WebClearPendingTask(c *gin.Context) {
	uid := userID(c)
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	mysql.DB.ExecContext(c.Request.Context(),
		`DELETE FROM pending_tasks WHERE user_id=? AND session_id=?`, uid, sessionID)
	c.Status(http.StatusOK)
}

// WebUploadsPath 返回上传目录路径（供 main.go 注册静态路由）
func WebUploadsPath() string {
	return webUploadsDir()
}

// ────────────────── 智能体头像上传 ──────────────────

// WebUploadAgentAvatar POST /api/agents/upload-avatar
func WebUploadAgentAvatar(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 file 字段"})
		return
	}
	if file.Size > 10<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "图片过大（10MB 上限）"})
		return
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持图片"})
		return
	}

	dir := webUploadsDir()
	os.MkdirAll(dir, 0755)
	name := fmt.Sprintf("a_%d_%s%s", time.Now().UnixNano(), uuid.New().String()[:8], ext)
	fpath := filepath.Join(dir, name)
	if err := c.SaveUploadedFile(file, fpath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"url":      "/api/uploads/" + name,
		"filename": name,
	})
}

// ────────────────── 网页知识采集 ──────────────────

// WebImportKnowledgeFromURL POST /api/knowledge/from-url
func WebImportKnowledgeFromURL(c *gin.Context) {
	uid := userID(c)
	var body struct {
		URL      string `json:"url" binding:"required"`
		Title    string `json:"title"`
		Category string `json:"category"`
		Tags     string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 url 字段"})
		return
	}

	parsed, err := url.Parse(body.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 URL，需要 http/https"})
		return
	}

	if body.Category == "" {
		body.Category = "docs"
	}
	if body.Tags == "" {
		body.Tags = "[]"
	}

	title, content, err := webFetchAndExtract(body.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "抓取失败: " + err.Error()})
		return
	}

	if body.Title != "" {
		title = body.Title
	}
	if title == "" {
		title = parsed.Host + parsed.Path
	}

	id, relPath, err := webSaveWebContent(uid, title, content, body.URL, body.Category, body.Tags)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":        id,
		"title":     title,
		"file_path": relPath,
		"category":  body.Category,
		"message":   "导入成功",
	})
}

func webFetchAndExtract(rawURL string) (title string, content string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return "", "", fmt.Errorf("构建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		return "", "", fmt.Errorf("读取响应失败: %w", err)
	}

	parsedURL, _ := url.Parse(rawURL)
	article, err := readability.FromReader(strings.NewReader(string(respBody)), parsedURL)
	if err != nil {
		return "", "", fmt.Errorf("提取正文失败: %w", err)
	}

	title = article.Title
	content = article.TextContent
	if content == "" {
		content = article.Content
	}
	content = strings.TrimSpace(content)
	if len(content) < 50 {
		return "", "", fmt.Errorf("提取内容过短，可能不是文章页面")
	}

	return title, content, nil
}

func webSaveWebContent(uid int64, title, content, sourceURL, category, tags string) (int64, string, error) {
	kbDir := webKnowledgeDir(uid)
	catDir := filepath.Join(kbDir, category)
	os.MkdirAll(catDir, 0755)

	ts := time.Now().Format("20060102-150405")
	filename := fmt.Sprintf("web-%s.md", ts)
	destPath := filepath.Join(catDir, filename)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s\n\n", title))
	sb.WriteString(fmt.Sprintf("> 来源: %s\n", sourceURL))
	sb.WriteString(fmt.Sprintf("> 采集时间: %s\n\n", time.Now().Format("2006-01-02 15:04:05")))
	sb.WriteString(content)

	fileContent := sb.String()
	if err := os.WriteFile(destPath, []byte(fileContent), 0644); err != nil {
		return 0, "", fmt.Errorf("写入文件失败: %w", err)
	}

	summary := webExtractSummary(content)
	relPath := filepath.Join(category, filename)
	fileInfo, _ := os.Stat(destPath)
	size := int64(0)
	if fileInfo != nil {
		size = fileInfo.Size()
	}

	item := &knowledgeInsertItem{
		Title:    title,
		FilePath: relPath,
		Category: category,
		Tags:     tags,
		Summary:  summary,
		Size:     size,
	}
	id, err := webInsertKnowledgeItem(uid, item)
	if err != nil {
		os.Remove(destPath)
		return 0, "", fmt.Errorf("数据库写入失败: %w", err)
	}

	return id, relPath, nil
}

type knowledgeInsertItem struct {
	Title    string
	FilePath string
	Category string
	Tags     string
	Summary  string
	Size     int64
}

func webInsertKnowledgeItem(uid int64, item *knowledgeInsertItem) (int64, error) {
	ctx := context.Background()
	result, err := mysql.DB.ExecContext(ctx,
		`INSERT INTO knowledge (user_id, title, file_path, category, tags, summary, file_size, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
		uid, item.Title, item.FilePath, item.Category, item.Tags, item.Summary, item.Size)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// ────────────────── 深度搜索 ──────────────────

// WebDeepSearch POST /api/search/deep
// 简化版深度搜索（SSE 流式）
func WebDeepSearch(c *gin.Context) {
	var body struct {
		Query      string `json:"query" binding:"required"`
		MaxSources int    `json:"max_sources"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 query 字段"})
		return
	}
	if body.MaxSources <= 0 || body.MaxSources > 10 {
		body.MaxSources = 5
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")

	sendSSE := func(event string, data interface{}) {
		bs, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, string(bs))
		c.Writer.Flush()
	}

	sendSSE("source_start", gin.H{"source": "duckduckgo", "query": body.Query})

	// 暂时返回空结果（Web 版深度搜索暂不实现完整的多源抓取 + LLM 综合）
	sendSSE("source_done", gin.H{"source": "duckduckgo", "count": 0})
	sendSSE("done", gin.H{
		"message": "Web 版深度搜索功能暂未完整实现，请使用桌面版获取完整体验",
	})
}
