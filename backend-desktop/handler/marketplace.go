package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"lingxi-agent/db"
)

// Smithery.ai Skills Marketplace 代理层

const smitheryAPI = "https://api.smithery.ai"

var (
	mpCache     []byte
	mpCacheTime time.Time
	mpCacheKey  string
	mpCacheMu   sync.Mutex
)

// MarketplaceSearch GET /api/skills/marketplace?q=&page=&pageSize=&category=
func MarketplaceSearch(c *gin.Context) {
	q := c.DefaultQuery("q", "")
	page := c.DefaultQuery("page", "1")
	pageSize := c.DefaultQuery("pageSize", "20")
	category := c.DefaultQuery("category", "")

	cacheKey := fmt.Sprintf("%s|%s|%s|%s", q, page, pageSize, category)
	mpCacheMu.Lock()
	if mpCacheKey == cacheKey && time.Since(mpCacheTime) < 5*time.Minute && len(mpCache) > 0 {
		data := mpCache
		mpCacheMu.Unlock()
		c.Data(http.StatusOK, "application/json", data)
		return
	}
	mpCacheMu.Unlock()

	params := url.Values{}
	if q != "" {
		params.Set("q", q)
	}
	params.Set("page", page)
	params.Set("pageSize", pageSize)
	if category != "" {
		params.Set("category", category)
	}

	endpoint := smitheryAPI + "/skills?" + params.Encode()
	resp, err := http.Get(endpoint)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "无法连接 Smithery 市场: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		c.JSON(resp.StatusCode, gin.H{"error": "Smithery 返回错误", "detail": string(body)})
		return
	}

	mpCacheMu.Lock()
	mpCache = body
	mpCacheTime = time.Now()
	mpCacheKey = cacheKey
	mpCacheMu.Unlock()

	c.Data(http.StatusOK, "application/json", body)
}

// MarketplaceGetSkill GET /api/skills/marketplace/:namespace/:slug
func MarketplaceGetSkill(c *gin.Context) {
	ns := c.Param("namespace")
	slug := c.Param("slug")
	endpoint := fmt.Sprintf("%s/skills/%s/%s", smitheryAPI, ns, slug)
	resp, err := http.Get(endpoint)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "无法连接 Smithery 市场"})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", body)
}

// MarketplaceInstall POST /api/skills/marketplace/install
func MarketplaceInstall(c *gin.Context) {
	var body struct {
		Namespace   string `json:"namespace"`
		Slug        string `json:"slug"`
		DisplayName string `json:"displayName"`
		Description string `json:"description"`
		Prompt      string `json:"prompt"`
		GitURL      string `json:"gitUrl"`
		Author      string `json:"author"`
		SkillID     string `json:"skillId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	skillName := body.Slug
	if body.Namespace != "" {
		skillName = body.Namespace + "-" + body.Slug
	}
	skillName = strings.ReplaceAll(skillName, "/", "-")

	// 构造 SKILL.md 内容
	var md strings.Builder
	md.WriteString("---\n")
	md.WriteString(fmt.Sprintf("name: %s\n", skillName))
	md.WriteString(fmt.Sprintf("description: \"%s\"\n", strings.ReplaceAll(body.Description, `"`, `\"`)))
	md.WriteString("---\n\n")
	if body.DisplayName != "" {
		md.WriteString("# " + body.DisplayName + "\n\n")
	}
	if body.Description != "" {
		md.WriteString(body.Description + "\n\n")
	}
	if body.Prompt != "" {
		md.WriteString(body.Prompt + "\n")
	}

	// 写入临时目录 → 打 zip
	tmpDir, err := os.MkdirTemp("", "mp-skill-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建临时目录失败"})
		return
	}
	defer os.RemoveAll(tmpDir)

	skillDir := filepath.Join(tmpDir, skillName)
	os.MkdirAll(skillDir, 0755)
	os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(md.String()), 0644)

	zipData, err := zipDir(tmpDir, skillName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "打包失败"})
		return
	}

	storageDir := skillsStorageDir()
	filePath := filepath.Join(storageDir, skillName+".zip")
	if err := os.WriteFile(filePath, zipData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	_, err = db.DB.Exec(`
		INSERT INTO skills (name, description, file_path, installed, source, marketplace_id, author)
		VALUES (?, ?, ?, 0, 'marketplace', ?, ?)
		ON CONFLICT(name) DO UPDATE SET
			description=excluded.description,
			file_path=excluded.file_path,
			source='marketplace',
			marketplace_id=excluded.marketplace_id,
			author=excluded.author,
			updated_at=CURRENT_TIMESTAMP
	`, skillName, body.Description, filePath, body.SkillID, body.Author)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存数据库失败: " + err.Error()})
		return
	}

	// 读回
	var result struct {
		ID int64 `json:"id"`
	}
	db.DB.QueryRow(`SELECT id FROM skills WHERE name=?`, skillName).Scan(&result.ID)

	// 自动安装
	if err := deploySkillFromFile(skillName, filePath); err == nil {
		db.DB.Exec(`UPDATE skills SET installed=1, updated_at=CURRENT_TIMESTAMP WHERE name=?`, skillName)
	}

	c.JSON(http.StatusOK, gin.H{"message": "安装成功", "skill_id": result.ID, "name": skillName})
}

// MarketplaceCategories GET /api/skills/marketplace/categories
func MarketplaceCategories(c *gin.Context) {
	categories := []map[string]string{
		{"id": "code", "name": "编程开发", "icon": "Code2"},
		{"id": "data", "name": "数据分析", "icon": "BarChart3"},
		{"id": "web", "name": "网页搜索", "icon": "Globe"},
		{"id": "writing", "name": "写作创作", "icon": "FileText"},
		{"id": "devops", "name": "DevOps", "icon": "Terminal"},
		{"id": "design", "name": "设计", "icon": "Palette"},
	}
	bs, _ := json.Marshal(categories)
	c.Data(http.StatusOK, "application/json", bs)
}
