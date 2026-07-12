package main

import (
	"context"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"lingxi-web-agent/config"
	webconn "lingxi-web-agent/connector"
	"lingxi-web-agent/db/mysql"
	whandler "lingxi-web-agent/handler"
	"lingxi-web-agent/middleware"
	websched "lingxi-web-agent/scheduler"

	"github.com/gin-gonic/gin"
)

const buildVersion = "2026-07-12T22:20-card-content-truncation"

func main() {
	slog.Info("[lingxi-web] starting", "build_version", buildVersion)
	cfg := config.Load()
	if cfg.MySQLDSN == "" {
		slog.Error("MYSQL_DSN 未设置")
		os.Exit(1)
	}
	if err := mysql.Init(cfg.MySQLDSN); err != nil {
		slog.Error("MySQL 初始化失败", "err", err)
		os.Exit(1)
	}
	defer mysql.Close()

	st := mysql.New(mysql.DB)
	whandler.InitWeb(cfg, st)
	go whandler.WebBootstrapInstalledSkills()

	if err := whandler.BootstrapAdmin(context.Background()); err != nil {
		slog.Warn("admin bootstrap", "err", err)
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.MaxMultipartMemory = 32 << 20
	r.Use(middleware.WebCORS())
	r.Use(whandler.WebBodySizeLimit(64 << 20))

	// IM 连接器运行时引擎初始化
	webconn.InitManager(r)
	webconn.SetBroadcastFunc(func(event, data string) {
		whandler.WebBroadcastAll(event, data)
	})
	webconn.SetClaudeRunnerCtx(func(ctx context.Context, message string, sessionID int64, imagePaths []string) (string, int64, error) {
		return whandler.WebRunClaudeSyncCtx(ctx, 0, message, sessionID, imagePaths)
	})
	webconn.SetClaudeStreamRunnerCtx(func(ctx context.Context, message string, sessionID int64, imagePaths []string, onChunk func(string, bool)) (int64, error) {
		return whandler.WebRunClaudeStreamingCtx(ctx, 0, message, sessionID, imagePaths, onChunk)
	})
	webconn.SetClaudeStreamRunnerCtxExt(func(ctx context.Context, message string, sessionID int64, imagePaths []string, onEvent func(webconn.StreamKind, string, bool)) (int64, error) {
		return whandler.WebRunClaudeStreamingCtxExt(ctx, 0, message, sessionID, imagePaths, func(kind string, payload string, done bool) {
			onEvent(webconn.StreamKind(kind), payload, done)
		})
	})
	webconn.RunClaudeForTaskFunc = func(message string, sessionID int64) (string, int64, error) {
		return whandler.WebRunClaudeSync(0, message, sessionID, nil)
	}

	// 注入飞书用户白名单查询函数
	webconn.GetFeishuAllowedUsersFunc = whandler.GetFeishuAllowedUsers
	go whandler.LoadAllEnabledConnectors()

	// P2P 消息轮询引擎启动
	go whandler.InitAndStartP2PWatcher()

	// go-proxy 预启动：容器启动时就启动代理，避免首次请求 5s 启动延迟
	go whandler.PreStartGoProxy()

	// 定时任务调度器
	websched.Init(st, func(uid int64, message string, sessionID int64) (string, int64, error) {
		return whandler.WebRunClaudeSync(uid, message, sessionID, nil)
	}, func(event, data string) {
		whandler.WebBroadcastAll(event, data)
	})
	websched.Start()

	// 前端静态文件：优先使用外部目录，否则使用嵌入资源
	dist := cfg.FrontendDist
	useEmbed := dist == "" || dist == "embed"
	var embeddedFS fs.FS
	if useEmbed {
		var err error
		embeddedFS, err = EmbeddedFrontend()
		if err != nil {
			slog.Error("failed to load embedded frontend", "err", err)
			os.Exit(1)
		}
		slog.Info("serving frontend from embedded resources")
		r.StaticFS("/assets", http.FS(mustSub(embeddedFS, "assets")))
		for _, name := range []string{"favicon.svg", "favicon.ico", "logo.png", "logo.jpg"} {
			fname := name
			r.GET("/"+fname, func(c *gin.Context) {
				c.FileFromFS(fname, http.FS(embeddedFS))
			})
		}
	} else {
		slog.Info("serving frontend from disk", "dist", dist)
		r.Static("/assets", dist+"/assets")
		r.StaticFile("/favicon.svg", dist+"/favicon.svg")
		r.StaticFile("/favicon.ico", dist+"/favicon.ico")
		r.StaticFile("/logo.png", dist+"/logo.png")
		r.StaticFile("/logo.jpg", dist+"/logo.jpg")
	}
	r.Static("/api/uploads", whandler.WebUploadsPath())

	api := r.Group("/api")
	api.GET("/ping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	api.GET("/health", webHealth)

	// 公开认证
	whandler.RegisterAuthRoutes(api)

	// 公开配对（手机端尚无 JWT，需要在认证前访问）
	api.POST("/pair/complete", whandler.WebPairComplete)

	// 受保护 API（JWT）
	protected := api.Group("", middleware.RequireUser([]byte(cfg.JWTSecret)))
	registerWebRoutes(protected, cfg)

	// Admin
	whandler.RegisterAdminRoutes(api)

	// WS（JWT 验签，独立 Web Hub）
	r.GET("/ws", middleware.RequireUser([]byte(cfg.JWTSecret)), whandler.WebWsHandler)

	r.NoRoute(func(c *gin.Context) {
		if c.Request.Method != http.MethodGet {
			c.Status(http.StatusNotFound)
			return
		}
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/ws") {
			c.Status(http.StatusNotFound)
			return
		}
		if useEmbed {
			data, err := fs.ReadFile(embeddedFS, "index.html")
			if err != nil {
				c.Status(http.StatusNotFound)
				return
			}
			c.Data(http.StatusOK, "text/html; charset=utf-8", data)
		} else {
			c.File(filepath.Join(dist, "index.html"))
		}
	})

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: r}
	go func() {
		slog.Info("backend-web listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	<-ch
	websched.Stop()
	whandler.StopWebP2PWatcher()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func mustSub(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic("fs.Sub failed: " + err.Error())
	}
	return sub
}

func registerWebRoutes(api *gin.RouterGroup, _ config.Config) {
	// 会话
	api.GET("/sessions", whandler.ListSessions)
	api.POST("/sessions", whandler.CreateSession)
	api.PATCH("/sessions/:id", whandler.UpdateSession)
	api.DELETE("/sessions/:id", whandler.DeleteSession)
	api.POST("/sessions/batch-delete", whandler.BatchDeleteSessions)
	api.POST("/sessions/batch-export", whandler.WebBatchExportSessions)
	api.POST("/sessions/:id/agent", whandler.SetSessionAgent)
	api.GET("/sessions/:id/pending", whandler.WebGetPendingTask)
	api.DELETE("/sessions/:id/pending", whandler.WebClearPendingTask)
	api.GET("/sessions/:id/token-stats", whandler.WebGetSessionTokenStats)
	api.POST("/sessions/:id/summarize", whandler.WebSummarizeSession)

	// 消息
	api.GET("/sessions/:id/messages", whandler.ListMessages)
	api.GET("/messages/search", whandler.SearchMessages)
	api.PUT("/messages/:id", whandler.UpdateMessage)
	api.POST("/messages/:id/feedback", whandler.SetMessageFeedback)
	api.POST("/messages/:id/pin", whandler.WebToggleMessagePin)

	// 会话分叉
	api.POST("/sessions/:id/fork", whandler.WebForkSession)

	// 对话（独立 Web handler，多用户隔离）
	api.POST("/chat", whandler.WebChat)
	api.POST("/chat/abort", whandler.WebAbortChat)
	api.POST("/chat/batch", whandler.WebBatchChat)

	// 智能体
	api.GET("/agents", whandler.ListAgents)
	api.GET("/agents/:id", whandler.GetAgent)
	api.POST("/agents", whandler.UpsertAgent)
	api.POST("/agents/upload-avatar", whandler.WebUploadAgentAvatar)
	api.DELETE("/agents/:id", whandler.DeleteAgent)

	// 技能
	api.GET("/skills", whandler.ListSkills)
	api.POST("/skills/upload", whandler.WebUploadSkill)
	api.POST("/skills/batch-upload", whandler.WebBatchUploadSkills)
	api.POST("/skills/batch-export", whandler.WebBatchExportSkills)
	api.POST("/skills/generate/stream", whandler.WebGenerateSkillStream)
	api.POST("/skills/generate/confirm", whandler.WebConfirmGeneratedSkill)
	api.POST("/skills/from-git", whandler.WebFromGitScan)
	api.POST("/skills/from-git/install", whandler.WebFromGitInstall)
	api.GET("/skills/:id", whandler.GetSkill)
	api.DELETE("/skills/:id", whandler.DeleteSkill)
	api.POST("/skills/:id/install", whandler.WebInstallSkill)
	api.POST("/skills/:id/uninstall", whandler.WebUninstallSkill)
	api.GET("/skills/:id/content", whandler.WebGetSkillContent)
	api.PUT("/skills/:id/content", whandler.WebUpdateSkillContent)
	api.GET("/skills/:id/export", whandler.WebExportSkill)
	api.POST("/skills/batch-delete", whandler.WebBatchDeleteSkills)
	api.GET("/skills/marketplace", whandler.WebMarketplaceSearch)

	// 知识库
	api.GET("/knowledge", whandler.ListKnowledge)
	api.POST("/knowledge", whandler.WebUploadKnowledge)
	api.GET("/knowledge/:id", whandler.GetKnowledge)
	api.PUT("/knowledge/:id", whandler.WebUpdateKnowledge)
	api.DELETE("/knowledge/:id", whandler.DeleteKnowledge)
	api.GET("/knowledge/:id/preview", whandler.WebPreviewKnowledge)
	api.GET("/knowledge/categories", whandler.WebListKnowledgeCategories)
	api.POST("/knowledge/categories", whandler.WebCreateKnowledgeCategory)
	api.DELETE("/knowledge/categories/:id", whandler.WebDeleteKnowledgeCategory)
	api.POST("/knowledge/from-url", whandler.WebImportKnowledgeFromURL)
	api.POST("/knowledge/from-urls", whandler.WebBatchImportKnowledgeFromURLs)
	api.POST("/knowledge/batch-delete", whandler.WebBatchDeleteKnowledge)
	api.PATCH("/knowledge/:id/category", whandler.WebUpdateKnowledgeItemCategory)
	api.GET("/knowledge/index-status", func(c *gin.Context) { c.JSON(200, gin.H{"total_docs": 0, "total_chunks": 0, "status": "idle"}) })
	api.GET("/knowledge/watched-dirs", func(c *gin.Context) { c.JSON(200, []struct{}{}) })
	api.POST("/knowledge/watched-dirs", func(c *gin.Context) { c.JSON(501, gin.H{"error": "Web 版暂不支持文件夹监控"}) })
	api.DELETE("/knowledge/watched-dirs/:id", func(c *gin.Context) { c.JSON(501, gin.H{"error": "Web 版暂不支持文件夹监控"}) })
	api.GET("/knowledge/embedding-config", func(c *gin.Context) { c.JSON(200, gin.H{"api_url": "", "model_name": ""}) })
	api.PUT("/knowledge/embedding-config", func(c *gin.Context) { c.JSON(501, gin.H{"error": "Web 版暂不支持嵌入配置"}) })
	api.POST("/knowledge/reindex", func(c *gin.Context) { c.JSON(501, gin.H{"error": "Web 版暂不支持重建索引"}) })
	api.GET("/knowledge/search", func(c *gin.Context) { c.JSON(200, gin.H{"results": []struct{}{}}) })

	// MCP
	api.GET("/mcp", whandler.ListMCPServers)
	api.POST("/mcp", whandler.UpsertMCPServer)
	api.DELETE("/mcp/:id", whandler.DeleteMCPServer)
	api.POST("/mcp/:id/toggle", whandler.ToggleMCPServer)
	api.GET("/mcp/export", whandler.WebExportMCPConfig)

	// 记忆
	api.GET("/memories", whandler.ListMemories)
	api.POST("/memories", whandler.CreateMemory)
	api.DELETE("/memories/:id", whandler.DeleteMemory)
	api.DELETE("/memories/clear", whandler.ClearMemories)

	// 接入点
	api.GET("/providers", whandler.ListProviders)
	api.GET("/api-profiles", whandler.ListAPIProfiles)
	api.POST("/api-profiles", whandler.UpsertAPIProfile)
	api.DELETE("/api-profiles/:id", whandler.DeleteAPIProfile)
	api.POST("/api-profiles/:id/activate", whandler.ActivateAPIProfile)
	api.POST("/api-profiles/:id/test", whandler.WebTestAPIProfile)
	api.POST("/api-profiles/fetch-models", whandler.WebFetchModels)

	// runtime/active-secret（web 版不需要运行时推送密钥，返回空 OK）
	api.POST("/runtime/active-secret", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// 路由状态（Go 协议转换代理）
	api.GET("/router/status", whandler.WebGetRouterStatus)
	api.POST("/router/stop", whandler.WebStopRouter)

	// 用量
	api.GET("/usage", whandler.GetUsage)
	api.GET("/usage/quota", whandler.WebGetUsageQuota)

	// IM 连接器
	api.GET("/im-connectors", whandler.WebListIMConnectors)
	api.POST("/im-connectors", whandler.WebUpsertIMConnector)
	api.PUT("/im-connectors/:id/enable", whandler.WebEnableIMConnector)
	api.PUT("/im-connectors/:id/disable", whandler.WebDisableIMConnector)
	api.DELETE("/im-connectors/:id", whandler.WebDeleteIMConnector)
	api.POST("/im-connectors/:id/send", whandler.WebSendWebhookMessage)
	api.POST("/im-connectors/:id/test", whandler.WebTestWebhook)

	// IM 会话
	api.GET("/im-sessions", whandler.WebListIMSessions)
	api.GET("/im-dashboard", whandler.WebGetIMDashboardStats)
	api.DELETE("/im-sessions/:id", whandler.WebDeleteIMSession)

	// 飞书监听模式
	api.GET("/feishu-monitor/rules", whandler.WebListMonitorRules)
	api.POST("/feishu-monitor/rules", whandler.WebCreateMonitorRule)
	api.PUT("/feishu-monitor/rules/:id", whandler.WebUpdateMonitorRule)
	api.DELETE("/feishu-monitor/rules/:id", whandler.WebDeleteMonitorRule)
	api.PUT("/feishu-monitor/rules/:id/toggle", whandler.WebToggleMonitorRule)
	api.GET("/feishu-monitor/logs", whandler.WebListMonitorLogs)
	api.GET("/feishu-monitor/chats", whandler.WebListFeishuChats)

	// 飞书 Agent Teams 任务
	api.GET("/feishu-tasks", whandler.WebListFeishuTasks)
	api.GET("/feishu-tasks/:id", whandler.WebGetFeishuTask)
	api.POST("/feishu-tasks/:id/close", whandler.WebCloseFeishuTask)
	api.GET("/feishu-tasks/chat-members", whandler.WebListChatMembers)

	// 飞书用户白名单
	api.GET("/feishu-whitelist", whandler.GetFeishuWhitelistHandler)
	api.PUT("/feishu-whitelist", whandler.SetFeishuWhitelistHandler)

	// 自我进化
	api.GET("/agents/:id/evolution", whandler.WebGetEvolutionConfig)
	api.PUT("/agents/:id/evolution", whandler.WebSetEvolutionConfig)
	api.GET("/agents/:id/evolution/logs", whandler.WebListEvolutionLogs)
	api.DELETE("/agents/:id/evolution/logs", whandler.WebClearEvolutionLogs)
	api.GET("/evolution/logs", whandler.WebListAllEvolutionLogs)
	api.GET("/evolution/stats", whandler.WebGetEvolutionStats)
	api.DELETE("/evolution/logs/:id", whandler.WebDeleteEvolutionLog)
	api.POST("/evolution/logs/:id/revert", whandler.WebRevertEvolutionLog)
	api.POST("/agents/:id/evolution/extract", whandler.WebManualExtract)
	api.GET("/evolution/scanner-config", whandler.WebGetEvolutionScannerConfig)
	api.PUT("/evolution/scanner-config", whandler.WebUpdateEvolutionScannerConfig)

	// 记忆巩固（Dream）
	api.GET("/dream/config", whandler.WebGetDreamConfig)
	api.PUT("/dream/config", whandler.WebUpdateDreamConfig)
	api.GET("/dream/status", whandler.WebGetDreamStatus)
	api.POST("/dream/trigger", whandler.WebTriggerDream)
	api.GET("/agents/:id/dream/history", whandler.WebGetAgentDreamHistory)

	// 定时任务
	api.GET("/scheduled-tasks", whandler.WebListScheduledTasks)
	api.POST("/scheduled-tasks", whandler.WebCreateScheduledTask)
	api.PUT("/scheduled-tasks/:id", whandler.WebUpdateScheduledTask)
	api.DELETE("/scheduled-tasks/:id", whandler.WebDeleteScheduledTask)
	api.POST("/scheduled-tasks/:id/toggle", whandler.WebToggleScheduledTask)
	api.POST("/scheduled-tasks/:id/run", whandler.WebTriggerScheduledTask)
	api.GET("/scheduled-tasks/:id/runs", whandler.WebListScheduledTaskRuns)

	// 后台任务管理
	api.GET("/tasks", whandler.WebListTasks)
	api.DELETE("/tasks/:id", whandler.WebDeleteTask)

	// 主动式 Agent 配置
	api.GET("/proactive/config", whandler.WebGetProactiveConfig)
	api.PUT("/proactive/config", whandler.WebUpdateProactiveConfig)

	// 深度搜索
	api.POST("/search/deep", whandler.WebDeepSearch)

	// 备份导出
	api.GET("/backup/export", whandler.WebExportBackup)

	// H5 远程访问设置
	api.GET("/h5-access/settings", whandler.WebGetH5AccessSettings)
	api.PUT("/h5-access/settings", whandler.WebUpdateH5AccessSettings)
	api.GET("/h5-access/tokens", whandler.WebListH5Tokens)
	api.POST("/h5-access/tokens", whandler.WebGenerateH5Token)
	api.POST("/h5-access/tokens/:id/revoke", whandler.WebRevokeH5Token)
	api.DELETE("/h5-access/tokens/:id", whandler.WebDeleteH5Token)

	// H5 隧道（web 版 stub）
	api.GET("/h5-tunnel/status", whandler.WebGetH5TunnelStatus)
	api.POST("/h5-tunnel/enable", whandler.WebEnableH5Tunnel)

	// 手机 App 配对（pair/complete 在公开路由注册，这里不重复）
	api.POST("/pair/initiate", whandler.WebPairInitiate)
	api.POST("/pair/verify", whandler.WebPairVerify)
	api.GET("/pair/devices", whandler.WebListPairedDevices)
	api.DELETE("/pair/devices/:id", whandler.WebUnpairDevice)
	api.POST("/pair/devices/:id/rotate", whandler.WebRotateDeviceToken)
	api.POST("/pair/devices/:id/push-token", whandler.WebRegisterPushToken)
	api.POST("/pair/revoke-all", whandler.WebRevokeAllDevices)

	// 推送通知配置
	api.GET("/push/config", whandler.WebGetPushConfig)
	api.PUT("/push/config", whandler.WebSetPushConfig)
	api.POST("/push/test", whandler.WebTestPush)

	// P2P 消息轮询监听
	api.GET("/p2p-watch/targets", whandler.ListP2PWatchTargets)
	api.POST("/p2p-watch/targets", whandler.CreateP2PWatchTarget)
	api.PUT("/p2p-watch/targets/:id", whandler.UpdateP2PWatchTarget)
	api.DELETE("/p2p-watch/targets/:id", whandler.DeleteP2PWatchTarget)
	api.PUT("/p2p-watch/targets/:id/toggle", whandler.ToggleP2PWatchTarget)
	api.GET("/p2p-watch/status", whandler.GetP2PWatchStatusHandler)
	api.POST("/p2p-watch/test-poll", whandler.TestP2PPollHandler)

	// 合规：导出与删除（Web 专属）
	api.GET("/me/export", whandler.ExportUserData)
	api.DELETE("/me/account", whandler.DeleteAccount)
}

func webHealth(c *gin.Context) {
	stats := gin.H{"mysql": "ok", "mode": "web", "vector_tier": "mysql_blob_mvp"}
	if err := mysql.DB.PingContext(c.Request.Context()); err != nil {
		stats["mysql"] = "error"
		c.JSON(http.StatusServiceUnavailable, stats)
		return
	}
	var totalChunks int
	_ = mysql.DB.QueryRowContext(c.Request.Context(), `SELECT COUNT(1) FROM vector_chunks`).Scan(&totalChunks)
	stats["vector_chunks_total"] = totalChunks
	if totalChunks > 100000 {
		stats["vector_watermark"] = "level1_alert"
	}
	c.JSON(http.StatusOK, stats)
}
