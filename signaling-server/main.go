package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var base64Encoding = base64.StdEncoding

// ─── 数据结构 ────────────────────────────────────────────────────

// writeMsg 是写入通道中的消息载体，区分 JSON 消息和 WebSocket 控制帧
type writeMsg struct {
	json    *SignalMessage // JSON 消息（二选一）
	msgType int           // 控制帧类型（websocket.PingMessage 等）
	data    []byte        // 控制帧数据
}

type PeerInfo struct {
	InstanceID string  `json:"instance_id"`
	Nickname   string  `json:"nickname"`
	UserID     string  `json:"user_id,omitempty"`
	AvatarURL  string  `json:"avatar_url,omitempty"`
	Agents     []Agent `json:"agents"`
	Platform   string  `json:"platform,omitempty"`
	DeviceName string  `json:"device_name,omitempty"`
	LocalIP    string  `json:"local_ip,omitempty"`
	LocalPort  int     `json:"local_port,omitempty"`
	conn       *websocket.Conn
	lastSeen   time.Time
	writeCh    chan writeMsg
	closeCh    chan struct{}
	closeOnce  sync.Once
}

// enqueue 向写入通道发送消息，通道满或已关闭时静默丢弃
func (p *PeerInfo) enqueue(msg writeMsg) {
	select {
	case p.writeCh <- msg:
	case <-p.closeCh:
	default:
		log.Printf("[peer] write channel full, dropping message for %s", p.InstanceID)
	}
}

// enqueueJSON 便捷方法：发送 JSON 消息
func (p *PeerInfo) enqueueJSON(msg SignalMessage) {
	p.enqueue(writeMsg{json: &msg})
}

// writeLoop 是每个 peer 唯一的写协程，串行化所有写操作
func (p *PeerInfo) writeLoop() {
	defer p.conn.Close()
	for {
		select {
		case <-p.closeCh:
			return
		case wm := <-p.writeCh:
			if wm.json != nil {
				if err := p.conn.WriteJSON(wm.json); err != nil {
					log.Printf("[peer] writeLoop WriteJSON error for %s: %v", p.InstanceID, err)
					return
				}
			} else {
				if err := p.conn.WriteMessage(wm.msgType, wm.data); err != nil {
					log.Printf("[peer] writeLoop WriteMessage error for %s: %v", p.InstanceID, err)
					return
				}
			}
		}
	}
}

// close 关闭 peer 的写入通道（幂等）
func (p *PeerInfo) close() {
	p.closeOnce.Do(func() {
		close(p.closeCh)
	})
}

type Agent struct {
	ID             int64    `json:"id"`
	Name           string   `json:"name"`
	CapabilityTags []string `json:"capability_tags"`
	AuthLevel      string   `json:"auth_level"`
}

type SignalMessage struct {
	Type   string          `json:"type"`
	From   string          `json:"from,omitempty"`
	To     string          `json:"to,omitempty"`
	ToList []string        `json:"to_list,omitempty"` // 多播目标列表（仅 relay_multi 使用）
	Data   json.RawMessage `json:"data,omitempty"`
}

// ─── Hub 管理所有连接 ────────────────────────────────────────────

type Hub struct {
	mu    sync.RWMutex
	peers map[string]*PeerInfo
}

var hub = &Hub{peers: make(map[string]*PeerInfo)}

var allowedOrigins = os.Getenv("ALLOWED_ORIGINS")

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		if allowedOrigins == "" {
			return true
		}
		origin := r.Header.Get("Origin")
		for _, o := range strings.Split(allowedOrigins, ",") {
			if strings.TrimSpace(o) == origin {
				return true
			}
		}
		return origin == ""
	},
}

func (h *Hub) register(p *PeerInfo) {
	h.mu.Lock()
	if old, ok := h.peers[p.InstanceID]; ok {
		old.close()
	}
	h.peers[p.InstanceID] = p
	h.mu.Unlock()
	log.Printf("[hub] registered: %s (%s) platform=%s device=%s ip=%s port=%d",
		p.InstanceID, p.Nickname, p.Platform, p.DeviceName, p.LocalIP, p.LocalPort)

	h.broadcastPeerEvent("peer_online", p)
}

func (h *Hub) unregister(id string) {
	h.mu.Lock()
	p := h.peers[id]
	delete(h.peers, id)
	h.mu.Unlock()
	log.Printf("[hub] unregistered: %s", id)

	if p != nil {
		p.close()
		h.broadcastPeerEvent("peer_offline", p)
	}
}

func (h *Hub) broadcastPeerEvent(eventType string, p *PeerInfo) {
	data := jsonRaw(map[string]interface{}{
		"instance_id": p.InstanceID,
		"nickname":    p.Nickname,
		"user_id":     p.UserID,
		"avatar_url":  p.AvatarURL,
		"agents":      p.Agents,
		"platform":    p.Platform,
		"device_name": p.DeviceName,
		"local_ip":    p.LocalIP,
		"local_port":  p.LocalPort,
	})
	msg := SignalMessage{Type: eventType, Data: data}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for id, peer := range h.peers {
		if id == p.InstanceID {
			continue
		}
		peer.enqueueJSON(msg)
	}
}

func (h *Hub) getPeer(id string) *PeerInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.peers[id]
}

func (h *Hub) listOnlinePeers() []map[string]interface{} {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]map[string]interface{}, 0, len(h.peers))
	for _, p := range h.peers {
		out = append(out, map[string]interface{}{
			"instance_id": p.InstanceID,
			"nickname":    p.Nickname,
			"user_id":     p.UserID,
			"avatar_url":  p.AvatarURL,
			"agents":      p.Agents,
			"platform":    p.Platform,
			"device_name": p.DeviceName,
			"local_ip":    p.LocalIP,
			"local_port":  p.LocalPort,
		})
	}
	return out
}

// sendTo 通过写入通道将消息投递给目标 peer，不再直接写连接
func (h *Hub) sendTo(targetID string, msg SignalMessage) error {
	h.mu.RLock()
	p := h.peers[targetID]
	h.mu.RUnlock()
	if p == nil {
		return fmt.Errorf("peer_offline")
	}
	select {
	case <-p.closeCh:
		return fmt.Errorf("peer_offline")
	default:
	}
	p.enqueueJSON(msg)
	return nil
}

// ─── WebSocket 处理 ──────────────────────────────────────────────

func handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}

	conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	var peer *PeerInfo

	defer func() {
		if r := recover(); r != nil {
			log.Printf("[ws] recovered panic in handleWS: %v", r)
		}
		if peer != nil {
			tunnelHub.unregister(peer.InstanceID)
			hub.unregister(peer.InstanceID)
		}
		conn.Close()
	}()

	// safeWrite 通过写入通道发送消息，完全避免 concurrent write
	safeWrite := func(msg SignalMessage) {
		if peer == nil {
			return
		}
		peer.enqueueJSON(msg)
	}

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))

		var msg SignalMessage
		if json.Unmarshal(msgBytes, &msg) != nil {
			continue
		}

		switch msg.Type {
		case "register":
			var reg struct {
				InstanceID string  `json:"instance_id"`
				Nickname   string  `json:"nickname"`
				UserID     string  `json:"user_id"`
				AvatarURL  string  `json:"avatar_url"`
				Agents     []Agent `json:"agents"`
				Platform   string  `json:"platform"`
				DeviceName string  `json:"device_name"`
				LocalIP    string  `json:"local_ip"`
				LocalPort  int     `json:"local_port"`
			}
			json.Unmarshal(msg.Data, &reg)
			if reg.InstanceID == "" {
				continue
			}
			peer = &PeerInfo{
				InstanceID: reg.InstanceID,
				Nickname:   reg.Nickname,
				UserID:     reg.UserID,
				AvatarURL:  reg.AvatarURL,
				Agents:     reg.Agents,
				Platform:   reg.Platform,
				DeviceName: reg.DeviceName,
				LocalIP:    reg.LocalIP,
				LocalPort:  reg.LocalPort,
				conn:       conn,
				lastSeen:   time.Now(),
				writeCh:    make(chan writeMsg, 256),
				closeCh:    make(chan struct{}),
			}
			go peer.writeLoop()
			hub.register(peer)
			safeWrite(SignalMessage{Type: "registered", Data: jsonRaw(map[string]string{"status": "ok"})})

			// ping ticker 通过写入通道发送，不再直接写连接
			go func(p *PeerInfo) {
				ticker := time.NewTicker(30 * time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-p.closeCh:
						return
					case <-ticker.C:
						p.enqueue(writeMsg{msgType: websocket.PingMessage, data: nil})
					}
				}
			}(peer)

		case "list_peers":
			peers := hub.listOnlinePeers()
			safeWrite(SignalMessage{Type: "peers_list", Data: jsonRaw(peers)})

		case "relay":
			if msg.To == "" || peer == nil {
				continue
			}
			msg.From = peer.InstanceID
			log.Printf("[ws] relay from=%s to=%s dataLen=%d", peer.InstanceID, msg.To, len(msg.Data))
			if err := hub.sendTo(msg.To, msg); err != nil {
				log.Printf("[ws] relay delivery failed: from=%s to=%s reason=%v", peer.InstanceID, msg.To, err)
				safeWrite(SignalMessage{
					Type: "delivery_failed",
					Data: jsonRaw(map[string]string{"to": msg.To, "reason": "peer_offline", "original_type": "relay"}),
				})
			}

		case "relay_multi":
			// 多播：把同一份 data 转发给 to_list 内的所有 peer，节省客户端往返
			if peer == nil || len(msg.ToList) == 0 {
				continue
			}
			msg.From = peer.InstanceID
			failed := []string{}
			for _, target := range msg.ToList {
				if target == "" || target == peer.InstanceID {
					continue
				}
				out := SignalMessage{
					Type: "relay",
					From: peer.InstanceID,
					To:   target,
					Data: msg.Data,
				}
				if err := hub.sendTo(target, out); err != nil {
					failed = append(failed, target)
				}
			}
			log.Printf("[ws] relay_multi from=%s targets=%d failed=%d", peer.InstanceID, len(msg.ToList), len(failed))
			if len(failed) > 0 {
				safeWrite(SignalMessage{
					Type: "delivery_failed",
					Data: jsonRaw(map[string]interface{}{"to_list": failed, "reason": "peer_offline", "original_type": "relay_multi"}),
				})
			}

		case "conversation_invite":
			if msg.To == "" || peer == nil {
				continue
			}
			msg.From = peer.InstanceID
			log.Printf("[ws] conversation_invite from=%s to=%s", peer.InstanceID, msg.To)
			if err := hub.sendTo(msg.To, msg); err != nil {
				safeWrite(SignalMessage{
					Type: "delivery_failed",
					Data: jsonRaw(map[string]string{"to": msg.To, "reason": "peer_offline", "original_type": "conversation_invite"}),
				})
			}

		case "conversation_accept":
			if msg.To == "" || peer == nil {
				continue
			}
			msg.From = peer.InstanceID
			log.Printf("[ws] conversation_accept from=%s to=%s", peer.InstanceID, msg.To)
			if err := hub.sendTo(msg.To, msg); err != nil {
				safeWrite(SignalMessage{
					Type: "delivery_failed",
					Data: jsonRaw(map[string]string{"to": msg.To, "reason": "peer_offline", "original_type": "conversation_accept"}),
				})
			}

		case "conversation_reject":
			if msg.To == "" || peer == nil {
				continue
			}
			msg.From = peer.InstanceID
			log.Printf("[ws] conversation_reject from=%s to=%s", peer.InstanceID, msg.To)
			if err := hub.sendTo(msg.To, msg); err != nil {
				safeWrite(SignalMessage{
					Type: "delivery_failed",
					Data: jsonRaw(map[string]string{"to": msg.To, "reason": "peer_offline", "original_type": "conversation_reject"}),
				})
			}

		case "tunnel_register":
			if peer == nil {
				continue
			}
			var reg struct {
				Token string `json:"token"`
			}
			json.Unmarshal(msg.Data, &reg)
			if reg.Token == "" {
				continue
			}
			tunnelHub.register(reg.Token, peer.InstanceID, peer)
			safeWrite(SignalMessage{Type: "tunnel_registered", Data: jsonRaw(map[string]string{"status": "ok", "token": reg.Token})})

		case "tunnel_response":
			if peer == nil {
				continue
			}
			var resp TunnelResponse
			json.Unmarshal(msg.Data, &resp)
			if resp.RequestID == "" {
				continue
			}
			// 查找对应的隧道并投递响应
			tunnelHub.mu.RLock()
			for _, info := range tunnelHub.tunnels {
				if info.InstanceID == peer.InstanceID {
					if ch, ok := info.pending.Load(resp.RequestID); ok {
						select {
						case ch.(chan *TunnelResponse) <- &resp:
						default:
						}
					}
					break
				}
			}
			tunnelHub.mu.RUnlock()

		case "tunnel_ws_message":
			// 桌面端转发本地 WS 消息给手机端
			if peer == nil {
				continue
			}
			var fwd struct {
				WsID    string `json:"ws_id"`
				Message string `json:"message"` // base64
			}
			json.Unmarshal(msg.Data, &fwd)
			if fwd.WsID == "" {
				continue
			}
			twsConn := tunnelWsHub.get(fwd.WsID)
			if twsConn == nil {
				continue
			}
			msgBytes, err := base64Decode(fwd.Message)
			if err != nil {
				continue
			}
			twsConn.mobileWs.WriteMessage(websocket.TextMessage, msgBytes)

		case "tunnel_ws_close":
			// 桌面端请求关闭手机端 WS
			if peer == nil {
				continue
			}
			var cls struct {
				WsID string `json:"ws_id"`
			}
			json.Unmarshal(msg.Data, &cls)
			if cls.WsID != "" {
				tunnelWsHub.unregister(cls.WsID)
			}

		case "heartbeat":
			if peer != nil {
				peer.lastSeen = time.Now()
			}
			safeWrite(SignalMessage{Type: "heartbeat_ack"})
		}
	}
}

func jsonRaw(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// ─── HTTP 隧道（H5 远程访问反向代理）──────────────────────────────

// TunnelRequest 通过 WS 发给桌面端的 HTTP 请求
type TunnelRequest struct {
	RequestID string            `json:"request_id"`
	Method    string            `json:"method"`
	Path      string            `json:"path"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body,omitempty"` // base64
}

// TunnelResponse 桌面端通过 WS 返回的 HTTP 响应
type TunnelResponse struct {
	RequestID  string            `json:"request_id"`
	StatusCode int               `json:"status_code"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body,omitempty"` // base64
}

// tunnelHub 管理隧道注册（instance_id → tunnel token 映射）
type TunnelHub struct {
	mu      sync.RWMutex
	tunnels map[string]*TunnelInfo // key: tunnel_token
}

type TunnelInfo struct {
	InstanceID string
	Token      string
	peer       *PeerInfo
	pending    sync.Map // request_id → chan *TunnelResponse
}

var tunnelHub = &TunnelHub{tunnels: make(map[string]*TunnelInfo)}

func (th *TunnelHub) register(token, instanceID string, peer *PeerInfo) {
	th.mu.Lock()
	th.tunnels[token] = &TunnelInfo{InstanceID: instanceID, Token: token, peer: peer}
	th.mu.Unlock()
	log.Printf("[tunnel] registered: instance=%s token=%s", instanceID, token[:8]+"...")
}

func (th *TunnelHub) unregister(instanceID string) {
	th.mu.Lock()
	for token, info := range th.tunnels {
		if info.InstanceID == instanceID {
			delete(th.tunnels, token)
			log.Printf("[tunnel] unregistered: instance=%s", instanceID)
		}
		_ = token
	}
	th.mu.Unlock()
}

func (th *TunnelHub) get(token string) *TunnelInfo {
	th.mu.RLock()
	defer th.mu.RUnlock()
	return th.tunnels[token]
}

// handleTunnelHTTP 处理手机端发来的 HTTP 请求，转发给桌面端
func handleTunnelHTTP(w http.ResponseWriter, r *http.Request) {
	// URL: /tunnel/<token>/<path>
	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/tunnel/"), "/", 2)
	if len(parts) < 1 || parts[0] == "" {
		http.Error(w, "invalid tunnel URL", http.StatusBadRequest)
		return
	}
	token := parts[0]
	subPath := "/"
	if len(parts) > 1 {
		subPath = "/" + parts[1]
	}
	if r.URL.RawQuery != "" {
		subPath += "?" + r.URL.RawQuery
	}

	info := tunnelHub.get(token)
	if info == nil {
		http.Error(w, "tunnel not found or offline", http.StatusBadGateway)
		return
	}

	// 检查 peer 是否在线
	peer := hub.getPeer(info.InstanceID)
	if peer == nil {
		http.Error(w, "desktop offline", http.StatusBadGateway)
		return
	}

	// 检测 WebSocket 升级请求
	if isWebSocketUpgrade(r) {
		handleTunnelWebSocket(w, r, token, subPath, info, peer)
		return
	}

	// 读取请求体
	var bodyB64 string
	if r.Body != nil {
		bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 10<<20)) // 10MB limit
		if err == nil && len(bodyBytes) > 0 {
			bodyB64 = base64Encode(bodyBytes)
		}
	}

	// 收集请求头
	headers := make(map[string]string)
	for k, vs := range r.Header {
		if len(vs) > 0 {
			headers[k] = vs[0]
		}
	}
	headers["X-Forwarded-For"] = r.RemoteAddr
	headers["X-Forwarded-Proto"] = "https"

	// 生成请求 ID
	reqID := fmt.Sprintf("%d-%d", time.Now().UnixNano(), time.Now().UnixMicro()%10000)

	// 创建响应通道
	respCh := make(chan *TunnelResponse, 1)
	info.pending.Store(reqID, respCh)
	defer info.pending.Delete(reqID)

	// 通过 WS 发送请求给桌面端
	tunnelReq := TunnelRequest{
		RequestID: reqID,
		Method:    r.Method,
		Path:      subPath,
		Headers:   headers,
		Body:      bodyB64,
	}
	reqData, _ := json.Marshal(tunnelReq)
	peer.enqueueJSON(SignalMessage{
		Type: "tunnel_request",
		Data: json.RawMessage(reqData),
	})

	// 等待桌面端响应（超时 30 秒）
	select {
	case resp := <-respCh:
		for k, v := range resp.Headers {
			w.Header().Set(k, v)
		}
		w.WriteHeader(resp.StatusCode)
		if resp.Body != "" {
			bodyBytes, _ := base64Decode(resp.Body)
			w.Write(bodyBytes)
		}
	case <-time.After(30 * time.Second):
		http.Error(w, "tunnel timeout", http.StatusGatewayTimeout)
	}
}

func isWebSocketUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
		strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade")
}

// ─── WebSocket 隧道代理 ────────────────────────────────────────────

// tunnelWsHub 管理通过隧道桥接的 WebSocket 连接
type TunnelWsHub struct {
	mu    sync.RWMutex
	conns map[string]*TunnelWsConn // wsID → conn
}

type TunnelWsConn struct {
	wsID     string
	mobileWs *websocket.Conn
	closeCh  chan struct{}
}

var tunnelWsHub = &TunnelWsHub{conns: make(map[string]*TunnelWsConn)}

func (h *TunnelWsHub) register(wsID string, conn *TunnelWsConn) {
	h.mu.Lock()
	h.conns[wsID] = conn
	h.mu.Unlock()
}

func (h *TunnelWsHub) unregister(wsID string) {
	h.mu.Lock()
	if c, ok := h.conns[wsID]; ok {
		select {
		case <-c.closeCh:
		default:
			close(c.closeCh)
		}
		delete(h.conns, wsID)
	}
	h.mu.Unlock()
}

func (h *TunnelWsHub) get(wsID string) *TunnelWsConn {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.conns[wsID]
}

// handleTunnelWebSocket 处理通过隧道代理的 WebSocket 连接
func handleTunnelWebSocket(w http.ResponseWriter, r *http.Request, token, subPath string, info *TunnelInfo, peer *PeerInfo) {
	// 升级手机端连接
	mobileConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[tunnel-ws] upgrade error: %v", err)
		return
	}

	wsID := fmt.Sprintf("tws-%d-%d", time.Now().UnixNano(), time.Now().UnixMicro()%10000)
	twsConn := &TunnelWsConn{
		wsID:     wsID,
		mobileWs: mobileConn,
		closeCh:  make(chan struct{}),
	}
	tunnelWsHub.register(wsID, twsConn)

	defer func() {
		tunnelWsHub.unregister(wsID)
		mobileConn.Close()
		// 通知桌面端关闭对应的本地 WS
		closeData, _ := json.Marshal(map[string]string{"ws_id": wsID})
		peer.enqueueJSON(SignalMessage{
			Type: "tunnel_ws_close",
			Data: json.RawMessage(closeData),
		})
	}()

	// 通知桌面端打开一个到本地的 WS 连接
	openData, _ := json.Marshal(map[string]string{
		"ws_id": wsID,
		"path":  subPath,
	})
	peer.enqueueJSON(SignalMessage{
		Type: "tunnel_ws_open",
		Data: json.RawMessage(openData),
	})

	// 读取手机端发来的 WS 消息，转发给桌面端
	for {
		_, msgBytes, err := mobileConn.ReadMessage()
		if err != nil {
			break
		}
		// 转发给桌面端
		fwdData, _ := json.Marshal(map[string]string{
			"ws_id":   wsID,
			"message": base64Encode(msgBytes),
		})
		peer.enqueueJSON(SignalMessage{
			Type: "tunnel_ws_message",
			Data: json.RawMessage(fwdData),
		})
	}
}

func base64Encode(data []byte) string {
	return base64Encoding.EncodeToString(data)
}

func base64Decode(s string) ([]byte, error) {
	return base64Encoding.DecodeString(s)
}

// ─── HTTP 端点 ───────────────────────────────────────────────────

func handlePeers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(hub.listOnlinePeers())
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	hub.mu.RLock()
	count := len(hub.peers)
	hub.mu.RUnlock()
	tunnelHub.mu.RLock()
	tunnelCount := len(tunnelHub.tunnels)
	tunnelHub.mu.RUnlock()
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "online": count, "tunnels": tunnelCount})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "9090"
	}

	http.HandleFunc("/ws", handleWS)
	http.HandleFunc("/api/peers", handlePeers)
	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/tunnel/", handleTunnelHTTP)

	tlsCert := os.Getenv("TLS_CERT")
	tlsKey := os.Getenv("TLS_KEY")

	if tlsCert != "" && tlsKey != "" {
		log.Printf("[signaling] server starting on :%s (TLS/WSS, tunnel enabled)", port)
		if err := http.ListenAndServeTLS(":"+port, tlsCert, tlsKey, nil); err != nil {
			log.Fatalf("[signaling] server error: %v", err)
		}
	} else {
		log.Printf("[signaling] server starting on :%s (plain WS, tunnel enabled, set TLS_CERT & TLS_KEY for WSS)", port)
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Fatalf("[signaling] server error: %v", err)
		}
	}
}
