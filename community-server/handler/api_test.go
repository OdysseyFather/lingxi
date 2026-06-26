package handler

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"community-server/config"
	"community-server/db"
	"community-server/storage"

	"github.com/gin-gonic/gin"
)

// testServer 测试环境
type testServer struct {
	router      *gin.Engine
	baseURL     string
	tempDBPath  string
	tempStorage string
}

func newTestServer(t *testing.T) *testServer {
	// 关闭旧 DB 连接（如果存在）
	if db.DB != nil {
		db.DB.Close()
		db.DB = nil
	}

	// 临时 DB + Storage
	dir, _ := os.MkdirTemp("", "lingxi-community-test-*")
	dbPath := dir + "/community.db"
	storageRoot := dir + "/storage"

	// 配置覆盖
	os.Setenv("DB_PATH", dbPath)
	os.Setenv("STORAGE_ROOT", storageRoot)
	os.Setenv("PORT", "0")
	// 重置 config 缓存
	resetConfigForTest(dbPath, storageRoot)

	// 初始化 db
	db.Init()

	// 注册路由
	gin.SetMode(gin.TestMode)
	r := gin.New()

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	r.Static("/static/bundles", storageRoot+"/bundles")
	r.Static("/static/avatars", storageRoot+"/avatars")

	api := r.Group("/community")
	api.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	api.POST("/auth/anon", RegisterAnon)

	publicWithOptionalAuth := api.Group("")
	publicWithOptionalAuth.Use(AuthMiddleware(true))
	{
		publicWithOptionalAuth.GET("/agents", ListAgents)
		publicWithOptionalAuth.GET("/leaderboard", Leaderboard)
		publicWithOptionalAuth.GET("/agents/:id", GetAgent)
		publicWithOptionalAuth.GET("/agents/:id/ratings", ListRatings)
		publicWithOptionalAuth.GET("/agents/:id/comments", ListComments)
		publicWithOptionalAuth.GET("/agents/:id/bundle", DownloadBundle)
		publicWithOptionalAuth.GET("/users/:id", GetUser)
		publicWithOptionalAuth.GET("/users/:id/following", ListFollowing)
		publicWithOptionalAuth.GET("/users/:id/followers", ListFollowers)
		publicWithOptionalAuth.GET("/invocations/:code", GetInvocationInfo)
		publicWithOptionalAuth.POST("/invocations/:code/invoke", InvokeAgent)
	}

	authed := api.Group("")
	authed.Use(AuthMiddleware(false))
	{
		authed.GET("/auth/me", GetMe)
		authed.PUT("/auth/me", UpdateMe)
		authed.POST("/agents", PublishAgent)
		authed.PUT("/agents/:id", UpdateAgent)
		authed.DELETE("/agents/:id", DeleteAgent)
		authed.GET("/agents/mine", ListMyAgents)
		authed.POST("/agents/:id/rate", UpsertRating)
		authed.POST("/agents/:id/comments", CreateComment)
		authed.DELETE("/comments/:id", DeleteComment)
		authed.POST("/users/:id/follow", FollowUser)
		authed.DELETE("/users/:id/follow", UnfollowUser)
		authed.POST("/agents/:id/invocations", CreateInvocation)
		authed.GET("/agents/:id/invocations", ListAgentInvocations)
		authed.GET("/invocations/mine", ListMyInvocations)
		authed.POST("/invocations/:code/toggle", ToggleInvocation)
		authed.DELETE("/invocations/:code", DeleteInvocation)
		authed.GET("/invocations/logs/mine", ListInvocationLogs)
	}

	srv := httptest.NewServer(r)

	// 关闭 db 连接以便下次测试重新初始化
	t.Cleanup(func() {
		srv.Close()
		db.DB.Close()
		os.RemoveAll(dir)
	})

	return &testServer{
		router:      r,
		baseURL:     srv.URL,
		tempDBPath:  dbPath,
		tempStorage: storageRoot,
	}
}

func resetConfigForTest(dbPath, storageRoot string) {
	// 强制重新加载配置（让 os.Setenv 生效）
	config.Reload()
}

// request 通用 HTTP 请求
func (s *testServer) request(method, path string, body interface{}, token string) (*http.Response, []byte) {
	var bodyReader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(data)
	}
	req, _ := http.NewRequest(method, s.baseURL+path, bodyReader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp, data
}

func (s *testServer) registerAnon() string {
	resp, data := s.request("POST", "/community/auth/anon", nil, "")
	if resp.StatusCode != 200 {
		slog.Error("register anon failed", "status", resp.StatusCode, "body", string(data))
		panic("anon register failed")
	}
	var r struct {
		Token string `json:"token"`
	}
	json.Unmarshal(data, &r)
	return r.Token
}

// TestHealthCheck GET /community/health
func TestHealthCheck(t *testing.T) {
	s := newTestServer(t)
	resp, body := s.request("GET", "/community/health", nil, "")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var r map[string]interface{}
	json.Unmarshal(body, &r)
	if r["ok"] != true {
		t.Fatalf("expected ok=true, got %v", r["ok"])
	}
}

// TestRegisterAnon 匿名注册
func TestRegisterAnon(t *testing.T) {
	s := newTestServer(t)
	resp, body := s.request("POST", "/community/auth/anon", nil, "")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var r struct {
		Token string                 `json:"token"`
		User  map[string]interface{} `json:"user"`
	}
	json.Unmarshal(body, &r)
	if r.Token == "" {
		t.Fatalf("expected non-empty token, got empty")
	}
	if r.User == nil || r.User["id"] == "" {
		t.Fatalf("expected non-empty user, got %v", r.User)
	}
	if !strings.HasPrefix(r.User["username"].(string), "user-") {
		t.Fatalf("expected username starting with 'user-', got %v", r.User["username"])
	}
}

// TestGetMe 获取当前用户
func TestGetMe(t *testing.T) {
	s := newTestServer(t)
	token := s.registerAnon()

	resp, body := s.request("GET", "/community/auth/me", nil, token)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var r struct {
		User map[string]interface{} `json:"user"`
	}
	json.Unmarshal(body, &r)
	if r.User == nil || r.User["id"] == "" {
		t.Fatalf("expected user, got %v", r.User)
	}
}

// TestUpdateMe 更新个人资料
func TestUpdateMe(t *testing.T) {
	s := newTestServer(t)
	token := s.registerAnon()

	resp, body := s.request("PUT", "/community/auth/me", map[string]interface{}{
		"display_name": "测试用户",
		"avatar":       "🚀",
		"bio":          "这是一个测试用户",
	}, token)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var r struct {
		User map[string]interface{} `json:"user"`
	}
	json.Unmarshal(body, &r)
	if r.User["display_name"] != "测试用户" {
		t.Fatalf("expected display_name=测试用户, got %v", r.User["display_name"])
	}
	if r.User["avatar"] != "🚀" {
		t.Fatalf("expected avatar=🚀, got %v", r.User["avatar"])
	}
}

// TestPublishAgent 发布 Agent 全流程
func TestPublishAgent(t *testing.T) {
	s := newTestServer(t)
	token := s.registerAnon()

	// 制作一个最小 bundle
	bundleData := makeTestBundle(t, "测试 Agent", "这是一个测试 Agent")

	// multipart 上传
	body := &bytes.Buffer{}
	w := multipartWriter(body, map[string]string{
		"name":        "测试 Agent",
		"description": "这是一个测试 Agent",
		"avatar":      "🚀",
		"category":    "programming",
		"tags":        "测试,演示",
		"version":     "1.0.0",
	}, "bundle", "test.lxbundle", bundleData)

	req, _ := http.NewRequest("POST", s.baseURL+"/community/agents", body)
	req.Header.Set("Content-Type", w)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request error: %v", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, data)
	}

	var r struct {
		Agent map[string]interface{} `json:"agent"`
	}
	json.Unmarshal(data, &r)
	if r.Agent == nil || r.Agent["id"] == "" {
		t.Fatalf("expected agent, got %v", r.Agent)
	}
	if r.Agent["name"] != "测试 Agent" {
		t.Fatalf("expected name=测试 Agent, got %v", r.Agent["name"])
	}
	if r.Agent["version"] != "1.0.0" {
		t.Fatalf("expected version=1.0.0, got %v", r.Agent["version"])
	}
}

// TestListAgents 列表查询
func TestListAgents(t *testing.T) {
	s := newTestServer(t)
	token := s.registerAnon()

	// 发布 2 个 Agent
	publishTestAgent(t, s, token, "Agent A", "cat1")
	publishTestAgent(t, s, token, "Agent B", "cat2")

	// 不带筛选
	resp, body := s.request("GET", "/community/agents", nil, "")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var r struct {
		Agents []map[string]interface{} `json:"agents"`
		Total  int                      `json:"total"`
	}
	json.Unmarshal(body, &r)
	if r.Total != 2 {
		t.Fatalf("expected total=2, got %d", r.Total)
	}
	if len(r.Agents) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(r.Agents))
	}

	// 按分类筛选
	resp, body = s.request("GET", "/community/agents?category=cat1", nil, "")
	json.Unmarshal(body, &r)
	if r.Total != 1 {
		t.Fatalf("expected total=1, got %d", r.Total)
	}

	// 搜索（用唯一词避免子串误匹配）
	resp, body = s.request("GET", "/community/agents?search=uniqueAgentA", nil, "")
	json.Unmarshal(body, &r)
	if r.Total != 1 {
		t.Fatalf("expected total=1 for search 'uniqueAgentA', got %d", r.Total)
	}
}

// TestRateAgent 评分
func TestRateAgent(t *testing.T) {
	s := newTestServer(t)
	publisherToken := s.registerAnon()
	agentID := publishTestAgent(t, s, publisherToken, "Test Agent", "cat")

	// 另一个用户评分
	raterToken := s.registerAnon()

	resp, body := s.request("POST", "/community/agents/"+agentID+"/rate", map[string]interface{}{
		"score":  5,
		"review": "非常棒",
	}, raterToken)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}

	// 重复评分 = 更新
	resp, body = s.request("POST", "/community/agents/"+agentID+"/rate", map[string]interface{}{
		"score": 4,
	}, raterToken)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200 on re-rate, got %d: %s", resp.StatusCode, body)
	}

	// 列出评分
	resp, body = s.request("GET", "/community/agents/"+agentID+"/ratings", nil, "")
	var r struct {
		Ratings []map[string]interface{} `json:"ratings"`
	}
	json.Unmarshal(body, &r)
	if len(r.Ratings) != 1 {
		t.Fatalf("expected 1 rating (upsert), got %d", len(r.Ratings))
	}
	if int(r.Ratings[0]["score"].(float64)) != 4 {
		t.Fatalf("expected score=4 (updated), got %v", r.Ratings[0]["score"])
	}

	// 校验 agent.rating_avg 已更新
	resp, body = s.request("GET", "/community/agents/"+agentID, nil, "")
	var ar struct {
		Agent map[string]interface{} `json:"agent"`
	}
	json.Unmarshal(body, &ar)
	if ar.Agent["rating_count"].(float64) != 1 {
		t.Fatalf("expected rating_count=1, got %v", ar.Agent["rating_count"])
	}
	if ar.Agent["rating_avg"].(float64) != 4 {
		t.Fatalf("expected rating_avg=4, got %v", ar.Agent["rating_avg"])
	}
}

// TestFollow 关注 + 列表
func TestFollow(t *testing.T) {
	s := newTestServer(t)
	userA := s.registerAnon()
	userB := s.registerAnon()

	// 查 A 的 user id
	resp, body := s.request("GET", "/community/auth/me", nil, userA)
	var me struct {
		User map[string]interface{} `json:"user"`
	}
	json.Unmarshal(body, &me)
	userAID := me.User["id"].(string)

	// B 关注 A
	resp, body = s.request("POST", "/community/users/"+userAID+"/follow", nil, userB)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}

	// 查 A 的粉丝列表
	resp, body = s.request("GET", "/community/users/"+userAID+"/followers", nil, "")
	var r struct {
		Users []map[string]interface{} `json:"users"`
	}
	json.Unmarshal(body, &r)
	if len(r.Users) != 1 {
		t.Fatalf("expected 1 follower, got %d", len(r.Users))
	}

	// 查 B 的关注列表
	resp, body = s.request("GET", "/community/users/"+userAID+"/following", nil, userB)
	// 注意：这里查的是 userA 的关注列表，但 B 应该关注 A，所以应该查 B 的 following
	// 获取 B 的 id 先
	resp, body = s.request("GET", "/community/auth/me", nil, userB)
	json.Unmarshal(body, &me)
	userBID := me.User["id"].(string)

	resp, body = s.request("GET", "/community/users/"+userBID+"/following", nil, "")
	json.Unmarshal(body, &r)
	if len(r.Users) != 1 {
		t.Fatalf("expected 1 following, got %d", len(r.Users))
	}

	// 取关
	resp, body = s.request("DELETE", "/community/users/"+userAID+"/follow", nil, userB)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}

	// 再查粉丝列表
	resp, body = s.request("GET", "/community/users/"+userAID+"/followers", nil, "")
	json.Unmarshal(body, &r)
	if len(r.Users) != 0 {
		t.Fatalf("expected 0 follower after unfollow, got %d", len(r.Users))
	}
}

// TestComment 评论
func TestComment(t *testing.T) {
	s := newTestServer(t)
	publisherToken := s.registerAnon()
	agentID := publishTestAgent(t, s, publisherToken, "Test Agent", "cat")

	commenterToken := s.registerAnon()

	// 创建评论
	resp, body := s.request("POST", "/community/agents/"+agentID+"/comments", map[string]interface{}{
		"content": "这个 Agent 很好用",
	}, commenterToken)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}

	// 创建回复
	resp, body = s.request("POST", "/community/agents/"+agentID+"/comments", map[string]interface{}{
		"content":   "谢谢支持",
		"parent_id": 1,
	}, publisherToken)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200 on reply, got %d: %s", resp.StatusCode, body)
	}

	// 查评论列表
	resp, body = s.request("GET", "/community/agents/"+agentID+"/comments", nil, "")
	var r struct {
		Comments []map[string]interface{} `json:"comments"`
	}
	json.Unmarshal(body, &r)
	if len(r.Comments) != 1 {
		t.Fatalf("expected 1 top-level comment, got %d", len(r.Comments))
	}
	// 检查 reply
	replies := r.Comments[0]["replies"].([]interface{})
	if len(replies) != 1 {
		t.Fatalf("expected 1 reply, got %d", len(replies))
	}
}

// TestInvocation 邀请码全流程
func TestInvocation(t *testing.T) {
	s := newTestServer(t)
	publisherToken := s.registerAnon()
	agentID := publishTestAgent(t, s, publisherToken, "Test Agent", "cat")

	// 创建邀请码
	resp, body := s.request("POST", "/community/agents/"+agentID+"/invocations", map[string]interface{}{
		"daily_limit": 10,
	}, publisherToken)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var r struct {
		Invocation map[string]interface{} `json:"invocation"`
	}
	json.Unmarshal(body, &r)
	code := r.Invocation["code"].(string)
	if len(code) != 6 {
		t.Fatalf("expected 6-char code, got %s", code)
	}

	// 公开查询邀请码信息
	resp, body = s.request("GET", "/community/invocations/"+code, nil, "")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var info struct {
		AgentID    string `json:"agent_id"`
		DailyLimit int    `json:"daily_limit"`
	}
	json.Unmarshal(body, &info)
	if info.AgentID != agentID {
		t.Fatalf("expected agent_id=%s, got %s", agentID, info.AgentID)
	}
	if info.DailyLimit != 10 {
		t.Fatalf("expected daily_limit=10, got %d", info.DailyLimit)
	}

	// 列出我的邀请码
	resp, body = s.request("GET", "/community/invocations/mine", nil, publisherToken)
	var mr struct {
		Invocations []map[string]interface{} `json:"invocations"`
	}
	json.Unmarshal(body, &mr)
	if len(mr.Invocations) != 1 {
		t.Fatalf("expected 1 invocation, got %d", len(mr.Invocations))
	}

	// 禁用
	resp, body = s.request("POST", "/community/invocations/"+code+"/toggle", map[string]interface{}{
		"is_active": false,
	}, publisherToken)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200 on toggle, got %d: %s", resp.StatusCode, body)
	}

	// 调用应失败
	resp, body = s.request("POST", "/community/invocations/"+code+"/invoke", map[string]interface{}{
		"message": "你好",
	}, "")
	if resp.StatusCode != 403 {
		t.Fatalf("expected 403 (disabled), got %d: %s", resp.StatusCode, body)
	}

	// 重新启用
	s.request("POST", "/community/invocations/"+code+"/toggle", map[string]interface{}{
		"is_active": true,
	}, publisherToken)

	// 调用：没有 tunnel token，应返回 503
	resp, body = s.request("POST", "/community/invocations/"+code+"/invoke", map[string]interface{}{
		"message": "你好",
	}, "")
	if resp.StatusCode != 503 {
		t.Fatalf("expected 503 (no tunnel token), got %d: %s", resp.StatusCode, body)
	}

	// 调用日志应有记录
	resp, body = s.request("GET", "/community/invocations/logs/mine", nil, publisherToken)
	var lr struct {
		Logs []map[string]interface{} `json:"logs"`
	}
	json.Unmarshal(body, &lr)
	if len(lr.Logs) == 0 {
		t.Fatalf("expected at least 1 log entry, got 0")
	}

	// 删除邀请码
	resp, body = s.request("DELETE", "/community/invocations/"+code, nil, publisherToken)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200 on delete, got %d: %s", resp.StatusCode, body)
	}
}

// TestInvocationRateLimit 限流测试
func TestInvocationRateLimit(t *testing.T) {
	s := newTestServer(t)
	publisherToken := s.registerAnon()
	agentID := publishTestAgent(t, s, publisherToken, "Test Agent", "cat")

	// 创建 daily_limit=2 的邀请码
	resp, body := s.request("POST", "/community/agents/"+agentID+"/invocations", map[string]interface{}{
		"daily_limit": 2,
	}, publisherToken)
	var r struct {
		Invocation map[string]interface{} `json:"invocation"`
	}
	json.Unmarshal(body, &r)
	code := r.Invocation["code"].(string)

	// 给 publisher 加上假 tunnel token
	s.request("PUT", "/community/auth/me", map[string]interface{}{
		"display_name": "测试",
		"avatar":       "✦",
		"bio":          "[tunnel:fake_token_for_test]",
	}, publisherToken)

	// 启动假信令服务器（返回 200）
	fakeSignaling := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"response":"hi from agent"}`))
	}))
	defer fakeSignaling.Close()
	SetSignalingServer(fakeSignaling.URL)

	// 调用 2 次（应都返回 200）
	for i := 0; i < 2; i++ {
		resp, body = s.request("POST", "/community/invocations/"+code+"/invoke", map[string]interface{}{
			"message": "test",
		}, "")
		if resp.StatusCode != 200 {
			t.Fatalf("call %d expected 200, got %d: %s", i+1, resp.StatusCode, body)
		}
	}

	// 第 3 次应被限流
	resp, body = s.request("POST", "/community/invocations/"+code+"/invoke", map[string]interface{}{
		"message": "test",
	}, "")
	if resp.StatusCode != 429 {
		t.Fatalf("expected 429 (rate limit), got %d: %s", resp.StatusCode, body)
	}
}

// TestLeaderboard 排行榜
func TestLeaderboard(t *testing.T) {
	s := newTestServer(t)
	token := s.registerAnon()
	publishTestAgent(t, s, token, "Agent A", "cat1")
	publishTestAgent(t, s, token, "Agent B", "cat2")

	resp, body := s.request("GET", "/community/leaderboard?kind=newest&limit=5", nil, "")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var r struct {
		Agents []map[string]interface{} `json:"agents"`
	}
	json.Unmarshal(body, &r)
	if len(r.Agents) != 2 {
		t.Fatalf("expected 2 agents in leaderboard, got %d", len(r.Agents))
	}
}

// TestDeleteAgent 删除 Agent（含权限校验）
func TestDeleteAgent(t *testing.T) {
	s := newTestServer(t)
	publisherToken := s.registerAnon()
	agentID := publishTestAgent(t, s, publisherToken, "Test Agent", "cat")

	// 另一个用户尝试删除
	otherToken := s.registerAnon()
	resp, body := s.request("DELETE", "/community/agents/"+agentID, nil, otherToken)
	if resp.StatusCode != 403 {
		t.Fatalf("expected 403 (not owner), got %d: %s", resp.StatusCode, body)
	}

	// 作者删除
	resp, body = s.request("DELETE", "/community/agents/"+agentID, nil, publisherToken)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}

	// 确认已删除
	resp, body = s.request("GET", "/community/agents/"+agentID, nil, "")
	if resp.StatusCode != 404 {
		t.Fatalf("expected 404 after delete, got %d: %s", resp.StatusCode, body)
	}
}

// TestAuthMiddleware 校验未登录访问受限端点
func TestAuthMiddleware(t *testing.T) {
	s := newTestServer(t)

	// 未登录访问 /auth/me
	resp, _ := s.request("GET", "/community/auth/me", nil, "")
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 without token, got %d", resp.StatusCode)
	}

	// 错误 token
	resp, _ = s.request("GET", "/community/auth/me", nil, "invalid-token")
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 with invalid token, got %d", resp.StatusCode)
	}

	// 公开端点未登录可访问
	resp, _ = s.request("GET", "/community/agents", nil, "")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200 public endpoint without token, got %d", resp.StatusCode)
	}
}

// ── 辅助函数 ─────────────────────────────────────────────────

// publishTestAgent 发布一个测试 Agent，返回 agent ID
func publishTestAgent(t *testing.T, s *testServer, token, name, category string) string {
	bundleData := makeTestBundle(t, name, "test")

	body := &bytes.Buffer{}
	// 在 description 中嵌入唯一词便于搜索测试
	uniqueWord := "unique" + strings.ReplaceAll(name, " ", "")
	contentType := multipartWriter(body, map[string]string{
		"name":        name,
		"description": "测试 Agent " + name + " " + uniqueWord,
		"avatar":      "🚀",
		"category":    category,
		"tags":        "test",
		"version":     "1.0.0",
	}, "bundle", "test.lxbundle", bundleData)

	req, _ := http.NewRequest("POST", s.baseURL+"/community/agents", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("publish agent error: %v", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("publish agent expected 200, got %d: %s", resp.StatusCode, data)
	}
	var r struct {
		Agent map[string]interface{} `json:"agent"`
	}
	json.Unmarshal(data, &r)
	return r.Agent["id"].(string)
}

// makeTestBundle 制作一个最小的 .lxbundle（实际测试中用任意字节即可，handler 不解压）
func makeTestBundle(t *testing.T, name, description string) []byte {
	manifest := map[string]interface{}{
		"format":     "lxbundle",
		"version":     "1.0",
		"agent_name": name,
		"agent_ver":  "1.0.0",
		"created_at": time.Now().Unix(),
		"skills":     []string{},
		"knowledge":  []string{},
	}
	agentJSON := map[string]interface{}{
		"name":          name,
		"avatar":        "🚀",
		"description":   description,
		"system_prompt": "You are " + name + ". " + description,
		"temperature":   0.7,
		"max_tokens":    4096,
	}
	return bytes.Join([][]byte{
		mustJSON(manifest),
		[]byte("\n---\n"),
		mustJSON(agentJSON),
		[]byte("\n---\n# " + name + "\n" + description + "\n"),
	}, nil)
}

func mustJSON(v interface{}) []byte {
	data, _ := json.MarshalIndent(v, "", "  ")
	return data
}

// multipartWriter 构造 multipart/form-data 请求体，返回 contentType
func multipartWriter(buf *bytes.Buffer, fields map[string]string, fileField, fileName string, fileData []byte) string {
	boundary := "----lingxi-test-boundary"
	for k, v := range fields {
		buf.WriteString("--" + boundary + "\r\n")
		buf.WriteString("Content-Disposition: form-data; name=\"" + k + "\"\r\n\r\n")
		buf.WriteString(v + "\r\n")
	}
	buf.WriteString("--" + boundary + "\r\n")
	buf.WriteString("Content-Disposition: form-data; name=\"" + fileField + "\"; filename=\"" + fileName + "\"\r\n")
	buf.WriteString("Content-Type: application/octet-stream\r\n\r\n")
	buf.Write(fileData)
	buf.WriteString("\r\n")
	buf.WriteString("--" + boundary + "--\r\n")
	return "multipart/form-data; boundary=" + boundary
}

// TestMain 初始化测试环境
func TestMain(m *testing.M) {
	// 关闭 slog 输出
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	// 防止 db.Init 退出
	os.Exit(m.Run())
}

// 防止 unused 警告
var _ = context.Background
var _ = sql.ErrNoRows
var _ = fmt.Sprintf
var _ = storage.BundleAbsPath
