package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"lingxi-core/store"
)

const mysqlMCPSelect = `SELECT id, user_id, name, transport, command, args, env, url, headers, enabled, builtin, description, created_at, updated_at FROM mcp_servers`

func scanMySQLMCPServer(scanner interface {
	Scan(dest ...any) error
}) (store.MCPServer, error) {
	var m store.MCPServer
	var enabled, builtin int
	var args, env, headers []byte
	err := scanner.Scan(&m.ID, &m.UserID, &m.Name, &m.Transport, &m.Command, &args, &env, &m.URL, &headers,
		&enabled, &builtin, &m.Description, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return m, err
	}
	m.Args = string(args)
	m.Env = string(env)
	m.Headers = string(headers)
	m.Enabled = enabled == 1
	m.Builtin = builtin == 1
	return m, nil
}

func (s *MySQLStore) ListMCPServers(ctx context.Context, userID int64) ([]store.MCPServer, error) {
	rows, err := s.db.QueryContext(ctx, mysqlMCPSelect+` WHERE user_id=? OR user_id=0 ORDER BY builtin DESC, id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.MCPServer, 0)
	for rows.Next() {
		m, err := scanMySQLMCPServer(rows)
		if err != nil {
			continue
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *MySQLStore) GetMCPServer(ctx context.Context, userID, id int64) (*store.MCPServer, error) {
	row := s.db.QueryRowContext(ctx, mysqlMCPSelect+` WHERE id=? AND (user_id=? OR user_id=0)`, id, userID)
	m, err := scanMySQLMCPServer(row)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *MySQLStore) UpsertMCPServer(ctx context.Context, userID int64, m *store.MCPServer) (int64, error) {
	enabled := 0
	if m.Enabled {
		enabled = 1
	}
	if m.Args == "" {
		m.Args = "[]"
	}
	if m.Env == "" {
		m.Env = "{}"
	}
	if m.Headers == "" {
		m.Headers = "{}"
	}
	if m.ID > 0 {
		res, err := s.db.ExecContext(ctx, `UPDATE mcp_servers SET
			name=?, transport=?, command=?, args=?, env=?, url=?, headers=?,
			enabled=?, description=?, updated_at=NOW()
			WHERE id=? AND user_id=? AND builtin=0`,
			m.Name, m.Transport, m.Command, m.Args, m.Env, m.URL, m.Headers,
			enabled, m.Description, m.ID, userID)
		if err != nil {
			return 0, err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return 0, fmt.Errorf("mcp server not found")
		}
		return m.ID, nil
	}
	res, err := s.db.ExecContext(ctx, `INSERT INTO mcp_servers
		(user_id, name, transport, command, args, env, url, headers, enabled, builtin, description)
		VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
		userID, m.Name, m.Transport, m.Command, m.Args, m.Env, m.URL, m.Headers,
		enabled, m.Description)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) DeleteMCPServer(ctx context.Context, userID, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM mcp_servers WHERE id=? AND user_id=? AND builtin=0`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *MySQLStore) SetMCPServerEnabled(ctx context.Context, userID, id int64, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	res, err := s.db.ExecContext(ctx, `UPDATE mcp_servers SET enabled=?, updated_at=NOW() WHERE id=? AND user_id=?`, v, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
