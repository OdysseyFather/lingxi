package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	readability "github.com/go-shiori/go-readability"
)

// 深度联网搜索：
// 1. 多源并行查询（DuckDuckGo HTML 抓取 + Wikipedia API）
// 2. 提取每个结果链接的正文（readability）
// 3. LLM 综合推理 + 引用追踪
//
// 进度通过 SSE 推送给前端:
//   - source_start    | 开始查询某个搜索源
//   - source_done     | 某个搜索源查询完成（含结果数）
//   - fetch_start     | 开始抓取某个网页正文
//   - fetch_done      | 网页正文抓取完成（含字数）
//   - synthesizing    | 进入 LLM 综合阶段
//   - delta           | LLM 流式输出 token
//   - sources         | 全部结果（含引用 ID）
//   - done            | 任务完成
//   - error           | 错误

type SearchResult struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
	Source  string `json:"source"` // duckduckgo / wikipedia / ...
	Content string `json:"content,omitempty"`
}

// DeepSearch 处理深度搜索请求
//
// POST /api/search/deep
// body: { "query": "...", "max_sources": 5 }
//
// 响应 SSE，事件格式 `event: <name>\ndata: <json>\n\n`
func DeepSearch(c *gin.Context) {
	var body struct {
		Query      string `json:"query" binding:"required"`
		MaxSources int    `json:"max_sources"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 query 字段"})
		return
	}
	if body.MaxSources <= 0 || body.MaxSources > 10 {
		body.MaxSources = 5
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Header("Connection", "keep-alive")
	c.Writer.Flush()

	send := func(event string, data interface{}) {
		buf, _ := json.Marshal(data)
		c.Writer.Write([]byte("event: " + event + "\ndata: "))
		c.Writer.Write(buf)
		c.Writer.Write([]byte("\n\n"))
		c.Writer.Flush()
	}

	// 1. 多源并行搜索
	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		results []SearchResult
		nextID  = 1
	)

	send("source_start", gin.H{"source": "duckduckgo", "query": body.Query})
	send("source_start", gin.H{"source": "wikipedia", "query": body.Query})

	wg.Add(2)
	go func() {
		defer wg.Done()
		r := searchDuckDuckGo(body.Query, body.MaxSources)
		mu.Lock()
		for i := range r {
			r[i].ID = nextID
			nextID++
		}
		results = append(results, r...)
		mu.Unlock()
		send("source_done", gin.H{"source": "duckduckgo", "count": len(r)})
	}()
	go func() {
		defer wg.Done()
		r := searchWikipedia(body.Query, 2)
		mu.Lock()
		for i := range r {
			r[i].ID = nextID
			nextID++
		}
		results = append(results, r...)
		mu.Unlock()
		send("source_done", gin.H{"source": "wikipedia", "count": len(r)})
	}()
	wg.Wait()

	if len(results) == 0 {
		send("error", gin.H{"message": "未找到任何相关搜索结果"})
		send("done", gin.H{})
		return
	}

	// 截断到 max_sources
	if len(results) > body.MaxSources {
		results = results[:body.MaxSources]
	}

	// 2. 并行抓取网页正文（前 N 个）
	wg = sync.WaitGroup{}
	for i := range results {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			send("fetch_start", gin.H{"id": results[i].ID, "url": results[i].URL, "title": results[i].Title})
			content := fetchPageContent(results[i].URL)
			mu.Lock()
			results[i].Content = content
			mu.Unlock()
			send("fetch_done", gin.H{"id": results[i].ID, "chars": len(content)})
		}()
	}
	wg.Wait()

	// 3. 推送全部来源
	send("sources", results)

	// 4. LLM 综合推理
	send("synthesizing", gin.H{})

	prompt := buildSynthesisPrompt(body.Query, results)
	reply, _, err := RunClaudeSyncCtx(c.Request.Context(), prompt, 0)
	if err != nil {
		send("error", gin.H{"message": "综合推理失败: " + err.Error()})
		send("done", gin.H{})
		return
	}

	// 4.1 简单地拆分成片段推送，模拟流式（RunClaudeSync 是同步的）
	chunks := chunkByChars(reply, 32)
	for _, ck := range chunks {
		send("delta", gin.H{"text": ck})
		time.Sleep(15 * time.Millisecond)
	}

	send("done", gin.H{"sources_count": len(results)})
}

// ─── 搜索源 ─────────────────────────────────────────────────────

// searchDuckDuckGo 通过 DuckDuckGo HTML 接口抓取搜索结果
// 无需 API key,但请保持低请求频率
func searchDuckDuckGo(query string, max int) []SearchResult {
	rawURL := "https://html.duckduckgo.com/html/?q=" + url.QueryEscape(query)
	html := httpGetWithUA(rawURL)
	if html == "" {
		return nil
	}

	re := regexp.MustCompile(`<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)</a>`)
	results := []SearchResult{}
	for _, m := range re.FindAllStringSubmatch(html, -1) {
		if len(m) < 4 {
			continue
		}
		realURL := extractDuckDuckGoTarget(m[1])
		if realURL == "" {
			continue
		}
		results = append(results, SearchResult{
			Title:   stripHTML(m[2]),
			URL:     realURL,
			Snippet: stripHTML(m[3]),
			Source:  "duckduckgo",
		})
		if len(results) >= max {
			break
		}
	}
	return results
}

// extractDuckDuckGoTarget 解析 DuckDuckGo 的中转 URL
// DDG 的链接格式：/l/?kh=-1&uddg=<encoded-real-url>
func extractDuckDuckGoTarget(s string) string {
	if strings.HasPrefix(s, "http") {
		return s
	}
	if strings.HasPrefix(s, "//") {
		s = "https:" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return ""
	}
	if real := u.Query().Get("uddg"); real != "" {
		decoded, err := url.QueryUnescape(real)
		if err == nil {
			return decoded
		}
		return real
	}
	return s
}

// searchWikipedia 调用 Wikipedia OpenSearch API
// 没有 key 限制
func searchWikipedia(query string, max int) []SearchResult {
	apiURL := fmt.Sprintf("https://zh.wikipedia.org/w/api.php?action=opensearch&search=%s&limit=%d&format=json", url.QueryEscape(query), max)
	body := httpGetWithUA(apiURL)
	if body == "" {
		return nil
	}
	var arr []json.RawMessage
	if err := json.Unmarshal([]byte(body), &arr); err != nil || len(arr) < 4 {
		return nil
	}
	var titles []string
	var descs []string
	var urls []string
	_ = json.Unmarshal(arr[1], &titles)
	_ = json.Unmarshal(arr[2], &descs)
	_ = json.Unmarshal(arr[3], &urls)

	n := len(titles)
	if len(descs) < n {
		n = len(descs)
	}
	if len(urls) < n {
		n = len(urls)
	}

	results := make([]SearchResult, 0, n)
	for i := 0; i < n; i++ {
		results = append(results, SearchResult{
			Title:   titles[i],
			URL:     urls[i],
			Snippet: descs[i],
			Source:  "wikipedia",
		})
	}
	return results
}

// fetchPageContent 抓取网页 + readability 提取正文
// 限制 8000 字符防止 LLM context 爆掉
func fetchPageContent(rawURL string) string {
	html := httpGetWithUA(rawURL)
	if html == "" {
		return ""
	}
	parsedURL, _ := url.Parse(rawURL)
	article, err := readability.FromReader(strings.NewReader(html), parsedURL)
	if err != nil {
		return ""
	}
	content := strings.TrimSpace(article.TextContent)
	if content == "" {
		content = strings.TrimSpace(article.Content)
	}
	if len(content) > 8000 {
		content = content[:8000] + "..."
	}
	return content
}

// httpGetWithUA 带 UA 的 GET 请求
func httpGetWithUA(rawURL string) string {
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return ""
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		return ""
	}
	return string(body)
}

// stripHTML 移除简单 HTML 标签
var htmlTagRe = regexp.MustCompile(`<[^>]+>`)
var htmlEntityRe = regexp.MustCompile(`&[a-z]+;`)

func stripHTML(s string) string {
	s = htmlTagRe.ReplaceAllString(s, "")
	s = htmlEntityRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// chunkByChars 把字符串按字符数切片
func chunkByChars(s string, n int) []string {
	runes := []rune(s)
	chunks := []string{}
	for i := 0; i < len(runes); i += n {
		end := i + n
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[i:end]))
	}
	return chunks
}

// buildSynthesisPrompt 构建综合推理 prompt
func buildSynthesisPrompt(query string, results []SearchResult) string {
	var sb strings.Builder
	sb.WriteString("你是一个严谨的研究助手。请根据下面提供的多个搜索来源,综合回答用户的问题。\n\n")
	sb.WriteString("【用户问题】\n")
	sb.WriteString(query)
	sb.WriteString("\n\n")
	sb.WriteString("【参考资料】\n")
	for _, r := range results {
		sb.WriteString(fmt.Sprintf("\n来源 [%d] %s (%s)\n", r.ID, r.Title, r.URL))
		if r.Content != "" {
			content := r.Content
			if len(content) > 3000 {
				content = content[:3000] + "..."
			}
			sb.WriteString(content)
		} else if r.Snippet != "" {
			sb.WriteString(r.Snippet)
		}
		sb.WriteString("\n")
	}
	sb.WriteString("\n【要求】\n")
	sb.WriteString("1. 综合多个来源,如果不同来源有冲突,请明确指出并分析\n")
	sb.WriteString("2. 在每个事实陈述后用 [数字] 标注来源 ID,例如 \"DuckDuckGo 由 Gabriel Weinberg 创立 [1]\"\n")
	sb.WriteString("3. 使用 Markdown 格式,条理清晰,可使用列表/标题/表格\n")
	sb.WriteString("4. 如果资料不足以回答,请明确说明,不要编造\n")
	sb.WriteString("5. 不要重复列出来源链接,系统会自动显示")
	return sb.String()
}
