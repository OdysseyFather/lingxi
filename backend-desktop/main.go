package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"lingxi-agent/config"
	"lingxi-agent/connector"
	"lingxi-agent/db"
	"lingxi-agent/dream"
	"lingxi-agent/evolution"
	"lingxi-agent/grouploop"
	"lingxi-agent/handler"
	"lingxi-agent/logger"
	"lingxi-agent/nexus"
	"lingxi-agent/scheduler"
	"lingxi-agent/vectordb"
	"lingxi-agent/watcher"

	"github.com/gin-gonic/gin"
)

func main() {
	logger.Init()
	cfg := config.Get()
	db.Init()
	vectordb.Init()
	if cfg.DingTalk.ClientID != "" && cfg.DingTalk.ClientSecret != "" {
		db.SeedDingTalkOAuth(cfg.DingTalk.ClientID, cfg.DingTalk.ClientSecret)
	}
	go handler.BootstrapInstalledSkills()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.MaxMultipartMemory = 32 << 20 // 32 MB
	r.Use(handler.LocalOriginCORS())
	r.Use(handler.BodySizeLimit(64 << 20)) // 64 MB

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
	api.GET("/health", handler.HealthCheck)

	// 数据库备份
	api.GET("/backup/export", handler.ExportBackup)

	// ── 认证（SSO + 游客）────────────────────────────────────────
	api.GET("/auth/status", handler.HasUser)
	api.GET("/auth/me", handler.GetCurrentUser)
	api.POST("/auth/guest", handler.GuestLogin)
	api.POST("/auth/oauth/callback", handler.OAuthCallback)
	api.POST("/auth/logout", handler.Logout)
	api.GET("/auth/oauth-configs", handler.ListOAuthConfigs)
	api.POST("/auth/oauth-configs", handler.SaveOAuthConfig)

	// 单机模式：无认证，所有接口直接可用
	api.GET("/sessions", handler.ListSessions)
	api.POST("/sessions", handler.CreateSession)
	api.PATCH("/sessions/:id", handler.UpdateSession)
	api.DELETE("/sessions/:id", handler.DeleteSession)
	api.POST("/sessions/batch-delete", handler.BatchDeleteSessions)
	api.POST("/sessions/:id/fork", handler.ForkSession)
	api.POST("/sessions/:id/extract-knowledge", handler.ExtractSessionKnowledge)
	api.GET("/sessions/:id/messages", handler.ListMessages)
	api.GET("/messages/search", handler.SearchMessages)
	api.PUT("/messages/:id", handler.UpdateMessage)
	api.POST("/messages/:id/feedback", handler.SetMessageFeedback)

	api.POST("/chat", handler.Chat)
	api.POST("/chat/batch", handler.BatchChat)
	api.POST("/chat/abort", handler.AbortChat)
	api.POST("/chat/quick", handler.QuickChat)
	api.GET("/ws", handler.WsHandler)
	api.GET("/terminal/ws", handler.TerminalWsHandler)

	// 挂起任务
	api.GET("/sessions/:id/pending", handler.GetPendingTask)
	api.DELETE("/sessions/:id/pending", handler.ClearPendingTask)
	api.POST("/sessions/:id/restore", handler.RestoreSession)

	// 后台任务
	api.GET("/tasks", handler.ListTasks)
	api.DELETE("/tasks/:id", handler.DeleteTask)

	api.GET("/skills", handler.ListSkills)
	api.POST("/skills/install-github", handler.InstallDotSkillHandler)
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
	api.POST("/skills/batch-export", handler.BatchExportSkills)
	api.POST("/skills/:id/install", handler.InstallSkill)
	api.POST("/skills/:id/uninstall", handler.UninstallSkill)
	api.DELETE("/skills/:id", handler.DeleteSkill)
	api.POST("/skills/batch-delete", handler.BatchDeleteSkills)

	// 知识库
	api.GET("/knowledge", handler.ListKnowledge)
	api.POST("/knowledge", handler.UploadKnowledge)
	api.PUT("/knowledge/:id", handler.UpdateKnowledge)
	api.DELETE("/knowledge/:id", handler.DeleteKnowledge)
	api.POST("/knowledge/batch-delete", handler.BatchDeleteKnowledge)
	api.GET("/knowledge/:id/preview", handler.PreviewKnowledge)
	api.PATCH("/knowledge/:id/category", handler.UpdateKnowledgeItemCategory)
	api.GET("/knowledge/categories", handler.ListKnowledgeCategories)
	api.POST("/knowledge/categories", handler.CreateKnowledgeCategory)
	api.DELETE("/knowledge/categories/:id", handler.DeleteKnowledgeCategory)

	// 向量知识库（深度 RAG）
	api.POST("/knowledge/reindex", handler.ReindexKnowledge)
	api.GET("/knowledge/index-status", handler.GetIndexStatus)
	api.GET("/knowledge/search", handler.SemanticSearch)
	api.GET("/knowledge/watched-dirs", handler.ListWatchedDirs)
	api.POST("/knowledge/watched-dirs", handler.AddWatchedDir)
	api.DELETE("/knowledge/watched-dirs/:id", handler.RemoveWatchedDir)
	api.GET("/knowledge/embedding-config", handler.GetEmbeddingConfig)
	api.PUT("/knowledge/embedding-config", handler.SetEmbeddingConfig)

	// IM 连接器管理
	api.GET("/im-connectors", handler.ListIMConnectors)
	api.POST("/im-connectors", handler.UpsertIMConnector)
	api.PUT("/im-connectors/:id/enable", handler.EnableIMConnector)
	api.PUT("/im-connectors/:id/disable", handler.DisableIMConnector)
	api.DELETE("/im-connectors/:id", handler.DeleteIMConnector)
	api.POST("/im-connectors/:id/send", handler.SendWebhookMessage)
	api.POST("/im-connectors/:id/test", handler.TestWebhook)

	// 权限审批
	api.GET("/permission-rules", handler.ListPermissionRulesHandler)
	api.POST("/permission-rules", handler.CreatePermissionRuleHandler)
	api.DELETE("/permission-rules/:id", handler.DeletePermissionRuleHandler)
	api.GET("/approvals/pending", handler.ListPendingApprovalsHandler)
	api.GET("/approvals", handler.ListRecentApprovalsHandler)
	api.POST("/approvals/:id/review", handler.ReviewApprovalHandler)

	// H5 远程访问
	api.GET("/h5-access/settings", handler.GetH5AccessSettingsHandler)
	api.PUT("/h5-access/settings", handler.UpdateH5AccessSettingsHandler)
	api.GET("/h5-access/tokens", handler.ListH5TokensHandler)
	api.POST("/h5-access/tokens", handler.GenerateH5TokenHandler)
	api.POST("/h5-access/tokens/:id/revoke", handler.RevokeH5TokenHandler)
	api.DELETE("/h5-access/tokens/:id", handler.DeleteH5TokenHandler)
	api.POST("/h5-access/validate", handler.ValidateH5TokenHandler)
	api.GET("/h5-access/sessions", handler.H5SessionListHandler)
	api.GET("/h5-access/session/:sessionId/messages", handler.H5SessionMessagesHandler)
	api.GET("/h5-access/agents", handler.H5AgentsListHandler)

	// 模型 / 接入点 / AKSK 档案
	api.GET("/providers", handler.ListProviders)
	api.GET("/api-profiles", handler.ListAPIProfiles)
	api.POST("/api-profiles", handler.UpsertAPIProfile)
	api.DELETE("/api-profiles/:id", handler.DeleteAPIProfile)
	api.POST("/api-profiles/:id/activate", handler.ActivateAPIProfile)
	api.POST("/api-profiles/:id/test", handler.TestAPIProfile)
	api.POST("/api-profiles/fetch-models", handler.FetchModels)

	// 用量
	api.GET("/usage", handler.GetUsage)
	api.GET("/usage/quota", handler.GetUsageQuota)

	// MCP 服务器
	api.GET("/mcp", handler.ListMCPServers)
	api.POST("/mcp", handler.UpsertMCPServer)
	api.DELETE("/mcp/:id", handler.DeleteMCPServer)
	api.POST("/mcp/:id/toggle", handler.ToggleMCPServer)
	api.GET("/mcp/export", handler.ExportMCPConfig)

	// 智能体工厂（固定路径须在 :id 之前注册）
	api.GET("/agents", handler.ListAgents)
	api.POST("/agents", handler.UpsertAgent)
	api.POST("/agents/upload-avatar", handler.UploadAgentAvatar)
	api.GET("/agents/distill/status", handler.GetDistillStatus)
	api.POST("/agents/distill/stream", handler.DistillAgentStream)
	api.POST("/agents/distill/apply", handler.ApplyDistillResult)
	api.GET("/agents/distill/records", handler.ListDistillRecords)
	api.GET("/agents/distill/records/:id", handler.GetDistillRecordHandler)
	api.DELETE("/agents/distill/records/:id", handler.DeleteDistillRecordHandler)
	api.POST("/agents/distill/records/:id/apply", handler.ApplyDistillRecordHandler)
	api.GET("/agents/distill/records/:id/files/*filepath", handler.DownloadDistillRecordFile)
	api.GET("/agents/:id", handler.GetAgent)
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

	// 长期记忆
	api.GET("/memories", handler.ListMemories)
	api.POST("/memories", handler.CreateMemory)
	api.DELETE("/memories/clear", handler.ClearMemories)
	api.DELETE("/memories/:id", handler.DeleteMemory)
	api.POST("/messages/:id/pin", handler.ToggleMessagePin)

	// Screen Agent（屏幕操控）
	api.POST("/screen-agent/analyze", handler.ScreenAgentAnalyze)
	api.POST("/screen-agent/plan", handler.ScreenAgentPlan)
	api.POST("/screen-agent/step", handler.ScreenAgentExecuteStep)
	api.POST("/screen-agent/step-result", handler.ScreenAgentStepResult)
	api.POST("/screen-agent/abort", handler.ScreenAgentAbort)
	api.POST("/screen-agent/reset", handler.ScreenAgentReset)
	api.POST("/screen-agent/execute-plan", handler.ScreenAgentExecutePlan)
	api.POST("/screen-agent/confirm", handler.ScreenAgentConfirmStep)
	api.GET("/screen-agent/actions", handler.ListScreenActionsHandler)
	api.GET("/agents/:id/screen-config", handler.GetAgentScreenConfigHandler)
	api.PUT("/agents/:id/screen-config", handler.SetAgentScreenConfigHandler)

	// 语音识别（转发到 OpenAI 兼容 Whisper API）
	api.POST("/transcribe", handler.TranscribeAudio)

	// ── Project Nexus: Agent-to-Agent Communication ──────────────
	nexusLimiter := handler.NewRateLimiter(60, 20) // 60 req/min, burst 20
	nexusAPI := api.Group("/nexus", handler.NexusRateLimit(nexusLimiter))
	nexusAPI.GET("/info", handler.NexusInfo)
	nexusAPI.POST("/conversation/invite", handler.NexusReceiveConvInvite)
	nexusAPI.POST("/conversation/accept", handler.NexusReceiveConvAccept)
	nexusAPI.POST("/conversation/reject", handler.NexusReceiveConvReject)
	nexusAPI.POST("/conversation/message", handler.NexusReceiveMessage)
	nexusAPI.POST("/conversation/pause", handler.NexusReceivePause)
	nexusAPI.POST("/conversation/terminate", handler.NexusReceiveTerminate)
	nexusAPI.POST("/conversation/stream-token", handler.NexusReceiveStreamToken)
	nexusAPI.GET("/settings", handler.GetNexusSettings)
	nexusAPI.PUT("/settings", handler.UpdateNexusSettings)

	// ── 群聊 Nexus 接收侧 ───────────────────────────────────────
	nexusAPI.POST("/group/invite", handler.NexusReceiveGroupInvite)
	nexusAPI.POST("/group/join_ack", handler.NexusReceiveGroupJoinAck)
	nexusAPI.POST("/group/message", handler.NexusReceiveGroupMessage)
	nexusAPI.POST("/group/leave", handler.NexusReceiveGroupLeave)
	nexusAPI.POST("/group/stream_token", handler.NexusReceiveGroupStreamToken)
	nexusAPI.POST("/group/member_sync", handler.NexusReceiveGroupMemberSync)
	nexusAPI.POST("/group/recall", handler.NexusReceiveGroupRecall)

	// ── 群聊 HTTP API ─────────────────────────────────────────
	api.GET("/group-chats", handler.ListGroupChats)
	api.POST("/group-chats", handler.CreateGroupChat)
	api.POST("/group-chats/upload", handler.UploadGroupImage)
	api.GET("/group-chats/:id", handler.GetGroupChatDetail)
	api.GET("/group-chats/:id/messages", handler.ListGroupMessagesPagedHandler)
	api.POST("/group-chats/:id/post", handler.PostGroupMessage)
	api.POST("/group-chats/:id/messages/:msgId/recall", handler.RecallGroupMessageHandler)
	api.POST("/group-chats/:id/leave", handler.LeaveGroupChat)
	api.POST("/group-chats/:id/pause", handler.PauseGroupChat)
	api.POST("/group-chats/:id/resume", handler.ResumeGroupChat)
	api.POST("/group-chats/:id/terminate", handler.TerminateGroupChat)
	api.POST("/group-chats/:id/accept", handler.AcceptGroupInvite)
	api.POST("/group-chats/:id/reject", handler.RejectGroupInvite)
	api.POST("/group-chats/:id/members/add", handler.InviteGroupMembers)
	api.POST("/group-chats/:id/members/remove", handler.KickGroupMemberFromRoom)
	api.DELETE("/group-chats/:id", handler.DeleteGroupChatHandler)

	// ── 群聊 Agent 人格 ──────────────────────────────────────
	api.GET("/agents/:id/personality", handler.GetAgentPersonality)
	api.PUT("/agents/:id/personality", handler.UpsertAgentPersonality)

	api.GET("/peers", handler.ListPeers)
	// ── 广域网 (WAN) ───────────────────────────────────────────
	api.GET("/wan/peers", handler.ListWANPeers)
	api.GET("/wan/status", handler.WANStatus)

	api.POST("/a2a-conversations", handler.CreateA2AConversation)
	api.GET("/a2a-conversations", handler.ListA2AConversations)
	api.GET("/a2a-conversations/:id", handler.GetA2AConversation)
	api.POST("/a2a-conversations/:id/pause", handler.PauseA2AConversation)
	api.POST("/a2a-conversations/:id/takeover", handler.TakeoverA2AConversation)
	api.POST("/a2a-conversations/:id/terminate", handler.TerminateA2AConversation)
	api.POST("/a2a-conversations/:id/approve", handler.ApproveA2AConversation)
	api.POST("/a2a-conversations/:id/accept-remote", handler.AcceptRemoteConversation)
	api.POST("/a2a-conversations/:id/reject-remote", handler.RejectRemoteConversation)
	api.DELETE("/a2a-conversations/:id", handler.DeleteA2AConversation)
	api.GET("/agents/:id/nexus-config", handler.GetAgentNexusConfig)
	api.PUT("/agents/:id/nexus-config", handler.UpsertAgentNexusConfig)

	// ── 自我进化 ────────────────────────────────────────────────────
	api.GET("/agents/:id/evolution", handler.GetEvolutionConfig)
	api.PUT("/agents/:id/evolution", handler.SetEvolutionConfig)
	api.GET("/agents/:id/evolution/logs", handler.ListEvolutionLogs)
	api.DELETE("/agents/:id/evolution/logs", handler.ClearEvolutionLogs)
	api.POST("/agents/:id/evolution/extract", handler.ManualExtract)
	api.GET("/evolution/logs", handler.ListAllEvolutionLogs)
	api.GET("/evolution/stats", handler.GetEvolutionStats)
	api.DELETE("/evolution/logs/:id", handler.DeleteEvolutionLog)
	api.POST("/evolution/logs/:id/revert", handler.RevertEvolutionLog)
	api.GET("/evolution/scanner-config", handler.GetEvolutionScannerConfig)
	api.PUT("/evolution/scanner-config", handler.UpdateEvolutionScannerConfig)

	// ── 记忆巩固（Dream）───────────────────────────────────────────
	api.GET("/dream/config", handler.GetDreamConfig)
	api.PUT("/dream/config", handler.UpdateDreamConfig)
	api.GET("/dream/status", handler.GetDreamStatus)
	api.POST("/dream/trigger", handler.TriggerDream)
	api.GET("/agents/:id/dream/history", handler.GetAgentDreamHistory)

	// ── 文件浏览（代码视图）─────────────────────────────────────
	api.GET("/files/list", handler.ListDirectory)
	api.GET("/files/read", handler.ReadFileContent)
	api.PUT("/files/write", handler.WriteFileContent)
	api.GET("/files/project", handler.GetProjectInfo)
	api.GET("/files/search", handler.SearchFiles)
	api.GET("/files/search-names", handler.SearchFileNames)

	// Coding 模式专用 API
	api.GET("/coding/changes", handler.GetWorkspaceChanges)
	api.GET("/coding/diff", handler.GetFileDiff)
	api.GET("/coding/branch", handler.GetGitBranch)
	api.POST("/coding/chat", handler.CodingChat)
	api.POST("/coding/chat/answer-batch", handler.CodingChatAnswerBatch)
	api.POST("/coding/chat/permission-response", handler.CodingChatPermissionResponse)
	api.POST("/coding/checkpoint", handler.CreateCheckpoint)
	api.POST("/coding/rollback/:id", handler.RollbackCheckpoint)
	api.GET("/coding/checkpoints/:sessionId", handler.ListCheckpoints)
	api.GET("/coding/agents", handler.ListCodingAgents)
	api.POST("/coding/agents", handler.SaveCodingAgent)
	api.DELETE("/coding/agents/:id", handler.DeleteCodingAgent)
	api.PUT("/coding/agents/:id", handler.UpdateCodingAgent)
	api.GET("/coding/plugins", handler.GetCodingPlugins)
	api.PUT("/coding/plugins", handler.SaveCodingPlugins)
	api.GET("/coding/hooks-config", handler.GetCodingHooksConfigHandler)
	api.PUT("/coding/hooks-config", handler.UpdateCodingHooksConfigHandler)
	api.GET("/coding/prompt-config", handler.GetCodingPromptConfigHandler)
	api.PUT("/coding/prompt-config", handler.UpdateCodingPromptConfigHandler)
	api.GET("/coding/perm-config", handler.GetCodingPermConfigHandler)
	api.PUT("/coding/perm-config", handler.UpdateCodingPermConfigHandler)

	// Electron 启动时下发激活档案明文 token
	api.POST("/runtime/active-secret", handler.SetActiveSecret)

	// Bridge 路由层（OpenAI ↔ Anthropic 转换代理，由 supermemoryai/llm-bridge 实现）
	api.GET("/router/status", handler.GetRouterStatus)
	api.POST("/router/stop", handler.StopRouter)

	// H5 远程访问移动端页面
	r.GET("/h5", handler.ServeH5Page)

	r.NoRoute(func(c *gin.Context) {
		if len(c.Request.URL.Path) >= 4 && c.Request.URL.Path[:4] == "/api" {
			c.Status(http.StatusNotFound)
			return
		}
		c.File(dist + "/index.html")
	})

	// 注入向量索引广播函数
	vectordb.BroadcastFn = handler.BroadcastWSEvent

	// 启动 Nexus Agent-to-Agent 通信服务
	nexus.Init(handler.RunA2AStreamingTurn, handler.CreateA2ASession, handler.BroadcastWSEvent)
	nexus.SetRelayHandler(buildRelayHandler(r))
	nexus.Global.Start()

	// 群聊常驻 Agent 协程
	grouploop.Init(handler.SpeakInGroup)
	grouploop.BootAll()

	// 启动定时任务调度器
	scheduler.Init(handler.RunClaudeSync, func(taskName, summary string) {
		body := summary
		sessionID := ""
		if idx := strings.LastIndex(summary, "|session_id:"); idx >= 0 {
			body = summary[:idx]
			sessionID = summary[idx+len("|session_id:"):]
		}
		m := map[string]string{
			"title": "定时任务 — " + taskName,
			"body":  body,
		}
		if sessionID != "" {
			m["session_id"] = sessionID
		}
		payload, _ := json.Marshal(m)
		handler.BroadcastWSEvent("desktop_notify", string(payload))
	}, handler.BroadcastWSEvent)
	scheduler.Start()

	// 启动全局自我进化扫描器（兜底）
	evolution.Init(handler.RunEvolutionAnalysisExternal, handler.BuildConversationContextExternal, handler.BroadcastWSEvent)
	evolution.StartScanner()

	// 启动记忆巩固扫描器（Dream）
	dream.Init(handler.CallActiveLLMExternal, handler.BuildConversationContextExternal, handler.BroadcastWSEvent)
	dream.StartScanner()

	// 启动文件监控
	watcher.Start()

	backupStop := make(chan struct{})
	go handler.StartDailyBackup(backupStop)

	srv := &http.Server{
		Addr:    ":" + cfg.Server.Port,
		Handler: r,
	}

	go func() {
		slog.Info("desktop mode, listening", "port", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("listen error", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	close(backupStop)
	watcher.Stop()
	scheduler.Stop()
	dream.Stop()
	nexus.Global.Stop()
	grouploop.StopAll()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server shutdown error", "err", err)
	}
	db.DB.Close()
	slog.Info("shutdown complete")
}

// buildRelayHandler 构建通过信令服务器中继的消息处理函数
// 将 WAN relay 消息转换为对本地 /api/nexus/* 端点的直接调用
func buildRelayHandler(r *gin.Engine) nexus.RelayHandler {
	return func(fromPeerID string, path string, payload json.RawMessage) interface{} {
		fullPath := "/api/nexus" + path
		slog.Debug("relay received", "from", fromPeerID, "path", fullPath, "payloadLen", len(payload))

		body := payload
		if body == nil {
			body = []byte("{}")
		}

		summary := string(body)
		if len(summary) > 500 {
			summary = summary[:500] + "..."
		}
		slog.Debug("relay payload", "body", summary)

		w := &relayResponseWriter{headers: http.Header{}, body: []byte{}, status: 200}
		req, err := http.NewRequest("POST", fullPath, strings.NewReader(string(body)))
		if err != nil {
			slog.Error("relay create request error", "err", err)
			return map[string]interface{}{"error": err.Error()}
		}
		req.Header.Set("Content-Type", "application/json")

		r.ServeHTTP(w, req)
		slog.Debug("relay handled", "path", fullPath, "status", w.status, "bodyLen", len(w.body))

		if w.status >= 400 {
			slog.Warn("relay error", "from", fromPeerID, "path", fullPath, "status", w.status, "body", string(w.body))
			return map[string]interface{}{"error": string(w.body), "status": w.status}
		}

		var result interface{}
		if len(w.body) > 0 {
			json.Unmarshal(w.body, &result)
		}
		return result
	}
}

func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// relayResponseWriter 实现 http.ResponseWriter 接口，用于捕获中继调用的响应
type relayResponseWriter struct {
	headers http.Header
	body    []byte
	status  int
}

func (w *relayResponseWriter) Header() http.Header { return w.headers }
func (w *relayResponseWriter) Write(b []byte) (int, error) {
	w.body = append(w.body, b...)
	return len(b), nil
}
func (w *relayResponseWriter) WriteHeader(code int) { w.status = code }
