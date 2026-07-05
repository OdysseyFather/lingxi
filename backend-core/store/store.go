// Package store 定义灵犀数据访问层接口。
// 红线：handler / core 禁止 db.DB 直调；所有 SQL 仅在 mysql/sqlite 实现包内。
// Web 多租户：方法签名含 userID int64；桌面 SQLiteStore 使用 SingleUserID=1。
package store

import (
	"context"
	"time"
)

const SingleUserID int64 = 1

// Store 是 handler 唯一数据入口（Web 全量；Desktop 不含 Web 专属子接口）。
type Store interface {
	AuthStore
	QuotaStore
	AdminStore
	AuditStore
	SessionStore
	MessageStore
	AgentStore
	SkillStore
	ProviderStore
	KnowledgeStore
	VectorStore
	MemoryStore
	MCPStore
	ScheduledStore
	UsageStore
	IMStore
	FeishuStore
	NexusStore
	GroupChatStore
	EvolutionStore
	DistillStore
	CheckpointStore
	TaskStore
	KVStore
}

// DesktopStore 桌面端窄接口（不含 Auth/Quota/Admin/Audit）。
type DesktopStore interface {
	SessionStore
	MessageStore
	AgentStore
	SkillStore
	ProviderStore
	KnowledgeStore
	VectorStore
	MemoryStore
	MCPStore
	ScheduledStore
	UsageStore
	IMStore
	FeishuStore
	NexusStore
	GroupChatStore
	EvolutionStore
	DistillStore
	CheckpointStore
	TaskStore
	KVStore
}

// SessionStore 会话 CRUD + Claude session 归属（P0）。
type SessionStore interface {
	ListSessions(ctx context.Context, userID int64, filter SessionFilter) ([]Session, error)
	CreateSession(ctx context.Context, userID int64, s *Session) (int64, error)
	GetSession(ctx context.Context, userID, sessionID int64) (*Session, error)
	UpdateSession(ctx context.Context, userID, sessionID int64, patch SessionPatch) error
	DeleteSession(ctx context.Context, userID, sessionID int64) error
	BatchDeleteSessions(ctx context.Context, userID int64, ids []int64) (int, error)
	SessionExists(ctx context.Context, userID, sessionID int64) (bool, error)
	GetClaudeSessionID(ctx context.Context, userID, sessionID int64) (string, error)
	SetClaudeSessionID(ctx context.Context, userID, sessionID int64, claudeID string) error
	ClearClaudeSessionID(ctx context.Context, userID, sessionID int64) error
	UpdateSessionTitleIfDefault(ctx context.Context, userID, sessionID int64, title string) error
	SetSessionAgent(ctx context.Context, userID, sessionID, agentID int64) error
}

// MessageStore 消息 CRUD。
type MessageStore interface {
	ListMessages(ctx context.Context, userID, sessionID int64, page MessagePage) ([]Message, error)
	GetMessage(ctx context.Context, userID, messageID int64) (*Message, error)
	InsertMessage(ctx context.Context, userID int64, m *Message) (int64, error)
	UpdateMessage(ctx context.Context, userID, messageID int64, content string) error
	DeleteMessagesAfter(ctx context.Context, userID, sessionID, messageID int64) (int64, error)
	DeleteMessagesFrom(ctx context.Context, userID, sessionID, fromMessageID int64) (int64, error)
	SetMessageFeedback(ctx context.Context, userID, messageID int64, feedback string) error
	SearchMessages(ctx context.Context, userID int64, query string, limit int) ([]MessageSearchHit, error)
	CountMessages(ctx context.Context, userID, sessionID int64) (int, error)
}

// AuthStore Web 专属：用户/Token/邀请码。
type AuthStore interface {
	GetUserByUsername(ctx context.Context, username string) (*WebUser, error)
	GetUserByID(ctx context.Context, userID int64) (*WebUser, error)
	CreateUser(ctx context.Context, u *WebUser) (int64, error)
	CreateAuthToken(ctx context.Context, t *AuthToken) (int64, error)
	GetAuthTokenByHash(ctx context.Context, hash string) (*AuthToken, error)
	RevokeAuthToken(ctx context.Context, tokenID int64) error
	GetInvitationByCode(ctx context.Context, code string) (*Invitation, error)
}

// QuotaStore Web 专属：配额原子更新。
type QuotaStore interface {
	GetQuotaLimits(ctx context.Context, userID int64) (*QuotaLimits, error)
	GetUsageQuota(ctx context.Context, userID int64) (*UsageQuota, error)
	TryAddStorage(ctx context.Context, userID int64, delta int64) error
	TryAcquireChatSlot(ctx context.Context, userID int64, limit int) error
	ReleaseChatSlot(ctx context.Context, userID int64) error
	CheckRateLimit(ctx context.Context, userID int64, ip, key string, limit, windowSec int) (bool, error)
}

// AgentStore 智能体 CRUD（Web 按 user_id 隔离）。
type AgentStore interface {
	ListAgents(ctx context.Context, userID int64) ([]Agent, error)
	GetAgent(ctx context.Context, userID, agentID int64) (*Agent, error)
	UpsertAgent(ctx context.Context, userID int64, a *Agent) (int64, error)
	DeleteAgent(ctx context.Context, userID, agentID int64) error
}

// SkillStore 技能 CRUD。
type SkillStore interface {
	ListSkills(ctx context.Context, userID int64) ([]Skill, error)
	GetSkill(ctx context.Context, userID, skillID int64) (*Skill, error)
	GetSkillByName(ctx context.Context, userID int64, name string) (*Skill, error)
	InsertSkill(ctx context.Context, userID int64, sk *Skill) (int64, error)
	UpdateSkill(ctx context.Context, userID int64, sk *Skill) error
	SetSkillInstalled(ctx context.Context, userID, skillID int64, installed bool) error
	DeleteSkill(ctx context.Context, userID, skillID int64) error
	ListInstalledSkillPaths(ctx context.Context, userID int64) ([]SkillPath, error)
}

// KnowledgeStore 知识库 CRUD。
type KnowledgeStore interface {
	ListKnowledge(ctx context.Context, userID int64) ([]KnowledgeItem, error)
	GetKnowledge(ctx context.Context, userID, id int64) (*KnowledgeItem, error)
	InsertKnowledge(ctx context.Context, userID int64, item *KnowledgeItem) (int64, error)
	UpdateKnowledge(ctx context.Context, userID, id int64, title, category, tags, summary string) error
	DeleteKnowledge(ctx context.Context, userID, id int64) (filePath string, err error)
	ListKnowledgeCategories(ctx context.Context, userID int64) ([]KnowledgeCategory, error)
	CreateKnowledgeCategory(ctx context.Context, userID int64, name, icon string) (int64, error)
	DeleteKnowledgeCategory(ctx context.Context, userID, id int64) error
	UpdateKnowledgeCategory(ctx context.Context, userID, id int64, name, icon string) error
	UpdateKnowledgeItemCategory(ctx context.Context, userID, id int64, category string) error
}

// MemoryStore 长期记忆 CRUD。
type MemoryStore interface {
	ListMemories(ctx context.Context, userID, agentID int64, limit int) ([]Memory, error)
	CreateMemory(ctx context.Context, userID, agentID int64, content, category string) (int64, error)
	DeleteMemory(ctx context.Context, userID, id int64) error
	ClearMemories(ctx context.Context, userID, agentID int64) error
	ListMemoryContents(ctx context.Context, userID, agentID int64, limit int) ([]Memory, error)
}

// UsageStore 用量统计与记录。
type UsageStore interface {
	InsertUsageRecord(ctx context.Context, userID int64, r *UsageRecord) (int64, error)
	SumUsageSince(ctx context.Context, userID int64, since time.Time) (UsageSummary, error)
	GroupUsageByDay(ctx context.Context, userID int64, days int) ([]map[string]interface{}, error)
	GroupUsageByModel(ctx context.Context, userID int64, days int) ([]map[string]interface{}, error)
	GroupUsageByAgent(ctx context.Context, userID int64, days int) ([]map[string]interface{}, error)
	GroupUsageCostByDay(ctx context.Context, userID int64, days int) ([]map[string]interface{}, error)
	ListRecentUsage(ctx context.Context, userID int64, limit int) ([]map[string]interface{}, error)
	SaveUsageQuotaSnapshot(ctx context.Context, userID, profileID int64, snapshot string) error
	GetUsageQuotaCache(ctx context.Context, userID, profileID int64) (string, time.Time, bool)
}

// ProviderStore 供应商（全局）+ 接入点（按 user_id 隔离）。
type ProviderStore interface {
	ListProviders(ctx context.Context) ([]Provider, error)
	GetProvider(ctx context.Context, id int64) (*Provider, error)
	ListAPIProfiles(ctx context.Context, userID int64, includeCipher bool) ([]APIProfile, error)
	GetAPIProfile(ctx context.Context, userID, id int64, includeCipher bool) (*APIProfile, error)
	GetActiveAPIProfile(ctx context.Context, userID int64, includeCipher bool) (*APIProfile, error)
	UpsertAPIProfile(ctx context.Context, userID int64, ap *APIProfile) (int64, error)
	DeleteAPIProfile(ctx context.Context, userID, id int64) error
	ActivateAPIProfile(ctx context.Context, userID, id int64) error
}

// MCPStore MCP 服务器 CRUD。
type MCPStore interface {
	ListMCPServers(ctx context.Context, userID int64) ([]MCPServer, error)
	GetMCPServer(ctx context.Context, userID, id int64) (*MCPServer, error)
	UpsertMCPServer(ctx context.Context, userID int64, m *MCPServer) (int64, error)
	DeleteMCPServer(ctx context.Context, userID, id int64) error
	SetMCPServerEnabled(ctx context.Context, userID, id int64, enabled bool) error
}

// 其余子接口见计划附录 B；Phase 1 起按域逐步实现。
type AdminStore interface{}
type AuditStore interface{}
type VectorStore interface{}
type ScheduledStore interface{}
type IMStore interface{}
type FeishuStore interface{}
type NexusStore interface{}
type GroupChatStore interface{}
type EvolutionStore interface{}
type DistillStore interface{}
type CheckpointStore interface{}
type TaskStore interface{}
type KVStore interface{}
