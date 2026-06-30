package nexus

import (
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"lingxi-agent/db"
)

// StreamForwarder 转发流式 token 到远端（text/thinking 事件）
type StreamForwarder func(event, data string)

// BroadcastFunc 由 main 包注入
type BroadcastFunc func(event, data string)

var broadcast BroadcastFunc

// Init 注入依赖（仅需广播函数，群聊用）
func Init(broadcastFn BroadcastFunc) {
	broadcast = broadcastFn
}

// GetTransportForPeer 根据 peer ID 获取传输层（WAN 通过信令中继，LAN 通过 mDNS 发现的 host:port）
func GetTransportForPeer(peerID string) Transport {
	peers, _ := db.ListNexusPeers()
	for _, p := range peers {
		if p.ID == peerID {
			return NewLANTransport(p.Host, p.Port)
		}
	}
	return NewWANTransport(peerID)
}

// isCloseMessage 检测回复是否以 [CLOSE] 标记开头，表示对话应当结束
func isCloseMessage(content string) bool {
	trimmed := strings.TrimSpace(content)
	return strings.HasPrefix(trimmed, "[CLOSE]")
}

// sendViaTransport 通过 Transport 接口发送消息（含重试）
func sendViaTransport(t Transport, path string, payload map[string]interface{}) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		_, err := t.Send(path, payload)
		if err == nil {
			return nil
		}
		lastErr = err
		slog.Warn("sendViaTransport failed", "attempt", attempt+1, "path", path, "err", err)
		if attempt < 2 {
			time.Sleep(time.Duration(attempt+1) * 2 * time.Second)
		}
	}
	return lastErr
}

// SendViaPeer 通过 peer ID 发送消息（对外暴露，供 handler 包使用）
func SendViaPeer(peerID string, path string, payload interface{}) error {
	transport := GetTransportForPeer(peerID)
	_, err := transport.Send(path, payload)
	return err
}

// escapeJSON 转义字符串用于嵌入 JSON
func escapeJSON(s string) string {
	b, _ := json.Marshal(s)
	if len(b) >= 2 {
		return string(b[1 : len(b)-1])
	}
	return s
}
