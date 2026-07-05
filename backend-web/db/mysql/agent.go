package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"lingxi-core/store"
)

func (s *MySQLStore) ListAgents(ctx context.Context, userID int64) ([]store.Agent, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, name, avatar, description, system_prompt, profile_id,
		skill_ids, mcp_server_ids, knowledge_ids, allow_all, builtin, temperature, max_tokens, post_actions, env_vars, created_at, updated_at
		FROM agents WHERE user_id=? ORDER BY builtin DESC, id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMySQLAgents(rows)
}

func scanMySQLAgents(rows *sql.Rows) ([]store.Agent, error) {
	out := make([]store.Agent, 0)
	for rows.Next() {
		a, err := scanMySQLAgentRow(rows)
		if err != nil {
			continue
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func scanMySQLAgentRow(scanner interface {
	Scan(dest ...any) error
}) (store.Agent, error) {
	var a store.Agent
	var allowAll, builtin int
	err := scanner.Scan(&a.ID, &a.UserID, &a.Name, &a.Avatar, &a.Description, &a.SystemPrompt, &a.ProfileID,
		&a.SkillIDs, &a.MCPServerIDs, &a.KnowledgeIDs, &allowAll, &builtin, &a.Temperature, &a.MaxTokens, &a.PostActions, &a.EnvVars, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return a, err
	}
	a.AllowAll = allowAll == 1
	a.Builtin = builtin == 1
	if a.PostActions == "" {
		a.PostActions = "[]"
	}
	if a.EnvVars == "" {
		a.EnvVars = "{}"
	}
	return a, nil
}

func (s *MySQLStore) GetAgent(ctx context.Context, userID, agentID int64) (*store.Agent, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, name, avatar, description, system_prompt, profile_id,
		skill_ids, mcp_server_ids, knowledge_ids, allow_all, builtin, temperature, max_tokens, post_actions, env_vars, created_at, updated_at
		FROM agents WHERE user_id=? AND id=?`, userID, agentID)
	a, err := scanMySQLAgentRow(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("agent not found")
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *MySQLStore) UpsertAgent(ctx context.Context, userID int64, a *store.Agent) (int64, error) {
	allowAll := 0
	if a.AllowAll {
		allowAll = 1
	}
	if a.SkillIDs == "" {
		a.SkillIDs = "[]"
	}
	if a.MCPServerIDs == "" {
		a.MCPServerIDs = "[]"
	}
	if a.KnowledgeIDs == "" {
		a.KnowledgeIDs = "[]"
	}
	envVars := a.EnvVars
	if envVars == "" {
		envVars = "{}"
	}
	postActions := a.PostActions
	if postActions == "" {
		postActions = "[]"
	}
	if a.ID > 0 {
		res, err := s.db.ExecContext(ctx, `UPDATE agents SET
			name=?, avatar=?, description=?, system_prompt=?, profile_id=?,
			skill_ids=?, mcp_server_ids=?, knowledge_ids=?, allow_all=?,
			temperature=?, max_tokens=?, env_vars=?, post_actions=?, updated_at=CURRENT_TIMESTAMP
			WHERE user_id=? AND id=?`,
			a.Name, a.Avatar, a.Description, a.SystemPrompt, a.ProfileID,
			a.SkillIDs, a.MCPServerIDs, a.KnowledgeIDs, allowAll,
			a.Temperature, a.MaxTokens, envVars, postActions, userID, a.ID)
		if err != nil {
			return 0, err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return 0, fmt.Errorf("agent not found")
		}
		return a.ID, nil
	}
	// 配额检查
	var agentCount, agentLimit int
	err := s.db.QueryRowContext(ctx, `
		SELECT u.agent_count, l.agent_limit FROM usage_quotas u
		JOIN user_quota_limits l ON l.user_id=u.user_id WHERE u.user_id=?`, userID).Scan(&agentCount, &agentLimit)
	if err != nil {
		return 0, err
	}
	if agentCount >= agentLimit {
		return 0, fmt.Errorf("agent limit reached")
	}
	res, err := s.db.ExecContext(ctx, `INSERT INTO agents
		(user_id, name, avatar, description, system_prompt, profile_id, skill_ids, mcp_server_ids, knowledge_ids, allow_all, builtin, temperature, max_tokens, post_actions, env_vars)
		VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,
		userID, a.Name, a.Avatar, a.Description, a.SystemPrompt, a.ProfileID,
		a.SkillIDs, a.MCPServerIDs, a.KnowledgeIDs, allowAll,
		a.Temperature, a.MaxTokens, postActions, envVars)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	_, _ = s.db.ExecContext(ctx, `UPDATE usage_quotas SET agent_count=agent_count+1 WHERE user_id=?`, userID)
	return id, nil
}

func (s *MySQLStore) DeleteAgent(ctx context.Context, userID, agentID int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var builtin int
	if e := tx.QueryRowContext(ctx, `SELECT builtin FROM agents WHERE user_id=? AND id=?`, userID, agentID).Scan(&builtin); e != nil {
		return e
	}
	if builtin == 1 {
		return fmt.Errorf("cannot delete builtin agent")
	}
	tx.ExecContext(ctx, `DELETE FROM scheduled_tasks WHERE user_id=? AND agent_id=?`, userID, agentID)
	tx.ExecContext(ctx, `DELETE FROM memories WHERE user_id=? AND agent_id=?`, userID, agentID)
	tx.ExecContext(ctx, `DELETE FROM evolution_logs WHERE user_id=? AND agent_id=?`, userID, agentID)
	tx.ExecContext(ctx, `DELETE FROM agent_nexus_config WHERE user_id=? AND agent_id=?`, userID, agentID)
	tx.ExecContext(ctx, `DELETE FROM agent_personalities WHERE user_id=? AND agent_id=?`, userID, agentID)
	tx.ExecContext(ctx, `UPDATE sessions SET agent_id=0 WHERE user_id=? AND agent_id=?`, userID, agentID)
	tx.ExecContext(ctx, `UPDATE im_connectors SET agent_id=0 WHERE user_id=? AND agent_id=?`, userID, agentID)
	res, err := tx.ExecContext(ctx, `DELETE FROM agents WHERE user_id=? AND id=?`, userID, agentID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("agent not found")
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE usage_quotas SET agent_count=GREATEST(agent_count-1,0) WHERE user_id=?`, userID)
	return nil
}
