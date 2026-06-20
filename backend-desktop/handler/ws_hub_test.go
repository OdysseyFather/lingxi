package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func setupWSTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/ws", func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		client := &wsClient{
			conn:       conn,
			sessionIDs: make(map[int64]bool),
			deviceID:   c.Query("device_id"),
		}
		globalHub.register(client)
		defer func() {
			globalHub.unregister(client)
			conn.Close()
		}()

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
			case "unsubscribe":
				delete(client.sessionIDs, cmd.SessionID)
			}
			client.mu.Unlock()
		}
	})
	return r
}

func dialWS(t *testing.T, server *httptest.Server, path string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + path
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial WS: %v", err)
	}
	return conn
}

func TestWSHub_SubscribeAndReceive(t *testing.T) {
	// 使用独立 Hub 避免测试间干扰
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	conn := dialWS(t, server, "/api/ws")
	defer conn.Close()

	// 订阅 session 42
	sub := map[string]interface{}{"type": "subscribe", "sessionId": 42}
	if err := conn.WriteJSON(sub); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)

	// 通过 Hub 发送消息到 session 42
	globalHub.Send(42, "stream_delta", `{"text":"hello"}`)

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("failed to read message: %v", err)
	}

	var msg WSMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if msg.Event != "stream_delta" {
		t.Errorf("expected event=stream_delta, got %q", msg.Event)
	}
	if msg.SessionID != 42 {
		t.Errorf("expected sessionId=42, got %d", msg.SessionID)
	}
}

func TestWSHub_UnsubscribeStopsMessages(t *testing.T) {
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	conn := dialWS(t, server, "/api/ws")
	defer conn.Close()

	// 订阅 → 取消订阅
	conn.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 10})
	time.Sleep(50 * time.Millisecond)
	conn.WriteJSON(map[string]interface{}{"type": "unsubscribe", "sessionId": 10})
	time.Sleep(50 * time.Millisecond)

	globalHub.Send(10, "text", `{"text":"should not receive"}`)

	conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	_, _, err := conn.ReadMessage()
	if err == nil {
		t.Error("expected no message after unsubscribe, but got one")
	}
}

func TestWSHub_BroadcastAll(t *testing.T) {
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	conn1 := dialWS(t, server, "/api/ws")
	defer conn1.Close()
	conn2 := dialWS(t, server, "/api/ws")
	defer conn2.Close()

	time.Sleep(50 * time.Millisecond)

	globalHub.BroadcastAll("notification", `{"title":"test"}`)

	var wg sync.WaitGroup
	wg.Add(2)
	results := make([]string, 2)

	go func() {
		defer wg.Done()
		conn1.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, raw, err := conn1.ReadMessage()
		if err == nil {
			results[0] = string(raw)
		}
	}()
	go func() {
		defer wg.Done()
		conn2.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, raw, err := conn2.ReadMessage()
		if err == nil {
			results[1] = string(raw)
		}
	}()
	wg.Wait()

	for i, r := range results {
		if r == "" {
			t.Errorf("conn%d: expected broadcast message, got nothing", i+1)
			continue
		}
		var msg WSMessage
		json.Unmarshal([]byte(r), &msg)
		if msg.Event != "notification" {
			t.Errorf("conn%d: expected event=notification, got %q", i+1, msg.Event)
		}
	}
}

func TestWSHub_MultipleSubscriptions(t *testing.T) {
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	conn := dialWS(t, server, "/api/ws")
	defer conn.Close()

	// 订阅多个 session
	conn.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 1})
	conn.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 2})
	time.Sleep(50 * time.Millisecond)

	// 向 session 1 发送
	globalHub.Send(1, "text", `{"text":"msg1"}`)
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, raw1, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	var msg1 WSMessage
	json.Unmarshal(raw1, &msg1)
	if msg1.SessionID != 1 {
		t.Errorf("expected sessionId=1, got %d", msg1.SessionID)
	}

	// 向 session 2 发送
	globalHub.Send(2, "done", `{}`)
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, raw2, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	var msg2 WSMessage
	json.Unmarshal(raw2, &msg2)
	if msg2.SessionID != 2 {
		t.Errorf("expected sessionId=2, got %d", msg2.SessionID)
	}
	if msg2.Event != "done" {
		t.Errorf("expected event=done, got %q", msg2.Event)
	}
}

func TestWSHub_SessionIsolation(t *testing.T) {
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	conn1 := dialWS(t, server, "/api/ws")
	defer conn1.Close()
	conn2 := dialWS(t, server, "/api/ws")
	defer conn2.Close()

	// conn1 订阅 session 100, conn2 订阅 session 200
	conn1.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 100})
	conn2.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 200})
	time.Sleep(50 * time.Millisecond)

	// 向 session 100 发送
	globalHub.Send(100, "text", `{"text":"only conn1"}`)

	conn1.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err := conn1.ReadMessage()
	if err != nil {
		t.Fatal("conn1 should receive session 100 message")
	}

	conn2.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	_, _, err = conn2.ReadMessage()
	if err == nil {
		t.Error("conn2 should NOT receive session 100 message")
	}
}

func TestWSHub_StreamingSequence(t *testing.T) {
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	conn := dialWS(t, server, "/api/ws")
	defer conn.Close()

	conn.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 5})
	time.Sleep(50 * time.Millisecond)

	// 模拟完整的流式序列
	events := []struct {
		event string
		data  string
	}{
		{"stream_start", `{}`},
		{"agent_state", `{"state":"THINKING"}`},
		{"content_block_start", `{"type":"thinking"}`},
		{"thinking_delta", `{"text":"Let me think..."}`},
		{"thinking_done", `{}`},
		{"stream_delta", `{"text":"Hello "}`},
		{"stream_delta", `{"text":"World"}`},
		{"tool_start", `{"name":"Read","label":"Reading file"}`},
		{"tool_end", `{"name":"Read","ms":150,"status":"success"}`},
		{"stream_delta", `{"text":"Done!"}`},
		{"done", `{}`},
	}

	for _, e := range events {
		globalHub.Send(5, e.event, e.data)
	}

	received := []WSMessage{}
	for i := 0; i < len(events); i++ {
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("failed to read event %d: %v", i, err)
		}
		var msg WSMessage
		json.Unmarshal(raw, &msg)
		received = append(received, msg)
	}

	if len(received) != len(events) {
		t.Fatalf("expected %d events, got %d", len(events), len(received))
	}

	// 验证事件顺序
	for i, e := range events {
		if received[i].Event != e.event {
			t.Errorf("event %d: expected %q, got %q", i, e.event, received[i].Event)
		}
	}
}

func TestWSHub_ClientDisconnectCleanup(t *testing.T) {
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	conn := dialWS(t, server, "/api/ws")
	conn.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 1})
	time.Sleep(50 * time.Millisecond)

	globalHub.mu.RLock()
	countBefore := len(globalHub.clients)
	globalHub.mu.RUnlock()
	if countBefore != 1 {
		t.Fatalf("expected 1 client, got %d", countBefore)
	}

	conn.Close()
	time.Sleep(100 * time.Millisecond)

	// 发送消息触发清理（Hub 在 write 失败时不主动清理，而是 ReadMessage 循环退出时 defer unregister）
	// 等待 unregister 生效
	time.Sleep(200 * time.Millisecond)
	globalHub.mu.RLock()
	countAfter := len(globalHub.clients)
	globalHub.mu.RUnlock()
	if countAfter != 0 {
		t.Errorf("expected 0 clients after disconnect, got %d", countAfter)
	}
}

func TestWSTicket_IssueAndConsume(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// 发行票据
	r := gin.New()
	r.POST("/api/auth/ws-ticket", IssueWsTicketHandler)
	req := httptest.NewRequest("POST", "/api/auth/ws-ticket", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	ticket := resp["ticket"].(string)

	if ticket == "" || !strings.HasPrefix(ticket, "wst_") {
		t.Fatalf("invalid ticket: %q", ticket)
	}

	// 第一次消费：成功
	if !ValidateAndConsumeWsTicket(ticket) {
		t.Error("first validation should succeed")
	}

	// 第二次消费：失败（一次性）
	if ValidateAndConsumeWsTicket(ticket) {
		t.Error("second validation should fail (one-time use)")
	}
}

func TestWSTicket_Expiry(t *testing.T) {
	// 手动注入一个过期票据
	wsTicketsMu.Lock()
	wsTickets["expired_test"] = &wsTicketEntry{createdAt: time.Now().Add(-2 * time.Minute)}
	wsTicketsMu.Unlock()

	if ValidateAndConsumeWsTicket("expired_test") {
		t.Error("expired ticket should not validate")
	}
}

func TestWSHub_DeviceID(t *testing.T) {
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	// 连接时附带 device_id
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/ws?device_id=phone123"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	time.Sleep(50 * time.Millisecond)

	ids := ConnectedDeviceIDs()
	if !ids["phone123"] {
		t.Error("expected device_id 'phone123' in connected devices")
	}
}

func TestWSHub_ConcurrentSendSafe(t *testing.T) {
	savedHub := globalHub
	globalHub = &Hub{}
	defer func() { globalHub = savedHub }()

	r := setupWSTestRouter()
	server := httptest.NewServer(r)
	defer server.Close()

	conn := dialWS(t, server, "/api/ws")
	defer conn.Close()

	conn.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 1})
	time.Sleep(50 * time.Millisecond)

	// 并发发送 100 条消息，不应 panic
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			globalHub.Send(1, "text", `{"text":"concurrent"}`)
		}(i)
	}
	wg.Wait()

	// 只要不 panic 就通过；读取部分消息验证
	received := 0
	for i := 0; i < 100; i++ {
		conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
		received++
	}
	if received < 50 {
		t.Errorf("expected at least 50 messages, got %d", received)
	}
}
