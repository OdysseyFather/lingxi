package handler

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

type gitSkillEntry struct {
	Name    string `json:"name"`
	Desc    string `json:"description"`
	Path    string `json:"path"`
	Content string `json:"content"`
}

// SkillFromGitScan POST /api/skills/from-git
// 克隆 Git 仓库并扫描所有 SKILL.md 文件
func SkillFromGitScan(c *gin.Context) {
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

	var skills []gitSkillEntry
	filepath.WalkDir(tmpDir, func(path string, d fs.DirEntry, err error) error {
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
		skillName, skillDesc := parseSkillMd(string(content))
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
		c.JSON(http.StatusOK, gin.H{"skills": []gitSkillEntry{}, "message": "未在仓库中找到 SKILL.md 文件"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"skills": skills, "tmpDir": tmpDir})
}

// SkillFromGitInstall POST /api/skills/from-git/install
// 安装选中的技能（从临时克隆目录复制到技能目录）
func SkillFromGitInstall(c *gin.Context) {
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

	skillsDir := getSkillsDir()
	if err := os.MkdirAll(skillsDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建技能目录失败"})
		return
	}

	installed := 0
	for _, relPath := range body.Paths {
		srcDir := filepath.Join(body.TmpDir, relPath)
		if _, err := os.Stat(srcDir); err != nil {
			continue
		}
		destDir := filepath.Join(skillsDir, filepath.Base(relPath))
		if relPath == "." || relPath == "" {
			destDir = filepath.Join(skillsDir, "git-imported")
		}
		if err := copyDir(srcDir, destDir); err != nil {
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
	invalidateSkillsCache()
}

func getSkillsDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "Application Support", "灵犀", "skills")
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relPath, _ := filepath.Rel(src, path)
		targetPath := filepath.Join(dst, relPath)
		if d.IsDir() {
			return os.MkdirAll(targetPath, 0o755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(targetPath, data, 0o644)
	})
}

func parseSkillMd(content string) (name, desc string) {
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
