// Package router 负责把 OpenAI 协议的供应商通过本地 bridge-server (基于 supermemoryai/llm-bridge)
// 暴露成 Anthropic 协议本地端点，给底层 Claude CLI 使用。
//
// 工作流程：
//
//	UI → 激活 protocol=openai 的 profile
//	   → Go spawn `bridge` 包装脚本（监听本地 BRIDGE_PORT）
//	   → Go POST /__config 把 base_url/model/token 推给 bridge
//	   → buildClaudeEnv 把 ANTHROPIC_BASE_URL 指向 127.0.0.1:<port>
//	   → claude-code CLI 发 Anthropic /v1/messages → bridge 翻译成 OpenAI → 上游
//
// 当激活的是 protocol=anthropic 时，bridge 会被 Stop()，恢复直连 Anthropic 上游。
//
// 历史命名说明：包文件名沿用 ccr.go，公开类型名（Profile/Status）和函数名
// （EnsureRunning/Stop/GetStatus）保持不变，方便 handler 包零改动。
package router

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ─── 配置：bridge 二进制位置 / 数据目录 ──────────────────────────

// BridgeBinEnv 由 Electron 主进程注入：指向打包内置的 bridge 包装脚本路径
const BridgeBinEnv = "BRIDGE_BIN"

// BridgeHomeEnv 由 Electron 注入：bridge 工作目录（日志等可写位置）
const BridgeHomeEnv = "BRIDGE_HOME"

// resolveBin 返回 bridge 可执行（包装脚本）路径
func resolveBin() string {
	if v := os.Getenv(BridgeBinEnv); v != "" {
		return v
	}
	// dev fallback：仓库内 electron/resources/bridge/bridge
	if cwd, err := os.Getwd(); err == nil {
		guess := filepath.Join(cwd, "..", "electron", "resources", "bridge", "bridge")
		if st, err := os.Stat(guess); err == nil && !st.IsDir() {
			return guess
		}
	}
	if p, err := exec.LookPath("lingxi-bridge"); err == nil {
		return p
	}
	return "bridge"
}

// resolveHome 返回 bridge 工作目录
func resolveHome() string {
	if v := os.Getenv(BridgeHomeEnv); v != "" {
		return v
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".lingxi-bridge")
}

// ─── 路由档案描述（来自 db.APIProfile + 明文 token）─────────────

// Profile 描述一个待路由的 OpenAI 协议档案
type Profile struct {
	ID          int64  // 档案 ID
	Name        string // 档案名（仅日志）
	BaseURL     string // OpenAI 协议端点（含 /chat/completions）
	Model       string // 模型名
	Token       string // 明文 API key
	Transformer string // 保留字段（llm-bridge 暂不使用，留作未来 per-provider 偏差修正）
}

// ─── 单例：bridge 进程管理 ──────────────────────────────────────

type manager struct {
	mu        sync.Mutex
	cmd       *exec.Cmd
	cancel    context.CancelFunc
	port      int
	profileID int64 // 当前 bridge 服务的 profile ID
	startedAt time.Time
	lastErr   string
	logTail   []string // 最近若干行 stdout/stderr
}

var mgr = &manager{}

// EnsureRunning 保证 bridge 已为指定 profile 启动并健康，返回本地 baseURL。
//
// 同一 profile 复用现有进程；切换 profile 时仅 pushConfig，不重启进程。
func EnsureRunning(p Profile) (string, error) {
	if p.Token == "" {
		return "", errors.New("bridge 路由需要 profile 明文 token，但未由 Electron 下发")
	}
	if p.BaseURL == "" {
		return "", errors.New("OpenAI 档案的 base_url 不能为空")
	}
	if p.Model == "" {
		return "", errors.New("OpenAI 档案的 model 不能为空")
	}

	mgr.mu.Lock()
	defer mgr.mu.Unlock()

	// 复用：进程仍在 + 健康
	if mgr.cmd != nil && mgr.cmd.Process != nil && mgr.port > 0 && isAlive(mgr.cmd) && pingHealth(mgr.port, 200*time.Millisecond) {
		if mgr.profileID != p.ID {
			// 同进程切 profile：仅推新 config，不重启
			if err := pushConfig(mgr.port, p); err != nil {
				return "", fmt.Errorf("push config to running bridge: %w", err)
			}
			log.Printf("[router] reused bridge pid=%d port=%d, switched profile %d → %d", mgr.cmd.Process.Pid, mgr.port, mgr.profileID, p.ID)
			mgr.profileID = p.ID
		}
		return fmt.Sprintf("http://127.0.0.1:%d", mgr.port), nil
	}

	// 进程死了 / 不健康：清理后重启
	if mgr.cmd != nil {
		log.Printf("[router] previous bridge unhealthy, restarting")
		stopLocked()
	}

	port, err := pickFreePort()
	if err != nil {
		return "", fmt.Errorf("pick free port: %w", err)
	}

	if err := startLocked(p, port); err != nil {
		return "", err
	}

	if err := waitHealthy(port, 8*time.Second); err != nil {
		stopLocked()
		return "", fmt.Errorf("bridge start timeout: %w", err)
	}

	if err := pushConfig(port, p); err != nil {
		stopLocked()
		return "", fmt.Errorf("push config to bridge: %w", err)
	}

	return fmt.Sprintf("http://127.0.0.1:%d", port), nil
}

// Stop 关闭 bridge 进程（用户切回 anthropic 协议时调用）
func Stop() {
	mgr.mu.Lock()
	defer mgr.mu.Unlock()
	stopLocked()
}

// Status 返回 bridge 当前状态供前端展示
type Status struct {
	Running   bool     `json:"running"`
	Port      int      `json:"port,omitempty"`
	ProfileID int64    `json:"profile_id,omitempty"`
	StartedAt string   `json:"started_at,omitempty"`
	LastErr   string   `json:"last_err,omitempty"`
	LogTail   []string `json:"log_tail,omitempty"`
	Bin       string   `json:"bin"`
	Home      string   `json:"home"`
}

func GetStatus() Status {
	mgr.mu.Lock()
	defer mgr.mu.Unlock()
	s := Status{Bin: resolveBin(), Home: resolveHome(), LastErr: mgr.lastErr}
	if mgr.cmd != nil && mgr.cmd.Process != nil && isAlive(mgr.cmd) {
		s.Running = true
		s.Port = mgr.port
		s.ProfileID = mgr.profileID
		s.StartedAt = mgr.startedAt.Format(time.RFC3339)
	}
	if len(mgr.logTail) > 0 {
		s.LogTail = append([]string(nil), mgr.logTail...)
	}
	return s
}

// ─── 内部：启动 / 停止 / 健康检查 / pushConfig ──────────────────

func startLocked(p Profile, port int) error {
	ctx, cancel := context.WithCancel(context.Background())
	bin := resolveBin()
	home := resolveHome()
	if err := os.MkdirAll(home, 0o755); err != nil {
		cancel()
		return err
	}

	cmd := exec.CommandContext(ctx, bin)
	env := os.Environ()
	env = upsertEnv(env, "HOME", home)
	env = upsertEnv(env, "BRIDGE_HOST", "127.0.0.1")
	env = upsertEnv(env, "BRIDGE_PORT", fmt.Sprintf("%d", port))
	cmd.Env = env

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		cancel()
		mgr.lastErr = err.Error()
		return fmt.Errorf("start bridge: %w", err)
	}
	mgr.cmd = cmd
	mgr.cancel = cancel
	mgr.port = port
	mgr.profileID = p.ID
	mgr.startedAt = time.Now()
	mgr.lastErr = ""
	log.Printf("[router] bridge started pid=%d port=%d profile=%d (%s)", cmd.Process.Pid, port, p.ID, p.Name)

	go pumpLog("bridge/out", stdout)
	go pumpLog("bridge/err", stderr)
	go func() {
		_ = cmd.Wait()
		mgr.mu.Lock()
		defer mgr.mu.Unlock()
		if mgr.cmd == cmd {
			log.Printf("[router] bridge exited unexpectedly")
			mgr.cmd = nil
			mgr.cancel = nil
			mgr.port = 0
			mgr.profileID = 0
			mgr.lastErr = "bridge exited"
		}
	}()
	return nil
}

func stopLocked() {
	if mgr.cancel != nil {
		mgr.cancel()
	}
	if mgr.cmd != nil && mgr.cmd.Process != nil {
		_ = mgr.cmd.Process.Signal(os.Interrupt)
		done := make(chan struct{})
		go func() { _ = mgr.cmd.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			_ = mgr.cmd.Process.Kill()
		}
	}
	mgr.cmd = nil
	mgr.cancel = nil
	mgr.port = 0
	mgr.profileID = 0
}

func pumpLog(tag string, r io.ReadCloser) {
	defer r.Close()
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			line := strings.TrimRight(string(buf[:n]), "\n")
			log.Printf("[%s] %s", tag, line)
			mgr.mu.Lock()
			mgr.logTail = append(mgr.logTail, line)
			if len(mgr.logTail) > 50 {
				mgr.logTail = mgr.logTail[len(mgr.logTail)-50:]
			}
			mgr.mu.Unlock()
		}
		if err != nil {
			return
		}
	}
}

func isAlive(cmd *exec.Cmd) bool {
	if cmd == nil || cmd.Process == nil {
		return false
	}
	// Signal(0) 在 unix 下用于探测进程是否存活而不发送实际信号
	return cmd.Process.Signal(zeroSignal) == nil
}

func waitHealthy(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if pingHealth(port, 300*time.Millisecond) {
			return nil
		}
		time.Sleep(150 * time.Millisecond)
	}
	return fmt.Errorf("bridge did not become healthy on :%d within %v", port, timeout)
}

func pingHealth(port int, timeout time.Duration) bool {
	cli := &http.Client{Timeout: timeout}
	req, _ := http.NewRequest("GET", fmt.Sprintf("http://127.0.0.1:%d/__health", port), nil)
	resp, err := cli.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return resp.StatusCode < 500
}

// pushConfig 把当前 active profile 通过 HTTP POST /__config 推给运行中的 bridge
func pushConfig(port int, p Profile) error {
	payload := map[string]interface{}{
		"profile_id":  p.ID,
		"name":        p.Name,
		"base_url":    p.BaseURL,
		"model":       p.Model,
		"token":       p.Token,
		"transformer": p.Transformer,
	}
	body, _ := json.Marshal(payload)
	cli := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/__config", port), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		buf, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("bridge /__config returned %d: %s", resp.StatusCode, string(buf))
	}
	io.Copy(io.Discard, resp.Body)
	return nil
}

func pickFreePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func upsertEnv(env []string, key, val string) []string {
	prefix := key + "="
	for i, kv := range env {
		if strings.HasPrefix(kv, prefix) {
			env[i] = prefix + val
			return env
		}
	}
	return append(env, prefix+val)
}
