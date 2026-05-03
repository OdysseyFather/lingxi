package db

import (
	"time"
)

// ─── MCP Servers ─────────────────────────────────────────────────

type MCPServer struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Transport   string    `json:"transport"` // stdio | sse | http
	Command     string    `json:"command"`
	Args        string    `json:"args"`    // JSON array
	Env         string    `json:"env"`     // JSON object
	URL         string    `json:"url"`
	Headers     string    `json:"headers"` // JSON object
	Enabled     bool      `json:"enabled"`
	Builtin     bool      `json:"builtin"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func ListMCPServers() ([]MCPServer, error) {
	rows, err := DB.Query(`SELECT id, name, transport, command, args, env, url, headers, enabled, builtin, description, created_at, updated_at
		FROM mcp_servers ORDER BY builtin DESC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]MCPServer, 0)
	for rows.Next() {
		var m MCPServer
		var enabled, builtin int
		if err := rows.Scan(&m.ID, &m.Name, &m.Transport, &m.Command, &m.Args, &m.Env, &m.URL, &m.Headers,
			&enabled, &builtin, &m.Description, &m.CreatedAt, &m.UpdatedAt); err != nil {
			continue
		}
		m.Enabled = enabled == 1
		m.Builtin = builtin == 1
		out = append(out, m)
	}
	return out, nil
}

func GetMCPServer(id int64) (*MCPServer, error) {
	var m MCPServer
	var enabled, builtin int
	err := DB.QueryRow(`SELECT id, name, transport, command, args, env, url, headers, enabled, builtin, description, created_at, updated_at
		FROM mcp_servers WHERE id=?`, id).
		Scan(&m.ID, &m.Name, &m.Transport, &m.Command, &m.Args, &m.Env, &m.URL, &m.Headers,
			&enabled, &builtin, &m.Description, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	m.Enabled = enabled == 1
	m.Builtin = builtin == 1
	return &m, nil
}

func UpsertMCPServer(m *MCPServer) (int64, error) {
	enabled := 0
	if m.Enabled {
		enabled = 1
	}
	if m.ID > 0 {
		_, err := DB.Exec(`UPDATE mcp_servers SET
			name=?, transport=?, command=?, args=?, env=?, url=?, headers=?,
			enabled=?, description=?, updated_at=CURRENT_TIMESTAMP
			WHERE id=?`,
			m.Name, m.Transport, m.Command, m.Args, m.Env, m.URL, m.Headers,
			enabled, m.Description, m.ID)
		return m.ID, err
	}
	res, err := DB.Exec(`INSERT INTO mcp_servers
		(name, transport, command, args, env, url, headers, enabled, builtin, description)
		VALUES (?,?,?,?,?,?,?,?,0,?)`,
		m.Name, m.Transport, m.Command, m.Args, m.Env, m.URL, m.Headers,
		enabled, m.Description)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func DeleteMCPServer(id int64) error {
	_, err := DB.Exec(`DELETE FROM mcp_servers WHERE id=? AND builtin=0`, id)
	return err
}

func SetMCPServerEnabled(id int64, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := DB.Exec(`UPDATE mcp_servers SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, v, id)
	return err
}

// ─── Agents ──────────────────────────────────────────────────────

type Agent struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	Avatar        string    `json:"avatar"`
	Description   string    `json:"description"`
	SystemPrompt  string    `json:"system_prompt"`
	ProfileID     int64     `json:"profile_id"`
	SkillIDs      string    `json:"skill_ids"`      // JSON array
	MCPServerIDs  string    `json:"mcp_server_ids"` // JSON array
	KnowledgeIDs  string    `json:"knowledge_ids"`  // JSON array
	AllowAll      bool      `json:"allow_all"`
	Builtin       bool      `json:"builtin"`
	Temperature   float64   `json:"temperature"`
	MaxTokens     int64     `json:"max_tokens"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func ListAgents() ([]Agent, error) {
	rows, err := DB.Query(`SELECT id, name, avatar, description, system_prompt, profile_id,
		skill_ids, mcp_server_ids, knowledge_ids, allow_all, builtin, temperature, max_tokens, created_at, updated_at
		FROM agents ORDER BY builtin DESC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Agent, 0)
	for rows.Next() {
		var a Agent
		var allowAll, builtin int
		if err := rows.Scan(&a.ID, &a.Name, &a.Avatar, &a.Description, &a.SystemPrompt, &a.ProfileID,
			&a.SkillIDs, &a.MCPServerIDs, &a.KnowledgeIDs, &allowAll, &builtin, &a.Temperature, &a.MaxTokens, &a.CreatedAt, &a.UpdatedAt); err != nil {
			continue
		}
		a.AllowAll = allowAll == 1
		a.Builtin = builtin == 1
		out = append(out, a)
	}
	return out, nil
}

func GetAgent(id int64) (*Agent, error) {
	var a Agent
	var allowAll, builtin int
	err := DB.QueryRow(`SELECT id, name, avatar, description, system_prompt, profile_id,
		skill_ids, mcp_server_ids, knowledge_ids, allow_all, builtin, temperature, max_tokens, created_at, updated_at
		FROM agents WHERE id=?`, id).
		Scan(&a.ID, &a.Name, &a.Avatar, &a.Description, &a.SystemPrompt, &a.ProfileID,
			&a.SkillIDs, &a.MCPServerIDs, &a.KnowledgeIDs, &allowAll, &builtin, &a.Temperature, &a.MaxTokens, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	a.AllowAll = allowAll == 1
	a.Builtin = builtin == 1
	return &a, nil
}

func UpsertAgent(a *Agent) (int64, error) {
	allowAll := 0
	if a.AllowAll {
		allowAll = 1
	}
	if a.ID > 0 {
		_, err := DB.Exec(`UPDATE agents SET
			name=?, avatar=?, description=?, system_prompt=?, profile_id=?,
			skill_ids=?, mcp_server_ids=?, knowledge_ids=?, allow_all=?,
			temperature=?, max_tokens=?, updated_at=CURRENT_TIMESTAMP
			WHERE id=?`,
			a.Name, a.Avatar, a.Description, a.SystemPrompt, a.ProfileID,
			a.SkillIDs, a.MCPServerIDs, a.KnowledgeIDs, allowAll,
			a.Temperature, a.MaxTokens, a.ID)
		return a.ID, err
	}
	res, err := DB.Exec(`INSERT INTO agents
		(name, avatar, description, system_prompt, profile_id, skill_ids, mcp_server_ids, knowledge_ids, allow_all, builtin, temperature, max_tokens)
		VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`,
		a.Name, a.Avatar, a.Description, a.SystemPrompt, a.ProfileID,
		a.SkillIDs, a.MCPServerIDs, a.KnowledgeIDs, allowAll,
		a.Temperature, a.MaxTokens)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func DeleteAgent(id int64) error {
	_, err := DB.Exec(`DELETE FROM agents WHERE id=? AND builtin=0`, id)
	return err
}

// ─── Sessions ↔ Agent ─────────────────────────────────────────────

func SetSessionAgent(sessionID, agentID int64) error {
	_, err := DB.Exec(`UPDATE sessions SET agent_id=? WHERE id=?`, agentID, sessionID)
	return err
}

func GetSessionAgentID(sessionID int64) int64 {
	var id int64
	DB.QueryRow(`SELECT COALESCE(agent_id,0) FROM sessions WHERE id=?`, sessionID).Scan(&id)
	return id
}

