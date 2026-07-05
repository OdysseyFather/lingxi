package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	webconn "lingxi-web-agent/connector"
	"lingxi-web-agent/db/mysql"

	"github.com/gin-gonic/gin"
)

// ensureConnDB 设置 web connector 运行时使用的 ConnectorDB 为指定用户
func ensureConnDB(uid int64) {
	ms, ok := webStore.(*mysql.MySQLStore)
	if !ok {
		return
	}
	webconn.SetConnectorDB(webconn.NewMySQLConnectorDB(ms, uid, mysql.DB))
}

// LoadAllEnabledConnectors 启动时遍历所有用户的 enabled 连接器并启动
func LoadAllEnabledConnectors() {
	ms, ok := webStore.(*mysql.MySQLStore)
	if !ok {
		slog.Warn("[web-im] webStore is not MySQLStore, skip LoadAllEnabledConnectors")
		return
	}
	connectors, err := ms.ListAllEnabledIMConnectors(context.Background())
	if err != nil {
		slog.Warn("[web-im] LoadAllEnabledConnectors query error", "err", err)
		return
	}
	if len(connectors) == 0 {
		slog.Info("[web-im] no enabled connectors to load")
		return
	}
	slog.Info("[web-im] loading enabled connectors", "count", len(connectors))
	for _, c := range connectors {
		webconn.SetConnectorDB(webconn.NewMySQLConnectorDB(ms, c.UserID, mysql.DB))
		if startErr := webconn.GlobalManager.StartWithAgentAndID(c.Platform, c.Config, c.AgentID, c.ID); startErr != nil {
			slog.Warn("[web-im] start connector failed",
				"user_id", c.UserID, "platform", c.Platform, "connector_id", c.ID, "err", startErr)
		} else {
			slog.Info("[web-im] connector started",
				"user_id", c.UserID, "platform", c.Platform, "connector_id", c.ID)
		}
	}
}

// imStore 是 IM 相关方法的接口（webStore 实际类型 *mysql.MySQLStore 实现了这些方法）
type imStore interface {
	ListIMConnectors(ctx context.Context, userID int64) ([]mysql.IMConnector, error)
	GetIMConnectorByID(ctx context.Context, userID, id int64) (*mysql.IMConnector, error)
	UpsertIMConnector(ctx context.Context, userID, id int64, name, platform string, agentID int64, configJSON string) (int64, error)
	SetIMConnectorEnabled(ctx context.Context, userID, id int64, enabled bool) error
	DeleteIMConnectorByID(ctx context.Context, userID, id int64) error
	ListIMSessions(ctx context.Context, userID int64, platform string) ([]mysql.IMSessionInfo, error)
	GetIMDashboardStats(ctx context.Context, userID int64) (*mysql.IMDashboardStats, error)
	DeleteIMSession(ctx context.Context, userID, id int64) error
}

func getIMStore() imStore {
	return webStore.(imStore)
}

// ListIMConnectors GET /api/im-connectors
func WebListIMConnectors(c *gin.Context) {
	uid := userID(c)
	list, err := getIMStore().ListIMConnectors(c.Request.Context(), uid)
	if err != nil {
		slog.Warn("ListIMConnectors", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	type item struct {
		mysql.IMConnector
		Running bool `json:"running"`
	}
	result := make([]item, 0, len(list))
	for _, conn := range list {
		result = append(result, item{
			IMConnector: conn,
			Running:     webconn.GlobalManager != nil && webconn.GlobalManager.IsRunning(conn.Platform),
		})
	}
	c.JSON(http.StatusOK, result)
}

// UpsertIMConnector POST /api/im-connectors
func WebUpsertIMConnector(c *gin.Context) {
	uid := userID(c)
	var body struct {
		ID       int64       `json:"id"`
		Name     string      `json:"name"`
		Platform string      `json:"platform" binding:"required"`
		AgentID  int64       `json:"agent_id"`
		Config   interface{} `json:"config" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	configJSON, err := json.Marshal(body.Config)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid config"})
		return
	}

	if body.Name == "" {
		body.Name = body.Platform
	}

	id, err := getIMStore().UpsertIMConnector(c.Request.Context(), uid, body.ID, body.Name, body.Platform, body.AgentID, string(configJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

// EnableIMConnector PUT /api/im-connectors/:id/enable
func WebEnableIMConnector(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := getIMStore().GetIMConnectorByID(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}
	if err := getIMStore().SetIMConnectorEnabled(c.Request.Context(), uid, id, true); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	running := false
	if webconn.GlobalManager != nil {
		ensureConnDB(uid)
		if startErr := webconn.GlobalManager.StartWithAgentAndID(conn.Platform, conn.Config, conn.AgentID, conn.ID); startErr != nil {
			slog.Warn("[web-im] start connector failed", "platform", conn.Platform, "err", startErr)
		} else {
			running = true
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "running": running})
}

// DisableIMConnector PUT /api/im-connectors/:id/disable
func WebDisableIMConnector(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := getIMStore().GetIMConnectorByID(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}
	if err := getIMStore().SetIMConnectorEnabled(c.Request.Context(), uid, id, false); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if webconn.GlobalManager != nil {
		webconn.GlobalManager.Stop(conn.Platform)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "running": false})
}

// DeleteIMConnector DELETE /api/im-connectors/:id
func WebDeleteIMConnector(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := getIMStore().GetIMConnectorByID(c.Request.Context(), uid, id)
	if err == nil && webconn.GlobalManager != nil {
		webconn.GlobalManager.Stop(conn.Platform)
	}
	if err := getIMStore().DeleteIMConnectorByID(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListIMSessions GET /api/im-sessions
func WebListIMSessions(c *gin.Context) {
	uid := userID(c)
	platform := c.Query("platform")
	list, err := getIMStore().ListIMSessions(c.Request.Context(), uid, platform)
	if err != nil {
		slog.Warn("ListIMSessions", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// GetIMDashboardStats GET /api/im-dashboard
func WebGetIMDashboardStats(c *gin.Context) {
	uid := userID(c)
	stats, err := getIMStore().GetIMDashboardStats(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// DeleteIMSession DELETE /api/im-sessions/:id
func WebDeleteIMSession(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := getIMStore().DeleteIMSession(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebSendWebhookMessage POST /api/im-connectors/:id/send
func WebSendWebhookMessage(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := getIMStore().GetIMConnectorByID(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}
	if conn.Platform != "wecom_webhook" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only wecom_webhook supports direct send"})
		return
	}

	var body struct {
		MsgType       string   `json:"msg_type"`
		Content       string   `json:"content" binding:"required"`
		MentionedList []string `json:"mentioned_list"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	wh, err := webconn.NewWecomWebhookConnector(conn.Config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid webhook config: " + err.Error()})
		return
	}

	if body.MsgType == "markdown" {
		err = wh.SendMarkdown(body.Content)
	} else {
		err = wh.SendText(body.Content, body.MentionedList)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebTestWebhook POST /api/im-connectors/:id/test
func WebTestWebhook(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := getIMStore().GetIMConnectorByID(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}
	if conn.Platform != "wecom_webhook" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only wecom_webhook supports test"})
		return
	}

	wh, err := webconn.NewWecomWebhookConnector(conn.Config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid webhook config: " + err.Error()})
		return
	}

	err = wh.SendText("🤖 灵犀 AI Agent 连接测试成功！", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
