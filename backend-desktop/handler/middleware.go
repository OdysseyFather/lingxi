package handler

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// LocalOriginCORS 限制 CORS 仅允许 localhost / Electron 来源
func LocalOriginCORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowed := origin == "" ||
			strings.HasPrefix(origin, "http://localhost:") ||
			strings.HasPrefix(origin, "http://127.0.0.1:") ||
			origin == "file://" ||
			strings.HasPrefix(origin, "app://") ||
			strings.HasPrefix(origin, "http://10.") ||
			strings.HasPrefix(origin, "http://172.") ||
			strings.HasPrefix(origin, "http://192.168.")

		if allowed && origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Pair-Token")
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Max-Age", "86400")
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// BodySizeLimit 限制请求体大小（字节），防止内存耗尽攻击
func BodySizeLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}

// ──── Per-key rate limiter ────────────────────────────────────────

type rateBucket struct {
	tokens    float64
	lastFill  time.Time
}

type RateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*rateBucket
	rate     float64 // tokens per second
	burst    int     // max bucket size
	lastGC   time.Time
}

func NewRateLimiter(perMinute int, burst int) *RateLimiter {
	return &RateLimiter{
		buckets: make(map[string]*rateBucket),
		rate:    float64(perMinute) / 60.0,
		burst:   burst,
		lastGC:  time.Now(),
	}
}

func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	if now.Sub(rl.lastGC) > 5*time.Minute {
		for k, b := range rl.buckets {
			if now.Sub(b.lastFill) > 10*time.Minute {
				delete(rl.buckets, k)
			}
		}
		rl.lastGC = now
	}

	b, ok := rl.buckets[key]
	if !ok {
		b = &rateBucket{tokens: float64(rl.burst), lastFill: now}
		rl.buckets[key] = b
	}

	elapsed := now.Sub(b.lastFill).Seconds()
	b.tokens += elapsed * rl.rate
	if b.tokens > float64(rl.burst) {
		b.tokens = float64(rl.burst)
	}
	b.lastFill = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// NexusRateLimit 对 Nexus 端点按来源 IP 限流
func NexusRateLimit(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP()
		if !limiter.Allow(key) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}
