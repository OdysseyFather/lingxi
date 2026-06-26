package db

import (
	"time"

	"community-server/model"
)

// CreateComment 创建评论
func CreateComment(agentID, userID string, parentID *int64, content string) (*model.Comment, error) {
	now := time.Now().Unix()
	res, err := DB.Exec(`INSERT INTO comments (agent_id, user_id, parent_id, content, created_at)
		VALUES (?, ?, ?, ?, ?)`, agentID, userID, parentID, content, now)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &model.Comment{
		ID:        id,
		AgentID:   agentID,
		UserID:    userID,
		ParentID:  parentID,
		Content:   content,
		CreatedAt: time.Unix(now, 0),
	}, nil
}

// ListComments 列出某 Agent 的评论（顶层评论 + 回复）
func ListComments(agentID string) ([]*model.Comment, error) {
	rows, err := DB.Query(`SELECT c.id, c.agent_id, c.user_id, c.parent_id, c.content, c.created_at,
		u.id, u.username, u.display_name, u.avatar
		FROM comments c JOIN users u ON c.user_id = u.id
		WHERE c.agent_id = ? ORDER BY c.created_at ASC`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byID := make(map[int64]*model.Comment)
	var roots []*model.Comment

	for rows.Next() {
		c := &model.Comment{User: &model.User{}}
		var parentID *int64
		var createdAt int64
		if err := rows.Scan(&c.ID, &c.AgentID, &c.UserID, &parentID, &c.Content, &createdAt,
			&c.User.ID, &c.User.Username, &c.User.DisplayName, &c.User.Avatar); err != nil {
			return nil, err
		}
		c.ParentID = parentID
		c.CreatedAt = time.Unix(createdAt, 0)
		byID[c.ID] = c
	}

	// 第二遍：构建树
	for _, c := range byID {
		if c.ParentID != nil {
			parent, ok := byID[*c.ParentID]
			if ok {
				parent.Replies = append(parent.Replies, *c)
			}
		} else {
			roots = append(roots, c)
		}
	}
	return roots, nil
}

// DeleteComment 删除评论（仅作者或管理员）
func DeleteComment(id int64) error {
	// 同时删除子评论
	tx, _ := DB.Begin()
	tx.Exec(`DELETE FROM comments WHERE parent_id = ?`, id)
	tx.Exec(`DELETE FROM comments WHERE id = ?`, id)
	return tx.Commit()
}
