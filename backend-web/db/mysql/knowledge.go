package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"lingxi-core/store"
)

func (s *MySQLStore) ListKnowledge(ctx context.Context, userID int64) ([]store.KnowledgeItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, title, file_path, category, tags, summary, size, created_at
		FROM knowledge WHERE user_id=? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.KnowledgeItem, 0)
	for rows.Next() {
		var item store.KnowledgeItem
		if err := rows.Scan(&item.ID, &item.UserID, &item.Title, &item.FilePath, &item.Category, &item.Tags, &item.Summary, &item.Size, &item.CreatedAt); err != nil {
			continue
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *MySQLStore) GetKnowledge(ctx context.Context, userID, id int64) (*store.KnowledgeItem, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, title, file_path, category, tags, summary, size, created_at
		FROM knowledge WHERE user_id=? AND id=?`, userID, id)
	var item store.KnowledgeItem
	err := row.Scan(&item.ID, &item.UserID, &item.Title, &item.FilePath, &item.Category, &item.Tags, &item.Summary, &item.Size, &item.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("knowledge not found")
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *MySQLStore) InsertKnowledge(ctx context.Context, userID int64, item *store.KnowledgeItem) (int64, error) {
	var kbCount, kbLimit int
	err := s.db.QueryRowContext(ctx, `
		SELECT u.knowledge_count, l.knowledge_limit FROM usage_quotas u
		JOIN user_quota_limits l ON l.user_id=u.user_id WHERE u.user_id=?`, userID).Scan(&kbCount, &kbLimit)
	if err != nil {
		return 0, err
	}
	if kbCount >= kbLimit {
		return 0, fmt.Errorf("knowledge limit reached")
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO knowledge (user_id, title, file_path, category, tags, summary, size)
		VALUES (?,?,?,?,?,?,?)`,
		userID, item.Title, item.FilePath, item.Category, item.Tags, item.Summary, item.Size)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	_, _ = s.db.ExecContext(ctx, `UPDATE usage_quotas SET knowledge_count=knowledge_count+1 WHERE user_id=?`, userID)
	return id, nil
}

func (s *MySQLStore) UpdateKnowledge(ctx context.Context, userID, id int64, title, category, tags, summary string) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE knowledge SET title=?, category=?, tags=?, summary=? WHERE user_id=? AND id=?`,
		title, category, tags, summary, userID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("knowledge not found")
	}
	return nil
}

func (s *MySQLStore) DeleteKnowledge(ctx context.Context, userID, id int64) (string, error) {
	var filePath string
	err := s.db.QueryRowContext(ctx, `SELECT file_path FROM knowledge WHERE user_id=? AND id=?`, userID, id).Scan(&filePath)
	if err != nil {
		return "", err
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM knowledge WHERE user_id=? AND id=?`, userID, id)
	if err != nil {
		return "", err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return "", fmt.Errorf("knowledge not found")
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE usage_quotas SET knowledge_count=GREATEST(knowledge_count-1,0) WHERE user_id=?`, userID)
	return filePath, nil
}

func (s *MySQLStore) ListKnowledgeCategories(ctx context.Context, userID int64) ([]store.KnowledgeCategory, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, name, icon, sort_order FROM knowledge_categories WHERE user_id=? ORDER BY sort_order ASC, id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.KnowledgeCategory, 0)
	for rows.Next() {
		var c store.KnowledgeCategory
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Icon, &c.SortOrder); err != nil {
			continue
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *MySQLStore) CreateKnowledgeCategory(ctx context.Context, userID int64, name, icon string) (int64, error) {
	var maxOrder int
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order),0) FROM knowledge_categories WHERE user_id=?`, userID).Scan(&maxOrder)
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO knowledge_categories (user_id, name, icon, sort_order) VALUES (?,?,?,?)`, userID, name, icon, maxOrder+1)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) DeleteKnowledgeCategory(ctx context.Context, userID, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM knowledge_categories WHERE user_id=? AND id=?`, userID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("category not found")
	}
	return nil
}

func (s *MySQLStore) UpdateKnowledgeCategory(ctx context.Context, userID, id int64, name, icon string) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE knowledge_categories SET name=?, icon=? WHERE user_id=? AND id=?`, name, icon, userID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("category not found")
	}
	return nil
}

func (s *MySQLStore) UpdateKnowledgeItemCategory(ctx context.Context, userID, id int64, category string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE knowledge SET category=? WHERE user_id=? AND id=?`, category, userID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("knowledge not found")
	}
	return nil
}
