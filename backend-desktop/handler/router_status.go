package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"lingxi-agent/router"
)

// GetRouterStatus GET /api/router/status
// 返回当前 bridge 进程状态（OpenAI 协议路由层）
func GetRouterStatus(c *gin.Context) {
	c.JSON(http.StatusOK, router.GetStatus())
}

// StopRouter POST /api/router/stop
// 强制关闭 bridge（调试 / 切换接入点时使用）
func StopRouter(c *gin.Context) {
	router.Stop()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
