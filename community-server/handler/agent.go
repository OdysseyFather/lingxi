package handler

import (
	"net/http"
	"strconv"

	"community-server/db"
	"community-server/model"
	"community-server/storage"

	"github.com/gin-gonic/gin"
)

// PublishAgent POST /community/agents — 发布 Agent（multipart，包含 .lxbundle 文件）
func PublishAgent(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}

	// 先绑定元数据（form 字段）
	name := c.PostForm("name")
	description := c.PostForm("description")
	avatar := c.PostForm("avatar")
	category := c.PostForm("category")
	version := c.PostForm("version")
	tagsStr := c.PostForm("tags")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	if version == "" {
		version = "1.0.0"
	}
	var tags []string
	if tagsStr != "" {
		for _, t := range splitTags(tagsStr) {
			tags = append(tags, t)
		}
	}
	if tags == nil {
		tags = []string{}
	}

	// 接收 bundle 文件
	file, err := c.FormFile("bundle")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bundle file required"})
		return
	}
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer f.Close()

	// 先生成 agentID（用于 bundle 目录命名）
	tempAgentID := generateID()
	relPath, _, size, err := storage.SaveBundle(tempAgentID, version, f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	a := &model.Agent{
		ID:          tempAgentID,
		AuthorID:    uid,
		Name:        name,
		Description: description,
		Avatar:      avatar,
		Tags:        tags,
		Category:    category,
		BundlePath:  relPath,
		BundleSize:  size,
		Version:     version,
		IsPublished: true,
	}

	saved, err := db.CreateAgent(a)
	if err != nil {
		// 删除已写入的 bundle
		storage.DeleteBundle(tempAgentID, version)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新查询填充作者信息
	full, _ := db.GetAgentByID(saved.ID)
	c.JSON(http.StatusOK, gin.H{"agent": full})
}

// ListAgents GET /community/agents — 列表（分页/分类/标签/搜索/排序）
func ListAgents(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	q := model.AgentListQuery{
		Page:     page,
		PageSize: pageSize,
		Category: c.Query("category"),
		Tag:      c.Query("tag"),
		Search:   c.Query("search"),
		SortBy:   c.DefaultQuery("sort", "newest"),
		AuthorID: c.Query("author_id"),
	}
	result, err := db.ListAgents(q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GetAgent GET /community/agents/:id — 详情
func GetAgent(c *gin.Context) {
	id := c.Param("id")
	a, err := db.GetAgentByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	// 附加：当前用户是否已评分
	currentUID := CurrentUser(c)
	myRating := 0
	if currentUID != "" {
		if r, err := db.GetRating(id, currentUID); err == nil {
			myRating = r.Score
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"agent":     a,
		"my_rating": myRating,
	})
}

// UpdateAgent PUT /community/agents/:id — 更新（仅作者）
func UpdateAgent(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	id := c.Param("id")
	a, err := db.GetAgentByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	if a.AuthorID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your agent"})
		return
	}

	var req struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Avatar      string   `json:"avatar"`
		Tags        []string `json:"tags"`
		Category    string   `json:"category"`
		IsPublished bool     `json:"is_published"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tags := req.Tags
	if tags == nil {
		tags = []string{}
	}
	if err := db.UpdateAgent(id, req.Name, req.Description, req.Avatar, tags, req.Category, req.IsPublished); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	full, _ := db.GetAgentByID(id)
	c.JSON(http.StatusOK, gin.H{"agent": full})
}

// DeleteAgent DELETE /community/agents/:id — 删除（仅作者）
func DeleteAgent(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	id := c.Param("id")
	a, err := db.GetAgentByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	if a.AuthorID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your agent"})
		return
	}
	storage.DeleteAllBundles(id)
	if err := db.DeleteAgent(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DownloadBundle GET /community/agents/:id/bundle — 下载 .lxbundle
// 直接流式返回文件，并增加下载计数
func DownloadBundle(c *gin.Context) {
	id := c.Param("id")
	a, err := db.GetAgentByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	if a.BundlePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "bundle missing"})
		return
	}
	abs := storage.BundleAbsPath(a.BundlePath)
	// 检查文件存在
	if _, err := osStat(abs); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bundle file not found on disk"})
		return
	}
	// 增加下载计数
	db.IncrementDownloads(id)
	c.Header("Content-Disposition", "attachment; filename=\""+a.Name+"-"+a.Version+".lxbundle\"")
	c.File(abs)
}

// ListMyAgents GET /community/agents/mine — 我的 Agent
func ListMyAgents(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	agents, err := db.ListAgentsByAuthor(uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"agents": agents})
}

// Leaderboard GET /community/leaderboard?kind=hot|newest|top_rated
func Leaderboard(c *gin.Context) {
	kind := c.DefaultQuery("kind", "hot")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	agents, err := db.Leaderboard(kind, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"agents": agents})
}

// splitTags 解析 tags 字符串：支持 "a,b,c" 或 JSON 数组 '["a","b"]'
func splitTags(s string) []string {
	var out []string
	// 简单实现：按逗号分割
	cur := ""
	inQuote := false
	for _, ch := range s {
		switch ch {
		case '"':
			inQuote = !inQuote
		case ',':
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
		default:
			if !inQuote && (ch == '[' || ch == ']' || ch == ' ') {
				continue
			}
			cur += string(ch)
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
