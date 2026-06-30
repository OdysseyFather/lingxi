package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
)

// ─── 飞书监听模式 API ────────────────────────────────────────────

// ListMonitorRules GET /api/feishu-monitor/rules?connector_id=X
func ListMonitorRules(c *gin.Context) {
	connID, _ := strconv.ParseInt(c.Query("connector_id"), 10, 64)
	if connID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connector_id is required"})
		return
	}
	rules, err := db.ListMonitorRules(connID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if rules == nil {
		rules = []db.FeishuMonitorRule{}
	}
	c.JSON(http.StatusOK, rules)
}

// CreateMonitorRule POST /api/feishu-monitor/rules
func CreateMonitorRule(c *gin.Context) {
	var rule db.FeishuMonitorRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if rule.ConnectorID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connector_id is required"})
		return
	}
	if rule.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	id, err := db.CreateMonitorRule(&rule)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rule.ID = id
	c.JSON(http.StatusOK, rule)
}

// UpdateMonitorRule PUT /api/feishu-monitor/rules/:id
func UpdateMonitorRule(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var rule db.FeishuMonitorRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rule.ID = id
	if err := db.UpdateMonitorRule(&rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteMonitorRule DELETE /api/feishu-monitor/rules/:id
func DeleteMonitorRule(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := db.DeleteMonitorRule(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ToggleMonitorRule PUT /api/feishu-monitor/rules/:id/toggle
func ToggleMonitorRule(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := db.ToggleMonitorRule(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListMonitorLogs GET /api/feishu-monitor/logs?connector_id=X&limit=50&before=ID
func ListMonitorLogs(c *gin.Context) {
	connID, _ := strconv.ParseInt(c.Query("connector_id"), 10, 64)
	if connID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connector_id is required"})
		return
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit <= 0 {
		limit = 50
	}
	before, _ := strconv.ParseInt(c.Query("before"), 10, 64)

	logs, err := db.ListMonitorLogs(connID, limit, before)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if logs == nil {
		logs = []db.FeishuMonitorLog{}
	}
	c.JSON(http.StatusOK, logs)
}

// ListFeishuChats GET /api/feishu-monitor/chats?connector_id=X
func ListFeishuChats(c *gin.Context) {
	connID, _ := strconv.ParseInt(c.Query("connector_id"), 10, 64)
	if connID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connector_id is required"})
		return
	}

	conn, err := db.GetIMConnectorByID(connID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}

	var cfg struct {
		AppID     string `json:"app_id"`
		AppSecret string `json:"app_secret"`
	}
	if err := json.Unmarshal([]byte(conn.Config), &cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid config: " + err.Error()})
		return
	}
	if cfg.AppID == "" || cfg.AppSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "app_id and app_secret are required in connector config"})
		return
	}

	client := lark.NewClient(cfg.AppID, cfg.AppSecret)

	type ChatInfo struct {
		ChatID      string `json:"chat_id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		OwnerID     string `json:"owner_id"`
		MemberCount int    `json:"member_count"`
	}

	var chats []ChatInfo
	pageToken := ""
	for {
		reqBuilder := larkim.NewListChatReqBuilder().PageSize(50)
		if pageToken != "" {
			reqBuilder.PageToken(pageToken)
		}
		req := reqBuilder.Build()
		resp, err := client.Im.Chat.List(context.Background(), req)
		if err != nil {
			slog.Warn("[feishu-monitor] list chats API error", "err", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "feishu API error: " + err.Error()})
			return
		}
		if !resp.Success() {
			slog.Warn("[feishu-monitor] list chats API failed", "code", resp.Code, "msg", resp.Msg)
			c.JSON(http.StatusInternalServerError, gin.H{"error": resp.Msg})
			return
		}

		for _, item := range resp.Data.Items {
			ci := ChatInfo{}
			if item.ChatId != nil {
				ci.ChatID = *item.ChatId
			}
			if item.Name != nil {
				ci.Name = *item.Name
			}
			if item.Description != nil {
				ci.Description = *item.Description
			}
			if item.OwnerIdType != nil {
				ci.OwnerID = *item.OwnerIdType
			}
			chats = append(chats, ci)
		}

		if resp.Data.HasMore != nil && *resp.Data.HasMore && resp.Data.PageToken != nil {
			pageToken = *resp.Data.PageToken
		} else {
			break
		}
	}

	if chats == nil {
		chats = []ChatInfo{}
	}
	c.JSON(http.StatusOK, chats)
}
