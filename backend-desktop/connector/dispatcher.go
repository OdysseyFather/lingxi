package connector

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"lingxi-agent/db"
)

// ClaudeRunner 是调用 Claude 的函数签名，由外部注入以避免循环依赖
type ClaudeRunner func(message string, sessionID int64) (reply string, usedSessionID int64, err error)

// ClaudeStreamRunner 是流式调用 Claude 的函数签名。
// onChunk 每次收到文本增量时调用，done=true 表示生成结束。
type ClaudeStreamRunner func(message string, sessionID int64, onChunk func(chunk string, done bool)) (usedSessionID int64, err error)

// ClaudeRunnerCtx 带 context 的 ClaudeRunner，支持中途取消
type ClaudeRunnerCtx func(ctx context.Context, message string, sessionID int64) (reply string, usedSessionID int64, err error)

// ClaudeStreamRunnerCtx 带 context 的流式 ClaudeRunner
type ClaudeStreamRunnerCtx func(ctx context.Context, message string, sessionID int64, onChunk func(chunk string, done bool)) (usedSessionID int64, err error)

// ClaudeStreamRunnerCtxExt 扩展版流式 runner，支持 kind 区分事件类型
type ClaudeStreamRunnerCtxExt func(ctx context.Context, message string, sessionID int64, onEvent func(kind StreamKind, payload string, done bool)) (usedSessionID int64, err error)

var runClaude ClaudeRunner
var runClaudeStream ClaudeStreamRunner
var runClaudeCtx ClaudeRunnerCtx
var runClaudeStreamCtx ClaudeStreamRunnerCtx
var runClaudeStreamCtxExt ClaudeStreamRunnerCtxExt

// SetClaudeRunner 由 main 包在启动时注入 handler.RunClaudeSync
func SetClaudeRunner(fn ClaudeRunner) {
	runClaude = fn
}

// SetClaudeStreamRunner 由 main 包在启动时注入 handler.RunClaudeStreaming
func SetClaudeStreamRunner(fn ClaudeStreamRunner) {
	runClaudeStream = fn
}

// SetClaudeRunnerCtx 注入带 context 的同步 runner（支持打断）
func SetClaudeRunnerCtx(fn ClaudeRunnerCtx) {
	runClaudeCtx = fn
}

// SetClaudeStreamRunnerCtx 注入带 context 的流式 runner（支持打断）
func SetClaudeStreamRunnerCtx(fn ClaudeStreamRunnerCtx) {
	runClaudeStreamCtx = fn
}

// SetClaudeStreamRunnerCtxExt 注入扩展版流式 runner（支持 thinking/tool 事件）
func SetClaudeStreamRunnerCtxExt(fn ClaudeStreamRunnerCtxExt) {
	runClaudeStreamCtxExt = fn
}

// activeTask 记录正在执行的任务的 cancel 函数
var (
	activeMu    sync.Mutex
	activeTasks = make(map[string]context.CancelFunc) // scopeKey -> cancelFunc
)

// cancelActiveTask 取消指定 scope 的正在执行的任务
func cancelActiveTask(scopeKey string) {
	if cancel, ok := activeTasks[scopeKey]; ok {
		slog.Info("[dispatch] cancelling active task", "scope", scopeKey)
		cancel()
		delete(activeTasks, scopeKey)
	}
}

// Dispatch 接收来自任意平台的 IMMessage，立即回复"收到"，
// 然后在后台 goroutine 中调用 Claude 并发送完整结果。
// 如果同一 scope 有正在进行的任务，新消息会打断旧任务。
func Dispatch(msg IMMessage) {
	if strings.TrimSpace(msg.Text) == "" {
		return
	}
	if runClaude == nil && runClaudeCtx == nil {
		slog.Info("ClaudeRunner not set, dropping message")
		return
	}

	// @所有人 消息过滤：如果配置不回复 @所有人 且当前消息为 @所有人 触发，则静默丢弃
	if msg.IsMentionAll && !msg.BaseCfg.ReplyToMentionAll {
		slog.Info("[dispatch] skipping @all message (reply_to_mention_all=false)",
			"platform", msg.Platform, "user", msg.UserID, "conv", msg.ConversationID)
		return
	}

	cfg := msg.BaseCfg
	if cfg.SessionMode == "" {
		cfg.SessionMode = SessionModePerGroup
	}

	// 提前计算 scopeKey，用于打断检测
	scopeKey := computeScopeKey(msg, cfg.SessionMode)

	// 打断已有任务
	activeMu.Lock()
	cancelActiveTask(scopeKey)
	ctx, cancel := context.WithCancel(context.Background())
	if scopeKey != "" {
		activeTasks[scopeKey] = cancel
	}
	activeMu.Unlock()

	// 判断是否走流式路径
	hasStream := msg.StreamCallback != nil || msg.StreamReplyFunc != nil

	// 非流式模式下立即回复"收到"
	if !hasStream {
		if msg.ReplyFunc != nil {
			if err := msg.ReplyFunc("收到，正在为您分析问题，请稍候..."); err != nil {
				slog.Warn("ack reply error", "err", err)
			}
		}
	}

	go func() {
		defer func() {
			cancel()
			activeMu.Lock()
			delete(activeTasks, scopeKey)
			activeMu.Unlock()
		}()

		if cfg.SessionTTLHours == 0 && cfg.SessionMode != SessionModeStateless {
			cfg.SessionTTLHours = 24
		}

		// 构建 IM 来源上下文，注入到用户消息前面
		messageText := buildIMContextPrefix(msg) + msg.Text

		slog.Info("dispatch platform= mode= scope", "platform", msg.Platform, "session_mode", cfg.SessionMode, "value", scopeKey)

		var sessionID int64
		if cfg.SessionMode != SessionModeStateless {
			title := buildSessionTitle(msg)
			sid, err := db.GetOrCreateIMSession(msg.Platform, scopeKey, title, cfg.SessionTTLHours, msg.AgentID)
			if err != nil {
				slog.Warn("GetOrCreateIMSession error", "err", err)
				if msg.ReplyFunc != nil {
					_ = msg.ReplyFunc("抱歉，初始化会话失败，请稍后再试。")
				}
				return
			}
			sessionID = sid
		}

		// 流式路径（优先 StreamCallback，回退 StreamReplyFunc）
		if hasStream {
			var streamErr error

			if msg.StreamCallback != nil && runClaudeStreamCtxExt != nil {
				// 扩展路径：thinking/tool/text 全部透传
				_, streamErr = runClaudeStreamCtxExt(ctx, messageText, sessionID, func(kind StreamKind, payload string, done bool) {
					if ctx.Err() != nil {
						return
					}
					if err := msg.StreamCallback(kind, payload, done); err != nil {
						slog.Warn("[dispatch] StreamCallback error", "kind", kind, "err", err)
					}
				})
			} else {
				// 兼容路径：仅转发 text
				onChunk := func(chunk string, done bool) {
					if ctx.Err() != nil {
						return
					}
					if msg.StreamCallback != nil {
						if err := msg.StreamCallback(KindText, chunk, done); err != nil {
							slog.Warn("[dispatch] StreamCallback error", "err", err)
						}
					} else if msg.StreamReplyFunc != nil {
						if err := msg.StreamReplyFunc(chunk, done); err != nil {
							slog.Warn("[dispatch] StreamReplyFunc error", "err", err)
						}
					}
				}

			if runClaudeStreamCtx != nil {
				_, streamErr = runClaudeStreamCtx(ctx, messageText, sessionID, onChunk)
			} else if runClaudeStream != nil {
				_, streamErr = runClaudeStream(messageText, sessionID, onChunk)
				}
			}

			if streamErr != nil && ctx.Err() == nil {
				slog.Warn("RunClaudeStreaming error", "err", streamErr)
				if msg.ReplyFunc != nil {
					_ = msg.ReplyFunc("抱歉，处理消息时出现错误，请稍后再试。")
				}
			}
			if cfg.SessionMode != SessionModeStateless && scopeKey != "" {
				db.TouchIMSession(msg.Platform, scopeKey)
			}
			return
		}

		// 非流式路径
		var finalReply string
		if runClaudeCtx != nil {
			reply, _, err := runClaudeCtx(ctx, messageText, sessionID)
			if err != nil {
				if ctx.Err() != nil {
					slog.Info("[dispatch] task cancelled", "scope", scopeKey)
					return
				}
				slog.Warn("RunClaudeSync error", "err", err)
				if msg.ReplyFunc != nil {
					_ = msg.ReplyFunc("抱歉，处理消息时出现错误，请稍后再试。")
				}
				return
			}
			if ctx.Err() != nil {
				return
			}
			finalReply = filterStateMarkers(reply)
			if finalReply == "" {
				finalReply = "好的，已处理完成。"
			}
			if msg.ReplyFunc != nil {
				if err := msg.ReplyFunc(finalReply); err != nil {
					slog.Warn("ReplyFunc error", "err", err)
				}
			}
		} else {
			reply, _, err := runClaude(messageText, sessionID)
			if err != nil {
				slog.Warn("RunClaudeSync error", "err", err)
				if msg.ReplyFunc != nil {
					_ = msg.ReplyFunc("抱歉，处理消息时出现错误，请稍后再试。")
				}
				return
			}
			if ctx.Err() != nil {
				return
			}
			finalReply = filterStateMarkers(reply)
			if finalReply == "" {
				finalReply = "好的，已处理完成。"
			}
			if msg.ReplyFunc != nil {
				if err := msg.ReplyFunc(finalReply); err != nil {
					slog.Warn("ReplyFunc error", "err", err)
				}
			}
		}

		if cfg.SessionMode != SessionModeStateless && scopeKey != "" {
			db.TouchIMSession(msg.Platform, scopeKey)
		}
	}()
}

// computeScopeKey 根据 session_mode 计算会话的唯一键
func computeScopeKey(msg IMMessage, mode SessionMode) string {
	switch mode {
	case SessionModePerGroup:
		return msg.ConversationID
	case SessionModePerUser:
		return msg.UserID
	case SessionModePerGroupUser:
		return fmt.Sprintf("%s:%s", msg.ConversationID, msg.UserID)
	default:
		return ""
	}
}

// buildSessionTitle 为新建 session 生成标题
func buildSessionTitle(msg IMMessage) string {
	title := fmt.Sprintf("[%s] %s", msg.Platform, msg.ConversationID)
	runes := []rune(title)
	if len(runes) > 30 {
		return string(runes[:30]) + "…"
	}
	return title
}

// buildIMContextPrefix 构建 IM 消息来源上下文前缀，注入到用户消息前面。
// AI 可以据此知道消息来自哪个平台、哪个群、谁发送的。
func buildIMContextPrefix(msg IMMessage) string {
	var parts []string

	// 平台名称映射
	platformName := msg.Platform
	switch msg.Platform {
	case "dingtalk":
		platformName = "钉钉"
	case "feishu":
		platformName = "飞书"
	case "wecom":
		platformName = "企业微信"
	}
	parts = append(parts, "平台: "+platformName)

	// 会话类型
	switch msg.ConvType {
	case "group":
		parts = append(parts, "消息类型: 群聊消息")
	case "private":
		parts = append(parts, "消息类型: 私聊消息")
	}

	// 群名
	if msg.ConvTitle != "" {
		parts = append(parts, "群名: "+msg.ConvTitle)
	}

	// 群/会话 ID
	if msg.ConversationID != "" {
		parts = append(parts, "会话ID: "+msg.ConversationID)
	}

	// 发送者
	if msg.UserName != "" {
		parts = append(parts, "发送者: "+msg.UserName)
	}
	if msg.UserID != "" {
		parts = append(parts, "发送者ID: "+msg.UserID)
	}

	if len(parts) == 0 {
		return ""
	}

	return "[IM消息来源] " + strings.Join(parts, " | ") + "\n\n"
}

// filterStateMarkers 移除 AI 输出中的内部状态标记 JSON 片段
func filterStateMarkers(text string) string {
	var result strings.Builder
	remaining := text
	for {
		idx := strings.Index(remaining, "{")
		if idx < 0 {
			result.WriteString(remaining)
			break
		}
		result.WriteString(remaining[:idx])
		depth, end := 0, -1
		for i := idx; i < len(remaining); i++ {
			switch remaining[i] {
			case '{':
				depth++
			case '}':
				depth--
				if depth == 0 {
					end = i
				}
			}
			if end >= 0 {
				break
			}
		}
		if end < 0 {
			result.WriteString(remaining[idx:])
			break
		}
		fragment := remaining[idx : end+1]
		if strings.Contains(fragment, `"state"`) {
			remaining = remaining[end+1:]
			continue
		}
		result.WriteString(fragment)
		remaining = remaining[end+1:]
	}
	return strings.TrimSpace(result.String())
}
