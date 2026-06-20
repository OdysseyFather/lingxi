package db

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"time"
)

// H5AccessToken 远程访问令牌
type H5AccessToken struct {
	ID           int64  `json:"id"`
	TokenPreview string `json:"token_preview"`
	TokenHash    string `json:"-"`
	Label        string `json:"label"`
	Enabled      bool   `json:"enabled"`
	AccessURL    string `json:"access_url,omitempty"`
	ExpiresAt    string `json:"expires_at,omitempty"`
	LastUsedAt   string `json:"last_used_at,omitempty"`
	CreatedAt    string `json:"created_at"`
	// 手机配对扩展字段
	Permanent  bool   `json:"permanent"`
	DeviceID   string `json:"device_id,omitempty"`
	Platform   string `json:"platform,omitempty"`
	DeviceName string `json:"device_name,omitempty"`
	PushToken  string `json:"push_token,omitempty"`
	LastSeenAt string `json:"last_seen_at,omitempty"`
}

// MigrateH5Access 创建 H5 远程访问相关表
func MigrateH5Access() {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS h5_access_tokens (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			token_hash   TEXT    NOT NULL UNIQUE,
			token_preview TEXT   NOT NULL DEFAULT '',
			label        TEXT    NOT NULL DEFAULT '',
			enabled      INTEGER NOT NULL DEFAULT 1,
			expires_at   DATETIME,
			last_used_at DATETIME,
			created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS h5_access_settings (
			id                 INTEGER PRIMARY KEY DEFAULT 1,
			enabled            INTEGER NOT NULL DEFAULT 0,
			permission_mode    TEXT    NOT NULL DEFAULT 'readonly',
			allowed_origins    TEXT    NOT NULL DEFAULT '[]',
			updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s); err != nil {
			slog.Warn("h5 access migrate error", "err", err)
		}
	}
	DB.Exec(`INSERT OR IGNORE INTO h5_access_settings (id) VALUES (1)`)
	addColumnIfMissing("h5_access_tokens", "access_url", "TEXT NOT NULL DEFAULT ''")
	// 手机配对扩展列
	addColumnIfMissing("h5_access_tokens", "permanent", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("h5_access_tokens", "device_id", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("h5_access_tokens", "platform", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("h5_access_tokens", "device_name", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("h5_access_tokens", "push_token", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("h5_access_tokens", "last_seen_at", "DATETIME")
}

// GenerateH5Token 生成新的访问令牌（返回明文 token 仅此一次可见）
func GenerateH5Token(label string, ttlHours int, accessURL ...string) (string, *H5AccessToken, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	token := "lx_" + hex.EncodeToString(raw)
	hash := sha256Hash(token)
	preview := token[:7] + "..." + token[len(token)-4:]

	var expiresAt *string
	if ttlHours > 0 {
		t := time.Now().Add(time.Duration(ttlHours) * time.Hour).UTC().Format("2006-01-02 15:04:05")
		expiresAt = &t
	}

	aURL := ""
	if len(accessURL) > 0 {
		aURL = accessURL[0]
	}

	res, err := DB.Exec(`INSERT INTO h5_access_tokens (token_hash, token_preview, label, expires_at, access_url) VALUES (?,?,?,?,?)`,
		hash, preview, label, expiresAt, aURL)
	if err != nil {
		return "", nil, err
	}

	id, _ := res.LastInsertId()
	rec := &H5AccessToken{
		ID:           id,
		TokenPreview: preview,
		TokenHash:    hash,
		Label:        label,
		Enabled:      true,
		AccessURL:    aURL,
		CreatedAt:    time.Now().UTC().Format("2006-01-02 15:04:05"),
	}
	if expiresAt != nil {
		rec.ExpiresAt = *expiresAt
	}

	return token, rec, nil
}

// ValidateH5Token 验证令牌（返回 token record 或 nil）
// permanent=1 的永久 token 跳过过期检查
func ValidateH5Token(token string) (*H5AccessToken, error) {
	hash := sha256Hash(token)
	var t H5AccessToken
	var expiresAt, lastUsedAt, lastSeenAt *string
	err := DB.QueryRow(`SELECT id, token_hash, token_preview, label, enabled,
		expires_at, last_used_at, created_at,
		permanent, device_id, platform, device_name, push_token, last_seen_at
		FROM h5_access_tokens WHERE token_hash=?`, hash).
		Scan(&t.ID, &t.TokenHash, &t.TokenPreview, &t.Label, &t.Enabled,
			&expiresAt, &lastUsedAt, &t.CreatedAt,
			&t.Permanent, &t.DeviceID, &t.Platform, &t.DeviceName, &t.PushToken, &lastSeenAt)
	if err != nil {
		return nil, err
	}
	if !t.Enabled {
		return nil, nil
	}
	// 永久 token 跳过过期检查
	if !t.Permanent && expiresAt != nil {
		t.ExpiresAt = *expiresAt
		exp, err := time.Parse("2006-01-02 15:04:05", *expiresAt)
		if err == nil && time.Now().UTC().After(exp) {
			return nil, nil
		}
	}
	if expiresAt != nil {
		t.ExpiresAt = *expiresAt
	}
	if lastUsedAt != nil {
		t.LastUsedAt = *lastUsedAt
	}
	if lastSeenAt != nil {
		t.LastSeenAt = *lastSeenAt
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	DB.Exec(`UPDATE h5_access_tokens SET last_used_at=?, last_seen_at=? WHERE id=?`, now, now, t.ID)
	return &t, nil
}

// ListH5Tokens 列出所有令牌
func ListH5Tokens() ([]H5AccessToken, error) {
	rows, err := DB.Query(`SELECT id, token_preview, label, enabled, COALESCE(access_url,''), COALESCE(expires_at,''), COALESCE(last_used_at,''), created_at FROM h5_access_tokens ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []H5AccessToken
	for rows.Next() {
		var t H5AccessToken
		if err := rows.Scan(&t.ID, &t.TokenPreview, &t.Label, &t.Enabled, &t.AccessURL, &t.ExpiresAt, &t.LastUsedAt, &t.CreatedAt); err != nil {
			continue
		}
		list = append(list, t)
	}
	return list, nil
}

// RevokeH5Token 吊销令牌
func RevokeH5Token(id int64) error {
	_, err := DB.Exec(`UPDATE h5_access_tokens SET enabled=0 WHERE id=?`, id)
	return err
}

// DeleteH5Token 删除令牌
func DeleteH5Token(id int64) error {
	_, err := DB.Exec(`DELETE FROM h5_access_tokens WHERE id=?`, id)
	return err
}

// H5AccessSettings 远程访问全局设置
type H5AccessSettings struct {
	Enabled        bool   `json:"enabled"`
	PermissionMode string `json:"permission_mode"`
	AllowedOrigins string `json:"allowed_origins"`
}

// GetH5AccessSettings 获取远程访问设置
func GetH5AccessSettings() (*H5AccessSettings, error) {
	var s H5AccessSettings
	err := DB.QueryRow(`SELECT enabled, permission_mode, allowed_origins FROM h5_access_settings WHERE id=1`).
		Scan(&s.Enabled, &s.PermissionMode, &s.AllowedOrigins)
	if err != nil {
		return &H5AccessSettings{PermissionMode: "readonly", AllowedOrigins: "[]"}, nil
	}
	return &s, nil
}

// UpdateH5AccessSettings 更新远程访问设置
func UpdateH5AccessSettings(enabled bool, permissionMode, allowedOrigins string) error {
	_, err := DB.Exec(`UPDATE h5_access_settings SET enabled=?, permission_mode=?, allowed_origins=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
		enabled, permissionMode, allowedOrigins)
	return err
}

func sha256Hash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// ─── 手机配对扩展 ──────────────────────────────────────────────────

// SetTokenPermanent 设置 token 为永久配对类型并写入设备信息
func SetTokenPermanent(tokenID int64, deviceID, deviceName, platform string) {
	DB.Exec(`UPDATE h5_access_tokens SET permanent=1, device_id=?, device_name=?, platform=? WHERE id=?`,
		deviceID, deviceName, platform, tokenID)
}

// ListPairedDevices 列出所有永久配对设备
func ListPairedDevices() ([]H5AccessToken, error) {
	rows, err := DB.Query(`SELECT id, token_preview, label, enabled,
		COALESCE(access_url,''), COALESCE(expires_at,''), COALESCE(last_used_at,''), created_at,
		permanent, COALESCE(device_id,''), COALESCE(platform,''), COALESCE(device_name,''),
		COALESCE(push_token,''), COALESCE(last_seen_at,'')
		FROM h5_access_tokens WHERE permanent=1 ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []H5AccessToken
	for rows.Next() {
		var t H5AccessToken
		if err := rows.Scan(&t.ID, &t.TokenPreview, &t.Label, &t.Enabled,
			&t.AccessURL, &t.ExpiresAt, &t.LastUsedAt, &t.CreatedAt,
			&t.Permanent, &t.DeviceID, &t.Platform, &t.DeviceName,
			&t.PushToken, &t.LastSeenAt); err != nil {
			continue
		}
		list = append(list, t)
	}
	return list, nil
}

// UnpairDevice 删除指定配对设备（仅限 permanent 记录）
func UnpairDevice(idStr string) error {
	_, err := DB.Exec(`DELETE FROM h5_access_tokens WHERE id=? AND permanent=1`, idStr)
	return err
}

// RotateDeviceToken 轮换配对设备的 token：生成新 token，更新 hash 和 preview
func RotateDeviceToken(idStr string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	newToken := "lx_" + hex.EncodeToString(raw)
	hash := sha256Hash(newToken)
	preview := newToken[:8] + "..." + newToken[len(newToken)-4:]

	_, err := DB.Exec(`UPDATE h5_access_tokens SET token_hash=?, token_preview=? WHERE id=? AND permanent=1`,
		hash, preview, idStr)
	if err != nil {
		return "", err
	}
	return newToken, nil
}

// SetDevicePushToken 为配对设备注册推送 token
func SetDevicePushToken(idStr string, pushToken string) error {
	_, err := DB.Exec(`UPDATE h5_access_tokens SET push_token=? WHERE id=? AND permanent=1`, pushToken, idStr)
	return err
}

// RevokeAllPairedDevices 撤销所有永久配对设备
func RevokeAllPairedDevices() error {
	_, err := DB.Exec(`DELETE FROM h5_access_tokens WHERE permanent=1`)
	return err
}
