package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	wsPingInterval = 20 * time.Second
	wsPongTimeout  = 40 * time.Second
)

// WSMessage 是通过 WebSocket 发送的消息结构
type WSMessage struct {
	Event     string `json:"event"`
	Data      string `json:"data"`
	SessionID int64  `json:"sessionId,omitempty"`
}

// wsClient 代表一个 WebSocket 连接，可订阅多个 session
type wsClient struct {
	conn       *websocket.Conn
	mu         sync.Mutex
	sessionIDs map[int64]bool // 该连接订阅的所有 sessionId
	deviceID   string         // 手机端配对设备 ID（空=桌面端）
}

func (c *wsClient) writeMsg(msg WSMessage) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.conn.WriteJSON(msg); err != nil {
		slog.Warn("write error", "err", err)
	}
}

// Hub 管理所有 WebSocket 连接，支持按 sessionID 推送或全局广播
type Hub struct {
	mu      sync.RWMutex
	clients []*wsClient
}

var globalHub = &Hub{}

func (h *Hub) register(c *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients = append(h.clients, c)
	slog.Info("client registered, total", "clients)", len(h.clients))
}

func (h *Hub) unregister(c *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	newList := h.clients[:0]
	for _, cl := range h.clients {
		if cl != c {
			newList = append(newList, cl)
		}
	}
	h.clients = newList
	slog.Info("client unregistered, remaining", "clients)", len(h.clients))
}

// Send 向订阅了指定 session 的所有连接推送消息
func (h *Hub) Send(sessionID int64, event, data string) {
	h.mu.RLock()
	clients := make([]*wsClient, len(h.clients))
	copy(clients, h.clients)
	h.mu.RUnlock()

	msg := WSMessage{Event: event, Data: data, SessionID: sessionID}
	for _, c := range clients {
		c.mu.Lock()
		subscribed := c.sessionIDs[sessionID]
		c.mu.Unlock()
		if subscribed {
			c.writeMsg(msg)
		}
	}
}

// BroadcastAll 向所有连接广播消息（用于全局通知）
func (h *Hub) BroadcastAll(event, data string) {
	h.mu.RLock()
	clients := make([]*wsClient, len(h.clients))
	copy(clients, h.clients)
	h.mu.RUnlock()

	msg := WSMessage{Event: event, Data: data}
	for _, c := range clients {
		c.writeMsg(msg)
	}
}

// SendNotification 向所有连接发送一条通知气泡
func SendNotification(title, body string) {
	payload, _ := json.Marshal(map[string]string{"title": title, "body": body})
	globalHub.BroadcastAll("notification", string(payload))
}

// ConnectedDeviceIDs 返回当前通过 WS 在线的手机端设备 ID 集合
func ConnectedDeviceIDs() map[string]bool {
	globalHub.mu.RLock()
	defer globalHub.mu.RUnlock()
	ids := make(map[string]bool)
	for _, c := range globalHub.clients {
		if c.deviceID != "" {
			ids[c.deviceID] = true
		}
	}
	return ids
}

// BroadcastEvent 把任意事件广播给所有连接（payload 自动 JSON 序列化）
func BroadcastEvent(event string, payload any) {
	b, _ := json.Marshal(payload)
	globalHub.BroadcastAll(event, string(b))
}

// BroadcastWSEvent 广播原始 JSON 字符串事件（供 scheduler 等外部包调用）
func BroadcastWSEvent(event, data string) {
	globalHub.BroadcastAll(event, data)
}

var upgrader = websocket.Upgrader{
	// WS 安全由 WsAuthCheck 在 Upgrade 之前校验（localhost 放行 / ticket/token 认证），
	// Origin 检查放宽以支持手机 App LAN 直连和隧道场景
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		if strings.HasPrefix(origin, "http://localhost:") ||
			strings.HasPrefix(origin, "http://127.0.0.1:") ||
			origin == "file://" ||
			strings.HasPrefix(origin, "app://") {
			return true
		}
		if strings.HasPrefix(origin, "http://10.") ||
			strings.HasPrefix(origin, "http://172.") ||
			strings.HasPrefix(origin, "http://192.168.") {
			return true
		}
		// 携带了有效 ticket/pair_token 的连接信任其 origin
		if r.URL.Query().Get("ticket") != "" || r.URL.Query().Get("pair_token") != "" {
			return true
		}
		slog.Warn("rejected origin", "value", origin)
		return false
	},
}

// WsHandler GET /api/ws?sessionId=xxx
// 前端建立 WebSocket 长连接，用于接收后端主动推送的消息。
// 前端可发送 {"type":"subscribe","sessionId":123} 订阅更多 session，
// 或 {"type":"unsubscribe","sessionId":123} 取消订阅。
func WsHandler(c *gin.Context) {
	if !WsAuthCheck(c) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "ws authentication required"})
		return
	}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Warn("upgrade error", "err", err)
		return
	}

	client := &wsClient{
		conn:       conn,
		sessionIDs: make(map[int64]bool),
		deviceID:   c.Query("device_id"),
	}

	// 从 query 参数初始化订阅的 session
	if sid := c.Query("sessionId"); sid != "" {
		var id int64
		if _, err := fmt.Sscanf(sid, "%d", &id); err == nil && id > 0 {
			client.sessionIDs[id] = true
		}
	}

	globalHub.register(client)
	defer func() {
		globalHub.unregister(client)
		conn.Close()
	}()

	// 设置 Pong 处理器：每收到 Pong 就延长读取超时
	conn.SetReadDeadline(time.Now().Add(wsPongTimeout))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsPongTimeout))
		return nil
	})

	// 后台定时发送 Ping 帧，保持连接活跃（移动网络 NAT 通常 30-60s 超时）
	pingDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(wsPingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				client.mu.Lock()
				err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second))
				client.mu.Unlock()
				if err != nil {
					return
				}
			case <-pingDone:
				return
			}
		}
	}()
	defer close(pingDone)

	// 读取客户端控制消息
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		// 收到任何消息都延长读取超时
		conn.SetReadDeadline(time.Now().Add(wsPongTimeout))

		var cmd struct {
			Type      string `json:"type"`
			SessionID int64  `json:"sessionId"`
		}
		if json.Unmarshal(msg, &cmd) != nil || cmd.SessionID == 0 {
			continue
		}
		client.mu.Lock()
		switch cmd.Type {
		case "subscribe", "switch_session":
			client.sessionIDs[cmd.SessionID] = true
			slog.Info("subscribed session", "session_i_d", cmd.SessionID)
		case "unsubscribe":
			delete(client.sessionIDs, cmd.SessionID)
			slog.Info("unsubscribed session", "session_i_d", cmd.SessionID)
		}
		client.mu.Unlock()
	}
}
