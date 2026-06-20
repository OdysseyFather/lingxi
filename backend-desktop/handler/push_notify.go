package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"lingxi-agent/crypto"
	"lingxi-agent/db"
)

// pushConfig 推送配置（从 kv_store 中加载）
type pushConfig struct {
	SignalingURL string `json:"signaling_url"`
	PushSecret  string `json:"push_secret"`
}

// getPushConfig 从 kv_store 读取推送配置
func getPushConfig() *pushConfig {
	var sigURL, secret string
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='push_signaling_url'`).Scan(&sigURL)
	db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='push_secret'`).Scan(&secret)
	if sigURL == "" || secret == "" {
		return nil
	}
	if decrypted, err := crypto.Decrypt(secret); err == nil {
		secret = decrypted
	} else {
		slog.Warn("[push] decrypt push_secret failed", "err", err)
		return nil
	}
	return &pushConfig{SignalingURL: sigURL, PushSecret: secret}
}

// savePushConfig 保存推送配置
func savePushConfig(sigURL, secret string) {
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('push_signaling_url', ?)`, sigURL)
	encrypted, err := crypto.Encrypt(secret)
	if err != nil {
		slog.Warn("[push] encrypt push_secret failed, storing plaintext", "err", err)
		encrypted = secret
	}
	db.DB.Exec(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('push_secret', ?)`, encrypted)
}

// TrySendPushNotification 尝试向已配对但可能离线的手机设备发送推送通知
// 在 AI 回复完成时（done 事件）异步调用
// force=true 时跳过在线检查（用于测试推送按钮）
func TrySendPushNotification(sessionID int64, agentName, previewText string, force bool) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("push notification panic", "error", r)
			}
		}()

		config := getPushConfig()
		if config == nil {
			return
		}

		devices, err := db.ListPairedDevices()
		if err != nil {
			slog.Error("push: failed to list devices", "error", err)
			return
		}

		// 跳过当前通过 WS 在线的设备（用户正在前台使用，无需推送）
		// force=true 时跳过此检查（测试推送用）
		onlineDevices := map[string]bool{}
		if !force {
			onlineDevices = ConnectedDeviceIDs()
		}

		var tokens []string
		for _, d := range devices {
			if d.PushToken != "" && d.Enabled {
				if onlineDevices[d.DeviceID] {
					slog.Debug("push: skip online device", "device_id", d.DeviceID)
					continue
				}
				tokens = append(tokens, d.PushToken)
			}
		}
		if len(tokens) == 0 {
			return
		}

		// 截断预览文本
		preview := previewText
		if len(preview) > 100 {
			preview = preview[:100] + "..."
		}
		// 清理 Markdown 标记
		preview = cleanMarkdown(preview)

		title := "灵犀"
		if agentName != "" {
			title = agentName
		}

		body := map[string]interface{}{
			"tokens": tokens,
			"title":  title,
			"body":   preview,
			"data": map[string]string{
				"session_id": fmt.Sprintf("%d", sessionID),
				"type":       "message_done",
			},
		}

		bodyBytes, _ := json.Marshal(body)

		pushURL := signalingToPushURL(config.SignalingURL)

		req, err := http.NewRequest("POST", pushURL, bytes.NewReader(bodyBytes))
		if err != nil {
			slog.Error("push: create request failed", "error", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.PushSecret)

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			slog.Debug("push: send failed (signaling server unreachable)", "error", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == 200 {
			var result map[string]interface{}
			json.NewDecoder(resp.Body).Decode(&result)
			slog.Info("push: notification sent", "sent", result["sent"], "total", result["total"])
		} else {
			slog.Warn("push: server returned error", "status", resp.StatusCode)
		}
	}()
}

// ── Gin Handler: 推送配置管理 ──────────────────────────────────

// GetPushConfigHandler GET /api/push/config
func GetPushConfigHandler(c *gin.Context) {
	cfg := getPushConfig()
	if cfg == nil {
		c.JSON(http.StatusOK, gin.H{"signaling_url": "", "push_secret": ""})
		return
	}
	// 隐藏 secret 中间部分
	masked := cfg.PushSecret
	if len(masked) > 8 {
		masked = masked[:4] + "****" + masked[len(masked)-4:]
	}
	c.JSON(http.StatusOK, gin.H{
		"signaling_url": cfg.SignalingURL,
		"push_secret":   masked,
	})
}

// SetPushConfigHandler PUT /api/push/config
func SetPushConfigHandler(c *gin.Context) {
	var body struct {
		SignalingURL string `json:"signaling_url"`
		PushSecret  string `json:"push_secret"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	savePushConfig(body.SignalingURL, body.PushSecret)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// TestPushHandler POST /api/push/test
func TestPushHandler(c *gin.Context) {
	cfg := getPushConfig()
	if cfg == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "推送未配置，请先设置信令服务器地址和密钥"})
		return
	}

	devices, err := db.ListPairedDevices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var tokens []string
	for _, d := range devices {
		if d.PushToken != "" {
			tokens = append(tokens, d.PushToken)
		}
	}
	if len(tokens) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有已注册推送 token 的设备"})
		return
	}

	TrySendPushNotification(0, "灵犀", "这是一条测试推送通知", true)
	c.JSON(http.StatusOK, gin.H{"ok": true, "devices": len(tokens)})
}

// signalingToPushURL 将信令服务器 WS URL 转换为 HTTP /push 端点
func signalingToPushURL(sigURL string) string {
	u, err := url.Parse(sigURL)
	if err != nil {
		// fallback: 简单替换
		s := strings.Replace(sigURL, "wss://", "https://", 1)
		s = strings.Replace(s, "ws://", "http://", 1)
		return strings.TrimSuffix(s, "/") + "/push"
	}
	if u.Scheme == "wss" {
		u.Scheme = "https"
	} else if u.Scheme == "ws" {
		u.Scheme = "http"
	}
	// 移除末尾 /ws 路径
	u.Path = strings.TrimSuffix(u.Path, "/ws")
	u.Path = strings.TrimSuffix(u.Path, "/")
	u.Path += "/push"
	return u.String()
}

// cleanMarkdown 移除常见 Markdown 标记用于推送预览
func cleanMarkdown(s string) string {
	s = strings.ReplaceAll(s, "**", "")
	s = strings.ReplaceAll(s, "__", "")
	s = strings.ReplaceAll(s, "~~", "")
	s = strings.ReplaceAll(s, "`", "")
	s = strings.ReplaceAll(s, "###", "")
	s = strings.ReplaceAll(s, "##", "")
	s = strings.ReplaceAll(s, "#", "")
	s = strings.ReplaceAll(s, "> ", "")
	s = strings.ReplaceAll(s, "- ", "")
	s = strings.TrimSpace(s)
	return s
}
