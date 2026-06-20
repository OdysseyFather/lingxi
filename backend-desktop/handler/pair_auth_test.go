package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPairAuthExempt(t *testing.T) {
	exempted := []string{
		"/api/ping",
		"/api/health",
		"/api/pair/complete",
		"/api/auth/guest",
		"/api/auth/status",
		"/api/auth/me",
		"/api/uploads/image.png",
		"/api/uploads/subfolder/file.jpg",
		"/api/ws",          // WS 有自己的 WsAuthCheck
		"/api/terminal/ws", // PTY WS 同上
	}
	for _, path := range exempted {
		if !isPairAuthExempt(path) {
			t.Errorf("path %q should be exempt", path)
		}
	}

	notExempted := []string{
		"/api/sessions",
		"/api/chat",
		"/api/agents",
		"/api/pair/initiate",
		"/api/knowledge",
	}
	for _, path := range notExempted {
		if isPairAuthExempt(path) {
			t.Errorf("path %q should NOT be exempt", path)
		}
	}
}

func TestPairAuth_LocalhostBypass(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(PairTokenAuthMiddleware())
	r.GET("/api/sessions", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	req := httptest.NewRequest("GET", "/api/sessions", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("localhost should pass, got %d", w.Code)
	}
}

func TestPairAuth_RemoteWithoutToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(PairTokenAuthMiddleware())
	r.GET("/api/sessions", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	req := httptest.NewRequest("GET", "/api/sessions", nil)
	req.RemoteAddr = "192.168.1.100:54321"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("remote without token should get 401, got %d", w.Code)
	}
}

func TestPairAuth_ExemptPathFromRemote(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(PairTokenAuthMiddleware())
	r.GET("/api/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})
	r.POST("/api/pair/complete", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	req := httptest.NewRequest("GET", "/api/ping", nil)
	req.RemoteAddr = "10.0.0.1:9999"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Errorf("/api/ping from remote should pass, got %d", w.Code)
	}

	req2 := httptest.NewRequest("POST", "/api/pair/complete", nil)
	req2.RemoteAddr = "10.0.0.1:9999"
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code == http.StatusUnauthorized {
		t.Error("/api/pair/complete from remote should be exempt")
	}
}

func TestWSTicket_MultipleIssues(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/auth/ws-ticket", IssueWsTicketHandler)

	tickets := make([]string, 3)
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest("POST", "/api/auth/ws-ticket", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != 200 {
			t.Fatalf("ticket %d: expected 200, got %d", i, w.Code)
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		tickets[i] = resp["ticket"].(string)
	}

	if tickets[0] == tickets[1] || tickets[1] == tickets[2] {
		t.Error("tickets should be unique")
	}

	// 消费第二个，第一和第三个应不受影响
	if !ValidateAndConsumeWsTicket(tickets[1]) {
		t.Error("ticket[1] should be valid")
	}
	if !ValidateAndConsumeWsTicket(tickets[0]) {
		t.Error("ticket[0] should still be valid")
	}
	if !ValidateAndConsumeWsTicket(tickets[2]) {
		t.Error("ticket[2] should still be valid")
	}
}
