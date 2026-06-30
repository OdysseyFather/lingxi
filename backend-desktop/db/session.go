package db

import (
	"database/sql"
	"time"
)

// ─── Tasks ───────────────────────────────────────────────────────

func CreateTask(sessionID int64, title string) (int64, error) {
	res, err := DB.Exec(
		`INSERT INTO tasks (session_id, title) VALUES (?,?)`,
		sessionID, title,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdateTaskStatus(id int64, status string) {
	DB.Exec(`UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, status, id)
}

func UpdateTaskProgress(id int64, progress string) {
	DB.Exec(`UPDATE tasks SET progress=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, progress, id)
}

func ListTasks(sessionID int64) ([]map[string]interface{}, error) {
	var rows *sql.Rows
	var err error
	if sessionID > 0 {
		rows, err = DB.Query(
			`SELECT id, session_id, title, status, progress, created_at, updated_at
			 FROM tasks WHERE session_id=? ORDER BY created_at DESC`,
			sessionID,
		)
	} else {
		rows, err = DB.Query(
			`SELECT id, session_id, title, status, progress, created_at, updated_at
			 FROM tasks ORDER BY created_at DESC LIMIT 50`,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, sid int64
		var title, status, progress string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &sid, &title, &status, &progress, &createdAt, &updatedAt); err != nil {
			continue
		}
		result = append(result, map[string]interface{}{
			"id":         id,
			"session_id": sid,
			"title":      title,
			"status":     status,
			"progress":   progress,
			"created_at": createdAt,
			"updated_at": updatedAt,
		})
	}
	return result, nil
}

func DeleteTask(id int64) {
	DB.Exec(`DELETE FROM tasks WHERE id=?`, id)
}

// ─── Pending Tasks ───────────────────────────────────────────────

func SavePendingTask(sessionID int64, taskDesc, missingFields string) {
	DB.Exec(`
		INSERT INTO pending_tasks (session_id, task_desc, missing_fields)
		VALUES (?,?,?)
		ON CONFLICT(session_id) DO UPDATE SET
			task_desc=excluded.task_desc,
			missing_fields=excluded.missing_fields,
			updated_at=CURRENT_TIMESTAMP
	`, sessionID, taskDesc, missingFields)
}

func GetPendingTask(sessionID int64) (taskDesc, missingFields string, found bool) {
	err := DB.QueryRow(
		`SELECT task_desc, missing_fields FROM pending_tasks WHERE session_id=?`,
		sessionID,
	).Scan(&taskDesc, &missingFields)
	if err != nil {
		return "", "", false
	}
	return taskDesc, missingFields, true
}

func ClearPendingTask(sessionID int64) {
	DB.Exec(`DELETE FROM pending_tasks WHERE session_id=?`, sessionID)
}

// GetSessionPermissionMode 返回会话的权限模式（"trust" 或 "ask"）
func GetSessionPermissionMode(sessionID int64) string {
	var mode string
	err := DB.QueryRow(`SELECT COALESCE(permission_mode,'trust') FROM sessions WHERE id=?`, sessionID).Scan(&mode)
	if err != nil {
		return "trust"
	}
	return mode
}
