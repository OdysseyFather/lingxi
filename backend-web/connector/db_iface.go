package connector

import "database/sql"

// ─── 本包使用的数据类型（复制自桌面端 db 包，避免引用 lingxi-agent/db） ────────

type IMConnectorRow struct {
	ID       int64
	Name     string
	Platform string
	AgentID  int64
	Config   string
	Enabled  bool
}

type FeishuMonitorRule struct {
	ID                   int64  `json:"id"`
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
}

type FeishuMonitorLog struct {
	ConnectorID  int64
	RuleID       int64
	RuleName     string
	ChatID       string
	SenderID     string
	SenderName   string
	MessageText  string
	ActionType   string
	ActionTarget string
	Result       string
	ErrorMsg     string
}

type FeishuTaskInstance struct {
	ID                   int64  `json:"id"`
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

// ConnectorDB 是 connector 包所需的全部数据库操作的抽象接口。
// Web 版由 MySQLStore 实现（多租户），桌面端由 db 包的全局函数实现。
type ConnectorDB interface {
	// IM 会话管理
	GetOrCreateIMSession(platform, scopeKey, title string, ttlHours int, agentID int64) (int64, error)
	TouchIMSession(platform, scopeKey string)

	// IM 连接器
	GetIMConnectorByID(id int64) (*IMConnectorRow, error)
	ListIMConnectors() ([]IMConnectorRow, error)

	// 回复链映射
	LookupSessionByReplyMsgID(msgID string) int64
	SaveReplySessionMapping(msgID string, sessionID int64)

	// 飞书监听规则
	ListEnabledMonitorRules(connectorID int64) ([]FeishuMonitorRule, error)
	GetMonitorRule(id int64) (*FeishuMonitorRule, error)
	InsertMonitorLog(log *FeishuMonitorLog) error

	// 飞书 Agent Teams 任务实例
	ListActiveTaskInstances() ([]FeishuTaskInstance, error)
	CreateTaskInstance(inst *FeishuTaskInstance) (int64, error)
	UpdateTaskInstance(inst *FeishuTaskInstance) error

	// 原始 SQL（消息反馈等）
	RawDB() *sql.DB

	// 创建 session + 插入消息（任务协调器用）
	CreateSessionRaw(title string) (int64, error)
	InsertMessageRaw(sessionID int64, role, content string) error
}

// connDB 全局注入的数据库实现
var connDB ConnectorDB

// SetConnectorDB 由 main 包启动时注入
func SetConnectorDB(db ConnectorDB) {
	connDB = db
}
