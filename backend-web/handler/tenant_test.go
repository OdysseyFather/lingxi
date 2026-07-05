package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"lingxi-core/store"
	"lingxi-web-agent/config"
	"lingxi-web-agent/handler"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// ─── 内存 Mock Store ────────────────────────────────────────────

type memStore struct {
	mu       sync.Mutex
	sessions map[int64][]store.Session // userID → sessions
	agents   map[int64][]store.Agent
	memories map[int64][]store.Memory
	profiles map[int64][]store.APIProfile
	mcps     map[int64][]store.MCPServer
	nextID   int64
}

func newMemStore() *memStore {
	return &memStore{
		sessions: make(map[int64][]store.Session),
		agents:   make(map[int64][]store.Agent),
		memories: make(map[int64][]store.Memory),
		profiles: make(map[int64][]store.APIProfile),
		mcps:     make(map[int64][]store.MCPServer),
		nextID:   1,
	}
}

func (m *memStore) genID() int64 {
	m.nextID++
	return m.nextID
}

// ─── SessionStore ──────────────────────────────────────────────

func (m *memStore) ListSessions(_ context.Context, uid int64, _ store.SessionFilter) ([]store.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessions[uid], nil
}

func (m *memStore) CreateSession(_ context.Context, uid int64, s *store.Session) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := m.genID()
	s.ID = id
	m.sessions[uid] = append(m.sessions[uid], *s)
	return id, nil
}

func (m *memStore) GetSession(_ context.Context, uid, sid int64) (*store.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions[uid] {
		if s.ID == sid {
			return &s, nil
		}
	}
	return nil, fmt.Errorf("not found")
}

func (m *memStore) UpdateSession(_ context.Context, uid, sid int64, _ store.SessionPatch) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions[uid] {
		if s.ID == sid {
			return nil
		}
	}
	return fmt.Errorf("not found")
}

func (m *memStore) DeleteSession(_ context.Context, uid, sid int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	ss := m.sessions[uid]
	for i, s := range ss {
		if s.ID == sid {
			m.sessions[uid] = append(ss[:i], ss[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("not found")
}

func (m *memStore) BatchDeleteSessions(_ context.Context, uid int64, ids []int64) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	del := 0
	idSet := map[int64]bool{}
	for _, id := range ids {
		idSet[id] = true
	}
	var kept []store.Session
	for _, s := range m.sessions[uid] {
		if idSet[s.ID] {
			del++
		} else {
			kept = append(kept, s)
		}
	}
	m.sessions[uid] = kept
	return del, nil
}

func (m *memStore) SessionExists(_ context.Context, uid, sid int64) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions[uid] {
		if s.ID == sid {
			return true, nil
		}
	}
	return false, nil
}

func (m *memStore) GetClaudeSessionID(context.Context, int64, int64) (string, error) { return "", nil }
func (m *memStore) SetClaudeSessionID(context.Context, int64, int64, string) error   { return nil }
func (m *memStore) ClearClaudeSessionID(context.Context, int64, int64) error          { return nil }
func (m *memStore) UpdateSessionTitleIfDefault(context.Context, int64, int64, string) error {
	return nil
}

func (m *memStore) SetSessionAgent(_ context.Context, uid, sid, aid int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, s := range m.sessions[uid] {
		if s.ID == sid {
			m.sessions[uid][i].AgentID = aid
			return nil
		}
	}
	return fmt.Errorf("not found")
}

// ─── AgentStore ────────────────────────────────────────────────

func (m *memStore) ListAgents(_ context.Context, uid int64) ([]store.Agent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.agents[uid], nil
}

func (m *memStore) GetAgent(_ context.Context, uid, aid int64) (*store.Agent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, a := range m.agents[uid] {
		if a.ID == aid {
			return &a, nil
		}
	}
	return nil, fmt.Errorf("not found")
}

func (m *memStore) UpsertAgent(_ context.Context, uid int64, a *store.Agent) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a.ID == 0 {
		a.ID = m.genID()
		m.agents[uid] = append(m.agents[uid], *a)
	} else {
		for i, ag := range m.agents[uid] {
			if ag.ID == a.ID {
				m.agents[uid][i] = *a
				return a.ID, nil
			}
		}
		return 0, fmt.Errorf("not found")
	}
	return a.ID, nil
}

func (m *memStore) DeleteAgent(_ context.Context, uid, aid int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	aa := m.agents[uid]
	for i, a := range aa {
		if a.ID == aid {
			m.agents[uid] = append(aa[:i], aa[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("not found")
}

// ─── MemoryStore ───────────────────────────────────────────────

func (m *memStore) ListMemories(_ context.Context, uid, _ int64, _ int) ([]store.Memory, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.memories[uid], nil
}

func (m *memStore) CreateMemory(_ context.Context, uid, agentID int64, content, category string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := m.genID()
	m.memories[uid] = append(m.memories[uid], store.Memory{ID: id, AgentID: agentID, Content: content, Category: category})
	return id, nil
}

func (m *memStore) DeleteMemory(_ context.Context, uid, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	mm := m.memories[uid]
	for i, mem := range mm {
		if mem.ID == id {
			m.memories[uid] = append(mm[:i], mm[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("not found")
}

func (m *memStore) ClearMemories(_ context.Context, uid, _ int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.memories[uid] = nil
	return nil
}

func (m *memStore) ListMemoryContents(_ context.Context, uid, _ int64, _ int) ([]store.Memory, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.memories[uid], nil
}

// ─── MCPStore ──────────────────────────────────────────────────

func (m *memStore) ListMCPServers(_ context.Context, uid int64) ([]store.MCPServer, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.mcps[uid], nil
}

func (m *memStore) GetMCPServer(_ context.Context, uid, id int64) (*store.MCPServer, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.mcps[uid] {
		if s.ID == id {
			return &s, nil
		}
	}
	return nil, fmt.Errorf("not found")
}

func (m *memStore) UpsertMCPServer(_ context.Context, uid int64, s *store.MCPServer) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s.ID == 0 {
		s.ID = m.genID()
		m.mcps[uid] = append(m.mcps[uid], *s)
	}
	return s.ID, nil
}

func (m *memStore) DeleteMCPServer(_ context.Context, uid, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	ss := m.mcps[uid]
	for i, s := range ss {
		if s.ID == id {
			m.mcps[uid] = append(ss[:i], ss[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("not found")
}

func (m *memStore) SetMCPServerEnabled(_ context.Context, uid, id int64, _ bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.mcps[uid] {
		if s.ID == id {
			return nil
		}
	}
	return fmt.Errorf("not found")
}

// ─── ProviderStore ─────────────────────────────────────────────

func (m *memStore) ListProviders(context.Context) ([]store.Provider, error) { return nil, nil }
func (m *memStore) GetProvider(context.Context, int64) (*store.Provider, error) {
	return nil, fmt.Errorf("not found")
}

func (m *memStore) ListAPIProfiles(_ context.Context, uid int64, _ bool) ([]store.APIProfile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.profiles[uid], nil
}

func (m *memStore) GetAPIProfile(_ context.Context, uid, id int64, _ bool) (*store.APIProfile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, p := range m.profiles[uid] {
		if p.ID == id {
			return &p, nil
		}
	}
	return nil, fmt.Errorf("not found")
}

func (m *memStore) GetActiveAPIProfile(_ context.Context, uid int64, _ bool) (*store.APIProfile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, p := range m.profiles[uid] {
		if p.IsActive {
			return &p, nil
		}
	}
	return nil, fmt.Errorf("not found")
}

func (m *memStore) UpsertAPIProfile(_ context.Context, uid int64, ap *store.APIProfile) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if ap.ID == 0 {
		ap.ID = m.genID()
		m.profiles[uid] = append(m.profiles[uid], *ap)
	}
	return ap.ID, nil
}

func (m *memStore) DeleteAPIProfile(_ context.Context, uid, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	pp := m.profiles[uid]
	for i, p := range pp {
		if p.ID == id {
			m.profiles[uid] = append(pp[:i], pp[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("not found")
}

func (m *memStore) ActivateAPIProfile(_ context.Context, uid, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	found := false
	for i, p := range m.profiles[uid] {
		if p.ID == id {
			m.profiles[uid][i].IsActive = true
			found = true
		} else {
			m.profiles[uid][i].IsActive = false
		}
	}
	if !found {
		return fmt.Errorf("not found")
	}
	return nil
}

// ─── MessageStore / SkillStore / KnowledgeStore / UsageStore (stubs) ──

func (m *memStore) ListMessages(context.Context, int64, int64, store.MessagePage) ([]store.Message, error) {
	return nil, nil
}
func (m *memStore) GetMessage(context.Context, int64, int64) (*store.Message, error) {
	return nil, fmt.Errorf("not found")
}
func (m *memStore) InsertMessage(context.Context, int64, *store.Message) (int64, error) { return 0, nil }
func (m *memStore) UpdateMessage(context.Context, int64, int64, string) error           { return nil }
func (m *memStore) DeleteMessagesAfter(context.Context, int64, int64, int64) (int64, error) {
	return 0, nil
}
func (m *memStore) DeleteMessagesFrom(context.Context, int64, int64, int64) (int64, error) {
	return 0, nil
}
func (m *memStore) SetMessageFeedback(context.Context, int64, int64, string) error { return nil }
func (m *memStore) SearchMessages(context.Context, int64, string, int) ([]store.MessageSearchHit, error) {
	return nil, nil
}
func (m *memStore) CountMessages(context.Context, int64, int64) (int, error) { return 0, nil }

func (m *memStore) ListSkills(context.Context, int64) ([]store.Skill, error) { return nil, nil }
func (m *memStore) GetSkill(context.Context, int64, int64) (*store.Skill, error) {
	return nil, fmt.Errorf("not found")
}
func (m *memStore) GetSkillByName(context.Context, int64, string) (*store.Skill, error) {
	return nil, fmt.Errorf("not found")
}
func (m *memStore) InsertSkill(context.Context, int64, *store.Skill) (int64, error)       { return 0, nil }
func (m *memStore) UpdateSkill(context.Context, int64, *store.Skill) error                 { return nil }
func (m *memStore) SetSkillInstalled(context.Context, int64, int64, bool) error             { return nil }
func (m *memStore) DeleteSkill(context.Context, int64, int64) error                         { return nil }
func (m *memStore) ListInstalledSkillPaths(context.Context, int64) ([]store.SkillPath, error) {
	return nil, nil
}

func (m *memStore) ListKnowledge(context.Context, int64) ([]store.KnowledgeItem, error) {
	return nil, nil
}
func (m *memStore) GetKnowledge(context.Context, int64, int64) (*store.KnowledgeItem, error) {
	return nil, fmt.Errorf("not found")
}
func (m *memStore) InsertKnowledge(context.Context, int64, *store.KnowledgeItem) (int64, error) {
	return 0, nil
}
func (m *memStore) UpdateKnowledge(context.Context, int64, int64, string, string, string, string) error {
	return nil
}
func (m *memStore) DeleteKnowledge(context.Context, int64, int64) (string, error) { return "", nil }
func (m *memStore) ListKnowledgeCategories(context.Context, int64) ([]store.KnowledgeCategory, error) {
	return nil, nil
}
func (m *memStore) CreateKnowledgeCategory(context.Context, int64, string, string) (int64, error) {
	return 0, nil
}
func (m *memStore) DeleteKnowledgeCategory(context.Context, int64, int64) error        { return nil }
func (m *memStore) UpdateKnowledgeCategory(context.Context, int64, int64, string, string) error {
	return nil
}
func (m *memStore) UpdateKnowledgeItemCategory(context.Context, int64, int64, string) error {
	return nil
}

func (m *memStore) InsertUsageRecord(context.Context, int64, *store.UsageRecord) (int64, error) {
	return 0, nil
}
func (m *memStore) SumUsageSince(context.Context, int64, time.Time) (store.UsageSummary, error) {
	return store.UsageSummary{}, nil
}
func (m *memStore) GroupUsageByDay(context.Context, int64, int) ([]map[string]interface{}, error) {
	return nil, nil
}
func (m *memStore) GroupUsageByModel(context.Context, int64, int) ([]map[string]interface{}, error) {
	return nil, nil
}
func (m *memStore) GroupUsageByAgent(context.Context, int64, int) ([]map[string]interface{}, error) {
	return nil, nil
}
func (m *memStore) GroupUsageCostByDay(context.Context, int64, int) ([]map[string]interface{}, error) {
	return nil, nil
}
func (m *memStore) ListRecentUsage(context.Context, int64, int) ([]map[string]interface{}, error) {
	return nil, nil
}
func (m *memStore) SaveUsageQuotaSnapshot(context.Context, int64, int64, string) error { return nil }
func (m *memStore) GetUsageQuotaCache(context.Context, int64, int64) (string, time.Time, bool) {
	return "", time.Time{}, false
}

// AuthStore stubs
func (m *memStore) GetUserByUsername(context.Context, string) (*store.WebUser, error) {
	return nil, fmt.Errorf("not found")
}
func (m *memStore) GetUserByID(context.Context, int64) (*store.WebUser, error) {
	return nil, fmt.Errorf("not found")
}
func (m *memStore) CreateUser(context.Context, *store.WebUser) (int64, error)   { return 0, nil }
func (m *memStore) CreateAuthToken(context.Context, *store.AuthToken) (int64, error) { return 0, nil }
func (m *memStore) GetAuthTokenByHash(context.Context, string) (*store.AuthToken, error) {
	return nil, fmt.Errorf("not found")
}
func (m *memStore) RevokeAuthToken(context.Context, int64) error { return nil }
func (m *memStore) GetInvitationByCode(context.Context, string) (*store.Invitation, error) {
	return nil, fmt.Errorf("not found")
}

// QuotaStore stubs
func (m *memStore) GetQuotaLimits(context.Context, int64) (*store.QuotaLimits, error) {
	return &store.QuotaLimits{}, nil
}
func (m *memStore) GetUsageQuota(context.Context, int64) (*store.UsageQuota, error) {
	return &store.UsageQuota{}, nil
}
func (m *memStore) TryAddStorage(context.Context, int64, int64) error             { return nil }
func (m *memStore) TryAcquireChatSlot(context.Context, int64, int) error          { return nil }
func (m *memStore) ReleaseChatSlot(context.Context, int64) error                   { return nil }
func (m *memStore) CheckRateLimit(context.Context, int64, string, string, int, int) (bool, error) {
	return true, nil
}

// 空接口 stubs
func (m *memStore) placeholder() {} // AdminStore/AuditStore/etc. 全部空接口

// ─── 测试辅助 ──────────────────────────────────────────────────

func setupRouter(st store.Store) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler.InitWeb(config.Config{JWTSecret: "test-secret"}, st)

	r := gin.New()
	return r
}

func withUser(r *gin.Engine, uid int64, method, path string, body interface{}) *httptest.ResponseRecorder {
	var reqBody *bytes.Buffer
	if body != nil {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewBuffer(b)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(method, path, reqBody)
	req.Header.Set("Content-Type", "application/json")

	// 注入 userID 到 gin.Context
	r.Use(func(c *gin.Context) {
		c.Set("userID", uid)
		c.Next()
	})
	r.ServeHTTP(w, req)
	return w
}

// ─── IDOR 测试 ─────────────────────────────────────────────────

func TestTenantSessionIDOR(t *testing.T) {
	st := newMemStore()
	r := setupRouter(st)

	userA := int64(100)
	userB := int64(200)

	// 用户A 创建 session → 路由设 userID = A
	rA := gin.New()
	rA.Use(func(c *gin.Context) { c.Set("userID", userA); c.Next() })
	rA.POST("/api/sessions", handler.CreateSession)
	rA.GET("/api/sessions", handler.ListSessions)
	rA.DELETE("/api/sessions/:id", handler.DeleteSession)
	rA.PATCH("/api/sessions/:id", handler.UpdateSession)

	rB := gin.New()
	rB.Use(func(c *gin.Context) { c.Set("userID", userB); c.Next() })
	rB.GET("/api/sessions", handler.ListSessions)
	rB.DELETE("/api/sessions/:id", handler.DeleteSession)
	rB.PATCH("/api/sessions/:id", handler.UpdateSession)

	_ = r // 不直接用 setupRouter 里的 r

	// A 创建 session
	body, _ := json.Marshal(map[string]string{"title": "A的会话"})
	wCreate := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/sessions", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rA.ServeHTTP(wCreate, req)
	if wCreate.Code != 200 {
		t.Fatalf("A create session: want 200, got %d, body=%s", wCreate.Code, wCreate.Body.String())
	}
	var created map[string]interface{}
	json.Unmarshal(wCreate.Body.Bytes(), &created)
	sessionID := fmt.Sprintf("%.0f", created["id"].(float64))

	// A list → 应该有 1 条
	wListA := httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/sessions", nil)
	rA.ServeHTTP(wListA, req)
	var listA []interface{}
	json.Unmarshal(wListA.Body.Bytes(), &listA)
	if len(listA) != 1 {
		t.Fatalf("A list sessions: want 1, got %d", len(listA))
	}

	// B list → 应该有 0 条
	wListB := httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/sessions", nil)
	rB.ServeHTTP(wListB, req)
	var listB []interface{}
	json.Unmarshal(wListB.Body.Bytes(), &listB)
	if len(listB) != 0 {
		t.Fatalf("IDOR: B list sessions should be empty, got %d", len(listB))
	}

	// B 尝试删除 A 的 session → 应失败
	wDelB := httptest.NewRecorder()
	req, _ = http.NewRequest("DELETE", "/api/sessions/"+sessionID, nil)
	rB.ServeHTTP(wDelB, req)
	if wDelB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to delete A's session")
	}

	// B 尝试修改 A 的 session → 应失败
	patchBody, _ := json.Marshal(map[string]interface{}{"title": ptr("hacked")})
	wPatchB := httptest.NewRecorder()
	req, _ = http.NewRequest("PATCH", "/api/sessions/"+sessionID, bytes.NewBuffer(patchBody))
	req.Header.Set("Content-Type", "application/json")
	rB.ServeHTTP(wPatchB, req)
	if wPatchB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to update A's session")
	}

	// A 删除 → 应成功
	wDelA := httptest.NewRecorder()
	req, _ = http.NewRequest("DELETE", "/api/sessions/"+sessionID, nil)
	rA.ServeHTTP(wDelA, req)
	if wDelA.Code != 200 {
		t.Fatalf("A delete session: want 200, got %d", wDelA.Code)
	}
}

func TestTenantAgentIDOR(t *testing.T) {
	st := newMemStore()
	setupRouter(st)

	userA := int64(100)
	userB := int64(200)

	rA := gin.New()
	rA.Use(func(c *gin.Context) { c.Set("userID", userA); c.Next() })
	rA.POST("/api/agents", handler.UpsertAgent)
	rA.GET("/api/agents", handler.ListAgents)
	rA.GET("/api/agents/:id", handler.GetAgent)
	rA.DELETE("/api/agents/:id", handler.DeleteAgent)

	rB := gin.New()
	rB.Use(func(c *gin.Context) { c.Set("userID", userB); c.Next() })
	rB.GET("/api/agents", handler.ListAgents)
	rB.GET("/api/agents/:id", handler.GetAgent)
	rB.DELETE("/api/agents/:id", handler.DeleteAgent)

	// A 创建 agent
	body, _ := json.Marshal(map[string]interface{}{"name": "A的助理", "system_prompt": "你是A的助理"})
	wCreate := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/agents", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rA.ServeHTTP(wCreate, req)
	if wCreate.Code != 200 {
		t.Fatalf("A create agent: want 200, got %d, body=%s", wCreate.Code, wCreate.Body.String())
	}
	var created map[string]interface{}
	json.Unmarshal(wCreate.Body.Bytes(), &created)
	agentID := fmt.Sprintf("%.0f", created["id"].(float64))

	// B list → 空
	wListB := httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/agents", nil)
	rB.ServeHTTP(wListB, req)
	var listB []interface{}
	json.Unmarshal(wListB.Body.Bytes(), &listB)
	if len(listB) != 0 {
		t.Fatalf("IDOR: B list agents should be empty, got %d", len(listB))
	}

	// B 查看 A 的 agent → 应 404
	wGetB := httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/agents/"+agentID, nil)
	rB.ServeHTTP(wGetB, req)
	if wGetB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to GET A's agent")
	}

	// B 删除 A 的 agent → 应失败
	wDelB := httptest.NewRecorder()
	req, _ = http.NewRequest("DELETE", "/api/agents/"+agentID, nil)
	rB.ServeHTTP(wDelB, req)
	if wDelB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to delete A's agent")
	}
}

func TestTenantMemoryIDOR(t *testing.T) {
	st := newMemStore()
	setupRouter(st)

	userA := int64(100)
	userB := int64(200)

	rA := gin.New()
	rA.Use(func(c *gin.Context) { c.Set("userID", userA); c.Next() })
	rA.POST("/api/memories", handler.CreateMemory)
	rA.GET("/api/memories", handler.ListMemories)
	rA.DELETE("/api/memories/:id", handler.DeleteMemory)

	rB := gin.New()
	rB.Use(func(c *gin.Context) { c.Set("userID", userB); c.Next() })
	rB.GET("/api/memories", handler.ListMemories)
	rB.DELETE("/api/memories/:id", handler.DeleteMemory)

	// A 创建 memory
	body, _ := json.Marshal(map[string]interface{}{"content": "A的记忆", "category": "general"})
	wCreate := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/memories", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rA.ServeHTTP(wCreate, req)
	if wCreate.Code != 200 {
		t.Fatalf("A create memory: want 200, got %d, body=%s", wCreate.Code, wCreate.Body.String())
	}
	var created map[string]interface{}
	json.Unmarshal(wCreate.Body.Bytes(), &created)
	memID := fmt.Sprintf("%.0f", created["id"].(float64))

	// B list → 空
	wListB := httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/memories", nil)
	rB.ServeHTTP(wListB, req)
	var listB []interface{}
	json.Unmarshal(wListB.Body.Bytes(), &listB)
	if len(listB) != 0 {
		t.Fatalf("IDOR: B list memories should be empty, got %d", len(listB))
	}

	// B 删除 A 的 memory → 应失败
	wDelB := httptest.NewRecorder()
	req, _ = http.NewRequest("DELETE", "/api/memories/"+memID, nil)
	rB.ServeHTTP(wDelB, req)
	if wDelB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to delete A's memory")
	}
}

func TestTenantAPIProfileIDOR(t *testing.T) {
	st := newMemStore()
	setupRouter(st)

	userA := int64(100)
	userB := int64(200)

	rA := gin.New()
	rA.Use(func(c *gin.Context) { c.Set("userID", userA); c.Next() })
	rA.POST("/api/api-profiles", handler.UpsertAPIProfile)
	rA.GET("/api/api-profiles", handler.ListAPIProfiles)
	rA.DELETE("/api/api-profiles/:id", handler.DeleteAPIProfile)
	rA.POST("/api/api-profiles/:id/activate", handler.ActivateAPIProfile)

	rB := gin.New()
	rB.Use(func(c *gin.Context) { c.Set("userID", userB); c.Next() })
	rB.GET("/api/api-profiles", handler.ListAPIProfiles)
	rB.DELETE("/api/api-profiles/:id", handler.DeleteAPIProfile)
	rB.POST("/api/api-profiles/:id/activate", handler.ActivateAPIProfile)

	// A 创建 profile
	body, _ := json.Marshal(map[string]interface{}{"name": "A-profile", "provider_id": 1, "base_url": "http://a.com", "api_key": "sk-aaa"})
	wCreate := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/api-profiles", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rA.ServeHTTP(wCreate, req)
	if wCreate.Code != 200 {
		t.Fatalf("A create profile: want 200, got %d, body=%s", wCreate.Code, wCreate.Body.String())
	}
	var created map[string]interface{}
	json.Unmarshal(wCreate.Body.Bytes(), &created)
	profileID := fmt.Sprintf("%.0f", created["id"].(float64))

	// B list → 空
	wListB := httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/api-profiles", nil)
	rB.ServeHTTP(wListB, req)
	var listB []interface{}
	json.Unmarshal(wListB.Body.Bytes(), &listB)
	if len(listB) != 0 {
		t.Fatalf("IDOR: B list profiles should be empty, got %d", len(listB))
	}

	// B 删除 A 的 profile → 应失败
	wDelB := httptest.NewRecorder()
	req, _ = http.NewRequest("DELETE", "/api/api-profiles/"+profileID, nil)
	rB.ServeHTTP(wDelB, req)
	if wDelB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to delete A's profile")
	}

	// B 激活 A 的 profile → 应失败
	wActB := httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/api/api-profiles/"+profileID+"/activate", nil)
	rB.ServeHTTP(wActB, req)
	if wActB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to activate A's profile")
	}
}

func TestTenantMCPIDOR(t *testing.T) {
	st := newMemStore()
	setupRouter(st)

	userA := int64(100)
	userB := int64(200)

	rA := gin.New()
	rA.Use(func(c *gin.Context) { c.Set("userID", userA); c.Next() })
	rA.POST("/api/mcp", handler.UpsertMCPServer)
	rA.GET("/api/mcp", handler.ListMCPServers)
	rA.DELETE("/api/mcp/:id", handler.DeleteMCPServer)
	rA.POST("/api/mcp/:id/toggle", handler.ToggleMCPServer)

	rB := gin.New()
	rB.Use(func(c *gin.Context) { c.Set("userID", userB); c.Next() })
	rB.GET("/api/mcp", handler.ListMCPServers)
	rB.DELETE("/api/mcp/:id", handler.DeleteMCPServer)
	rB.POST("/api/mcp/:id/toggle", handler.ToggleMCPServer)

	// A 创建 MCP
	body, _ := json.Marshal(map[string]interface{}{"name": "A-mcp", "type": "stdio", "command": "test"})
	wCreate := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/mcp", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rA.ServeHTTP(wCreate, req)
	if wCreate.Code != 200 {
		t.Fatalf("A create MCP: want 200, got %d, body=%s", wCreate.Code, wCreate.Body.String())
	}
	var created map[string]interface{}
	json.Unmarshal(wCreate.Body.Bytes(), &created)
	mcpID := fmt.Sprintf("%.0f", created["id"].(float64))

	// B list → 空
	wListB := httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/mcp", nil)
	rB.ServeHTTP(wListB, req)
	var listB []interface{}
	json.Unmarshal(wListB.Body.Bytes(), &listB)
	if len(listB) != 0 {
		t.Fatalf("IDOR: B list MCP should be empty, got %d", len(listB))
	}

	// B 删除 A 的 MCP → 应失败
	wDelB := httptest.NewRecorder()
	req, _ = http.NewRequest("DELETE", "/api/mcp/"+mcpID, nil)
	rB.ServeHTTP(wDelB, req)
	if wDelB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to delete A's MCP")
	}

	// B toggle A 的 MCP → 应失败
	wTogB := httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/api/mcp/"+mcpID+"/toggle", nil)
	rB.ServeHTTP(wTogB, req)
	if wTogB.Code == 200 {
		t.Fatal("IDOR: B should NOT be able to toggle A's MCP")
	}
}

func TestPasswordHash(t *testing.T) {
	_, err := bcrypt.GenerateFromPassword([]byte("x"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
}

func ptr(s string) *string { return &s }
