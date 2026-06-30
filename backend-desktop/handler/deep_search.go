package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
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

	send("source_start", gin.H{"source": "bing", "query": body.Query})
	send("source_start", gin.H{"source": "wikipedia", "query": body.Query})

	wg.Add(2)
	go func() {
		defer wg.Done()
		r := searchBing(body.Query, body.MaxSources)
		mu.Lock()
		for i := range r {
			r[i].ID = nextID
			nextID++
		}
		results = append(results, r...)
		mu.Unlock()
		send("source_done", gin.H{"source": "bing", "count": len(r)})
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

	// 4. LLM 综合推理（直接调用已配置的 API Profile，不经过 Claude CLI）
	send("synthesizing", gin.H{})

	prompt := buildSynthesisPrompt(body.Query, results)
	reply, err := quickLLMChat(c.Request.Context(), prompt)
	if err != nil {
		slog.Warn("[deep_search] LLM synthesis failed, trying fallback", "err", err)
		// 回退：尝试 RunClaudeSyncCtx
		reply2, _, err2 := RunClaudeSyncCtx(c.Request.Context(), prompt, 0, nil)
		if err2 != nil {
			send("error", gin.H{"message": "综合推理失败: " + err.Error()})
			send("done", gin.H{})
			return
		}
		reply = reply2
	}

	chunks := chunkByChars(reply, 32)
	for _, ck := range chunks {
		send("delta", gin.H{"text": ck})
		time.Sleep(15 * time.Millisecond)
	}

	send("done", gin.H{"sources_count": len(results)})
}

// ─── 搜索源 ─────────────────────────────────────────────────────

// searchBing 通过 Bing CN 网页抓取搜索结果
// 无需 API key，解析 <li class="b_algo"> 中的链接和摘要
func searchBing(query string, max int) []SearchResult {
	rawURL := "https://cn.bing.com/search?q=" + url.QueryEscape(query) + "&count=" + fmt.Sprintf("%d", max+5)
	html := httpGetWithUA(rawURL)
	if html == "" {
		return nil
	}

	// 匹配每个搜索结果块 <li class="b_algo">...</li>
	blockRe := regexp.MustCompile(`(?s)<li class="b_algo"[^>]*>(.*?)</li>`)
	linkRe := regexp.MustCompile(`<a[^>]+href="(https?://[^"]+)"[^>]*>`)
	// 匹配摘要文本（通常在 <p> 标签或 b_lineclamp 类中）
	snippetRe := regexp.MustCompile(`(?s)<p[^>]*>(.*?)</p>`)
	titleRe := regexp.MustCompile(`(?s)<a[^>]+href="https?://[^"]+?"[^>]*>(.*?)</a>`)

	var results []SearchResult
	for _, block := range blockRe.FindAllStringSubmatch(html, -1) {
		if len(block) < 2 {
			continue
		}
		content := block[1]

		linkMatch := linkRe.FindStringSubmatch(content)
		if linkMatch == nil || len(linkMatch) < 2 {
			continue
		}
		resultURL := linkMatch[1]
		// 跳过 Bing 内部链接
		if strings.Contains(resultURL, "bing.com") || strings.Contains(resultURL, "microsoft.com/bing") {
			continue
		}

		title := ""
		if m := titleRe.FindStringSubmatch(content); len(m) >= 2 {
			title = stripHTML(m[1])
		}
		if title == "" {
			title = resultURL
		}

		snippet := ""
		if m := snippetRe.FindStringSubmatch(content); len(m) >= 2 {
			snippet = stripHTML(m[1])
		}

		results = append(results, SearchResult{
			Title:   title,
			URL:     resultURL,
			Snippet: snippet,
			Source:  "bing",
		})
		if len(results) >= max {
			break
		}
	}
	return results
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

// quickLLMChat 直接调用已配置的 API Profile 进行简单对话
// 不创建会话、不持久化消息，适合深度搜索综合推理等轻量场景
func quickLLMChat(ctx context.Context, userMessage string) (string, error) {
	_, _, model, baseURL, token, protocol, _, _, _ := activeProfileSnapshot()
	if model == "" || baseURL == "" || token == "" {
		return "", fmt.Errorf("未配置或未激活模型接入点")
	}

	base := strings.TrimSuffix(baseURL, "/")

	if protocol == "anthropic" {
		base = strings.TrimSuffix(base, "/v1/messages")
		base = strings.TrimSuffix(base, "/messages")
		base = strings.TrimSuffix(base, "/v1")
		base += "/v1"

		reqBody, _ := json.Marshal(map[string]interface{}{
			"model":      model,
			"max_tokens": 4096,
			"messages": []map[string]interface{}{
				{"role": "user", "content": userMessage},
			},
		})
		httpReq, err := http.NewRequestWithContext(ctx, "POST", base+"/messages", bytes.NewReader(reqBody))
		if err != nil {
			return "", err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("x-api-key", token)
		httpReq.Header.Set("anthropic-version", "2023-06-01")

		client := &http.Client{Timeout: 120 * time.Second}
		resp, err := client.Do(httpReq)
		if err != nil {
			return "", fmt.Errorf("Anthropic API 请求失败: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return "", fmt.Errorf("Anthropic API 返回 %d: %s", resp.StatusCode, string(body))
		}
		var result struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", err
		}
		for _, c := range result.Content {
			if c.Type == "text" {
				return c.Text, nil
			}
		}
		return "", fmt.Errorf("Anthropic API 无文本回复")
	}

	// OpenAI 兼容格式
	base = strings.TrimSuffix(base, "/v1/chat/completions")
	base = strings.TrimSuffix(base, "/chat/completions")
	base = strings.TrimSuffix(base, "/v1/completions")
	base = strings.TrimSuffix(base, "/completions")
	base = strings.TrimSuffix(base, "/v1")
	endpoint := base + "/v1/chat/completions"

	reqBody, _ := json.Marshal(map[string]interface{}{
		"model": model,
		"messages": []map[string]interface{}{
			{"role": "user", "content": userMessage},
		},
		"max_tokens":  4096,
		"temperature": 0.3,
	})

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("LLM API 请求失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("LLM API 返回 %d: %s", resp.StatusCode, string(body))
	}
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("LLM API 无回复")
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
