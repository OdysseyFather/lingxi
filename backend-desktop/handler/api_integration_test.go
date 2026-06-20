package handler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

// setupTestDB 初始化临时内存数据库用于测试
func setupTestDB(t *testing.T) func() {
	t.Helper()

	tmpFile := t.TempDir() + "/test.db"
	var err error
	db.DB, err = sql.Open("sqlite3", "file:"+tmpFile+"?_journal=WAL&_timeout=5000")
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	// 创建最小必需表
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			id                INTEGER PRIMARY KEY AUTOINCREMENT,
			title             TEXT    NOT NULL DEFAULT '新对话',
			claude_session_id TEXT    DEFAULT '',
			message_count     INTEGER NOT NULL DEFAULT 0,
			agent_id          INTEGER DEFAULT 0,
			pinned            INTEGER DEFAULT 0,
			folder            TEXT    DEFAULT '',
			permission_mode   TEXT    DEFAULT 'trust',
			mode              TEXT    DEFAULT '',
			project_path      TEXT    DEFAULT '',
			is_a2a            INTEGER DEFAULT 0,
			summary           TEXT    DEFAULT '',
			created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL,
			role       TEXT    NOT NULL,
			content    TEXT    NOT NULL DEFAULT '',
			usage      TEXT    DEFAULT '',
			pinned     INTEGER DEFAULT 0,
			feedback   TEXT    DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS agents (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			name            TEXT    NOT NULL DEFAULT '',
			description     TEXT    DEFAULT '',
			avatar          TEXT    DEFAULT '✦',
			system_prompt   TEXT    DEFAULT '',
			profile_id      INTEGER DEFAULT 0,
			model           TEXT    DEFAULT '',
			temperature     REAL    DEFAULT 0.7,
			max_tokens      INTEGER DEFAULT 0,
			skill_ids       TEXT    DEFAULT '[]',
			mcp_server_ids  TEXT    DEFAULT '[]',
			knowledge_ids   TEXT    DEFAULT '[]',
			allow_all       INTEGER DEFAULT 0,
			builtin         INTEGER DEFAULT 0,
			post_actions    TEXT    DEFAULT '[]',
			evolution_enabled INTEGER DEFAULT 0,
			created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS memories (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			agent_id   INTEGER DEFAULT 0,
			category   TEXT    DEFAULT 'general',
			content    TEXT    NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS h5_access_tokens (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			token_hash TEXT    NOT NULL UNIQUE,
			label      TEXT    DEFAULT '',
			permanent  INTEGER DEFAULT 0,
			device_id  TEXT    DEFAULT '',
			platform   TEXT    DEFAULT '',
			device_name TEXT   DEFAULT '',
			push_token TEXT    DEFAULT '',
			last_seen_at DATETIME,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			expires_at DATETIME
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

func setupAPIRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")

	api.GET("/sessions", ListSessions)
	api.POST("/sessions", CreateSession)
	api.PATCH("/sessions/:id", UpdateSession)
	api.DELETE("/sessions/:id", DeleteSession)
	api.GET("/sessions/:id/messages", ListMessages)
	api.POST("/sessions/batch-delete", BatchDeleteSessions)

	api.GET("/agents", ListAgents)
	api.POST("/agents", UpsertAgent)
	api.DELETE("/agents/:id", DeleteAgent)

	api.POST("/messages/:id/feedback", SetMessageFeedback)
	api.POST("/messages/:id/pin", ToggleMessagePin)
	api.PUT("/messages/:id", UpdateMessage)

	api.GET("/memories", ListMemories)
	api.POST("/memories", CreateMemory)
	api.DELETE("/memories/:id", DeleteMemory)

	api.GET("/health", HealthCheck)
	api.GET("/ping", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	return r
}

// ═══════════════════════════════════════════════════════════════════════════
// Session API 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_CreateSession(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	body := `{"title":"测试会话","agent_id":1}`
	req := httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["title"] != "测试会话" {
		t.Errorf("title = %v, want 测试会话", resp["title"])
	}
	if resp["id"] == nil || resp["id"].(float64) < 1 {
		t.Error("expected valid id")
	}
}

func TestAPI_CreateSessionDefault(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 无 body 时使用默认值
	req := httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString("{}"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["title"] != "新对话" {
		t.Errorf("default title = %v, want 新对话", resp["title"])
	}
}

func TestAPI_ListSessions(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 创建 3 个会话
	for i := 0; i < 3; i++ {
		body := `{"title":"会话` + strconv.Itoa(i) + `"}`
		req := httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
	}

	// 查询列表
	req := httptest.NewRequest("GET", "/api/sessions", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 3 {
		t.Errorf("expected 3 sessions, got %d", len(list))
	}
}

func TestAPI_ListSessionsWithModeFilter(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 创建普通会话
	req := httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString(`{"title":"普通"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// 创建 coding 会话
	req = httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString(`{"title":"编程","mode":"coding"}`))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// 查询 coding 会话
	req = httptest.NewRequest("GET", "/api/sessions?mode=coding", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Errorf("expected 1 coding session, got %d", len(list))
	}
	if list[0]["title"] != "编程" {
		t.Errorf("coding session title = %v", list[0]["title"])
	}

	// 查询普通会话
	req = httptest.NewRequest("GET", "/api/sessions?mode=", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Errorf("expected 1 normal session, got %d", len(list))
	}
}

func TestAPI_UpdateSession(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 创建
	req := httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString(`{"title":"原始"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var created map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// 更新
	body := `{"title":"已更新","pinned":true}`
	req = httptest.NewRequest("PATCH", "/api/sessions/"+strconv.Itoa(id), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("update: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// 验证更新结果
	req = httptest.NewRequest("GET", "/api/sessions", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Fatal("expected 1 session")
	}
	if list[0]["title"] != "已更新" {
		t.Errorf("title = %v, want 已更新", list[0]["title"])
	}
}

func TestAPI_DeleteSession(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 创建
	req := httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString(`{"title":"删除我"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var created map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// 删除
	req = httptest.NewRequest("DELETE", "/api/sessions/"+strconv.Itoa(id), nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("delete: expected 200, got %d", w.Code)
	}

	// 验证
	req = httptest.NewRequest("GET", "/api/sessions", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(list))
	}
}

func TestAPI_BatchDeleteSessions(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 创建 3 个
	ids := []int{}
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString(`{"title":"batch"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		ids = append(ids, int(resp["id"].(float64)))
	}

	// 批量删除前 2 个
	delBody, _ := json.Marshal(map[string]interface{}{"ids": []int{ids[0], ids[1]}})
	req := httptest.NewRequest("POST", "/api/sessions/batch-delete", bytes.NewBuffer(delBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("batch-delete: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// 验证只剩 1 个
	req = httptest.NewRequest("GET", "/api/sessions", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Errorf("expected 1 session remaining, got %d", len(list))
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Messages API 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_ListMessages(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 创建会话
	req := httptest.NewRequest("POST", "/api/sessions", bytes.NewBufferString(`{"title":"msg test"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var session map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &session)
	sid := int(session["id"].(float64))

	// 插入消息
	db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (?, 'user', '你好')`, sid)
	db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', '你好！有什么可以帮你的？')`, sid)

	// 查询
	req = httptest.NewRequest("GET", "/api/sessions/"+strconv.Itoa(sid)+"/messages", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var result interface{}
	json.Unmarshal(w.Body.Bytes(), &result)

	// 结果可能是 {messages:[], has_more:bool} 或者纯数组
	switch v := result.(type) {
	case map[string]interface{}:
		msgs := v["messages"].([]interface{})
		if len(msgs) != 2 {
			t.Errorf("expected 2 messages, got %d", len(msgs))
		}
	case []interface{}:
		if len(v) != 2 {
			t.Errorf("expected 2 messages, got %d", len(v))
		}
	}
}

func TestAPI_MessageFeedback(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 插入消息
	res, _ := db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (1, 'assistant', 'test reply')`)
	msgID, _ := res.LastInsertId()

	// 设置反馈
	body := `{"feedback":"up"}`
	req := httptest.NewRequest("POST", "/api/messages/"+strconv.FormatInt(msgID, 10)+"/feedback", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// 验证
	var feedback string
	db.DB.QueryRow(`SELECT COALESCE(feedback,'') FROM messages WHERE id=?`, msgID).Scan(&feedback)
	if feedback != "up" {
		t.Errorf("feedback = %q, want 'up'", feedback)
	}
}

func TestAPI_TogglePin(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	res, _ := db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (1, 'user', 'pin me')`)
	msgID, _ := res.LastInsertId()

	// Pin (handler 读取 body.Pinned)
	req := httptest.NewRequest("POST", "/api/messages/"+strconv.FormatInt(msgID, 10)+"/pin",
		bytes.NewBufferString(`{"pinned":true}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("pin: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var pinned int
	db.DB.QueryRow(`SELECT COALESCE(pinned,0) FROM messages WHERE id=?`, msgID).Scan(&pinned)
	if pinned != 1 {
		t.Error("expected pinned=1")
	}

	// Unpin
	req = httptest.NewRequest("POST", "/api/messages/"+strconv.FormatInt(msgID, 10)+"/pin",
		bytes.NewBufferString(`{"pinned":false}`))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	db.DB.QueryRow(`SELECT COALESCE(pinned,0) FROM messages WHERE id=?`, msgID).Scan(&pinned)
	if pinned != 0 {
		t.Error("expected pinned=0 after toggle")
	}
}

func TestAPI_UpdateMessage(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 插入 3 条消息：user → assistant → user
	db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (1, 'user', '第一条')`)
	db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (1, 'assistant', '回复')`)
	res, _ := db.DB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (1, 'user', '第二条')`)
	_ = res

	// 更新第一条消息
	body := `{"content":"已编辑"}`
	req := httptest.NewRequest("PUT", "/api/messages/1", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// 验证内容已更新
	var content string
	db.DB.QueryRow(`SELECT content FROM messages WHERE id=1`).Scan(&content)
	if content != "已编辑" {
		t.Errorf("content = %q, want '已编辑'", content)
	}

	// 验证后续消息已删除
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM messages WHERE session_id=1`).Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 message after edit (later deleted), got %d", count)
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent API 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_AgentCRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 创建
	body := `{"name":"测试助手","description":"用于测试","system_prompt":"你是测试助手"}`
	req := httptest.NewRequest("POST", "/api/agents", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("create agent: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var created map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &created)
	agentID := int(created["id"].(float64))

	// 列表
	req = httptest.NewRequest("GET", "/api/agents", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatal("list agents failed")
	}
	var agents []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &agents)
	if len(agents) != 1 {
		t.Errorf("expected 1 agent, got %d", len(agents))
	}
	if agents[0]["name"] != "测试助手" {
		t.Errorf("agent name = %v", agents[0]["name"])
	}

	// 删除
	req = httptest.NewRequest("DELETE", "/api/agents/"+strconv.Itoa(agentID), nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("delete agent: expected 200, got %d", w.Code)
	}

	// 验证删除
	apiCache.Invalidate("agents")
	req = httptest.NewRequest("GET", "/api/agents", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	json.Unmarshal(w.Body.Bytes(), &agents)
	if len(agents) != 0 {
		t.Errorf("expected 0 agents after delete, got %d", len(agents))
	}
}

func TestAPI_AgentValidation(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 缺少 name
	body := `{"description":"no name"}`
	req := httptest.NewRequest("POST", "/api/agents", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Errorf("missing name should return 400, got %d", w.Code)
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Memory API 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_MemoryCRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	// 创建
	body := `{"content":"记住这个","category":"knowledge","agent_id":0}`
	req := httptest.NewRequest("POST", "/api/memories", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("create memory: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var created map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &created)
	memID := int(created["id"].(float64))

	// 列表
	req = httptest.NewRequest("GET", "/api/memories", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatal("list memories failed")
	}
	var memories []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &memories)
	if len(memories) != 1 {
		t.Errorf("expected 1 memory, got %d", len(memories))
	}

	// 删除
	req = httptest.NewRequest("DELETE", "/api/memories/"+strconv.Itoa(memID), nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("delete memory: expected 200, got %d", w.Code)
	}

	// 验证
	req = httptest.NewRequest("GET", "/api/memories", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	json.Unmarshal(w.Body.Bytes(), &memories)
	if len(memories) != 0 {
		t.Errorf("expected 0 memories, got %d", len(memories))
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Health & Ping 测试
// ═══════════════════════════════════════════════════════════════════════════

func TestAPI_Ping(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	req := httptest.NewRequest("GET", "/api/ping", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Errorf("ping: expected 200, got %d", w.Code)
	}
}

func TestAPI_Health(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	r := setupAPIRouter()

	req := httptest.NewRequest("GET", "/api/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("health: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "ok" {
		t.Errorf("health status = %v, want 'ok'", resp["status"])
	}
}
