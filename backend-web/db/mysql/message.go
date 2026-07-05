package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"lingxi-core/store"
)

func (s *MySQLStore) ListMessages(ctx context.Context, userID, sessionID int64, page store.MessagePage) ([]store.Message, error) {
	ok, err := s.SessionExists(ctx, userID, sessionID)
	if err != nil || !ok {
		return nil, fmt.Errorf("session not found")
	}
	var query string
	var args []any
	desc := false
	if page.BeforeID > 0 && page.Limit > 0 {
		query = "SELECT id, user_id, session_id, role, content, COALESCE(`usage`,''), feedback, pinned, created_at FROM messages WHERE user_id=? AND session_id=? AND id < ? ORDER BY id DESC LIMIT ?"
		args = []any{userID, sessionID, page.BeforeID, page.Limit}
		desc = true
	} else if page.Limit > 0 {
		query = "SELECT id, user_id, session_id, role, content, COALESCE(`usage`,''), feedback, pinned, created_at FROM messages WHERE user_id=? AND session_id=? ORDER BY id DESC LIMIT ?"
		args = []any{userID, sessionID, page.Limit}
		desc = true
	} else {
		query = "SELECT id, user_id, session_id, role, content, COALESCE(`usage`,''), feedback, pinned, created_at FROM messages WHERE user_id=? AND session_id=? ORDER BY id ASC"
		args = []any{userID, sessionID}
	}
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.Message, 0)
	for rows.Next() {
		var m store.Message
		var pinned int
		if err := rows.Scan(&m.ID, &m.UserID, &m.SessionID, &m.Role, &m.Content, &m.Usage, &m.Feedback, &pinned, &m.CreatedAt); err != nil {
			continue
		}
		m.Pinned = pinned == 1
		out = append(out, m)
	}
	if desc {
		for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
			out[i], out[j] = out[j], out[i]
		}
	}
	return out, rows.Err()
}

func (s *MySQLStore) GetMessage(ctx context.Context, userID, messageID int64) (*store.Message, error) {
	row := s.db.QueryRowContext(ctx,
		"SELECT id, user_id, session_id, role, content, COALESCE(`usage`,''), feedback, pinned, created_at FROM messages WHERE user_id=? AND id=?", userID, messageID)
	var m store.Message
	var pinned int
	err := row.Scan(&m.ID, &m.UserID, &m.SessionID, &m.Role, &m.Content, &m.Usage, &m.Feedback, &pinned, &m.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("message not found")
	}
	if err != nil {
		return nil, err
	}
	m.Pinned = pinned == 1
	return &m, nil
}

func (s *MySQLStore) InsertMessage(ctx context.Context, userID int64, m *store.Message) (int64, error) {
	if m == nil || m.SessionID == 0 {
		return 0, fmt.Errorf("invalid message")
	}
	var usageVal any
	if m.Usage != "" {
		usageVal = m.Usage
	}
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO messages (user_id, session_id, role, content, `usage`) VALUES (?,?,?,?,?)",
		userID, m.SessionID, m.Role, m.Content, usageVal)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET message_count=message_count+1, updated_at=NOW() WHERE user_id=? AND id=?`,
		userID, m.SessionID)
	return id, nil
}

func (s *MySQLStore) UpdateMessage(ctx context.Context, userID, messageID int64, content string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE messages SET content=? WHERE user_id=? AND id=?`, content, userID, messageID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("message not found")
	}
	return nil
}

func (s *MySQLStore) DeleteMessagesAfter(ctx context.Context, userID, sessionID, messageID int64) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM messages WHERE user_id=? AND session_id=? AND id>?`,
		userID, sessionID, messageID)
	if err != nil {
		return 0, err
	}
	deleted, _ := res.RowsAffected()
	if deleted > 0 {
		_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET message_count=GREATEST(message_count-?,0), updated_at=NOW() WHERE user_id=? AND id=?`,
			deleted, userID, sessionID)
	}
	return deleted, nil
}

func (s *MySQLStore) DeleteMessagesFrom(ctx context.Context, userID, sessionID, fromMessageID int64) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM messages WHERE user_id=? AND session_id=? AND id>=?`,
		userID, sessionID, fromMessageID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *MySQLStore) SetMessageFeedback(ctx context.Context, userID, messageID int64, feedback string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE messages SET feedback=? WHERE user_id=? AND id=?`, feedback, userID, messageID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("message not found")
	}
	return nil
}

func (s *MySQLStore) SearchMessages(ctx context.Context, userID int64, query string, limit int) ([]store.MessageSearchHit, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx,
		"SELECT m.id, m.session_id, m.role, m.content, COALESCE(m.`usage`,''), m.created_at, COALESCE(s.title,'') FROM messages m JOIN sessions s ON s.id=m.session_id AND s.user_id=m.user_id WHERE m.user_id=? AND m.content LIKE CONCAT('%',?,'%') AND s.is_a2a=0 ORDER BY m.created_at DESC LIMIT ?",
		userID, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.MessageSearchHit, 0)
	for rows.Next() {
		var h store.MessageSearchHit
		if err := rows.Scan(&h.MessageID, &h.SessionID, &h.Role, &h.Content, &h.Usage, &h.CreatedAt, &h.SessionTitle); err != nil {
			continue
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (s *MySQLStore) CountMessages(ctx context.Context, userID, sessionID int64) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM messages WHERE user_id=? AND session_id=?`, userID, sessionID).Scan(&n)
	return n, err
}

func (s *MySQLStore) ToggleMessagePin(ctx context.Context, userID, messageID int64) (bool, error) {
	var current int
	err := s.db.QueryRowContext(ctx, `SELECT pinned FROM messages WHERE user_id=? AND id=?`, userID, messageID).Scan(&current)
	if err != nil {
		return false, err
	}
	newVal := 1 - current
	_, err = s.db.ExecContext(ctx, `UPDATE messages SET pinned=? WHERE user_id=? AND id=?`, newVal, userID, messageID)
	return newVal == 1, err
}
