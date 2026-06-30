package db

import (
	"database/sql"
	"time"
)

// fmtTimeForSQLite 将 *time.Time 序列化为 UTC 文本，与 SQLite CURRENT_TIMESTAMP 一致
// 读取时 ncruces/go-sqlite3 默认按 UTC 解析回 time.Time，统一时区避免偏移
func fmtTimeForSQLite(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return t.UTC().Format("2006-01-02 15:04:05")
}

// ─── Scheduled Tasks ─────────────────────────────────────────────

type ScheduledTask struct {
	ID            int64      `json:"id"`
	Name          string     `json:"name"`
	Prompt        string     `json:"prompt"`
	AgentID       int64      `json:"agent_id"`
	CronExpr      string     `json:"cron_expr"`
	Stateful      bool       `json:"stateful"`
	SessionID     *int64     `json:"session_id"`
	NotifyDesktop bool       `json:"notify_desktop"`
	Enabled       bool       `json:"enabled"`
	LastRunAt     *time.Time `json:"last_run_at"`
	NextRunAt     *time.Time `json:"next_run_at"`
	RunCount      int        `json:"run_count"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type ScheduledTaskRun struct {
	ID         int64      `json:"id"`
	TaskID     int64      `json:"task_id"`
	SessionID  int64      `json:"session_id"`
	Status     string     `json:"status"`
	Summary    string     `json:"summary"`
	StartedAt  time.Time  `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
}

func scanScheduledTask(scanner interface{ Scan(...interface{}) error }) (*ScheduledTask, error) {
	var t ScheduledTask
	var stateful, notify, enabled int
	var sessionID sql.NullInt64
	var lastRun, nextRun sql.NullTime
	err := scanner.Scan(&t.ID, &t.Name, &t.Prompt, &t.AgentID, &t.CronExpr,
		&stateful, &sessionID, &notify, &enabled,
		&lastRun, &nextRun, &t.RunCount, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	t.Stateful = stateful == 1
	t.NotifyDesktop = notify == 1
	t.Enabled = enabled == 1
	if sessionID.Valid {
		v := sessionID.Int64
		t.SessionID = &v
	}
	if lastRun.Valid {
		v := lastRun.Time.Local()
		t.LastRunAt = &v
	}
	if nextRun.Valid {
		v := nextRun.Time.Local()
		t.NextRunAt = &v
	}
	return &t, nil
}

const schedCols = `id, name, prompt, agent_id, cron_expr, stateful, session_id,
	notify_desktop, enabled, last_run_at, next_run_at, run_count, created_at, updated_at`

func ListScheduledTasks() ([]ScheduledTask, error) {
	rows, err := DB.Query(`SELECT ` + schedCols + ` FROM scheduled_tasks ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ScheduledTask, 0)
	for rows.Next() {
		t, err := scanScheduledTask(rows)
		if err != nil {
			continue
		}
		out = append(out, *t)
	}
	return out, nil
}

func GetScheduledTask(id int64) (*ScheduledTask, error) {
	return scanScheduledTask(DB.QueryRow(`SELECT `+schedCols+` FROM scheduled_tasks WHERE id=?`, id))
}

func CreateScheduledTask(t *ScheduledTask) (int64, error) {
	stateful, notify, enabled := 0, 1, 1
	if t.Stateful {
		stateful = 1
	}
	if !t.NotifyDesktop {
		notify = 0
	}
	if !t.Enabled {
		enabled = 0
	}
	res, err := DB.Exec(`INSERT INTO scheduled_tasks
		(name, prompt, agent_id, cron_expr, stateful, notify_desktop, enabled, next_run_at)
		VALUES (?,?,?,?,?,?,?,?)`,
		t.Name, t.Prompt, t.AgentID, t.CronExpr, stateful, notify, enabled, fmtTimeForSQLite(t.NextRunAt))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdateScheduledTask(t *ScheduledTask) error {
	stateful, notify, enabled := 0, 1, 1
	if t.Stateful {
		stateful = 1
	}
	if !t.NotifyDesktop {
		notify = 0
	}
	if !t.Enabled {
		enabled = 0
	}
	_, err := DB.Exec(`UPDATE scheduled_tasks SET
		name=?, prompt=?, agent_id=?, cron_expr=?, stateful=?,
		notify_desktop=?, enabled=?, next_run_at=?, updated_at=CURRENT_TIMESTAMP
		WHERE id=?`,
		t.Name, t.Prompt, t.AgentID, t.CronExpr, stateful,
		notify, enabled, fmtTimeForSQLite(t.NextRunAt), t.ID)
	return err
}

func DeleteScheduledTask(id int64) error {
	DB.Exec(`DELETE FROM scheduled_task_runs WHERE task_id=?`, id)
	_, err := DB.Exec(`DELETE FROM scheduled_tasks WHERE id=?`, id)
	return err
}

func ToggleScheduledTask(id int64, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := DB.Exec(`UPDATE scheduled_tasks SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, v, id)
	return err
}

func UpdateScheduledTaskAfterRun(id int64, nextRunAt *time.Time) {
	DB.Exec(`UPDATE scheduled_tasks SET
		last_run_at=CURRENT_TIMESTAMP, next_run_at=?, run_count=run_count+1, updated_at=CURRENT_TIMESTAMP
		WHERE id=?`, fmtTimeForSQLite(nextRunAt), id)
}

// SetScheduledTaskNextRun 仅更新 next_run_at（启动自检/重新设置使用，不变更 last_run_at 与 run_count）
func SetScheduledTaskNextRun(id int64, nextRunAt *time.Time) {
	DB.Exec(`UPDATE scheduled_tasks SET next_run_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		fmtTimeForSQLite(nextRunAt), id)
}

func SetScheduledTaskSession(id, sessionID int64) {
	DB.Exec(`UPDATE scheduled_tasks SET session_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, sessionID, id)
}

func GetDueScheduledTasks() ([]ScheduledTask, error) {
	now := time.Now().Format("2006-01-02 15:04:05")
	rows, err := DB.Query(`SELECT `+schedCols+` FROM scheduled_tasks
		WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at <= ?
		ORDER BY next_run_at ASC`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ScheduledTask, 0)
	for rows.Next() {
		t, err := scanScheduledTask(rows)
		if err != nil {
			continue
		}
		out = append(out, *t)
	}
	return out, nil
}

// ─── Scheduled Task Runs ─────────────────────────────────────────

func CreateScheduledTaskRun(taskID, sessionID int64) (int64, error) {
	res, err := DB.Exec(`INSERT INTO scheduled_task_runs (task_id, session_id) VALUES (?,?)`, taskID, sessionID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func FinishScheduledTaskRun(id int64, status, summary string) {
	DB.Exec(`UPDATE scheduled_task_runs SET status=?, summary=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`,
		status, summary, id)
}

func ListScheduledTaskRuns(taskID int64, limit int) ([]ScheduledTaskRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := DB.Query(`SELECT id, task_id, session_id, status, summary, started_at, finished_at
		FROM scheduled_task_runs WHERE task_id=? ORDER BY started_at DESC LIMIT ?`, taskID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ScheduledTaskRun, 0)
	for rows.Next() {
		var r ScheduledTaskRun
		var fin sql.NullTime
		if err := rows.Scan(&r.ID, &r.TaskID, &r.SessionID, &r.Status, &r.Summary, &r.StartedAt, &fin); err != nil {
			continue
		}
		if fin.Valid {
			r.FinishedAt = &fin.Time
		}
		out = append(out, r)
	}
	return out, nil
}
