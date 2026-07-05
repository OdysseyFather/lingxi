package mysql

import (
	"context"
	"database/sql"
	"time"
)

// ─── 飞书监听模式 ───────────────────────────────────────────────

type FeishuMonitorRule struct {
	ID                   int64  `json:"id"`
	UserID               int64  `json:"user_id"`
	ConnectorID          int64  `json:"connector_id"`
	Name                 string `json:"name"`
	Enabled              bool   `json:"enabled"`
	ChatIDs              string `json:"chat_ids"`
	SenderIDs            string `json:"sender_ids"`
	ExcludeBotMsg        bool   `json:"exclude_bot_msg"`
	MsgTypes             string `json:"msg_types"`
	Keywords             string `json:"keywords"`
	KeywordMode          string `json:"keyword_mode"`
	ActionType           string `json:"action_type"`
	ActionTarget         string `json:"action_target"`
	CustomPrompt         string `json:"custom_prompt"`
	ReplyPrefix          string `json:"reply_prefix"`
	Priority             int    `json:"priority"`
	TargetChatID         string `json:"target_chat_id"`
	DispatchTargets      string `json:"dispatch_targets"`
	CompletionStrategy   string `json:"completion_strategy"`
	MaxRounds            int    `json:"max_rounds"`
	ReplyTimeoutMinutes  int    `json:"reply_timeout_minutes"`
	ReplyDebounceSeconds int    `json:"reply_debounce_seconds"`
	CreatedAt            string `json:"created_at"`
	UpdatedAt            string `json:"updated_at"`
}

type FeishuMonitorLog struct {
	ID           int64  `json:"id"`
	UserID       int64  `json:"user_id"`
	ConnectorID  int64  `json:"connector_id"`
	RuleID       int64  `json:"rule_id"`
	RuleName     string `json:"rule_name"`
	ChatID       string `json:"chat_id"`
	SenderID     string `json:"sender_id"`
	SenderName   string `json:"sender_name"`
	MessageText  string `json:"message_text"`
	ActionType   string `json:"action_type"`
	ActionTarget string `json:"action_target"`
	Result       string `json:"result"`
	ErrorMsg     string `json:"error_msg"`
	CreatedAt    string `json:"created_at"`
}

const monitorRuleCols = `id, user_id, connector_id, name, enabled, chat_ids, sender_ids, exclude_bot_msg,
	msg_types, keywords, keyword_mode, action_type, action_target,
	custom_prompt, reply_prefix, priority,
	target_chat_id, dispatch_targets, completion_strategy, max_rounds,
	reply_timeout_minutes, reply_debounce_seconds,
	created_at, updated_at`

func scanMonitorRule(scanner interface {
	Scan(dest ...interface{}) error
}) (*FeishuMonitorRule, error) {
	r := &FeishuMonitorRule{}
	var enabled, excludeBot int
	err := scanner.Scan(
		&r.ID, &r.UserID, &r.ConnectorID, &r.Name, &enabled,
		&r.ChatIDs, &r.SenderIDs, &excludeBot,
		&r.MsgTypes, &r.Keywords, &r.KeywordMode,
		&r.ActionType, &r.ActionTarget,
		&r.CustomPrompt, &r.ReplyPrefix, &r.Priority,
		&r.TargetChatID, &r.DispatchTargets, &r.CompletionStrategy, &r.MaxRounds,
		&r.ReplyTimeoutMinutes, &r.ReplyDebounceSeconds,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	r.Enabled = enabled == 1
	r.ExcludeBotMsg = excludeBot == 1
	return r, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func (s *MySQLStore) CreateMonitorRule(ctx context.Context, userID int64, r *FeishuMonitorRule) (int64, error) {
	if r.KeywordMode == "" {
		r.KeywordMode = "any"
	}
	if r.ActionType == "" {
		r.ActionType = "reply_original"
	}
	if r.DispatchTargets == "" {
		r.DispatchTargets = "[]"
	}
	if r.CompletionStrategy == "" {
		r.CompletionStrategy = "debounce"
	}
	if r.MaxRounds <= 0 {
		r.MaxRounds = 10
	}
	if r.ReplyTimeoutMinutes <= 0 {
		r.ReplyTimeoutMinutes = 10
	}
	if r.ReplyDebounceSeconds <= 0 {
		r.ReplyDebounceSeconds = 30
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO feishu_monitor_rules
		(user_id, connector_id, name, enabled, chat_ids, sender_ids, exclude_bot_msg,
		 msg_types, keywords, keyword_mode, action_type, action_target, custom_prompt, reply_prefix, priority,
		 target_chat_id, dispatch_targets, completion_strategy, max_rounds, reply_timeout_minutes, reply_debounce_seconds)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		userID, r.ConnectorID, r.Name, boolToInt(r.Enabled),
		r.ChatIDs, r.SenderIDs, boolToInt(r.ExcludeBotMsg),
		r.MsgTypes, r.Keywords, r.KeywordMode,
		r.ActionType, r.ActionTarget, r.CustomPrompt, r.ReplyPrefix, r.Priority,
		r.TargetChatID, r.DispatchTargets, r.CompletionStrategy, r.MaxRounds, r.ReplyTimeoutMinutes, r.ReplyDebounceSeconds,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) UpdateMonitorRule(ctx context.Context, userID int64, r *FeishuMonitorRule) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE feishu_monitor_rules SET
			name=?, enabled=?, chat_ids=?, sender_ids=?, exclude_bot_msg=?,
			msg_types=?, keywords=?, keyword_mode=?, action_type=?, action_target=?,
			custom_prompt=?, reply_prefix=?, priority=?,
			target_chat_id=?, dispatch_targets=?, completion_strategy=?, max_rounds=?,
			reply_timeout_minutes=?, reply_debounce_seconds=?,
			updated_at=CURRENT_TIMESTAMP
		WHERE user_id=? AND id=?`,
		r.Name, boolToInt(r.Enabled),
		r.ChatIDs, r.SenderIDs, boolToInt(r.ExcludeBotMsg),
		r.MsgTypes, r.Keywords, r.KeywordMode,
		r.ActionType, r.ActionTarget, r.CustomPrompt, r.ReplyPrefix, r.Priority,
		r.TargetChatID, r.DispatchTargets, r.CompletionStrategy, r.MaxRounds,
		r.ReplyTimeoutMinutes, r.ReplyDebounceSeconds,
		userID, r.ID,
	)
	return err
}

func (s *MySQLStore) DeleteMonitorRule(ctx context.Context, userID, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM feishu_monitor_rules WHERE user_id=? AND id=?`, userID, id)
	return err
}

func (s *MySQLStore) ToggleMonitorRule(ctx context.Context, userID, id int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE feishu_monitor_rules SET enabled = 1 - enabled, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`, userID, id)
	return err
}

func (s *MySQLStore) GetMonitorRule(ctx context.Context, userID, id int64) (*FeishuMonitorRule, error) {
	return scanMonitorRule(s.db.QueryRowContext(ctx, `SELECT `+monitorRuleCols+` FROM feishu_monitor_rules WHERE user_id=? AND id=?`, userID, id))
}

func (s *MySQLStore) ListMonitorRules(ctx context.Context, userID, connectorID int64) ([]FeishuMonitorRule, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+monitorRuleCols+` FROM feishu_monitor_rules WHERE user_id=? AND connector_id=? ORDER BY priority DESC, id ASC`, userID, connectorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []FeishuMonitorRule
	for rows.Next() {
		r, err := scanMonitorRule(rows)
		if err != nil {
			continue
		}
		result = append(result, *r)
	}
	return result, nil
}

func (s *MySQLStore) InsertMonitorLog(ctx context.Context, userID int64, log *FeishuMonitorLog) error {
	msgText := log.MessageText
	if len([]rune(msgText)) > 500 {
		msgText = string([]rune(msgText)[:500]) + "..."
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO feishu_monitor_logs
		(user_id, connector_id, rule_id, rule_name, chat_id, sender_id, sender_name,
		 message_text, action_type, action_target, result, error_msg)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		userID, log.ConnectorID, log.RuleID, log.RuleName,
		log.ChatID, log.SenderID, log.SenderName,
		msgText, log.ActionType, log.ActionTarget,
		log.Result, log.ErrorMsg,
	)
	return err
}

func (s *MySQLStore) ListMonitorLogs(ctx context.Context, userID, connectorID int64, limit int, before int64) ([]FeishuMonitorLog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var query string
	var args []interface{}
	if before > 0 {
		query = `SELECT id, user_id, connector_id, rule_id, rule_name, chat_id, sender_id, sender_name,
		                message_text, action_type, action_target, result, error_msg, created_at
		         FROM feishu_monitor_logs
		         WHERE user_id=? AND connector_id=? AND id < ?
		         ORDER BY id DESC LIMIT ?`
		args = []interface{}{userID, connectorID, before, limit}
	} else {
		query = `SELECT id, user_id, connector_id, rule_id, rule_name, chat_id, sender_id, sender_name,
		                message_text, action_type, action_target, result, error_msg, created_at
		         FROM feishu_monitor_logs
		         WHERE user_id=? AND connector_id=?
		         ORDER BY id DESC LIMIT ?`
		args = []interface{}{userID, connectorID, limit}
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []FeishuMonitorLog
	for rows.Next() {
		var l FeishuMonitorLog
		if err := rows.Scan(
			&l.ID, &l.UserID, &l.ConnectorID, &l.RuleID, &l.RuleName,
			&l.ChatID, &l.SenderID, &l.SenderName,
			&l.MessageText, &l.ActionType, &l.ActionTarget,
			&l.Result, &l.ErrorMsg, &l.CreatedAt,
		); err != nil {
			continue
		}
		result = append(result, l)
	}
	return result, nil
}

func (s *MySQLStore) CleanOldMonitorLogs(ctx context.Context, userID int64, days int) (int64, error) {
	if days <= 0 {
		days = 30
	}
	cutoff := time.Now().AddDate(0, 0, -days).Format("2006-01-02 15:04:05")
	res, err := s.db.ExecContext(ctx, `DELETE FROM feishu_monitor_logs WHERE user_id=? AND created_at < ?`, userID, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ─── 飞书 Agent Teams 任务实例 ─────────────────────────────────────

type FeishuTaskInstance struct {
	ID                   int64  `json:"id"`
	UserID               int64  `json:"user_id"`
	RuleID               int64  `json:"rule_id"`
	ConnectorID          int64  `json:"connector_id"`
	SourceChatID         string `json:"source_chat_id"`
	TargetChatID         string `json:"target_chat_id"`
	TriggerMsgID         string `json:"trigger_msg_id"`
	TriggerContent       string `json:"trigger_content"`
	TriggerSenderID      string `json:"trigger_sender_id"`
	TriggerSenderName    string `json:"trigger_sender_name"`
	RootMessageID        string `json:"root_message_id"`
	ThreadID             string `json:"thread_id"`
	StreamingCardID      string `json:"streaming_card_id"`
	StreamingElementID   string `json:"streaming_element_id"`
	StreamingSequence    int    `json:"streaming_sequence"`
	ProgressMsgID        string `json:"progress_msg_id"`
	Status               string `json:"status"`
	DispatchTargets      string `json:"dispatch_targets"`
	DispatchHistory      string `json:"dispatch_history"`
	AccumulatedContext   string `json:"accumulated_context"`
	CurrentRound         int    `json:"current_round"`
	MaxRounds            int    `json:"max_rounds"`
	ReplyTimeoutMinutes  int    `json:"reply_timeout_minutes"`
	ReplyDebounceSeconds int    `json:"reply_debounce_seconds"`
	ErrorMsg             string `json:"error_msg"`
	CreatedAt            string `json:"created_at"`
	UpdatedAt            string `json:"updated_at"`
}

const taskInstanceCols = `id, user_id, rule_id, connector_id, source_chat_id, target_chat_id,
	trigger_msg_id, trigger_content, trigger_sender_id, trigger_sender_name,
	root_message_id, thread_id, streaming_card_id, streaming_element_id, streaming_sequence,
	progress_msg_id, status, dispatch_targets, dispatch_history, accumulated_context,
	current_round, max_rounds, reply_timeout_minutes, reply_debounce_seconds, error_msg,
	created_at, updated_at`

func scanTaskInstance(scanner interface {
	Scan(dest ...interface{}) error
}) (*FeishuTaskInstance, error) {
	inst := &FeishuTaskInstance{}
	err := scanner.Scan(
		&inst.ID, &inst.UserID, &inst.RuleID, &inst.ConnectorID, &inst.SourceChatID, &inst.TargetChatID,
		&inst.TriggerMsgID, &inst.TriggerContent, &inst.TriggerSenderID, &inst.TriggerSenderName,
		&inst.RootMessageID, &inst.ThreadID, &inst.StreamingCardID, &inst.StreamingElementID, &inst.StreamingSequence,
		&inst.ProgressMsgID, &inst.Status, &inst.DispatchTargets, &inst.DispatchHistory, &inst.AccumulatedContext,
		&inst.CurrentRound, &inst.MaxRounds, &inst.ReplyTimeoutMinutes, &inst.ReplyDebounceSeconds, &inst.ErrorMsg,
		&inst.CreatedAt, &inst.UpdatedAt,
	)
	return inst, err
}

func (s *MySQLStore) ListTaskInstances(ctx context.Context, userID int64, status string, limit int) ([]FeishuTaskInstance, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows *sql.Rows
	var err error
	if status != "" {
		rows, err = s.db.QueryContext(ctx, `SELECT `+taskInstanceCols+` FROM feishu_task_instances WHERE user_id=? AND status=? ORDER BY id DESC LIMIT ?`, userID, status, limit)
	} else {
		rows, err = s.db.QueryContext(ctx, `SELECT `+taskInstanceCols+` FROM feishu_task_instances WHERE user_id=? ORDER BY id DESC LIMIT ?`, userID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []FeishuTaskInstance
	for rows.Next() {
		inst, err := scanTaskInstance(rows)
		if err != nil {
			continue
		}
		result = append(result, *inst)
	}
	return result, nil
}

func (s *MySQLStore) GetTaskInstance(ctx context.Context, userID, id int64) (*FeishuTaskInstance, error) {
	return scanTaskInstance(s.db.QueryRowContext(ctx, `SELECT `+taskInstanceCols+` FROM feishu_task_instances WHERE user_id=? AND id=?`, userID, id))
}

func (s *MySQLStore) CloseTaskInstance(ctx context.Context, userID, id int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE feishu_task_instances SET status='DONE', updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`, userID, id)
	return err
}
