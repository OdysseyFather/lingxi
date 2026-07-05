package store

import "time"

type Session struct {
	ID              int64     `json:"id"`
	UserID          int64     `json:"user_id,omitempty"`
	Title           string    `json:"title"`
	ClaudeSessionID string    `json:"claude_session_id,omitempty"`
	MessageCount    int       `json:"message_count"`
	AgentID         int64     `json:"agent_id"`
	Pinned          bool      `json:"pinned"`
	Summary         string    `json:"summary,omitempty"`
	Folder          string    `json:"folder,omitempty"`
	PermissionMode  string    `json:"permission_mode"`
	Mode            string    `json:"mode,omitempty"`
	ProjectPath     string    `json:"project_path,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type SessionFilter struct {
	AgentID     int64
	Mode        string
	ProjectPath string
	ExcludeA2A  bool
}

type SessionPatch struct {
	Title          *string
	Pinned         *bool
	Folder         *string
	PermissionMode *string
}

type Message struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id,omitempty"`
	SessionID int64     `json:"session_id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Usage     string    `json:"usage,omitempty"`
	Feedback  string    `json:"feedback,omitempty"`
	Pinned    bool      `json:"pinned"`
	CreatedAt time.Time `json:"created_at"`
}

type MessagePage struct {
	BeforeID int64
	Limit    int
}

type MessageSearchHit struct {
	MessageID    int64     `json:"message_id"`
	SessionID    int64     `json:"session_id"`
	Role         string    `json:"role"`
	Content      string    `json:"content"`
	Usage        string    `json:"usage,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	SessionTitle string    `json:"session_title"`
}

type WebUser struct {
	ID           int64      `json:"id"`
	Username     string     `json:"username"`
	Email        string     `json:"email,omitempty"`
	PasswordHash string     `json:"-"`
	Role         string     `json:"role"`
	Status       string     `json:"status"`
	DisplayName  string     `json:"display_name"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

type AuthToken struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	TokenHash  string    `json:"-"`
	DeviceInfo string    `json:"device_info"`
	IPAddress  string    `json:"ip_address"`
	ExpiresAt  time.Time `json:"expires_at"`
}

type Invitation struct {
	ID        int64      `json:"id"`
	Code      string     `json:"code"`
	Role      string     `json:"role"`
	MaxUses   int        `json:"max_uses"`
	UsedCount int        `json:"used_count"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
}

type QuotaLimits struct {
	StorageLimitBytes int64 `json:"storage_limit_bytes"`
	TokenInputLimit   int64 `json:"token_input_limit"`
	TokenOutputLimit  int64 `json:"token_output_limit"`
	AgentLimit        int   `json:"agent_limit"`
	SessionLimit      int   `json:"session_limit"`
	KnowledgeLimit    int   `json:"knowledge_limit"`
	ConcurrentChats   int   `json:"concurrent_chats"`
}

type UsageQuota struct {
	StorageBytes   int64 `json:"storage_bytes"`
	TokenInput     int64 `json:"token_input"`
	TokenOutput    int64 `json:"token_output"`
	AgentCount     int   `json:"agent_count"`
	SessionCount   int   `json:"session_count"`
	KnowledgeCount int   `json:"knowledge_count"`
	ActiveChats    int   `json:"active_chats"`
}

type Agent struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id,omitempty"`
	Name         string    `json:"name"`
	Avatar       string    `json:"avatar"`
	Description  string    `json:"description"`
	SystemPrompt string    `json:"system_prompt"`
	ProfileID    int64     `json:"profile_id"`
	SkillIDs     string    `json:"skill_ids"`
	MCPServerIDs string    `json:"mcp_server_ids"`
	KnowledgeIDs string    `json:"knowledge_ids"`
	AllowAll     bool      `json:"allow_all"`
	Builtin      bool      `json:"builtin"`
	Temperature  float64   `json:"temperature"`
	MaxTokens    int64     `json:"max_tokens"`
	PostActions  string    `json:"post_actions"`
	EnvVars      string    `json:"env_vars"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Skill struct {
	ID                 int64     `json:"id"`
	UserID             int64     `json:"user_id,omitempty"`
	Name               string    `json:"name"`
	Description        string    `json:"description"`
	FilePath           string    `json:"file_path"`
	Installed          bool      `json:"installed"`
	Source             string    `json:"source"`
	MarketplaceID      string    `json:"marketplace_id,omitempty"`
	MarketplaceVersion string    `json:"marketplace_version,omitempty"`
	Author             string    `json:"author,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type SkillPath struct {
	Name     string `json:"name"`
	FilePath string `json:"file_path"`
}

type KnowledgeItem struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id,omitempty"`
	Title     string    `json:"title"`
	FilePath  string    `json:"file_path"`
	Category  string    `json:"category"`
	Tags      string    `json:"tags"`
	Summary   string    `json:"summary,omitempty"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"created_at"`
}

type KnowledgeCategory struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id,omitempty"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	SortOrder int    `json:"sort_order"`
}

type Memory struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id,omitempty"`
	AgentID   int64     `json:"agent_id"`
	Content   string    `json:"content"`
	Category  string    `json:"category"`
	CreatedAt time.Time `json:"created_at"`
}

type UsageRecord struct {
	ID               int64     `json:"id"`
	UserID           int64     `json:"user_id,omitempty"`
	SessionID        int64     `json:"session_id"`
	MessageID        int64     `json:"message_id"`
	ProfileID        int64     `json:"profile_id"`
	Model            string    `json:"model"`
	InputTokens      int64     `json:"input_tokens"`
	OutputTokens     int64     `json:"output_tokens"`
	CacheReadTokens  int64     `json:"cache_read_tokens"`
	CacheWriteTokens int64     `json:"cache_write_tokens"`
	CostUSD          float64   `json:"cost_usd"`
	Estimated        bool      `json:"estimated"`
	DurationMs       int64     `json:"duration_ms"`
	CreatedAt        time.Time `json:"created_at"`
}

type UsageSummary struct {
	InputTokens      int64   `json:"input_tokens"`
	OutputTokens     int64   `json:"output_tokens"`
	CacheReadTokens  int64   `json:"cache_read_tokens"`
	CacheWriteTokens int64   `json:"cache_write_tokens"`
	CostUSD          float64 `json:"cost_usd"`
	Requests         int64   `json:"requests"`
}

type Provider struct {
	ID             int64  `json:"id"`
	Code           string `json:"code"`
	Name           string `json:"name"`
	Protocol       string `json:"protocol"`
	DefaultBaseURL string `json:"default_base_url"`
	DefaultModel   string `json:"default_model"`
	UsageAPIMeta   string `json:"usage_api_meta"`
	DocURL         string `json:"doc_url"`
	Builtin        bool   `json:"builtin"`
}

type APIProfile struct {
	ID               int64     `json:"id"`
	UserID           int64     `json:"user_id,omitempty"`
	Name             string    `json:"name"`
	ProviderID       int64     `json:"provider_id"`
	ProviderCode     string    `json:"provider_code,omitempty"`
	ProviderName     string    `json:"provider_name,omitempty"`
	ProviderProtocol string    `json:"provider_protocol,omitempty"`
	BaseURL          string    `json:"base_url"`
	Model            string    `json:"model"`
	AuthTokenCipher  string    `json:"auth_token_cipher,omitempty"`
	AuthTokenMask    string    `json:"auth_token_mask"`
	Extra            string    `json:"extra"`
	Transformer      string    `json:"transformer"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type MCPServer struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id,omitempty"`
	Name        string    `json:"name"`
	Transport   string    `json:"transport"`
	Command     string    `json:"command"`
	Args        string    `json:"args"`
	Env         string    `json:"env"`
	URL         string    `json:"url"`
	Headers     string    `json:"headers"`
	Enabled     bool      `json:"enabled"`
	Builtin     bool      `json:"builtin"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
