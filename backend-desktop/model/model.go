package model

import "time"

type Session struct {
	ID              int64     `json:"id"`
	Title           string    `json:"title"`
	ClaudeSessionID string    `json:"claude_session_id,omitempty"`
	MessageCount    int       `json:"message_count"`
	AgentID         int64     `json:"agent_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Message struct {
	ID        int64     `json:"id"`
	SessionID int64     `json:"session_id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Usage     string    `json:"usage,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type Skill struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	FilePath    string    `json:"file_path"`
	Installed   bool      `json:"installed"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
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
