package handler

import (
	"bufio"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type fileEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

// ListDirectory GET /api/files/list?path=xxx
func ListDirectory(c *gin.Context) {
	dirPath := c.Query("path")
	if dirPath == "" {
		home, _ := os.UserHomeDir()
		dirPath = home
	}

	dirPath = expandHome(dirPath)

	info, err := os.Stat(dirPath)
	if err != nil || !info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效目录路径"})
		return
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var dirs, files []fileEntry
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		if shouldSkipEntry(name) {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		entry := fileEntry{
			Name:  name,
			Path:  filepath.Join(dirPath, name),
			IsDir: e.IsDir(),
			Size:  fi.Size(),
		}
		if e.IsDir() {
			dirs = append(dirs, entry)
		} else {
			files = append(files, entry)
		}
	}

	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name < dirs[j].Name })
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })

	result := append(dirs, files...)
	if result == nil {
		result = []fileEntry{}
	}

	c.JSON(http.StatusOK, gin.H{
		"path":    dirPath,
		"entries": result,
		"parent":  filepath.Dir(dirPath),
	})
}

// ReadFileContent GET /api/files/read?path=xxx
func ReadFileContent(c *gin.Context) {
	filePath := c.Query("path")
	if filePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	filePath = expandHome(filePath)

	info, err := os.Stat(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}
	if info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "路径是目录，不是文件"})
		return
	}
	if info.Size() > 2*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件过大（>2MB），无法预览"})
		return
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	lang := detectLanguage(filePath)

	c.JSON(http.StatusOK, gin.H{
		"path":     filePath,
		"name":     filepath.Base(filePath),
		"content":  string(data),
		"size":     info.Size(),
		"language": lang,
	})
}

// WriteFileContent PUT /api/files/write
func WriteFileContent(c *gin.Context) {
	var body struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path and content are required"})
		return
	}

	filePath := expandHome(body.Path)

	info, err := os.Stat(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}
	if info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "路径是目录，不是文件"})
		return
	}

	if err := os.WriteFile(filePath, []byte(body.Content), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "path": filePath})
}

// GetProjectInfo GET /api/files/project?path=xxx
func GetProjectInfo(c *gin.Context) {
	dirPath := c.Query("path")
	if dirPath == "" {
		home, _ := os.UserHomeDir()
		dirPath = home
	}
	dirPath = expandHome(dirPath)

	var totalFiles, totalDirs int
	var languages = make(map[string]int)

	filepath.WalkDir(dirPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()
		if strings.HasPrefix(name, ".") || shouldSkipEntry(name) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			totalDirs++
		} else {
			totalFiles++
			lang := detectLanguage(path)
			if lang != "" && lang != "text" {
				languages[lang]++
			}
		}
		return nil
	})

	c.JSON(http.StatusOK, gin.H{
		"path":       dirPath,
		"total_files": totalFiles,
		"total_dirs":  totalDirs,
		"languages":  languages,
	})
}

// SearchFiles GET /api/files/search?path=xxx&query=xxx&glob=xxx
// 在项目目录中递归搜索文件内容，返回匹配行
func SearchFiles(c *gin.Context) {
	dirPath := c.Query("path")
	query := c.Query("query")
	glob := c.Query("glob")
	if dirPath == "" || query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path and query are required"})
		return
	}
	dirPath = expandHome(dirPath)

	info, err := os.Stat(dirPath)
	if err != nil || !info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效目录路径"})
		return
	}

	queryLower := strings.ToLower(query)
	const maxResults = 200
	type searchResult struct {
		File       string `json:"file"`
		Line       int    `json:"line"`
		Content    string `json:"content"`
		RelPath    string `json:"relPath"`
	}
	var results []searchResult

	isBinaryExt := func(ext string) bool {
		bin := map[string]bool{
			".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".ico": true,
			".svg": true, ".woff": true, ".woff2": true, ".ttf": true, ".eot": true,
			".mp3": true, ".mp4": true, ".avi": true, ".mov": true, ".pdf": true,
			".zip": true, ".tar": true, ".gz": true, ".rar": true, ".7z": true,
			".exe": true, ".dll": true, ".so": true, ".dylib": true, ".bin": true,
			".wasm": true, ".o": true, ".a": true, ".pyc": true, ".class": true,
		}
		return bin[strings.ToLower(ext)]
	}

	matchGlob := func(name string) bool {
		if glob == "" {
			return true
		}
		matched, err := filepath.Match(glob, name)
		return err == nil && matched
	}

	filepath.WalkDir(dirPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil || len(results) >= maxResults {
			return nil
		}
		name := d.Name()
		if strings.HasPrefix(name, ".") || shouldSkipEntry(name) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if isBinaryExt(filepath.Ext(name)) {
			return nil
		}
		if !matchGlob(name) {
			return nil
		}
		fi, ferr := d.Info()
		if ferr != nil || fi.Size() > 1024*1024 {
			return nil
		}
		f, ferr := os.Open(path)
		if ferr != nil {
			return nil
		}
		defer f.Close()

		rel, _ := filepath.Rel(dirPath, path)
		scanner := bufio.NewScanner(f)
		lineNum := 0
		for scanner.Scan() && len(results) < maxResults {
			lineNum++
			line := scanner.Text()
			if strings.Contains(strings.ToLower(line), queryLower) {
				content := line
				runes := []rune(content)
				if len(runes) > 200 {
					content = string(runes[:200]) + "..."
				}
				results = append(results, searchResult{
					File:    path,
					Line:    lineNum,
					Content: content,
					RelPath: rel,
				})
			}
		}
		return nil
	})

	c.JSON(http.StatusOK, gin.H{
		"results": results,
		"total":   len(results),
		"query":   query,
		"truncated": len(results) >= maxResults,
	})
}

// SearchFileNames GET /api/files/search-names?path=xxx&query=xxx
// 按文件名搜索
func SearchFileNames(c *gin.Context) {
	dirPath := c.Query("path")
	query := c.Query("query")
	if dirPath == "" || query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path and query are required"})
		return
	}
	dirPath = expandHome(dirPath)

	queryLower := strings.ToLower(query)
	maxStr := c.DefaultQuery("limit", "100")
	maxResults, _ := strconv.Atoi(maxStr)
	if maxResults <= 0 {
		maxResults = 100
	}

	type nameResult struct {
		Name    string `json:"name"`
		Path    string `json:"path"`
		RelPath string `json:"relPath"`
		IsDir   bool   `json:"isDir"`
	}
	var results []nameResult

	filepath.WalkDir(dirPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil || len(results) >= maxResults {
			return nil
		}
		name := d.Name()
		if strings.HasPrefix(name, ".") || shouldSkipEntry(name) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.Contains(strings.ToLower(name), queryLower) {
			rel, _ := filepath.Rel(dirPath, path)
			results = append(results, nameResult{
				Name:    name,
				Path:    path,
				RelPath: rel,
				IsDir:   d.IsDir(),
			})
		}
		return nil
	})

	c.JSON(http.StatusOK, gin.H{
		"results": results,
		"total":   len(results),
	})
}

func expandHome(p string) string {
	if strings.HasPrefix(p, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, p[2:])
	}
	return p
}

func shouldSkipEntry(name string) bool {
	skip := map[string]bool{
		"node_modules": true, "__pycache__": true, ".git": true,
		".DS_Store": true, "dist": true, "build": true,
		".next": true, ".nuxt": true, "vendor": true,
		"target": true, ".cache": true, ".parcel-cache": true,
	}
	return skip[name]
}

func detectLanguage(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	langMap := map[string]string{
		".go": "go", ".js": "javascript", ".jsx": "jsx",
		".ts": "typescript", ".tsx": "tsx", ".py": "python",
		".rs": "rust", ".java": "java", ".c": "c", ".cpp": "cpp",
		".h": "c", ".hpp": "cpp", ".cs": "csharp", ".rb": "ruby",
		".php": "php", ".swift": "swift", ".kt": "kotlin",
		".sh": "bash", ".bash": "bash", ".zsh": "bash",
		".yaml": "yaml", ".yml": "yaml", ".json": "json",
		".xml": "xml", ".html": "html", ".css": "css",
		".scss": "scss", ".less": "less", ".sql": "sql",
		".md": "markdown", ".toml": "toml", ".ini": "ini",
		".cfg": "ini", ".conf": "ini", ".dockerfile": "dockerfile",
		".proto": "protobuf", ".graphql": "graphql", ".gql": "graphql",
		".vue": "vue", ".svelte": "svelte", ".lua": "lua",
		".r": "r", ".dart": "dart", ".ex": "elixir", ".erl": "erlang",
		".zig": "zig", ".nim": "nim", ".txt": "text",
	}
	if name := filepath.Base(path); name == "Dockerfile" || name == "Makefile" || name == "Rakefile" {
		return strings.ToLower(name)
	}
	if l, ok := langMap[ext]; ok {
		return l
	}
	return "text"
}
