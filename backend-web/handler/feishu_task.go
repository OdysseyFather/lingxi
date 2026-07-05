package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"lingxi-web-agent/db/mysql"

	"github.com/gin-gonic/gin"
)

// feishuTaskStore 飞书 Agent Teams 任务相关方法接口
type feishuTaskStore interface {
	ListTaskInstances(ctx context.Context, userID int64, status string, limit int) ([]mysql.FeishuTaskInstance, error)
	GetTaskInstance(ctx context.Context, userID, id int64) (*mysql.FeishuTaskInstance, error)
	CloseTaskInstance(ctx context.Context, userID, id int64) error
	GetIMConnectorByID(ctx context.Context, userID, id int64) (*mysql.IMConnector, error)
}

func getFeishuTaskStore() feishuTaskStore {
	return webStore.(feishuTaskStore)
}

// WebListFeishuTasks GET /api/feishu-tasks?status=MONITORING&limit=50
func WebListFeishuTasks(c *gin.Context) {
	uid := userID(c)
	status := c.Query("status")
	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit <= 0 {
		limit = 50
	}

	instances, err := getFeishuTaskStore().ListTaskInstances(c.Request.Context(), uid, status, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if instances == nil {
		instances = []mysql.FeishuTaskInstance{}
	}
	c.JSON(http.StatusOK, instances)
}

// WebGetFeishuTask GET /api/feishu-tasks/:id
func WebGetFeishuTask(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	inst, err := getFeishuTaskStore().GetTaskInstance(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, inst)
}

// WebCloseFeishuTask POST /api/feishu-tasks/:id/close
func WebCloseFeishuTask(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := getFeishuTaskStore().CloseTaskInstance(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "task closed"})
}

// WebListChatMembers GET /api/feishu-tasks/chat-members?connector_id=X&chat_id=Y
func WebListChatMembers(c *gin.Context) {
	uid := userID(c)
	connID, _ := strconv.ParseInt(c.Query("connector_id"), 10, 64)
	chatID := c.Query("chat_id")
	if connID == 0 || chatID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connector_id and chat_id are required"})
		return
	}

	conn, err := getFeishuTaskStore().GetIMConnectorByID(c.Request.Context(), uid, connID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}

	var cfg struct {
		AppID     string `json:"app_id"`
		AppSecret string `json:"app_secret"`
	}
	if err := json.Unmarshal([]byte(conn.Config), &cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid config"})
		return
	}

	token, err := webGetTenantAccessToken(cfg.AppID, cfg.AppSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get token: " + err.Error()})
		return
	}

	type MemberInfo struct {
		MemberID   string `json:"member_id"`
		MemberType string `json:"member_type"`
		Name       string `json:"name"`
		TenantKey  string `json:"tenant_key,omitempty"`
	}

	var members []MemberInfo
	pageToken := ""
	for {
		url := "https://open.feishu.cn/open-apis/im/v1/chats/" + chatID + "/members?member_id_type=open_id&page_size=50"
		if pageToken != "" {
			url += "&page_token=" + pageToken
		}

		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			slog.Warn("[web-feishu-task] list chat members HTTP error", "err", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "HTTP error: " + err.Error()})
			return
		}

		var result struct {
			Code int    `json:"code"`
			Msg  string `json:"msg"`
			Data struct {
				Items []struct {
					MemberID     string `json:"member_id"`
					MemberIDType string `json:"member_id_type"`
					MemberType   string `json:"member_type"`
					Name         string `json:"name"`
					TenantKey    string `json:"tenant_key"`
				} `json:"items"`
				PageToken string `json:"page_token"`
				HasMore   bool   `json:"has_more"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			resp.Body.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "decode error"})
			return
		}
		resp.Body.Close()

		if result.Code != 0 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Msg})
			return
		}

		for _, item := range result.Data.Items {
			members = append(members, MemberInfo{
				MemberID:   item.MemberID,
				MemberType: item.MemberType,
				Name:       item.Name,
				TenantKey:  item.TenantKey,
			})
		}

		if result.Data.HasMore && result.Data.PageToken != "" {
			pageToken = result.Data.PageToken
		} else {
			break
		}
	}

	if members == nil {
		members = []MemberInfo{}
	}
	c.JSON(http.StatusOK, members)
}

// webGetTenantAccessToken 通过 app_id/app_secret 获取 tenant_access_token
func webGetTenantAccessToken(appID, appSecret string) (string, error) {
	body, _ := json.Marshal(map[string]string{"app_id": appID, "app_secret": appSecret})
	resp, err := http.Post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
		"application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var result struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Code != 0 {
		return "", fmt.Errorf("code %d: %s", result.Code, result.Msg)
	}
	return result.TenantAccessToken, nil
}
