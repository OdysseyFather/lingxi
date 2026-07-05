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
	webWsPingInterval = 20 * time.Second
	webWsPongTimeout  = 40 * time.Second
)

type WebWSMessage struct {
	Event     string `json:"event"`
	Data      string `json:"data"`
	SessionID int64  `json:"sessionId,omitempty"`
}

type webWsClient struct {
	conn       *websocket.Conn
	mu         sync.Mutex
	sessionIDs map[int64]bool
}

func (c *webWsClient) writeMsg(msg WebWSMessage) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.conn.WriteJSON(msg); err != nil {
		slog.Warn("ws write error", "err", err)
	}
}

type WebHub struct {
	mu      sync.RWMutex
	clients []*webWsClient
}

var webGlobalHub = &WebHub{}

// WebBroadcastAll 向所有已连接的 WS 客户端广播事件（供外部包调用）
func WebBroadcastAll(event, data string) {
	webGlobalHub.BroadcastAll(event, data)
}

func (h *WebHub) register(c *webWsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients = append(h.clients, c)
	slog.Info("[web-ws] client registered", "total", len(h.clients))
}

func (h *WebHub) unregister(c *webWsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	newList := h.clients[:0]
	for _, cl := range h.clients {
		if cl != c {
			newList = append(newList, cl)
		}
	}
	h.clients = newList
	slog.Info("[web-ws] client unregistered", "remaining", len(h.clients))
}

func (h *WebHub) Send(sessionID int64, event, data string) {
	h.mu.RLock()
	clients := make([]*webWsClient, len(h.clients))
	copy(clients, h.clients)
	h.mu.RUnlock()

	msg := WebWSMessage{Event: event, Data: data, SessionID: sessionID}
	for _, c := range clients {
		c.mu.Lock()
		subscribed := c.sessionIDs[sessionID]
		c.mu.Unlock()
		if subscribed {
			c.writeMsg(msg)
		}
	}
}

func (h *WebHub) BroadcastAll(event, data string) {
	h.mu.RLock()
	clients := make([]*webWsClient, len(h.clients))
	copy(clients, h.clients)
	h.mu.RUnlock()

	msg := WebWSMessage{Event: event, Data: data}
	for _, c := range clients {
		c.writeMsg(msg)
	}
}

var webUpgrader = websocket.Upgrader{
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
		if strings.HasPrefix(origin, "https://") {
			return true
		}
		slog.Warn("[web-ws] rejected origin", "value", origin)
		return false
	},
}

func WebWsHandler(c *gin.Context) {
	conn, err := webUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Warn("[web-ws] upgrade error", "err", err)
		return
	}

	client := &webWsClient{
		conn:       conn,
		sessionIDs: make(map[int64]bool),
	}

	if sid := c.Query("sessionId"); sid != "" {
		var id int64
		if _, err := fmt.Sscanf(sid, "%d", &id); err == nil && id > 0 {
			client.sessionIDs[id] = true
		}
	}

	webGlobalHub.register(client)
	defer func() {
		webGlobalHub.unregister(client)
		conn.Close()
	}()

	conn.SetReadDeadline(time.Now().Add(webWsPongTimeout))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(webWsPongTimeout))
		return nil
	})

	pingDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(webWsPingInterval)
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

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		conn.SetReadDeadline(time.Now().Add(webWsPongTimeout))

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
		case "unsubscribe":
			delete(client.sessionIDs, cmd.SessionID)
		}
		client.mu.Unlock()
	}
}

func WebBodySizeLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}
