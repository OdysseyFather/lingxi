package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RateLimitAPI per-user 60 req/min
func RateLimitAPI() gin.HandlerFunc {
	return func(c *gin.Context) {
		if webStore == nil {
			c.Next()
			return
		}
		uid, _ := c.Get("userID")
		userID, _ := uid.(int64)
		ok, err := webStore.CheckRateLimit(c.Request.Context(), userID, c.ClientIP(), "api", 60, 60)
		if err != nil || !ok {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "请求过于频繁"})
			return
		}
		c.Next()
	}
}
