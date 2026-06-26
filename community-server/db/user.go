package db

import (
	"database/sql"
	"errors"
	"time"

	"community-server/model"

	"github.com/google/uuid"
)

var ErrNotFound = errors.New("not found")

// CreateUserByAnon 创建匿名用户
func CreateUserByAnon() (*model.User, error) {
	id := uuid.NewString()
	// 用户名生成 "user-<前 6 位>"
	username := "user-" + id[:6]
	token := uuid.NewString() + uuid.NewString() // 64 位 token
	now := time.Now().Unix()

	_, err := DB.Exec(`INSERT INTO users (id, username, display_name, avatar, bio, auth_token, created_at, last_active_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, username, username, "✦", "", token, now, now)
	if err != nil {
		return nil, err
	}
	return &model.User{
		ID:           id,
		Username:     username,
		DisplayName:  username,
		Avatar:       "✦",
		AuthToken:    token,
		CreatedAt:    time.Unix(now, 0),
		LastActiveAt: time.Unix(now, 0),
	}, nil
}

// GetUserByToken 通过 auth_token 查询用户
func GetUserByToken(token string) (*model.User, error) {
	u := &model.User{}
	var createdAt, lastActive int64
	err := DB.QueryRow(`SELECT id, username, display_name, avatar, bio, auth_token, created_at, last_active_at
		FROM users WHERE auth_token = ?`, token).
		Scan(&u.ID, &u.Username, &u.DisplayName, &u.Avatar, &u.Bio, &u.AuthToken, &createdAt, &lastActive)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	u.CreatedAt = time.Unix(createdAt, 0)
	u.LastActiveAt = time.Unix(lastActive, 0)
	return u, nil
}

// GetUserByID 通过 ID 查询用户（含统计）
func GetUserByID(id string) (*model.User, error) {
	u := &model.User{}
	var createdAt, lastActive int64
	err := DB.QueryRow(`SELECT id, username, display_name, avatar, bio, created_at, last_active_at
		FROM users WHERE id = ?`, id).
		Scan(&u.ID, &u.Username, &u.DisplayName, &u.Avatar, &u.Bio, &createdAt, &lastActive)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	u.CreatedAt = time.Unix(createdAt, 0)
	u.LastActiveAt = time.Unix(lastActive, 0)

	// 统计字段
	DB.QueryRow(`SELECT COUNT(*) FROM agents WHERE author_id = ? AND is_published = 1`, id).Scan(&u.AgentsCount)
	DB.QueryRow(`SELECT COUNT(*) FROM follows WHERE followee_id = ?`, id).Scan(&u.FollowersCount)
	DB.QueryRow(`SELECT COUNT(*) FROM follows WHERE follower_id = ?`, id).Scan(&u.FollowingCount)
	return u, nil
}

// UpdateUser 更新用户资料
func UpdateUser(id, displayName, avatar, bio string) error {
	_, err := DB.Exec(`UPDATE users SET display_name = ?, avatar = ?, bio = ?, last_active_at = ? WHERE id = ?`,
		displayName, avatar, bio, time.Now().Unix(), id)
	return err
}

// TouchUserLastActive 更新最后活跃时间
func TouchUserLastActive(id string) {
	DB.Exec(`UPDATE users SET last_active_at = ? WHERE id = ?`, time.Now().Unix(), id)
}

// IsFollowing 是否关注
func IsFollowing(followerID, followeeID string) bool {
	var count int
	DB.QueryRow(`SELECT COUNT(*) FROM follows WHERE follower_id = ? AND followee_id = ?`, followerID, followeeID).Scan(&count)
	return count > 0
}

// FollowUser 关注
func FollowUser(followerID, followeeID string) error {
	_, err := DB.Exec(`INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)`,
		followerID, followeeID, time.Now().Unix())
	return err
}

// UnfollowUser 取关
func UnfollowUser(followerID, followeeID string) error {
	_, err := DB.Exec(`DELETE FROM follows WHERE follower_id = ? AND followee_id = ?`, followerID, followeeID)
	return err
}

// ListFollowing 列出某用户关注的人
func ListFollowing(userID string) ([]*model.User, error) {
	rows, err := DB.Query(`SELECT u.id, u.username, u.display_name, u.avatar, u.bio, u.created_at, u.last_active_at
		FROM follows f JOIN users u ON f.followee_id = u.id
		WHERE f.follower_id = ? ORDER BY f.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanUsers(rows)
}

// ListFollowers 列出关注某用户的人
func ListFollowers(userID string) ([]*model.User, error) {
	rows, err := DB.Query(`SELECT u.id, u.username, u.display_name, u.avatar, u.bio, u.created_at, u.last_active_at
		FROM follows f JOIN users u ON f.follower_id = u.id
		WHERE f.followee_id = ? ORDER BY f.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanUsers(rows)
}

func scanUsers(rows *sql.Rows) ([]*model.User, error) {
	var out []*model.User
	for rows.Next() {
		u := &model.User{}
		var createdAt, lastActive int64
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Avatar, &u.Bio, &createdAt, &lastActive); err != nil {
			return nil, err
		}
		u.CreatedAt = time.Unix(createdAt, 0)
		u.LastActiveAt = time.Unix(lastActive, 0)
		out = append(out, u)
	}
	return out, nil
}
