package handler

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	readability "github.com/go-shiori/go-readability"
	"lingxi-agent/db"
	"lingxi-agent/vectordb"
)

// ImportKnowledgeFromURL POST /api/knowledge/from-url
func ImportKnowledgeFromURL(c *gin.Context) {
	var body struct {
		URL      string `json:"url" binding:"required"`
		Title    string `json:"title"`
		Category string `json:"category"`
		Tags     string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 url 字段"})
		return
	}

	parsed, err := url.Parse(body.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 URL，需要 http/https"})
		return
	}

	if body.Category == "" {
		body.Category = "docs"
	}
	if body.Tags == "" {
		body.Tags = "[]"
	}

	title, content, err := fetchAndExtract(body.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "抓取失败: " + err.Error()})
		return
	}

	if body.Title != "" {
		title = body.Title
	}
	if title == "" {
		title = parsed.Host + parsed.Path
	}

	id, relPath, err := saveWebContent(title, content, body.URL, body.Category, body.Tags)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	go vectordb.IndexSingleFile(knowledgeDir(), id, relPath)

	c.JSON(http.StatusOK, gin.H{
		"id":        id,
		"title":     title,
		"file_path": relPath,
		"category":  body.Category,
		"message":   "导入成功",
	})
}

// BatchImportKnowledgeFromURLs POST /api/knowledge/from-urls
func BatchImportKnowledgeFromURLs(c *gin.Context) {
	var body struct {
		URLs     []string `json:"urls" binding:"required"`
		Category string   `json:"category"`
		Tags     string   `json:"tags"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 urls 数组"})
		return
	}
	if len(body.URLs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "urls 不能为空"})
		return
	}
	if len(body.URLs) > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "一次最多 20 个 URL"})
		return
	}

	if body.Category == "" {
		body.Category = "docs"
	}
	if body.Tags == "" {
		body.Tags = "[]"
	}

	type result struct {
		URL   string `json:"url"`
		ID    int64  `json:"id,omitempty"`
		Title string `json:"title,omitempty"`
		Error string `json:"error,omitempty"`
	}

	results := make([]result, 0, len(body.URLs))
	successCount := 0

	for _, rawURL := range body.URLs {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}

		parsed, err := url.Parse(rawURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			results = append(results, result{URL: rawURL, Error: "无效的 URL"})
			continue
		}

		title, content, err := fetchAndExtract(rawURL)
		if err != nil {
			results = append(results, result{URL: rawURL, Error: err.Error()})
			continue
		}
		if title == "" {
			title = parsed.Host + parsed.Path
		}

		id, relPath, err := saveWebContent(title, content, rawURL, body.Category, body.Tags)
		if err != nil {
			results = append(results, result{URL: rawURL, Error: err.Error()})
			continue
		}

		go vectordb.IndexSingleFile(knowledgeDir(), id, relPath)
		results = append(results, result{URL: rawURL, ID: id, Title: title})
		successCount++
	}

	c.JSON(http.StatusOK, gin.H{
		"results": results,
		"success": successCount,
		"total":   len(results),
	})
}

// fetchAndExtract 抓取 URL 内容并提取正文
func fetchAndExtract(rawURL string) (title string, content string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return "", "", fmt.Errorf("构建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		return "", "", fmt.Errorf("读取响应失败: %w", err)
	}

	parsedURL, _ := url.Parse(rawURL)
	article, err := readability.FromReader(strings.NewReader(string(body)), parsedURL)
	if err != nil {
		return "", "", fmt.Errorf("提取正文失败: %w", err)
	}

	title = article.Title
	content = article.TextContent
	if content == "" {
		content = article.Content
	}

	content = strings.TrimSpace(content)
	if len(content) < 50 {
		return "", "", fmt.Errorf("提取内容过短，可能不是文章页面")
	}

	return title, content, nil
}

// saveWebContent 保存网页内容到知识库文件并入库
func saveWebContent(title, content, sourceURL, category, tags string) (int64, string, error) {
	kbDir := knowledgeDir()
	catDir := filepath.Join(kbDir, category)
	os.MkdirAll(catDir, 0755)

	ts := time.Now().Format("20060102-150405")
	filename := fmt.Sprintf("web-%s.md", ts)
	destPath := filepath.Join(catDir, filename)

	// 写入文件（包含元信息头）
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s\n\n", title))
	sb.WriteString(fmt.Sprintf("> 来源: %s\n", sourceURL))
	sb.WriteString(fmt.Sprintf("> 采集时间: %s\n\n", time.Now().Format("2006-01-02 15:04:05")))
	sb.WriteString(content)

	fileContent := sb.String()
	if err := os.WriteFile(destPath, []byte(fileContent), 0644); err != nil {
		return 0, "", fmt.Errorf("写入文件失败: %w", err)
	}

	summary := extractSummary(content)
	relPath := filepath.Join(category, filename)
	fileInfo, _ := os.Stat(destPath)
	size := int64(0)
	if fileInfo != nil {
		size = fileInfo.Size()
	}

	id, err := db.InsertKnowledge(title, relPath, category, tags, summary, size)
	if err != nil {
		os.Remove(destPath)
		return 0, "", fmt.Errorf("数据库写入失败: %w", err)
	}

	rebuildIndex()
	return id, relPath, nil
}
