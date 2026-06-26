package db

import (
	"log/slog"
	"time"

	"lingxi-agent/crypto"
)

// ─── IM Connectors ───────────────────────────────────────────────

type IMConnector struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Platform     string    `json:"platform"`
	AgentID      int64     `json:"agent_id"`
	Enabled      bool      `json:"enabled"`
	Config       string    `json:"config"`
	DecryptError string    `json:"decrypt_error,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func UpsertIMConnector(id int64, name, platform string, agentID int64, configJSON string) (int64, error) {
	encrypted, err := crypto.Encrypt(configJSON)
	if err != nil {
		slog.Warn("[im-connector] encrypt config failed, storing plaintext", "err", err)
		encrypted = configJSON
	}

	if id > 0 {
		_, err := DB.Exec(`UPDATE im_connectors SET name=?, platform=?, agent_id=?, config=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
			name, platform, agentID, encrypted, id)
		return id, err
	}
	res, err := DB.Exec(`INSERT INTO im_connectors (name, platform, agent_id, config) VALUES (?,?,?,?)`,
		name, platform, agentID, encrypted)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func SetIMConnectorEnabled(id int64, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := DB.Exec(`UPDATE im_connectors SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, v, id)
	return err
}

func ListIMConnectors() ([]IMConnector, error) {
	rows, err := DB.Query(`SELECT id, name, platform, agent_id, enabled, config, created_at, updated_at FROM im_connectors ORDER BY platform, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []IMConnector
	for rows.Next() {
		var c IMConnector
		var enabled int
		if err := rows.Scan(&c.ID, &c.Name, &c.Platform, &c.AgentID, &enabled, &c.Config, &c.CreatedAt, &c.UpdatedAt); err != nil {
			continue
		}
		c.Enabled = enabled == 1
		if decrypted, derr := crypto.Decrypt(c.Config); derr == nil {
			c.Config = decrypted
		} else {
			c.DecryptError = derr.Error()
		}
		result = append(result, c)
	}
	return result, nil
}

func GetIMConnectorByID(id int64) (*IMConnector, error) {
	var c IMConnector
	var enabled int
	err := DB.QueryRow(`SELECT id, name, platform, agent_id, enabled, config, created_at, updated_at FROM im_connectors WHERE id=?`, id).
		Scan(&c.ID, &c.Name, &c.Platform, &c.AgentID, &enabled, &c.Config, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	c.Enabled = enabled == 1
	if decrypted, derr := crypto.Decrypt(c.Config); derr == nil {
		c.Config = decrypted
	} else {
		c.DecryptError = derr.Error()
	}
	return &c, nil
}

func GetIMConnector(platform string) (*IMConnector, error) {
	var c IMConnector
	var enabled int
	err := DB.QueryRow(`SELECT id, name, platform, agent_id, enabled, config, created_at, updated_at FROM im_connectors WHERE platform=? AND enabled=1 LIMIT 1`, platform).
		Scan(&c.ID, &c.Name, &c.Platform, &c.AgentID, &enabled, &c.Config, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	c.Enabled = enabled == 1
	if decrypted, derr := crypto.Decrypt(c.Config); derr == nil {
		c.Config = decrypted
	} else {
		c.DecryptError = derr.Error()
	}
	return &c, nil
}

func DeleteIMConnectorByID(id int64) error {
	_, err := DB.Exec(`DELETE FROM im_connectors WHERE id=?`, id)
	return err
}

func DeleteIMConnector(platform string) error {
	_, err := DB.Exec(`DELETE FROM im_connectors WHERE platform=?`, platform)
	return err
}

// ─── IM Sessions（群/用户 → session 映射）────────────────────────

func GetOrCreateIMSession(platform, scopeKey, title string, ttlHours int, agentID ...int64) (int64, error) {
	var sessionID int64
	var lastActiveStr string

	err := DB.QueryRow(
		`SELECT session_id, last_active FROM im_sessions WHERE platform=? AND scope_key=?`,
		platform, scopeKey,
	).Scan(&sessionID, &lastActiveStr)

	if err == nil {
		expired := false
		if ttlHours > 0 {
			if lastActive, e := time.Parse("2006-01-02 15:04:05", lastActiveStr); e == nil {
				expired = time.Since(lastActive) > time.Duration(ttlHours)*time.Hour
				slog.Info("[im-session] found existing session",
					"platform", platform, "scope_key", scopeKey,
					"session_id", sessionID, "last_active", lastActiveStr,
					"expired", expired)
			} else {
				slog.Warn("[im-session] failed to parse last_active",
					"platform", platform, "scope_key", scopeKey,
					"last_active_raw", lastActiveStr, "err", e)
			}
		}
		if !expired {
			DB.Exec(`UPDATE im_sessions SET last_active=CURRENT_TIMESTAMP WHERE platform=? AND scope_key=?`, platform, scopeKey)
			// 强制同步 IMConnector 配置的 agent_id 到 session
			// 之前用 COALESCE(agent_id,0)=0 条件导致切换绑定 agent 后旧 session 不更新，
			// runner 反查 sessions.agent_id 拿到旧值，system_prompt 不注入
			if len(agentID) > 0 && agentID[0] > 0 {
				DB.Exec(`UPDATE sessions SET agent_id=? WHERE id=?`, agentID[0], sessionID)
			}
			return sessionID, nil
		}
	} else {
		slog.Info("[im-session] no existing session found, creating new",
			"platform", platform, "scope_key", scopeKey, "err", err)
	}

	var aid int64
	if len(agentID) > 0 {
		aid = agentID[0]
	}
	res, e := DB.Exec(`INSERT INTO sessions (title, agent_id) VALUES (?, ?)`, title, aid)
	if e != nil {
		return 0, e
	}
	newSessionID, _ := res.LastInsertId()

	_, e = DB.Exec(`
		INSERT INTO im_sessions (platform, scope_key, session_id)
		VALUES (?, ?, ?)
		ON CONFLICT(platform, scope_key) DO UPDATE SET
			session_id=excluded.session_id,
			last_active=CURRENT_TIMESTAMP
	`, platform, scopeKey, newSessionID)
	if e != nil {
		return 0, e
	}
	return newSessionID, nil
}

func TouchIMSession(platform, scopeKey string) {
	DB.Exec(`UPDATE im_sessions SET last_active=CURRENT_TIMESTAMP WHERE platform=? AND scope_key=?`, platform, scopeKey)
}
