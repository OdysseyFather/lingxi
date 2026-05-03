package scheduler

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"lingxi-agent/db"
)

// ChatRunner 由 main 包注入，执行一次 AI 对话并返回回复文本
type ChatRunner func(message string, sessionID int64) (reply string, usedSessionID int64, err error)

// NotifyFunc 由 main 包注入，通过 WebSocket 发送桌面通知事件
type NotifyFunc func(taskName, summary string)

var (
	runner ChatRunner
	notify NotifyFunc
)

// Init 注入依赖
func Init(chatRunner ChatRunner, notifyFn NotifyFunc) {
	runner = chatRunner
	notify = notifyFn
}

// Start 启动调度循环（后台 goroutine，每分钟检查一次到期任务）
func Start() {
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()

		// 启动后立即检查一次
		checkAndRun()

		for range ticker.C {
			checkAndRun()
		}
	}()
	log.Println("[scheduler] started (interval=60s)")
}

func checkAndRun() {
	tasks, err := db.GetDueScheduledTasks()
	if err != nil {
		log.Printf("[scheduler] query due tasks: %v", err)
		return
	}
	for _, t := range tasks {
		go executeTask(t)
	}
}

func executeTask(t db.ScheduledTask) {
	log.Printf("[scheduler] executing task %d: %s", t.ID, t.Name)

	var sessionID int64

	if t.Stateful && t.SessionID != nil && *t.SessionID > 0 {
		sessionID = *t.SessionID
	} else {
		// 创建新会话
		title := fmt.Sprintf("[定时] %s", t.Name)
		if len([]rune(title)) > 30 {
			title = string([]rune(title)[:30]) + "…"
		}
		res, err := db.DB.Exec(`INSERT INTO sessions (title, agent_id) VALUES (?, ?)`, title, t.AgentID)
		if err != nil {
			log.Printf("[scheduler] create session for task %d: %v", t.ID, err)
			return
		}
		sessionID, _ = res.LastInsertId()
		if t.Stateful {
			db.SetScheduledTaskSession(t.ID, sessionID)
		}
	}

	// 创建执行记录
	runID, err := db.CreateScheduledTaskRun(t.ID, sessionID)
	if err != nil {
		log.Printf("[scheduler] create run record: %v", err)
		return
	}

	// 执行
	if runner == nil {
		db.FinishScheduledTaskRun(runID, "failed", "runner not initialized")
		return
	}

	reply, _, runErr := runner(t.Prompt, sessionID)
	if runErr != nil {
		log.Printf("[scheduler] task %d run error: %v", t.ID, runErr)
		db.FinishScheduledTaskRun(runID, "failed", runErr.Error())
	} else {
		summary := reply
		if len([]rune(summary)) > 200 {
			summary = string([]rune(summary)[:200]) + "…"
		}
		db.FinishScheduledTaskRun(runID, "completed", summary)
	}

	// 计算下次运行时间
	nextRun := CalcNextRun(t.CronExpr, time.Now())
	db.UpdateScheduledTaskAfterRun(t.ID, nextRun)

	// 桌面通知
	if t.NotifyDesktop && notify != nil {
		status := "完成"
		if runErr != nil {
			status = "失败"
		}
		notify(t.Name, fmt.Sprintf("定时任务「%s」已%s", t.Name, status))
	}

	log.Printf("[scheduler] task %d done, next_run=%v", t.ID, nextRun)
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
		// 范围
		if strings.Contains(part, "-") {
			rng := strings.SplitN(part, "-", 2)
			lo, _ := strconv.Atoi(rng[0])
			hi, _ := strconv.Atoi(rng[1])
			if val >= lo && val <= hi {
				return true
			}
			continue
		}
		// 步进
		if strings.Contains(part, "/") {
			sp := strings.SplitN(part, "/", 2)
			step, _ := strconv.Atoi(sp[1])
			if step > 0 && val%step == 0 {
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
