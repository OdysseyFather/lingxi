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
	"strconv"
	"strings"
	"time"

	"lingxi-agent/config"
	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// ─── Evolution API Endpoints ───────────────────────────────────

// GetEvolutionConfig GET /api/agents/:id/evolution
func GetEvolutionConfig(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	enabled := db.GetAgentEvolutionEnabled(id)
	c.JSON(http.StatusOK, gin.H{"agent_id": id, "enabled": enabled})
}

// SetEvolutionConfig PUT /api/agents/:id/evolution
func SetEvolutionConfig(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := db.SetAgentEvolutionEnabled(id, body.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	apiCache.Invalidate("agents")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListEvolutionLogs GET /api/agents/:id/evolution/logs
func ListEvolutionLogs(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	logs, err := db.ListEvolutionLogs(id, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if logs == nil {
		logs = []db.EvolutionLog{}
	}
	c.JSON(http.StatusOK, logs)
}

// ListAllEvolutionLogs GET /api/evolution/logs
func ListAllEvolutionLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	logs, err := db.ListAllEvolutionLogs(limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if logs == nil {
		logs = []db.EvolutionLog{}
	}
	c.JSON(http.StatusOK, logs)
}

// GetEvolutionStats GET /api/evolution/stats
func GetEvolutionStats(c *gin.Context) {
	stats, err := db.GetEvolutionStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// DeleteEvolutionLog DELETE /api/evolution/logs/:id
func DeleteEvolutionLog(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	db.DeleteEvolutionLog(id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ClearEvolutionLogs DELETE /api/agents/:id/evolution/logs
func ClearEvolutionLogs(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	db.ClearEvolutionLogs(id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// RevertEvolutionLog POST /api/evolution/logs/:id/revert
func RevertEvolutionLog(c *gin.Context) {
	logID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	log, err := db.GetEvolutionLog(logID)
	if err != nil || log == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "日志不存在"})
		return
	}
	if log.Status == "reverted" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该进化已被撤销"})
		return
	}

	var revertErr error
	switch log.Action {
	case "create_memory":
		if log.TargetID > 0 {
			_, revertErr = db.DB.Exec(`DELETE FROM memories WHERE id=?`, log.TargetID)
		}
	case "create_knowledge":
		if log.TargetID > 0 {
			var filePath string
			db.DB.QueryRow(`SELECT file_path FROM knowledge WHERE id=?`, log.TargetID).Scan(&filePath)
			if filePath != "" {
				os.Remove(filePath)
			}
			_, revertErr = db.DB.Exec(`DELETE FROM knowledge WHERE id=?`, log.TargetID)
		}
	case "fix_skill":
		var detail map[string]string
		json.Unmarshal([]byte(log.Detail), &detail)
		backupFile := detail["backup"]
		if backupFile != "" {
			skillDir := filepath.Dir(backupFile)
			skillFile := filepath.Join(skillDir, "SKILL.md")
			backupContent, readErr := os.ReadFile(backupFile)
			if readErr == nil {
				revertErr = os.WriteFile(skillFile, backupContent, 0644)
				if revertErr == nil {
					oldDesc := extractDescriptionFromSkillMd(string(backupContent))
					if oldDesc != "" {
						db.DB.Exec(`UPDATE skills SET description=?, updated_at=CURRENT_TIMESTAMP WHERE name=?`, oldDesc, detail["skill_name"])
					}
				}
			} else {
				revertErr = fmt.Errorf("备份文件读取失败: %w", readErr)
			}
		} else {
			revertErr = fmt.Errorf("无备份文件信息")
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的操作类型: " + log.Action})
		return
	}

	if revertErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "撤销失败: " + revertErr.Error()})
		return
	}

	db.UpdateEvolutionLogStatus(logID, "reverted")
	apiCache.Invalidate("skills")
	BroadcastEvent("evolution_reverted", map[string]interface{}{
		"log_id": logID, "action": log.Action, "summary": log.Summary,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已撤销: " + log.Summary})
}

// ManualExtract POST /api/agents/:id/evolution/extract
func ManualExtract(c *gin.Context) {
	agentID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		SessionID int64  `json:"session_id"`
		MessageID int64  `json:"message_id"`
		Content   string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Use full session context (including tool execution records) instead of single message
	var text string
	if body.SessionID > 0 {
		text = buildConversationContext(body.SessionID, 0)
	}
	if text == "" && body.Content != "" {
		text = body.Content
	}
	if text == "" && body.MessageID > 0 {
		var content string
		db.DB.QueryRow(`SELECT content FROM messages WHERE id=?`, body.MessageID).Scan(&content)
		text = content
	}
	if text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有内容可提取"})
		return
	}
	go runEvolutionAnalysis(agentID, body.SessionID, text, "manual")
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "正在后台分析..."})
}

// ExtractSessionKnowledge POST /api/sessions/:id/extract-knowledge
// Extracts knowledge from a conversation session and writes it to a knowledge file.
func ExtractSessionKnowledge(c *gin.Context) {
	sessionID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if sessionID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session_id"})
		return
	}

	rows, err := db.DB.Query(
		`SELECT role, content FROM messages WHERE session_id=? ORDER BY id`, sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var parts []string
	for rows.Next() {
		var role, content string
		rows.Scan(&role, &content)
		parts = append(parts, fmt.Sprintf("[%s]: %s", role, content))
	}
	if len(parts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "对话为空"})
		return
	}

	var title string
	db.DB.QueryRow(`SELECT title FROM sessions WHERE id=?`, sessionID).Scan(&title)
	if title == "" {
		title = fmt.Sprintf("对话 #%d", sessionID)
	}

	fullContext := strings.Join(parts, "\n\n")
	go runKnowledgeExtraction(sessionID, title, fullContext)
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "正在后台提炼知识..."})
}

func runKnowledgeExtraction(sessionID int64, sessionTitle, fullContext string) {
	slog.Info("knowledge extraction started", "session_id", sessionID)
	BroadcastEvent("evolution_status", map[string]interface{}{
		"phase": "analyzing", "session_id": sessionID, "trigger": "knowledge_extract",
		"message": "正在提炼对话「" + truncStr(sessionTitle, 30) + "」的知识...",
	})

	prompt := fmt.Sprintf(`你是一个知识提炼专家。请从以下完整对话中提炼出有价值的知识、SOP 和经验教训。

## 对话标题
%s

## 对话内容
%s

## 任务
将对话中的关键知识整理为一篇结构化的 Markdown 文档。要求：
1. 提取具有长期价值的信息（操作流程、问题排查方法、配置规范、最佳实践等）
2. 过滤掉闲聊、重复内容和临时性信息
3. 用清晰的标题和段落组织
4. 如果对话中没有值得提炼的知识，返回 "NO_KNOWLEDGE"

仅输出 Markdown 文档内容，不要输出其他解释。`, sessionTitle, truncStr(fullContext, 15000))

	result := callActiveLLM(prompt)
	if result == "" || strings.TrimSpace(result) == "NO_KNOWLEDGE" {
		slog.Info("knowledge extraction: nothing worth extracting", "session_id", sessionID)
		return
	}

	result = strings.TrimSpace(result)
	if strings.HasPrefix(result, "```") {
		if i := strings.Index(result, "\n"); i > 0 {
			result = result[i+1:]
		}
		if strings.HasSuffix(result, "```") {
			result = result[:len(result)-3]
		}
		result = strings.TrimSpace(result)
	}

	kbDir := getKnowledgeDir()
	safeTitle := strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			return '_'
		}
		return r
	}, sessionTitle)
	fileName := fmt.Sprintf("extract_%d_%s.md", sessionID, safeTitle)
	filePath := filepath.Join(kbDir, fileName)

	if err := writeFileContent(filePath, result); err != nil {
		slog.Warn("knowledge extraction: failed to write file", "err", err)
		return
	}

	_, err := db.DB.Exec(
		`INSERT INTO knowledge (title, file_path, category, tags, summary, size) VALUES (?,?,?,?,?,?)`,
		"对话提炼 - "+sessionTitle, filePath, "extraction", `["对话提炼"]`,
		truncStr(result, 200), len(result))
	if err != nil {
		slog.Warn("knowledge extraction: failed to insert DB", "err", err)
		return
	}

	BroadcastEvent("evolution_status", map[string]interface{}{
		"phase": "done", "session_id": sessionID, "trigger": "knowledge_extract",
		"message": "知识提炼完成：" + sessionTitle, "count": 1,
	})
	BroadcastEvent("evolution_result", map[string]interface{}{
		"session_id": sessionID, "action": "提炼了对话知识", "summary": "对话提炼 - " + sessionTitle,
	})
	slog.Info("knowledge extraction completed", "session_id", sessionID, "file", filePath)
}

// ─── Evolution Engine Core ─────────────────────────────────────

// TryAutoEvolution is called after negative feedback or correction signals.
func TryAutoEvolution(agentID, sessionID int64, conversationContext string) {
	if agentID <= 0 {
		return
	}
	if !db.GetAgentEvolutionEnabled(agentID) {
		slog.Debug("evolution skip: agent not enabled", "agent_id", agentID)
		return
	}
	slog.Info("evolution auto triggered", "agent_id", agentID, "session_id", sessionID, "ctx_len", len(conversationContext))
	go runEvolutionAnalysis(agentID, sessionID, conversationContext, "auto")
}

// broadcastProgress sends a fine-grained evolution_progress event
func broadcastProgress(agentID, sessionID int64, trigger string, step, totalSteps int, phase, message, detail string) {
	BroadcastEvent("evolution_progress", map[string]interface{}{
		"agent_id":    agentID,
		"session_id":  sessionID,
		"trigger":     trigger,
		"phase":       phase,
		"step":        step,
		"total_steps": totalSteps,
		"message":     message,
		"detail":      detail,
	})
}

func runEvolutionAnalysis(agentID, sessionID int64, context, trigger string) {
	slog.Info("evolution analysis started", "agent_id", agentID, "trigger", trigger)

	var steps []map[string]interface{}
	addStep := func(phase, msg string) {
		steps = append(steps, map[string]interface{}{"phase": phase, "message": msg, "ts": fmt.Sprintf("%d", time.Now().UnixMilli())})
	}

	addStep("start", "开始进化分析")
	broadcastProgress(agentID, sessionID, trigger, 1, 5, "fetching_context", "正在准备对话上下文...", "")

	prompt := buildEvolutionPrompt(context, trigger)
	addStep("context_ready", fmt.Sprintf("上下文长度: %d 字符", len(context)))

	broadcastProgress(agentID, sessionID, trigger, 2, 5, "calling_llm", "正在调用 LLM 分析对话...", "")

	result := callActiveLLM(prompt)
	if result == "" {
		slog.Warn("evolution analysis returned empty result")
		addStep("error", "LLM 返回空结果")
		stepsJSON, _ := json.Marshal(steps)
		db.InsertEvolutionLog(&db.EvolutionLog{
			AgentID:        agentID,
			SessionID:      sessionID,
			Trigger:        trigger,
			Action:         "failed",
			Summary:        "进化分析失败：AI 引擎无响应",
			Detail:         "LLM 调用未返回有效内容，请检查模型接入点配置是否正确",
			Status:         "failed",
			RawLLMResponse: "",
			StepsJSON:      string(stepsJSON),
		})
		BroadcastEvent("evolution_status", map[string]interface{}{
			"phase": "error", "agent_id": agentID, "session_id": sessionID,
			"message": "LLM 无响应（可能是 API 认证失败或模型不可用），请检查接入点配置",
		})
		return
	}

	addStep("llm_responded", fmt.Sprintf("收到 LLM 响应: %d 字符", len(result)))
	broadcastProgress(agentID, sessionID, trigger, 3, 5, "parsing_result", "正在解析分析结果...", "")

	actions := parseEvolutionActions(result)

	if len(actions) == 0 {
		slog.Info("evolution analysis: no actions needed", "result_preview", truncStr(result, 200))
		addStep("no_actions", "未发现需要提取的知识或修复")
		stepsJSON, _ := json.Marshal(steps)
		db.InsertEvolutionLog(&db.EvolutionLog{
			AgentID:        agentID,
			SessionID:      sessionID,
			Trigger:        trigger,
			Action:         "no_action",
			Summary:        "分析完成，未发现需要提取的知识或修复",
			Detail:         "LLM 分析了对话内容后认为没有值得提取的新知识",
			Status:         "completed",
			RawLLMResponse: truncStr(result, 5000),
			StepsJSON:      string(stepsJSON),
		})
		broadcastProgress(agentID, sessionID, trigger, 5, 5, "done", "分析完成，未发现需要提取的知识或修复", "")
		BroadcastEvent("evolution_status", map[string]interface{}{
			"phase": "done", "agent_id": agentID, "session_id": sessionID,
			"message": "未发现需要提取的知识或修复", "count": 0,
		})
		return
	}

	addStep("actions_found", fmt.Sprintf("发现 %d 项进化动作", len(actions)))
	broadcastProgress(agentID, sessionID, trigger, 4, 5, "executing",
		fmt.Sprintf("发现 %d 项进化动作，正在执行...", len(actions)), mustJSON(actions))

	var results []map[string]interface{}
	for i, a := range actions {
		detail := fmt.Sprintf("执行第 %d/%d 项: %s - %s", i+1, len(actions), a.Type, truncStr(a.Content, 50))
		broadcastProgress(agentID, sessionID, trigger, 4, 5, "executing_action", detail, mustJSON(a))
		addStep("execute_"+a.Type, truncStr(a.Content, 100))
		executeEvolutionAction(agentID, sessionID, trigger, a, result)
		results = append(results, map[string]interface{}{
			"type": a.Type, "content": truncStr(a.Content, 100), "reason": a.Reason,
		})
	}

	addStep("done", fmt.Sprintf("完成 %d 项进化", len(actions)))
	broadcastProgress(agentID, sessionID, trigger, 5, 5, "done",
		fmt.Sprintf("完成 %d 项进化", len(actions)), mustJSON(results))

	BroadcastEvent("evolution_status", map[string]interface{}{
		"phase": "done", "agent_id": agentID, "session_id": sessionID,
		"message": fmt.Sprintf("完成 %d 项进化", len(actions)), "count": len(actions),
		"results": results,
	})
}

// parseEvolutionActions extracts actions from LLM response with robust parsing
func parseEvolutionActions(result string) []evolutionAction {
	cleaned := stripMarkdownFences(result)

	var actions []evolutionAction
	if err := json.Unmarshal([]byte(cleaned), &actions); err == nil {
		return actions
	}

	idx := strings.Index(cleaned, "[")
	end := strings.LastIndex(cleaned, "]")
	if idx >= 0 && end > idx {
		if err := json.Unmarshal([]byte(cleaned[idx:end+1]), &actions); err == nil {
			return actions
		}
	}

	slog.Warn("evolution: failed to parse LLM response", "response_len", len(result), "preview", truncStr(result, 200))
	return nil
}

// stripMarkdownFences removes ```json ... ``` or ``` ... ``` wrappers
func stripMarkdownFences(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	if i := strings.Index(s, "\n"); i > 0 {
		s = s[i+1:]
	}
	if strings.HasSuffix(s, "```") {
		s = s[:len(s)-3]
	}
	return strings.TrimSpace(s)
}

type evolutionAction struct {
	Type      string `json:"type"`
	Content   string `json:"content"`
	Title     string `json:"title,omitempty"`
	Reason    string `json:"reason"`
	SkillName string `json:"skill_name,omitempty"`
}

func buildEvolutionPrompt(conversationContext, trigger string) string {
	return fmt.Sprintf(`你是一个 AI 自我进化分析器。请分析以下对话内容，从中提取可以被长期记住的知识、纠正、SOP 或偏好，以及需要修复的技能描述。

## 对话内容
%s

## 触发方式
%s

## 输出格式
返回一个 JSON 数组，每个元素包含：
- "type": 可选值：
  - "memory": 轻量级偏好/纠正/用户习惯
  - "knowledge": 重要 SOP/流程文档/新发现的领域知识
  - "skill_fix": 技能描述有误导致执行失败，agent 后续自己纠正了问题，需要修复技能描述
- "content": 对应的内容
  - memory: 要记住的内容
  - knowledge: 要创建的知识库文档内容
  - skill_fix: 具体描述技能哪里有问题、正确的做法是什么（修复指令，不需要输出完整文件）
- "title": 知识库条目标题（仅 knowledge 类型需要）
- "skill_name": 需要修复的技能名称（仅 skill_fix 类型需要，必须精确匹配技能名）
- "reason": 为什么这是值得记住/修复的

## 重点关注 skill_fix
如果对话中出现了以下模式，必须生成 skill_fix：
1. 工具/技能执行失败（错误信息、异常、返回错误码）
2. Agent 随后定位到了原因（如参数格式错误、描述不准确、缺少必要说明）
3. Agent 通过修正参数或方法成功解决了问题
此时应提取正确的技能描述，让后续调用不再犯同样的错误。

仅返回确实有价值的信息，不要包含闲聊或显而易见的常识。如果没有值得提取的内容，返回空数组 []。
仅输出 JSON，不要输出其他内容。`, conversationContext, trigger)
}

// callActiveLLM 复用当前已配置的 AI 引擎（Claude CLI）进行同步调用，
// 不创建会话和消息记录，仅返回纯文本结果。
func callActiveLLM(prompt string) string {
	cfg := config.Get()
	claudeBin := cfg.Claude.Bin
	if claudeBin == "" {
		slog.Warn("evolution: claude bin not configured")
		BroadcastEvent("evolution_progress", map[string]interface{}{
			"phase": "error", "step": 5, "total_steps": 5,
			"message": "进化失败：AI 引擎（Claude CLI）未配置，请确保已安装 claude 并在 config 中设置路径",
		})
		return ""
	}

	// 检查 Claude CLI 可执行文件是否存在
	if _, err := exec.LookPath(claudeBin); err != nil {
		slog.Warn("evolution: claude binary not found", "bin", claudeBin, "err", err)
		BroadcastEvent("evolution_progress", map[string]interface{}{
			"phase": "error", "step": 5, "total_steps": 5,
			"message": fmt.Sprintf("进化失败：找不到 AI 引擎 %s，请检查 Claude CLI 是否已安装", claudeBin),
		})
		return ""
	}

	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--verbose",
		"--include-partial-messages",
		"--dangerously-skip-permissions",
		"--system-prompt", "You are a JSON-only analysis assistant. Always respond with valid JSON only, no markdown fences, no explanation.",
	}

	cmd := exec.Command(claudeBin, args...)
	cmd.Stdin = strings.NewReader(prompt)
	cmd.Env = buildClaudeEnv(cfg)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		slog.Warn("evolution: stdout pipe error", "err", err)
		return ""
	}
	stderrPipe, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		slog.Warn("evolution: cmd start error", "bin", claudeBin, "err", err)
		BroadcastEvent("evolution_progress", map[string]interface{}{
			"phase": "error", "step": 5, "total_steps": 5,
			"message": "进化失败：AI 引擎启动失败 - " + err.Error(),
		})
		return ""
	}
	slog.Info("evolution: claude started", "pid", cmd.Process.Pid, "bin", claudeBin)

	var stderrBuf strings.Builder
	go func() {
		s := bufio.NewScanner(stderrPipe)
		for s.Scan() {
			line := s.Text()
			slog.Info("[evolution claude stderr]", "text", line)
			stderrBuf.WriteString(line + "\n")
		}
	}()

	var textBuf strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var ev struct {
			Type  string          `json:"type"`
			Event json.RawMessage `json:"event"`
		}
		if json.Unmarshal([]byte(line), &ev) != nil {
			continue
		}
		if ev.Type == "stream_event" {
			var inner struct {
				Type  string `json:"type"`
				Delta struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"delta"`
			}
			if json.Unmarshal(ev.Event, &inner) == nil && inner.Type == "content_block_delta" && inner.Delta.Type == "text_delta" {
				textBuf.WriteString(inner.Delta.Text)
			}
		}
	}

	waitErr := cmd.Wait()
	exitCode := 0
	if waitErr != nil {
		if exitErr, ok := waitErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}

	result := strings.TrimSpace(textBuf.String())
	slog.Info("evolution: claude finished", "exit_code", exitCode, "result_len", len(result), "stderr_len", stderrBuf.Len())

	if result == "" {
		errDetail := truncStr(stderrBuf.String(), 300)
		errMsg := "进化失败：AI 引擎无响应"
		if exitCode != 0 {
			errMsg = fmt.Sprintf("进化失败：AI 引擎退出码 %d", exitCode)
		}
		if errDetail != "" {
			errMsg += " — " + errDetail
		}
		slog.Warn("evolution: claude returned empty text", "exit_code", exitCode, "stderr", errDetail)
		BroadcastEvent("evolution_progress", map[string]interface{}{
			"phase": "error", "step": 5, "total_steps": 5,
			"message": errMsg,
		})
	}
	return result
}

func notifyEvolution(sessionID int64, action, summary string) {
	BroadcastEvent("evolution_result", map[string]interface{}{
		"session_id": sessionID,
		"action":     action,
		"summary":    summary,
	})
}

func executeEvolutionAction(agentID, sessionID int64, trigger string, action evolutionAction, rawLLMResponse string) {
	switch action.Type {
	case "memory":
		memID, err := db.InsertMemory(agentID, action.Content, "evolution")
		if err != nil {
			slog.Warn("evolution: failed to create memory", "err", err)
			return
		}
		summary := truncStr(action.Content, 200)
		db.InsertEvolutionLog(&db.EvolutionLog{
			AgentID:        agentID,
			SessionID:      sessionID,
			Trigger:        trigger,
			Action:         "create_memory",
			TargetType:     "memory",
			TargetID:       memID,
			Summary:        summary,
			Detail:         mustJSON(action),
			RawLLMResponse: truncStr(rawLLMResponse, 5000),
		})
		notifyEvolution(sessionID, "记住了新知识", summary)
		slog.Info("evolution: created memory", "agent_id", agentID, "mem_id", memID)

	case "knowledge":
		if action.Title == "" {
			action.Title = "进化提取 - " + truncStr(action.Content, 30)
		}
		kbID, err := createKnowledgeFromEvolution(agentID, action.Title, action.Content)
		if err != nil {
			slog.Warn("evolution: failed to create KB entry", "err", err)
			return
		}
		db.InsertEvolutionLog(&db.EvolutionLog{
			AgentID:        agentID,
			SessionID:      sessionID,
			Trigger:        trigger,
			Action:         "create_knowledge",
			TargetType:     "knowledge",
			TargetID:       kbID,
			Summary:        action.Title,
			Detail:         mustJSON(action),
			RawLLMResponse: truncStr(rawLLMResponse, 5000),
		})
		notifyEvolution(sessionID, "创建了知识库条目", action.Title)
		slog.Info("evolution: created KB entry", "agent_id", agentID, "kb_id", kbID)

	case "skill_fix":
		if action.SkillName == "" {
			slog.Warn("evolution: skill_fix missing skill_name")
			return
		}
		result, err := fixSkillOnDisk(action.SkillName, action.Content, action.Reason)
		if err != nil {
			slog.Warn("evolution: failed to fix skill", "skill", action.SkillName, "err", err)
			return
		}
		var skillID int64
		db.DB.QueryRow(`SELECT id FROM skills WHERE name=?`, action.SkillName).Scan(&skillID)
		fixSummary := fmt.Sprintf("修复技能「%s」的 SKILL.md", action.SkillName)
		db.InsertEvolutionLog(&db.EvolutionLog{
			AgentID:        agentID,
			SessionID:      sessionID,
			Trigger:        trigger,
			Action:         "fix_skill",
			TargetType:     "skill",
			TargetID:       skillID,
			Summary:        fixSummary,
			Detail:         mustJSON(result),
			RawLLMResponse: truncStr(rawLLMResponse, 5000),
		})
		apiCache.Invalidate("skills")
		notifyEvolution(sessionID, "修复了技能文件", fixSummary)
		slog.Info("evolution: fixed skill file", "skill", action.SkillName)
	}
}

// fixSkillOnDisk reads the skill's SKILL.md, asks the LLM to produce a corrected
// version, writes the fix back to disk, and updates the DB description.
func fixSkillOnDisk(skillName, patchInstructions, reason string) (map[string]string, error) {
	skillDir := filepath.Join(isolatedHome(), ".claude", "skills", skillName)
	skillFile := filepath.Join(skillDir, "SKILL.md")

	oldContent, err := os.ReadFile(skillFile)
	if err != nil {
		return nil, fmt.Errorf("cannot read SKILL.md for %s: %w", skillName, err)
	}

	newContent := callActiveLLM(buildSkillFixPrompt(string(oldContent), patchInstructions, reason))
	if newContent == "" {
		return nil, fmt.Errorf("LLM returned empty result for skill fix")
	}

	newContent = strings.TrimSpace(newContent)
	if strings.HasPrefix(newContent, "```") {
		if i := strings.Index(newContent, "\n"); i > 0 {
			newContent = newContent[i+1:]
		}
		if strings.HasSuffix(newContent, "```") {
			newContent = newContent[:len(newContent)-3]
		}
		newContent = strings.TrimSpace(newContent)
	}

	if !strings.HasPrefix(newContent, "---") {
		return nil, fmt.Errorf("LLM output does not look like valid SKILL.md (missing frontmatter)")
	}

	backupFile := skillFile + ".bak"
	os.WriteFile(backupFile, oldContent, 0644)

	if err := os.WriteFile(skillFile, []byte(newContent), 0644); err != nil {
		return nil, fmt.Errorf("failed to write SKILL.md: %w", err)
	}

	newDesc := extractDescriptionFromSkillMd(newContent)
	if newDesc != "" {
		db.DB.Exec(`UPDATE skills SET description=?, updated_at=CURRENT_TIMESTAMP WHERE name=?`, newDesc, skillName)
	}

	return map[string]string{
		"skill_name": skillName,
		"reason":     reason,
		"patch":      patchInstructions,
		"backup":     backupFile,
	}, nil
}

func buildSkillFixPrompt(currentContent, patchInstructions, reason string) string {
	return fmt.Sprintf(`你是一个技能文件修复专家。以下是一个技能的 SKILL.md 文件内容，以及对话中发现的问题和修复建议。

## 当前 SKILL.md 内容
%s

## 发现的问题
%s

## 修复原因
%s

## 任务
请输出修复后的完整 SKILL.md 内容。要求：
1. 保持原有的 frontmatter 格式（---开头和结尾）
2. 保留文件的整体结构和格式
3. 只修改有问题的部分，不要大幅重写无关内容
4. 将实践中发现的正确做法/SOP 补充到相关章节中
5. 如果 description 字段需要更新，在 frontmatter 中一并修改

仅输出完整的 SKILL.md 内容，不要输出任何解释。`, currentContent, patchInstructions, reason)
}

func extractDescriptionFromSkillMd(content string) string {
	if !strings.HasPrefix(content, "---") {
		return ""
	}
	end := strings.Index(content[3:], "---")
	if end < 0 {
		return ""
	}
	frontmatter := content[3 : 3+end]
	for _, line := range strings.Split(frontmatter, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "description:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "description:"))
		}
	}
	return ""
}

func createKnowledgeFromEvolution(agentID int64, title, content string) (int64, error) {
	kbDir := getKnowledgeDir()
	fileName := fmt.Sprintf("evolution_%d_%s.md", agentID, strings.ReplaceAll(title, " ", "_"))
	filePath := kbDir + "/" + fileName
	if err := writeFileContent(filePath, content); err != nil {
		return 0, err
	}
	res, err := db.DB.Exec(`INSERT INTO knowledge (title, file_path, category, tags, summary, size) VALUES (?,?,?,?,?,?)`,
		title, filePath, "evolution", "[]", truncStr(content, 200), len(content))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func getKnowledgeDir() string {
	var kbPath string
	db.DB.QueryRow(`SELECT file_path FROM knowledge ORDER BY id DESC LIMIT 1`).Scan(&kbPath)
	if kbPath != "" {
		dir := filepath.Dir(kbPath)
		if dir != "." && dir != "" {
			return dir
		}
	}
	return filepath.Join(filepath.Dir(config.Get().DB.Path), "knowledge")
}

func writeFileContent(path, content string) error {
	os.MkdirAll(filepath.Dir(path), 0755)
	return os.WriteFile(path, []byte(content), 0644)
}

func truncStr(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}

func mustJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// RunEvolutionAnalysisExternal 供 evolution scanner 等外部包调用，异步触发一次进化分析
func RunEvolutionAnalysisExternal(agentID, sessionID int64, ctx, trigger string) {
	go runEvolutionAnalysis(agentID, sessionID, ctx, trigger)
}

// BuildConversationContextExternal 供外部包构建会话上下文
func BuildConversationContextExternal(sessionID, beforeMsgID int64) string {
	return buildConversationContext(sessionID, beforeMsgID)
}
