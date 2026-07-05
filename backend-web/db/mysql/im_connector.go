package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// IMConnector Web 多租户版 IM 连接器数据模型
type IMConnector struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Name      string    `json:"name"`
	Platform  string    `json:"platform"`
	AgentID   int64     `json:"agent_id"`
	Enabled   bool      `json:"enabled"`
	Config    string    `json:"config"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// IMSessionInfo IM 会话详情
type IMSessionInfo struct {
	ID           int64     `json:"id"`
	Platform     string    `json:"platform"`
	ScopeKey     string    `json:"scope_key"`
	SessionID    int64     `json:"session_id"`
	SessionTitle string    `json:"session_title"`
	AgentID      int64     `json:"agent_id"`
	AgentName    string    `json:"agent_name"`
	MessageCount int       `json:"message_count"`
	LastActive   time.Time `json:"last_active"`
	CreatedAt    time.Time `json:"created_at"`
}

// IMDashboardStats IM 看板统计数据
type IMDashboardStats struct {
	TotalSessions  int            `json:"total_sessions"`
	TotalMessages  int            `json:"total_messages"`
	ActiveToday    int            `json:"active_today"`
	PlatformCounts map[string]int `json:"platform_counts"`
}

// ─── IM Connectors CRUD ──────────────────────────────────────────

// ListAllEnabledIMConnectors 返回所有用户的已启用连接器（启动时批量恢复用）
func (s *MySQLStore) ListAllEnabledIMConnectors(ctx context.Context) ([]IMConnector, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, name, platform, agent_id, enabled, COALESCE(config,''), created_at, updated_at
		 FROM im_connectors WHERE enabled=1 ORDER BY user_id, platform`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []IMConnector
	for rows.Next() {
		var c IMConnector
		var enabled int
		var configBytes []byte
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Platform, &c.AgentID, &enabled, &configBytes, &c.CreatedAt, &c.UpdatedAt); err != nil {
			continue
		}
		c.Enabled = enabled == 1
		c.Config = string(configBytes)
		result = append(result, c)
	}
	return result, nil
}

func (s *MySQLStore) ListIMConnectors(ctx context.Context, userID int64) ([]IMConnector, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, name, platform, agent_id, enabled, COALESCE(config,''), created_at, updated_at
		 FROM im_connectors WHERE user_id=? ORDER BY platform, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []IMConnector
	for rows.Next() {
		var c IMConnector
		var enabled int
		var configBytes []byte
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Platform, &c.AgentID, &enabled, &configBytes, &c.CreatedAt, &c.UpdatedAt); err != nil {
			continue
		}
		c.Enabled = enabled == 1
		c.Config = string(configBytes)
		result = append(result, c)
	}
	return result, nil
}

func (s *MySQLStore) GetIMConnectorByID(ctx context.Context, userID, id int64) (*IMConnector, error) {
	var c IMConnector
	var enabled int
	var configBytes []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, name, platform, agent_id, enabled, COALESCE(config,''), created_at, updated_at
		 FROM im_connectors WHERE user_id=? AND id=?`, userID, id).
		Scan(&c.ID, &c.UserID, &c.Name, &c.Platform, &c.AgentID, &enabled, &configBytes, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("connector not found")
	}
	if err != nil {
		return nil, err
	}
	c.Enabled = enabled == 1
	c.Config = string(configBytes)
	return &c, nil
}

func (s *MySQLStore) UpsertIMConnector(ctx context.Context, userID, id int64, name, platform string, agentID int64, configJSON string) (int64, error) {
	if id > 0 {
		_, err := s.db.ExecContext(ctx,
			`UPDATE im_connectors SET name=?, platform=?, agent_id=?, config=?, updated_at=CURRENT_TIMESTAMP
			 WHERE user_id=? AND id=?`,
			name, platform, agentID, configJSON, userID, id)
		return id, err
	}
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO im_connectors (user_id, name, platform, agent_id, config) VALUES (?,?,?,?,?)`,
		userID, name, platform, agentID, configJSON)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) SetIMConnectorEnabled(ctx context.Context, userID, id int64, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE im_connectors SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`, v, userID, id)
	return err
}

func (s *MySQLStore) DeleteIMConnectorByID(ctx context.Context, userID, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM im_connectors WHERE user_id=? AND id=?`, userID, id)
	return err
}

// ─── IM Sessions ─────────────────────────────────────────────────

func (s *MySQLStore) GetOrCreateIMSession(ctx context.Context, userID int64, platform, scopeKey, title string, ttlHours int, agentID int64) (int64, error) {
	var sessionID int64
	var lastActive time.Time

	err := s.db.QueryRowContext(ctx,
		`SELECT session_id, last_active FROM im_sessions WHERE user_id=? AND platform=? AND scope_key=?`,
		userID, platform, scopeKey).Scan(&sessionID, &lastActive)

	if err == nil {
		expired := false
		if ttlHours > 0 {
			expired = time.Since(lastActive) > time.Duration(ttlHours)*time.Hour
		}
		if !expired {
			s.db.ExecContext(ctx, `UPDATE im_sessions SET last_active=CURRENT_TIMESTAMP WHERE user_id=? AND platform=? AND scope_key=?`, userID, platform, scopeKey)
			if agentID > 0 {
				s.db.ExecContext(ctx, `UPDATE sessions SET agent_id=? WHERE user_id=? AND id=?`, agentID, userID, sessionID)
			}
			return sessionID, nil
		}
	}

	// 创建新 session
	res, e := s.db.ExecContext(ctx,
		`INSERT INTO sessions (user_id, title, agent_id) VALUES (?, ?, ?)`, userID, title, agentID)
	if e != nil {
		return 0, e
	}
	newSessionID, _ := res.LastInsertId()

	_, e = s.db.ExecContext(ctx,
		`INSERT INTO im_sessions (user_id, platform, scope_key, session_id)
		 VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE session_id=VALUES(session_id), last_active=CURRENT_TIMESTAMP`,
		userID, platform, scopeKey, newSessionID)
	if e != nil {
		return 0, e
	}
	return newSessionID, nil
}

func (s *MySQLStore) TouchIMSession(ctx context.Context, userID int64, platform, scopeKey string) {
	s.db.ExecContext(ctx, `UPDATE im_sessions SET last_active=CURRENT_TIMESTAMP WHERE user_id=? AND platform=? AND scope_key=?`, userID, platform, scopeKey)
}

func (s *MySQLStore) ListIMSessions(ctx context.Context, userID int64, platform string) ([]IMSessionInfo, error) {
	query := `
		SELECT ims.id, ims.platform, ims.scope_key, ims.session_id, ims.last_active,
		       COALESCE(s.title,''), COALESCE(s.agent_id, 0), COALESCE(s.message_count,0), COALESCE(s.created_at, ims.last_active),
		       COALESCE(a.name, '')
		FROM im_sessions ims
		LEFT JOIN sessions s ON s.id = ims.session_id
		LEFT JOIN agents a ON a.id = s.agent_id
		WHERE ims.user_id = ?
	`
	var args []interface{}
	args = append(args, userID)
	if platform != "" {
		query += " AND ims.platform = ?"
		args = append(args, platform)
	}
	query += " ORDER BY ims.last_active DESC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []IMSessionInfo
	for rows.Next() {
		var info IMSessionInfo
		if err := rows.Scan(
			&info.ID, &info.Platform, &info.ScopeKey, &info.SessionID, &info.LastActive,
			&info.SessionTitle, &info.AgentID, &info.MessageCount, &info.CreatedAt,
			&info.AgentName,
		); err != nil {
			continue
		}
		result = append(result, info)
	}
	return result, nil
}

func (s *MySQLStore) GetIMDashboardStats(ctx context.Context, userID int64) (*IMDashboardStats, error) {
	stats := &IMDashboardStats{
		PlatformCounts: make(map[string]int),
	}

	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM im_sessions WHERE user_id=?`, userID).Scan(&stats.TotalSessions)

	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(s.message_count), 0)
		FROM im_sessions ims
		LEFT JOIN sessions s ON s.id = ims.session_id
		WHERE ims.user_id=?
	`, userID).Scan(&stats.TotalMessages)

	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM im_sessions
		WHERE user_id=? AND DATE(last_active) = CURDATE()
	`, userID).Scan(&stats.ActiveToday)

	rows, err := s.db.QueryContext(ctx, `SELECT platform, COUNT(*) FROM im_sessions WHERE user_id=? GROUP BY platform`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p string
			var c int
			if rows.Scan(&p, &c) == nil {
				stats.PlatformCounts[p] = c
			}
		}
	}

	return stats, nil
}

func (s *MySQLStore) DeleteIMSession(ctx context.Context, userID, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM im_sessions WHERE user_id=? AND id=?`, userID, id)
	return err
}

// ─── IM Reply Sessions（回复链续接上下文）────────────────────────

func (s *MySQLStore) GetIMReplySession(ctx context.Context, userID int64, platformMsgID string) (int64, error) {
	var sessionID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT session_id FROM im_reply_sessions WHERE user_id=? AND platform_msg_id=?`,
		userID, platformMsgID).Scan(&sessionID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return sessionID, err
}

func (s *MySQLStore) SaveIMReplySession(ctx context.Context, userID int64, platformMsgID string, sessionID int64) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO im_reply_sessions (user_id, platform_msg_id, session_id)
		 VALUES (?,?,?)
		 ON DUPLICATE KEY UPDATE session_id=VALUES(session_id)`,
		userID, platformMsgID, sessionID)
	return err
}
