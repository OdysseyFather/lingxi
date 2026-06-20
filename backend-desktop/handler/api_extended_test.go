package handler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// setupExtendedTestDB 包含更完整的表结构
func setupExtendedTestDB(t *testing.T) func() {
	t.Helper()
	tmpFile := t.TempDir() + "/extended_test.db"
	var err error
	db.DB, err = openTestDB(tmpFile)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL DEFAULT '新对话',
			claude_session_id TEXT DEFAULT '',
			message_count INTEGER NOT NULL DEFAULT 0,
			agent_id INTEGER DEFAULT 0,
			pinned INTEGER DEFAULT 0,
			folder TEXT DEFAULT '',
			permission_mode TEXT DEFAULT 'trust',
			mode TEXT DEFAULT '',
			project_path TEXT DEFAULT '',
			is_a2a INTEGER DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			usage TEXT DEFAULT '',
			pinned INTEGER DEFAULT 0,
			feedback TEXT DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS knowledge (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL DEFAULT '',
			file_path TEXT NOT NULL UNIQUE,
			category TEXT NOT NULL DEFAULT 'docs',
			tags TEXT NOT NULL DEFAULT '[]',
			summary TEXT NOT NULL DEFAULT '',
			size INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS skills (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			description TEXT NOT NULL DEFAULT '',
			file_path TEXT NOT NULL DEFAULT '',
			installed INTEGER NOT NULL DEFAULT 0,
			source TEXT DEFAULT '',
			marketplace_id TEXT DEFAULT '',
			marketplace_version TEXT DEFAULT '',
			author TEXT DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS scheduled_tasks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			prompt TEXT NOT NULL DEFAULT '',
			agent_id INTEGER NOT NULL DEFAULT 0,
			cron_expr TEXT NOT NULL DEFAULT '',
			stateful INTEGER NOT NULL DEFAULT 0,
			session_id INTEGER DEFAULT NULL,
			notify_desktop INTEGER NOT NULL DEFAULT 1,
			enabled INTEGER NOT NULL DEFAULT 1,
			last_run_at DATETIME DEFAULT NULL,
			next_run_at DATETIME DEFAULT NULL,
			run_count INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS scheduled_task_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id INTEGER NOT NULL,
			session_id INTEGER NOT NULL,
			status TEXT NOT NULL DEFAULT 'running',
			summary TEXT NOT NULL DEFAULT '',
			started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			finished_at DATETIME DEFAULT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS kv_store (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		)`,
	}
	for _, stmt := range stmts {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("failed to create table: %v\nSQL: %s", err, stmt)
		}
	}

	return func() {
		db.DB.Close()
		os.Remove(tmpFile)
	}
}

func openTestDB(path string) (*sql.DB, error) {
	return sql.Open("sqlite3", "file:"+path+"?_journal=WAL&_timeout=5000")
}

func setupExtendedRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")

	// Sessions
	api.GET("/sessions", ListSessions)
	api.POST("/sessions", CreateSession)
	api.DELETE("/sessions/:id", DeleteSession)
	api.GET("/sessions/:id/messages", ListMessages)

	// Chat
	api.POST("/chat", Chat)
	api.POST("/chat/abort", AbortChat)

	// Knowledge
	api.GET("/knowledge", ListKnowledge)
	api.DELETE("/knowledge/:id", DeleteKnowledge)

	// Skills
	api.GET("/skills", ListSkills)
	api.DELETE("/skills/:id", DeleteSkill)

	// Files
	api.GET("/files/list", ListDirectory)
	api.GET("/files/read", ReadFileContent)
	api.PUT("/files/write", WriteFileContent)
	api.GET("/files/search-names", SearchFileNames)

	// Scheduled Tasks
	api.GET("/scheduled-tasks", ListScheduledTasks)
	api.POST("/scheduled-tasks", CreateScheduledTask)
	api.DELETE("/scheduled-tasks/:id", DeleteScheduledTask)

	return r
}

// ═══════════════════════════════════════════════════════════════════════════
// Chat API 验证测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_Chat_MissingSessionID(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	// 缺少 sessionId
	body := `{"message":"hello"}`
	req := httptest.NewRequest("POST", "/api/chat", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 400 {
		t.Errorf("missing sessionId should return 400, got %d", w.Code)
	}
}

func TestAPI_Chat_EmptyBody(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	req := httptest.NewRequest("POST", "/api/chat", bytes.NewBufferString(""))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 400 {
		t.Errorf("empty body should return 400, got %d", w.Code)
	}
}

func TestAPI_AbortChat_MissingSessionID(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	body := `{}`
	req := httptest.NewRequest("POST", "/api/chat/abort", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 400 {
		t.Errorf("abort without sessionId should return 400, got %d", w.Code)
	}
}

func TestAPI_AbortChat_InvalidSessionID(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	body := `{"sessionId":"abc"}`
	req := httptest.NewRequest("POST", "/api/chat/abort", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 400 {
		t.Errorf("invalid sessionId should return 400, got %d", w.Code)
	}
}

func TestAPI_AbortChat_NoActiveChatReturnsOK(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	// abort 一个没有活跃 chat 的 session 应该也返回 OK
	body := `{"sessionId":"999"}`
	req := httptest.NewRequest("POST", "/api/chat/abort", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("abort non-active chat should return 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Knowledge API 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_ListKnowledge_Empty(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	req := httptest.NewRequest("GET", "/api/knowledge", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var list []interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 0 {
		t.Errorf("expected empty knowledge list, got %d", len(list))
	}
}

func TestAPI_ListKnowledge_WithItems(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	// 直接插入知识库记录
	db.DB.Exec(`INSERT INTO knowledge (title, category, file_path, size) VALUES ('文档1', 'docs', '/path/to/doc.md', 1024)`)
	db.DB.Exec(`INSERT INTO knowledge (title, category, file_path, size) VALUES ('数据1', 'data', '/path/to/data.csv', 2048)`)

	req := httptest.NewRequest("GET", "/api/knowledge", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 2 {
		t.Errorf("expected 2 items, got %d", len(list))
	}
}

func TestAPI_ListKnowledge_MultipleItems(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	db.DB.Exec(`INSERT INTO knowledge (title, category, file_path, size) VALUES ('文档1', 'docs', '/path/a.md', 100)`)
	db.DB.Exec(`INSERT INTO knowledge (title, category, file_path, size) VALUES ('问答1', 'qa', '/path/b.md', 200)`)
	db.DB.Exec(`INSERT INTO knowledge (title, category, file_path, size) VALUES ('数据1', 'data', '/path/c.csv', 300)`)

	req := httptest.NewRequest("GET", "/api/knowledge", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 3 {
		t.Errorf("expected 3 items, got %d", len(list))
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Skills API 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_ListSkills_Empty(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	apiCache.Invalidate("skills")
	r := setupExtendedRouter()

	req := httptest.NewRequest("GET", "/api/skills", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var list []interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 0 {
		t.Errorf("expected empty skills list, got %d", len(list))
	}
}

func TestAPI_ListSkills_WithItems(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	apiCache.Invalidate("skills")
	r := setupExtendedRouter()

	db.DB.Exec(`INSERT INTO skills (name, description, file_path, installed, source, marketplace_id, marketplace_version, author) 
		VALUES ('test-skill', '测试技能', '/path/to/skill', 1, 'upload', '', '', '作者')`)

	req := httptest.NewRequest("GET", "/api/skills", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Errorf("expected 1 skill, got %d", len(list))
	}
	if list[0]["name"] != "test-skill" {
		t.Errorf("skill name = %v", list[0]["name"])
	}
}

func TestAPI_DeleteSkill(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	apiCache.Invalidate("skills")
	r := setupExtendedRouter()

	res, _ := db.DB.Exec(`INSERT INTO skills (name, description, file_path) VALUES ('del-skill', '删除', '/tmp/sk')`)
	id, _ := res.LastInsertId()

	req := httptest.NewRequest("DELETE", "/api/skills/"+strconv.FormatInt(id, 10), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("delete skill: expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// File Browser API 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_ListDirectory(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	// 使用临时目录
	tmpDir := t.TempDir()
	os.WriteFile(filepath.Join(tmpDir, "hello.txt"), []byte("hello"), 0644)
	os.Mkdir(filepath.Join(tmpDir, "subdir"), 0755)

	req := httptest.NewRequest("GET", "/api/files/list?path="+tmpDir, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("list dir: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	entries := resp["entries"].([]interface{})
	if len(entries) < 2 {
		t.Errorf("expected at least 2 entries (file + dir), got %d", len(entries))
	}

	foundFile, foundDir := false, false
	for _, e := range entries {
		entry := e.(map[string]interface{})
		if entry["name"] == "hello.txt" {
			foundFile = true
		}
		if entry["name"] == "subdir" {
			foundDir = true
		}
	}
	if !foundFile {
		t.Error("expected hello.txt in listing")
	}
	if !foundDir {
		t.Error("expected subdir in listing")
	}
}

func TestAPI_ListDirectory_InvalidPath(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	req := httptest.NewRequest("GET", "/api/files/list?path=/nonexistent/path/xyz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 400 {
		t.Errorf("invalid path should return 400, got %d", w.Code)
	}
}

func TestAPI_ReadFile(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "test.go")
	os.WriteFile(filePath, []byte("package main\n\nfunc main() {}\n"), 0644)

	req := httptest.NewRequest("GET", "/api/files/read?path="+filePath, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("read file: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	content := resp["content"].(string)
	if content == "" {
		t.Error("expected non-empty content")
	}
}

func TestAPI_WriteFile(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "output.txt")
	// WriteFileContent 要求文件已存在
	os.WriteFile(filePath, []byte("old content"), 0644)

	body, _ := json.Marshal(map[string]string{
		"path":    filePath,
		"content": "written by test",
	})
	req := httptest.NewRequest("PUT", "/api/files/write", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("write file: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// 验证文件内容
	data, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "written by test" {
		t.Errorf("file content = %q, want 'written by test'", string(data))
	}
}

func TestAPI_SearchFileNames(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	tmpDir := t.TempDir()
	os.WriteFile(filepath.Join(tmpDir, "hello.go"), []byte("package main"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "world.go"), []byte("package main"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "readme.md"), []byte("# readme"), 0644)

	req := httptest.NewRequest("GET", "/api/files/search-names?path="+tmpDir+"&query=.go", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("search names: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	results := resp["results"].([]interface{})
	if len(results) < 2 {
		t.Errorf("expected at least 2 .go files, got %d", len(results))
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled Tasks API 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_ScheduledTask_CRUD(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	// 创建
	body := `{"name":"每日总结","prompt":"每天自动生成日报","cron_expr":"0 9 * * *","agent_id":0}`
	req := httptest.NewRequest("POST", "/api/scheduled-tasks", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("create task: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var created map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &created)
	taskID := int(created["id"].(float64))

	// 列表
	req = httptest.NewRequest("GET", "/api/scheduled-tasks", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("list tasks: expected 200, got %d", w.Code)
	}
	var tasks []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &tasks)
	if len(tasks) != 1 {
		t.Errorf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0]["name"] != "每日总结" {
		t.Errorf("task name = %v", tasks[0]["name"])
	}

	// 删除
	req = httptest.NewRequest("DELETE", "/api/scheduled-tasks/"+strconv.Itoa(taskID), nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("delete task: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// 验证删除
	req = httptest.NewRequest("GET", "/api/scheduled-tasks", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	json.Unmarshal(w.Body.Bytes(), &tasks)
	if len(tasks) != 0 {
		t.Errorf("expected 0 tasks, got %d", len(tasks))
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Messages 分页测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_ListMessages_Paginated(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	// 创建会话
	db.DB.Exec(`INSERT INTO sessions (title) VALUES ('分页测试')`)

	// 插入 20 条消息
	for i := 0; i < 20; i++ {
		db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (1, 'user', ?)`, "msg"+strconv.Itoa(i))
	}

	// 请求前 10 条
	req := httptest.NewRequest("GET", "/api/sessions/1/messages?limit=10", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var result map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &result)

	messages := result["messages"].([]interface{})
	if len(messages) != 10 {
		t.Errorf("expected 10 messages with limit=10, got %d", len(messages))
	}
	hasMore := result["has_more"].(bool)
	if !hasMore {
		t.Error("expected has_more=true for 20 messages with limit=10")
	}

	// 使用 before_id 获取剩余的消息
	lastMsg := messages[len(messages)-1].(map[string]interface{})
	beforeID := int(lastMsg["id"].(float64))

	req = httptest.NewRequest("GET", "/api/sessions/1/messages?limit=10&before_id="+strconv.Itoa(beforeID), nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	json.Unmarshal(w.Body.Bytes(), &result)
	messages2 := result["messages"].([]interface{})
	if len(messages2) != 10 {
		t.Errorf("expected 10 more messages, got %d", len(messages2))
	}
}

func TestAPI_ListMessages_NonExistentSession(t *testing.T) {
	cleanup := setupExtendedTestDB(t)
	defer cleanup()
	r := setupExtendedRouter()

	req := httptest.NewRequest("GET", "/api/sessions/9999/messages", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 404 {
		t.Errorf("non-existent session should return 404, got %d", w.Code)
	}
}
