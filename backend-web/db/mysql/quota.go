package mysql

import (
	"context"
	"fmt"
	"time"

	"lingxi-core/store"
)

func (s *MySQLStore) GetQuotaLimits(ctx context.Context, userID int64) (*store.QuotaLimits, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT storage_limit_bytes, token_input_limit, token_output_limit, agent_limit, session_limit, knowledge_limit, concurrent_chats
		FROM user_quota_limits WHERE user_id=?`, userID)
	var q store.QuotaLimits
	err := row.Scan(&q.StorageLimitBytes, &q.TokenInputLimit, &q.TokenOutputLimit, &q.AgentLimit, &q.SessionLimit, &q.KnowledgeLimit, &q.ConcurrentChats)
	if err != nil {
		return nil, err
	}
	return &q, nil
}

func (s *MySQLStore) GetUsageQuota(ctx context.Context, userID int64) (*store.UsageQuota, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT storage_bytes, token_input, token_output, agent_count, session_count, knowledge_count, active_chats
		FROM usage_quotas WHERE user_id=?`, userID)
	var u store.UsageQuota
	err := row.Scan(&u.StorageBytes, &u.TokenInput, &u.TokenOutput, &u.AgentCount, &u.SessionCount, &u.KnowledgeCount, &u.ActiveChats)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *MySQLStore) TryAddStorage(ctx context.Context, userID int64, delta int64) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE usage_quotas u
		JOIN user_quota_limits l ON l.user_id=u.user_id
		SET u.storage_bytes = u.storage_bytes + ?
		WHERE u.user_id=? AND u.storage_bytes + ? <= l.storage_limit_bytes`, delta, userID, delta)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("storage quota exceeded")
	}
	return nil
}

func (s *MySQLStore) TryAcquireChatSlot(ctx context.Context, userID int64, limit int) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE usage_quotas SET active_chats = active_chats + 1
		WHERE user_id=? AND active_chats < ?`, userID, limit)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("concurrent chat limit reached")
	}
	return nil
}

func (s *MySQLStore) ReleaseChatSlot(ctx context.Context, userID int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE usage_quotas SET active_chats = GREATEST(active_chats-1,0) WHERE user_id=?`, userID)
	return err
}

func (s *MySQLStore) CheckRateLimit(ctx context.Context, userID int64, ip, key string, limit, windowSec int) (bool, error) {
	windowStart := time.Now().Add(-time.Duration(windowSec) * time.Second)
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(1) FROM user_rate_limits
		WHERE limit_key=? AND window_start >= ?
		AND (user_id=? OR (user_id=0 AND ip_address=?))`,
		key, windowStart, userID, ip).Scan(&count)
	if err != nil {
		return false, err
	}
	if count >= limit {
		return false, nil
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO user_rate_limits (user_id, ip_address, limit_key, window_start, hit_count)
		VALUES (?, NULLIF(?,''), ?, NOW(), 1)`, userID, ip, key)
	return err == nil, err
}

func (s *MySQLStore) AddTokenUsage(ctx context.Context, userID int64, input, output int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE usage_quotas SET token_input=token_input+?, token_output=token_output+? WHERE user_id=?`,
		input, output, userID)
	return err
}
