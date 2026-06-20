package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// pairAuthExemptPaths 不需要 pair_token 的公开路径（精确匹配或前缀匹配）
var pairAuthExemptPaths = []string{
	"/api/ping",
	"/api/health",
	"/api/pair/complete",
	"/api/auth/guest",
	"/api/auth/status",
	"/api/auth/me",
	"/api/auth/oauth/callback",
	"/api/auth/oauth-configs",
	"/api/h5-access/validate",
	"/api/uploads/",
	"/api/ws",          // WS 有自己的 WsAuthCheck（ticket/cookie 认证）
	"/api/terminal/ws", // PTY WS 同上
}

func isPairAuthExempt(path string) bool {
	for _, p := range pairAuthExemptPaths {
		if strings.HasSuffix(p, "/") {
			if strings.HasPrefix(path, p) {
				return true
			}
		} else if path == p {
			return true
		}
	}
	return false
}

// PairTokenAuthMiddleware 对非 localhost 请求强制要求 pair_token 认证。
// localhost 请求（Electron 桌面端 + h5_tunnel 本地代理）自动放行。
// 部分公开路径（配对完成、健康检查、游客登录等）豁免认证。
func PairTokenAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		host, _, _ := net.SplitHostPort(c.Request.RemoteAddr)
		if host == "127.0.0.1" || host == "::1" || host == "" {
			c.Next()
			return
		}

		if isPairAuthExempt(c.Request.URL.Path) {
			c.Next()
			return
		}

		token := c.GetHeader("X-Pair-Token")
		if token == "" {
			token = c.Query("pair_token")
		}
		if token == "" {
			if v, err := c.Cookie("lingxi_token"); err == nil && v != "" {
				token = v
			}
		}
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		rec, err := db.ValidateH5Token(token)
		if err != nil || rec == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}
		c.Set("paired_device", rec)
		c.Next()
	}
}

// ─── WebSocket 一次性票据（避免 token 泄漏到 URL 日志） ─────────────

type wsTicketEntry struct {
	token     string // 关联的 pair_token hash（可选记录）
	createdAt time.Time
}

var (
	wsTickets   = make(map[string]*wsTicketEntry)
	wsTicketsMu sync.Mutex
)

func init() {
	go wsTicketCleaner()
}

func wsTicketCleaner() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		wsTicketsMu.Lock()
		for k, v := range wsTickets {
			if now.Sub(v.createdAt) > 60*time.Second {
				delete(wsTickets, k)
			}
		}
		wsTicketsMu.Unlock()
	}
}

// IssueWsTicketHandler POST /api/auth/ws-ticket
// 已认证的手机端用 pair_token 换一个 60 秒有效的一次性 WS 握手票据
func IssueWsTicketHandler(c *gin.Context) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate ticket"})
		return
	}
	ticket := "wst_" + hex.EncodeToString(buf)

	wsTicketsMu.Lock()
	wsTickets[ticket] = &wsTicketEntry{createdAt: time.Now()}
	wsTicketsMu.Unlock()

	c.JSON(http.StatusOK, gin.H{"ticket": ticket, "expires_in": 60})
}

// ValidateAndConsumeWsTicket 校验一次性 WS 票据，成功后立即删除（不可重用）
func ValidateAndConsumeWsTicket(ticket string) bool {
	wsTicketsMu.Lock()
	defer wsTicketsMu.Unlock()
	entry, ok := wsTickets[ticket]
	if !ok {
		return false
	}
	delete(wsTickets, ticket)
	return time.Since(entry.createdAt) <= 60*time.Second
}

// WsAuthCheck 在 WsHandler 入口处校验：localhost 放行，否则需要 pair_token 或 cookie
func WsAuthCheck(c *gin.Context) bool {
	host, _, _ := net.SplitHostPort(c.Request.RemoteAddr)
	if host == "127.0.0.1" || host == "::1" || host == "" {
		return true
	}
	// pair_token query 参数直接认证（手机端使用）
	if token := c.Query("pair_token"); token != "" {
		rec, err := db.ValidateH5Token(token)
		if err == nil && rec != nil {
			return true
		}
	}
	// 兼容旧 ticket 方式
	if ticket := c.Query("ticket"); ticket != "" && ValidateAndConsumeWsTicket(ticket) {
		return true
	}
	// H5 浏览器通过 cookie 认证
	if cookieToken, err := c.Cookie("lingxi_token"); err == nil && cookieToken != "" {
		rec, err := db.ValidateH5Token(cookieToken)
		if err == nil && rec != nil {
			return true
		}
	}
	slog.Warn("[ws-auth] rejected unauthenticated WS from non-localhost", "remote", c.Request.RemoteAddr)
	return false
}

// ─── 配对挑战（内存存储，5 分钟 TTL） ────────────────────────────────

type pairingChallenge struct {
	Challenge string
	Code      string // 6 位数字码
	CreatedAt time.Time
	LanIP     string
	LanPort   string
}

var (
	pairingChallenges   = make(map[string]*pairingChallenge) // key: challenge UUID
	pairingCodeIndex    = make(map[string]string)            // key: 6-digit code -> challenge UUID
	pairingChallengesMu sync.Mutex
)

func init() {
	go pairingChallengeCleaner()
}

func pairingChallengeCleaner() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		pairingChallengesMu.Lock()
		for k, v := range pairingChallenges {
			if now.Sub(v.CreatedAt) > 5*time.Minute {
				delete(pairingCodeIndex, v.Code)
				delete(pairingChallenges, k)
			}
		}
		pairingChallengesMu.Unlock()
	}
}

// PairInitiateHandler POST /api/pair/initiate
// PC 端发起配对：生成挑战 UUID + 6 位数字码，返回 QR 数据
func PairInitiateHandler(c *gin.Context) {
	buf := make([]byte, 16)
	rand.Read(buf)
	challenge := hex.EncodeToString(buf)

	codeBuf := make([]byte, 3)
	rand.Read(codeBuf)
	code := fmt.Sprintf("%06d", (int(codeBuf[0])<<16|int(codeBuf[1])<<8|int(codeBuf[2]))%1000000)

	lanIP := findLanIP()
	port := c.Request.Host
	if _, p, _ := net.SplitHostPort(c.Request.Host); p != "" {
		port = p
	} else {
		port = "3001"
	}

	// 获取隧道信息
	tunnelStatus := GetH5TunnelStatus()
	wanSig := ""
	wanTok := ""
	if connected, _ := tunnelStatus["connected"].(bool); connected {
		if sv, ok := tunnelStatus["server_url"].(string); ok {
			wanSig = sv
		}
		if tk, ok := tunnelStatus["token"].(string); ok {
			wanTok = tk
		}
	}

	pairingChallengesMu.Lock()
	pairingChallenges[challenge] = &pairingChallenge{
		Challenge: challenge,
		Code:      code,
		CreatedAt: time.Now(),
		LanIP:     lanIP,
		LanPort:   port,
	}
	pairingCodeIndex[code] = challenge
	pairingChallengesMu.Unlock()

	qrData := map[string]interface{}{
		"type":      "lingxi_pair",
		"v":         1,
		"challenge": challenge,
		"lan":       lanIP + ":" + port,
	}
	if wanSig != "" {
		qrData["wan_sig"] = wanSig
	}
	if wanTok != "" {
		qrData["wan_tok"] = wanTok
	}

	c.JSON(http.StatusOK, gin.H{
		"challenge": challenge,
		"code":      code,
		"qr_data":   qrData,
		"lan_ip":    lanIP,
		"lan_port":  port,
	})
}

// PairCompleteHandler POST /api/pair/complete
// 手机端提交挑战或配对码完成配对，返回永久 pair_token
func PairCompleteHandler(c *gin.Context) {
	var body struct {
		Challenge  string `json:"challenge"`
		Code       string `json:"code"`
		DeviceID   string `json:"device_id"`
		DeviceName string `json:"device_name"`
		Platform   string `json:"platform"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	pairingChallengesMu.Lock()
	var found *pairingChallenge
	if body.Challenge != "" {
		found = pairingChallenges[body.Challenge]
	} else if body.Code != "" {
		if challengeID, ok := pairingCodeIndex[body.Code]; ok {
			found = pairingChallenges[challengeID]
		}
	}
	if found != nil {
		delete(pairingCodeIndex, found.Code)
		delete(pairingChallenges, found.Challenge)
	}
	pairingChallengesMu.Unlock()

	if found == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired challenge/code"})
		return
	}
	if time.Since(found.CreatedAt) > 5*time.Minute {
		c.JSON(http.StatusBadRequest, gin.H{"error": "challenge expired"})
		return
	}

	// 生成永久 token（复用 h5_access_tokens，TTL=0 表示不过期）
	plainToken, rec, err := db.GenerateH5Token(body.DeviceName, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token: " + err.Error()})
		return
	}

	// 设置永久标志和设备信息
	db.SetTokenPermanent(rec.ID, body.DeviceID, body.DeviceName, body.Platform)

	// 获取隧道信息
	tunnelStatus := GetH5TunnelStatus()
	wanTunnelToken := ""
	if connected, _ := tunnelStatus["connected"].(bool); connected {
		if tk, ok := tunnelStatus["token"].(string); ok {
			wanTunnelToken = tk
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"pair_token":       plainToken,
		"lan_ip":           found.LanIP,
		"lan_port":         found.LanPort,
		"wan_tunnel_token": wanTunnelToken,
	})
}

// PairVerifyHandler POST /api/pair/verify
// 手机端启动时验证 token 是否仍然有效（需要已通过 auth middleware）
func PairVerifyHandler(c *gin.Context) {
	lanIP := findLanIP()
	c.JSON(http.StatusOK, gin.H{
		"valid":  true,
		"lan_ip": lanIP,
	})
}

// PairListDevicesHandler GET /api/pair/devices
// PC 设置页列出所有已配对设备
func PairListDevicesHandler(c *gin.Context) {
	devices, err := db.ListPairedDevices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, devices)
}

// PairUnpairHandler DELETE /api/pair/devices/:id
func PairUnpairHandler(c *gin.Context) {
	id := c.Param("id")
	if err := db.UnpairDevice(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PairRotateHandler POST /api/pair/devices/:id/rotate
// 轮换 token：旧 token 失效，返回新 token
func PairRotateHandler(c *gin.Context) {
	id := c.Param("id")
	newToken, err := db.RotateDeviceToken(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"pair_token": newToken})
}

// PairRegisterPushTokenHandler POST /api/pair/devices/:id/push-token
// 手机端注册 FCM/APNs push token
func PairRegisterPushTokenHandler(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		PushToken string `json:"push_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := db.SetDevicePushToken(id, body.PushToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PairRevokeAllHandler POST /api/pair/revoke-all
// 一键撤销所有已配对设备
func PairRevokeAllHandler(c *gin.Context) {
	if err := db.RevokeAllPairedDevices(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
