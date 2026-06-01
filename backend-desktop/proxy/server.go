package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Provider 标识上游供应商类型，决定请求/响应转换策略
type Provider string

const (
	ProviderGeneric    Provider = "generic"    // 标准 OpenAI 兼容
	ProviderDeepSeek   Provider = "deepseek"   // reasoning_content 字段
	ProviderOpenRouter Provider = "openrouter" // reasoning + reasoning_details + include_reasoning
	ProviderGemini     Provider = "gemini"     // reasoning_effort 映射、temperature 限制
	ProviderOllama     Provider = "ollama"     // 本地 Ollama
)

// Config 描述代理运行所需的上游配置
type Config struct {
	UpstreamBaseURL string   // 上游 OpenAI 兼容 API base URL
	Model           string   // 默认模型名
	Token           string   // API Key
	Provider        Provider // 上游供应商类型（影响请求/响应转换策略）
}

// Server 是纯 Go 的 Anthropic→OpenAI 协议转换代理
type Server struct {
	mu       sync.Mutex
	listener net.Listener
	srv      *http.Server
	config   Config
	port     int
}

// NewServer 创建代理服务器实例
func NewServer() *Server {
	return &Server{}
}

// Start 启动代理并返回监听端口
func (s *Server) Start(cfg Config) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 如果已有且配置相同，复用
	if s.listener != nil && s.config == cfg {
		return s.port, nil
	}

	// 配置变了或未启动，先关旧的
	s.stopLocked()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("listen: %w", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/messages", s.handleMessages)
	mux.HandleFunc("GET /v1/messages", s.handleMessages)
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /health/liveliness", s.handleHealth)
	mux.HandleFunc("GET /v1/models", s.handleModels)
	mux.HandleFunc("GET /", s.handleInfo)

	srv := &http.Server{Handler: mux}

	s.listener = ln
	s.srv = srv
	s.config = cfg
	s.port = port

	go func() {
		slog.Info("go-proxy started", "port", port, "model", cfg.Model, "upstream", cfg.UpstreamBaseURL)
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			slog.Error("go-proxy serve error", "err", err)
		}
	}()

	return port, nil
}

// Stop 关闭代理
func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stopLocked()
}

func (s *Server) stopLocked() {
	if s.srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.srv.Shutdown(ctx)
		s.srv = nil
	}
	if s.listener != nil {
		_ = s.listener.Close()
		s.listener = nil
	}
	s.port = 0
}

// Port 返回当前监听端口（0=未启动）
func (s *Server) Port() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.port
}

// Running 返回是否正在运行
func (s *Server) Running() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listener != nil && s.port > 0
}

// ── HTTP Handlers ───────────────────────────────────────────────

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"name":     "lingxi-go-proxy",
		"version":  "1.0.0",
		"model":    s.config.Model,
		"upstream": s.config.UpstreamBaseURL,
	})
}

func (s *Server) handleModels(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"object": "list",
		"data": []map[string]interface{}{
			{
				"id":       s.config.Model,
				"object":   "model",
				"owned_by": "proxy",
			},
		},
	})
}

func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		s.handleInfo(w, r)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		httpError(w, http.StatusBadRequest, "read body: "+err.Error())
		return
	}
	defer r.Body.Close()

	var antReq AnthropicRequest
	if err := json.Unmarshal(body, &antReq); err != nil {
		httpError(w, http.StatusBadRequest, "parse request: "+err.Error())
		return
	}

	// 强制使用配置模型：子代理可能请求其他模型名（如 claude-sonnet），
	// 但 OpenAI 上游只支持配置的模型，必须覆盖
	if antReq.Model != s.config.Model && antReq.Model != "" {
		slog.Info("proxy model override", "requested", antReq.Model, "using", s.config.Model)
	}
	antReq.Model = s.config.Model

	oaiReq, err := TransformRequest(&antReq, s.config.Provider)
	if err != nil {
		httpError(w, http.StatusBadRequest, "transform request: "+err.Error())
		return
	}

	oaiBody, _ := json.Marshal(oaiReq)

	upstreamURL := strings.TrimRight(s.config.UpstreamBaseURL, "/") + "/chat/completions"

	// Gemini 使用 ?key= 查询参数而非 Bearer token
	if s.config.Provider == ProviderGemini && s.config.Token != "" {
		if strings.Contains(upstreamURL, "?") {
			upstreamURL += "&key=" + s.config.Token
		} else {
			upstreamURL += "?key=" + s.config.Token
		}
	}

	upReq, err := http.NewRequestWithContext(r.Context(), "POST", upstreamURL, bytes.NewReader(oaiBody))
	if err != nil {
		httpError(w, http.StatusInternalServerError, "create upstream request: "+err.Error())
		return
	}
	upReq.Header.Set("Content-Type", "application/json")
	if s.config.Token != "" && s.config.Provider != ProviderGemini {
		upReq.Header.Set("Authorization", "Bearer "+s.config.Token)
	}
	// OpenRouter 需要 HTTP-Referer 和 X-Title
	if s.config.Provider == ProviderOpenRouter {
		upReq.Header.Set("HTTP-Referer", "https://lingxi.ai")
		upReq.Header.Set("X-Title", "Lingxi AI Agent")
	}
	if xModel := r.Header.Get("X-Model"); xModel != "" {
		upReq.Header.Set("X-Model", xModel)
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	upResp, err := client.Do(upReq)
	if err != nil {
		httpError(w, http.StatusBadGateway, "upstream request failed: "+err.Error())
		return
	}
	defer upResp.Body.Close()

	if upResp.StatusCode >= 400 {
		errBody, _ := io.ReadAll(upResp.Body)
		slog.Error("upstream error", "status", upResp.StatusCode, "body", string(errBody))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(upResp.StatusCode)
		// 包装为 Anthropic 错误格式
		json.NewEncoder(w).Encode(map[string]interface{}{
			"type": "error",
			"error": map[string]interface{}{
				"type":    "api_error",
				"message": fmt.Sprintf("upstream %d: %s", upResp.StatusCode, string(errBody)),
			},
		})
		return
	}

	if antReq.Stream {
		s.handleStreamResponse(w, upResp, antReq.Model)
	} else {
		s.handleNonStreamResponse(w, upResp, antReq.Model)
	}
}

func (s *Server) handleStreamResponse(w http.ResponseWriter, upResp *http.Response, model string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		httpError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	flushWriter := &flushingWriter{w: w, f: flusher}

	if err := StreamTransform(model, upResp.Body, flushWriter, s.config.Provider); err != nil {
		slog.Error("stream transform error", "err", err)
	}
}

func (s *Server) handleNonStreamResponse(w http.ResponseWriter, upResp *http.Response, model string) {
	body, err := io.ReadAll(upResp.Body)
	if err != nil {
		httpError(w, http.StatusBadGateway, "read upstream response: "+err.Error())
		return
	}

	antBody, err := TransformNonStreamResponse(body, model)
	if err != nil {
		slog.Error("non-stream transform error", "err", err, "body", string(body))
		httpError(w, http.StatusBadGateway, "transform response: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(antBody)
}

// ── 辅助 ────────────────────────────────────────────────────────

type flushingWriter struct {
	w io.Writer
	f http.Flusher
}

func (fw *flushingWriter) Write(p []byte) (int, error) {
	n, err := fw.w.Write(p)
	fw.f.Flush()
	return n, err
}

func httpError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"type": "error",
		"error": map[string]interface{}{
			"type":    "api_error",
			"message": msg,
		},
	})
}
