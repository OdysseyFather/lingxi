package mysql

import (
	"context"
	"time"
)

type EvolutionLog struct {
	ID             int64  `json:"id"`
	UserID         int64  `json:"user_id,omitempty"`
	AgentID        int64  `json:"agent_id"`
	SessionID      int64  `json:"session_id"`
	Trigger        string `json:"trigger"`
	Action         string `json:"action"`
	TargetType     string `json:"target_type"`
	TargetID       int64  `json:"target_id"`
	Summary        string `json:"summary"`
	Detail         string `json:"detail"`
	Status         string `json:"status"`
	RawLLMResponse string `json:"raw_llm_response,omitempty"`
	StepsJSON      string `json:"steps_json,omitempty"`
	CreatedAt      string `json:"created_at"`
}

type EvolutionStats struct {
	Total      int            `json:"total"`
	ByAction   map[string]int `json:"by_action"`
	ByTrigger  map[string]int `json:"by_trigger"`
	RecentDays map[string]int `json:"recent_days"`
}

func (s *MySQLStore) InsertEvolutionLog(ctx context.Context, userID int64, log *EvolutionLog) (int64, error) {
	status := log.Status
	if status == "" {
		status = "active"
	}
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO evolution_logs (user_id, agent_id, session_id, trigger_source, action, target_type, target_id, summary, detail, status, raw_llm_response, steps_json)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		userID, log.AgentID, log.SessionID, log.Trigger, log.Action, log.TargetType, log.TargetID, log.Summary, log.Detail, status, log.RawLLMResponse, log.StepsJSON)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) ListEvolutionLogs(ctx context.Context, userID, agentID int64, limit int) ([]EvolutionLog, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, agent_id, session_id, trigger_source, action, target_type, target_id, summary, detail, status, raw_llm_response, steps_json, created_at
		FROM evolution_logs WHERE user_id=? AND agent_id=? ORDER BY created_at DESC LIMIT ?`, userID, agentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []EvolutionLog
	for rows.Next() {
		var l EvolutionLog
		if err := rows.Scan(&l.ID, &l.AgentID, &l.SessionID, &l.Trigger, &l.Action, &l.TargetType, &l.TargetID, &l.Summary, &l.Detail, &l.Status, &l.RawLLMResponse, &l.StepsJSON, &l.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (s *MySQLStore) ListAllEvolutionLogs(ctx context.Context, userID int64, limit, offset int) ([]EvolutionLog, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, agent_id, session_id, trigger_source, action, target_type, target_id, summary, detail, status, raw_llm_response, steps_json, created_at
		FROM evolution_logs WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []EvolutionLog
	for rows.Next() {
		var l EvolutionLog
		if err := rows.Scan(&l.ID, &l.AgentID, &l.SessionID, &l.Trigger, &l.Action, &l.TargetType, &l.TargetID, &l.Summary, &l.Detail, &l.Status, &l.RawLLMResponse, &l.StepsJSON, &l.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (s *MySQLStore) GetEvolutionLog(ctx context.Context, userID, id int64) (*EvolutionLog, error) {
	var l EvolutionLog
	err := s.db.QueryRowContext(ctx,
		`SELECT id, agent_id, session_id, trigger_source, action, target_type, target_id, summary, detail, status, raw_llm_response, steps_json, created_at
		FROM evolution_logs WHERE user_id=? AND id=?`, userID, id).Scan(
		&l.ID, &l.AgentID, &l.SessionID, &l.Trigger, &l.Action, &l.TargetType, &l.TargetID, &l.Summary, &l.Detail, &l.Status, &l.RawLLMResponse, &l.StepsJSON, &l.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (s *MySQLStore) DeleteEvolutionLog(ctx context.Context, userID, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM evolution_logs WHERE user_id=? AND id=?`, userID, id)
	return err
}

func (s *MySQLStore) ClearEvolutionLogs(ctx context.Context, userID, agentID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM evolution_logs WHERE user_id=? AND agent_id=?`, userID, agentID)
	return err
}

func (s *MySQLStore) UpdateEvolutionLogStatus(ctx context.Context, userID, id int64, status string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE evolution_logs SET status=? WHERE user_id=? AND id=?`, status, userID, id)
	return err
}

func (s *MySQLStore) GetAgentEvolutionEnabled(ctx context.Context, userID, agentID int64) bool {
	var enabled int
	s.db.QueryRowContext(ctx, `SELECT evolution_enabled FROM agents WHERE user_id=? AND id=?`, userID, agentID).Scan(&enabled)
	return enabled == 1
}

func (s *MySQLStore) SetAgentEvolutionEnabled(ctx context.Context, userID, agentID int64, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := s.db.ExecContext(ctx, `UPDATE agents SET evolution_enabled=?, updated_at=? WHERE user_id=? AND id=?`,
		v, time.Now().Format("2006-01-02 15:04:05"), userID, agentID)
	return err
}

func (s *MySQLStore) InsertMemory(ctx context.Context, userID, agentID int64, content, category string) (int64, error) {
	res, err := s.db.ExecContext(ctx, `INSERT INTO memories (user_id, agent_id, content, category) VALUES (?,?,?,?)`,
		userID, agentID, content, category)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) GetEvolutionStats(ctx context.Context, userID int64) (*EvolutionStats, error) {
	stats := &EvolutionStats{
		ByAction:   make(map[string]int),
		ByTrigger:  make(map[string]int),
		RecentDays: make(map[string]int),
	}

	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM evolution_logs WHERE user_id=?`, userID).Scan(&stats.Total)

	rows, err := s.db.QueryContext(ctx, `SELECT action, COUNT(*) FROM evolution_logs WHERE user_id=? GROUP BY action`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k string
			var c int
			rows.Scan(&k, &c)
			stats.ByAction[k] = c
		}
	}

	rows2, err := s.db.QueryContext(ctx, `SELECT trigger_source, COUNT(*) FROM evolution_logs WHERE user_id=? GROUP BY trigger_source`, userID)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var k string
			var c int
			rows2.Scan(&k, &c)
			stats.ByTrigger[k] = c
		}
	}

	rows3, err := s.db.QueryContext(ctx, `SELECT DATE(created_at) as d, COUNT(*) FROM evolution_logs WHERE user_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY d ORDER BY d`, userID)
	if err == nil {
		defer rows3.Close()
		for rows3.Next() {
			var k string
			var c int
			rows3.Scan(&k, &c)
			stats.RecentDays[k] = c
		}
	}

	return stats, nil
}

func (s *MySQLStore) ListDreamLogs(ctx context.Context, userID, agentID int64, limit int) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, agent_id, session_id, trigger_source, action, target_type, target_id, summary, detail, status, created_at
		FROM evolution_logs
		WHERE user_id=? AND agent_id=? AND trigger_source='dream'
		ORDER BY created_at DESC
		LIMIT ?`, userID, agentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var id, agentID2, sessionID, targetID int64
		var trigger, action, targetType, summary, detail, status, createdAt string
		if err := rows.Scan(&id, &agentID2, &sessionID, &trigger, &action, &targetType, &targetID, &summary, &detail, &status, &createdAt); err != nil {
			continue
		}
		logs = append(logs, map[string]interface{}{
			"id":          id,
			"agent_id":    agentID2,
			"session_id":  sessionID,
			"trigger":     trigger,
			"action":      action,
			"target_type": targetType,
			"target_id":   targetID,
			"summary":     summary,
			"detail":      detail,
			"status":      status,
			"created_at":  createdAt,
		})
	}
	if logs == nil {
		logs = []map[string]interface{}{}
	}
	return logs, nil
}
