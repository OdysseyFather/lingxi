package db

import (
	"database/sql"
	"time"

	"community-server/model"
)

// UpsertRating 新增或更新评分
func UpsertRating(agentID, userID string, score int, review string) error {
	now := time.Now().Unix()
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// upsert
	_, err = tx.Exec(`INSERT INTO ratings (agent_id, user_id, score, review, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(agent_id, user_id) DO UPDATE SET score = excluded.score, review = excluded.review, created_at = excluded.created_at`,
		agentID, userID, score, review, now)
	if err != nil {
		return err
	}

	// 重新计算评分聚合
	var avg float64
	var count int
	tx.QueryRow(`SELECT AVG(score), COUNT(*) FROM ratings WHERE agent_id = ?`, agentID).Scan(&avg, &count)

	_, err = tx.Exec(`UPDATE agents SET rating_avg = ?, rating_count = ?, updated_at = ? WHERE id = ?`,
		avg, count, now, agentID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// ListRatings 列出某 Agent 的所有评分
func ListRatings(agentID string) ([]*model.Rating, error) {
	rows, err := DB.Query(`SELECT r.id, r.agent_id, r.user_id, r.score, r.review, r.created_at,
		u.id, u.username, u.display_name, u.avatar
		FROM ratings r JOIN users u ON r.user_id = u.id
		WHERE r.agent_id = ? ORDER BY r.created_at DESC`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*model.Rating
	for rows.Next() {
		r := &model.Rating{User: &model.User{}}
		var createdAt int64
		if err := rows.Scan(&r.ID, &r.AgentID, &r.UserID, &r.Score, &r.Review, &createdAt,
			&r.User.ID, &r.User.Username, &r.User.DisplayName, &r.User.Avatar); err != nil {
			return nil, err
		}
		r.CreatedAt = time.Unix(createdAt, 0)
		out = append(out, r)
	}
	return out, nil
}

// GetRating 获取某用户对某 Agent 的评分
func GetRating(agentID, userID string) (*model.Rating, error) {
	r := &model.Rating{}
	var createdAt int64
	err := DB.QueryRow(`SELECT id, agent_id, user_id, score, review, created_at
		FROM ratings WHERE agent_id = ? AND user_id = ?`, agentID, userID).
		Scan(&r.ID, &r.AgentID, &r.UserID, &r.Score, &r.Review, &createdAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	r.CreatedAt = time.Unix(createdAt, 0)
	return r, nil
}
