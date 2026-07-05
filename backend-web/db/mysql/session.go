package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"lingxi-core/store"
)

func (s *MySQLStore) ListSessions(ctx context.Context, userID int64, filter store.SessionFilter) ([]store.Session, error) {
	base := `SELECT id, user_id, title, message_count, agent_id, pinned, folder, permission_mode,
		project_path, summary, claude_session_id, created_at, updated_at
		FROM sessions WHERE user_id=? AND is_a2a=0 AND mode=?`
	args := []any{userID, filter.Mode}
	if filter.AgentID > 0 {
		base += ` AND agent_id=?`
		args = append(args, filter.AgentID)
	}
	if filter.ProjectPath != "" {
		base += ` AND project_path=?`
		args = append(args, filter.ProjectPath)
	}
	base += ` ORDER BY pinned DESC, updated_at DESC`

	rows, err := s.db.QueryContext(ctx, base, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSessions(rows)
}

func scanSessions(rows *sql.Rows) ([]store.Session, error) {
	out := make([]store.Session, 0)
	for rows.Next() {
		var sess store.Session
		var pinned int
		if err := rows.Scan(&sess.ID, &sess.UserID, &sess.Title, &sess.MessageCount, &sess.AgentID, &pinned,
			&sess.Folder, &sess.PermissionMode, &sess.ProjectPath, &sess.Summary,
			&sess.ClaudeSessionID, &sess.CreatedAt, &sess.UpdatedAt); err != nil {
			continue
		}
		sess.Pinned = pinned == 1
		out = append(out, sess)
	}
	return out, rows.Err()
}

func (s *MySQLStore) CreateSession(ctx context.Context, userID int64, sess *store.Session) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (user_id, title, agent_id, permission_mode, mode, project_path)
		VALUES (?, ?, ?, ?, ?, ?)`,
		userID, sess.Title, sess.AgentID, sess.PermissionMode, sess.Mode, sess.ProjectPath)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	_, _ = s.db.ExecContext(ctx, `UPDATE usage_quotas SET session_count=session_count+1 WHERE user_id=?`, userID)
	return id, nil
}

func (s *MySQLStore) GetSession(ctx context.Context, userID, sessionID int64) (*store.Session, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, title, message_count, agent_id, pinned, folder, permission_mode,
		project_path, summary, claude_session_id, created_at, updated_at
		FROM sessions WHERE user_id=? AND id=?`, userID, sessionID)
	var sess store.Session
	var pinned int
	err := row.Scan(&sess.ID, &sess.UserID, &sess.Title, &sess.MessageCount, &sess.AgentID, &pinned,
		&sess.Folder, &sess.PermissionMode, &sess.ProjectPath, &sess.Summary,
		&sess.ClaudeSessionID, &sess.CreatedAt, &sess.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found")
	}
	if err != nil {
		return nil, err
	}
	sess.Pinned = pinned == 1
	return &sess, nil
}

func (s *MySQLStore) UpdateSession(ctx context.Context, userID, sessionID int64, patch store.SessionPatch) error {
	if patch.Title != nil && *patch.Title != "" {
		if _, err := s.db.ExecContext(ctx, `UPDATE sessions SET title=?, updated_at=NOW() WHERE user_id=? AND id=?`,
			*patch.Title, userID, sessionID); err != nil {
			return err
		}
	}
	if patch.Pinned != nil {
		v := 0
		if *patch.Pinned {
			v = 1
		}
		if _, err := s.db.ExecContext(ctx, `UPDATE sessions SET pinned=? WHERE user_id=? AND id=?`, v, userID, sessionID); err != nil {
			return err
		}
	}
	if patch.Folder != nil {
		if _, err := s.db.ExecContext(ctx, `UPDATE sessions SET folder=? WHERE user_id=? AND id=?`, *patch.Folder, userID, sessionID); err != nil {
			return err
		}
	}
	if patch.PermissionMode != nil {
		mode := *patch.PermissionMode
		if mode != "trust" && mode != "ask" {
			mode = "trust"
		}
		if _, err := s.db.ExecContext(ctx, `UPDATE sessions SET permission_mode=? WHERE user_id=? AND id=?`, mode, userID, sessionID); err != nil {
			return err
		}
	}
	return nil
}

func (s *MySQLStore) DeleteSession(ctx context.Context, userID, sessionID int64) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM messages WHERE user_id=? AND session_id=?`, userID, sessionID); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=? AND id=?`, userID, sessionID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("session not found")
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE usage_quotas SET session_count=GREATEST(session_count-1,0) WHERE user_id=?`, userID)
	return nil
}

func (s *MySQLStore) BatchDeleteSessions(ctx context.Context, userID int64, ids []int64) (int, error) {
	deleted := 0
	for _, id := range ids {
		if err := s.DeleteSession(ctx, userID, id); err == nil {
			deleted++
		}
	}
	return deleted, nil
}

func (s *MySQLStore) SessionExists(ctx context.Context, userID, sessionID int64) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM sessions WHERE user_id=? AND id=?`, userID, sessionID).Scan(&n)
	return n > 0, err
}

func (s *MySQLStore) GetClaudeSessionID(ctx context.Context, userID, sessionID int64) (string, error) {
	var cid string
	err := s.db.QueryRowContext(ctx, `SELECT claude_session_id FROM sessions WHERE user_id=? AND id=?`, userID, sessionID).Scan(&cid)
	return cid, err
}

func (s *MySQLStore) SetClaudeSessionID(ctx context.Context, userID, sessionID int64, claudeID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET claude_session_id=? WHERE user_id=? AND id=?`, claudeID, userID, sessionID)
	return err
}

func (s *MySQLStore) ClearClaudeSessionID(ctx context.Context, userID, sessionID int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET claude_session_id='' WHERE user_id=? AND id=?`, userID, sessionID)
	return err
}

func (s *MySQLStore) UpdateSessionTitleIfDefault(ctx context.Context, userID, sessionID int64, title string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET title=? WHERE user_id=? AND id=? AND title='新对话'`, title, userID, sessionID)
	return err
}

func (s *MySQLStore) SetSessionAgent(ctx context.Context, userID, sessionID, agentID int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET agent_id=? WHERE user_id=? AND id=?`, agentID, userID, sessionID)
	return err
}
