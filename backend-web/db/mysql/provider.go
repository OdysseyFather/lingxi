package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"lingxi-core/store"
)

func (s *MySQLStore) ListProviders(ctx context.Context) ([]store.Provider, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, code, name, protocol, default_base_url, default_model, usage_api_meta, doc_url, builtin
		FROM providers ORDER BY builtin DESC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.Provider, 0)
	for rows.Next() {
		var p store.Provider
		var builtin int
		var meta []byte
		if err := rows.Scan(&p.ID, &p.Code, &p.Name, &p.Protocol, &p.DefaultBaseURL, &p.DefaultModel, &meta, &p.DocURL, &builtin); err != nil {
			continue
		}
		p.UsageAPIMeta = string(meta)
		p.Builtin = builtin == 1
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *MySQLStore) GetProvider(ctx context.Context, id int64) (*store.Provider, error) {
	var p store.Provider
	var builtin int
	var meta []byte
	err := s.db.QueryRowContext(ctx, `SELECT id, code, name, protocol, default_base_url, default_model, usage_api_meta, doc_url, builtin
		FROM providers WHERE id=?`, id).
		Scan(&p.ID, &p.Code, &p.Name, &p.Protocol, &p.DefaultBaseURL, &p.DefaultModel, &meta, &p.DocURL, &builtin)
	if err != nil {
		return nil, err
	}
	p.UsageAPIMeta = string(meta)
	p.Builtin = builtin == 1
	return &p, nil
}

const mysqlAPIProfileSelect = `
	SELECT p.id, p.user_id, p.name, p.provider_id,
	       COALESCE(NULLIF(p.provider_code,''), pr.code, ''),
	       COALESCE(NULLIF(p.provider_name,''), pr.name, ''),
	       COALESCE(NULLIF(p.provider_protocol,''), pr.protocol, 'anthropic'),
	       p.base_url, p.model, p.auth_token_encrypted, p.auth_token_mask, p.extra, p.transformer, p.is_active, p.created_at, p.updated_at
	FROM api_profiles p LEFT JOIN providers pr ON pr.id=p.provider_id`

func scanMySQLAPIProfile(scanner interface {
	Scan(dest ...any) error
}, includeCipher bool) (store.APIProfile, error) {
	var ap store.APIProfile
	var active int
	var enc []byte
	var extra []byte
	err := scanner.Scan(&ap.ID, &ap.UserID, &ap.Name, &ap.ProviderID, &ap.ProviderCode, &ap.ProviderName, &ap.ProviderProtocol,
		&ap.BaseURL, &ap.Model, &enc, &ap.AuthTokenMask, &extra, &ap.Transformer, &active, &ap.CreatedAt, &ap.UpdatedAt)
	if err != nil {
		return ap, err
	}
	ap.Extra = string(extra)
	ap.IsActive = active == 1
	if includeCipher && len(enc) > 0 {
		ap.AuthTokenCipher = string(enc)
	}
	return ap, nil
}

func (s *MySQLStore) ListAPIProfiles(ctx context.Context, userID int64, includeCipher bool) ([]store.APIProfile, error) {
	rows, err := s.db.QueryContext(ctx, mysqlAPIProfileSelect+` WHERE p.user_id=? ORDER BY p.is_active DESC, p.updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.APIProfile, 0)
	for rows.Next() {
		ap, err := scanMySQLAPIProfile(rows, includeCipher)
		if err != nil {
			continue
		}
		out = append(out, ap)
	}
	return out, rows.Err()
}

func (s *MySQLStore) GetAPIProfile(ctx context.Context, userID, id int64, includeCipher bool) (*store.APIProfile, error) {
	row := s.db.QueryRowContext(ctx, mysqlAPIProfileSelect+` WHERE p.user_id=? AND p.id=?`, userID, id)
	ap, err := scanMySQLAPIProfile(row, includeCipher)
	if err != nil {
		return nil, err
	}
	return &ap, nil
}

func (s *MySQLStore) GetActiveAPIProfile(ctx context.Context, userID int64, includeCipher bool) (*store.APIProfile, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM api_profiles WHERE user_id=? AND is_active=1 LIMIT 1`, userID).Scan(&id)
	if err != nil {
		return nil, err
	}
	return s.GetAPIProfile(ctx, userID, id, includeCipher)
}

func (s *MySQLStore) UpsertAPIProfile(ctx context.Context, userID int64, ap *store.APIProfile) (int64, error) {
	if ap.Extra == "" {
		ap.Extra = "{}"
	}
	enc := []byte(ap.AuthTokenCipher)
	if ap.ID > 0 {
		res, err := s.db.ExecContext(ctx, `
			UPDATE api_profiles SET
				name=?, provider_id=?, provider_code=?, provider_name=?, provider_protocol=?,
				base_url=?, model=?,
				auth_token_encrypted=?, auth_token_mask=?, extra=?, transformer=?, updated_at=NOW()
			WHERE id=? AND user_id=?`,
			ap.Name, ap.ProviderID, ap.ProviderCode, ap.ProviderName, ap.ProviderProtocol,
			ap.BaseURL, ap.Model,
			enc, ap.AuthTokenMask, ap.Extra, ap.Transformer, ap.ID, userID)
		if err != nil {
			return 0, err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return 0, fmt.Errorf("api profile not found")
		}
		return ap.ID, nil
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO api_profiles (user_id, name, provider_id, provider_code, provider_name, provider_protocol,
			base_url, model, auth_token_encrypted, auth_token_mask, extra, transformer)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		userID, ap.Name, ap.ProviderID, ap.ProviderCode, ap.ProviderName, ap.ProviderProtocol,
		ap.BaseURL, ap.Model, enc, ap.AuthTokenMask, ap.Extra, ap.Transformer)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) DeleteAPIProfile(ctx context.Context, userID, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM api_profiles WHERE id=? AND user_id=?`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *MySQLStore) ActivateAPIProfile(ctx context.Context, userID, id int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE api_profiles SET is_active=0 WHERE user_id=?`, userID); err != nil {
		tx.Rollback()
		return err
	}
	res, err := tx.ExecContext(ctx, `UPDATE api_profiles SET is_active=1, updated_at=NOW() WHERE id=? AND user_id=?`, id, userID)
	if err != nil {
		tx.Rollback()
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		tx.Rollback()
		return sql.ErrNoRows
	}
	return tx.Commit()
}
