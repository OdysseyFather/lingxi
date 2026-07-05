package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// GetUsage GET /api/usage?range=today|7d|30d
func GetUsage(c *gin.Context) {
	uid := userID(c)
	ctx := c.Request.Context()
	rng := c.DefaultQuery("range", "7d")
	days := rangeToDays(rng)
	since := time.Now().Add(-time.Duration(days) * 24 * time.Hour)

	summary, _ := webStore.SumUsageSince(ctx, uid, since)
	byDay, _ := webStore.GroupUsageByDay(ctx, uid, days)
	byModel, _ := webStore.GroupUsageByModel(ctx, uid, days)
	byAgent, _ := webStore.GroupUsageByAgent(ctx, uid, days)
	costTrend, _ := webStore.GroupUsageCostByDay(ctx, uid, days)
	recent, _ := webStore.ListRecentUsage(ctx, uid, 100)

	today := time.Now().Truncate(24 * time.Hour)
	todaySum, _ := webStore.SumUsageSince(ctx, uid, today)

	c.JSON(http.StatusOK, gin.H{
		"summary":    summary,
		"by_day":     byDay,
		"by_model":   byModel,
		"by_agent":   byAgent,
		"cost_trend": costTrend,
		"recent":     recent,
		"today":      todaySum,
	})
}

func rangeToDays(rng string) int {
	switch rng {
	case "today":
		return 1
	case "7d":
		return 7
	case "30d":
		return 30
	case "90d":
		return 90
	case "365d":
		return 365
	default:
		return 7
	}
}
