package handler

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"lingxi-agent/config"
	"lingxi-agent/db"
	"lingxi-agent/usage"

	"github.com/gin-gonic/gin"
)

// ─── Coding Chat 独立接口 ──────────────────────────────────────────

// CodingChat 是 Coding View 的独立聊天入口
// POST /api/coding/chat
func CodingChat(c *gin.Context) {
	var body struct {
		Message    string         `json:"message"`
		SessionID  string         `json:"sessionId"`
		WorkingDir string         `json:"workingDir"`
		Thinking   *bool          `json:"thinking"`
		Images     []imagePayload `json:"images"`
		Files      []struct {
			Name    string `json:"name"`
			Ext     string `json:"ext"`
			Content string `json:"content"`
		} `json:"files"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.SessionID == "" {
		c.Status(http.StatusBadRequest)
		return
	}
	if body.Message == "" && len(body.Images) == 0 && len(body.Files) == 0 {
		c.Status(http.StatusBadRequest)
		return
	}

	if len(body.Files) > 0 {
		var fileParts strings.Builder
		for _, f := range body.Files {
			fileParts.WriteString(fmt.Sprintf("\n\n--- 附件: %s ---\n```%s\n%s\n```", f.Name, f.Ext, f.Content))
		}
		body.Message = body.Message + fileParts.String()
	}

	sessionID, err := strconv.ParseInt(body.SessionID, 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var exists int
	if err := db.DB.QueryRow(`SELECT COUNT(1) FROM sessions WHERE id=?`, sessionID).Scan(&exists); err != nil || exists == 0 {
		c.Status(http.StatusNotFound)
		return
	}

	displayMsg := body.Message
	if len(body.Images) > 0 && displayMsg == "" {
		displayMsg = "[图片]"
	}

	imagePaths, imageURLs, perr := saveImagesPermanent(sessionID, body.Images)
	if perr != nil {
		slog.Warn("saveImagesPermanent error", "err", perr)
	}
	var userContent string
	if len(imageURLs) > 0 {
		j, _ := json.Marshal(map[string]any{
			"text":   body.Message,
			"images": imageURLs,
		})
		userContent = string(j)
	} else {
		userContent = displayMsg
	}
	appendMessage(sessionID, "user", userContent)

	runes := []rune(displayMsg)
	if len(runes) > 20 {
		updateSessionTitle(sessionID, string(runes[:20])+"…")
	} else {
		updateSessionTitle(sessionID, string(runes))
	}

	thinkingEnabled := true
	if body.Thinking != nil {
		thinkingEnabled = *body.Thinking
	}
	c.JSON(http.StatusAccepted, gin.H{"status": "accepted", "sessionId": sessionID})
	go runCodingClaude(sessionID, body.Message, imagePaths, body.WorkingDir, thinkingEnabled)
}

// CodingChatAnswerBatch 接收 AskQuestion 批量答案
// POST /api/coding/chat/answer-batch
func CodingChatAnswerBatch(c *gin.Context) {
	var body struct {
		SessionID  string            `json:"sessionId"`
		Answers    map[string]string `json:"answers"`
		WorkingDir string            `json:"workingDir"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.SessionID == "" {
		c.Status(http.StatusBadRequest)
		return
	}
	sessionID, err := strconv.ParseInt(body.SessionID, 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	// 将批量答案格式化为结构化消息
	var sb strings.Builder
	sb.WriteString("[批量回答]\n")
	for qID, answer := range body.Answers {
		sb.WriteString(fmt.Sprintf("- %s: %s\n", qID, answer))
	}
	message := sb.String()

	appendMessage(sessionID, "user", message)
	c.JSON(http.StatusAccepted, gin.H{"status": "accepted", "sessionId": sessionID})
	go runCodingClaude(sessionID, message, nil, body.WorkingDir, true)
}

// ─── Coding Claude 独立执行 ─────────────────────────────────────────

func runCodingClaude(sessionID int64, message string, imagePaths []string, workingDir string, thinkingEnabled bool) {
	hub := globalHub
	cfg := config.Get()

	// 终止同一会话中可能还在运行的旧进程
	if prev, ok := activeChats.Load(sessionID); ok {
		if oldCmd, _ := prev.(*exec.Cmd); oldCmd != nil && oldCmd.Process != nil {
			slog.Info("killing previous claude process for coding session", "session", sessionID, "pid", oldCmd.Process.Pid)
			oldCmd.Process.Kill()
			time.Sleep(200 * time.Millisecond)
		}
		activeChats.Delete(sessionID)
	}

	claudeSessionID := getClaudeSessionID(sessionID)

	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--verbose",
		"--include-partial-messages",
		"--dangerously-skip-permissions",
	}

	// Coding 专属 system prompt（根据当前 provider 决定是否启用 Task 子代理）
	prompt := buildCodingSystemPrompt()

	// 应用智能体角色设定（如果会话绑定了自定义 agent）
	agentID := db.GetSessionAgentID(sessionID)
	if agentID > 0 {
		if a, err := db.GetAgent(agentID); err == nil && !a.Builtin && strings.TrimSpace(a.SystemPrompt) != "" {
			prompt = applyAgentPersona(prompt, a.Name, a.SystemPrompt)
		}
	}

	// 注入工作目录上下文
	if workingDir != "" {
		prompt += fmt.Sprintf("\n\n# 【当前工作目录】\n\n你当前正在操作的项目目录是：`%s`\n所有文件操作、终端命令、代码搜索都应该在这个目录下进行。不要去其他目录寻找文件。\n如果用户提到相对路径，请基于此目录解析。", workingDir)
	}

	if claudeSessionID != "" {
		args = append(args, "--resume", claudeSessionID)
		args = append(args, "--system-prompt", prompt)
	} else {
		args = append(args, "--system-prompt", prompt)
	}

	claudeBin := cfg.Claude.Bin
	cmd := exec.Command(claudeBin, args...)
	cmd.Stdin = strings.NewReader(buildStdinMessage(message, imagePaths))
	cmd.Env = buildClaudeEnv(cfg)

	if workingDir != "" {
		workingDir = expandHome(workingDir)
		if info, err := os.Stat(workingDir); err == nil && info.IsDir() {
			cmd.Dir = workingDir
			slog.Info("coding claude workingDir set", "dir", workingDir, "session", sessionID)
		}
	}
	if workingDir != "" {
		cmd.Env = append(cmd.Env, "CODING_WORKING_DIR="+workingDir)
	}
	if !thinkingEnabled {
		cmd.Env = append(cmd.Env, "DISABLE_THINKING=1")
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		slog.Warn("coding stdout pipe error", "err", err)
		hub.Send(sessionID, "text", jsonStr("启动失败: "+err.Error()))
		hub.Send(sessionID, "done", "[DONE]")
		return
	}
	stderrPipe, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		slog.Warn("coding cmd start error", "err", err)
		hub.Send(sessionID, "text", jsonStr("启动失败: "+err.Error()))
		hub.Send(sessionID, "done", "[DONE]")
		return
	}
	slog.Info("coding claude started", "pid", cmd.Process.Pid, "session", sessionID)

	activeChats.Store(sessionID, cmd)
	defer activeChats.Delete(sessionID)

	go func() {
		s := bufio.NewScanner(stderrPipe)
		for s.Scan() {
			slog.Info("[coding claude stderr]", "text", s.Text())
		}
	}()

	hub.Send(sessionID, "agent_state", `{"state":"THINKING"}`)

	startedAt := time.Now()
	var (
		blocks             []msgBlock
		newClaudeSessionID string
		aggUsage           claudeUsage
		aggCostUSD         float64
		modelUsed          string
		// Coding 专属：缓冲 ask_question 直到 message_stop
		pendingQuestions []json.RawMessage
		// Sub-agent 状态追踪
		subAgents []subAgentInfo
	)

	appendBlock := func(typ, name, chunk string) {
		if len(blocks) > 0 && typ != "tool" {
			last := &blocks[len(blocks)-1]
			if last.Type == typ {
				last.Text += chunk
				return
			}
		}
		blocks = append(blocks, msgBlock{Type: typ, Name: name, Text: chunk})
	}

	parseStateFromText := func(text string) string {
		var clean strings.Builder
		i := 0
		for i < len(text) {
			b := text[i]
			if b != '{' {
				clean.WriteByte(b)
				i++
				continue
			}
			depth, end := 0, -1
			for j := i; j < len(text); j++ {
				switch text[j] {
				case '{':
					depth++
				case '}':
					depth--
					if depth == 0 {
						end = j
					}
				}
				if end >= 0 {
					break
				}
			}
			if end < 0 {
				clean.WriteByte(b)
				i++
				continue
			}
			fragment := text[i : end+1]
			var obj map[string]interface{}
			if json.Unmarshal([]byte(fragment), &obj) != nil {
				clean.WriteByte(b)
				i++
				continue
			}
			state, isState := obj["state"].(string)
			if !isState || state == "" {
				clean.WriteString(fragment)
				i = end + 1
				continue
			}
			hub.Send(sessionID, "agent_state", fragment)
			i = end + 1
		}
		return clean.String()
	}

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

		switch ev.Type {
		case "system":
			if ev.Subtype == "init" && ev.Session != "" {
				newClaudeSessionID = ev.Session
			}

		case "result":
			if ev.CostUSD > 0 {
				aggCostUSD = ev.CostUSD
			}
			if ev.Usage != nil {
				aggUsage = *ev.Usage
			}

		case "stream_event":
			var inner innerEvent
			if err := json.Unmarshal(ev.Event, &inner); err != nil {
				continue
			}

			switch inner.Type {
			case "message_start":
				if len(inner.Message) > 0 {
					var m struct {
						Model string       `json:"model"`
						Usage *claudeUsage `json:"usage"`
					}
					if json.Unmarshal(inner.Message, &m) == nil {
						if m.Model != "" {
							modelUsed = m.Model
						}
						if m.Usage != nil {
							aggUsage.InputTokens += m.Usage.InputTokens
							aggUsage.CacheReadInputTokens += m.Usage.CacheReadInputTokens
							aggUsage.CacheCreationInputTokens += m.Usage.CacheCreationInputTokens
						}
					}
				}

			case "message_delta":
				if inner.Usage != nil {
					if inner.Usage.OutputTokens > aggUsage.OutputTokens {
						aggUsage.OutputTokens = inner.Usage.OutputTokens
					}
				}

		case "content_block_start":
			if inner.ContentBlock.Type == "tool_use" {
				toolName := inner.ContentBlock.Name
				slog.Info("coding tool_use detected", "tool", toolName, "blockID", inner.ContentBlock.ID, "session", sessionID)
				if !isAskUserTool(toolName) {
						payload, _ := json.Marshal(map[string]any{
							"id":    inner.ContentBlock.ID,
							"name":  toolName,
							"label": toolDisplayLabel(toolName),
						})
						hub.Send(sessionID, "tool_start", string(payload))
						if isReadTool(toolName) {
							hub.Send(sessionID, "agent_state", `{"state":"CHECKING"}`)
						} else {
							hub.Send(sessionID, "agent_state", `{"state":"EXECUTING"}`)
						}
					}
					// Sub-agent：Task 工具开始，立即推送 subagent_start（后续 content_block_stop 时补充描述）
					if toolName == "Task" || toolName == "task" {
						agentID := fmt.Sprintf("sa_%s", inner.ContentBlock.ID)
						info := subAgentInfo{
							ID:          agentID,
							Description: "Starting sub-agent...",
							Status:      "working",
						}
						subAgents = append(subAgents, info)
						p, _ := json.Marshal(info)
						hub.Send(sessionID, "subagent_start", string(p))
					}
					b := msgBlock{
						Type:  "tool",
						Name:  toolName,
						Label: toolDisplayLabel(toolName),
						Ms:    time.Now().UnixMilli(),
					}
					blocks = append(blocks, b)
				} else if inner.ContentBlock.Type == "thinking" {
					appendBlock("thinking", "", "")
				}

			case "content_block_delta":
				d := inner.Delta
				switch d.Type {
				case "thinking_delta":
					if d.Thinking != "" {
						safe := redactSensitive(d.Thinking)
						hub.Send(sessionID, "thinking", jsonStr(safe))
						appendBlock("thinking", "", safe)
					}
				case "text_delta":
					if d.Text != "" {
						safeText := redactSensitive(d.Text)
						cleanText := parseStateFromText(safeText)
						if cleanText != "" {
							hub.Send(sessionID, "text", jsonStr(cleanText))
							appendBlock("text", "", cleanText)
						}
					}
				case "input_json_delta":
					if d.PartialJSON != "" && len(blocks) > 0 {
						last := &blocks[len(blocks)-1]
						if last.Type == "tool" {
							last.Input += d.PartialJSON
						}
					}
				default:
					if d.ReasoningContent != "" || d.Reasoning != "" {
						r := d.ReasoningContent
						if r == "" {
							r = d.Reasoning
						}
						safe := redactSensitive(r)
						hub.Send(sessionID, "thinking", jsonStr(safe))
						appendBlock("thinking", "", safe)
					}
				}

			case "content_block_stop":
				if len(blocks) > 0 {
					last := &blocks[len(blocks)-1]
					if last.Type == "text" && last.Text != "" {
						emitTaskPlanFromText(hub, sessionID, last.Text)
						// Coding 专属：检测 questions_batch 并缓冲
						if qs := extractQuestionsBatch(last.Text); len(qs) > 0 {
							pendingQuestions = append(pendingQuestions, qs...)
						} else {
							// 也检测单个 ask_question（兜底兼容）
							emitCodingInteractiveFromText(hub, sessionID, last.Text, &pendingQuestions)
						}
						// 文本模式兜底：检测 sub-agent 相关信息
						detectSubAgentEvents(hub, sessionID, last.Text, &subAgents)
					}
					if last.Type == "tool" {
						if isAskUserTool(last.Name) {
							interactiveText := convertAskToolToInteractiveBlock(last.Input)
							if interactiveText != "" {
								last.Type = "text"
								last.Text = interactiveText
								last.Name = ""
								last.Label = ""
								last.Input = ""
								last.Done = false
								last.Ms = 0
								endPayload, _ := json.Marshal(map[string]any{
									"done": true, "name": "AskUserQuestion", "label": "提问",
									"input": "", "ms": 0, "status": "ok", "hidden": true,
								})
								hub.Send(sessionID, "tool_end", string(endPayload))
								// 缓冲到 pendingQuestions 而非立即推送
								if qs := extractQuestionsBatch(interactiveText); len(qs) > 0 {
									pendingQuestions = append(pendingQuestions, qs...)
								} else {
									hub.Send(sessionID, "text", jsonStr(interactiveText))
								}
								hub.Send(sessionID, "agent_state", `{"state":"WAITING_FOR_USER"}`)
							} else {
								blocks = blocks[:len(blocks)-1]
								endPayload, _ := json.Marshal(map[string]any{
									"done": true, "name": last.Name, "label": last.Label,
									"input": "", "ms": 0, "status": "ok", "hidden": true,
								})
								hub.Send(sessionID, "tool_end", string(endPayload))
							}
						} else {
							last.Done = true
							startedMs := last.Ms
							elapsed := time.Now().UnixMilli() - startedMs
							if elapsed < 0 {
								elapsed = 0
							}
						fullInput := last.Input
						summary := safeSummarizeToolInput(last.Name, fullInput)

						if last.Name == "TodoWrite" {
							emitTaskUpdate(hub, sessionID, fullInput)
						}
						if isFileModifyTool(last.Name) {
							emitFileDiff(hub, sessionID, last.Name, fullInput, workingDir)
						}

						// Sub-agent：Task 工具完成，更新描述并标记 done
						if last.Name == "Task" || last.Name == "task" {
							updateSubAgentDescription(hub, sessionID, fullInput, &subAgents)
						}

						last.Input = summary
						last.Ms = elapsed
						last.Status = "ok"
						endPayload, _ := json.Marshal(map[string]any{
							"done":      true,
							"name":      last.Name,
							"label":     last.Label,
							"input":     summary,
							"fullInput": fullInput,
								"ms":     elapsed,
								"status": "ok",
							})
							hub.Send(sessionID, "tool_end", string(endPayload))
							hub.Send(sessionID, "agent_state", `{"state":"THINKING"}`)
						}
					}
				}

			case "message_stop":
				// Coding 专属：在 message 结束时，将缓冲的所有问题一次性推送
				if len(pendingQuestions) > 0 {
					batchPayload, _ := json.Marshal(map[string]any{
						"questions": pendingQuestions,
					})
					hub.Send(sessionID, "ask_questions_batch", string(batchPayload))
					hub.Send(sessionID, "agent_state", `{"state":"WAITING_FOR_BATCH_ANSWER"}`)
					pendingQuestions = nil
				}
			}
		}
	}

	exitErr := cmd.Wait()

	if exitErr != nil && len(blocks) == 0 {
		errMsg := "AI 引擎执行异常，请检查模型接入点配置是否正确。"
		slog.Warn("coding claude exited with error and no output", "err", exitErr, "session", sessionID)
		hub.Send(sessionID, "text", jsonStr(errMsg))
		blocks = append(blocks, msgBlock{Type: "text", Text: errMsg})
	}

	// 如果还有缓冲的 questions 没推送（比如 CLI 异常退出前），兜底推送
	if len(pendingQuestions) > 0 {
		batchPayload, _ := json.Marshal(map[string]any{
			"questions": pendingQuestions,
		})
		hub.Send(sessionID, "ask_questions_batch", string(batchPayload))
		hub.Send(sessionID, "agent_state", `{"state":"WAITING_FOR_BATCH_ANSWER"}`)
	}

	if newClaudeSessionID != "" {
		saveClaudeSessionID(sessionID, newClaudeSessionID)
	}

	durationMs := time.Since(startedAt).Milliseconds()
	profileID, runtimeModel, _, _ := activeRuntimeSnapshot()
	if modelUsed == "" {
		modelUsed = runtimeModel
	}

	costEstimated := false
	if aggCostUSD == 0 && (aggUsage.InputTokens+aggUsage.OutputTokens) > 0 {
		aggCostUSD = usage.EstimateCost(modelUsed, aggUsage.InputTokens, aggUsage.OutputTokens)
		if aggCostUSD > 0 {
			costEstimated = true
		}
	}

	usagePayload := buildUsagePayload(modelUsed, profileID, durationMs, aggCostUSD, aggUsage)
	if costEstimated {
		usagePayload["estimated"] = true
	}

	var savedMsgID int64
	if len(blocks) > 0 {
		var saveBlocks []msgBlock
		for i := range blocks {
			if blocks[i].Type == "tool" {
				blocks[i].Done = true
				blocks[i].Text = ""
			} else {
				blocks[i].Text = redactSensitive(blocks[i].Text)
			}
			saveBlocks = append(saveBlocks, blocks[i])
		}
		if len(saveBlocks) > 0 {
			if bj, err := json.Marshal(saveBlocks); err == nil {
				usageJSON, _ := json.Marshal(usagePayload)
				savedMsgID = appendMessageWithUsage(sessionID, "assistant", string(bj), string(usageJSON))
			}
		}
	}

	if aggUsage.InputTokens+aggUsage.OutputTokens > 0 || aggCostUSD > 0 {
		_, _ = db.InsertUsageRecord(&db.UsageRecord{
			SessionID:        sessionID,
			MessageID:        savedMsgID,
			ProfileID:        profileID,
			Model:            modelUsed,
			InputTokens:      aggUsage.InputTokens,
			OutputTokens:     aggUsage.OutputTokens,
			CacheReadTokens:  aggUsage.CacheReadInputTokens,
			CacheWriteTokens: aggUsage.CacheCreationInputTokens,
			CostUSD:          aggCostUSD,
			Estimated:        costEstimated,
			DurationMs:       durationMs,
		})
		evt, _ := json.Marshal(map[string]interface{}{
			"messageId": savedMsgID,
			"sessionId": sessionID,
			"usage":     usagePayload,
		})
		hub.Send(sessionID, "message_usage", string(evt))
	}

	// 如果本轮有文件修改操作，自动创建 Checkpoint
	if savedMsgID > 0 && hasFileModifyInBlocks(blocks) {
		go createAutoCheckpoint(sessionID, savedMsgID, workingDir, hub)
	}

	tryPostChatEvolution(agentID, sessionID, blocks)
	hub.Send(sessionID, "done", "[DONE]")
}

func hasFileModifyInBlocks(blocks []msgBlock) bool {
	for _, b := range blocks {
		if b.Type == "tool" && isFileModifyTool(b.Name) {
			return true
		}
	}
	return false
}

func createAutoCheckpoint(sessionID, messageID int64, workingDir string, hub *Hub) {
	// 从 blocks 中提取被修改的文件路径（简化：只记录 workingDir 下最近 git 变更）
	var files []db.FileSnapshot
	if workingDir != "" {
		// 尝试读取 git 跟踪的变更文件
		changedPaths := getGitChangedFiles(workingDir)
		for _, p := range changedPaths {
			content, err := os.ReadFile(p)
			if err != nil {
				continue
			}
			files = append(files, db.FileSnapshot{Path: p, Content: string(content)})
			if len(files) >= 50 {
				break
			}
		}
	}

	cpID, err := db.CreateCheckpoint(sessionID, messageID, files, nil)
	if err != nil {
		slog.Warn("auto checkpoint creation failed", "err", err, "session", sessionID)
		return
	}

	cpPayload, _ := json.Marshal(map[string]any{
		"id":             cpID,
		"session_id":     sessionID,
		"message_id":     messageID,
		"created_at":     time.Now().UTC().Format(time.RFC3339),
		"files_count":    len(files),
		"messages_count": 0,
	})
	hub.Send(sessionID, "checkpoint_created", string(cpPayload))
}

func getGitChangedFiles(dir string) []string {
	cmd := exec.Command("git", "diff", "--name-only", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	var result []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		full := filepath.Join(dir, line)
		if info, err := os.Stat(full); err == nil && !info.IsDir() {
			result = append(result, full)
		}
	}
	return result
}

// ─── Coding 专属辅助函数 ────────────────────────────────────────────

// subAgentInfo 追踪 sub-agent 的生命周期
type subAgentInfo struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Status      string `json:"status"` // working / done / error
}

// extractQuestionsBatch 从文本中提取 questions_batch JSON 块
func extractQuestionsBatch(text string) []json.RawMessage {
	type questionsBatch struct {
		Type      string            `json:"type"`
		Questions []json.RawMessage `json:"questions"`
	}

	tryParse := func(raw string) []json.RawMessage {
		var batch questionsBatch
		if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &batch); err != nil {
			return nil
		}
		if batch.Type != "questions_batch" || len(batch.Questions) == 0 {
			return nil
		}
		return batch.Questions
	}

	// 先匹配 ```json ... ``` 包裹
	re := regexp.MustCompile("(?s)```json\\s*\n(.*?)\n```")
	matches := re.FindAllStringSubmatch(text, -1)
	for _, m := range matches {
		if len(m) >= 2 {
			if qs := tryParse(m[1]); qs != nil {
				return qs
			}
		}
	}

	// 兜底：扫描裸 JSON
	for i := 0; i < len(text); i++ {
		if text[i] != '{' {
			continue
		}
		depth := 0
		for j := i; j < len(text); j++ {
			if text[j] == '{' {
				depth++
			} else if text[j] == '}' {
				depth--
				if depth == 0 {
					candidate := text[i : j+1]
					if strings.Contains(candidate, `"questions_batch"`) {
						if qs := tryParse(candidate); qs != nil {
							return qs
						}
					}
					i = j
					break
				}
			}
		}
	}
	return nil
}

// emitCodingInteractiveFromText 检测单个 choice/input JSON（兜底兼容）
// 和 emitInteractiveFromText 类似，但将检测到的问题缓冲而非立即推送
func emitCodingInteractiveFromText(hub *Hub, sessionID int64, text string, pendingQuestions *[]json.RawMessage) {
	type genericJSON struct {
		Type string `json:"type"`
	}

	tryBuffer := func(raw string) bool {
		var g genericJSON
		if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &g); err != nil {
			return false
		}
		if g.Type != "choice" && g.Type != "input" {
			return false
		}
		*pendingQuestions = append(*pendingQuestions, json.RawMessage(strings.TrimSpace(raw)))
		return true
	}

	// 先匹配 ```json ... ```
	re := regexp.MustCompile("(?s)```json\\s*\n(.*?)\n```")
	matches := re.FindAllStringSubmatch(text, -1)
	for _, m := range matches {
		if len(m) >= 2 {
			tryBuffer(m[1])
		}
	}

	// 裸 JSON 扫描
	for i := 0; i < len(text); i++ {
		if text[i] != '{' {
			continue
		}
		depth := 0
		for j := i; j < len(text); j++ {
			if text[j] == '{' {
				depth++
			} else if text[j] == '}' {
				depth--
				if depth == 0 {
					candidate := text[i : j+1]
					tryBuffer(candidate)
					i = j
					break
				}
			}
		}
	}
}

// updateSubAgentDescription 从 Task 工具的 input JSON 中提取描述，更新最近的 working 子代理并标记为 done
func updateSubAgentDescription(hub *Hub, sessionID int64, rawInput string, agents *[]subAgentInfo) {
	type taskInput struct {
		Description string `json:"description"`
		Prompt      string `json:"prompt"`
	}
	var ti taskInput
	if err := json.Unmarshal([]byte(rawInput), &ti); err == nil {
		desc := ti.Description
		if desc == "" {
			desc = ti.Prompt
			if len(desc) > 100 {
				desc = desc[:100] + "..."
			}
		}
		if desc != "" {
			for i := len(*agents) - 1; i >= 0; i-- {
				if (*agents)[i].Status == "working" {
					(*agents)[i].Description = desc
					break
				}
			}
		}
	}

	// 标记最近一个 working 子代理为 done
	for i := len(*agents) - 1; i >= 0; i-- {
		if (*agents)[i].Status == "working" {
			(*agents)[i].Status = "done"
			payload, _ := json.Marshal((*agents)[i])
			hub.Send(sessionID, "subagent_done", string(payload))
			return
		}
	}
}

// detectSubAgentEvents 检测 Claude Code 输出中的 sub-agent 创建/完成信号（文本模式兜底）
func detectSubAgentEvents(hub *Hub, sessionID int64, text string, agents *[]subAgentInfo) {
	// 检测 "Task tool" 或 sub-agent 创建模式
	// Claude Code 使用 Task tool 创建子代理时，输出特定格式
	taskRe := regexp.MustCompile(`(?i)(?:creating|launching|starting)\s+(?:sub-?agent|task)\s*(?::|：)\s*(.+?)(?:\n|$)`)
	if matches := taskRe.FindStringSubmatch(text); len(matches) >= 2 {
		agentID := fmt.Sprintf("sa_%d", time.Now().UnixMilli())
		info := subAgentInfo{
			ID:          agentID,
			Description: strings.TrimSpace(matches[1]),
			Status:      "working",
		}
		*agents = append(*agents, info)
		payload, _ := json.Marshal(info)
		hub.Send(sessionID, "subagent_start", string(payload))
	}

	// 检测 sub-agent 完成
	doneRe := regexp.MustCompile(`(?i)(?:sub-?agent|task)\s+(?:completed|finished|done)`)
	if doneRe.MatchString(text) && len(*agents) > 0 {
		last := &(*agents)[len(*agents)-1]
		if last.Status == "working" {
			last.Status = "done"
			payload, _ := json.Marshal(last)
			hub.Send(sessionID, "subagent_done", string(payload))
		}
	}
}
