package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"lingxi-core/store"
)

func (s *MySQLStore) GetUserByUsername(ctx context.Context, username string) (*store.WebUser, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, username, COALESCE(email,''), password_hash, role, status, display_name, last_login_at, created_at
		FROM users WHERE username=? AND status != 'deleted'`, username)
	return scanWebUser(row)
}

func (s *MySQLStore) GetUserByID(ctx context.Context, userID int64) (*store.WebUser, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, username, COALESCE(email,''), password_hash, role, status, display_name, last_login_at, created_at
		FROM users WHERE id=? AND status != 'deleted'`, userID)
	return scanWebUser(row)
}

func scanWebUser(row *sql.Row) (*store.WebUser, error) {
	var u store.WebUser
	var email sql.NullString
	var lastLogin sql.NullTime
	err := row.Scan(&u.ID, &u.Username, &email, &u.PasswordHash, &u.Role, &u.Status, &u.DisplayName, &lastLogin, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, err
	}
	if email.Valid {
		u.Email = email.String
	}
	if lastLogin.Valid {
		t := lastLogin.Time
		u.LastLoginAt = &t
	}
	return &u, nil
}

func (s *MySQLStore) CreateUser(ctx context.Context, u *store.WebUser) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO users (username, email, password_hash, role, status, display_name)
		VALUES (?, NULLIF(?, ''), ?, ?, ?, ?)`,
		u.Username, u.Email, u.PasswordHash, u.Role, u.Status, u.DisplayName)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO user_quota_limits (user_id) VALUES (?)`, id)
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO usage_quotas (user_id) VALUES (?)`, id)
	return id, nil
}

func (s *MySQLStore) CreateAuthToken(ctx context.Context, t *store.AuthToken) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO auth_tokens (user_id, token_hash, device_info, ip_address, expires_at)
		VALUES (?, ?, ?, ?, ?)`,
		t.UserID, t.TokenHash, t.DeviceInfo, t.IPAddress, t.ExpiresAt)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) GetAuthTokenByHash(ctx context.Context, hash string) (*store.AuthToken, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, token_hash, COALESCE(device_info,''), COALESCE(ip_address,''), expires_at
		FROM auth_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at > NOW()`, hash)
	var t store.AuthToken
	err := row.Scan(&t.ID, &t.UserID, &t.TokenHash, &t.DeviceInfo, &t.IPAddress, &t.ExpiresAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("token not found")
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *MySQLStore) RevokeAuthToken(ctx context.Context, tokenID int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE auth_tokens SET revoked_at=NOW() WHERE id=?`, tokenID)
	return err
}

func (s *MySQLStore) GetInvitationByCode(ctx context.Context, code string) (*store.Invitation, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, code, role, max_uses, used_count, expires_at
		FROM invitations WHERE code=?`, code)
	var inv store.Invitation
	var exp sql.NullTime
	err := row.Scan(&inv.ID, &inv.Code, &inv.Role, &inv.MaxUses, &inv.UsedCount, &exp)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("invitation not found")
	}
	if err != nil {
		return nil, err
	}
	if exp.Valid {
		t := exp.Time
		inv.ExpiresAt = &t
		if time.Now().After(t) {
			return nil, fmt.Errorf("invitation expired")
		}
	}
	if inv.UsedCount >= inv.MaxUses {
		return nil, fmt.Errorf("invitation exhausted")
	}
	return &inv, nil
}

func CountUsers(ctx context.Context) (int, error) {
	var n int
	err := DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM users WHERE status != 'deleted'`).Scan(&n)
	return n, err
}

func UpdateLastLogin(ctx context.Context, userID int64) error {
	_, err := DB.ExecContext(ctx, `UPDATE users SET last_login_at=NOW() WHERE id=?`, userID)
	return err
}

func UseInvitation(ctx context.Context, code string) error {
	res, err := DB.ExecContext(ctx, `
		UPDATE invitations SET used_count=used_count+1
		WHERE code=? AND used_count < max_uses`, code)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("invitation unavailable")
	}
	return nil
}

func (s *MySQLStore) ListAllUserIDs(ctx context.Context) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM users WHERE status='active'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
