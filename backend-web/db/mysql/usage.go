package mysql

import (
	"context"
	"database/sql"
	"time"

	"lingxi-core/store"
)

func (s *MySQLStore) InsertUsageRecord(ctx context.Context, userID int64, r *store.UsageRecord) (int64, error) {
	est := 0
	if r.Estimated {
		est = 1
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO usage_records
			(user_id, session_id, message_id, profile_id, model,
			 input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
			 cost_usd, estimated, duration_ms)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		userID, r.SessionID, r.MessageID, r.ProfileID, r.Model,
		r.InputTokens, r.OutputTokens, r.CacheReadTokens, r.CacheWriteTokens,
		r.CostUSD, est, r.DurationMs)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	_, _ = s.db.ExecContext(ctx, `
		UPDATE usage_quotas SET token_input=token_input+?, token_output=token_output+? WHERE user_id=?`,
		r.InputTokens, r.OutputTokens, userID)
	return id, nil
}

func (s *MySQLStore) SumUsageSince(ctx context.Context, userID int64, since time.Time) (store.UsageSummary, error) {
	var sum store.UsageSummary
	row := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		       COALESCE(SUM(cache_read_tokens),0), COALESCE(SUM(cache_write_tokens),0),
		       COALESCE(SUM(cost_usd),0), COUNT(1)
		FROM usage_records WHERE user_id=? AND created_at >= ?`, userID, since)
	err := row.Scan(&sum.InputTokens, &sum.OutputTokens, &sum.CacheReadTokens, &sum.CacheWriteTokens, &sum.CostUSD, &sum.Requests)
	return sum, err
}

func (s *MySQLStore) GroupUsageByDay(ctx context.Context, userID int64, days int) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DATE(created_at) AS d,
		       COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		       COALESCE(SUM(cache_read_tokens),0), COALESCE(SUM(cache_write_tokens),0),
		       COALESCE(SUM(cost_usd),0), COUNT(1)
		FROM usage_records
		WHERE user_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
		GROUP BY d ORDER BY d ASC`, userID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMySQLUsageDayGroups(rows)
}

func scanMySQLUsageDayGroups(rows *sql.Rows) ([]map[string]interface{}, error) {
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var d string
		var in, outT, cr, cw, n int64
		var cost float64
		if err := rows.Scan(&d, &in, &outT, &cr, &cw, &cost, &n); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"date": d, "input_tokens": in, "output_tokens": outT,
			"cache_read_tokens": cr, "cache_write_tokens": cw,
			"cost_usd": cost, "requests": n,
		})
	}
	return out, rows.Err()
}

func (s *MySQLStore) GroupUsageByModel(ctx context.Context, userID int64, days int) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT model,
		       COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		       COALESCE(SUM(cost_usd),0), COUNT(1)
		FROM usage_records
		WHERE user_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
		GROUP BY model ORDER BY 4 DESC`, userID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var model string
		var in, outT, n int64
		var cost float64
		if err := rows.Scan(&model, &in, &outT, &cost, &n); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"model": model, "input_tokens": in, "output_tokens": outT,
			"cost_usd": cost, "requests": n,
		})
	}
	return out, rows.Err()
}

func (s *MySQLStore) GroupUsageByAgent(ctx context.Context, userID int64, days int) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT COALESCE(s.agent_id,0), COALESCE(a.name,'默认助理'), COALESCE(a.avatar,''),
		       COALESCE(SUM(u.input_tokens),0), COALESCE(SUM(u.output_tokens),0),
		       COALESCE(SUM(u.cost_usd),0), COUNT(1)
		FROM usage_records u
		LEFT JOIN sessions s ON s.user_id=u.user_id AND s.id=u.session_id
		LEFT JOIN agents a ON a.user_id=u.user_id AND a.id=s.agent_id
		WHERE u.user_id=? AND u.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
		GROUP BY COALESCE(s.agent_id,0)
		ORDER BY 6 DESC`, userID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var agentID, in, outT, n int64
		var name, avatar string
		var cost float64
		if err := rows.Scan(&agentID, &name, &avatar, &in, &outT, &cost, &n); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"agent_id": agentID, "agent_name": name, "agent_avatar": avatar,
			"input_tokens": in, "output_tokens": outT,
			"cost_usd": cost, "requests": n,
		})
	}
	return out, rows.Err()
}

func (s *MySQLStore) GroupUsageCostByDay(ctx context.Context, userID int64, days int) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DATE(created_at) AS d, COALESCE(SUM(cost_usd),0)
		FROM usage_records
		WHERE user_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
		GROUP BY d ORDER BY d ASC`, userID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var d string
		var cost float64
		if err := rows.Scan(&d, &cost); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{"date": d, "cost_usd": cost})
	}
	return out, rows.Err()
}

func (s *MySQLStore) ListRecentUsage(ctx context.Context, userID int64, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.session_id, COALESCE(s.title,''), u.model, u.input_tokens, u.output_tokens,
		       u.cache_read_tokens, u.cache_write_tokens, u.cost_usd, u.estimated, u.duration_ms, u.created_at
		FROM usage_records u
		LEFT JOIN sessions s ON s.user_id=u.user_id AND s.id=u.session_id
		WHERE u.user_id=?
		ORDER BY u.id DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, sid, in, outT, cr, cw, est, dur int64
		var title, model string
		var cost float64
		var createdAt time.Time
		if err := rows.Scan(&id, &sid, &title, &model, &in, &outT, &cr, &cw, &cost, &est, &dur, &createdAt); err != nil {
			continue
		}
		rec := map[string]interface{}{
			"id": id, "session_id": sid, "session_title": title,
			"model": model, "input_tokens": in, "output_tokens": outT,
			"cache_read_tokens": cr, "cache_write_tokens": cw,
			"cost_usd": cost, "duration_ms": dur, "created_at": createdAt,
		}
		if est == 1 {
			rec["estimated"] = true
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (s *MySQLStore) SaveUsageQuotaSnapshot(ctx context.Context, userID, profileID int64, snapshot string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO usage_quota_cache (user_id, profile_id, snapshot)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE snapshot=VALUES(snapshot), fetched_at=CURRENT_TIMESTAMP`,
		userID, profileID, snapshot)
	return err
}

func (s *MySQLStore) GetUsageQuotaCache(ctx context.Context, userID, profileID int64) (string, time.Time, bool) {
	var snap string
	var t time.Time
	err := s.db.QueryRowContext(ctx,
		`SELECT snapshot, fetched_at FROM usage_quota_cache WHERE user_id=? AND profile_id=?`,
		userID, profileID).Scan(&snap, &t)
	if err != nil {
		return "", time.Time{}, false
	}
	return snap, t, true
}
