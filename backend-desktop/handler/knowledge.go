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

	"github.com/gin-gonic/gin"
	pdf "github.com/ledongthuc/pdf"
	"github.com/nguyenthenguyen/docx"
	"lingxi-agent/db"
	"lingxi-agent/util"
	"lingxi-agent/vectordb"
)

// knowledgeDir 返回知识库根目录（$HOME/knowledge/）
func knowledgeDir() string {
	dir := filepath.Join(isolatedHome(), "knowledge")
	os.MkdirAll(filepath.Join(dir, "docs"), 0755)
	os.MkdirAll(filepath.Join(dir, "qa"), 0755)
	os.MkdirAll(filepath.Join(dir, "data"), 0755)
	return dir
}

// indexPath 返回知识库索引文件路径
func indexPath() string {
	return filepath.Join(knowledgeDir(), "INDEX.md")
}

// rebuildIndex 根据数据库记录重建 INDEX.md
func rebuildIndex() error {
	items, err := db.ListKnowledge()
	if err != nil {
		return err
	}

	var sb strings.Builder
	sb.WriteString("# 知识库索引\n\n")
	sb.WriteString(fmt.Sprintf("更新时间：%s\n\n", time.Now().Format("2006-01-02 15:04:05")))

	if len(items) == 0 {
		sb.WriteString("（知识库为空）\n")
	} else {
		for _, item := range items {
			filePath, _ := item["file_path"].(string)
			title, _ := item["title"].(string)
			tags, _ := item["tags"].(string)
			summary, _ := item["summary"].(string)
			category, _ := item["category"].(string)

			sb.WriteString(fmt.Sprintf("## %s/%s\n", category, filepath.Base(filePath)))
			sb.WriteString(fmt.Sprintf("- 标题：%s\n", title))
			if tags != "" && tags != "[]" {
				sb.WriteString(fmt.Sprintf("- 标签：%s\n", tags))
			}
			if summary != "" {
				sb.WriteString(fmt.Sprintf("- 摘要：%s\n", summary))
			}
			sb.WriteString("\n")
		}
	}

	return os.WriteFile(indexPath(), []byte(sb.String()), 0644)
}

// extractSummary 从文件内容中提取摘要（前 300 字）
func extractSummary(content string) string {
	runes := []rune(content)
	// 跳过 frontmatter 和标题行
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

// extractTextFromDocx 从 .docx 文件提取纯文本
func extractTextFromDocx(data []byte) (string, error) {
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

// extractTextFromPDF 从 .pdf 文件提取纯文本
func extractTextFromPDF(data []byte) (string, error) {
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

// categoryFromExt 根据文件扩展名推断分类
func categoryFromExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".csv", ".tsv", ".json", ".xml":
		return "data"
	case ".md", ".txt", ".rst":
		return "docs"
	case ".pdf", ".docx", ".pptx":
		return "docs"
	default:
		return "docs"
	}
}

// ─── Handlers ────────────────────────────────────────────────────

// ListKnowledge GET /api/knowledge
func ListKnowledge(c *gin.Context) {
	items, err := db.ListKnowledge()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

// UploadKnowledge POST /api/knowledge
// multipart/form-data: file (required), title (optional), tags (optional), category (optional)
func UploadKnowledge(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传文件"})
		return
	}
	defer file.Close()

	// 限制文件大小 10MB
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

	// 读取文件内容
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
			content, extractErr = extractTextFromPDF(buf)
		case ".docx":
			content, extractErr = extractTextFromDocx(buf)
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

	// 确定分类（支持自定义分类，不再限制为 docs/qa/data）
	category := c.PostForm("category")
	if category == "" {
		category = categoryFromExt(ext)
	}

	// 保存文件（为自定义分类自动创建子目录）
	kbDir := knowledgeDir()
	destDir := filepath.Join(kbDir, category)
	os.MkdirAll(destDir, 0755)
	// 避免文件名冲突：若已存在则加时间戳
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

	// For binary formats, also save an extracted .txt alongside for preview
	if isBinary && content != "" {
		txtPath := destPath + ".extracted.txt"
		os.WriteFile(txtPath, []byte(content), 0644)
	}

	// 元数据
	title := c.PostForm("title")
	if title == "" {
		title = strings.TrimSuffix(header.Filename, ext)
	}
	tags := c.PostForm("tags")
	if tags == "" {
		tags = "[]"
	}
	summary := extractSummary(content)

	// 相对路径（相对于 kbDir）
	relPath := filepath.Join(category, filename)

	id, err := db.InsertKnowledge(title, relPath, category, tags, summary, header.Size)
	if err != nil {
		os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存记录失败: " + err.Error()})
		return
	}

	// 重建索引
	rebuildIndex()

	// 异步向量索引
	go vectordb.IndexSingleFile(knowledgeDir(), id, relPath)

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

// UpdateKnowledge PUT /api/knowledge/:id
func UpdateKnowledge(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}
	var body struct {
		Title    string `json:"title"`
		Category string `json:"category"`
		Tags     string `json:"tags"`
		Summary  string `json:"summary"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if body.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标题不能为空"})
		return
	}
	if body.Category == "" {
		body.Category = "docs"
	}
	if body.Tags == "" {
		body.Tags = "[]"
	}
	if err := db.UpdateKnowledge(id, body.Title, body.Category, body.Tags, body.Summary); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rebuildIndex()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteKnowledge DELETE /api/knowledge/:id
func DeleteKnowledge(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}

	relPath, err := db.DeleteKnowledge(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该知识库条目"})
		return
	}

	// 删除文件
	absPath := filepath.Join(knowledgeDir(), relPath)
	os.Remove(absPath)

	// 重建索引
	rebuildIndex()

	// 删除向量索引
	go vectordb.DeleteChunksByKnowledge(id)

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// BatchDeleteKnowledge POST /api/knowledge/batch-delete
func BatchDeleteKnowledge(c *gin.Context) {
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}
	deleted := 0
	for _, id := range body.IDs {
		relPath, err := db.DeleteKnowledge(id)
		if err != nil {
			continue
		}
		absPath := filepath.Join(knowledgeDir(), relPath)
		os.Remove(absPath)
		deleted++
	}
	rebuildIndex()
	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
}

// ─── 知识库分类管理 ──────────────────────────────────────────────

// ListKnowledgeCategories GET /api/knowledge/categories
func ListKnowledgeCategories(c *gin.Context) {
	cats, err := db.ListKnowledgeCategories()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cats)
}

// CreateKnowledgeCategory POST /api/knowledge/categories
func CreateKnowledgeCategory(c *gin.Context) {
	var body struct {
		Name string `json:"name"`
		Icon string `json:"icon"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "名称不能为空"})
		return
	}
	if body.Icon == "" {
		body.Icon = "📁"
	}
	id, err := db.CreateKnowledgeCategory(body.Name, body.Icon)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// DeleteKnowledgeCategory DELETE /api/knowledge/categories/:id
func DeleteKnowledgeCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}
	if err := db.DeleteKnowledgeCategory(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

// UpdateKnowledgeItemCategory PATCH /api/knowledge/:id/category
func UpdateKnowledgeItemCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}
	var body struct {
		Category string `json:"category"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Category == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "分类不能为空"})
		return
	}
	if err := db.UpdateKnowledgeItemCategory(id, body.Category); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rebuildIndex()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PreviewKnowledge GET /api/knowledge/:id/preview
func PreviewKnowledge(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}

	item, err := db.GetKnowledgeByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该知识库条目"})
		return
	}

	relPath, _ := item["file_path"].(string)
	absPath, pathErr := util.SafeJoinPath(knowledgeDir(), relPath)
	if pathErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非法文件路径"})
		return
	}

	// For binary formats, try reading the extracted text file first
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
		"title":   item["title"],
		"content": strings.Join(lines, "\n"),
		"lines":   len(lines),
	})
}
