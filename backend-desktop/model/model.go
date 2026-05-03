package model

import "time"

type Session struct {
	ID              int64     `json:"id"`
	Title           string    `json:"title"`
	ClaudeSessionID string    `json:"claude_session_id,omitempty"`
	MessageCount    int       `json:"message_count"`
	AgentID         int64     `json:"agent_id"`
	Pinned          bool      `json:"pinned"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Message struct {
	ID        int64     `json:"id"`
	SessionID int64     `json:"session_id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Usage     string    `json:"usage,omitempty"`
	Feedback  string    `json:"feedback,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type Skill struct {
	ID                 int64     `json:"id"`
	Name               string    `json:"name"`
	Description        string    `json:"description"`
	FilePath           string    `json:"file_path"`
	Installed          bool      `json:"installed"`
	Source             string    `json:"source"`
	MarketplaceID      string    `json:"marketplace_id,omitempty"`
	MarketplaceVersion string    `json:"marketplace_version,omitempty"`
	Author             string    `json:"author,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type Task struct {
	ID        int64     `json:"id"`
	SessionID int64     `json:"session_id"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	Progress  string    `json:"progress"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type PendingTask struct {
	ID            int64     `json:"id"`
	SessionID     int64     `json:"session_id"`
	TaskDesc      string    `json:"task_desc"`
	MissingFields string    `json:"missing_fields"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

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
