package handler

import (
	"bufio"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"lingxi-core/store"

	"github.com/gin-gonic/gin"
	pdf "github.com/ledongthuc/pdf"
	"github.com/nguyenthenguyen/docx"
)

// WebUploadKnowledge POST /api/knowledge
func WebUploadKnowledge(c *gin.Context) {
	uid := userID(c)
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传文件"})
		return
	}
	defer file.Close()

	if header.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件大小不能超过 10MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{".md": true, ".txt": true, ".csv": true, ".tsv": true, ".json": true, ".pdf": true, ".docx": true}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 .md .txt .csv .tsv .json .pdf .docx 格式"})
		return
	}

	buf := make([]byte, header.Size)
	if _, err := file.Read(buf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}

	var content string
	isBinary := ext == ".pdf" || ext == ".docx"

	if isBinary {
		var extractErr error
		switch ext {
		case ".pdf":
			content, extractErr = webExtractTextFromPDF(buf)
		case ".docx":
			content, extractErr = webExtractTextFromDocx(buf)
		}
		if extractErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "文件解析失败: " + extractErr.Error()})
			return
		}
	} else {
		if !utf8.Valid(buf) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "文件必须是 UTF-8 编码"})
			return
		}
		content = string(buf)
	}

	category := c.PostForm("category")
	if category == "" {
		category = webCategoryFromExt(ext)
	}

	kbDir := webKnowledgeDir(uid)
	destDir := filepath.Join(kbDir, category)
	os.MkdirAll(destDir, 0755)
	filename := header.Filename
	destPath := filepath.Join(destDir, filename)
	if _, err := os.Stat(destPath); err == nil {
		base := strings.TrimSuffix(filename, ext)
		filename = fmt.Sprintf("%s_%d%s", base, time.Now().Unix(), ext)
		destPath = filepath.Join(destDir, filename)
	}

	if err := os.WriteFile(destPath, buf, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	if isBinary && content != "" {
		txtPath := destPath + ".extracted.txt"
		os.WriteFile(txtPath, []byte(content), 0644)
	}

	title := c.PostForm("title")
	if title == "" {
		title = strings.TrimSuffix(header.Filename, ext)
	}
	tags := c.PostForm("tags")
	if tags == "" {
		tags = "[]"
	}
	summary := webExtractSummary(content)

	relPath := filepath.Join(category, filename)

	item := &store.KnowledgeItem{
		Title:    title,
		FilePath: relPath,
		Category: category,
		Tags:     tags,
		Summary:  summary,
		Size: header.Size,
	}
	id, err := webStore.InsertKnowledge(c.Request.Context(), uid, item)
	if err != nil {
		os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存记录失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":        id,
		"title":     title,
		"file_path": relPath,
		"category":  category,
		"tags":      tags,
		"summary":   summary,
		"size":      header.Size,
	})
}

// WebPreviewKnowledge GET /api/knowledge/:id/preview
func WebPreviewKnowledge(c *gin.Context) {
	uid := userID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}

	item, err := webStore.GetKnowledge(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该知识库条目"})
		return
	}

	kbDir := webKnowledgeDir(uid)
	absPath := filepath.Join(kbDir, item.FilePath)

	readPath := absPath
	fileExt := strings.ToLower(filepath.Ext(absPath))
	if fileExt == ".pdf" || fileExt == ".docx" {
		extractedPath := absPath + ".extracted.txt"
		if _, err := os.Stat(extractedPath); err == nil {
			readPath = extractedPath
		}
	}

	f, err := os.Open(readPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法读取文件"})
		return
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() && len(lines) < 200 {
		lines = append(lines, scanner.Text())
	}

	c.JSON(http.StatusOK, gin.H{
		"id":      id,
		"title":   item.Title,
		"content": strings.Join(lines, "\n"),
		"lines":   len(lines),
	})
}

// WebUpdateKnowledge PUT /api/knowledge/:id
func WebUpdateKnowledge(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Title    string `json:"title"`
		Category string `json:"category"`
		Tags     string `json:"tags"`
		Summary  string `json:"summary"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := webStore.UpdateKnowledge(c.Request.Context(), uid, id, body.Title, body.Category, body.Tags, body.Summary); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// WebListKnowledgeCategories GET /api/knowledge/categories
func WebListKnowledgeCategories(c *gin.Context) {
	uid := userID(c)
	cats, err := webStore.ListKnowledgeCategories(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cats)
}

// WebCreateKnowledgeCategory POST /api/knowledge/categories
func WebCreateKnowledgeCategory(c *gin.Context) {
	uid := userID(c)
	var body struct {
		Name string `json:"name"`
		Icon string `json:"icon"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	id, err := webStore.CreateKnowledgeCategory(c.Request.Context(), uid, body.Name, body.Icon)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// WebDeleteKnowledgeCategory DELETE /api/knowledge/categories/:id
func WebDeleteKnowledgeCategory(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := webStore.DeleteKnowledgeCategory(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ─── 工具函数（从桌面端复制） ────────────────

func webExtractSummary(content string) string {
	runes := []rune(content)
	lines := strings.Split(content, "\n")
	var textLines []string
	inFrontmatter := false
	for i, line := range lines {
		if i == 0 && line == "---" {
			inFrontmatter = true
			continue
		}
		if inFrontmatter {
			if line == "---" {
				inFrontmatter = false
			}
			continue
		}
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		textLines = append(textLines, trimmed)
		if len(textLines) >= 5 {
			break
		}
	}

	summary := strings.Join(textLines, " ")
	summaryRunes := []rune(summary)
	if len(summaryRunes) > 150 {
		summary = string(summaryRunes[:150]) + "..."
	}
	if summary == "" && len(runes) > 0 {
		if len(runes) > 150 {
			summary = string(runes[:150]) + "..."
		} else {
			summary = string(runes)
		}
	}
	return summary
}

func webExtractTextFromDocx(data []byte) (string, error) {
	tmpFile, err := os.CreateTemp("", "kb-*.docx")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmpFile.Name())
	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		return "", err
	}
	tmpFile.Close()

	r, err := docx.ReadDocxFile(tmpFile.Name())
	if err != nil {
		return "", err
	}
	defer r.Close()
	return r.Editable().GetContent(), nil
}

func webExtractTextFromPDF(data []byte) (string, error) {
	tmpFile, err := os.CreateTemp("", "kb-*.pdf")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmpFile.Name())
	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		return "", err
	}
	tmpFile.Close()

	f, reader, err := pdf.Open(tmpFile.Name())
	if err != nil {
		return "", err
	}
	defer f.Close()

	var sb strings.Builder
	for i := 1; i <= reader.NumPage(); i++ {
		page := reader.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			continue
		}
		sb.WriteString(text)
		sb.WriteString("\n")
	}
	return sb.String(), nil
}

func webCategoryFromExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".csv", ".tsv", ".json", ".xml":
		return "data"
	default:
		return "docs"
	}
}
