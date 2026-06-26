package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"community-server/config"
	"community-server/db"
	"community-server/handler"
	"community-server/logger"

	"github.com/gin-gonic/gin"
)

func main() {
	logger.Init()
	cfg := config.Get()
	db.Init()

	// 注入信令服务器地址给 invocation handler
	handler.SetSignalingServer(cfg.Tunnel.SignalingServer)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.MaxMultipartMemory = 64 << 20 // 64 MB

	// CORS：允许任何来源（社区平台对外开放）
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// 静态文件：Bundle 下载 + 头像
	r.Static("/static/bundles", cfg.Storage.BundlesDir)
	r.Static("/static/avatars", cfg.Storage.AvatarsDir)

	api := r.Group("/community")

	// ── 公开端点（无需登录）──────────────────────────────────────
	api.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true, "service": "lingxi-community", "time": time.Now().Unix()})
	})

	// 匿名注册（不要求 token）
	api.POST("/auth/anon", handler.RegisterAnon)

	// Agent 浏览（公开）
	publicWithOptionalAuth := api.Group("")
	publicWithOptionalAuth.Use(handler.AuthMiddleware(true))
	{
		publicWithOptionalAuth.GET("/agents", handler.ListAgents)
		publicWithOptionalAuth.GET("/leaderboard", handler.Leaderboard)
		publicWithOptionalAuth.GET("/agents/:id", handler.GetAgent)
		publicWithOptionalAuth.GET("/agents/:id/ratings", handler.ListRatings)
		publicWithOptionalAuth.GET("/agents/:id/comments", handler.ListComments)
		publicWithOptionalAuth.GET("/agents/:id/bundle", handler.DownloadBundle)

		// 用户主页（公开）
		publicWithOptionalAuth.GET("/users/:id", handler.GetUser)
		publicWithOptionalAuth.GET("/users/:id/following", handler.ListFollowing)
		publicWithOptionalAuth.GET("/users/:id/followers", handler.ListFollowers)

		// 邀请码公开信息（公开，给调用方使用）
		publicWithOptionalAuth.GET("/invocations/:code", handler.GetInvocationInfo)
		publicWithOptionalAuth.POST("/invocations/:code/invoke", handler.InvokeAgent)
	}

	// ── 需要登录端点 ────────────────────────────────────────────
	authed := api.Group("")
	authed.Use(handler.AuthMiddleware(false))
	{
		// 用户资料
		authed.GET("/auth/me", handler.GetMe)
		authed.PUT("/auth/me", handler.UpdateMe)

		// Agent 发布/管理
		authed.POST("/agents", handler.PublishAgent)
		authed.PUT("/agents/:id", handler.UpdateAgent)
		authed.DELETE("/agents/:id", handler.DeleteAgent)
		authed.GET("/agents/mine", handler.ListMyAgents)

		// 评分
		authed.POST("/agents/:id/rate", handler.UpsertRating)

		// 评论
		authed.POST("/agents/:id/comments", handler.CreateComment)
		authed.DELETE("/comments/:id", handler.DeleteComment)

		// 关注
		authed.POST("/users/:id/follow", handler.FollowUser)
		authed.DELETE("/users/:id/follow", handler.UnfollowUser)

		// 邀请码管理
		authed.POST("/agents/:id/invocations", handler.CreateInvocation)
		authed.GET("/agents/:id/invocations", handler.ListAgentInvocations)
		authed.GET("/invocations/mine", handler.ListMyInvocations)
		authed.POST("/invocations/:code/toggle", handler.ToggleInvocation)
		authed.DELETE("/invocations/:code", handler.DeleteInvocation)

		// 调用日志（审计）
		authed.GET("/invocations/logs/mine", handler.ListInvocationLogs)
	}

	srv := &http.Server{
		Addr:    ":" + cfg.Server.Port,
		Handler: r,
	}

	go func() {
		slog.Info("community server listening", "port", cfg.Server.Port)
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
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server shutdown error", "err", err)
	}
	db.DB.Close()
	slog.Info("shutdown complete")
}
