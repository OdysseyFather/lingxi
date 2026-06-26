package handler

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"community-server/db"
	"community-server/model"

	"github.com/gin-gonic/gin"
)

// CreateInvocation POST /community/agents/:id/invocations — 创建邀请码
func CreateInvocation(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	agentID := c.Param("id")
	a, err := db.GetAgentByID(agentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	if a.AuthorID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your agent"})
		return
	}

	var req struct {
		DailyLimit int    `json:"daily_limit"`
		ExpiresAt  *int64 `json:"expires_at"` // unix timestamp, 0/null=永久
	}
	c.ShouldBindJSON(&req)

	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt > 0 {
		t := time.Unix(*req.ExpiresAt, 0)
		expiresAt = &t
	}

	inv, err := db.CreateInvocation(agentID, uid, req.DailyLimit, expiresAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"invocation": inv})
}

// ListAgentInvocations GET /community/agents/:id/invocations — 某个 Agent 的所有邀请码
func ListAgentInvocations(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	agentID := c.Param("id")
	a, err := db.GetAgentByID(agentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	if a.AuthorID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your agent"})
		return
	}
	invs, err := db.ListInvocationsByAgent(agentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"invocations": invs})
}

// ListMyInvocations GET /community/invocations/mine — 我的邀请码
func ListMyInvocations(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	invs, err := db.ListInvocationsByIssuer(uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"invocations": invs})
}

// ToggleInvocation POST /community/invocations/:code/toggle — 启用/禁用
func ToggleInvocation(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	code := strings.ToUpper(c.Param("code"))
	inv, err := db.GetInvocation(code)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invocation not found"})
		return
	}
	if inv.IssuerID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your invocation"})
		return
	}
	var req struct {
		IsActive bool `json:"is_active"`
	}
	c.ShouldBindJSON(&req)
	if err := db.ToggleInvocation(code, req.IsActive); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteInvocation DELETE /community/invocations/:code — 删除
func DeleteInvocation(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	code := strings.ToUpper(c.Param("code"))
	inv, err := db.GetInvocation(code)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invocation not found"})
		return
	}
	if inv.IssuerID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your invocation"})
		return
	}
	if err := db.DeleteInvocation(code); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetInvocationInfo GET /community/invocations/:code — 公开查询邀请码信息（不暴露 issuer_id）
func GetInvocationInfo(c *gin.Context) {
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	inv, err := db.GetInvocation(code)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invocation not found"})
		return
	}
	if !inv.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "invocation disabled"})
		return
	}
	if inv.ExpiresAt != nil && inv.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusForbidden, gin.H{"error": "invocation expired"})
		return
	}
	// 关联 Agent（只返回公共字段）
	agent, err := db.GetAgentByID(inv.AgentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"code":        inv.Code,
		"agent_id":    inv.AgentID,
		"agent_name":  agent.Name,
		"daily_limit": inv.DailyLimit,
		"expires_at":  inv.ExpiresAt,
		"issuer": gin.H{
			"id":           agent.Author.ID,
			"username":     agent.Author.Username,
			"display_name": agent.Author.DisplayName,
			"avatar":       agent.Author.Avatar,
		},
	})
}

// InvokeAgent POST /community/invocations/:code/invoke — 调用 Agent
// 通过 h5_tunnel 转发到发布方实例本地 backend-desktop 的 /api/chat/quick
func InvokeAgent(c *gin.Context) {
	startTime := time.Now()
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))

	// 获取调用方信息
	callerID := CurrentUser(c)
	callerIP := c.ClientIP()

	// 查询邀请码
	inv, err := db.GetInvocation(code)
	if err != nil {
		db.LogInvocation(code, callerID, callerIP, false, "invocation not found", time.Since(startTime).Milliseconds())
		c.JSON(http.StatusNotFound, gin.H{"error": "invocation not found"})
		return
	}
	if !inv.IsActive {
		db.LogInvocation(code, callerID, callerIP, false, "invocation disabled", time.Since(startTime).Milliseconds())
		c.JSON(http.StatusForbidden, gin.H{"error": "invocation disabled"})
		return
	}
	if inv.ExpiresAt != nil && inv.ExpiresAt.Before(time.Now()) {
		db.LogInvocation(code, callerID, callerIP, false, "invocation expired", time.Since(startTime).Milliseconds())
		c.JSON(http.StatusForbidden, gin.H{"error": "invocation expired"})
		return
	}

	// 限流检查
	count, err := db.CountInvocationsToday(code)
	if err == nil && count >= inv.DailyLimit {
		db.LogInvocation(code, callerID, callerIP, false, "daily limit exceeded", time.Since(startTime).Milliseconds())
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":       "daily limit exceeded",
			"used":        count,
			"daily_limit": inv.DailyLimit,
		})
		return
	}

	// 获取发布方信息（查 issuer 即可）
	issuer, err := db.GetUserByID(inv.IssuerID)
	if err != nil {
		db.LogInvocation(code, callerID, callerIP, false, "issuer not found", time.Since(startTime).Milliseconds())
		c.JSON(http.StatusNotFound, gin.H{"error": "issuer not found"})
		return
	}

	// 查找发布方实例的 h5_tunnel token
	// 约定：发布方在灵犀客户端 bio 字段写入 "[tunnel:<token>]" 标记（同时也会展示在主页，便于核对）
	tunnelToken := extractTunnelToken(issuer)
	if tunnelToken == "" {
		db.LogInvocation(code, callerID, callerIP, false, "issuer not online (no tunnel token)", time.Since(startTime).Milliseconds())
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "agent owner has not enabled remote access (no h5_tunnel token)",
			"hint":  "发布方需要在灵犀客户端的 H5 远程访问中开启云端隧道",
		})
		return
	}

	// 读取调用请求体
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		db.LogInvocation(code, callerID, callerIP, false, "read body error: "+err.Error(), time.Since(startTime).Milliseconds())
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 转发到信令服务器的 tunnel 端点
	// tunnel URL 模式：<signaling_server>/tunnel/<token>/<path>
	// 发布方 backend-desktop 的快速对话端点是 /api/chat/quick
	signalingServer := getSignalingServer()
	tunnelURL := fmt.Sprintf("%s/tunnel/%s/api/chat/quick", signalingServer, tunnelToken)

	req, err := http.NewRequest("POST", tunnelURL, bytes.NewReader(body))
	if err != nil {
		db.LogInvocation(code, callerID, callerIP, false, "create request error: "+err.Error(), time.Since(startTime).Milliseconds())
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		db.LogInvocation(code, callerID, callerIP, false, "tunnel request error: "+err.Error(), time.Since(startTime).Milliseconds())
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "failed to reach agent owner's instance",
			"detail": err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	// 透传响应
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		db.LogInvocation(code, callerID, callerIP, false, fmt.Sprintf("upstream %d: %s", resp.StatusCode, string(respBody)), time.Since(startTime).Milliseconds())
		c.Data(resp.StatusCode, "application/json", respBody)
		return
	}

	// 成功
	db.LogInvocation(code, callerID, callerIP, true, "", time.Since(startTime).Milliseconds())

	// 透传响应体
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	c.Data(resp.StatusCode, contentType, respBody)
}

// ListInvocationLogs GET /community/invocations/logs/mine — 调用日志（审计）
func ListInvocationLogs(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	limit := 50
	logs, err := db.ListInvocationLogsByIssuer(uid, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// extractTunnelToken 从用户的 bio 字段提取 h5_tunnel token
// 格式约定：bio 字段包含 "[tunnel:xxxxx]" 标记表示发布方实例的 h5_tunnel token
func extractTunnelToken(user *model.User) string {
	if user == nil {
		return ""
	}
	return parseTunnelTokenFromBio(user.Bio)
}

// parseTunnelTokenFromBio 从 bio 中解析 [tunnel:xxx] 标记
func parseTunnelTokenFromBio(bio string) string {
	const prefix = "[tunnel:"
	const suffix = "]"
	start := strings.Index(bio, prefix)
	if start < 0 {
		return ""
	}
	start += len(prefix)
	end := strings.Index(bio[start:], suffix)
	if end < 0 {
		return ""
	}
	return bio[start : start+end]
}

// getSignalingServer 读取信令服务器地址（从环境变量或配置）
func getSignalingServer() string {
	// 优先级：环境变量 SIGNALING_SERVER > 配置文件
	// 在 main.go 中初始化时已通过 config.Get() 加载
	return signalingServerURL
}

// signalingServerURL 在 main.go 中初始化时赋值
var signalingServerURL = "https://lingxi-singaling-server.onrender.com"

// SetSignalingServer 设置信令服务器地址（main.go 启动时调用）
func SetSignalingServer(url string) {
	signalingServerURL = url
}
