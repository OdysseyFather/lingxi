package model

import "time"

// User 社区用户（匿名身份）
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	DisplayName  string    `json:"display_name"`
	Avatar       string    `json:"avatar"`
	Bio          string    `json:"bio"`
	AuthToken    string    `json:"-"` // 不序列化
	CreatedAt    time.Time `json:"created_at"`
	LastActiveAt time.Time `json:"last_active_at"`

	// 关联统计（非表字段，运行时填充）
	AgentsCount      int `json:"agents_count,omitempty"`
	FollowersCount   int `json:"followers_count,omitempty"`
	FollowingCount   int `json:"following_count,omitempty"`
}

// Agent 发布的 Agent 元数据
type Agent struct {
	ID             string    `json:"id"`
	AuthorID       string    `json:"author_id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Avatar         string    `json:"avatar"`
	Tags           []string  `json:"tags"`
	Category       string    `json:"category"`
	BundlePath     string    `json:"-"` // 不序列化，内部使用
	BundleSize     int64     `json:"bundle_size"`
	Version        string    `json:"version"`
	DownloadsCount int       `json:"downloads_count"`
	RatingAvg      float64   `json:"rating_avg"`
	RatingCount    int       `json:"rating_count"`
	IsPublished    bool      `json:"is_published"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`

	// 关联（运行时填充）
	Author *User `json:"author,omitempty"`
}

// Rating 评分
type Rating struct {
	ID        int64     `json:"id"`
	AgentID   string    `json:"agent_id"`
	UserID    string    `json:"user_id"`
	Score     int       `json:"score"`
	Review    string    `json:"review"`
	CreatedAt time.Time `json:"created_at"`

	// 关联
	User *User `json:"user,omitempty"`
}

// Follow 关注关系
type Follow struct {
	FollowerID string    `json:"follower_id"`
	FolloweeID string    `json:"followee_id"`
	CreatedAt time.Time `json:"created_at"`
}

// Comment 评论
type Comment struct {
	ID        int64     `json:"id"`
	AgentID   string    `json:"agent_id"`
	UserID    string    `json:"user_id"`
	ParentID  *int64     `json:"parent_id,omitempty"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`

	// 关联
	User     *User     `json:"user,omitempty"`
	Replies  []Comment `json:"replies,omitempty"`
}

// Invocation 邀请码调用授权
type Invocation struct {
	Code       string     `json:"code"`
	AgentID    string     `json:"agent_id"`
	IssuerID   string     `json:"issuer_id"`
	DailyLimit int        `json:"daily_limit"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	IsActive   bool       `json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`

	// 关联
	Agent *Agent `json:"agent,omitempty"`
}

// InvocationLog 调用日志
type InvocationLog struct {
	ID         int64       `json:"id"`
	Code       string      `json:"code"`
	CallerID   *string     `json:"caller_id,omitempty"`
	CallerIP   string      `json:"caller_ip"`
	Success    bool        `json:"success"`
	ErrorMsg   string      `json:"error_msg,omitempty"`
	LatencyMs  int64       `json:"latency_ms"`
	CreatedAt  time.Time   `json:"created_at"`
}

// AgentListQuery Agent 列表查询参数
type AgentListQuery struct {
	Page      int
	PageSize  int
	Category  string
	Tag       string
	Search    string
	SortBy    string // downloads/rating/newest
	AuthorID  string
}

// AgentListResult 列表查询结果
type AgentListResult struct {
	Agents     []Agent `json:"agents"`
	Total      int     `json:"total"`
	Page       int     `json:"page"`
	PageSize   int     `json:"page_size"`
}
