package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"lingxi-core/store"
	"lingxi-web-agent/db/mysql"
)

// ChatRunner 由 main 包注入，执行一次 AI 对话并返回回复文本
type ChatRunner func(uid int64, message string, sessionID int64) (reply string, usedSessionID int64, err error)

// BroadcastFunc 由 main 包注入，向 WebSocket 广播事件
type BroadcastFunc func(event, data string)

var (
	runner    ChatRunner
	broadcast BroadcastFunc
	dbStore   *mysql.MySQLStore
	stopChan  chan struct{}
)

// Init 注入依赖
func Init(s *mysql.MySQLStore, chatRunner ChatRunner, broadcastFn BroadcastFunc) {
	dbStore = s
	runner = chatRunner
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
				slog.Info("[web-scheduler] stopped")
				return
			}
		}
	}()
	slog.Info("[web-scheduler] started", "interval", "15s")
}

func repairMissingNextRun() {
	if dbStore == nil {
		return
	}
	slog.Info("[web-scheduler] self-check done")
}

// Stop 停止调度循环
func Stop() {
	if stopChan != nil {
		close(stopChan)
	}
}

var heartbeatCounter int

func checkAndRun() {
	if dbStore == nil {
		return
	}
	heartbeatCounter++
	tasks, err := dbStore.GetAllDueScheduledTasks(context.Background())
	if err != nil {
		slog.Warn("[web-scheduler] query due tasks error", "err", err)
		return
	}
	if len(tasks) > 0 {
		slog.Info("[web-scheduler] due tasks found", "count", len(tasks))
	} else if heartbeatCounter%20 == 0 {
		slog.Info("[web-scheduler] heartbeat", "now", time.Now().Format(time.RFC3339))
	}
	for _, t := range tasks {
		go executeTask(t)
	}
}

// RunTaskNow 立即执行一个任务（由手动触发调用）
func RunTaskNow(t mysql.ScheduledTask) {
	executeTask(t)
}

func executeTask(t mysql.ScheduledTask) {
	slog.Info("[web-scheduler] executing task", "id", t.ID, "name", t.Name, "user_id", t.UserID)

	nextRun := CalcNextRun(t.CronExpr, time.Now())
	dbStore.UpdateScheduledTaskAfterRun(context.Background(), t.UserID, t.ID, nextRun)

	var sessionID int64
	ctx := context.Background()

	if t.Stateful && t.SessionID != nil && *t.SessionID > 0 {
		sessionID = *t.SessionID
	} else {
		title := fmt.Sprintf("[定时] %s", t.Name)
		if len([]rune(title)) > 30 {
			title = string([]rune(title)[:30]) + "…"
		}
		sess := &store.Session{
			Title:   title,
			AgentID: t.AgentID,
		}
		newID, err := dbStore.CreateSession(ctx, t.UserID, sess)
		if err != nil {
			slog.Warn("[web-scheduler] create session failed", "id", t.ID, "err", err)
			return
		}
		sessionID = newID
		if t.Stateful {
			dbStore.SetScheduledTaskSession(ctx, t.UserID, t.ID, sessionID)
		}
	}

	runID, err := dbStore.CreateScheduledTaskRun(ctx, t.UserID, t.ID, sessionID)
	if err != nil {
		slog.Warn("[web-scheduler] create run record failed", "err", err)
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
		dbStore.FinishScheduledTaskRun(ctx, t.UserID, runID, "failed", "runner not initialized")
		emit("scheduled_task_done", map[string]interface{}{
			"task_id": t.ID, "run_id": runID, "session_id": sessionID,
			"status": "failed", "summary": "runner not initialized",
		})
		return
	}

	reply, _, runErr := runner(t.UserID, t.Prompt, sessionID)
	if runErr != nil {
		slog.Warn("[web-scheduler] task run error", "id", t.ID, "err", runErr)
		dbStore.FinishScheduledTaskRun(ctx, t.UserID, runID, "failed", runErr.Error())
		emit("scheduled_task_done", map[string]interface{}{
			"task_id": t.ID, "run_id": runID, "session_id": sessionID,
			"status": "failed", "summary": runErr.Error(),
		})
	} else {
		summary := reply
		if len([]rune(summary)) > 200 {
			summary = string([]rune(summary)[:200]) + "…"
		}
		dbStore.FinishScheduledTaskRun(ctx, t.UserID, runID, "completed", summary)
		emit("scheduled_task_done", map[string]interface{}{
			"task_id": t.ID, "run_id": runID, "session_id": sessionID,
			"status": "completed", "summary": summary,
		})
	}

	slog.Info("[web-scheduler] task done", "id", t.ID, "next_run", nextRun)
}

// ─── CalcNextRun 工具函数（从桌面端 scheduler 复制） ────────────────

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
