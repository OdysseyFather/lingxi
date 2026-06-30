package main

import (
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

//go:embed static/login.html
var loginHTML []byte

// ─── 配置 ───────────────────────────────────────────────────

type Config struct {
	WebPassword  string // WEB_PASSWORD（必填）
	Port         string // 网关对外端口，默认 3000
	BackendPort  string // 内部后端端口，默认 13001
	BackendBin   string // 后端二进制路径，默认 ./smart-agent
	FrontendDist string // React 构建产物目录，默认 ./dist
	DataDir      string // 数据目录，默认 ./data
}

func loadConfig() Config {
	cfg := Config{
		WebPassword:  os.Getenv("WEB_PASSWORD"),
		Port:         envOr("PORT", "3000"),
		BackendPort:  envOr("BACKEND_PORT", "13001"),
		BackendBin:   envOr("BACKEND_BIN", "./smart-agent"),
		FrontendDist: envOr("FRONTEND_DIST", "./dist"),
		DataDir:      envOr("DATA_DIR", "./data"),
	}
	if cfg.WebPassword == "" {
		log.Fatal("[web-gateway] WEB_PASSWORD 环境变量未设置，请设置后重试")
	}
	return cfg
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── Token 管理 ─────────────────────────────────────────────

type TokenStore struct {
	mu     sync.RWMutex
	tokens map[string]time.Time // token → 创建时间
	file   string              // 持久化文件路径
}

func NewTokenStore(dataDir string) *TokenStore {
	ts := &TokenStore{
		tokens: make(map[string]time.Time),
		file:   filepath.Join(dataDir, "web_tokens.json"),
	}
	ts.load()
	return ts
}

func (ts *TokenStore) Generate() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		log.Fatal("[web-gateway] 生成 token 失败:", err)
	}
	h := sha256.Sum256(b)
	token := hex.EncodeToString(h[:])

	ts.mu.Lock()
	ts.tokens[token] = time.Now()
	ts.mu.Unlock()
	ts.save()
	return token
}

func (ts *TokenStore) Valid(token string) bool {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	_, ok := ts.tokens[token]
	return ok
}

func (ts *TokenStore) load() {
	data, err := os.ReadFile(ts.file)
	if err != nil {
		return
	}
	var m map[string]string
	if json.Unmarshal(data, &m) == nil {
		for t, ts2 := range m {
			if parsed, err := time.Parse(time.RFC3339, ts2); err == nil {
				ts.tokens[t] = parsed
			}
		}
	}
}

func (ts *TokenStore) save() {
	ts.mu.RLock()
	m := make(map[string]string, len(ts.tokens))
	for t, created := range ts.tokens {
		m[t] = created.Format(time.RFC3339)
	}
	ts.mu.RUnlock()

	data, _ := json.MarshalIndent(m, "", "  ")
	os.MkdirAll(filepath.Dir(ts.file), 0755)
	os.WriteFile(ts.file, data, 0600)
}

// ─── 反暴力破解 ─────────────────────────────────────────────

type BruteForceGuard struct {
	mu       sync.Mutex
	failures map[string][]time.Time // IP → 失败时间列表
}

func NewBruteForceGuard() *BruteForceGuard {
	return &BruteForceGuard{failures: make(map[string][]time.Time)}
}

// 检查 IP 是否被锁定（5 次失败锁定 5 分钟）
func (g *BruteForceGuard) IsLocked(ip string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now()
	window := now.Add(-5 * time.Minute)

	// 清理过期记录
	recent := make([]time.Time, 0)
	for _, t := range g.failures[ip] {
		if t.After(window) {
			recent = append(recent, t)
		}
	}
	g.failures[ip] = recent
	return len(recent) >= 5
}

func (g *BruteForceGuard) RecordFailure(ip string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.failures[ip] = append(g.failures[ip], time.Now())
}

func (g *BruteForceGuard) ClearFailures(ip string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.failures, ip)
}

// ─── 子进程管理 ─────────────────────────────────────────────

// initAIHome 初始化隔离的 AI 引擎主目录，复制配置模板
func initAIHome(aiHome, deployDir string) {
	claudeDir := filepath.Join(aiHome, ".claude")
	os.MkdirAll(claudeDir, 0755)

	configSrc := filepath.Join(deployDir, "ai-config")
	if _, err := os.Stat(configSrc); err != nil {
		return
	}

	// 复制 claude.json → aiHome/.claude.json（Claude CLI 主配置）
	src := filepath.Join(configSrc, "claude.json")
	dst := filepath.Join(aiHome, ".claude.json")
	if _, err := os.Stat(dst); err != nil {
		if data, err := os.ReadFile(src); err == nil {
			os.WriteFile(dst, data, 0644)
		}
	}

	// 复制 settings.json → aiHome/.claude/settings.json（权限配置）
	src = filepath.Join(configSrc, "settings.json")
	dst = filepath.Join(claudeDir, "settings.json")
	if _, err := os.Stat(dst); err != nil {
		if data, err := os.ReadFile(src); err == nil {
			os.WriteFile(dst, data, 0644)
		}
	}

	log.Printf("[web-gateway] AI 隔离 HOME 初始化完成: %s", aiHome)
}

func startBackend(cfg Config) *exec.Cmd {
	// 确保数据目录存在
	dbDir := cfg.DataDir
	os.MkdirAll(dbDir, 0755)
	os.MkdirAll(filepath.Join(dbDir, "uploads"), 0755)
	os.MkdirAll(filepath.Join(dbDir, "knowledge"), 0755)

	// 检测部署目录（start.sh 的 SCRIPT_DIR）
	exePath, _ := os.Executable()
	deployDir := filepath.Dir(exePath)
	if abs, err := filepath.Abs(deployDir); err == nil {
		deployDir = abs
	}

	// AI 引擎隔离 HOME（数据目录下的 ai-home/）
	aiHome := filepath.Join(dbDir, "ai-home")
	os.MkdirAll(aiHome, 0755)
	initAIHome(aiHome, deployDir)

	// 检测内嵌 Claude CLI
	claudeBin := os.Getenv("CLAUDE_BIN")
	if claudeBin == "" {
		bundled := filepath.Join(deployDir, "ai-engine", "lingxi")
		if _, err := os.Stat(bundled); err == nil {
			claudeBin = bundled
			os.Chmod(bundled, 0755)
			// cli.js 也需要可执行权限
			cliJS := filepath.Join(deployDir, "ai-engine", "cli.js")
			os.Chmod(cliJS, 0755)
		}
	}

	cmd := exec.Command(cfg.BackendBin)

	// 构建环境变量：继承当前环境 + 覆盖关键配置
	env := os.Environ()

	// 替换或追加环境变量的辅助函数
	setEnv := func(key, val string) {
		prefix := key + "="
		for i, e := range env {
			if strings.HasPrefix(e, prefix) {
				env[i] = key + "=" + val
				return
			}
		}
		env = append(env, key+"="+val)
	}

	setEnv("PORT", cfg.BackendPort)
	setEnv("DB_PATH", filepath.Join(dbDir, "smart-agent.db"))
	setEnv("UPLOADS_PATH", filepath.Join(dbDir, "uploads"))
	setEnv("KNOWLEDGE_PATH", filepath.Join(dbDir, "knowledge"))
	setEnv("KB_PATH", filepath.Join(dbDir, "knowledge"))
	setEnv("FRONTEND_DIST", "__none__") // 不让后端服务前端，由网关处理

	// 关键：设置 HOME 为隔离目录，Claude CLI 读取 $HOME/.claude/ 配置
	setEnv("HOME", aiHome)

	// 设置 CLAUDE_BIN 让后端使用内嵌 CLI
	if claudeBin != "" {
		setEnv("CLAUDE_BIN", claudeBin)
		log.Printf("[web-gateway] Claude CLI: %s", claudeBin)
	} else {
		log.Printf("[web-gateway] 警告: 未找到 Claude CLI")
	}

	log.Printf("[web-gateway] AI 隔离 HOME: %s", aiHome)

	cmd.Env = env
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		log.Fatalf("[web-gateway] 启动后端失败: %v", err)
	}
	log.Printf("[web-gateway] 后端已启动 (PID %d, port %s)", cmd.Process.Pid, cfg.BackendPort)
	return cmd
}

// 等待后端就绪（健康检查）
func waitForBackend(port string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://127.0.0.1:%s/api/health", port)

	for time.Now().Before(deadline) {
		resp, err := http.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				log.Printf("[web-gateway] 后端就绪")
				return nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("后端在 %v 内未就绪", timeout)
}

// ─── HTTP 处理 ───────────────────────────────────────────────

func main() {
	cfg := loadConfig()
	tokens := NewTokenStore(cfg.DataDir)
	guard := NewBruteForceGuard()

	// 启动后端子进程
	backendCmd := startBackend(cfg)
	defer func() {
		if backendCmd.Process != nil {
			log.Printf("[web-gateway] 正在关闭后端 (PID %d)...", backendCmd.Process.Pid)
			backendCmd.Process.Signal(syscall.SIGTERM)
			backendCmd.Wait()
		}
	}()

	// 等待后端就绪
	if err := waitForBackend(cfg.BackendPort, 30*time.Second); err != nil {
		log.Fatalf("[web-gateway] %v", err)
	}

	// 创建反向代理
	backendURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%s", cfg.BackendPort))
	proxy := httputil.NewSingleHostReverseProxy(backendURL)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[proxy] 错误: %s %s → %v", r.Method, r.URL.Path, err)
		http.Error(w, "后端服务不可用", http.StatusBadGateway)
	}

	mux := http.NewServeMux()

	// ── 登录端点 ──
	mux.HandleFunc("/web/login", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", 405)
			return
		}

		ip := clientIP(r)
		if guard.IsLocked(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(429)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "登录失败次数过多，请 5 分钟后重试",
			})
			return
		}

		var body struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "无效的请求", 400)
			return
		}

		if body.Password != cfg.WebPassword {
			guard.RecordFailure(ip)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(401)
			json.NewEncoder(w).Encode(map[string]string{"error": "密码错误"})
			return
		}

		guard.ClearFailures(ip)
		token := tokens.Generate()

		http.SetCookie(w, &http.Cookie{
			Name:     "web_token",
			Value:    token,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   86400 * 30, // 30 天
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"token": token})
	})

	// ── 登录页面（embed 嵌入，保证任何环境都能找到） ──
	mux.HandleFunc("/web/login.html", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w, r)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(loginHTML)
	})

	// ── WebSocket 代理 ──
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		// WS 通过 query 参数认证
		token := r.URL.Query().Get("web_token")
		if token == "" {
			if c, err := r.Cookie("web_token"); err == nil {
				token = c.Value
			}
		}
		if !tokens.Valid(token) {
			http.Error(w, "未授权", 401)
			return
		}
		proxy.ServeHTTP(w, r)
	})

	// ── API 代理 ──
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		if !checkAuth(r, tokens) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(401)
			json.NewEncoder(w).Encode(map[string]string{"error": "未授权，请先登录"})
			return
		}
		proxy.ServeHTTP(w, r)
	})

	// ── 静态文件 + SPA fallback ──
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}

		// favicon 和静态资源不需要认证
		path := r.URL.Path
		if path == "/favicon.ico" || strings.HasPrefix(path, "/assets/") {
			serveStatic(w, r, cfg.FrontendDist)
			return
		}

		// 其他页面需要认证
		if !checkAuth(r, tokens) {
			http.Redirect(w, r, "/web/login.html", http.StatusFound)
			return
		}

		serveStatic(w, r, cfg.FrontendDist)
	})

	// ── 启动服务器 ──
	addr := "0.0.0.0:" + cfg.Port
	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
	}

	go func() {
		log.Printf("[web-gateway] 灵犀 Web 版启动成功")
		log.Printf("[web-gateway] 访问地址: http://%s", addr)
		log.Printf("[web-gateway] 使用 WEB_PASSWORD 环境变量中的密码登录")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[web-gateway] 监听失败: %v", err)
		}
	}()

	// 优雅关闭
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[web-gateway] 正在关闭...")

	srv.Close()
	log.Println("[web-gateway] 已关闭")
}

// ─── 工具函数 ────────────────────────────────────────────────

func checkAuth(r *http.Request, tokens *TokenStore) bool {
	// 1. Header: X-Web-Token
	if t := r.Header.Get("X-Web-Token"); t != "" && tokens.Valid(t) {
		return true
	}
	// 2. Cookie: web_token
	if c, err := r.Cookie("web_token"); err == nil && tokens.Valid(c.Value) {
		return true
	}
	// 3. Query: web_token
	if t := r.URL.Query().Get("web_token"); t != "" && tokens.Valid(t) {
		return true
	}
	return false
}

func setCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Web-Token, X-Pair-Token")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Max-Age", "86400")
}

func serveStatic(w http.ResponseWriter, r *http.Request, distDir string) {
	path := r.URL.Path
	if path == "/" {
		path = "/index.html"
	}

	filePath := filepath.Join(distDir, filepath.Clean(path))

	// 防止目录遍历
	absDistDir, _ := filepath.Abs(distDir)
	absFile, _ := filepath.Abs(filePath)
	if !strings.HasPrefix(absFile, absDistDir) {
		http.Error(w, "Forbidden", 403)
		return
	}

	if _, err := os.Stat(filePath); err == nil {
		http.ServeFile(w, r, filePath)
		return
	}

	// SPA fallback: 找不到的路径返回 index.html
	indexPath := filepath.Join(distDir, "index.html")
	if _, err := os.Stat(indexPath); err == nil {
		http.ServeFile(w, r, indexPath)
	} else {
		http.Error(w, "前端资源未找到，请确认 FRONTEND_DIST 路径正确", 404)
	}
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
