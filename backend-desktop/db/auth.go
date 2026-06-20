package db

import (
	"log/slog"
	"time"

	"lingxi-agent/crypto"
)

// ─── Users ───────────────────────────────────────────────────────

type User struct {
	ID         int64     `json:"id"`
	Provider   string    `json:"provider"`
	ProviderID string    `json:"provider_id"`
	Nickname   string    `json:"nickname"`
	AvatarURL  string    `json:"avatar_url"`
	Email      string    `json:"email"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func CreateUser(u *User) (int64, error) {
	res, err := DB.Exec(`INSERT INTO users (provider, provider_id, nickname, avatar_url, email)
		VALUES (?,?,?,?,?)`, u.Provider, u.ProviderID, u.Nickname, u.AvatarURL, u.Email)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func GetCurrentUser() (*User, error) {
	var u User
	err := DB.QueryRow(`SELECT id, provider, provider_id, nickname, avatar_url, email, created_at, updated_at
		FROM users ORDER BY id DESC LIMIT 1`).
		Scan(&u.ID, &u.Provider, &u.ProviderID, &u.Nickname, &u.AvatarURL, &u.Email, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func GetUserByProviderID(provider, providerID string) (*User, error) {
	var u User
	err := DB.QueryRow(`SELECT id, provider, provider_id, nickname, avatar_url, email, created_at, updated_at
		FROM users WHERE provider=? AND provider_id=?`, provider, providerID).
		Scan(&u.ID, &u.Provider, &u.ProviderID, &u.Nickname, &u.AvatarURL, &u.Email, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func UpdateUser(id int64, nickname, avatarURL, email string) error {
	_, err := DB.Exec(`UPDATE users SET nickname=?, avatar_url=?, email=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		nickname, avatarURL, email, id)
	return err
}

func HasAnyUser() bool {
	var cnt int
	DB.QueryRow(`SELECT COUNT(1) FROM users`).Scan(&cnt)
	return cnt > 0
}

func DeleteAllUsers() error {
	_, err := DB.Exec(`DELETE FROM users`)
	return err
}

// ─── OAuth Configs ──────────────────────────────────────────────

type OAuthConfig struct {
	ID        int64  `json:"id"`
	Provider  string `json:"provider"`
	AppID     string `json:"app_id"`
	AppSecret string `json:"app_secret"`
	Extra     string `json:"extra"`
}

func GetOAuthConfig(provider string) (*OAuthConfig, error) {
	var c OAuthConfig
	err := DB.QueryRow(`SELECT id, provider, app_id, app_secret, extra FROM oauth_configs WHERE provider=?`, provider).
		Scan(&c.ID, &c.Provider, &c.AppID, &c.AppSecret, &c.Extra)
	if err != nil {
		return nil, err
	}
	if decrypted, derr := crypto.Decrypt(c.AppSecret); derr == nil {
		c.AppSecret = decrypted
	} else {
		slog.Warn("[oauth] decrypt app_secret failed", "provider", provider, "err", derr)
	}
	return &c, nil
}

func UpsertOAuthConfig(c *OAuthConfig) error {
	encrypted, err := crypto.Encrypt(c.AppSecret)
	if err != nil {
		slog.Warn("[oauth] encrypt app_secret failed, storing plaintext", "err", err)
		encrypted = c.AppSecret
	}
	_, err = DB.Exec(`
		INSERT INTO oauth_configs (provider, app_id, app_secret, extra)
		VALUES (?,?,?,?)
		ON CONFLICT(provider) DO UPDATE SET
			app_id=excluded.app_id,
			app_secret=excluded.app_secret,
			extra=excluded.extra,
			updated_at=CURRENT_TIMESTAMP
	`, c.Provider, c.AppID, encrypted, c.Extra)
	return err
}

func ListOAuthConfigs() ([]OAuthConfig, error) {
	rows, err := DB.Query(`SELECT id, provider, app_id, app_secret, extra FROM oauth_configs ORDER BY provider`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OAuthConfig
	for rows.Next() {
		var c OAuthConfig
		if err := rows.Scan(&c.ID, &c.Provider, &c.AppID, &c.AppSecret, &c.Extra); err != nil {
			continue
		}
		if decrypted, derr := crypto.Decrypt(c.AppSecret); derr == nil {
			c.AppSecret = decrypted
		}
		out = append(out, c)
	}
	return out, nil
}

func SeedDingTalkOAuth(clientID, clientSecret string) {
	var cnt int
	DB.QueryRow(`SELECT COUNT(1) FROM oauth_configs WHERE provider='dingtalk'`).Scan(&cnt)
	if cnt > 0 {
		return
	}
	UpsertOAuthConfig(&OAuthConfig{
		Provider:  "dingtalk",
		AppID:     clientID,
		AppSecret: clientSecret,
		Extra:     "{}",
	})
	slog.Info("seeded DingTalk OAuth config")
}
