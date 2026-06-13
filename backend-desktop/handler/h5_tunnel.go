package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// H5 云端隧道客户端：连接信令服务器，注册隧道 token，
// 将远端 HTTP 请求转发到本地后端并返回响应。

var tunnelClient = &H5TunnelClient{}

type H5TunnelClient struct {
	mu        sync.RWMutex
	conn      *websocket.Conn
	token     string
	serverURL string
	localPort string
	connected bool
	stopCh    chan struct{}
}

type tunnelSignalMsg struct {
	Type string          `json:"type"`
	From string          `json:"from,omitempty"`
	To   string          `json:"to,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

type tunnelReqPayload struct {
	RequestID string            `json:"request_id"`
	Method    string            `json:"method"`
	Path      string            `json:"path"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body,omitempty"`
}

type tunnelRespPayload struct {
	RequestID  string            `json:"request_id"`
	StatusCode int               `json:"status_code"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body,omitempty"`
}

// StartH5Tunnel 启动 H5 云端隧道
func StartH5Tunnel(signalingWSURL, token, localPort string) error {
	tunnelClient.mu.Lock()
	defer tunnelClient.mu.Unlock()

	if tunnelClient.connected {
		return fmt.Errorf("tunnel already connected")
	}

	tunnelClient.token = token
	tunnelClient.serverURL = signalingWSURL
	tunnelClient.localPort = localPort
	tunnelClient.stopCh = make(chan struct{})

	go tunnelClient.connectLoop()
	return nil
}

// StopH5Tunnel 停止隧道
func StopH5Tunnel() {
	tunnelClient.mu.Lock()
	defer tunnelClient.mu.Unlock()

	if tunnelClient.stopCh != nil {
		select {
		case <-tunnelClient.stopCh:
		default:
			close(tunnelClient.stopCh)
		}
	}
	if tunnelClient.conn != nil {
		tunnelClient.conn.Close()
		tunnelClient.conn = nil
	}
	tunnelClient.connected = false
}

// GetH5TunnelStatus 获取隧道状态（合并内存状态和持久化配置）
func GetH5TunnelStatus() map[string]interface{} {
	tunnelClient.mu.RLock()
	connected := tunnelClient.connected
	token := tunnelClient.token
	serverURL := tunnelClient.serverURL
	tunnelClient.mu.RUnlock()

	// 如果内存中没有配置，从数据库加载
	if token == "" || serverURL == "" {
		savedURL, savedToken, savedEnabled := loadTunnelConfig()
		if savedEnabled {
			if token == "" {
				token = savedToken
			}
			if serverURL == "" {
				serverURL = savedURL
			}
		}
	}

	return map[string]interface{}{
		"connected":  connected,
		"token":      token,
		"server_url": serverURL,
	}
}

func (tc *H5TunnelClient) connectLoop() {
	for {
		select {
		case <-tc.stopCh:
			return
		default:
		}

		err := tc.connect()
		if err != nil {
			slog.Warn("[h5-tunnel] connection failed, retrying in 5s", "err", err)
		}

		select {
		case <-tc.stopCh:
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func (tc *H5TunnelClient) connect() error {
	tc.mu.RLock()
	serverURL := tc.serverURL
	token := tc.token
	tc.mu.RUnlock()

	slog.Info("[h5-tunnel] connecting to signaling server", "url", serverURL)

	conn, _, err := websocket.DefaultDialer.Dial(serverURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}

	tc.mu.Lock()
	tc.conn = conn
	tc.connected = true
	tc.mu.Unlock()

	// 先注册为 peer（信令服务器需要 peer 才能处理 tunnel_register）
	instanceID := "tunnel_" + token
	peerRegData, _ := json.Marshal(map[string]interface{}{
		"instance_id": instanceID,
		"nickname":    "灵犀桌面端(隧道)",
		"platform":    "desktop",
		"device_name": "lingxi-tunnel",
	})
	conn.WriteJSON(tunnelSignalMsg{
		Type: "register",
		Data: json.RawMessage(peerRegData),
	})

	// 注册隧道 token
	regData, _ := json.Marshal(map[string]string{"token": token})
	conn.WriteJSON(tunnelSignalMsg{
		Type: "tunnel_register",
		Data: json.RawMessage(regData),
	})

	// 心跳
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-tc.stopCh:
				return
			case <-ticker.C:
				tc.mu.RLock()
				c := tc.conn
				tc.mu.RUnlock()
				if c != nil {
					c.WriteJSON(tunnelSignalMsg{Type: "heartbeat"})
				}
			}
		}
	}()

	// 读取循环
	defer func() {
		tc.mu.Lock()
		tc.connected = false
		tc.conn = nil
		tc.mu.Unlock()
		conn.Close()
	}()

	BroadcastWSEvent("h5_tunnel_status", `{"connected":true}`)

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			slog.Warn("[h5-tunnel] read error", "err", err)
			BroadcastWSEvent("h5_tunnel_status", `{"connected":false}`)
			return err
		}

		var msg tunnelSignalMsg
		if json.Unmarshal(msgBytes, &msg) != nil {
			continue
		}

		switch msg.Type {
		case "tunnel_registered":
			slog.Info("[h5-tunnel] tunnel registered successfully")
		case "tunnel_request":
			go tc.handleRequest(msg.Data)
		case "tunnel_ws_open":
			go tc.handleWsOpen(msg.Data)
		case "tunnel_ws_message":
			go tc.handleWsMessage(msg.Data)
		case "tunnel_ws_close":
			tc.handleWsClose(msg.Data)
		case "heartbeat_ack":
			// ignore
		}
	}
}

func (tc *H5TunnelClient) handleRequest(data json.RawMessage) {
	var req tunnelReqPayload
	if json.Unmarshal(data, &req) != nil {
		return
	}

	tc.mu.RLock()
	localPort := tc.localPort
	tc.mu.RUnlock()

	// 构建本地 HTTP 请求
	localURL := fmt.Sprintf("http://127.0.0.1:%s%s", localPort, req.Path)

	var body io.Reader
	if req.Body != "" {
		bodyBytes, err := base64.StdEncoding.DecodeString(req.Body)
		if err == nil {
			body = bytes.NewReader(bodyBytes)
		}
	}

	httpReq, err := http.NewRequest(req.Method, localURL, body)
	if err != nil {
		tc.sendResponse(req.RequestID, 502, nil, []byte("failed to create request"))
		return
	}

	for k, v := range req.Headers {
		lk := strings.ToLower(k)
		if lk == "host" || lk == "connection" || lk == "upgrade" {
			continue
		}
		httpReq.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		tc.sendResponse(req.RequestID, 502, nil, []byte("local request failed: "+err.Error()))
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20))

	respHeaders := make(map[string]string)
	for k, vs := range resp.Header {
		if len(vs) > 0 {
			respHeaders[k] = vs[0]
		}
	}
	// 移除可能导致问题的头
	delete(respHeaders, "Transfer-Encoding")

	tc.sendResponse(req.RequestID, resp.StatusCode, respHeaders, respBody)
}

func (tc *H5TunnelClient) sendResponse(reqID string, status int, headers map[string]string, body []byte) {
	resp := tunnelRespPayload{
		RequestID:  reqID,
		StatusCode: status,
		Headers:    headers,
	}
	if len(body) > 0 {
		resp.Body = base64.StdEncoding.EncodeToString(body)
	}

	respData, _ := json.Marshal(resp)
	msg := tunnelSignalMsg{
		Type: "tunnel_response",
		Data: json.RawMessage(respData),
	}

	tc.mu.RLock()
	conn := tc.conn
	tc.mu.RUnlock()

	if conn != nil {
		conn.WriteJSON(msg)
	}
}

// ─── WebSocket 隧道桥接 ──────────────────────────────────────────

// localWsConns 管理本地的 WS 连接（wsID → *websocket.Conn）
var localWsConns sync.Map

func (tc *H5TunnelClient) handleWsOpen(data json.RawMessage) {
	var payload struct {
		WsID string `json:"ws_id"`
		Path string `json:"path"`
	}
	if json.Unmarshal(data, &payload) != nil || payload.WsID == "" {
		return
	}

	tc.mu.RLock()
	localPort := tc.localPort
	tc.mu.RUnlock()

	wsURL := fmt.Sprintf("ws://127.0.0.1:%s%s", localPort, payload.Path)
	slog.Info("[h5-tunnel] opening local WS", "wsID", payload.WsID, "url", wsURL)

	localConn, _, err := websocket.DefaultDialer.Dial(wsURL, http.Header{
		"Origin": []string{"http://127.0.0.1:" + localPort},
	})
	if err != nil {
		slog.Warn("[h5-tunnel] local WS dial failed", "wsID", payload.WsID, "err", err)
		tc.sendWsClose(payload.WsID)
		return
	}

	localWsConns.Store(payload.WsID, localConn)

	// 读取本地 WS 消息转发回信令服务器
	go func() {
		defer func() {
			localConn.Close()
			localWsConns.Delete(payload.WsID)
			tc.sendWsClose(payload.WsID)
		}()
		for {
			_, msgBytes, err := localConn.ReadMessage()
			if err != nil {
				return
			}
			tc.sendWsMessage(payload.WsID, msgBytes)
		}
	}()
}

func (tc *H5TunnelClient) handleWsMessage(data json.RawMessage) {
	var payload struct {
		WsID    string `json:"ws_id"`
		Message string `json:"message"` // base64
	}
	if json.Unmarshal(data, &payload) != nil || payload.WsID == "" {
		return
	}

	v, ok := localWsConns.Load(payload.WsID)
	if !ok {
		return
	}
	localConn := v.(*websocket.Conn)

	msgBytes, err := base64.StdEncoding.DecodeString(payload.Message)
	if err != nil {
		return
	}
	localConn.WriteMessage(websocket.TextMessage, msgBytes)
}

func (tc *H5TunnelClient) handleWsClose(data json.RawMessage) {
	var payload struct {
		WsID string `json:"ws_id"`
	}
	if json.Unmarshal(data, &payload) != nil || payload.WsID == "" {
		return
	}
	if v, ok := localWsConns.LoadAndDelete(payload.WsID); ok {
		v.(*websocket.Conn).Close()
	}
}

func (tc *H5TunnelClient) sendWsMessage(wsID string, msg []byte) {
	fwdData, _ := json.Marshal(map[string]string{
		"ws_id":   wsID,
		"message": base64.StdEncoding.EncodeToString(msg),
	})
	tc.mu.RLock()
	conn := tc.conn
	tc.mu.RUnlock()
	if conn != nil {
		conn.WriteJSON(tunnelSignalMsg{
			Type: "tunnel_ws_message",
			Data: json.RawMessage(fwdData),
		})
	}
}

func (tc *H5TunnelClient) sendWsClose(wsID string) {
	closeData, _ := json.Marshal(map[string]string{"ws_id": wsID})
	tc.mu.RLock()
	conn := tc.conn
	tc.mu.RUnlock()
	if conn != nil {
		conn.WriteJSON(tunnelSignalMsg{
			Type: "tunnel_ws_close",
			Data: json.RawMessage(closeData),
		})
	}
}

// ─── 持久化 ─────────────────────────────────────────────────────

func saveTunnelConfig(serverURL, token string) {
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('h5_tunnel_server', ?)`, serverURL)
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('h5_tunnel_token', ?)`, token)
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('h5_tunnel_enabled', '1')`)
}

func clearTunnelConfig() {
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('h5_tunnel_enabled', '0')`)
}

func loadTunnelConfig() (serverURL, token string, enabled bool) {
	var enabledStr string
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='h5_tunnel_server'`).Scan(&serverURL)
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='h5_tunnel_token'`).Scan(&token)
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='h5_tunnel_enabled'`).Scan(&enabledStr)
	enabled = enabledStr == "1"
	return
}

// AutoStartH5Tunnel 应用启动时自动恢复隧道连接
func AutoStartH5Tunnel(localPort string) {
	serverURL, token, enabled := loadTunnelConfig()
	if !enabled || serverURL == "" || token == "" {
		return
	}
	slog.Info("[h5-tunnel] auto-starting tunnel from saved config", "server", serverURL, "token", token[:8]+"...")
	go func() {
		time.Sleep(2 * time.Second)
		if err := StartH5Tunnel(serverURL, token, localPort); err != nil {
			slog.Warn("[h5-tunnel] auto-start failed", "err", err)
		}
	}()
}

// ─── HTTP API ────────────────────────────────────────────────────

// EnableH5TunnelHandler 开启/关闭 H5 云端隧道
func EnableH5TunnelHandler(c *gin.Context) {
	var body struct {
		Enabled    bool   `json:"enabled"`
		Token      string `json:"token"`
		SignalingWS string `json:"signaling_ws"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if body.Enabled {
		if body.Token == "" {
			c.JSON(400, gin.H{"error": "token required"})
			return
		}
		sigWS := body.SignalingWS
		if sigWS == "" {
			sigWS = "wss://lingxi-singaling-server.onrender.com/ws"
		}
		port := c.GetString("server_port")
		if port == "" {
			port = "3001"
		}
		StopH5Tunnel()
		if err := StartH5Tunnel(sigWS, body.Token, port); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		saveTunnelConfig(sigWS, body.Token)
		c.JSON(200, gin.H{"status": "connected", "token": body.Token})
	} else {
		StopH5Tunnel()
		clearTunnelConfig()
		c.JSON(200, gin.H{"status": "disconnected"})
	}
}

// GetH5TunnelStatusHandler 获取隧道状态
func GetH5TunnelStatusHandler(c *gin.Context) {
	c.JSON(200, GetH5TunnelStatus())
}
