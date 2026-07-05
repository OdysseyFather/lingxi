package mysql

import (
	"context"
	"fmt"

	"lingxi-core/store"
)

func (s *MySQLStore) ListMemories(ctx context.Context, userID, agentID int64, limit int) ([]store.Memory, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, agent_id, content, category, created_at FROM memories
		 WHERE user_id=? AND agent_id=? ORDER BY created_at DESC LIMIT ?`,
		userID, agentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.Memory, 0)
	for rows.Next() {
		var m store.Memory
		if err := rows.Scan(&m.ID, &m.UserID, &m.AgentID, &m.Content, &m.Category, &m.CreatedAt); err != nil {
			continue
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *MySQLStore) CreateMemory(ctx context.Context, userID, agentID int64, content, category string) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO memories (user_id, agent_id, content, category) VALUES (?,?,?,?)`,
		userID, agentID, content, category)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) DeleteMemory(ctx context.Context, userID, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM memories WHERE user_id=? AND id=?`, userID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("memory not found")
	}
	return nil
}

func (s *MySQLStore) ClearMemories(ctx context.Context, userID, agentID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM memories WHERE user_id=? AND agent_id=?`, userID, agentID)
	return err
}

func (s *MySQLStore) ListMemoryContents(ctx context.Context, userID, agentID int64, limit int) ([]store.Memory, error) {
	return s.ListMemories(ctx, userID, agentID, limit)
}
