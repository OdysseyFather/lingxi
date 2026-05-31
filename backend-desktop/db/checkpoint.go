package db

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Checkpoint struct {
	ID            int64  `json:"id"`
	SessionID     int64  `json:"session_id"`
	MessageID     int64  `json:"message_id"`
	CreatedAt     string `json:"created_at"`
	FilesSnapshot string `json:"files_snapshot,omitempty"`
	TodoSnapshot  string `json:"todo_snapshot,omitempty"`
	MessagesCount int    `json:"messages_count"`
	FilesCount    int    `json:"files_count"`
}

type FileSnapshot struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Hash    string `json:"hash,omitempty"`
}

func CreateCheckpoint(sessionID, messageID int64, files []FileSnapshot, todoSnapshot []byte) (int64, error) {
	filesJSON, err := json.Marshal(files)
	if err != nil {
		return 0, err
	}

	var msgCount int
	_ = DB.QueryRow(`SELECT COUNT(1) FROM messages WHERE session_id=?`, sessionID).Scan(&msgCount)

	todoStr := ""
	if todoSnapshot != nil {
		todoStr = string(todoSnapshot)
	}

	res, err := DB.Exec(`
		INSERT INTO checkpoints (session_id, message_id, created_at, files_snapshot, todo_snapshot, messages_count, files_count)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, sessionID, messageID, time.Now().UTC().Format(time.RFC3339), string(filesJSON), todoStr, msgCount, len(files))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func GetCheckpoint(id int64) (*Checkpoint, error) {
	cp := &Checkpoint{}
	err := DB.QueryRow(`
		SELECT id, session_id, message_id, created_at, files_snapshot, todo_snapshot, messages_count, files_count
		FROM checkpoints WHERE id=?
	`, id).Scan(&cp.ID, &cp.SessionID, &cp.MessageID, &cp.CreatedAt, &cp.FilesSnapshot, &cp.TodoSnapshot, &cp.MessagesCount, &cp.FilesCount)
	if err != nil {
		return nil, err
	}
	return cp, nil
}

func ListCheckpoints(sessionID int64) ([]Checkpoint, error) {
	rows, err := DB.Query(`
		SELECT id, session_id, message_id, created_at, '', todo_snapshot, messages_count, files_count
		FROM checkpoints WHERE session_id=? ORDER BY created_at DESC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Checkpoint
	for rows.Next() {
		var cp Checkpoint
		if err := rows.Scan(&cp.ID, &cp.SessionID, &cp.MessageID, &cp.CreatedAt, &cp.FilesSnapshot, &cp.TodoSnapshot, &cp.MessagesCount, &cp.FilesCount); err != nil {
			continue
		}
		result = append(result, cp)
	}
	return result, nil
}

func RollbackToCheckpoint(cp *Checkpoint) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// Truncate messages after the checkpoint message
	_, err = tx.Exec(`DELETE FROM messages WHERE session_id=? AND id > ?`, cp.SessionID, cp.MessageID)
	if err != nil {
		return err
	}

	// Delete checkpoints created after this one
	_, err = tx.Exec(`DELETE FROM checkpoints WHERE session_id=? AND id > ?`, cp.SessionID, cp.ID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func DeleteCheckpointsBySession(sessionID int64) error {
	_, err := DB.Exec(`DELETE FROM checkpoints WHERE session_id=?`, sessionID)
	return err
}

func InitCheckpointsTable() error {
	_, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS checkpoints (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL,
			message_id INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			files_snapshot TEXT DEFAULT '',
			todo_snapshot TEXT DEFAULT '',
			messages_count INTEGER DEFAULT 0,
			files_count INTEGER DEFAULT 0
		)
	`)
	if err != nil {
		return err
	}
	// Index for session lookups
	_, _ = DB.Exec(`CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id)`)
	return nil
}

func GetCheckpointFilesSnapshot(id int64) ([]FileSnapshot, error) {
	cp, err := GetCheckpoint(id)
	if err != nil {
		return nil, err
	}
	if cp.FilesSnapshot == "" {
		return nil, nil
	}
	var files []FileSnapshot
	if err := json.Unmarshal([]byte(cp.FilesSnapshot), &files); err != nil {
		return nil, err
	}
	return files, nil
}

func CheckpointExistsForMessage(messageID int64) (int64, error) {
	var id int64
	err := DB.QueryRow(`SELECT id FROM checkpoints WHERE message_id=? LIMIT 1`, messageID).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return id, err
}
