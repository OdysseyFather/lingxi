package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"lingxi-web-agent/db/mysql"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"

	"github.com/gin-gonic/gin"
)

// feishuMonitorStore 飞书监听相关方法接口
type feishuMonitorStore interface {
	ListMonitorRules(ctx context.Context, userID, connectorID int64) ([]mysql.FeishuMonitorRule, error)
	GetMonitorRule(ctx context.Context, userID, id int64) (*mysql.FeishuMonitorRule, error)
	CreateMonitorRule(ctx context.Context, userID int64, r *mysql.FeishuMonitorRule) (int64, error)
	UpdateMonitorRule(ctx context.Context, userID int64, r *mysql.FeishuMonitorRule) error
	DeleteMonitorRule(ctx context.Context, userID, id int64) error
	ToggleMonitorRule(ctx context.Context, userID, id int64) error
	InsertMonitorLog(ctx context.Context, userID int64, log *mysql.FeishuMonitorLog) error
	ListMonitorLogs(ctx context.Context, userID, connectorID int64, limit int, before int64) ([]mysql.FeishuMonitorLog, error)
	GetIMConnectorByID(ctx context.Context, userID, id int64) (*mysql.IMConnector, error)
}

func getFeishuMonitorStore() feishuMonitorStore {
	return webStore.(feishuMonitorStore)
}

// WebListMonitorRules GET /api/feishu-monitor/rules?connector_id=X
func WebListMonitorRules(c *gin.Context) {
	uid := userID(c)
	connID, _ := strconv.ParseInt(c.Query("connector_id"), 10, 64)
	if connID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connector_id is required"})
		return
	}
	rules, err := getFeishuMonitorStore().ListMonitorRules(c.Request.Context(), uid, connID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if rules == nil {
		rules = []mysql.FeishuMonitorRule{}
	}
	c.JSON(http.StatusOK, rules)
}

// WebCreateMonitorRule POST /api/feishu-monitor/rules
func WebCreateMonitorRule(c *gin.Context) {
	uid := userID(c)
	var rule mysql.FeishuMonitorRule
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
	id, err := getFeishuMonitorStore().CreateMonitorRule(c.Request.Context(), uid, &rule)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rule.ID = id
	c.JSON(http.StatusOK, rule)
}

// WebUpdateMonitorRule PUT /api/feishu-monitor/rules/:id
func WebUpdateMonitorRule(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var rule mysql.FeishuMonitorRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rule.ID = id
	if err := getFeishuMonitorStore().UpdateMonitorRule(c.Request.Context(), uid, &rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebDeleteMonitorRule DELETE /api/feishu-monitor/rules/:id
func WebDeleteMonitorRule(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := getFeishuMonitorStore().DeleteMonitorRule(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebToggleMonitorRule PUT /api/feishu-monitor/rules/:id/toggle
func WebToggleMonitorRule(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := getFeishuMonitorStore().ToggleMonitorRule(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebListMonitorLogs GET /api/feishu-monitor/logs?connector_id=X&limit=50&before=ID
func WebListMonitorLogs(c *gin.Context) {
	uid := userID(c)
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

	logs, err := getFeishuMonitorStore().ListMonitorLogs(c.Request.Context(), uid, connID, limit, before)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if logs == nil {
		logs = []mysql.FeishuMonitorLog{}
	}
	c.JSON(http.StatusOK, logs)
}

// WebListFeishuChats GET /api/feishu-monitor/chats?connector_id=X
func WebListFeishuChats(c *gin.Context) {
	uid := userID(c)
	connID, _ := strconv.ParseInt(c.Query("connector_id"), 10, 64)
	if connID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connector_id is required"})
		return
	}

	conn, err := getFeishuMonitorStore().GetIMConnectorByID(c.Request.Context(), uid, connID)
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
			slog.Warn("[web-feishu-monitor] list chats API error", "err", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "feishu API error: " + err.Error()})
			return
		}
		if !resp.Success() {
			slog.Warn("[web-feishu-monitor] list chats API failed", "code", resp.Code, "msg", resp.Msg)
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
