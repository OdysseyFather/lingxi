package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"lingxi-web-agent/db/mysql"
	websched "lingxi-web-agent/scheduler"

	"github.com/gin-gonic/gin"
)

type scheduledStore interface {
	ListScheduledTasks(ctx context.Context, userID int64) ([]mysql.ScheduledTask, error)
	GetScheduledTask(ctx context.Context, userID, id int64) (*mysql.ScheduledTask, error)
	CreateScheduledTask(ctx context.Context, userID int64, t *mysql.ScheduledTask) (int64, error)
	UpdateScheduledTask(ctx context.Context, userID int64, t *mysql.ScheduledTask) error
	DeleteScheduledTask(ctx context.Context, userID, id int64) error
	ToggleScheduledTask(ctx context.Context, userID, id int64, enabled bool) error
	ListScheduledTaskRuns(ctx context.Context, userID, taskID int64, limit int) ([]mysql.ScheduledTaskRun, error)
}

func getSchedStore() scheduledStore {
	return webStore.(scheduledStore)
}

// WebListScheduledTasks GET /api/scheduled-tasks
func WebListScheduledTasks(c *gin.Context) {
	uid := userID(c)
	tasks, err := getSchedStore().ListScheduledTasks(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tasks)
}

// WebCreateScheduledTask POST /api/scheduled-tasks
func WebCreateScheduledTask(c *gin.Context) {
	uid := userID(c)
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

	nextRun := calcNextRun(body.CronExpr, time.Now())

	t := &mysql.ScheduledTask{
		Name:          body.Name,
		Prompt:        body.Prompt,
		AgentID:       body.AgentID,
		CronExpr:      body.CronExpr,
		Stateful:      body.Stateful,
		NotifyDesktop: notifyDesktop,
		Enabled:       enabled,
		NextRunAt:     nextRun,
	}
	id, err := getSchedStore().CreateScheduledTask(c.Request.Context(), uid, t)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	t.ID = id
	c.JSON(http.StatusOK, t)
}

// WebUpdateScheduledTask PUT /api/scheduled-tasks/:id
func WebUpdateScheduledTask(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	existing, err := getSchedStore().GetScheduledTask(c.Request.Context(), uid, id)
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
		existing.NextRunAt = calcNextRun(*body.CronExpr, time.Now())
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

	if err := getSchedStore().UpdateScheduledTask(c.Request.Context(), uid, existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, existing)
}

// WebDeleteScheduledTask DELETE /api/scheduled-tasks/:id
func WebDeleteScheduledTask(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if err := getSchedStore().DeleteScheduledTask(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

// WebToggleScheduledTask POST /api/scheduled-tasks/:id/toggle
func WebToggleScheduledTask(c *gin.Context) {
	uid := userID(c)
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
	if err := getSchedStore().ToggleScheduledTask(c.Request.Context(), uid, id, body.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if body.Enabled {
		t, _ := getSchedStore().GetScheduledTask(c.Request.Context(), uid, id)
		if t != nil && t.NextRunAt == nil {
			nextRun := calcNextRun(t.CronExpr, time.Now())
			t.NextRunAt = nextRun
			getSchedStore().UpdateScheduledTask(c.Request.Context(), uid, t)
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebListScheduledTaskRuns GET /api/scheduled-tasks/:id/runs
func WebListScheduledTaskRuns(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	runs, err := getSchedStore().ListScheduledTaskRuns(c.Request.Context(), uid, id, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, runs)
}

// WebTriggerScheduledTask POST /api/scheduled-tasks/:id/run
func WebTriggerScheduledTask(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	t, err := getSchedStore().GetScheduledTask(c.Request.Context(), uid, id)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	go websched.RunTaskNow(*t)
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已触发，正在后台执行"})
}

// ─── CalcNextRun 工具函数（从桌面端 scheduler 复制） ────────────────

func calcNextRun(cronExpr string, from time.Time) *time.Time {
	cronExpr = strings.TrimSpace(cronExpr)
	if cronExpr == "" {
		return nil
	}

	var next time.Time

	switch {
	case strings.HasPrefix(cronExpr, "every_"):
		dur := schedParseInterval(cronExpr[6:])
		if dur <= 0 {
			return nil
		}
		next = from.Add(dur)

	case strings.HasPrefix(cronExpr, "daily_"):
		hm := cronExpr[6:]
		h, m := schedParseHM(hm)
		next = time.Date(from.Year(), from.Month(), from.Day(), h, m, 0, 0, from.Location())
		if !next.After(from) {
			next = next.AddDate(0, 0, 1)
		}

	case strings.HasPrefix(cronExpr, "weekly_"):
		parts := strings.SplitN(cronExpr[7:], "_", 2)
		if len(parts) != 2 {
			return nil
		}
		dow, _ := strconv.Atoi(parts[0])
		h, m := schedParseHM(parts[1])
		next = time.Date(from.Year(), from.Month(), from.Day(), h, m, 0, 0, from.Location())
		for int(next.Weekday()) != dow || !next.After(from) {
			next = next.AddDate(0, 0, 1)
		}

	case strings.HasPrefix(cronExpr, "monthly_"):
		parts := strings.SplitN(cronExpr[8:], "_", 2)
		if len(parts) != 2 {
			return nil
		}
		day, _ := strconv.Atoi(parts[0])
		h, m := schedParseHM(parts[1])
		next = time.Date(from.Year(), from.Month(), day, h, m, 0, 0, from.Location())
		if !next.After(from) {
			next = next.AddDate(0, 1, 0)
		}

	default:
		next = schedCalcSimpleCron(cronExpr, from)
		if next.IsZero() {
			return nil
		}
	}

	return &next
}

func schedParseInterval(s string) time.Duration {
	s = strings.TrimSpace(s)
	if strings.HasSuffix(s, "m") {
		n, _ := strconv.Atoi(strings.TrimSuffix(s, "m"))
		return time.Duration(n) * time.Minute
	}
	if strings.HasSuffix(s, "h") {
		n, _ := strconv.Atoi(strings.TrimSuffix(s, "h"))
		return time.Duration(n) * time.Hour
	}
	return 0
}

func schedParseHM(s string) (int, int) {
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return 0, 0
	}
	h, _ := strconv.Atoi(parts[0])
	m, _ := strconv.Atoi(parts[1])
	return h, m
}

func schedCalcSimpleCron(expr string, from time.Time) time.Time {
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return time.Time{}
	}

	check := from.Add(time.Minute).Truncate(time.Minute)
	limit := from.Add(48 * time.Hour)

	for check.Before(limit) {
		if schedMatchField(fields[0], check.Minute()) &&
			schedMatchField(fields[1], check.Hour()) &&
			schedMatchField(fields[2], check.Day()) &&
			schedMatchField(fields[3], int(check.Month())) &&
			schedMatchField(fields[4], int(check.Weekday())) {
			return check
		}
		check = check.Add(time.Minute)
	}
	return time.Time{}
}

func schedMatchField(field string, val int) bool {
	if field == "*" {
		return true
	}
	for _, part := range strings.Split(field, ",") {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "-") {
			rangePart := part
			step := 1
			if si := strings.Index(part, "/"); si > 0 {
				rangePart = part[:si]
				step, _ = strconv.Atoi(part[si+1:])
				if step <= 0 {
					step = 1
				}
			}
			rng := strings.SplitN(rangePart, "-", 2)
			lo, _ := strconv.Atoi(rng[0])
			hi, _ := strconv.Atoi(rng[1])
			if val >= lo && val <= hi && (val-lo)%step == 0 {
				return true
			}
			continue
		}
		if strings.Contains(part, "/") {
			sp := strings.SplitN(part, "/", 2)
			step, _ := strconv.Atoi(sp[1])
			if step <= 0 {
				continue
			}
			base := 0
			if sp[0] != "*" {
				base, _ = strconv.Atoi(sp[0])
			}
			if val >= base && (val-base)%step == 0 {
				return true
			}
			continue
		}
		n, _ := strconv.Atoi(part)
		if n == val {
			return true
		}
	}
	return false
}
