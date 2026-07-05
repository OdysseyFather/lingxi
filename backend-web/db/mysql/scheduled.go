package mysql

import (
	"context"
	"database/sql"
	"time"
)

// ScheduledTask Web 多租户版定时任务
type ScheduledTask struct {
	ID            int64      `json:"id"`
	UserID        int64      `json:"user_id"`
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

// ScheduledTaskRun 执行记录
type ScheduledTaskRun struct {
	ID         int64      `json:"id"`
	TaskID     int64      `json:"task_id"`
	SessionID  int64      `json:"session_id"`
	Status     string     `json:"status"`
	Summary    string     `json:"summary"`
	StartedAt  time.Time  `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
}

const schedCols = `id, user_id, name, prompt, agent_id, cron_expr, stateful, session_id,
	notify_desktop, enabled, last_run_at, next_run_at, run_count, created_at, updated_at`

func scanScheduledTask(scanner interface{ Scan(...interface{}) error }) (*ScheduledTask, error) {
	var t ScheduledTask
	var stateful, notify, enabled int
	var sessionID sql.NullInt64
	var lastRun, nextRun sql.NullTime
	err := scanner.Scan(&t.ID, &t.UserID, &t.Name, &t.Prompt, &t.AgentID, &t.CronExpr,
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
		v := lastRun.Time
		t.LastRunAt = &v
	}
	if nextRun.Valid {
		v := nextRun.Time
		t.NextRunAt = &v
	}
	return &t, nil
}

func (s *MySQLStore) ListScheduledTasks(ctx context.Context, userID int64) ([]ScheduledTask, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+schedCols+` FROM scheduled_tasks WHERE user_id=? ORDER BY created_at DESC`, userID)
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

func (s *MySQLStore) GetScheduledTask(ctx context.Context, userID, id int64) (*ScheduledTask, error) {
	return scanScheduledTask(s.db.QueryRowContext(ctx,
		`SELECT `+schedCols+` FROM scheduled_tasks WHERE user_id=? AND id=?`, userID, id))
}

func (s *MySQLStore) CreateScheduledTask(ctx context.Context, userID int64, t *ScheduledTask) (int64, error) {
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
	var nextRun interface{}
	if t.NextRunAt != nil {
		nextRun = t.NextRunAt.UTC().Format("2006-01-02 15:04:05")
	}
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO scheduled_tasks
		(user_id, name, prompt, agent_id, cron_expr, stateful, notify_desktop, enabled, next_run_at)
		VALUES (?,?,?,?,?,?,?,?,?)`,
		userID, t.Name, t.Prompt, t.AgentID, t.CronExpr, stateful, notify, enabled, nextRun)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) UpdateScheduledTask(ctx context.Context, userID int64, t *ScheduledTask) error {
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
	var nextRun interface{}
	if t.NextRunAt != nil {
		nextRun = t.NextRunAt.UTC().Format("2006-01-02 15:04:05")
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE scheduled_tasks SET
		name=?, prompt=?, agent_id=?, cron_expr=?, stateful=?,
		notify_desktop=?, enabled=?, next_run_at=?, updated_at=CURRENT_TIMESTAMP
		WHERE user_id=? AND id=?`,
		t.Name, t.Prompt, t.AgentID, t.CronExpr, stateful,
		notify, enabled, nextRun, userID, t.ID)
	return err
}

func (s *MySQLStore) DeleteScheduledTask(ctx context.Context, userID, id int64) error {
	s.db.ExecContext(ctx, `DELETE FROM scheduled_task_runs WHERE user_id=? AND task_id=?`, userID, id)
	_, err := s.db.ExecContext(ctx, `DELETE FROM scheduled_tasks WHERE user_id=? AND id=?`, userID, id)
	return err
}

func (s *MySQLStore) ToggleScheduledTask(ctx context.Context, userID, id int64, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE scheduled_tasks SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`, v, userID, id)
	return err
}

func (s *MySQLStore) UpdateScheduledTaskAfterRun(ctx context.Context, userID, id int64, nextRunAt *time.Time) {
	var nextRun interface{}
	if nextRunAt != nil {
		nextRun = nextRunAt.UTC().Format("2006-01-02 15:04:05")
	}
	s.db.ExecContext(ctx,
		`UPDATE scheduled_tasks SET
		last_run_at=CURRENT_TIMESTAMP, next_run_at=?, run_count=run_count+1, updated_at=CURRENT_TIMESTAMP
		WHERE user_id=? AND id=?`, nextRun, userID, id)
}

func (s *MySQLStore) SetScheduledTaskSession(ctx context.Context, userID, id, sessionID int64) {
	s.db.ExecContext(ctx,
		`UPDATE scheduled_tasks SET session_id=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`, sessionID, userID, id)
}

func (s *MySQLStore) GetDueScheduledTasks(ctx context.Context, userID int64) ([]ScheduledTask, error) {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+schedCols+` FROM scheduled_tasks
		WHERE user_id=? AND enabled=1 AND next_run_at IS NOT NULL AND next_run_at <= ?
		ORDER BY next_run_at ASC`, userID, now)
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

// GetAllDueScheduledTasks 跨用户查询所有到期任务（调度器用）
func (s *MySQLStore) GetAllDueScheduledTasks(ctx context.Context) ([]ScheduledTask, error) {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+schedCols+` FROM scheduled_tasks
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

func (s *MySQLStore) CreateScheduledTaskRun(ctx context.Context, userID, taskID, sessionID int64) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO scheduled_task_runs (user_id, task_id, session_id) VALUES (?,?,?)`, userID, taskID, sessionID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) FinishScheduledTaskRun(ctx context.Context, userID, id int64, status, summary string) {
	s.db.ExecContext(ctx,
		`UPDATE scheduled_task_runs SET status=?, summary=?, finished_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`,
		status, summary, userID, id)
}

func (s *MySQLStore) ListScheduledTaskRuns(ctx context.Context, userID, taskID int64, limit int) ([]ScheduledTaskRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, task_id, session_id, status, summary, started_at, finished_at
		FROM scheduled_task_runs WHERE user_id=? AND task_id=? ORDER BY started_at DESC LIMIT ?`, userID, taskID, limit)
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
