package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"lingxi-agent/config"
	"lingxi-agent/connector"
	"lingxi-agent/db"
	"lingxi-agent/handler"
	"lingxi-agent/scheduler"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Get()
	db.Init()
	go handler.BootstrapInstalledSkills()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	dist := cfg.Server.FrontendDist
	r.Static("/assets", dist+"/assets")
	r.StaticFile("/favicon.svg", dist+"/favicon.svg")
	r.StaticFile("/icons.svg", dist+"/icons.svg")
	r.StaticFile("/logo.png", dist+"/logo.png")
	r.StaticFile("/logo.jpg", dist+"/logo.jpg")
	r.StaticFile("/favicon.ico", dist+"/favicon.ico")

	api := r.Group("/api")

	// 用户上传图片静态目录
	uploadsDir := os.Getenv("UPLOADS_PATH")
	if uploadsDir == "" {
		uploadsDir = filepath.Join(os.TempDir(), "lingxi-uploads")
	}
	os.MkdirAll(uploadsDir, 0755)
	api.Static("/uploads", uploadsDir)

	// 初始化 IM 连接器管理器（在路由组创建后立即初始化，wecom 会注册子路由）
	connector.InitManager(api)
	connector.SetClaudeRunner(handler.RunClaudeSync)
	go connector.GlobalManager.LoadFromDB()

	// 健康检查
	api.GET("/ping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	// 单机模式：无认证，所有接口直接可用
	api.GET("/sessions", handler.ListSessions)
	api.POST("/sessions", handler.CreateSession)
	api.PATCH("/sessions/:id", handler.UpdateSession)
	api.DELETE("/sessions/:id", handler.DeleteSession)
	api.GET("/sessions/:id/messages", handler.ListMessages)
	api.GET("/messages/search", handler.SearchMessages)
	api.PUT("/messages/:id", handler.UpdateMessage)
	api.POST("/messages/:id/feedback", handler.SetMessageFeedback)

	api.POST("/chat", handler.Chat)
	api.POST("/chat/batch", handler.BatchChat)
	api.POST("/chat/abort", handler.AbortChat)
	api.GET("/ws", handler.WsHandler)

	// 挂起任务
	api.GET("/sessions/:id/pending", handler.GetPendingTask)
	api.DELETE("/sessions/:id/pending", handler.ClearPendingTask)

	// 后台任务
	api.GET("/tasks", handler.ListTasks)
	api.DELETE("/tasks/:id", handler.DeleteTask)

	api.GET("/skills", handler.ListSkills)
	api.POST("/skills/upload", handler.UploadSkill)
	api.POST("/skills/batch-upload", handler.BatchUploadSkill)
	api.POST("/skills/generate/stream", handler.GenerateSkillStream)
	api.POST("/skills/generate/confirm", handler.ConfirmGeneratedSkill)
	api.GET("/skills/marketplace", handler.MarketplaceSearch)
	api.GET("/skills/marketplace/categories", handler.MarketplaceCategories)
	api.GET("/skills/marketplace/:namespace/:slug", handler.MarketplaceGetSkill)
	api.POST("/skills/marketplace/install", handler.MarketplaceInstall)
	api.GET("/skills/:id/content", handler.GetSkillContent)
	api.PUT("/skills/:id/content", handler.UpdateSkillContent)
	api.GET("/skills/:id/export", handler.ExportSkill)
	api.POST("/skills/:id/install", handler.InstallSkill)
	api.POST("/skills/:id/uninstall", handler.UninstallSkill)
	api.DELETE("/skills/:id", handler.DeleteSkill)

	// 知识库
	api.GET("/knowledge", handler.ListKnowledge)
	api.POST("/knowledge", handler.UploadKnowledge)
	api.PUT("/knowledge/:id", handler.UpdateKnowledge)
	api.DELETE("/knowledge/:id", handler.DeleteKnowledge)
	api.GET("/knowledge/:id/preview", handler.PreviewKnowledge)

	// IM 连接器管理
	api.GET("/im-connectors", handler.ListIMConnectors)
	api.POST("/im-connectors", handler.UpsertIMConnector)
	api.PUT("/im-connectors/:platform/enable", handler.EnableIMConnector)
	api.PUT("/im-connectors/:platform/disable", handler.DisableIMConnector)
	api.DELETE("/im-connectors/:platform", handler.DeleteIMConnector)

	// 模型 / 接入点 / AKSK 档案
	api.GET("/providers", handler.ListProviders)
	api.GET("/api-profiles", handler.ListAPIProfiles)
	api.POST("/api-profiles", handler.UpsertAPIProfile)
	api.DELETE("/api-profiles/:id", handler.DeleteAPIProfile)
	api.POST("/api-profiles/:id/activate", handler.ActivateAPIProfile)
	api.POST("/api-profiles/:id/test", handler.TestAPIProfile)

	// 用量
	api.GET("/usage", handler.GetUsage)
	api.GET("/usage/quota", handler.GetUsageQuota)

	// MCP 服务器
	api.GET("/mcp", handler.ListMCPServers)
	api.POST("/mcp", handler.UpsertMCPServer)
	api.DELETE("/mcp/:id", handler.DeleteMCPServer)
	api.POST("/mcp/:id/toggle", handler.ToggleMCPServer)
	api.GET("/mcp/export", handler.ExportMCPConfig)

	// 智能体工厂
	api.GET("/agents", handler.ListAgents)
	api.GET("/agents/:id", handler.GetAgent)
	api.POST("/agents", handler.UpsertAgent)
	api.DELETE("/agents/:id", handler.DeleteAgent)
	api.POST("/sessions/:id/agent", handler.SetSessionAgent)

	// 定时任务
	api.GET("/scheduled-tasks", handler.ListScheduledTasks)
	api.POST("/scheduled-tasks", handler.CreateScheduledTask)
	api.PUT("/scheduled-tasks/:id", handler.UpdateScheduledTask)
	api.DELETE("/scheduled-tasks/:id", handler.DeleteScheduledTask)
	api.POST("/scheduled-tasks/:id/toggle", handler.ToggleScheduledTask)
	api.POST("/scheduled-tasks/:id/run", handler.TriggerScheduledTask)
	api.GET("/scheduled-tasks/:id/runs", handler.ListScheduledTaskRuns)

	// Electron 启动时下发激活档案明文 token
	api.POST("/runtime/active-secret", handler.SetActiveSecret)

	// Bridge 路由层（OpenAI ↔ Anthropic 转换代理，由 supermemoryai/llm-bridge 实现）
	api.GET("/router/status", handler.GetRouterStatus)
	api.POST("/router/stop", handler.StopRouter)

	r.NoRoute(func(c *gin.Context) {
		if len(c.Request.URL.Path) >= 4 && c.Request.URL.Path[:4] == "/api" {
			c.Status(http.StatusNotFound)
			return
		}
		c.File(dist + "/index.html")
	})

	// 启动定时任务调度器
	scheduler.Init(handler.RunClaudeSync, func(taskName, summary string) {
		payload, _ := json.Marshal(map[string]string{
			"title": "定时任务 — " + taskName,
			"body":  summary,
		})
		handler.BroadcastWSEvent("desktop_notify", string(payload))
	})
	scheduler.Start()

	log.Printf("[main] desktop mode, listening on :%s", cfg.Server.Port)
	if err := r.Run(":" + cfg.Server.Port); err != nil {
		log.Fatalf("[main] run error: %v", err)
	}
}
