package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// ── Bundle 格式定义 ────────────────────────────────────────────
// .lxbundle = zip 压缩包，内含：
//   manifest.json   # 版本/作者/依赖
//   agent.json      # Agent 配置
//   avatar.png      # 头像（如果是图片）
//   skills/         # 技能目录
//     <skill>/SKILL.md
//     ...
//   knowledge/      # 知识库文件
//     docs/*.md
//     index.json
//   README.md       # 使用说明

// BundleManifest Bundle 清单
type BundleManifest struct {
	Format     string            `json:"format"`     // "lxbundle"
	Version    string            `json:"version"`   // bundle 格式版本 "1.0"
	AgentID    int64             `json:"agent_id"`   // 灵犀本地 Agent ID
	AgentName  string            `json:"agent_name"`
	AgentVer   string            `json:"agent_ver"`
	Author     string            `json:"author"`    // 发布者用户名（可选）
	CreatedAt  int64             `json:"created_at"`
	Skills     []string          `json:"skills"`    // skill 名称列表
	Knowledge  []string          `json:"knowledge"` // 知识库文件名列表
	Checksum   string            `json:"checksum"`  // 简化版：暂留空
	Extra      map[string]string `json:"extra,omitempty"`
}

// BundleAgent Bundle 中的 agent.json
type BundleAgent struct {
	Name         string  `json:"name"`
	Avatar       string  `json:"avatar"`       // emoji 或图片文件名
	Description  string  `json:"description"`
	SystemPrompt string  `json:"system_prompt"`
	Temperature  float64 `json:"temperature"`
	MaxTokens    int64   `json:"max_tokens"`
}

// ExportAgentBundle 打包当前 Agent 为 .lxbundle，返回字节数组
func ExportAgentBundle(agentID int64) ([]byte, *BundleManifest, error) {
	agent, err := db.GetAgent(agentID)
	if err != nil {
		return nil, nil, fmt.Errorf("agent not found: %w", err)
	}

	// 收集 skill 文件
	skillFiles := collectSkillFiles(agent.SkillIDs)
	// 收集 knowledge 文件
	knowledgeFiles := collectKnowledgeFiles(agent.KnowledgeIDs)
	// 收集头像
	avatarFile := collectAvatarFile(agent.Avatar)

	manifest := &BundleManifest{
		Format:    "lxbundle",
		Version:   "1.0",
		AgentID:   agent.ID,
		AgentName: agent.Name,
		AgentVer:  "1.0.0",
		Author:    "", // 由调用方在前端表单中填入
		CreatedAt: time.Now().Unix(),
		Skills:    skillNames(skillFiles),
		Knowledge: knowledgeFiles,
	}

	// 写入 zip
	buf := &bytes.Buffer{}
	w := zip.NewWriter(buf)

	// 1. manifest.json
	writeZipJSON(w, "manifest.json", manifest)

	// 2. agent.json
	agentJSON := &BundleAgent{
		Name:         agent.Name,
		Avatar:       agent.Avatar,
		Description:  agent.Description,
		SystemPrompt: agent.SystemPrompt,
		Temperature:  agent.Temperature,
		MaxTokens:    agent.MaxTokens,
	}
	writeZipJSON(w, "agent.json", agentJSON)

	// 3. avatar.png（如果有）
	if avatarFile != "" {
		if data, err := os.ReadFile(avatarFile); err == nil {
			f, _ := w.Create("avatar" + filepath.Ext(avatarFile))
			f.Write(data)
		}
	}

	// 4. skills/<name>/SKILL.md
	for skillName, path := range skillFiles {
		addFileToZip(w, "skills/"+skillName+"/", path)
	}

	// 5. knowledge/docs/<name>
	for _, kpath := range knowledgeFiles {
		addFileToZip(w, "knowledge/docs/", kpath)
	}

	// 6. README.md
	readme := fmt.Sprintf("# %s\n\n%s\n\n## 信息\n\n- 版本: %s\n- 创建时间: %s\n",
		agent.Name, agent.Description, manifest.AgentVer,
		time.Unix(manifest.CreatedAt, 0).Format(time.RFC3339))
	f, _ := w.Create("README.md")
	f.Write([]byte(readme))

	if err := w.Close(); err != nil {
		return nil, nil, err
	}
	return buf.Bytes(), manifest, nil
}

// addFileToZip 把文件（或目录）添加到 zip 中的 prefix 目录下
func addFileToZip(w *zip.Writer, prefix, srcPath string) {
	info, err := os.Stat(srcPath)
	if err != nil {
		return
	}
	if info.IsDir() {
		// 递归
		entries, _ := os.ReadDir(srcPath)
		for _, e := range entries {
			addFileToZip(w, prefix, filepath.Join(srcPath, e.Name()))
		}
		return
	}
	data, err := os.ReadFile(srcPath)
	if err != nil {
		return
	}
	f, err := w.Create(prefix + filepath.Base(srcPath))
	if err != nil {
		return
	}
	f.Write(data)
}

// writeZipJSON 在 zip 中写入一个 JSON 文件
func writeZipJSON(w *zip.Writer, name string, v interface{}) {
	data, _ := json.MarshalIndent(v, "", "  ")
	f, _ := w.Create(name)
	f.Write(data)
}

// skillNames 从 map 提取 skill 名字列表
func skillNames(m map[string]string) []string {
	var out []string
	for name := range m {
		out = append(out, name)
	}
	return out
}

// collectSkillFiles 收集 skill 的实际文件路径
// skillIDs 是 JSON 数组字符串如 "[1,2,3]"
func collectSkillFiles(skillIDsJSON string) map[string]string {
	out := make(map[string]string)
	var ids []int64
	if err := json.Unmarshal([]byte(skillIDsJSON), &ids); err != nil {
		return out
	}
	for _, id := range ids {
		var name, filePath string
		var installed int
		err := db.DB.QueryRow(`SELECT name, file_path, installed FROM skills WHERE id = ?`, id).
			Scan(&name, &filePath, &installed)
		if err != nil || filePath == "" {
			continue
		}
		if strings.HasSuffix(filePath, ".zip") {
			// 暂时跳过 zip（解压后才能打包）— Phase 1 简化
			continue
		}
		out[name] = filePath
	}
	return out
}

// collectKnowledgeFiles 收集知识库的实际文件路径
// knowledgeIDs 是 JSON 数组字符串
func collectKnowledgeFiles(knowledgeIDsJSON string) []string {
	var out []string
	var ids []int64
	if err := json.Unmarshal([]byte(knowledgeIDsJSON), &ids); err != nil {
		return out
	}
	for _, id := range ids {
		k, err := db.GetKnowledgeByID(id)
		if err != nil {
			continue
		}
		fp := getKnowledgeFilePath(k)
		if fp != "" {
			out = append(out, fp)
		}
	}
	return out
}

// getKnowledgeFilePath 从 knowledge map 中提取文件路径
func getKnowledgeFilePath(k map[string]interface{}) string {
	if v, ok := k["file_path"]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// collectAvatarFile 如果 avatar 是 /api/uploads/xxx.png，转换为本地文件路径
func collectAvatarFile(avatarURL string) string {
	if avatarURL == "" || strings.HasPrefix(avatarURL, "/api/uploads/") == false {
		return ""
	}
	// 解析 uploads 目录
	uploadsDir := os.Getenv("UPLOADS_PATH")
	if uploadsDir == "" {
		uploadsDir = filepath.Join(os.TempDir(), "lingxi-uploads")
	}
	fileName := filepath.Base(avatarURL)
	return filepath.Join(uploadsDir, fileName)
}

// ── HTTP handlers ──────────────────────────────────────────────

// ExportAgentBundleHandler GET /api/agents/:id/export-bundle — 下载 Agent Bundle
func ExportAgentBundleHandler(c *gin.Context) {
	id := parseAgentID(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid agent id"})
		return
	}
	data, manifest, err := ExportAgentBundle(id)
	if err != nil {
		slog.Error("export bundle error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition",
		fmt.Sprintf("attachment; filename=\"%s.lxbundle\"", manifest.AgentName))
	c.Data(http.StatusOK, "application/octet-stream", data)
}

// parseAgentID 把字符串 id 转换为 int64
func parseAgentID(s string) int64 {
	var id int64
	for _, ch := range s {
		if ch >= '0' && ch <= '9' {
			id = id*10 + int64(ch-'0')
		}
	}
	return id
}

// ImportAgentBundleHandler POST /api/agents/import-bundle — 从 .lxbundle 导入 Agent
func ImportAgentBundleHandler(c *gin.Context) {
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

	data, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	zipReader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bundle: " + err.Error()})
		return
	}

	// 读取 manifest.json 和 agent.json
	var manifest BundleManifest
	var agentData BundleAgent
	for _, f := range zipReader.File {
		switch f.Name {
		case "manifest.json":
			rc, err := f.Open()
			if err == nil {
				json.NewDecoder(rc).Decode(&manifest)
				rc.Close()
			}
		case "agent.json":
			rc, err := f.Open()
			if err == nil {
				json.NewDecoder(rc).Decode(&agentData)
				rc.Close()
			}
		}
	}

	if agentData.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bundle: agent.json missing"})
		return
	}

	// 检查重名（用 ListAgents 查询本地所有 Agent）
	agents, _ := db.ListAgents()
	existingNames := make(map[string]bool)
	for _, a := range agents {
		existingNames[a.Name] = true
	}
	finalName := agentData.Name
	suffix := 1
	for existingNames[finalName] {
		suffix++
		finalName = fmt.Sprintf("%s (%d)", agentData.Name, suffix)
	}

	// 创建 Agent（复用 UpsertAgent，ID=0 表示新增）
	a := &db.Agent{
		Name:         finalName,
		Avatar:       agentData.Avatar,
		Description:  agentData.Description,
		SystemPrompt:  agentData.SystemPrompt,
		Temperature:  agentData.Temperature,
		MaxTokens:    agentData.MaxTokens,
		SkillIDs:     "[]",
		MCPServerIDs: "[]",
		KnowledgeIDs: "[]",
	}
	if a.Temperature == 0 {
		a.Temperature = 0.7
	}
	if _, err := db.UpsertAgent(a); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 解压 skills 和 knowledge 到临时目录并安装（Phase 1 简化：只解压不自动安装到 ~/.claude/skills/）
	// 后续 Phase 可以补完自动安装逻辑

	c.JSON(http.StatusOK, gin.H{
		"agent":    a,
		"manifest": manifest,
		"warning":  "Bundle 已导入，但 skills/knowledge 需要手动安装（Phase 1 简化）",
	})
}
