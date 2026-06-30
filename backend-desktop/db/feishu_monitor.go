package db

import (
	"time"
)

// ─── 飞书监听模式 ───────────────────────────────────────────────

// FeishuMonitorRule 飞书监听规则
type FeishuMonitorRule struct {
	ID            int64  `json:"id"`
	ConnectorID   int64  `json:"connector_id"`
	Name          string `json:"name"`
	Enabled       bool   `json:"enabled"`
	ChatIDs       string `json:"chat_ids"`
	SenderIDs     string `json:"sender_ids"`
	ExcludeBotMsg bool   `json:"exclude_bot_msg"`
	MsgTypes      string `json:"msg_types"`
	Keywords      string `json:"keywords"`
	KeywordMode   string `json:"keyword_mode"`
	ActionType    string `json:"action_type"`
	ActionTarget  string `json:"action_target"`
	CustomPrompt  string `json:"custom_prompt"`
	Priority      int    `json:"priority"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

// FeishuMonitorLog 飞书监听日志
type FeishuMonitorLog struct {
	ID           int64  `json:"id"`
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

// CreateMonitorRule 创建监听规则
func CreateMonitorRule(r *FeishuMonitorRule) (int64, error) {
	if r.KeywordMode == "" {
		r.KeywordMode = "any"
	}
	if r.ActionType == "" {
		r.ActionType = "reply_original"
	}
	res, err := DB.Exec(`
		INSERT INTO feishu_monitor_rules
		(connector_id, name, enabled, chat_ids, sender_ids, exclude_bot_msg,
		 msg_types, keywords, keyword_mode, action_type, action_target, custom_prompt, priority)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		r.ConnectorID, r.Name, boolToInt(r.Enabled),
		r.ChatIDs, r.SenderIDs, boolToInt(r.ExcludeBotMsg),
		r.MsgTypes, r.Keywords, r.KeywordMode,
		r.ActionType, r.ActionTarget, r.CustomPrompt, r.Priority,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdateMonitorRule 更新监听规则
func UpdateMonitorRule(r *FeishuMonitorRule) error {
	_, err := DB.Exec(`
		UPDATE feishu_monitor_rules SET
			name=?, enabled=?, chat_ids=?, sender_ids=?, exclude_bot_msg=?,
			msg_types=?, keywords=?, keyword_mode=?, action_type=?, action_target=?,
			custom_prompt=?, priority=?, updated_at=CURRENT_TIMESTAMP
		WHERE id=?`,
		r.Name, boolToInt(r.Enabled),
		r.ChatIDs, r.SenderIDs, boolToInt(r.ExcludeBotMsg),
		r.MsgTypes, r.Keywords, r.KeywordMode,
		r.ActionType, r.ActionTarget, r.CustomPrompt, r.Priority,
		r.ID,
	)
	return err
}

// DeleteMonitorRule 删除监听规则
func DeleteMonitorRule(id int64) error {
	_, err := DB.Exec(`DELETE FROM feishu_monitor_rules WHERE id=?`, id)
	return err
}

// ToggleMonitorRule 切换规则启用/禁用
func ToggleMonitorRule(id int64) error {
	_, err := DB.Exec(`UPDATE feishu_monitor_rules SET enabled = 1 - enabled, updated_at=CURRENT_TIMESTAMP WHERE id=?`, id)
	return err
}

// GetMonitorRule 获取单条规则
func GetMonitorRule(id int64) (*FeishuMonitorRule, error) {
	r := &FeishuMonitorRule{}
	var enabled, excludeBot int
	err := DB.QueryRow(`
		SELECT id, connector_id, name, enabled, chat_ids, sender_ids, exclude_bot_msg,
		       msg_types, keywords, keyword_mode, action_type, action_target,
		       custom_prompt, priority, created_at, updated_at
		FROM feishu_monitor_rules WHERE id=?`, id).Scan(
		&r.ID, &r.ConnectorID, &r.Name, &enabled,
		&r.ChatIDs, &r.SenderIDs, &excludeBot,
		&r.MsgTypes, &r.Keywords, &r.KeywordMode,
		&r.ActionType, &r.ActionTarget,
		&r.CustomPrompt, &r.Priority, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	r.Enabled = enabled == 1
	r.ExcludeBotMsg = excludeBot == 1
	return r, nil
}

// ListMonitorRules 列出某个连接器的所有监听规则（按 priority DESC）
func ListMonitorRules(connectorID int64) ([]FeishuMonitorRule, error) {
	rows, err := DB.Query(`
		SELECT id, connector_id, name, enabled, chat_ids, sender_ids, exclude_bot_msg,
		       msg_types, keywords, keyword_mode, action_type, action_target,
		       custom_prompt, priority, created_at, updated_at
		FROM feishu_monitor_rules
		WHERE connector_id=?
		ORDER BY priority DESC, id ASC`, connectorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []FeishuMonitorRule
	for rows.Next() {
		var r FeishuMonitorRule
		var enabled, excludeBot int
		if err := rows.Scan(
			&r.ID, &r.ConnectorID, &r.Name, &enabled,
			&r.ChatIDs, &r.SenderIDs, &excludeBot,
			&r.MsgTypes, &r.Keywords, &r.KeywordMode,
			&r.ActionType, &r.ActionTarget,
			&r.CustomPrompt, &r.Priority, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			continue
		}
		r.Enabled = enabled == 1
		r.ExcludeBotMsg = excludeBot == 1
		result = append(result, r)
	}
	return result, nil
}

// ListEnabledMonitorRules 列出某个连接器的所有启用的监听规则（按 priority DESC）
func ListEnabledMonitorRules(connectorID int64) ([]FeishuMonitorRule, error) {
	rows, err := DB.Query(`
		SELECT id, connector_id, name, enabled, chat_ids, sender_ids, exclude_bot_msg,
		       msg_types, keywords, keyword_mode, action_type, action_target,
		       custom_prompt, priority, created_at, updated_at
		FROM feishu_monitor_rules
		WHERE connector_id=? AND enabled=1
		ORDER BY priority DESC, id ASC`, connectorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []FeishuMonitorRule
	for rows.Next() {
		var r FeishuMonitorRule
		var enabled, excludeBot int
		if err := rows.Scan(
			&r.ID, &r.ConnectorID, &r.Name, &enabled,
			&r.ChatIDs, &r.SenderIDs, &excludeBot,
			&r.MsgTypes, &r.Keywords, &r.KeywordMode,
			&r.ActionType, &r.ActionTarget,
			&r.CustomPrompt, &r.Priority, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			continue
		}
		r.Enabled = enabled == 1
		r.ExcludeBotMsg = excludeBot == 1
		result = append(result, r)
	}
	return result, nil
}

// InsertMonitorLog 插入监听日志
func InsertMonitorLog(log *FeishuMonitorLog) error {
	msgText := log.MessageText
	if len([]rune(msgText)) > 500 {
		msgText = string([]rune(msgText)[:500]) + "..."
	}
	_, err := DB.Exec(`
		INSERT INTO feishu_monitor_logs
		(connector_id, rule_id, rule_name, chat_id, sender_id, sender_name,
		 message_text, action_type, action_target, result, error_msg)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		log.ConnectorID, log.RuleID, log.RuleName,
		log.ChatID, log.SenderID, log.SenderName,
		msgText, log.ActionType, log.ActionTarget,
		log.Result, log.ErrorMsg,
	)
	return err
}

// ListMonitorLogs 列出监听日志（分页）
func ListMonitorLogs(connectorID int64, limit int, before int64) ([]FeishuMonitorLog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var query string
	var args []interface{}
	if before > 0 {
		query = `SELECT id, connector_id, rule_id, rule_name, chat_id, sender_id, sender_name,
		                message_text, action_type, action_target, result, error_msg, created_at
		         FROM feishu_monitor_logs
		         WHERE connector_id=? AND id < ?
		         ORDER BY id DESC LIMIT ?`
		args = []interface{}{connectorID, before, limit}
	} else {
		query = `SELECT id, connector_id, rule_id, rule_name, chat_id, sender_id, sender_name,
		                message_text, action_type, action_target, result, error_msg, created_at
		         FROM feishu_monitor_logs
		         WHERE connector_id=?
		         ORDER BY id DESC LIMIT ?`
		args = []interface{}{connectorID, limit}
	}

	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []FeishuMonitorLog
	for rows.Next() {
		var l FeishuMonitorLog
		if err := rows.Scan(
			&l.ID, &l.ConnectorID, &l.RuleID, &l.RuleName,
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

// CleanOldMonitorLogs 清理超过 days 天的监听日志
func CleanOldMonitorLogs(days int) (int64, error) {
	if days <= 0 {
		days = 30
	}
	cutoff := time.Now().AddDate(0, 0, -days).Format("2006-01-02 15:04:05")
	res, err := DB.Exec(`DELETE FROM feishu_monitor_logs WHERE created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
