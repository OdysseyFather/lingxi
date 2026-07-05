package connector

import (
	"context"
	"database/sql"

	"lingxi-web-agent/db/mysql"
)

// MySQLConnectorDB 实现 ConnectorDB 接口，将多租户 MySQLStore 方法适配为
// connector 包所需的单租户签名（绑定固定 userID）。
type MySQLConnectorDB struct {
	store  *mysql.MySQLStore
	userID int64
	rawDB  *sql.DB
}

// NewMySQLConnectorDB 创建绑定特定用户的 ConnectorDB 实现
func NewMySQLConnectorDB(store *mysql.MySQLStore, userID int64, rawDB *sql.DB) *MySQLConnectorDB {
	return &MySQLConnectorDB{store: store, userID: userID, rawDB: rawDB}
}

func (m *MySQLConnectorDB) GetOrCreateIMSession(platform, scopeKey, title string, ttlHours int, agentID int64) (int64, error) {
	return m.store.GetOrCreateIMSession(context.Background(), m.userID, platform, scopeKey, title, ttlHours, agentID)
}

func (m *MySQLConnectorDB) TouchIMSession(platform, scopeKey string) {
	m.store.TouchIMSession(context.Background(), m.userID, platform, scopeKey)
}

func (m *MySQLConnectorDB) GetIMConnectorByID(id int64) (*IMConnectorRow, error) {
	c, err := m.store.GetIMConnectorByID(context.Background(), m.userID, id)
	if err != nil {
		return nil, err
	}
	return &IMConnectorRow{
		ID:       c.ID,
		Name:     c.Name,
		Platform: c.Platform,
		AgentID:  c.AgentID,
		Config:   c.Config,
		Enabled:  c.Enabled,
	}, nil
}

func (m *MySQLConnectorDB) ListIMConnectors() ([]IMConnectorRow, error) {
	list, err := m.store.ListIMConnectors(context.Background(), m.userID)
	if err != nil {
		return nil, err
	}
	result := make([]IMConnectorRow, len(list))
	for i, c := range list {
		result[i] = IMConnectorRow{
			ID:       c.ID,
			Name:     c.Name,
			Platform: c.Platform,
			AgentID:  c.AgentID,
			Config:   c.Config,
			Enabled:  c.Enabled,
		}
	}
	return result, nil
}

func (m *MySQLConnectorDB) LookupSessionByReplyMsgID(msgID string) int64 {
	sid, err := m.store.GetIMReplySession(context.Background(), m.userID, msgID)
	if err != nil {
		return 0
	}
	return sid
}

func (m *MySQLConnectorDB) SaveReplySessionMapping(msgID string, sessionID int64) {
	_ = m.store.SaveIMReplySession(context.Background(), m.userID, msgID, sessionID)
}

func (m *MySQLConnectorDB) ListEnabledMonitorRules(connectorID int64) ([]FeishuMonitorRule, error) {
	rules, err := m.store.ListMonitorRules(context.Background(), m.userID, connectorID)
	if err != nil {
		return nil, err
	}
	var result []FeishuMonitorRule
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		result = append(result, FeishuMonitorRule{
			ID:                   r.ID,
			ConnectorID:          r.ConnectorID,
			Name:                 r.Name,
			Enabled:              r.Enabled,
			ChatIDs:              r.ChatIDs,
			SenderIDs:            r.SenderIDs,
			ExcludeBotMsg:        r.ExcludeBotMsg,
			MsgTypes:             r.MsgTypes,
			Keywords:             r.Keywords,
			KeywordMode:          r.KeywordMode,
			ActionType:           r.ActionType,
			ActionTarget:         r.ActionTarget,
			CustomPrompt:         r.CustomPrompt,
			ReplyPrefix:          r.ReplyPrefix,
			Priority:             r.Priority,
			TargetChatID:         r.TargetChatID,
			DispatchTargets:      r.DispatchTargets,
			CompletionStrategy:   r.CompletionStrategy,
			MaxRounds:            r.MaxRounds,
			ReplyTimeoutMinutes:  r.ReplyTimeoutMinutes,
			ReplyDebounceSeconds: r.ReplyDebounceSeconds,
		})
	}
	return result, nil
}

func (m *MySQLConnectorDB) GetMonitorRule(id int64) (*FeishuMonitorRule, error) {
	r, err := m.store.GetMonitorRule(context.Background(), m.userID, id)
	if err != nil {
		return nil, err
	}
	return &FeishuMonitorRule{
		ID:                   r.ID,
		ConnectorID:          r.ConnectorID,
		Name:                 r.Name,
		Enabled:              r.Enabled,
		ChatIDs:              r.ChatIDs,
		SenderIDs:            r.SenderIDs,
		ExcludeBotMsg:        r.ExcludeBotMsg,
		MsgTypes:             r.MsgTypes,
		Keywords:             r.Keywords,
		KeywordMode:          r.KeywordMode,
		ActionType:           r.ActionType,
		ActionTarget:         r.ActionTarget,
		CustomPrompt:         r.CustomPrompt,
		ReplyPrefix:          r.ReplyPrefix,
		Priority:             r.Priority,
		TargetChatID:         r.TargetChatID,
		DispatchTargets:      r.DispatchTargets,
		CompletionStrategy:   r.CompletionStrategy,
		MaxRounds:            r.MaxRounds,
		ReplyTimeoutMinutes:  r.ReplyTimeoutMinutes,
		ReplyDebounceSeconds: r.ReplyDebounceSeconds,
	}, nil
}

func (m *MySQLConnectorDB) InsertMonitorLog(log *FeishuMonitorLog) error {
	return m.store.InsertMonitorLog(context.Background(), m.userID, &mysql.FeishuMonitorLog{
		ConnectorID:  log.ConnectorID,
		RuleID:       log.RuleID,
		RuleName:     log.RuleName,
		ChatID:       log.ChatID,
		SenderID:     log.SenderID,
		SenderName:   log.SenderName,
		MessageText:  log.MessageText,
		ActionType:   log.ActionType,
		ActionTarget: log.ActionTarget,
		Result:       log.Result,
		ErrorMsg:     log.ErrorMsg,
	})
}

func (m *MySQLConnectorDB) ListActiveTaskInstances() ([]FeishuTaskInstance, error) {
	instances, err := m.store.ListTaskInstances(context.Background(), m.userID, "", 200)
	if err != nil {
		return nil, err
	}
	var result []FeishuTaskInstance
	for _, inst := range instances {
		if inst.Status == "DONE" || inst.Status == "ERROR" {
			continue
		}
		result = append(result, FeishuTaskInstance{
			ID: inst.ID, RuleID: inst.RuleID, ConnectorID: inst.ConnectorID,
			SourceChatID: inst.SourceChatID, TargetChatID: inst.TargetChatID,
			TriggerMsgID: inst.TriggerMsgID, TriggerContent: inst.TriggerContent,
			TriggerSenderID: inst.TriggerSenderID, TriggerSenderName: inst.TriggerSenderName,
			RootMessageID: inst.RootMessageID, ThreadID: inst.ThreadID,
			StreamingCardID: inst.StreamingCardID, StreamingElementID: inst.StreamingElementID,
			StreamingSequence: inst.StreamingSequence, ProgressMsgID: inst.ProgressMsgID,
			Status: inst.Status, DispatchTargets: inst.DispatchTargets,
			DispatchHistory: inst.DispatchHistory, AccumulatedContext: inst.AccumulatedContext,
			CurrentRound: inst.CurrentRound, MaxRounds: inst.MaxRounds,
			ReplyTimeoutMinutes: inst.ReplyTimeoutMinutes, ReplyDebounceSeconds: inst.ReplyDebounceSeconds,
			ErrorMsg: inst.ErrorMsg, CreatedAt: inst.CreatedAt, UpdatedAt: inst.UpdatedAt,
		})
	}
	return result, nil
}

func (m *MySQLConnectorDB) CreateTaskInstance(inst *FeishuTaskInstance) (int64, error) {
	// 暂时不支持在 Web 多租户模式下创建任务实例（需要运行时协调器支持）
	// 预留接口，后续集成
	return 0, nil
}

func (m *MySQLConnectorDB) UpdateTaskInstance(inst *FeishuTaskInstance) error {
	// 预留接口
	return nil
}

func (m *MySQLConnectorDB) RawDB() *sql.DB {
	return m.rawDB
}

func (m *MySQLConnectorDB) CreateSessionRaw(title string) (int64, error) {
	res, err := m.rawDB.Exec(`INSERT INTO sessions (user_id, title, agent_id) VALUES (?, ?, 0)`, m.userID, title)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (m *MySQLConnectorDB) InsertMessageRaw(sessionID int64, role, content string) error {
	_, err := m.rawDB.Exec(`INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)`,
		sessionID, role, content)
	return err
}
