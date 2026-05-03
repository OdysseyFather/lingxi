package handler

import (
	"net/http"
	"strconv"
	"time"

	"lingxi-agent/db"
	"lingxi-agent/scheduler"

	"github.com/gin-gonic/gin"
)

// ListScheduledTasks GET /api/scheduled-tasks
func ListScheduledTasks(c *gin.Context) {
	tasks, err := db.ListScheduledTasks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tasks)
}

// CreateScheduledTask POST /api/scheduled-tasks
func CreateScheduledTask(c *gin.Context) {
	var body struct {
		Name          string `json:"name"`
		Prompt        string `json:"prompt"`
		AgentID       int64  `json:"agent_id"`
		CronExpr      string `json:"cron_expr"`
		Stateful      bool   `json:"stateful"`
		NotifyDesktop *bool  `json:"notify_desktop"`
		Enabled       *bool  `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" || body.CronExpr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and cron_expr required"})
		return
	}

	notifyDesktop := true
	if body.NotifyDesktop != nil {
		notifyDesktop = *body.NotifyDesktop
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}

	nextRun := scheduler.CalcNextRun(body.CronExpr, time.Now())

	t := &db.ScheduledTask{
		Name:          body.Name,
		Prompt:        body.Prompt,
		AgentID:       body.AgentID,
		CronExpr:      body.CronExpr,
		Stateful:      body.Stateful,
		NotifyDesktop: notifyDesktop,
		Enabled:       enabled,
		NextRunAt:     nextRun,
	}
	id, err := db.CreateScheduledTask(t)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	t.ID = id
	c.JSON(http.StatusOK, t)
}

// UpdateScheduledTask PUT /api/scheduled-tasks/:id
func UpdateScheduledTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	existing, err := db.GetScheduledTask(id)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	var body struct {
		Name          *string `json:"name"`
		Prompt        *string `json:"prompt"`
		AgentID       *int64  `json:"agent_id"`
		CronExpr      *string `json:"cron_expr"`
		Stateful      *bool   `json:"stateful"`
		NotifyDesktop *bool   `json:"notify_desktop"`
		Enabled       *bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	if body.Name != nil {
		existing.Name = *body.Name
	}
	if body.Prompt != nil {
		existing.Prompt = *body.Prompt
	}
	if body.AgentID != nil {
		existing.AgentID = *body.AgentID
	}
	if body.CronExpr != nil {
		existing.CronExpr = *body.CronExpr
		existing.NextRunAt = scheduler.CalcNextRun(*body.CronExpr, time.Now())
	}
	if body.Stateful != nil {
		existing.Stateful = *body.Stateful
	}
	if body.NotifyDesktop != nil {
		existing.NotifyDesktop = *body.NotifyDesktop
	}
	if body.Enabled != nil {
		existing.Enabled = *body.Enabled
	}

	if err := db.UpdateScheduledTask(existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, existing)
}

// DeleteScheduledTask DELETE /api/scheduled-tasks/:id
func DeleteScheduledTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if err := db.DeleteScheduledTask(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

// ToggleScheduledTask POST /api/scheduled-tasks/:id/toggle
func ToggleScheduledTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if err := db.ToggleScheduledTask(id, body.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if body.Enabled {
		t, _ := db.GetScheduledTask(id)
		if t != nil && t.NextRunAt == nil {
			nextRun := scheduler.CalcNextRun(t.CronExpr, time.Now())
			t.NextRunAt = nextRun
			db.UpdateScheduledTask(t)
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// TriggerScheduledTask POST /api/scheduled-tasks/:id/run
func TriggerScheduledTask(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	t, err := db.GetScheduledTask(id)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	// 手动触发：设置 next_run_at 为现在，让 scheduler 下次 tick 执行
	now := time.Now()
	t.NextRunAt = &now
	db.UpdateScheduledTask(t)
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已触发，将在下次调度检查时执行"})
}

// ListScheduledTaskRuns GET /api/scheduled-tasks/:id/runs
func ListScheduledTaskRuns(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	runs, err := db.ListScheduledTaskRuns(id, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, runs)
}
