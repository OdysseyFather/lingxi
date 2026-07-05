package connector

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

)

// ── 全局协调器注册表 ────────────────────────────────────────────

var activeCoordinators sync.Map // rootMsgID -> *TaskCoordinator

// LookupCoordinator 查找活跃的协调器（供 onMessage RootId 路由使用）
func LookupCoordinator(rootMsgID string) *TaskCoordinator {
	if v, ok := activeCoordinators.Load(rootMsgID); ok {
		return v.(*TaskCoordinator)
	}
	return nil
}

// ── LLM 回调注入 ────────────────────────────────────────────

// RunClaudeForTaskFunc LLM 调用函数，由 handler 层注入
var RunClaudeForTaskFunc func(message string, sessionID int64) (reply string, usedSessionID int64, err error)

// LaunchAgentTeamsFromP2P 供 P2P watcher 调用，启动 Agent Teams 任务协调。
// connectorID 用于获取飞书 appID/appSecret。
func LaunchAgentTeamsFromP2P(rule *FeishuMonitorRule, connectorID int64, text, senderID, senderName, chatID, msgID string) error {
	if df, err := os.OpenFile("/tmp/lingxi-task-debug.log", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644); err == nil {
		fmt.Fprintf(df, "[%s] LaunchAgentTeamsFromP2P entered: rule=%d connector=%d target=%s\n",
			time.Now().Format("15:04:05"), rule.ID, connectorID, rule.TargetChatID)
		df.Close()
	}
	c, err := connDB.GetIMConnectorByID(connectorID)
	if err != nil || c == nil {
		return fmt.Errorf("connector %d not found: %v", connectorID, err)
	}
	var cfg FeishuConfig
	if err := json.Unmarshal([]byte(c.Config), &cfg); err != nil {
		return fmt.Errorf("parse feishu config: %w", err)
	}
	rule.ConnectorID = connectorID
	tc := NewTaskCoordinator(nil, rule, cfg.AppID, cfg.AppSecret)
	go tc.StartTask(text, nil, senderID, senderName, chatID, msgID)
	return nil
}

// ── 数据结构 ────────────────────────────────────────────────

// PendingDispatch 正在等待回复的分发
type PendingDispatch struct {
	OpenID   string
	Name     string
	Role     string
	TaskDesc string
	SentAt   time.Time
	Replied  bool
}

// ReplyMessage 收到的回复消息
type ReplyMessage struct {
	SenderID  string
	Text      string
	MsgID     string
	Timestamp time.Time
}

// DispatchRound 单轮分发记录
type DispatchRound struct {
	Round     int                `json:"round"`
	Targets   []DispatchRoundTarget `json:"targets"`
	StartedAt string             `json:"started_at"`
	DoneAt    string             `json:"done_at"`
}

type DispatchRoundTarget struct {
	OpenID   string `json:"open_id"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	TaskDesc string `json:"task_desc"`
	Reply    string `json:"reply"`
	Status   string `json:"status"` // pending / replied / timeout
}

// DispatchHistory 持久化的分发历史
type DispatchHistory struct {
	Rounds []DispatchRound `json:"rounds"`
}

// ── TaskCoordinator 协调器 ──────────────────────────────────

type TaskCoordinator struct {
	mu        sync.Mutex
	connector *FeishuConnector
	instance  *FeishuTaskInstance
	rule      *FeishuMonitorRule
	ctx       context.Context
	cancel    context.CancelFunc
	appID     string
	appSecret string

	// 当前轮的并行分发追踪
	pendingReplies  map[string]*PendingDispatch // openID -> dispatch
	replyMessages   map[string][]ReplyMessage   // openID -> msgs
	debounceTimers  map[string]*time.Timer      // openID -> timer
	collectedReplies map[string]string           // openID -> 最终回复文本

	humanMessages []ReplyMessage // 非 agent 的人类消息
	globalTimeout *time.Timer

	// 进度卡片
	progressMsgID string
	progressLines []string

	// 流式卡片
	streamingCardID    string
	streamingElementID string
	streamingSequence  int

	// LLM session
	sessionID int64

}

// NewTaskCoordinator 创建新的协调器
func NewTaskCoordinator(f *FeishuConnector, rule *FeishuMonitorRule, appID, appSecret string) *TaskCoordinator {
	ctx, cancel := context.WithCancel(context.Background())
	return &TaskCoordinator{
		connector:        f,
		rule:             rule,
		ctx:              ctx,
		cancel:           cancel,
		appID:            appID,
		appSecret:        appSecret,
		pendingReplies:   make(map[string]*PendingDispatch),
		replyMessages:    make(map[string][]ReplyMessage),
		debounceTimers:   make(map[string]*time.Timer),
		collectedReplies: make(map[string]string),
		streamingElementID: "stream_md_01",
	}
}

// StartTask 启动任务协调（goroutine 入口）
func (tc *TaskCoordinator) StartTask(
	triggerText string,
	triggerImages []IMImage,
	senderID, senderName, sourceChatID, triggerMsgID string,
) {
	slog.Info("[task-coordinator] ★ StartTask goroutine entered",
		"senderName", senderName, "sourceChatID", sourceChatID, "triggerMsgID", triggerMsgID,
		"textLen", len(triggerText))

	defer func() {
		if r := recover(); r != nil {
			slog.Error("[task-coordinator] StartTask panic recovered", "panic", r)
		}
	}()

	rule := tc.rule
	if rule == nil {
		slog.Error("[task-coordinator] StartTask called with nil rule")
		return
	}
	targetChatID := rule.TargetChatID
	if targetChatID == "" {
		targetChatID = sourceChatID
	}

	slog.Info("[task-coordinator] starting task",
		"rule_id", rule.ID, "source_chat", sourceChatID, "target_chat", targetChatID)

	// Step 0: 创建灵犀本地会话（用于持久化话题消息）
	sessionTitle := "Agent Teams｜" + truncateStr(triggerText, 40)
	localSessionID := tc.createLocalSession(sessionTitle, rule.ConnectorID)
	tc.sessionID = localSessionID

	// 持久化原始触发消息到本地会话
	tc.saveLocalMessage(localSessionID, "user", fmt.Sprintf("[来自 %s]\n%s", senderName, triggerText))

	// 创建任务实例记录
	inst := &FeishuTaskInstance{
		RuleID:               rule.ID,
		ConnectorID:          rule.ConnectorID,
		SourceChatID:         sourceChatID,
		TargetChatID:         targetChatID,
		TriggerMsgID:         triggerMsgID,
		TriggerContent:       triggerText,
		TriggerSenderID:      senderID,
		TriggerSenderName:    senderName,
		DispatchTargets:      rule.DispatchTargets,
		MaxRounds:            rule.MaxRounds,
		ReplyTimeoutMinutes:  rule.ReplyTimeoutMinutes,
		ReplyDebounceSeconds: rule.ReplyDebounceSeconds,
	}

	id, err := connDB.CreateTaskInstance(inst)
	if err != nil {
		slog.Error("[task-coordinator] create task instance failed", "err", err)
		return
	}
	slog.Info("[task-coordinator] task instance created", "id", id, "local_session_id", localSessionID)
	inst.ID = id
	tc.instance = inst

	// Step 1: 发送主卡片到目标群
	title := "任务协调｜" + truncateStr(triggerText, 30)
	subtitle := fmt.Sprintf("来自 %s · 灵犀 Agent Teams", senderName)
	bodyMD := fmt.Sprintf("**用户反馈**：%s\n\n**来源**：%s\n\n**当前状态**：分析中",
		truncateStr(triggerText, 300), senderName)

	mainCardJSON := BuildTaskMainCard(title, subtitle, bodyMD, TaskStatusAccepted)
	rootMsgID, err := tc.sendMainCard(targetChatID, mainCardJSON)
	if err != nil {
		slog.Error("[task-coordinator] send main card failed", "err", err)
		tc.setError("发送主卡片失败: " + err.Error())
		return
	}

	inst.RootMessageID = rootMsgID
	inst.Status = "ACCEPTED"
	connDB.UpdateTaskInstance(inst)
	activeCoordinators.Store(rootMsgID, tc)

	// Step 2: 发送思考流卡片作为第一条话题回复
	streamTitle := "调度者思考流"
	streamCardJSON := BuildTaskStreamingCard(streamTitle)
	cardID, err := tc.createStreamingCardEntity(streamCardJSON)
	if err != nil {
		slog.Warn("[task-coordinator] create streaming card failed", "err", err)
	} else {
		tc.streamingCardID = cardID
		inst.StreamingCardID = cardID
		replyMsgID, threadID, err := tc.sendThreadReplyCard(rootMsgID, cardID)
		if err != nil {
			slog.Warn("[task-coordinator] send streaming card as thread reply failed", "err", err)
		} else {
			inst.ThreadID = threadID
			inst.StreamingSequence = 0
			slog.Info("[task-coordinator] streaming card sent to thread",
				"card_id", cardID, "reply_msg_id", replyMsgID, "thread_id", threadID)
		}
	}
	connDB.UpdateTaskInstance(inst)

	// Step 3: LLM 初始分析 → 分析结果写入流式卡片 → 只 @ 需要参与的人
	tc.doInitialAnalysisAndDispatch(triggerText, senderName)

	// Step 4: 启动全局超时
	timeoutMin := tc.instance.ReplyTimeoutMinutes
	if timeoutMin <= 0 {
		timeoutMin = 10
	}
	tc.globalTimeout = time.AfterFunc(time.Duration(timeoutMin)*time.Minute, func() {
		tc.onGlobalTimeout()
	})

	// Step 5: 启动话题消息轮询（持久化到灵犀本地会话）
	go tc.pollThreadMessages()
}

// OnThreadReply 处理话题内的回复消息
// isMentionBot 表示消息是否 @了协调器 bot，如果是则触发 AI 回复
func (tc *TaskCoordinator) OnThreadReply(senderID, senderName, text, msgID string, isMentionBot bool) {
	tc.mu.Lock()

	// 忽略自己（bot）的消息（防止 AI 回复后飞书推送的 bot 消息再次触发）
	if tc.connector != nil && senderID == tc.connector.botOpenID {
		tc.mu.Unlock()
		return
	}

	slog.Info("[task-coordinator] thread reply received",
		"sender_id", senderID, "sender_name", senderName, "msg_id", msgID,
		"text_len", len(text), "root_msg", tc.instance.RootMessageID,
		"mention_bot", isMentionBot)

	msg := ReplyMessage{
		SenderID:  senderID,
		Text:      text,
		MsgID:     msgID,
		Timestamp: time.Now(),
	}

	// 持久化到本地会话
	if tc.sessionID > 0 {
		tc.saveLocalMessage(tc.sessionID, "user", fmt.Sprintf("[%s] %s", senderName, text))
	}

	// 检查是否是已分发的目标
	if pd, ok := tc.pendingReplies[senderID]; ok && !pd.Replied {
		tc.replyMessages[senderID] = append(tc.replyMessages[senderID], msg)

		// 重置防抖计时器
		if timer, exists := tc.debounceTimers[senderID]; exists {
			timer.Stop()
		}
		debounceSec := tc.instance.ReplyDebounceSeconds
		if debounceSec <= 0 {
			debounceSec = 30
		}
		tc.debounceTimers[senderID] = time.AfterFunc(
			time.Duration(debounceSec)*time.Second,
			func() { tc.onDebounceExpired(senderID) },
		)

		tc.appendProgress(fmt.Sprintf("📨 收到 %s 的回复（等待完成...）", pd.Name))
	} else {
		tc.humanMessages = append(tc.humanMessages, msg)
		tc.appendProgress(fmt.Sprintf("💬 %s 说：%s", senderName, truncateStr(text, 100)))
	}
	tc.mu.Unlock()

	// 话题中 @bot 时触发 AI 回复
	if isMentionBot {
		go tc.handleBotMention(senderName, text)
	}
}

// handleBotMention 处理话题中 @bot 的消息，调用 LLM 生成回复并发送到话题
func (tc *TaskCoordinator) handleBotMention(senderName, text string) {
	if RunClaudeForTaskFunc == nil {
		slog.Warn("[task-coordinator] LLM not configured, cannot respond to @bot")
		return
	}

	tc.mu.Lock()
	rootMsgID := tc.instance.RootMessageID
	sessionID := tc.sessionID
	triggerText := tc.instance.TriggerContent

	// 收集上下文：已有的回复和消息
	var contextParts []string
	contextParts = append(contextParts, fmt.Sprintf("原始任务：%s", truncateStr(triggerText, 500)))
	for _, msgs := range tc.replyMessages {
		for _, m := range msgs {
			contextParts = append(contextParts, fmt.Sprintf("回复：%s", truncateStr(m.Text, 300)))
		}
	}
	for _, m := range tc.humanMessages {
		contextParts = append(contextParts, fmt.Sprintf("消息：%s", truncateStr(m.Text, 300)))
	}
	tc.mu.Unlock()

	prompt := fmt.Sprintf(`你是一个任务协调 Agent，正在协调一个团队处理问题。
以下是当前任务的上下文：
%s

现在 %s 在话题中 @你说：
%s

请根据上下文，直接回答他的问题或给出指导。回复要简洁专业。`, strings.Join(contextParts, "\n"), senderName, text)

	reply, sid, err := RunClaudeForTaskFunc(prompt, sessionID)
	if err != nil {
		slog.Warn("[task-coordinator] @bot response LLM failed", "err", err)
		return
	}

	tc.mu.Lock()
	tc.sessionID = sid
	tc.mu.Unlock()

	// 持久化 AI 回复
	tc.saveLocalMessage(sid, "assistant", reply)

	// 发送到话题
	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		slog.Warn("[task-coordinator] get token for @bot reply failed", "err", err)
		return
	}

	_, err = tc.sendThreadReplyText(token, rootMsgID, reply)
	if err != nil {
		slog.Warn("[task-coordinator] send @bot reply failed", "err", err)
	} else {
		slog.Info("[task-coordinator] @bot reply sent successfully", "sender", senderName)
	}
}

// onDebounceExpired 防抖超时后处理回复
func (tc *TaskCoordinator) onDebounceExpired(senderID string) {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	pd, ok := tc.pendingReplies[senderID]
	if !ok || pd.Replied {
		return
	}

	// 聚合所有消息
	msgs := tc.replyMessages[senderID]
	var parts []string
	for _, m := range msgs {
		parts = append(parts, m.Text)
	}
	finalReply := strings.Join(parts, "\n")

	pd.Replied = true
	tc.collectedReplies[senderID] = finalReply

	slog.Info("[task-coordinator] debounce expired, reply collected",
		"sender_id", senderID, "name", pd.Name, "reply_len", len(finalReply))

	tc.appendProgress(fmt.Sprintf("✅ %s 回复完成（%d 条消息）", pd.Name, len(msgs)))

	tc.checkAllRepliedLocked()
}

// checkAllRepliedLocked 检查当前轮是否所有目标都已回复
func (tc *TaskCoordinator) checkAllRepliedLocked() {
	allReplied := true
	for _, pd := range tc.pendingReplies {
		if !pd.Replied {
			allReplied = false
			break
		}
	}

	if !allReplied {
		return
	}

	slog.Info("[task-coordinator] all dispatched targets replied, invoking LLM judge",
		"root_msg", tc.instance.RootMessageID, "round", tc.instance.CurrentRound)

	// 所有人都回复了，调用 LLM 判断
	go tc.judgement()
}

// judgement LLM 判断任务是否完成
func (tc *TaskCoordinator) judgement() {
	tc.mu.Lock()
	// 构建上下文
	var contextParts []string
	contextParts = append(contextParts, "## 原始任务")
	contextParts = append(contextParts, tc.instance.TriggerContent)

	contextParts = append(contextParts, "\n## 本轮回复汇总")
	for openID, reply := range tc.collectedReplies {
		name := openID
		if pd, ok := tc.pendingReplies[openID]; ok {
			name = pd.Name + "（" + pd.Role + "）"
		}
		contextParts = append(contextParts, fmt.Sprintf("### %s\n%s", name, reply))
	}

	if len(tc.humanMessages) > 0 {
		contextParts = append(contextParts, "\n## 人类消息")
		for _, msg := range tc.humanMessages {
			contextParts = append(contextParts, fmt.Sprintf("- %s", msg.Text))
		}
	}

	accumulated := tc.instance.AccumulatedContext
	if accumulated != "" {
		contextParts = append(contextParts, "\n## 之前轮次的累积上下文\n"+accumulated)
	}
	tc.mu.Unlock()

	judgePrompt := buildJudgePrompt(strings.Join(contextParts, "\n"))

	tc.appendProgress("🤔 调度者正在分析回复结果...")

	if RunClaudeForTaskFunc == nil {
		slog.Error("[task-coordinator] RunClaudeForTaskFunc not set")
		tc.closeTask("LLM 未配置，无法判断")
		return
	}

	reply, sid, err := RunClaudeForTaskFunc(judgePrompt, tc.sessionID)
	if err != nil {
		slog.Error("[task-coordinator] LLM judge error", "err", err)
		tc.closeTask("LLM 调用失败: " + err.Error())
		return
	}
	tc.sessionID = sid

	// 解析 LLM 判断结果
	decision := parseLLMJudgeDecision(reply)

	slog.Info("[task-coordinator] LLM judge result",
		"decision", decision.Action, "summary", truncateStr(decision.Summary, 200))

	switch decision.Action {
	case "DONE":
		tc.appendProgress("🎉 任务已完成！")
		tc.closeTask(decision.Summary)
	case "DISPATCH":
		tc.mu.Lock()
		// 更新累积上下文
		tc.instance.AccumulatedContext = strings.Join(contextParts, "\n") + "\n\n## 调度者判断\n" + reply
		tc.instance.CurrentRound++

		if tc.instance.CurrentRound >= tc.instance.MaxRounds {
			tc.mu.Unlock()
			tc.appendProgress("⚠️ 已达最大轮次限制，强制结束")
			tc.closeTask("达到最大轮次限制（" + fmt.Sprintf("%d", tc.instance.MaxRounds) + " 轮），最终状态：\n" + reply)
			return
		}
		connDB.UpdateTaskInstance(tc.instance)
		tc.mu.Unlock()

		tc.appendProgress("📋 需要继续分发任务...")
		// 根据 LLM 决策重新分发
		tc.dispatchByDecision(decision)
	default:
		tc.appendProgress("📋 调度者分析结果：" + truncateStr(reply, 200))
		tc.closeTask(reply)
	}
}

// dispatchToTargets 已废弃，功能由 mentionTargets 替代

// dispatchByDecision 根据 LLM 判断结果重新分发（静默分析后 @ 新的人）
func (tc *TaskCoordinator) dispatchByDecision(decision LLMJudgeDecision) {
	allTargets := ParseDispatchTargets(tc.rule.DispatchTargets)

	if len(decision.NextTargets) == 0 {
		tc.mentionTargets(allTargets, decision.NextTask)
		return
	}

	targetMap := make(map[string]DispatchTarget)
	for _, t := range allTargets {
		targetMap[t.OpenID] = t
		targetMap[t.Name] = t
	}
	var targets []DispatchTarget
	for _, name := range decision.NextTargets {
		if t, ok := targetMap[name]; ok {
			targets = append(targets, t)
		}
	}
	if len(targets) == 0 {
		targets = allTargets
	}
	tc.mentionTargets(targets, decision.NextTask)
}

// closeTask 结束任务
func (tc *TaskCoordinator) closeTask(summary string) {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	if tc.instance.Status == "DONE" || tc.instance.Status == "ERROR" {
		return
	}

	// 停止所有计时器
	for _, timer := range tc.debounceTimers {
		timer.Stop()
	}
	if tc.globalTimeout != nil {
		tc.globalTimeout.Stop()
	}

	tc.instance.Status = "DONE"
	tc.instance.AccumulatedContext = summary
	connDB.UpdateTaskInstance(tc.instance)

	// 更新主卡片为已结案
	statusMD := fmt.Sprintf("**结案摘要**：\n%s", truncateStr(summary, 500))
	tc.patchMainCardFull(TaskStatusResolved, statusMD)

	// 发送结案消息到话题
	if tc.instance.RootMessageID != "" {
		token, _ := GetTenantToken(tc.appID, tc.appSecret)
		if token != "" {
			tc.sendThreadReplyText(token, tc.instance.RootMessageID,
				"✅ 任务已结案\n\n"+truncateStr(summary, 500))
		}
	}

	// 从全局注册表移除
	activeCoordinators.Delete(tc.instance.RootMessageID)
	tc.cancel()

	slog.Info("[task-coordinator] task closed",
		"id", tc.instance.ID, "root_msg", tc.instance.RootMessageID)
}

// setError 标记任务为错误状态
func (tc *TaskCoordinator) setError(errMsg string) {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	tc.instance.Status = "ERROR"
	tc.instance.ErrorMsg = errMsg
	connDB.UpdateTaskInstance(tc.instance)

	if tc.instance.RootMessageID != "" {
		activeCoordinators.Delete(tc.instance.RootMessageID)
	}
	tc.cancel()
}

// onGlobalTimeout 全局超时处理
func (tc *TaskCoordinator) onGlobalTimeout() {
	slog.Warn("[task-coordinator] global timeout",
		"id", tc.instance.ID, "root_msg", tc.instance.RootMessageID,
		"timeout_min", tc.instance.ReplyTimeoutMinutes)

	tc.appendProgress("⏰ 任务超时，正在结案...")

	// 收集已有的回复
	tc.mu.Lock()
	var parts []string
	for openID, reply := range tc.collectedReplies {
		name := openID
		if pd, ok := tc.pendingReplies[openID]; ok {
			name = pd.Name
		}
		parts = append(parts, fmt.Sprintf("%s: %s", name, truncateStr(reply, 200)))
	}
	for openID, pd := range tc.pendingReplies {
		if !pd.Replied {
			parts = append(parts, fmt.Sprintf("%s: 未回复（超时）", pd.Name))
			_ = openID
		}
	}
	tc.mu.Unlock()

	summary := "任务超时自动结案。\n\n已收到的回复：\n" + strings.Join(parts, "\n")
	tc.closeTask(summary)
}

// ── LLM 提示词 ──────────────────────────────────────────────

func buildInitialAnalysisPrompt(triggerText, senderName string, targets []DispatchTarget) string {
	var targetDesc []string
	for _, t := range targets {
		targetDesc = append(targetDesc, fmt.Sprintf("- %s（%s）", t.Name, t.Role))
	}

	return fmt.Sprintf(`你是一个任务协调 AI，负责分析用户反馈并制定分派计划。

## 任务信息
- 触发者：%s
- 反馈内容：%s

## 可用的协作成员
%s

## 要求
1. 简要分析问题
2. 制定分派计划：决定需要哪些成员参与排查
3. 为每个需要参与的成员生成任务描述

请用简洁的中文回复你的分析和分派计划。`, senderName, triggerText, strings.Join(targetDesc, "\n"))
}

func buildInitialAnalysisPromptV2(triggerText, senderName string, targets []DispatchTarget) string {
	var targetDesc []string
	for _, t := range targets {
		targetDesc = append(targetDesc, fmt.Sprintf("- %s（角色：%s，open_id：%s）", t.Name, t.Role, t.OpenID))
	}

	return fmt.Sprintf(`你是飞书群内的任务协调 AI。请分析以下问题，简洁地输出分析和分派决策。

## 问题信息
触发者：%s
内容：
%s

## 群内可用成员
%s

## 输出要求
1. **告警分析**：用 2-3 句话描述问题本质和影响
2. **分派计划**：用表格列出每个成员是否需要参与及理由
3. 最后输出一个 JSON 块，只包含需要参与的成员：

`+"```json"+`
{"participants": [{"name": "成员名", "open_id": "open_id值", "reason": "参与理由"}]}
`+"```"+`

注意：
- 只 @ 真正需要参与的人，与问题无关的角色不要参与
- 保持简洁，不要啰嗦`, senderName, triggerText, strings.Join(targetDesc, "\n"))
}

func buildJudgePrompt(context string) string {
	return fmt.Sprintf(`你是一个任务协调 AI，需要判断任务是否已完成或需要继续分发。

## 当前上下文
%s

## 判断规则
1. 如果已经收集到足够信息可以得出结论，回复 JSON：
   {"action": "DONE", "summary": "结案摘要"}
2. 如果还需要更多信息，回复 JSON：
   {"action": "DISPATCH", "summary": "当前进展摘要", "next_task": "下一步任务描述", "next_targets": ["目标名称1"]}
3. summary 必须包含所有已知信息的汇总

请只回复 JSON，不要添加其他内容。`, context)
}

// LLMJudgeDecision LLM 判断结果
type LLMJudgeDecision struct {
	Action      string   `json:"action"`
	Summary     string   `json:"summary"`
	NextTask    string   `json:"next_task"`
	NextTargets []string `json:"next_targets"`
}

func parseLLMJudgeDecision(reply string) LLMJudgeDecision {
	reply = strings.TrimSpace(reply)
	// 尝试提取 JSON
	var decision LLMJudgeDecision

	// 直接解析
	if err := json.Unmarshal([]byte(reply), &decision); err == nil {
		return decision
	}

	// 尝试从代码围栏中提取
	if idx := strings.Index(reply, "{"); idx >= 0 {
		if endIdx := strings.LastIndex(reply, "}"); endIdx > idx {
			jsonStr := reply[idx : endIdx+1]
			if err := json.Unmarshal([]byte(jsonStr), &decision); err == nil {
				return decision
			}
		}
	}

	// 解析失败，默认结束
	return LLMJudgeDecision{
		Action:  "DONE",
		Summary: reply,
	}
}

// ── 进度管理 ────────────────────────────────────────────────

// appendProgress 记录进度并实时 patch 主卡片（不再发独立进度卡片到话题）
func (tc *TaskCoordinator) appendProgress(line string) {
	tc.mu.Lock()
	ts := time.Now().Format("15:04:05")
	tc.progressLines = append(tc.progressLines, fmt.Sprintf("[%s] %s", ts, line))
	tc.mu.Unlock()

	// 只 patch 主卡片进度，不发话题内进度卡片
	go tc.patchMainCard(TaskStatusInvestigating)
}

// ── 初始 LLM 分析 ──────────────────────────────────────────

// doInitialAnalysisAndDispatch LLM 分析后只 @ 需要参与的人
func (tc *TaskCoordinator) doInitialAnalysisAndDispatch(triggerText, senderName string) {
	targets := ParseDispatchTargets(tc.rule.DispatchTargets)
	prompt := buildInitialAnalysisPromptV2(triggerText, senderName, targets)

	if RunClaudeForTaskFunc == nil {
		slog.Warn("[task-coordinator] LLM not configured, dispatching to all targets")
		tc.updateStreamingContent("LLM 未配置，直接通知所有成员。")
		tc.mentionTargets(targets, triggerText)
		return
	}

	reply, sid, err := RunClaudeForTaskFunc(prompt, tc.sessionID)
	if err != nil {
		slog.Warn("[task-coordinator] initial analysis failed", "err", err)
		tc.updateStreamingContent("分析失败：" + err.Error())
		tc.mentionTargets(targets, triggerText)
		return
	}
	tc.sessionID = sid

	// 更新流式卡片展示分析结果
	tc.updateStreamingContent(reply)

	// 持久化分析结果到灵犀本地会话
	tc.saveLocalMessage(tc.sessionID, "assistant", reply)

	// 解析 LLM 决定谁需要参与
	decision := parseDispatchDecision(reply, targets)

	if len(decision) == 0 {
		slog.Info("[task-coordinator] LLM decided no one needs to be involved")
		tc.patchMainCardProgress("分析完成，无需协调")
		return
	}

	// 只 @ 需要参与的人（普通文本消息）
	tc.mentionTargets(decision, triggerText)

	tc.patchMainCardProgress(fmt.Sprintf("已通知 %d 人协助排查", len(decision)))
}

// mentionTargets 向需要参与的人发送 @mention 普通文本消息
func (tc *TaskCoordinator) mentionTargets(targets []DispatchTarget, taskContext string) {
	if len(targets) == 0 {
		return
	}

	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		slog.Error("[task-coordinator] get token for mention failed", "err", err)
		return
	}

	rootMsgID := tc.instance.RootMessageID

	tc.mu.Lock()
	tc.pendingReplies = make(map[string]*PendingDispatch)
	tc.replyMessages = make(map[string][]ReplyMessage)
	tc.collectedReplies = make(map[string]string)
	for _, timer := range tc.debounceTimers {
		timer.Stop()
	}
	tc.debounceTimers = make(map[string]*time.Timer)
	tc.instance.Status = "DISPATCHED"
	connDB.UpdateTaskInstance(tc.instance)
	tc.mu.Unlock()

	for _, target := range targets {
		tc.mu.Lock()
		tc.pendingReplies[target.OpenID] = &PendingDispatch{
			OpenID:   target.OpenID,
			Name:     target.Name,
			Role:     target.Role,
			TaskDesc: taskContext,
			SentAt:   time.Now(),
		}
		tc.mu.Unlock()

		atText := BuildDispatchTextMessage(target.OpenID, target.Name,
			fmt.Sprintf("请协助排查：\n%s", truncateStr(taskContext, 500)))
		_, err := tc.sendThreadReplyText(token, rootMsgID, atText)
		if err != nil {
			slog.Warn("[task-coordinator] send @mention failed", "target", target.Name, "err", err)
		} else {
			slog.Info("[task-coordinator] @mentioned", "target", target.Name, "role", target.Role)
		}
	}

	tc.patchMainCard(TaskStatusInvestigating)

	tc.mu.Lock()
	tc.instance.Status = "MONITORING"
	connDB.UpdateTaskInstance(tc.instance)
	tc.mu.Unlock()
}

// patchMainCardProgress 更新主卡片进度文本
func (tc *TaskCoordinator) patchMainCardProgress(progress string) {
	tc.mu.Lock()
	tc.progressLines = append(tc.progressLines, fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), progress))
	tc.mu.Unlock()
	tc.patchMainCard(TaskStatusInvestigating)
}

// updateStreamingContent 更新流式卡片内容
func (tc *TaskCoordinator) updateStreamingContent(content string) {
	tc.mu.Lock()
	cardID := tc.streamingCardID
	elementID := tc.streamingElementID
	tc.streamingSequence++
	seq := tc.streamingSequence
	tc.mu.Unlock()

	if cardID == "" {
		return
	}

	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		return
	}

	body, _ := json.Marshal(map[string]interface{}{
		"content":  content,
		"sequence": seq,
	})

	url := fmt.Sprintf("https://open.feishu.cn/open-apis/cardkit/v1/cards/%s/elements/%s/content", cardID, elementID)
	req, _ := http.NewRequest("PUT", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("[task-coordinator] update streaming element failed", "err", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		slog.Warn("[task-coordinator] update streaming element error",
			"status", resp.StatusCode, "body", string(respBody))
	}
}

// ── 飞书 API 包装 ──────────────────────────────────────────

// sendMainCard 发送主卡片到群聊，返回 message_id
func (tc *TaskCoordinator) sendMainCard(chatID, cardJSON string) (string, error) {
	slog.Info("[task-coordinator] sendMainCard called", "chatID", chatID, "cardJSONLen", len(cardJSON))

	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		slog.Error("[task-coordinator] sendMainCard: get token failed", "err", err)
		return "", err
	}

	body, _ := json.Marshal(map[string]string{
		"receive_id": chatID,
		"msg_type":   "interactive",
		"content":    cardJSON,
	})

	url := "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id"
	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("[task-coordinator] sendMainCard: http request failed", "err", err)
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	slog.Info("[task-coordinator] sendMainCard response", "status", resp.StatusCode,
		"body", truncateStr(string(respBody), 500))

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}
	if result.Code != 0 {
		return "", fmt.Errorf("send main card: code=%d msg=%s", result.Code, result.Msg)
	}
	slog.Info("[task-coordinator] sendMainCard success", "messageID", result.Data.MessageID)
	return result.Data.MessageID, nil
}

// patchMainCard 更新主卡片状态
func (tc *TaskCoordinator) patchMainCard(status TaskMainCardStatus) {
	tc.mu.Lock()
	title := "任务协调｜" + truncateStr(tc.instance.TriggerContent, 30)
	subtitle := fmt.Sprintf("来自 %s · 灵犀 Agent Teams", tc.instance.TriggerSenderName)
	summaryMD := fmt.Sprintf("**用户反馈**：%s\n\n**来源**：%s",
		tc.instance.TriggerContent, tc.instance.TriggerSenderName)
	statusMD := "**进展**：\n"
	for _, line := range tc.progressLines {
		statusMD += "- " + line + "\n"
	}
	rootMsgID := tc.instance.RootMessageID
	tc.mu.Unlock()

	cardJSON := BuildTaskMainCardUpdate(title, subtitle, summaryMD, statusMD, status)
	tc.doPatchMainCard(rootMsgID, cardJSON)
}

// patchMainCardFull 更新主卡片（完整控制）
func (tc *TaskCoordinator) patchMainCardFull(status TaskMainCardStatus, statusMD string) {
	title := "任务协调｜" + truncateStr(tc.instance.TriggerContent, 30)
	subtitle := fmt.Sprintf("来自 %s · 灵犀 Agent Teams", tc.instance.TriggerSenderName)
	summaryMD := fmt.Sprintf("**用户反馈**：%s\n\n**来源**：%s",
		tc.instance.TriggerContent, tc.instance.TriggerSenderName)

	cardJSON := BuildTaskMainCardUpdate(title, subtitle, summaryMD, statusMD, status)
	tc.doPatchMainCard(tc.instance.RootMessageID, cardJSON)
}

func (tc *TaskCoordinator) doPatchMainCard(msgID, cardJSON string) {
	if msgID == "" {
		return
	}
	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		return
	}

	body, _ := json.Marshal(map[string]string{
		"msg_type": "interactive",
		"content":  cardJSON,
	})
	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s", msgID)
	req, _ := http.NewRequest("PATCH", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("[task-coordinator] patch main card failed", "err", err)
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	slog.Info("[task-coordinator] patch main card", "msg_id", msgID,
		"status", resp.StatusCode, "resp", truncateStr(string(respBody), 200))
}

// createStreamingCardEntity 创建流式卡片实体
func (tc *TaskCoordinator) createStreamingCardEntity(cardJSON string) (string, error) {
	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		return "", err
	}

	body, _ := json.Marshal(map[string]string{
		"type": "card_json",
		"data": cardJSON,
	})
	req, _ := http.NewRequest("POST", "https://open.feishu.cn/open-apis/cardkit/v1/cards", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			CardID string `json:"card_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}
	if result.Code != 0 {
		return "", fmt.Errorf("create card: code=%d msg=%s", result.Code, result.Msg)
	}
	return result.Data.CardID, nil
}

// sendThreadReplyCard 将卡片作为话题回复发送（reply_in_thread=true）
func (tc *TaskCoordinator) sendThreadReplyCard(rootMsgID, cardID string) (msgID, threadID string, err error) {
	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		return "", "", err
	}

	content, _ := json.Marshal(map[string]interface{}{
		"type": "card",
		"data": map[string]string{"card_id": cardID},
	})
	body, _ := json.Marshal(map[string]interface{}{
		"content":         string(content),
		"msg_type":        "interactive",
		"reply_in_thread": true,
	})

	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s/reply", rootMsgID)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
			ThreadID  string `json:"thread_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", "", err
	}
	if result.Code != 0 {
		return "", "", fmt.Errorf("send thread reply card: code=%d msg=%s", result.Code, result.Msg)
	}
	return result.Data.MessageID, result.Data.ThreadID, nil
}

// sendThreadReplyText 在话题内发送文本消息
func (tc *TaskCoordinator) sendThreadReplyText(token, rootMsgID, text string) (string, error) {
	content, _ := json.Marshal(map[string]string{"text": text})
	body, _ := json.Marshal(map[string]interface{}{
		"content":         string(content),
		"msg_type":        "text",
		"reply_in_thread": true,
	})

	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s/reply", rootMsgID)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}
	if result.Code != 0 {
		return "", fmt.Errorf("send thread reply text: code=%d msg=%s", result.Code, result.Msg)
	}
	return result.Data.MessageID, nil
}

// sendThreadReplyInteractiveCard 在话题内发送普通交互卡片
func (tc *TaskCoordinator) sendThreadReplyInteractiveCard(token, rootMsgID, cardJSON string) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"content":         cardJSON,
		"msg_type":        "interactive",
		"reply_in_thread": true,
	})

	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s/reply", rootMsgID)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}
	if result.Code != 0 {
		return "", fmt.Errorf("send thread reply interactive: code=%d msg=%s", result.Code, result.Msg)
	}
	return result.Data.MessageID, nil
}

// patchMessage PATCH 更新消息（用于进度卡片更新）
func (tc *TaskCoordinator) patchMessage(token, msgID, cardJSON string) {
	body, _ := json.Marshal(map[string]string{
		"msg_type": "interactive",
		"content":  cardJSON,
	})
	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s", msgID)
	req, _ := http.NewRequest("PATCH", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("[task-coordinator] patch message failed", "msg_id", msgID, "err", err)
		return
	}
	resp.Body.Close()
}

// ── 灵犀本地会话管理 ────────────────────────────────────────

// createLocalSession 创建灵犀本地会话
func (tc *TaskCoordinator) createLocalSession(title string, connectorID int64) int64 {
	id, err := connDB.CreateSessionRaw(title)
	if err != nil {
		slog.Warn("[task-coordinator] create local session failed", "err", err)
		return 0
	}
	slog.Info("[task-coordinator] local session created", "id", id, "title", title)
	return id
}

// saveLocalMessage 保存消息到灵犀本地会话
func (tc *TaskCoordinator) saveLocalMessage(sessionID int64, role, content string) {
	if sessionID == 0 {
		return
	}
	err := connDB.InsertMessageRaw(sessionID, role, content)
	if err != nil {
		slog.Warn("[task-coordinator] save local message failed", "err", err)
	}
}

// pollThreadMessages 定期轮询话题消息并持久化到灵犀本地会话
func (tc *TaskCoordinator) pollThreadMessages() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	lastSeenMsgID := ""

	for {
		select {
		case <-tc.ctx.Done():
			return
		case <-ticker.C:
			msgs, err := tc.fetchThreadMessages()
			if err != nil {
				slog.Warn("[task-coordinator] poll thread messages failed", "err", err)
				continue
			}
			for _, msg := range msgs {
				if msg.MsgID == lastSeenMsgID {
					continue
				}
				// 跳过已见过的消息
				if lastSeenMsgID != "" {
					found := false
					for _, m := range msgs {
						if m.MsgID == lastSeenMsgID {
							found = true
							continue
						}
						if found {
							role := "user"
							if m.SenderID == tc.getBotOpenID() {
								role = "assistant"
							}
							tc.saveLocalMessage(tc.sessionID, role, fmt.Sprintf("[%s] %s", m.SenderID, m.Text))
						}
					}
					if found {
						lastSeenMsgID = msgs[len(msgs)-1].MsgID
					}
					break
				}
				// 首次：保存所有消息
				role := "user"
				if msg.SenderID == tc.getBotOpenID() {
					role = "assistant"
				}
				tc.saveLocalMessage(tc.sessionID, role, fmt.Sprintf("[%s] %s", msg.SenderID, msg.Text))
			}
			if len(msgs) > 0 {
				lastSeenMsgID = msgs[len(msgs)-1].MsgID
			}
		}
	}
}

// fetchThreadMessages 获取主消息下的话题回复列表
func (tc *TaskCoordinator) fetchThreadMessages() ([]ReplyMessage, error) {
	rootMsgID := tc.instance.RootMessageID
	if rootMsgID == "" {
		return nil, nil
	}
	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages/%s/reply?page_size=50", rootMsgID)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			Items []struct {
				MessageID string `json:"message_id"`
				MsgType   string `json:"msg_type"`
				Body      struct {
					Content string `json:"content"`
				} `json:"body"`
				Sender struct {
					ID string `json:"id"`
				} `json:"sender"`
			} `json:"items"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}
	if result.Code != 0 {
		return nil, fmt.Errorf("list thread replies: code=%d msg=%s", result.Code, result.Msg)
	}

	var msgs []ReplyMessage
	for _, item := range result.Data.Items {
		text := item.Body.Content
		var textObj struct{ Text string `json:"text"` }
		if json.Unmarshal([]byte(text), &textObj) == nil && textObj.Text != "" {
			text = textObj.Text
		}
		msgs = append(msgs, ReplyMessage{
			SenderID:  item.Sender.ID,
			Text:      text,
			MsgID:     item.MessageID,
			Timestamp: time.Now(),
		})
	}
	return msgs, nil
}

func (tc *TaskCoordinator) getBotOpenID() string {
	if tc.connector != nil {
		return tc.connector.botOpenID
	}
	return ""
}

// ── 分发决策解析 ────────────────────────────────────────────

// parseDispatchDecision 从 LLM 分析结果中提取需要参与的成员
func parseDispatchDecision(reply string, allTargets []DispatchTarget) []DispatchTarget {
	// 尝试提取 JSON 格式的分派决策
	type dispatchJSON struct {
		Participants []struct {
			Name   string `json:"name"`
			OpenID string `json:"open_id"`
			Reason string `json:"reason"`
		} `json:"participants"`
	}

	var dj dispatchJSON
	// 尝试从回复中提取 JSON
	if idx := strings.Index(reply, "{"); idx >= 0 {
		if endIdx := strings.LastIndex(reply, "}"); endIdx > idx {
			json.Unmarshal([]byte(reply[idx:endIdx+1]), &dj)
		}
	}

	if len(dj.Participants) > 0 {
		nameMap := make(map[string]DispatchTarget)
		for _, t := range allTargets {
			nameMap[t.Name] = t
			nameMap[t.OpenID] = t
		}
		var result []DispatchTarget
		for _, p := range dj.Participants {
			if t, ok := nameMap[p.Name]; ok {
				result = append(result, t)
			} else if t, ok := nameMap[p.OpenID]; ok {
				result = append(result, t)
			}
		}
		if len(result) > 0 {
			return result
		}
	}

	// JSON 解析失败，通过文本匹配：如果提到"不参与"/"不需要"，则排除
	var result []DispatchTarget
	replyLower := strings.ToLower(reply)
	for _, t := range allTargets {
		excluded := false
		// 检查是否明确排除了该成员
		nameIdx := strings.Index(replyLower, strings.ToLower(t.Name))
		if nameIdx >= 0 {
			surrounding := ""
			start := nameIdx - 20
			if start < 0 {
				start = 0
			}
			end := nameIdx + len(t.Name) + 30
			if end > len(replyLower) {
				end = len(replyLower)
			}
			surrounding = replyLower[start:end]
			excludeKeywords := []string{"不参与", "不需要", "❌", "无需", "暂不"}
			for _, kw := range excludeKeywords {
				if strings.Contains(surrounding, kw) {
					excluded = true
					break
				}
			}
		}
		if !excluded {
			result = append(result, t)
		}
	}
	return result
}

// PullThreadHistory 拉取话题历史消息（用于崩溃恢复）
func (tc *TaskCoordinator) PullThreadHistory() ([]ReplyMessage, error) {
	token, err := GetTenantToken(tc.appID, tc.appSecret)
	if err != nil {
		return nil, err
	}

	// 使用 GET /im/v1/messages 按 container_id (chat_id) + thread 查询
	// 实际实现中可能需要遍历话题内消息
	url := fmt.Sprintf("https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=%s&page_size=50&sort_type=ByCreateTimeAsc",
		tc.instance.TargetChatID)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			Items []struct {
				MessageID string `json:"message_id"`
				RootID    string `json:"root_id"`
				MsgType   string `json:"msg_type"`
				Body      struct {
					Content string `json:"content"`
				} `json:"body"`
				Sender struct {
					ID string `json:"id"`
				} `json:"sender"`
				CreateTime string `json:"create_time"`
			} `json:"items"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	var msgs []ReplyMessage
	rootMsgID := tc.instance.RootMessageID
	for _, item := range result.Data.Items {
		if item.RootID != rootMsgID {
			continue
		}
		text := item.Body.Content
		// 尝试解析文本消息
		var textObj struct {
			Text string `json:"text"`
		}
		if json.Unmarshal([]byte(text), &textObj) == nil && textObj.Text != "" {
			text = textObj.Text
		}

		msgs = append(msgs, ReplyMessage{
			SenderID:  item.Sender.ID,
			Text:      text,
			MsgID:     item.MessageID,
			Timestamp: time.Now(),
		})
	}
	return msgs, nil
}

// CloseByAPI 通过 API 手动关闭任务
func (tc *TaskCoordinator) CloseByAPI(summary string) {
	if summary == "" {
		summary = "手动关闭"
	}
	tc.closeTask(summary)
}
