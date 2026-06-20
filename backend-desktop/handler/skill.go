package handler

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"lingxi-agent/config"
	"lingxi-agent/db"
	"lingxi-agent/util"
	"lingxi-agent/model"
)

// isolatedHome 返回 Electron 注入的隔离 HOME 路径（优先使用 HOME 环境变量）
func isolatedHome() string {
	if h := os.Getenv("HOME"); h != "" {
		return h
	}
	h, _ := os.UserHomeDir()
	return h
}

// skillsStorageDir 返回 skill zip 包的本地存储目录（$HOME/.smart-agent/skills/）
func skillsStorageDir() string {
	dir := filepath.Join(isolatedHome(), ".smart-agent", "skills")
	os.MkdirAll(dir, 0755)
	return dir
}

// claudeSkillsDir 返回 claude skills 安装目录（$HOME/.claude/skills/）
func claudeSkillsDir() string {
	dir := filepath.Join(isolatedHome(), ".claude", "skills")
	os.MkdirAll(dir, 0755)
	return dir
}

// ListSkills GET /api/skills
func ListSkills(c *gin.Context) {
	if cached, ok := apiCache.Get("skills"); ok {
		c.JSON(http.StatusOK, cached)
		return
	}
	rows, err := db.DB.Query(`
		SELECT id, name, description, file_path, installed, source, marketplace_id, marketplace_version, author, created_at, updated_at
		FROM skills ORDER BY created_at DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	skills := make([]model.Skill, 0)
	for rows.Next() {
		var s model.Skill
		if err := rows.Scan(&s.ID, &s.Name, &s.Description, &s.FilePath, &s.Installed, &s.Source, &s.MarketplaceID, &s.MarketplaceVersion, &s.Author, &s.CreatedAt, &s.UpdatedAt); err != nil {
			continue
		}
		skills = append(skills, s)
	}
	apiCache.Set("skills", skills)
	c.JSON(http.StatusOK, skills)
}

func invalidateSkillsCache() { apiCache.Invalidate("skills") }

// UploadSkill POST /api/skills/upload — 上传单个 zip
func UploadSkill(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传 zip 文件"})
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "只支持 .zip 格式"})
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}

	skill, err := uploadOneSkill(data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	invalidateSkillsCache()
	c.JSON(http.StatusOK, skill)
}

// BatchUploadSkill POST /api/skills/batch-upload — 批量上传多个 zip
func BatchUploadSkill(c *gin.Context) {
	if err := c.Request.ParseMultipartForm(64 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "解析表单失败"})
		return
	}

	files := c.Request.MultipartForm.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传至少一个文件"})
		return
	}

	type result struct {
		Filename string       `json:"filename"`
		Success  bool         `json:"success"`
		Error    string       `json:"error,omitempty"`
		Skill    *model.Skill `json:"skill,omitempty"`
	}

	results := make([]result, 0, len(files))
	for _, fh := range files {
		r := result{Filename: fh.Filename}

		if !strings.HasSuffix(strings.ToLower(fh.Filename), ".zip") {
			r.Error = "只支持 .zip 格式"
			results = append(results, r)
			continue
		}

		f, err := fh.Open()
		if err != nil {
			r.Error = "打开文件失败"
			results = append(results, r)
			continue
		}
		data, err := io.ReadAll(f)
		f.Close()
		if err != nil {
			r.Error = "读取文件失败"
			results = append(results, r)
			continue
		}

		skill, err := uploadOneSkill(data)
		if err != nil {
			r.Error = err.Error()
		} else {
			r.Success = true
			r.Skill = skill
		}
		results = append(results, r)
	}

	invalidateSkillsCache()
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// uploadOneSkill 处理单个 zip 的验证、本地存储、DB 写入
func uploadOneSkill(data []byte) (*model.Skill, error) {
	skillName, description, err := validateAndParseSkillZip(data)
	if err != nil {
		return nil, err
	}

	storageDir := skillsStorageDir()
	filePath := filepath.Join(storageDir, skillName+".zip")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return nil, fmt.Errorf("保存文件失败: %w", err)
	}

	_, err = db.DB.Exec(`
		INSERT INTO skills (name, description, file_path, installed)
		VALUES (?, ?, ?, 0)
		ON CONFLICT(name) DO UPDATE SET
			description=excluded.description,
			file_path=excluded.file_path,
			updated_at=CURRENT_TIMESTAMP
	`, skillName, description, filePath)
	if err != nil {
		return nil, fmt.Errorf("保存数据库失败: %w", err)
	}

	var skill model.Skill
	db.DB.QueryRow(`SELECT id, name, description, file_path, installed, created_at, updated_at FROM skills WHERE name=?`, skillName).
		Scan(&skill.ID, &skill.Name, &skill.Description, &skill.FilePath, &skill.Installed, &skill.CreatedAt, &skill.UpdatedAt)

	return &skill, nil
}

// InstallSkill POST /api/skills/:id/install
func InstallSkill(c *gin.Context) {
	id := c.Param("id")

	var skill model.Skill
	err := db.DB.QueryRow(`SELECT id, name, file_path FROM skills WHERE id=?`, id).
		Scan(&skill.ID, &skill.Name, &skill.FilePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}

	if err := deploySkillFromFile(skill.Name, skill.FilePath); err != nil {
		slog.Warn("deploy error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "安装失败: " + err.Error()})
		return
	}

	db.DB.Exec(`UPDATE skills SET installed=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`, id)
	invalidateSkillsCache()
	c.JSON(http.StatusOK, gin.H{"message": "安装成功"})
}

// UninstallSkill POST /api/skills/:id/uninstall
func UninstallSkill(c *gin.Context) {
	id := c.Param("id")

	var skill model.Skill
	err := db.DB.QueryRow(`SELECT id, name FROM skills WHERE id=?`, id).
		Scan(&skill.ID, &skill.Name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}

	skillDir := filepath.Join(claudeSkillsDir(), skill.Name)
	os.RemoveAll(skillDir)

	db.DB.Exec(`UPDATE skills SET installed=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`, id)
	invalidateSkillsCache()
	c.JSON(http.StatusOK, gin.H{"message": "卸载成功"})
}

// DeleteSkill DELETE /api/skills/:id
func DeleteSkill(c *gin.Context) {
	id := c.Param("id")

	var skill model.Skill
	err := db.DB.QueryRow(`SELECT id, name, file_path, installed FROM skills WHERE id=?`, id).
		Scan(&skill.ID, &skill.Name, &skill.FilePath, &skill.Installed)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}

	if skill.Installed {
		os.RemoveAll(filepath.Join(claudeSkillsDir(), skill.Name))
	}
	os.Remove(skill.FilePath)

	db.DB.Exec(`DELETE FROM skills WHERE id=?`, id)
	invalidateSkillsCache()
	c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}

// BatchDeleteSkills POST /api/skills/batch-delete
func BatchDeleteSkills(c *gin.Context) {
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}
	deleted := 0
	for _, id := range body.IDs {
		var skill model.Skill
		err := db.DB.QueryRow(`SELECT id, name, file_path, installed FROM skills WHERE id=?`, id).
			Scan(&skill.ID, &skill.Name, &skill.FilePath, &skill.Installed)
		if err != nil {
			continue
		}
		if skill.Installed {
			os.RemoveAll(filepath.Join(claudeSkillsDir(), skill.Name))
		}
		os.Remove(skill.FilePath)
		db.DB.Exec(`DELETE FROM skills WHERE id=?`, id)
		deleted++
	}
	invalidateSkillsCache()
	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
}

// BootstrapInstalledSkills 启动时恢复已安装的 skills
func BootstrapInstalledSkills() {
	rows, err := db.DB.Query(`SELECT name, file_path FROM skills WHERE installed=1`)
	if err != nil {
		return
	}
	defer rows.Close()

	var count int
	for rows.Next() {
		var name, filePath string
		if err := rows.Scan(&name, &filePath); err != nil {
			continue
		}
		if err := deploySkillFromFile(name, filePath); err != nil {
			slog.Warn("bootstrap deploy  error", "value", name, "err", err)
		} else {
			count++
		}
	}
	slog.Info("bootstrapped  installed skills", "value", count)
}

func deploySkillFromFile(name, filePath string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("read zip: %w", err)
	}
	destBase := claudeSkillsDir()
	destDir := filepath.Join(destBase, name)
	os.RemoveAll(destDir)
	if err := unzip(data, destBase); err != nil {
		return err
	}
	// 确保解压后的目录都有执行权限
	filepath.Walk(destDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() && info.Mode()&0111 == 0 {
			os.Chmod(path, info.Mode()|0755)
		}
		return nil
	})
	return nil
}

// ─── Skill 生成（AI 生成，本地存储）────────────────────────────

const skillGenPrompt = `你是一个 Claude Code Skill 生成专家。用户会描述他们想要的 skill 功能，你需要在当前目录下生成完整的 skill 目录结构。

Skill 目录结构规范：
<skill-name>/
├── SKILL.md
└── scripts/（可选）

SKILL.md 格式：
---
name: <skill-name>
description: "<一句话描述>"
---

# <技能标题>
## 功能概述
## 使用方式
## 核心指令

要求：skill 名称只能包含小写字母、数字和连字符，直接创建文件。

用户描述：`

// GenerateSkillStream POST /api/skills/generate/stream
func GenerateSkillStream(c *gin.Context) {
	var body struct {
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Description) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 skill 描述"})
		return
	}

	tmpDir, err := os.MkdirTemp("", "skill-gen-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建临时目录失败"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Flush()

	args := []string{"-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
		"--allowedTools", "Bash,Write,Edit,str_replace_editor,str_replace_based_edit_tool"}
	claudeBin := config.Get().Claude.Bin
	execCmd := exec.Command(claudeBin, args...)
	execCmd.Stdin = strings.NewReader(skillGenPrompt + body.Description)
	execCmd.Dir = tmpDir
	execCmd.Env = buildClaudeEnv(config.Get())

	stdout, err := execCmd.StdoutPipe()
	if err != nil {
		writeSSE(c, "error", jsonStr("启动生成失败"))
		writeSSE(c, "done", "[DONE]")
		os.RemoveAll(tmpDir)
		return
	}
	stderrPipe, _ := execCmd.StderrPipe()

	if err := execCmd.Start(); err != nil {
		writeSSE(c, "error", jsonStr("启动生成失败: "+err.Error()))
		writeSSE(c, "done", "[DONE]")
		os.RemoveAll(tmpDir)
		return
	}

	go func() {
		s := bufio.NewScanner(stderrPipe)
		for s.Scan() {
			slog.Info("[skill-gen stderr]", "text()", s.Text())
		}
	}()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var ev claudeEvent
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			continue
		}
		if ev.Type == "stream_event" {
			var inner innerEvent
			if err := json.Unmarshal(ev.Event, &inner); err != nil {
				continue
			}
			switch inner.Type {
			case "content_block_delta":
				d := inner.Delta
				if d.Type == "text_delta" && d.Text != "" {
					writeSSE(c, "text", jsonStr(d.Text))
				} else if d.Type == "thinking_delta" && d.Thinking != "" {
					writeSSE(c, "thinking", jsonStr(d.Thinking))
				} else if d.Type == "input_json_delta" && d.PartialJSON != "" {
					writeSSE(c, "tool_input", jsonStr(d.PartialJSON))
				}
			case "content_block_start":
				if inner.ContentBlock.Type == "tool_use" {
					payload, _ := json.Marshal(map[string]string{"name": inner.ContentBlock.Name})
					writeSSE(c, "tool_start", string(payload))
				}
			case "content_block_stop":
				writeSSE(c, "tool_end", "{}")
			}
		}
	}

	execCmd.Wait()

	files, err := readDirFiles(tmpDir)
	if err != nil || len(files) == 0 {
		writeSSE(c, "error", jsonStr("生成失败，未找到文件"))
		writeSSE(c, "done", "[DONE]")
		os.RemoveAll(tmpDir)
		return
	}

	skillName := detectSkillName(tmpDir)
	if skillName == "" {
		writeSSE(c, "error", jsonStr("未找到有效的 skill 目录"))
		writeSSE(c, "done", "[DONE]")
		os.RemoveAll(tmpDir)
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"skillName": skillName,
		"tmpDir":    tmpDir,
		"files":     files,
	})
	writeSSE(c, "preview", string(payload))
	writeSSE(c, "done", "[DONE]")
	c.Writer.Flush()
}

// ConfirmGeneratedSkill POST /api/skills/generate/confirm
func ConfirmGeneratedSkill(c *gin.Context) {
	var body struct {
		TmpDir    string            `json:"tmpDir"`
		SkillName string            `json:"skillName"`
		Files     map[string]string `json:"files"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.TmpDir == "" || body.SkillName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if !strings.HasPrefix(body.TmpDir, os.TempDir()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非法目录"})
		return
	}
	defer os.RemoveAll(body.TmpDir)

	for relPath, content := range body.Files {
		cleanPath := filepath.Clean(relPath)
		if strings.HasPrefix(cleanPath, "..") {
			continue
		}
		fullPath := filepath.Join(body.TmpDir, cleanPath)
		os.MkdirAll(filepath.Dir(fullPath), 0755)
		os.WriteFile(fullPath, []byte(content), 0644)
	}

	zipData, err := zipDir(body.TmpDir, body.SkillName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "打包失败: " + err.Error()})
		return
	}

	skillMDContent, _ := os.ReadFile(filepath.Join(body.TmpDir, body.SkillName, "SKILL.md"))
	description := parseSkillMDDescription(string(skillMDContent))

	// 保存到本地
	storageDir := skillsStorageDir()
	filePath := filepath.Join(storageDir, body.SkillName+".zip")
	if err := os.WriteFile(filePath, zipData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	_, err = db.DB.Exec(`
		INSERT INTO skills (name, description, file_path, installed)
		VALUES (?, ?, ?, 0)
		ON CONFLICT(name) DO UPDATE SET
			description=excluded.description,
			file_path=excluded.file_path,
			updated_at=CURRENT_TIMESTAMP
	`, body.SkillName, description, filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存数据库失败"})
		return
	}

	var skill model.Skill
	db.DB.QueryRow(`SELECT id, name, description, file_path, installed, created_at, updated_at FROM skills WHERE name=?`, body.SkillName).
		Scan(&skill.ID, &skill.Name, &skill.Description, &skill.FilePath, &skill.Installed, &skill.CreatedAt, &skill.UpdatedAt)

	invalidateSkillsCache()
	c.JSON(http.StatusOK, skill)
}

// GetSkillContent GET /api/skills/:id/content — 读取已安装 skill 的文件列表及内容
func GetSkillContent(c *gin.Context) {
	id := c.Param("id")
	var skill model.Skill
	err := db.DB.QueryRow(`SELECT id, name, file_path, installed FROM skills WHERE id=?`, id).
		Scan(&skill.ID, &skill.Name, &skill.FilePath, &skill.Installed)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}
	// 优先读已安装目录，否则从 zip 读
	skillDir := filepath.Join(claudeSkillsDir(), skill.Name)
	if info, e := os.Stat(skillDir); e == nil && info.IsDir() {
		files, _ := readDirFiles(skillDir)
		c.JSON(http.StatusOK, gin.H{"skillName": skill.Name, "source": "installed", "files": files})
		return
	}
	// 从 zip 包读
	if skill.FilePath != "" {
		data, e := os.ReadFile(skill.FilePath)
		if e == nil {
			files, e2 := readZipFiles(data)
			if e2 == nil {
				c.JSON(http.StatusOK, gin.H{"skillName": skill.Name, "source": "zip", "files": files})
				return
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"skillName": skill.Name, "source": "none", "files": []SkillFile{}})
}

// UpdateSkillContent PUT /api/skills/:id/content — 保存编辑后的文件内容
func UpdateSkillContent(c *gin.Context) {
	id := c.Param("id")
	var skill model.Skill
	err := db.DB.QueryRow(`SELECT id, name, file_path, installed FROM skills WHERE id=?`, id).
		Scan(&skill.ID, &skill.Name, &skill.FilePath, &skill.Installed)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}
	var body struct {
		Files map[string]string `json:"files"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 files"})
		return
	}

	// 写入临时目录 → 重新打 zip → 更新存储
	tmpDir, err := os.MkdirTemp("", "skill-edit-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建临时目录失败"})
		return
	}
	defer os.RemoveAll(tmpDir)

	for relPath, content := range body.Files {
		cleanPath := filepath.Clean(relPath)
		if strings.HasPrefix(cleanPath, "..") {
			continue
		}
		fullPath := filepath.Join(tmpDir, skill.Name, cleanPath)
		os.MkdirAll(filepath.Dir(fullPath), 0755)
		os.WriteFile(fullPath, []byte(content), 0644)
	}

	zipData, err := zipDir(tmpDir, skill.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "打包失败: " + err.Error()})
		return
	}

	storageDir := skillsStorageDir()
	filePath := filepath.Join(storageDir, skill.Name+".zip")
	if err := os.WriteFile(filePath, zipData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	// 更新描述
	skillMDContent, _ := body.Files[skill.Name+"/SKILL.md"]
	if skillMDContent == "" {
		skillMDContent, _ = body.Files["SKILL.md"]
	}
	if skillMDContent != "" {
		desc := parseSkillMDDescription(skillMDContent)
		if desc != "" {
			db.DB.Exec(`UPDATE skills SET description=?, file_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, desc, filePath, skill.ID)
		}
	} else {
		db.DB.Exec(`UPDATE skills SET file_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, filePath, skill.ID)
	}

	// 如果已安装，重新部署
	if skill.Installed {
		if err := deploySkillFromFile(skill.Name, filePath); err != nil {
			slog.Warn("redeploy after edit error", "err", err)
		}
	}

	invalidateSkillsCache()
	c.JSON(http.StatusOK, gin.H{"message": "保存成功"})
}

type skillManifest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Author      string `json:"author"`
	Version     string `json:"version"`
	Source      string `json:"source"`
	ExportedAt  string `json:"exported_at"`
}

func buildSkillZipWithManifest(skill model.Skill) ([]byte, error) {
	skillDir := filepath.Join(claudeSkillsDir(), skill.Name)
	if info, err := os.Stat(skillDir); err == nil && info.IsDir() {
		return zipDirWithManifest(skillDir, skill)
	}
	if skill.FilePath == "" {
		return nil, fmt.Errorf("没有可导出的文件")
	}
	data, err := os.ReadFile(skill.FilePath)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败")
	}
	return injectManifestIntoZip(data, skill)
}

func zipDirWithManifest(dir string, skill model.Skill) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	prefix := skill.Name
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)
		rel = filepath.ToSlash(rel)
		zipPath := prefix + "/" + rel
		if info.IsDir() {
			if rel != "." {
				w.Create(zipPath + "/")
			}
			return nil
		}
		fw, err := w.Create(zipPath)
		if err != nil {
			return err
		}
		data, _ := os.ReadFile(path)
		_, err = fw.Write(data)
		return err
	})
	if err != nil {
		return nil, err
	}
	manifest := skillManifest{
		Name:        skill.Name,
		Description: skill.Description,
		Author:      skill.Author,
		Version:     skill.MarketplaceVersion,
		Source:      skill.Source,
		ExportedAt:  time.Now().Format(time.RFC3339),
	}
	mData, _ := json.MarshalIndent(manifest, "", "  ")
	fw, _ := w.Create(prefix + "/manifest.json")
	fw.Write(mData)
	w.Close()
	return buf.Bytes(), nil
}

func injectManifestIntoZip(zipData []byte, skill model.Skill) ([]byte, error) {
	r, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		return zipData, nil
	}
	var rootDir string
	for _, f := range r.File {
		parts := strings.SplitN(filepath.ToSlash(f.Name), "/", 2)
		if len(parts) > 0 && parts[0] != "" {
			rootDir = parts[0]
			break
		}
	}
	if rootDir == "" {
		rootDir = skill.Name
	}
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for _, f := range r.File {
		fw, err := w.Create(f.Name)
		if err != nil {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		io.Copy(fw, rc)
		rc.Close()
	}
	manifest := skillManifest{
		Name:        skill.Name,
		Description: skill.Description,
		Author:      skill.Author,
		Version:     skill.MarketplaceVersion,
		Source:      skill.Source,
		ExportedAt:  time.Now().Format(time.RFC3339),
	}
	mData, _ := json.MarshalIndent(manifest, "", "  ")
	fw, _ := w.Create(rootDir + "/manifest.json")
	fw.Write(mData)
	w.Close()
	return buf.Bytes(), nil
}

// ExportSkill GET /api/skills/:id/export — 下载 skill 的 zip 包（含 manifest.json）
func ExportSkill(c *gin.Context) {
	id := c.Param("id")
	var skill model.Skill
	err := db.DB.QueryRow(`SELECT id, name, description, file_path, installed, source, marketplace_version, author FROM skills WHERE id=?`, id).
		Scan(&skill.ID, &skill.Name, &skill.Description, &skill.FilePath, &skill.Installed, &skill.Source, &skill.MarketplaceVersion, &skill.Author)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}
	data, err := buildSkillZipWithManifest(skill)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, skill.Name))
	c.Data(http.StatusOK, "application/zip", data)
}

// BatchExportSkills POST /api/skills/batch-export — 批量导出多个 skill 为单个 zip
func BatchExportSkills(c *gin.Context) {
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}
	var buf bytes.Buffer
	outerZip := zip.NewWriter(&buf)
	exported := 0
	for _, id := range body.IDs {
		var skill model.Skill
		err := db.DB.QueryRow(`SELECT id, name, description, file_path, installed, source, marketplace_version, author FROM skills WHERE id=?`, id).
			Scan(&skill.ID, &skill.Name, &skill.Description, &skill.FilePath, &skill.Installed, &skill.Source, &skill.MarketplaceVersion, &skill.Author)
		if err != nil {
			continue
		}
		data, err := buildSkillZipWithManifest(skill)
		if err != nil {
			continue
		}
		fw, err := outerZip.Create(fmt.Sprintf("%s.zip", skill.Name))
		if err != nil {
			continue
		}
		fw.Write(data)
		exported++
	}
	outerZip.Close()
	if exported == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "没有可导出的技能"})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="skills-export.zip"`)
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// readZipFiles 从 zip 字节读取文件列表
func readZipFiles(data []byte) ([]SkillFile, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	var files []SkillFile
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		content, _ := io.ReadAll(rc)
		rc.Close()
		files = append(files, SkillFile{Path: filepath.ToSlash(f.Name), Content: string(content)})
	}
	return files, nil
}

// ─── 工具函数 ────────────────────────────────────────────────────

type SkillFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func readDirFiles(dir string) ([]SkillFile, error) {
	var files []SkillFile
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)
		if strings.HasPrefix(filepath.Base(rel), ".") {
			return nil
		}
		content, _ := os.ReadFile(path)
		files = append(files, SkillFile{Path: rel, Content: string(content)})
		return nil
	})
	return files, err
}

func detectSkillName(tmpDir string) string {
	entries, _ := os.ReadDir(tmpDir)
	for _, e := range entries {
		if e.IsDir() {
			if _, err := os.Stat(filepath.Join(tmpDir, e.Name(), "SKILL.md")); err == nil {
				return e.Name()
			}
		}
	}
	return ""
}

func validateAndParseSkillZip(data []byte) (string, string, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", "", fmt.Errorf("无效的 zip 文件")
	}
	var rootDir, skillMDContent string
	for _, f := range r.File {
		parts := strings.SplitN(filepath.ToSlash(f.Name), "/", 2)
		if len(parts) == 0 {
			continue
		}
		if rootDir == "" {
			rootDir = parts[0]
		}
		if filepath.Base(f.Name) == "SKILL.md" && !f.FileInfo().IsDir() {
			rc, _ := f.Open()
			content, _ := io.ReadAll(rc)
			rc.Close()
			skillMDContent = string(content)
		}
	}
	if rootDir == "" {
		return "", "", fmt.Errorf("zip 文件为空")
	}
	if skillMDContent == "" {
		return "", "", fmt.Errorf("缺少 SKILL.md 文件")
	}
	return rootDir, parseSkillMDDescription(skillMDContent), nil
}

func parseSkillMDDescription(content string) string {
	if !strings.HasPrefix(content, "---") {
		return ""
	}
	end := strings.Index(content[3:], "---")
	if end < 0 {
		return ""
	}
	for _, line := range strings.Split(content[3:end+3], "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "description:") {
			desc := strings.TrimSpace(strings.TrimPrefix(line, "description:"))
			return strings.Trim(desc, `"'`)
		}
	}
	return ""
}

func unzip(data []byte, destDir string) error {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}
	for _, f := range r.File {
		target, pathErr := util.SafeJoinPath(destDir, f.Name)
		if pathErr != nil {
			continue
		}
		if f.FileInfo().IsDir() {
			// 目录必须带执行位，否则无法进入和读取其中文件
			dirMode := f.Mode() | 0111
			os.MkdirAll(target, dirMode)
			continue
		}
		os.MkdirAll(filepath.Dir(target), 0755)
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, rc)
		out.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func zipDir(tmpDir, skillName string) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	srcDir := filepath.Join(tmpDir, skillName)
	err := filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(tmpDir, path)
		rel = filepath.ToSlash(rel)
		if info.IsDir() {
			if rel != "." {
				_, err := w.Create(rel + "/")
				return err
			}
			return nil
		}
		fw, err := w.Create(rel)
		if err != nil {
			return err
		}
		data, _ := os.ReadFile(path)
		_, err = fw.Write(data)
		return err
	})
	if err != nil {
		return nil, err
	}
	w.Close()
	return buf.Bytes(), nil
}

