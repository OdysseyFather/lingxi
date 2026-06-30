package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"lingxi-agent/connector"
	"lingxi-agent/db"
)

// ListIMConnectors GET /api/im-connectors
func ListIMConnectors(c *gin.Context) {
	list, err := db.ListIMConnectors()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	type item struct {
		db.IMConnector
		Running bool `json:"running"`
	}
	result := make([]item, 0, len(list))
	for _, conn := range list {
		result = append(result, item{
			IMConnector: conn,
			Running:     connector.GlobalManager != nil && connector.GlobalManager.IsRunning(conn.Platform),
		})
	}
	c.JSON(http.StatusOK, result)
}

// UpsertIMConnector POST /api/im-connectors
func UpsertIMConnector(c *gin.Context) {
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

	id, err := db.UpsertIMConnector(body.ID, body.Name, body.Platform, body.AgentID, string(configJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

// EnableIMConnector PUT /api/im-connectors/:id/enable
func EnableIMConnector(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := db.GetIMConnectorByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}
	if err := db.SetIMConnectorEnabled(id, true); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if connector.GlobalManager != nil {
		if err := connector.GlobalManager.StartWithAgentAndID(conn.Platform, conn.Config, conn.AgentID, conn.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db updated but start failed: " + err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "running": true})
}

// DisableIMConnector PUT /api/im-connectors/:id/disable
func DisableIMConnector(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := db.GetIMConnectorByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}
	if err := db.SetIMConnectorEnabled(id, false); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if connector.GlobalManager != nil {
		connector.GlobalManager.Stop(conn.Platform)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "running": false})
}

// DeleteIMConnector DELETE /api/im-connectors/:id
func DeleteIMConnector(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := db.GetIMConnectorByID(id)
	if err == nil && connector.GlobalManager != nil {
		connector.GlobalManager.Stop(conn.Platform)
	}
	if err := db.DeleteIMConnectorByID(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SendWebhookMessage POST /api/im-connectors/:id/send
func SendWebhookMessage(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := db.GetIMConnectorByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}
	if conn.Platform != "wecom_webhook" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only wecom_webhook supports direct send"})
		return
	}

	var body struct {
		MsgType      string   `json:"msg_type"`
		Content      string   `json:"content" binding:"required"`
		MentionedList []string `json:"mentioned_list"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	wh, err := connector.NewWecomWebhookConnector(conn.Config)
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

// TestWebhook POST /api/im-connectors/:id/test
func TestWebhook(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	conn, err := db.GetIMConnectorByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}
	if conn.Platform != "wecom_webhook" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only wecom_webhook supports test"})
		return
	}

	wh, err := connector.NewWecomWebhookConnector(conn.Config)
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
