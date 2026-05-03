package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
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
}

func (c *wsClient) writeMsg(msg WSMessage) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.conn.WriteJSON(msg); err != nil {
		log.Printf("[ws] write error: %v", err)
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
	log.Printf("[ws] client registered, total=%d", len(h.clients))
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
	log.Printf("[ws] client unregistered, remaining=%d", len(h.clients))
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
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WsHandler GET /api/ws?sessionId=xxx
// 前端建立 WebSocket 长连接，用于接收后端主动推送的消息。
// 前端可发送 {"type":"subscribe","sessionId":123} 订阅更多 session，
// 或 {"type":"unsubscribe","sessionId":123} 取消订阅。
func WsHandler(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}

	client := &wsClient{
		conn:       conn,
		sessionIDs: make(map[int64]bool),
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

	// 读取客户端控制消息
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
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
			log.Printf("[ws] subscribed session=%d", cmd.SessionID)
		case "unsubscribe":
			delete(client.sessionIDs, cmd.SessionID)
			log.Printf("[ws] unsubscribed session=%d", cmd.SessionID)
		}
		client.mu.Unlock()
	}
}
