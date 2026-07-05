package handler

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"lingxi-core/store"

	"github.com/gin-gonic/gin"
)

func webSkillsDir(uid int64) string {
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}
	dir := fmt.Sprintf("%s/users/%d/skills", dataDir, uid)
	os.MkdirAll(dir, 0755)
	abs, err := filepath.Abs(dir)
	if err != nil {
		return dir
	}
	return abs
}

// WebUploadSkill POST /api/skills/upload
func WebUploadSkill(c *gin.Context) {
	uid := userID(c)
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

	skillName, description, err := webValidateSkillZip(data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	storageDir := webSkillsDir(uid)
	filePath := filepath.Join(storageDir, skillName+".zip")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	sk := &store.Skill{
		Name:        skillName,
		Description: description,
		FilePath:    filePath,
		Installed:   false,
	}
	id, err := webStore.InsertSkill(c.Request.Context(), uid, sk)
	if err != nil {
		os.Remove(filePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存数据库失败: " + err.Error()})
		return
	}
	sk.ID = id

	c.JSON(http.StatusOK, sk)
}

// WebInstallSkill POST /api/skills/:id/install
func WebInstallSkill(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	sk, err := webStore.GetSkill(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}

	if err := webDeploySkillFromFile(uid, sk.Name, sk.FilePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "部署技能文件失败: " + err.Error()})
		return
	}

	if err := webStore.SetSkillInstalled(c.Request.Context(), uid, id, true); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "安装成功"})
}

// WebUninstallSkill POST /api/skills/:id/uninstall
func WebUninstallSkill(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	sk, err := webStore.GetSkill(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}

	skillDir := filepath.Join(webUserSkillsPath(uid), sk.Name)
	os.RemoveAll(skillDir)

	if err := webStore.SetSkillInstalled(c.Request.Context(), uid, id, false); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "卸载成功"})
}

// WebGetSkillContent GET /api/skills/:id/content
func WebGetSkillContent(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	sk, err := webStore.GetSkill(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}

	if sk.FilePath == "" {
		c.JSON(http.StatusOK, gin.H{"name": sk.Name, "content": ""})
		return
	}

	data, err := os.ReadFile(sk.FilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}

	// 从 zip 中提取 SKILL.md 内容
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解析 zip 失败"})
		return
	}

	for _, f := range zr.File {
		if strings.HasSuffix(f.Name, "/SKILL.md") || f.Name == "SKILL.md" {
			rc, err := f.Open()
			if err != nil {
				continue
			}
			content, _ := io.ReadAll(rc)
			rc.Close()
			c.JSON(http.StatusOK, gin.H{"name": sk.Name, "content": string(content)})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"name": sk.Name, "content": ""})
}

// WebExportSkill GET /api/skills/:id/export
func WebExportSkill(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	sk, err := webStore.GetSkill(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill 不存在"})
		return
	}

	if sk.FilePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有文件可导出"})
		return
	}

	data, err := os.ReadFile(sk.FilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, sk.Name))
	c.Data(http.StatusOK, "application/zip", data)
}

// WebBatchUploadSkills POST /api/skills/batch-upload
func WebBatchUploadSkills(c *gin.Context) {
	uid := userID(c)
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传文件"})
		return
	}
	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未找到文件"})
		return
	}

	type batchResult struct {
		Filename string      `json:"filename"`
		Success  bool        `json:"success"`
		Error    string      `json:"error,omitempty"`
		Skill    *store.Skill `json:"skill,omitempty"`
	}
	results := make([]batchResult, 0, len(files))
	storageDir := webSkillsDir(uid)

	for _, fh := range files {
		if !strings.HasSuffix(strings.ToLower(fh.Filename), ".zip") {
			results = append(results, batchResult{Filename: fh.Filename, Error: "不是 .zip 文件"})
			continue
		}
		f, err := fh.Open()
		if err != nil {
			results = append(results, batchResult{Filename: fh.Filename, Error: "读取失败"})
			continue
		}
		data, err := io.ReadAll(f)
		f.Close()
		if err != nil {
			results = append(results, batchResult{Filename: fh.Filename, Error: "读取失败"})
			continue
		}
		skillName, description, err := webValidateSkillZip(data)
		if err != nil {
			results = append(results, batchResult{Filename: fh.Filename, Error: err.Error()})
			continue
		}
		filePath := filepath.Join(storageDir, skillName+".zip")
		if err := os.WriteFile(filePath, data, 0644); err != nil {
			results = append(results, batchResult{Filename: fh.Filename, Error: "保存失败"})
			continue
		}
		sk := &store.Skill{Name: skillName, Description: description, FilePath: filePath}
		id, err := webStore.InsertSkill(c.Request.Context(), uid, sk)
		if err != nil {
			os.Remove(filePath)
			results = append(results, batchResult{Filename: fh.Filename, Error: "入库失败: " + err.Error()})
			continue
		}
		sk.ID = id
		results = append(results, batchResult{Filename: fh.Filename, Success: true, Skill: sk})
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// WebBatchExportSkills POST /api/skills/batch-export
func WebBatchExportSkills(c *gin.Context) {
	uid := userID(c)
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择技能"})
		return
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, id := range body.IDs {
		sk, err := webStore.GetSkill(c.Request.Context(), uid, id)
		if err != nil {
			continue
		}
		if sk.FilePath == "" {
			continue
		}
		data, err := os.ReadFile(sk.FilePath)
		if err != nil {
			continue
		}
		w, err := zw.Create(sk.Name + ".zip")
		if err != nil {
			continue
		}
		w.Write(data)
	}
	zw.Close()

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", `attachment; filename="skills-export.zip"`)
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// WebGenerateSkillStream POST /api/skills/generate/stream (stub)
func WebGenerateSkillStream(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "Web 版暂不支持 AI 生成技能"})
}

// WebConfirmGeneratedSkill POST /api/skills/generate/confirm (stub)
func WebConfirmGeneratedSkill(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "Web 版暂不支持 AI 生成技能"})
}

// WebFromGitScan POST /api/skills/from-git
func WebFromGitScan(c *gin.Context) {
	var body struct {
		URL string `json:"url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}

	tmpDir, err := os.MkdirTemp("", "lingxi-git-skill-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建临时目录失败: " + err.Error()})
		return
	}

	cmd := exec.Command("git", "clone", "--depth", "1", body.URL, tmpDir)
	output, err := cmd.CombinedOutput()
	if err != nil {
		os.RemoveAll(tmpDir)
		c.JSON(http.StatusBadRequest, gin.H{"error": "git clone 失败: " + string(output)})
		return
	}

	type gitSkillEntry struct {
		Name    string `json:"name"`
		Desc    string `json:"description"`
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	var skills []gitSkillEntry
	filepath.WalkDir(tmpDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			base := filepath.Base(path)
			if base == ".git" || base == "node_modules" || base == ".venv" {
				return filepath.SkipDir
			}
			return nil
		}
		name := d.Name()
		if !strings.EqualFold(name, "SKILL.md") {
			return nil
		}
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}
		relPath, _ := filepath.Rel(tmpDir, filepath.Dir(path))
		skillName, skillDesc := webParseSkillMd(string(content))
		if skillName == "" {
			skillName = relPath
		}
		skills = append(skills, gitSkillEntry{
			Name:    skillName,
			Desc:    skillDesc,
			Path:    relPath,
			Content: string(content),
		})
		return nil
	})

	if len(skills) == 0 {
		os.RemoveAll(tmpDir)
		c.JSON(http.StatusOK, gin.H{"skills": []struct{}{}, "message": "未在仓库中找到 SKILL.md 文件"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"skills": skills, "tmpDir": tmpDir})
}

// WebFromGitInstall POST /api/skills/from-git/install
func WebFromGitInstall(c *gin.Context) {
	uid := userID(c)
	var body struct {
		TmpDir string   `json:"tmpDir"`
		Paths  []string `json:"paths"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.TmpDir == "" || len(body.Paths) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tmpDir and paths are required"})
		return
	}

	if !strings.HasPrefix(body.TmpDir, os.TempDir()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tmpDir"})
		return
	}

	storageDir := webSkillsDir(uid)
	installed := 0
	for _, relPath := range body.Paths {
		srcDir := filepath.Join(body.TmpDir, relPath)
		if _, err := os.Stat(srcDir); err != nil {
			continue
		}
		skillMdPath := filepath.Join(srcDir, "SKILL.md")
		content, err := os.ReadFile(skillMdPath)
		if err != nil {
			continue
		}
		skillName, skillDesc := webParseSkillMd(string(content))
		if skillName == "" {
			skillName = filepath.Base(relPath)
			if skillName == "." || skillName == "" {
				skillName = "git-imported"
			}
		}

		// 打包为 zip 存储
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		filepath.WalkDir(srcDir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			rel, _ := filepath.Rel(srcDir, path)
			w, wErr := zw.Create(skillName + "/" + rel)
			if wErr != nil {
				return nil
			}
			data, rErr := os.ReadFile(path)
			if rErr != nil {
				return nil
			}
			w.Write(data)
			return nil
		})
		zw.Close()

		zipPath := filepath.Join(storageDir, skillName+".zip")
		if err := os.WriteFile(zipPath, buf.Bytes(), 0644); err != nil {
			continue
		}

		sk := &store.Skill{
			Name:        skillName,
			Description: skillDesc,
			FilePath:    zipPath,
			Source:      "git",
		}
		_, err = webStore.InsertSkill(c.Request.Context(), uid, sk)
		if err != nil {
			os.Remove(zipPath)
			continue
		}
		installed++
	}

	os.RemoveAll(body.TmpDir)

	if installed == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "没有成功安装任何技能"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"installed": installed})
}

func webParseSkillMd(content string) (name, desc string) {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if name == "" && strings.HasPrefix(trimmed, "# ") {
			name = strings.TrimPrefix(trimmed, "# ")
			name = strings.TrimSpace(name)
		} else if name != "" && desc == "" && trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			desc = trimmed
			if len(desc) > 200 {
				desc = desc[:200] + "…"
			}
			break
		}
	}
	if name == "" {
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.Contains(strings.ToLower(trimmed), "name:") {
				parts := strings.SplitN(trimmed, ":", 2)
				if len(parts) == 2 {
					name = strings.TrimSpace(parts[1])
					break
				}
			}
		}
	}
	if desc == "" && len(content) > 0 {
		desc = fmt.Sprintf("SKILL.md (%d bytes)", len(content))
	}
	return
}

// webDeploySkillFromFile 将 skill zip 解压到用户的 claude skills 目录（对齐桌面端 deploySkillFromFile）
func webDeploySkillFromFile(uid int64, name, filePath string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("read zip: %w", err)
	}
	destBase := webUserSkillsPath(uid)
	destDir := filepath.Join(destBase, name)
	os.RemoveAll(destDir)
	if err := webUnzip(data, destBase); err != nil {
		return err
	}
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

// webUnzip 将 zip 数据解压到 destDir（对齐桌面端 unzip）
func webUnzip(data []byte, destDir string) error {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}
	for _, f := range zr.File {
		fpath := filepath.Join(destDir, f.Name)
		if !strings.HasPrefix(fpath, filepath.Clean(destDir)+string(os.PathSeparator)) {
			continue
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, 0755)
			continue
		}
		os.MkdirAll(filepath.Dir(fpath), 0755)
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(fpath)
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
		if f.Mode()&0111 != 0 {
			os.Chmod(fpath, f.Mode())
		}
	}
	return nil
}

// WebBootstrapInstalledSkills 启动时恢复所有用户的已安装技能（对齐桌面端 BootstrapInstalledSkills）
func WebBootstrapInstalledSkills() {
	if webStore == nil {
		return
	}
	type userLister interface {
		ListAllUserIDs(ctx context.Context) ([]int64, error)
	}
	ul, ok := webStore.(userLister)
	if !ok {
		slog.Warn("[web-skill] bootstrap: store does not support ListAllUserIDs")
		return
	}
	ctx := context.Background()
	users, err := ul.ListAllUserIDs(ctx)
	if err != nil {
		slog.Warn("[web-skill] bootstrap: list users failed", "err", err)
		return
	}
	total := 0
	for _, uid := range users {
		skills, err := webStore.ListSkills(ctx, uid)
		if err != nil {
			continue
		}
		for _, sk := range skills {
			if !sk.Installed || sk.FilePath == "" {
				continue
			}
			if _, statErr := os.Stat(sk.FilePath); statErr != nil {
				continue
			}
			destDir := filepath.Join(webUserSkillsPath(uid), sk.Name)
			if info, e := os.Stat(destDir); e == nil && info.IsDir() {
				continue
			}
			if err := webDeploySkillFromFile(uid, sk.Name, sk.FilePath); err != nil {
				slog.Warn("[web-skill] bootstrap deploy failed", "user", uid, "skill", sk.Name, "err", err)
			} else {
				total++
			}
		}
	}
	if total > 0 {
		slog.Info("[web-skill] bootstrapped installed skills", "deployed", total)
	}
}

// ─── 工具函数 ────────────────

func webValidateSkillZip(data []byte) (string, string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", "", fmt.Errorf("无效的 zip 文件")
	}

	var skillName, description string
	foundSkillMd := false

	for _, f := range zr.File {
		if strings.HasSuffix(f.Name, "/SKILL.md") || f.Name == "SKILL.md" {
			foundSkillMd = true
			rc, err := f.Open()
			if err != nil {
				continue
			}
			content, _ := io.ReadAll(rc)
			rc.Close()

			// 从路径提取 skill 名称
			parts := strings.Split(f.Name, "/")
			if len(parts) >= 2 {
				skillName = parts[0]
			}

			// 从 SKILL.md frontmatter 提取描述
			lines := strings.Split(string(content), "\n")
			inFrontmatter := false
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line == "---" {
					if !inFrontmatter {
						inFrontmatter = true
					} else {
						break
					}
					continue
				}
				if inFrontmatter {
					if strings.HasPrefix(line, "name:") {
						if skillName == "" {
							skillName = strings.TrimSpace(strings.TrimPrefix(line, "name:"))
							skillName = strings.Trim(skillName, `"'`)
						}
					}
					if strings.HasPrefix(line, "description:") {
						description = strings.TrimSpace(strings.TrimPrefix(line, "description:"))
						description = strings.Trim(description, `"'`)
					}
				}
			}
			break
		}
	}

	if !foundSkillMd {
		return "", "", fmt.Errorf("zip 中未找到 SKILL.md 文件")
	}
	if skillName == "" {
		skillName = "unnamed-skill"
	}

	return skillName, description, nil
}
