package db

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"community-server/model"

	"github.com/google/uuid"
)

// CreateAgent 发布一个新 Agent
func CreateAgent(a *model.Agent) (*model.Agent, error) {
	if a.ID == "" {
		a.ID = uuid.NewString()
	}
	now := time.Now().Unix()
	a.CreatedAt = time.Unix(now, 0)
	a.UpdatedAt = time.Unix(now, 0)
	if a.Version == "" {
		a.Version = "1.0.0"
	}
	if a.IsPublished {
		// is_published 字段在表里是 INTEGER，业务层传 bool 时转 1/0
	}

	tagsJSON, _ := json.Marshal(a.Tags)

	_, err := DB.Exec(`INSERT INTO agents
		(id, author_id, name, description, avatar, tags, category, bundle_path, bundle_size, version,
		 downloads_count, rating_avg, rating_count, is_published, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
		a.ID, a.AuthorID, a.Name, a.Description, a.Avatar, string(tagsJSON), a.Category,
		a.BundlePath, a.BundleSize, a.Version, boolToInt(a.IsPublished), now, now)
	if err != nil {
		return nil, err
	}
	return a, nil
}

// GetAgentByID 通过 ID 查询 Agent（含作者信息）
func GetAgentByID(id string) (*model.Agent, error) {
	a := &model.Agent{}
	var tagsJSON string
	var isPublished, createdAt, updatedAt int64
	var bundlePath sql.NullString
	err := DB.QueryRow(`SELECT id, author_id, name, description, avatar, tags, category,
		bundle_path, bundle_size, version, downloads_count, rating_avg, rating_count,
		is_published, created_at, updated_at
		FROM agents WHERE id = ?`, id).
		Scan(&a.ID, &a.AuthorID, &a.Name, &a.Description, &a.Avatar, &tagsJSON, &a.Category,
			&bundlePath, &a.BundleSize, &a.Version, &a.DownloadsCount, &a.RatingAvg, &a.RatingCount,
			&isPublished, &createdAt, &updatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if bundlePath.Valid {
		a.BundlePath = bundlePath.String
	}
	json.Unmarshal([]byte(tagsJSON), &a.Tags)
	if a.Tags == nil {
		a.Tags = []string{}
	}
	a.IsPublished = isPublished == 1
	a.CreatedAt = time.Unix(createdAt, 0)
	a.UpdatedAt = time.Unix(updatedAt, 0)

	// 关联作者
	author, _ := GetUserByID(a.AuthorID)
	a.Author = author
	return a, nil
}

// ListAgents 分页列出 Agent
func ListAgents(q model.AgentListQuery) (*model.AgentListResult, error) {
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.PageSize <= 0 || q.PageSize > 100 {
		q.PageSize = 20
	}

	var where []string
	var args []interface{}
	where = append(where, "is_published = 1")
	if q.Category != "" {
		where = append(where, "category = ?")
		args = append(args, q.Category)
	}
	if q.Tag != "" {
		where = append(where, "(',' || tags || ',' LIKE ?)")
		args = append(args, "%\""+q.Tag+"\"%")
	}
	if q.Search != "" {
		where = append(where, "(name LIKE ? OR description LIKE ? OR tags LIKE ?)")
		args = append(args, "%"+q.Search+"%", "%"+q.Search+"%", "%"+q.Search+"%")
	}
	if q.AuthorID != "" {
		where = append(where, "author_id = ?")
		args = append(args, q.AuthorID)
	}

	whereSQL := strings.Join(where, " AND ")

	// 排序
	var orderBy string
	switch q.SortBy {
	case "rating":
		orderBy = "rating_avg DESC, rating_count DESC"
	case "downloads":
		orderBy = "downloads_count DESC"
	case "newest":
		orderBy = "created_at DESC"
	default:
		orderBy = "created_at DESC"
	}

	// 总数
	var total int
	countSQL := "SELECT COUNT(*) FROM agents WHERE " + whereSQL
	DB.QueryRow(countSQL, args...).Scan(&total)

	// 分页
	offset := (q.Page - 1) * q.PageSize
	listSQL := `SELECT id, author_id, name, description, avatar, tags, category,
		bundle_path, bundle_size, version, downloads_count, rating_avg, rating_count,
		is_published, created_at, updated_at
		FROM agents WHERE ` + whereSQL + `
		ORDER BY ` + orderBy + `
		LIMIT ? OFFSET ?`
	args = append(args, q.PageSize, offset)

	rows, err := DB.Query(listSQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []model.Agent
	for rows.Next() {
		a := model.Agent{}
		var tagsJSON string
		var isPublished, createdAt, updatedAt int64
		var bundlePath sql.NullString
		if err := rows.Scan(&a.ID, &a.AuthorID, &a.Name, &a.Description, &a.Avatar, &tagsJSON, &a.Category,
			&bundlePath, &a.BundleSize, &a.Version, &a.DownloadsCount, &a.RatingAvg, &a.RatingCount,
			&isPublished, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		if bundlePath.Valid {
			a.BundlePath = bundlePath.String
		}
		json.Unmarshal([]byte(tagsJSON), &a.Tags)
		if a.Tags == nil {
			a.Tags = []string{}
		}
		a.IsPublished = isPublished == 1
		a.CreatedAt = time.Unix(createdAt, 0)
		a.UpdatedAt = time.Unix(updatedAt, 0)
		agents = append(agents, a)
	}

	// 填充作者（批量查询）
	if len(agents) > 0 {
		authorMap := make(map[string]*model.User)
		for i := range agents {
			if _, ok := authorMap[agents[i].AuthorID]; !ok {
				u, _ := GetUserByID(agents[i].AuthorID)
				authorMap[agents[i].AuthorID] = u
			}
			agents[i].Author = authorMap[agents[i].AuthorID]
		}
	}

	return &model.AgentListResult{
		Agents:   agents,
		Total:    total,
		Page:     q.Page,
		PageSize: q.PageSize,
	}, nil
}

// UpdateAgent 更新 Agent 元数据
func UpdateAgent(id, name, description, avatar string, tags []string, category string, isPublished bool) error {
	tagsJSON, _ := json.Marshal(tags)
	_, err := DB.Exec(`UPDATE agents SET name = ?, description = ?, avatar = ?, tags = ?, category = ?,
		is_published = ?, updated_at = ? WHERE id = ?`,
		name, description, avatar, string(tagsJSON), category, boolToInt(isPublished), time.Now().Unix(), id)
	return err
}

// DeleteAgent 删除 Agent（连同 bundle 文件由调用方删除）
func DeleteAgent(id string) error {
	_, err := DB.Exec(`DELETE FROM agents WHERE id = ?`, id)
	if err != nil {
		return err
	}
	// 级联清理
	DB.Exec(`DELETE FROM ratings WHERE agent_id = ?`, id)
	DB.Exec(`DELETE FROM comments WHERE agent_id = ?`, id)
	DB.Exec(`DELETE FROM invocations WHERE agent_id = ?`, id)
	return nil
}

// IncrementDownloads 下载计数 +1
func IncrementDownloads(agentID string) {
	DB.Exec(`UPDATE agents SET downloads_count = downloads_count + 1 WHERE id = ?`, agentID)
}

// ListAgentsByAuthor 列出某作者的所有 Agent
func ListAgentsByAuthor(authorID string) ([]*model.Agent, error) {
	rows, err := DB.Query(`SELECT id, author_id, name, description, avatar, tags, category,
		bundle_path, bundle_size, version, downloads_count, rating_avg, rating_count,
		is_published, created_at, updated_at
		FROM agents WHERE author_id = ? ORDER BY created_at DESC`, authorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*model.Agent
	for rows.Next() {
		a := &model.Agent{}
		var tagsJSON string
		var isPublished, createdAt, updatedAt int64
		var bundlePath sql.NullString
		if err := rows.Scan(&a.ID, &a.AuthorID, &a.Name, &a.Description, &a.Avatar, &tagsJSON, &a.Category,
			&bundlePath, &a.BundleSize, &a.Version, &a.DownloadsCount, &a.RatingAvg, &a.RatingCount,
			&isPublished, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		if bundlePath.Valid {
			a.BundlePath = bundlePath.String
		}
		json.Unmarshal([]byte(tagsJSON), &a.Tags)
		if a.Tags == nil {
			a.Tags = []string{}
		}
		a.IsPublished = isPublished == 1
		a.CreatedAt = time.Unix(createdAt, 0)
		a.UpdatedAt = time.Unix(updatedAt, 0)
		out = append(out, a)
	}
	return out, nil
}

// Leaderboard 排行榜
func Leaderboard(kind string, limit int) ([]*model.Agent, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var orderBy string
	switch kind {
	case "hot":
		orderBy = "downloads_count DESC"
	case "newest":
		orderBy = "created_at DESC"
	case "top_rated":
		orderBy = "rating_avg DESC, rating_count DESC"
	default:
		orderBy = "downloads_count DESC"
	}
	rows, err := DB.Query(`SELECT id, author_id, name, description, avatar, tags, category,
		bundle_path, bundle_size, version, downloads_count, rating_avg, rating_count,
		is_published, created_at, updated_at
		FROM agents WHERE is_published = 1 ORDER BY ` + orderBy + ` LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*model.Agent
	for rows.Next() {
		a := &model.Agent{}
		var tagsJSON string
		var isPublished, createdAt, updatedAt int64
		var bundlePath sql.NullString
		if err := rows.Scan(&a.ID, &a.AuthorID, &a.Name, &a.Description, &a.Avatar, &tagsJSON, &a.Category,
			&bundlePath, &a.BundleSize, &a.Version, &a.DownloadsCount, &a.RatingAvg, &a.RatingCount,
			&isPublished, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		if bundlePath.Valid {
			a.BundlePath = bundlePath.String
		}
		json.Unmarshal([]byte(tagsJSON), &a.Tags)
		if a.Tags == nil {
			a.Tags = []string{}
		}
		a.IsPublished = isPublished == 1
		a.CreatedAt = time.Unix(createdAt, 0)
		a.UpdatedAt = time.Unix(updatedAt, 0)
		out = append(out, a)
	}
	// 填充作者
	if len(out) > 0 {
		authorMap := make(map[string]*model.User)
		for _, a := range out {
			if _, ok := authorMap[a.AuthorID]; !ok {
				u, _ := GetUserByID(a.AuthorID)
				authorMap[a.AuthorID] = u
			}
			a.Author = authorMap[a.AuthorID]
		}
	}
	return out, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
