package scheduler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"lingxi-agent/db"
)

// ChatRunner 由 main 包注入，执行一次 AI 对话并返回回复文本
type ChatRunner func(message string, sessionID int64) (reply string, usedSessionID int64, err error)

// NotifyFunc 由 main 包注入，通过 WebSocket 发送桌面通知事件
type NotifyFunc func(taskName, summary string)

// BroadcastFunc 由 main 包注入，向 WebSocket 广播事件（用于运行时进度推送）
type BroadcastFunc func(event, data string)

var (
	runner    ChatRunner
	notify    NotifyFunc
	broadcast BroadcastFunc
	stopChan  chan struct{}
)

// Init 注入依赖
func Init(chatRunner ChatRunner, notifyFn NotifyFunc, broadcastFn BroadcastFunc) {
	runner = chatRunner
	notify = notifyFn
	broadcast = broadcastFn
}

func emit(event string, payload map[string]interface{}) {
	if broadcast == nil {
		return
	}
	b, _ := json.Marshal(payload)
	broadcast(event, string(b))
}

// Start 启动调度循环（后台 goroutine，每 15 秒检查一次到期任务）
func Start() {
	stopChan = make(chan struct{})

	// 启动自检：补齐 enabled=1 但 next_run_at 为空的任务，避免新装机/断电后任务永不触发
	repairMissingNextRun()

	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()

		checkAndRun()

		for {
			select {
			case <-ticker.C:
				checkAndRun()
			case <-stopChan:
				slog.Info("scheduler stopped")
				return
			}
		}
	}()
	slog.Info("scheduler started", "interval", "15s", "now", time.Now().Format(time.RFC3339))
}

// repairMissingNextRun 启动时扫描所有 enabled 任务，补齐 next_run_at 为空的项
func repairMissingNextRun() {
	tasks, err := db.ListScheduledTasks()
	if err != nil {
		slog.Warn("scheduler repair: list tasks failed", "err", err)
		return
	}
	now := time.Now()
	repaired := 0
	for _, t := range tasks {
		if !t.Enabled {
			continue
		}
		if t.NextRunAt == nil {
			next := CalcNextRun(t.CronExpr, now)
			if next != nil {
				db.SetScheduledTaskNextRun(t.ID, next)
				repaired++
			}
		}
	}
	slog.Info("scheduler self-check", "total", len(tasks), "repaired_next_run", repaired)
}

// Stop 停止调度循环
func Stop() {
	if stopChan != nil {
		close(stopChan)
	}
}

// heartbeatCounter 每 20 次 tick（5 分钟）输出一次心跳
var heartbeatCounter int

func checkAndRun() {
	heartbeatCounter++
	tasks, err := db.GetDueScheduledTasks()
	if err != nil {
		slog.Warn("scheduler query due tasks error", "err", err)
		return
	}
	if len(tasks) > 0 {
		slog.Info("scheduler tick: due tasks found", "count", len(tasks), "now", time.Now().Format(time.RFC3339))
	} else if heartbeatCounter%20 == 0 {
		// 每 5 分钟输出一次心跳，证明调度器在运行
		allTasks, _ := db.ListScheduledTasks()
		enabledCount := 0
		var nextDue string
		for _, t := range allTasks {
			if t.Enabled {
				enabledCount++
				if t.NextRunAt != nil && (nextDue == "" || t.NextRunAt.Format(time.RFC3339) < nextDue) {
					nextDue = t.NextRunAt.Format(time.RFC3339)
				}
			}
		}
		slog.Info("scheduler heartbeat", "enabled_tasks", enabledCount, "nearest_due", nextDue, "now", time.Now().Format(time.RFC3339))
	}
	for _, t := range tasks {
		go executeTask(t)
	}
}

// RunTaskNow 立即执行一个任务（由手动触发调用）
func RunTaskNow(t db.ScheduledTask) {
	executeTask(t)
}

func executeTask(t db.ScheduledTask) {
	slog.Info("executing scheduled task", "id", t.ID, "name", t.Name)

	// 立即更新 next_run_at，防止 15s 检查周期内重复触发
	nextRun := CalcNextRun(t.CronExpr, time.Now())
	db.UpdateScheduledTaskAfterRun(t.ID, nextRun)

	var sessionID int64

	if t.Stateful && t.SessionID != nil && *t.SessionID > 0 {
		sessionID = *t.SessionID
	} else {
		title := fmt.Sprintf("[定时] %s", t.Name)
		if len([]rune(title)) > 30 {
			title = string([]rune(title)[:30]) + "…"
		}
		res, err := db.DB.Exec(`INSERT INTO sessions (title, agent_id) VALUES (?, ?)`, title, t.AgentID)
		if err != nil {
			slog.Warn("create session for scheduled task", "id", t.ID, "err", err)
			return
		}
		sessionID, _ = res.LastInsertId()
		if t.Stateful {
			db.SetScheduledTaskSession(t.ID, sessionID)
		}
	}

	runID, err := db.CreateScheduledTaskRun(t.ID, sessionID)
	if err != nil {
		slog.Warn("create scheduled run record", "err", err)
		return
	}

	emit("scheduled_task_started", map[string]interface{}{
		"task_id":    t.ID,
		"task_name":  t.Name,
		"session_id": sessionID,
		"run_id":     runID,
		"started_at": time.Now().UnixMilli(),
	})

	if runner == nil {
		db.FinishScheduledTaskRun(runID, "failed", "runner not initialized")
		emit("scheduled_task_done", map[string]interface{}{
			"task_id": t.ID, "run_id": runID, "session_id": sessionID,
			"status": "failed", "summary": "runner not initialized",
		})
		return
	}

	reply, _, runErr := runner(t.Prompt, sessionID)
	if runErr != nil {
		slog.Warn("scheduled task run error", "id", t.ID, "err", runErr)
		db.FinishScheduledTaskRun(runID, "failed", runErr.Error())
		emit("scheduled_task_done", map[string]interface{}{
			"task_id": t.ID, "run_id": runID, "session_id": sessionID,
			"status": "failed", "summary": runErr.Error(),
		})
	} else {
		summary := reply
		if len([]rune(summary)) > 200 {
			summary = string([]rune(summary)[:200]) + "…"
		}
		db.FinishScheduledTaskRun(runID, "completed", summary)
		emit("scheduled_task_done", map[string]interface{}{
			"task_id": t.ID, "run_id": runID, "session_id": sessionID,
			"status": "completed", "summary": summary,
		})
	}

	// 桌面通知（附带 session_id 以便前端跳转查看结果）
	if t.NotifyDesktop && notify != nil {
		status := "完成"
		if runErr != nil {
			status = "失败"
		}
		notify(t.Name, fmt.Sprintf("定时任务「%s」已%s|session_id:%d", t.Name, status, sessionID))
	}

	slog.Info("scheduled task done", "id", t.ID, "next_run", nextRun)
}

// CalcNextRun 根据 cron 表达式计算下一次运行时间。
// 支持格式: "every_30m", "every_1h", "every_2h", "every_6h", "every_12h",
// "daily_HH:MM", "weekly_D_HH:MM", "monthly_DD_HH:MM"
// 或标准5段 cron: "分 时 日 月 周"
func CalcNextRun(cronExpr string, from time.Time) *time.Time {
	cronExpr = strings.TrimSpace(cronExpr)
	if cronExpr == "" {
		return nil
	}

	var next time.Time

	switch {
	case strings.HasPrefix(cronExpr, "every_"):
		dur := parseInterval(cronExpr[6:])
		if dur <= 0 {
			return nil
		}
		next = from.Add(dur)

	case strings.HasPrefix(cronExpr, "daily_"):
		hm := cronExpr[6:]
		h, m := parseHM(hm)
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
		h, m := parseHM(parts[1])
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
		h, m := parseHM(parts[1])
		next = time.Date(from.Year(), from.Month(), day, h, m, 0, 0, from.Location())
		if !next.After(from) {
			next = next.AddDate(0, 1, 0)
		}

	default:
		// 简易 5 段 cron 匹配（分 时 日 月 周）
		next = calcSimpleCron(cronExpr, from)
		if next.IsZero() {
			return nil
		}
	}

	return &next
}

func parseInterval(s string) time.Duration {
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

func parseHM(s string) (int, int) {
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return 0, 0
	}
	h, _ := strconv.Atoi(parts[0])
	m, _ := strconv.Atoi(parts[1])
	return h, m
}

// calcSimpleCron 处理标准 5 段 cron（分 时 日 月 周），从 from 往后逐分钟匹配，最多扫 2 天
func calcSimpleCron(expr string, from time.Time) time.Time {
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return time.Time{}
	}

	check := from.Add(time.Minute).Truncate(time.Minute)
	limit := from.Add(48 * time.Hour)

	for check.Before(limit) {
		if matchField(fields[0], check.Minute()) &&
			matchField(fields[1], check.Hour()) &&
			matchField(fields[2], check.Day()) &&
			matchField(fields[3], int(check.Month())) &&
			matchField(fields[4], int(check.Weekday())) {
			return check
		}
		check = check.Add(time.Minute)
	}
	return time.Time{}
}

func matchField(field string, val int) bool {
	if field == "*" {
		return true
	}
	// 逗号分隔
	for _, part := range strings.Split(field, ",") {
		part = strings.TrimSpace(part)
		// 范围 + 可选步进：1-5/2 或 1-5
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
		// 步进：*/5 或 3/10
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
		// 精确
		n, _ := strconv.Atoi(part)
		if n == val {
			return true
		}
	}
	return false
}
