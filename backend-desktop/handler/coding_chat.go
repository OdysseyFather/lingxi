package handler

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"lingxi-agent/config"
	"lingxi-agent/db"
	"lingxi-agent/router"
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

// CodingChatPermissionResponse 接收前端的权限响应
// POST /api/coding/chat/permission-response
func CodingChatPermissionResponse(c *gin.Context) {
	var body struct {
		SessionID    string                 `json:"sessionId"`
		PermissionID string                 `json:"permissionId"`
		Behavior     string                 `json:"behavior"` // "allow" | "deny"
		UpdatedInput map[string]interface{} `json:"updatedInput,omitempty"`
		Message      string                 `json:"message,omitempty"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.SessionID == "" || body.PermissionID == "" {
		c.Status(http.StatusBadRequest)
		return
	}

	sessionID, err := strconv.ParseInt(body.SessionID, 10, 64)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	ch := getPermissionChan(sessionID, body.PermissionID)
	if ch == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no pending permission request"})
		return
	}

	resp := permissionResponse{
		Behavior:     body.Behavior,
		UpdatedInput: body.UpdatedInput,
		Message:      body.Message,
	}

	select {
	case ch <- resp:
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	default:
		c.JSON(http.StatusConflict, gin.H{"error": "already responded"})
	}
}

// ─── 权限请求/响应管理 ──────────────────────────────────────────

type permissionResponse struct {
	Behavior     string                 `json:"behavior"`
	UpdatedInput map[string]interface{} `json:"updatedInput,omitempty"`
	Message      string                 `json:"message,omitempty"`
}

// pendingPermissions 存储每个会话中等待用户响应的权限请求通道
// key: "sessionID:permissionID" → channel
var pendingPermissions sync.Map

func permKey(sessionID int64, permID string) string {
	return fmt.Sprintf("%d:%s", sessionID, permID)
}

func registerPermissionChan(sessionID int64, permID string) chan permissionResponse {
	ch := make(chan permissionResponse, 1)
	pendingPermissions.Store(permKey(sessionID, permID), ch)
	return ch
}

func getPermissionChan(sessionID int64, permID string) chan permissionResponse {
	v, ok := pendingPermissions.Load(permKey(sessionID, permID))
	if !ok {
		return nil
	}
	return v.(chan permissionResponse)
}

func removePermissionChan(sessionID int64, permID string) {
	pendingPermissions.Delete(permKey(sessionID, permID))
}

func clearSessionPermissions(sessionID int64) {
	pendingPermissions.Range(func(key, value any) bool {
		k := key.(string)
		prefix := fmt.Sprintf("%d:", sessionID)
		if strings.HasPrefix(k, prefix) {
			pendingPermissions.Delete(key)
		}
		return true
	})
}

// ─── SDK Runner 配置结构 ─────────────────────────────────────────

type sdkRunnerConfig struct {
	Prompt         string            `json:"prompt"`
	SessionID      string            `json:"sessionId,omitempty"`
	SystemPrompt   interface{}       `json:"systemPrompt,omitempty"` // string 或 {type,preset,append} 对象
	WorkingDir     string            `json:"workingDir,omitempty"`
	Thinking       bool              `json:"thinking"`
	ImagePaths     []string          `json:"imagePaths,omitempty"`
	Env            map[string]string `json:"env,omitempty"`
	PermissionMode string            `json:"permissionMode,omitempty"` // "bypass" | "interactive"
	Agents         []interface{}     `json:"agents,omitempty"`         // 自定义子代理模板 (SDK AgentDefinition)
	Plugins        []interface{}     `json:"plugins,omitempty"`        // SDK 插件 ({type:"local",path:"..."})
	HooksConfig    interface{}       `json:"hooksConfig,omitempty"`    // hooks 配置（blockedPaths 等）
}

// ─── SDK 事件结构 ────────────────────────────────────────────────

type sdkEvent struct {
	Type    string `json:"type"`
	Subtype string `json:"subtype,omitempty"`

	// system/init
	Session string `json:"session_id,omitempty"`

	// stream_event — 包含原始 Anthropic stream event，与 CLI 格式一致
	Event           json.RawMessage `json:"event,omitempty"`
	ParentToolUseID *string         `json:"parent_tool_use_id,omitempty"`

	// result
	CostUSD    float64      `json:"cost_usd,omitempty"`
	DurationMs int64        `json:"duration_ms,omitempty"`
	IsError    bool         `json:"is_error,omitempty"`
	Result     string       `json:"result,omitempty"`
	Usage      *claudeUsage `json:"usage,omitempty"`
	Model      string       `json:"model,omitempty"`
	NumTurns   int          `json:"num_turns,omitempty"`

	// usage_update（assistant 消息级）
	InputTokens              int64 `json:"input_tokens,omitempty"`
	OutputTokens             int64 `json:"output_tokens,omitempty"`
	CacheCreationInputTokens int64 `json:"cache_creation_input_tokens,omitempty"`
	CacheReadInputTokens     int64 `json:"cache_read_input_tokens,omitempty"`

	// task_event
	TaskID       string          `json:"task_id,omitempty"`
	ToolUseID    string          `json:"tool_use_id,omitempty"`
	Description  string          `json:"description,omitempty"`
	Status       string          `json:"status,omitempty"`
	Summary      string          `json:"summary,omitempty"`
	Patch        json.RawMessage `json:"patch,omitempty"`
	LastToolName string          `json:"last_tool_name,omitempty"`

	// sdk_error
	Error string `json:"error,omitempty"`

	// permission_request（SDK canUseTool 回调）
	ToolName  string          `json:"toolName,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	IsAskUser bool            `json:"isAskUser,omitempty"`
	ID        string          `json:"id,omitempty"`

	// checkpoint（SDK 文件检查点 UUID）
	CheckpointID string `json:"checkpoint_id,omitempty"`

	// model_usage（per-model 成本明细）
	ModelUsage json.RawMessage `json:"model_usage,omitempty"`
}

// ─── Coding Claude 独立执行（SDK 模式） ─────────────────────────────

func runCodingClaude(sessionID int64, message string, imagePaths []string, workingDir string, thinkingEnabled bool) {
	hub := globalHub
	cfg := config.Get()

	// 重置 TaskCreate 计数器，确保每次新对话从 1 开始
	taskCreateCounter.Store(0)
	// 清空 subagent 描述更新标记
	_subAgentDescUpdated.Range(func(k, v any) bool {
		_subAgentDescUpdated.Delete(k)
		return true
	})

	// 终止同一会话中可能还在运行的旧进程
	if prev, ok := activeChats.Load(sessionID); ok {
		if oldCmd, _ := prev.(*exec.Cmd); oldCmd != nil && oldCmd.Process != nil {
			slog.Info("killing previous sdk-runner for coding session", "session", sessionID, "pid", oldCmd.Process.Pid)
			oldCmd.Process.Kill()
			time.Sleep(200 * time.Millisecond)
		}
		activeChats.Delete(sessionID)
	}

	claudeSessionID := getClaudeSessionID(sessionID)

	// 构建 system prompt（claude_code 预设 + append 模式）
	appendPrompt := buildCodingSystemPrompt()
	agentID := db.GetSessionAgentID(sessionID)
	if agentID > 0 {
		if a, err := db.GetAgent(agentID); err == nil && !a.Builtin && strings.TrimSpace(a.SystemPrompt) != "" {
			appendPrompt += fmt.Sprintf("\n\n# Agent 人设\n\n你的名字是「%s」。\n%s", a.Name, a.SystemPrompt)
		}
	}
	if workingDir != "" {
		appendPrompt += fmt.Sprintf("\n\n# 【当前工作目录】\n\n你当前正在操作的项目目录是：`%s`\n所有文件操作、终端命令、代码搜索都应该在这个目录下进行。不要去其他目录寻找文件。\n如果用户提到相对路径，请基于此目录解析。", workingDir)
	}

	// 使用 claude_code 预设 + append 模式：
	// 继承 Claude Code 内置的工具指导、安全规则、编码规范，
	// 同时追加灵犀特有的行为准则和任务管理规则。
	systemPromptObj := map[string]interface{}{
		"type":   "preset",
		"preset": "claude_code",
		"append": appendPrompt,
	}

	// 技能通过 SDK 的 settingSources + skills: "all" 自动发现，无需手动注入

	// 构建 SDK 环境变量
	sdkEnv := buildSDKEnv(cfg)

	// SDK 0.3.142+ 使用 TaskCreate/TaskUpdate 原生任务管理工具。
	// 后端 emitTaskToolUpdate 统一将 TaskCreate/TaskUpdate/TodoWrite 转换为
	// task_update WS 事件，前端 codingChatSlice 使用 Map 模式增量合并。

	if !thinkingEnabled {
		sdkEnv["DISABLE_THINKING"] = "1"
	}

	// 读取权限模式设置
	permMode := getCodingPermissionMode(sessionID)

	// 构建自定义子代理定义（SDK options.agents）
	customAgents := buildSDKAgents()

	// 构建 SDK runner stdin 配置
	runnerCfg := sdkRunnerConfig{
		Prompt:         message,
		SystemPrompt:   systemPromptObj,
		Thinking:       thinkingEnabled,
		ImagePaths:     imagePaths,
		Env:            sdkEnv,
		PermissionMode: permMode,
	}
	if len(customAgents) > 0 {
		agentsDefs := make([]interface{}, len(customAgents))
		for i, a := range customAgents {
			agentsDefs[i] = a
		}
		runnerCfg.Agents = agentsDefs
	}

	// 加载 hooks 配置（用户自定义的敏感文件路径等）
	var hooksRaw string
	_ = db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='coding_hooks_config'`).Scan(&hooksRaw)
	if hooksRaw != "" {
		var hooksObj interface{}
		if json.Unmarshal([]byte(hooksRaw), &hooksObj) == nil {
			runnerCfg.HooksConfig = hooksObj
		}
	}

	// 加载已配置的插件路径
	pluginPaths := loadPluginPaths()
	if len(pluginPaths) > 0 {
		plugins := make([]interface{}, len(pluginPaths))
		for i, p := range pluginPaths {
			plugins[i] = map[string]string{"type": "local", "path": p}
		}
		runnerCfg.Plugins = plugins
	}
	if claudeSessionID != "" {
		runnerCfg.SessionID = claudeSessionID
	}
	if workingDir != "" {
		wd := expandHome(workingDir)
		if info, err := os.Stat(wd); err == nil && info.IsDir() {
			runnerCfg.WorkingDir = wd
		}
	}

	stdinJSON, _ := json.Marshal(runnerCfg)

	// 启动 SDK runner
	nodeBin := cfg.SDK.NodeBin
	runnerScript := cfg.SDK.RunnerScript

	// 确保脚本路径为绝对路径（cmd.Dir 会改变工作目录）
	if !filepath.IsAbs(runnerScript) {
		if abs, err := filepath.Abs(runnerScript); err == nil {
			runnerScript = abs
		}
	}

	cmd := exec.Command(nodeBin, runnerScript)

	if runnerCfg.WorkingDir != "" {
		cmd.Dir = runnerCfg.WorkingDir
	}

	// 使用 StdinPipe 实现双向通信（权限模式下 Go 需要向 SDK runner 发送权限响应）
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		slog.Warn("sdk-runner stdin pipe error", "err", err)
		hub.Send(sessionID, "text", jsonStr("启动失败: "+err.Error()))
		hub.Send(sessionID, "done", "[DONE]")
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		slog.Warn("sdk-runner stdout pipe error", "err", err)
		hub.Send(sessionID, "text", jsonStr("启动失败: "+err.Error()))
		hub.Send(sessionID, "done", "[DONE]")
		return
	}
	stderrPipe, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		slog.Warn("sdk-runner start error", "err", err)
		hub.Send(sessionID, "text", jsonStr("启动失败: "+err.Error()))
		hub.Send(sessionID, "done", "[DONE]")
		return
	}
	slog.Info("sdk-runner started", "pid", cmd.Process.Pid, "session", sessionID, "permMode", permMode)

	// 写入配置 JSON 作为 stdin 第一行（不关闭 pipe，保持通道开放用于权限响应）
	if _, err := stdinPipe.Write(append(stdinJSON, '\n')); err != nil {
		slog.Warn("sdk-runner stdin write error", "err", err)
	}

	activeChats.Store(sessionID, cmd)
	defer func() {
		activeChats.Delete(sessionID)
		clearSessionPermissions(sessionID)
		stdinPipe.Close()
	}()

	go func() {
		s := bufio.NewScanner(stderrPipe)
		s.Buffer(make([]byte, 256*1024), 256*1024)
		for s.Scan() {
			slog.Info("[sdk-runner stderr]", "text", s.Text())
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
		pendingQuestions   []json.RawMessage
		subAgents          []subAgentInfo
		perModelUsage      map[string]map[string]interface{}
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
		var ev sdkEvent
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			slog.Warn("sdk-runner bad JSON line", "err", err, "line", line[:min(100, len(line))])
			continue
		}

		switch ev.Type {
		case "system":
			if ev.Subtype == "init" && ev.Session != "" {
				newClaudeSessionID = ev.Session
				slog.Info("sdk session init", "sdkSessionId", ev.Session, "dbSession", sessionID)
			}

		case "stream_event":
			// SDKPartialAssistantMessage — 包含原始 Anthropic stream event
			// 与 CLI --output-format stream-json 中的 stream_event 格式完全一致
			var inner innerEvent
			if err := json.Unmarshal(ev.Event, &inner); err != nil {
				continue
			}

			// 来自子代理的消息添加前缀标识
			isSubagent := ev.ParentToolUseID != nil && *ev.ParentToolUseID != ""

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
					slog.Info("coding tool_use detected", "tool", toolName, "blockID", inner.ContentBlock.ID, "session", sessionID, "subagent", isSubagent)
					if !isAskUserTool(toolName) {
						toolStartPayload := map[string]any{
							"id":    inner.ContentBlock.ID,
							"name":  toolName,
							"label": toolDisplayLabel(toolName),
						}
						if isSubagent {
							toolStartPayload["parent_tool_use_id"] = *ev.ParentToolUseID
						}
						payload, _ := json.Marshal(toolStartPayload)
						hub.Send(sessionID, "tool_start", string(payload))
						if isReadTool(toolName) {
							hub.Send(sessionID, "agent_state", `{"state":"CHECKING"}`)
						} else {
							hub.Send(sessionID, "agent_state", `{"state":"EXECUTING"}`)
						}
					}
					// Agent/Task 工具：从 content_block_start 创建 subagent 条目（兜底），
					// SDK 原生 task_started 事件到达后会更新描述。这样即使 SDK 不发
					// task_started，前端 AgentsWindow 也能看到 subagent。
					if toolName == "Agent" || toolName == "Task" || toolName == "task" {
						saID := fmt.Sprintf("sa_%s", inner.ContentBlock.ID)
						exists := false
						for _, sa := range subAgents {
							if sa.ID == saID {
								exists = true
								break
							}
						}
					if !exists {
						info := subAgentInfo{
							ID:          saID,
							Description: "Sub-agent",
							Status:      "working",
						}
						subAgents = append(subAgents, info)
						payload, _ := json.Marshal(info)
						hub.Send(sessionID, "subagent_start", string(payload))
					}
					}
					b := msgBlock{
						Type:    "tool",
						Name:    toolName,
						Label:   toolDisplayLabel(toolName),
						Ms:      time.Now().UnixMilli(),
						BlockID: inner.ContentBlock.ID,
					}
					if isSubagent {
						b.ParentToolUseID = *ev.ParentToolUseID
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
						// Agent/Task 工具：尝试从累积的 JSON 中实时提取 description，
						// 在 content_block_stop 之前就更新 AgentsWindow 的显示
						if (last.Name == "Agent" || last.Name == "Task" || last.Name == "task") && last.BlockID != "" {
							tryUpdateSubAgentDesc(hub, sessionID, last.BlockID, last.Input, &subAgents)
						}
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
						last.Text = emitTaskPlanFromText(hub, sessionID, last.Text)
						if qs := extractQuestionsBatch(last.Text); len(qs) > 0 {
							pendingQuestions = append(pendingQuestions, qs...)
						} else {
							emitCodingInteractiveFromText(hub, sessionID, last.Text, &pendingQuestions)
						}
						// 子代理生命周期由 SDK 原生 task_event 管理，不再从文本中检测
					}
					if last.Type == "tool" {
						if isAskUserTool(last.Name) {
							// AskUserQuestion 现在通过 canUseTool → permission_request
							// 阻塞流程处理，content stream 中的工具块直接隐藏即可，
							// 不再提取 pendingQuestions（避免重复弹出向导）。
							blocks = blocks[:len(blocks)-1]
							endPayload, _ := json.Marshal(map[string]any{
								"done": true, "name": last.Name, "label": "提问",
								"input": "", "ms": 0, "status": "ok", "hidden": true,
							})
							hub.Send(sessionID, "tool_end", string(endPayload))
						} else {
							last.Done = true
							startedMs := last.Ms
							elapsed := time.Now().UnixMilli() - startedMs
							if elapsed < 0 {
								elapsed = 0
							}
							fullInput := last.Input
							summary := safeSummarizeToolInput(last.Name, fullInput)

							if isTaskTool(last.Name) {
								emitTaskToolUpdate(hub, sessionID, last.Name, fullInput)
							}
							if isFileModifyTool(last.Name) {
								emitFileDiff(hub, sessionID, last.Name, fullInput, workingDir)
							}
							if last.Name == "Agent" || last.Name == "Task" || last.Name == "task" {
								saID := fmt.Sprintf("sa_%s", last.BlockID)
								for i := range subAgents {
									if subAgents[i].ID == saID || subAgents[i].ID == last.BlockID {
										type taskInput struct {
											Description string `json:"description"`
											Prompt      string `json:"prompt"`
										}
										var ti taskInput
										if json.Unmarshal([]byte(fullInput), &ti) == nil {
											desc := ti.Description
											if desc == "" {
												desc = ti.Prompt
												if len(desc) > 100 {
													desc = desc[:100] + "..."
												}
											}
											if desc != "" {
												subAgents[i].Description = desc
											}
										}
										subAgents[i].Status = "done"
										p, _ := json.Marshal(subAgents[i])
										hub.Send(sessionID, "subagent_done", string(p))
										break
									}
								}
							}

							last.Input = summary
							last.Ms = elapsed
							last.Status = "ok"
							endMap := map[string]any{
								"done":      true,
								"name":      last.Name,
								"label":     last.Label,
								"input":     summary,
								"fullInput": fullInput,
								"ms":        elapsed,
								"status":    "ok",
							}
							if last.ParentToolUseID != "" {
								endMap["parent_tool_use_id"] = last.ParentToolUseID
							}
							endPayload, _ := json.Marshal(endMap)
							hub.Send(sessionID, "tool_end", string(endPayload))
							hub.Send(sessionID, "agent_state", `{"state":"THINKING"}`)
						}
					}
				}

			case "message_stop":
				if len(pendingQuestions) > 0 {
					batchPayload, _ := json.Marshal(map[string]any{
						"questions": pendingQuestions,
					})
					hub.Send(sessionID, "ask_questions_batch", string(batchPayload))
					hub.Send(sessionID, "agent_state", `{"state":"WAITING_FOR_BATCH_ANSWER"}`)
					pendingQuestions = nil
				}
			}

		case "task_event":
			handleSDKTaskEvent(hub, sessionID, &ev, &subAgents)

		case "usage_update":
			if ev.InputTokens > 0 {
				aggUsage.InputTokens = ev.InputTokens
			}
			if ev.OutputTokens > 0 {
				aggUsage.OutputTokens = ev.OutputTokens
			}
			if ev.CacheCreationInputTokens > 0 {
				aggUsage.CacheCreationInputTokens = ev.CacheCreationInputTokens
			}
			if ev.CacheReadInputTokens > 0 {
				aggUsage.CacheReadInputTokens = ev.CacheReadInputTokens
			}
			if ev.Model != "" {
				modelUsed = ev.Model
			}

		case "result":
			if ev.CostUSD > 0 {
				aggCostUSD = ev.CostUSD
			}
			if ev.Usage != nil {
				aggUsage = *ev.Usage
			}
			if ev.Session != "" && newClaudeSessionID == "" {
				newClaudeSessionID = ev.Session
			}
			// per-model 成本明细（子代理可能使用不同模型）
			if ev.ModelUsage != nil {
				var mu map[string]map[string]interface{}
				if json.Unmarshal(ev.ModelUsage, &mu) == nil {
					perModelUsage = mu
					slog.Info("per-model usage", "models", len(mu), "session", sessionID)
				}
			}

		case "sdk_error":
			errMsg := "AI 引擎执行异常"
			if ev.Error != "" {
				errMsg += "：" + ev.Error
			}
			slog.Warn("sdk-runner error", "error", ev.Error, "session", sessionID)
			hub.Send(sessionID, "text", jsonStr(errMsg))
			appendBlock("text", "", errMsg)

		case "hook_event":
			slog.Info("sdk hook event", "data", line[:min(200, len(line))], "session", sessionID)
			hub.Send(sessionID, "hook_event", line)

		case "checkpoint":
			if ev.CheckpointID != "" {
				slog.Info("sdk checkpoint received", "checkpoint_id", ev.CheckpointID, "session", sessionID)
				cpPayload, _ := json.Marshal(map[string]any{
					"checkpoint_id": ev.CheckpointID,
					"session_id":    sessionID,
					"created_at":    time.Now().UTC().Format(time.RFC3339),
				})
				hub.Send(sessionID, "sdk_checkpoint", string(cpPayload))
			}

		case "sdk_done":
			slog.Info("sdk-runner done signal", "session", sessionID)

		case "permission_request":
			handlePermissionRequest(hub, sessionID, &ev, stdinPipe)
		}
	}

	exitErr := cmd.Wait()

	if exitErr != nil && len(blocks) == 0 {
		errMsg := "AI 引擎执行异常，请检查模型接入点配置是否正确。"
		slog.Warn("sdk-runner exited with error and no output", "err", exitErr, "session", sessionID)
		hub.Send(sessionID, "text", jsonStr(errMsg))
		blocks = append(blocks, msgBlock{Type: "text", Text: errMsg})
	}

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
	if perModelUsage != nil {
		usagePayload["model_usage"] = perModelUsage
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

	if savedMsgID > 0 && hasFileModifyInBlocks(blocks) {
		go createAutoCheckpoint(sessionID, savedMsgID, workingDir, hub)
	}

	// 确保所有子代理状态标记为完成
	finalizeSubAgents(hub, sessionID, &subAgents)

	tryPostChatEvolution(agentID, sessionID, blocks)
	hub.Send(sessionID, "done", "[DONE]")
}

// handleSDKTaskEvent 处理 SDK 原生的 task_started / task_progress / task_notification 事件
func handleSDKTaskEvent(hub *Hub, sessionID int64, ev *sdkEvent, subAgents *[]subAgentInfo) {
	slog.Info("sdk task_event", "subtype", ev.Subtype, "taskId", ev.TaskID, "desc", ev.Description, "status", ev.Status, "session", sessionID)

	switch ev.Subtype {
	case "task_started":
		// 检查是否已经从 content_block_start 创建了对应的 subagent（通过 tool_use_id）
		fallbackID := fmt.Sprintf("sa_%s", ev.ToolUseID)
		updated := false
		for i := range *subAgents {
			if (*subAgents)[i].ID == fallbackID {
				oldID := (*subAgents)[i].ID
				(*subAgents)[i].ID = ev.TaskID
				if ev.Description != "" {
					(*subAgents)[i].Description = ev.Description
				}
				// 发送带 previous_id 的更新，让前端可以匹配到旧 ID
				updatePayload := map[string]any{
					"id":          ev.TaskID,
					"previous_id": oldID,
					"description": (*subAgents)[i].Description,
					"status":      (*subAgents)[i].Status,
				}
				payload, _ := json.Marshal(updatePayload)
				hub.Send(sessionID, "subagent_update", string(payload))
				updated = true
				break
			}
		}
		if !updated {
			info := subAgentInfo{
				ID:          ev.TaskID,
				Description: ev.Description,
				Status:      "working",
			}
			*subAgents = append(*subAgents, info)
			payload, _ := json.Marshal(info)
			hub.Send(sessionID, "subagent_start", string(payload))
		}

	case "task_progress":
		found := false
		for i := range *subAgents {
			if (*subAgents)[i].ID == ev.TaskID {
				if ev.Description != "" {
					(*subAgents)[i].Description = ev.Description
				}
				if ev.LastToolName != "" {
					(*subAgents)[i].LastToolName = ev.LastToolName
				}
				if ev.Summary != "" {
					(*subAgents)[i].Summary = ev.Summary
				}
				payload, _ := json.Marshal((*subAgents)[i])
				hub.Send(sessionID, "subagent_update", string(payload))
				found = true
				break
			}
		}
		if !found {
			slog.Info("task_progress for unknown task", "taskId", ev.TaskID)
		}

	case "task_updated":
		var patch map[string]interface{}
		if ev.Patch != nil {
			json.Unmarshal(ev.Patch, &patch)
		}
		slog.Info("task_updated patch", "patch", patch, "taskId", ev.TaskID)

		status, _ := patch["status"].(string)
		if status == "completed" || status == "failed" || status == "killed" || status == "done" {
			for i := range *subAgents {
				if (*subAgents)[i].ID == ev.TaskID {
					(*subAgents)[i].Status = "done"
					payload, _ := json.Marshal((*subAgents)[i])
					hub.Send(sessionID, "subagent_done", string(payload))
					return
				}
			}
		}

	case "task_notification":
		if ev.IsError {
			slog.Warn("sub-agent error",
				"taskId", ev.TaskID,
				"error", ev.Error,
				"summary", ev.Summary,
				"status", ev.Status,
				"session", sessionID)
			// Emit error to frontend so user can see what went wrong
			errMsg := ev.Error
			if errMsg == "" {
				errMsg = ev.Summary
			}
			if errMsg == "" {
				errMsg = "Sub-agent failed (unknown error)"
			}
			hub.Send(sessionID, "text", jsonStr(fmt.Sprintf("\n\n> ⚠️ Sub-agent error: %s\n", errMsg)))
		}
		for i := range *subAgents {
			if (*subAgents)[i].ID == ev.TaskID {
				if ev.IsError {
					(*subAgents)[i].Status = "error"
					errMsg := ev.Error
					if errMsg == "" {
						errMsg = ev.Summary
					}
					(*subAgents)[i].Error = errMsg
				} else {
					(*subAgents)[i].Status = "done"
				}
				if ev.Summary != "" {
					(*subAgents)[i].Description = ev.Summary
				}
				payload, _ := json.Marshal((*subAgents)[i])
				hub.Send(sessionID, "subagent_done", string(payload))
				return
			}
		}
		slog.Info("task_notification for unknown task", "taskId", ev.TaskID)
	}
}

// finalizeSubAgents marks all remaining "working" sub-agents as "done"
func finalizeSubAgents(hub *Hub, sessionID int64, subAgents *[]subAgentInfo) {
	for i := range *subAgents {
		if (*subAgents)[i].Status == "working" {
			(*subAgents)[i].Status = "done"
			payload, _ := json.Marshal((*subAgents)[i])
			hub.Send(sessionID, "subagent_done", string(payload))
			slog.Info("finalized stale subagent", "id", (*subAgents)[i].ID, "session", sessionID)
		}
	}
}

// handlePermissionRequest 处理 SDK runner 发来的权限请求
// 推送 permission_request WS 事件到前端，等待用户响应后通过 stdinPipe 回传给 SDK runner
func handlePermissionRequest(hub *Hub, sessionID int64, ev *sdkEvent, stdinPipe io.WriteCloser) {
	permID := ev.ID
	if permID == "" {
		slog.Warn("permission_request missing id", "session", sessionID)
		return
	}

	slog.Info("permission_request received", "session", sessionID, "tool", ev.ToolName, "permId", permID, "isAskUser", ev.IsAskUser)

	// AskUserQuestion 走专门的问答阻塞流程
	if ev.IsAskUser {
		handleAskUserPermission(hub, sessionID, permID, ev, stdinPipe)
		return
	}

	// 推送到前端
	wsPayload, _ := json.Marshal(map[string]any{
		"id":        permID,
		"tool_name": ev.ToolName,
		"input":     ev.Input,
		"isAskUser": ev.IsAskUser,
	})
	hub.Send(sessionID, "permission_request", string(wsPayload))
	hub.Send(sessionID, "agent_state", `{"state":"AWAITING_PERMISSION"}`)

	// 注册等待通道
	ch := registerPermissionChan(sessionID, permID)
	defer removePermissionChan(sessionID, permID)

	// 等待用户响应（最长 5 分钟）
	select {
	case resp := <-ch:
		// 将响应写回 SDK runner stdin
		stdinResp := map[string]any{
			"type":     "permission_response",
			"id":       permID,
			"behavior": resp.Behavior,
		}
		if resp.UpdatedInput != nil {
			stdinResp["updatedInput"] = resp.UpdatedInput
		}
		if resp.Message != "" {
			stdinResp["message"] = resp.Message
		}
		respJSON, _ := json.Marshal(stdinResp)
		if _, err := stdinPipe.Write(append(respJSON, '\n')); err != nil {
			slog.Warn("failed to write permission response to stdin", "err", err, "session", sessionID)
		}
		slog.Info("permission response sent", "session", sessionID, "permId", permID, "behavior", resp.Behavior)
		hub.Send(sessionID, "agent_state", `{"state":"THINKING"}`)

	case <-time.After(5 * time.Minute):
		// 超时自动拒绝
		slog.Warn("permission request timed out", "session", sessionID, "permId", permID)
		denyResp, _ := json.Marshal(map[string]any{
			"type":     "permission_response",
			"id":       permID,
			"behavior": "deny",
			"message":  "Permission request timed out (5 min)",
		})
		stdinPipe.Write(append(denyResp, '\n'))
		hub.Send(sessionID, "agent_state", `{"state":"THINKING"}`)
	}
}

// handleAskUserPermission 处理 AskUserQuestion 工具的阻塞流程。
// 将 SDK 工具输入转换为前端 ask_questions_batch 格式，
// 阻塞等待用户回答后再 allow SDK runner 继续。
//
// Claude Agent SDK 的 AskUserQuestion updatedInput 格式：
//
//	{
//	  "questions": [ ...原始 questions 数组... ],
//	  "answers": { "问题全文": "选中的 label" }
//	}
func handleAskUserPermission(hub *Hub, sessionID int64, permID string, ev *sdkEvent, stdinPipe io.WriteCloser) {
	// 解析 AskUserQuestion 的 input → 提取 questions 数组
	inputJSON, _ := json.Marshal(ev.Input)
	var askInput struct {
		Questions []json.RawMessage `json:"questions"`
	}
	json.Unmarshal(inputJSON, &askInput)

	// 转换为前端 ask_questions_batch 格式
	questions := askInput.Questions
	if len(questions) == 0 {
		questions = []json.RawMessage{inputJSON}
	}

	batchPayload, _ := json.Marshal(map[string]any{
		"questions":     questions,
		"permission_id": permID,
	})
	hub.Send(sessionID, "ask_questions_batch", string(batchPayload))
	hub.Send(sessionID, "agent_state", `{"state":"WAITING_FOR_BATCH_ANSWER"}`)

	slog.Info("ask_user blocking: waiting for user answer", "session", sessionID, "permId", permID, "numQuestions", len(questions))

	ch := registerPermissionChan(sessionID, permID)
	defer removePermissionChan(sessionID, permID)

	select {
	case resp := <-ch:
		// 构建 SDK 期望的 updatedInput：{ questions, answers }
		// 前端传来的 updatedInput.answers 可能用 q_0/q_1 作为 key，
		// 需要转换为 SDK 要求的 "问题全文" 作为 key。
		updatedInput := map[string]any{
			"questions": questions,
		}
		if resp.UpdatedInput != nil {
			if ans, ok := resp.UpdatedInput["answers"]; ok {
				// 尝试把 q_N key 映射回问题全文
				sdkAnswers := remapAnswersToQuestionText(questions, ans)
				updatedInput["answers"] = sdkAnswers
			}
			if r, ok := resp.UpdatedInput["response"]; ok {
				updatedInput["response"] = r
			}
		}

		stdinResp := map[string]any{
			"type":         "permission_response",
			"id":           permID,
			"behavior":     "allow",
			"updatedInput": updatedInput,
		}
		respJSON, _ := json.Marshal(stdinResp)
		if _, err := stdinPipe.Write(append(respJSON, '\n')); err != nil {
			slog.Warn("failed to write ask_user response to stdin", "err", err, "session", sessionID)
		}
		slog.Info("ask_user answer forwarded to SDK", "session", sessionID, "permId", permID)
		hub.Send(sessionID, "agent_state", `{"state":"THINKING"}`)

	case <-time.After(10 * time.Minute):
		slog.Warn("ask_user timed out", "session", sessionID, "permId", permID)
		denyResp, _ := json.Marshal(map[string]any{
			"type":     "permission_response",
			"id":       permID,
			"behavior": "deny",
			"message":  "User did not respond within 10 minutes",
		})
		stdinPipe.Write(append(denyResp, '\n'))
		hub.Send(sessionID, "agent_state", `{"state":"THINKING"}`)
	}
}

// remapAnswersToQuestionText 将前端 {q_0: "label", q_1: "label"} 格式的答案
// 转换为 SDK 要求的 {"问题全文": "label"} 格式。
// 如果 key 已经是问题全文（非 q_N 格式），直接保留。
func remapAnswersToQuestionText(rawQuestions []json.RawMessage, answersRaw any) map[string]any {
	answersMap, ok := answersRaw.(map[string]interface{})
	if !ok {
		return nil
	}

	// 解析每个 question 的 "question" 字段，建立 q_N → questionText 映射
	qTextByIdx := make(map[string]string) // "q_0" → "How should I..."
	for i, raw := range rawQuestions {
		var q struct {
			Question string `json:"question"`
		}
		if json.Unmarshal(raw, &q) == nil && q.Question != "" {
			qTextByIdx[fmt.Sprintf("q_%d", i)] = q.Question
		}
	}

	result := make(map[string]any, len(answersMap))
	for key, val := range answersMap {
		if qText, exists := qTextByIdx[key]; exists {
			result[qText] = val
		} else {
			result[key] = val
		}
	}
	return result
}

// getCodingPermissionMode 读取当前会话的权限模式
// sessions.permission_mode: "trust"=完全放行, "managed"=权限管控
func getCodingPermissionMode(sessionID int64) string {
	var mode string
	err := db.DB.QueryRow(`SELECT COALESCE(permission_mode, '') FROM sessions WHERE id=?`, sessionID).Scan(&mode)
	if err == nil && mode == "managed" {
		return "interactive"
	}
	return "bypass"
}

// buildSDKEnv 构建 SDK runner 的环境变量（key→value map，由 sdk-runner.js 合并到 process.env）
func buildSDKEnv(cfg *config.Config) map[string]string {
	env := make(map[string]string)

	_, rtName, rtModel, rtBaseURL, rtToken, rtProtocol, rtTransformer, _, _ := activeProfileSnapshot()
	rtID, _, _, _ := activeRuntimeSnapshot()

	authToken := rtToken
	baseURL := rtBaseURL

	if authToken == "" {
		authToken = cfg.Claude.AuthToken
	}
	if baseURL == "" {
		baseURL = cfg.Claude.BaseURL
	}

	if rtProtocol == "openai" {
		if rtToken == "" || rtBaseURL == "" || rtModel == "" {
			slog.Info("openai profile incomplete for SDK", "id", rtID)
			baseURL = "http://127.0.0.1:1"
			authToken = "bridge-profile-incomplete"
		} else {
			bridgeURL, err := router.EnsureRunning(router.Profile{
				ID:          rtID,
				Name:        rtName,
				BaseURL:     rtBaseURL,
				Model:       rtModel,
				Token:       rtToken,
				Transformer: rtTransformer,
			})
			if err != nil {
				slog.Warn("bridge EnsureRunning error for SDK", "err", err)
				baseURL = "http://127.0.0.1:1"
				authToken = "bridge-unavailable"
			} else {
				baseURL = bridgeURL
				authToken = "bridge-internal"
			}
		}
	} else {
		router.Stop()
	}

	// SDK 使用 ANTHROPIC_API_KEY 而非 ANTHROPIC_AUTH_TOKEN
	if authToken != "" {
		env["ANTHROPIC_API_KEY"] = authToken
	}
	if baseURL != "" {
		env["ANTHROPIC_BASE_URL"] = baseURL
	}
	if rtModel != "" {
		env["ANTHROPIC_MODEL"] = rtModel
	}
	env["CLAUDE_CODE_DISABLE_AUTOUPDATER"] = "1"
	env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"
	// 强制使用 TodoWrite 而非 TaskCreate/TaskUpdate。
	// TodoWrite 每次调用发送完整的 todos 数组，前端 codingChatSlice 使用 Map 模式合并，
	// 不需要跨工具调用匹配 task ID。TaskCreate 的 ID 在 tool_result 中分配（我们不捕获），
	// 导致后续 TaskUpdate 的 taskId 无法匹配 → 任务状态不更新。
	env["CLAUDE_CODE_ENABLE_TASKS"] = "0"

	maskedKey := authToken
	if len(maskedKey) > 10 {
		maskedKey = maskedKey[:5] + "..." + maskedKey[len(maskedKey)-3:]
	}
	slog.Info("buildSDKEnv result",
		"protocol", rtProtocol,
		"model", rtModel,
		"baseURL", baseURL,
		"authToken", maskedKey,
	)

	return env
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
	var files []db.FileSnapshot
	if workingDir != "" {
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

// tryUpdateSubAgentDesc 尝试从 Agent/Task 工具的累积 JSON 输入中提取 description，
// 实时更新 AgentsWindow 中的 subagent 描述（不等到 content_block_stop）。
// 使用 _descUpdated 标记避免重复发送更新。
var _subAgentDescUpdated sync.Map

func tryUpdateSubAgentDesc(hub *Hub, sessionID int64, blockID, partialInput string, subAgents *[]subAgentInfo) {
	key := fmt.Sprintf("%d_%s", sessionID, blockID)
	if _, loaded := _subAgentDescUpdated.Load(key); loaded {
		return
	}
	var obj struct {
		Description string `json:"description"`
		Prompt      string `json:"prompt"`
	}
	if json.Unmarshal([]byte(partialInput), &obj) != nil {
		return
	}
	desc := obj.Description
	if desc == "" {
		desc = obj.Prompt
		if len(desc) > 120 {
			desc = desc[:120] + "..."
		}
	}
	if desc == "" {
		return
	}
	_subAgentDescUpdated.Store(key, true)
	saID := fmt.Sprintf("sa_%s", blockID)
	for i := range *subAgents {
		if (*subAgents)[i].ID == saID || (*subAgents)[i].ID == blockID {
			(*subAgents)[i].Description = desc
			payload, _ := json.Marshal(map[string]any{
				"id":          (*subAgents)[i].ID,
				"description": desc,
				"status":      (*subAgents)[i].Status,
			})
			hub.Send(sessionID, "subagent_update", string(payload))
			return
		}
	}
}

// ─── Coding 专属辅助函数 ────────────────────────────────────────────

type subAgentInfo struct {
	ID           string `json:"id"`
	Description  string `json:"description"`
	Status       string `json:"status"`
	Error        string `json:"error,omitempty"`
	LastToolName string `json:"last_tool_name,omitempty"`
	Summary      string `json:"summary,omitempty"`
	TaskSubject  string `json:"task_subject,omitempty"`
}

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

	re := regexp.MustCompile("(?s)```json\\s*\n(.*?)\n```")
	matches := re.FindAllStringSubmatch(text, -1)
	for _, m := range matches {
		if len(m) >= 2 {
			if qs := tryParse(m[1]); qs != nil {
				return qs
			}
		}
	}

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

	re := regexp.MustCompile("(?s)```json\\s*\n(.*?)\n```")
	matches := re.FindAllStringSubmatch(text, -1)
	for _, m := range matches {
		if len(m) >= 2 {
			tryBuffer(m[1])
		}
	}

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

// updateSubAgentDescriptionOnly 只更新描述，不改变状态（由 SDK task_event 管理生命周期）
func updateSubAgentDescriptionOnly(rawInput string, agents *[]subAgentInfo) {
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
}

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

	for i := len(*agents) - 1; i >= 0; i-- {
		if (*agents)[i].Status == "working" {
			(*agents)[i].Status = "done"
			payload, _ := json.Marshal((*agents)[i])
			hub.Send(sessionID, "subagent_done", string(payload))
			return
		}
	}
}

func detectSubAgentEvents(hub *Hub, sessionID int64, text string, agents *[]subAgentInfo) {
	taskRe := regexp.MustCompile(`(?i)(?:creating|launching|starting)\s+(?:sub-?agent|task)\s*(?::|：)\s*(.+?)(?:\n|$)`)
	if matches := taskRe.FindStringSubmatch(text); len(matches) >= 2 {
		saID := fmt.Sprintf("sa_%d", time.Now().UnixMilli())
		info := subAgentInfo{
			ID:          saID,
			Description: strings.TrimSpace(matches[1]),
			Status:      "working",
		}
		*agents = append(*agents, info)
		payload, _ := json.Marshal(info)
		hub.Send(sessionID, "subagent_start", string(payload))
	}

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

// loadPluginPaths 读取用户配置的 SDK 插件路径
func loadPluginPaths() []string {
	var raw string
	_ = db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='coding_plugin_paths'`).Scan(&raw)
	if raw == "" {
		return nil
	}
	var paths []string
	if err := json.Unmarshal([]byte(raw), &paths); err != nil {
		return nil
	}
	return paths
}

// getBlockedPaths 返回用户或会话配置的额外阻止路径模式（正则）
func getBlockedPaths(sessionID int64) []string {
	// 从 sessions 表读取自定义阻止路径（如果有），否则返回默认空列表
	var raw string
	_ = db.DB.QueryRow(`SELECT COALESCE(blocked_paths, '') FROM sessions WHERE id=?`, sessionID).Scan(&raw)
	if raw == "" {
		return nil
	}
	var paths []string
	if err := json.Unmarshal([]byte(raw), &paths); err != nil {
		return nil
	}
	return paths
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
