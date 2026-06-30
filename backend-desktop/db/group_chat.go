package db

import (
	"database/sql"
	"errors"
	"strings"
	"time"
)

// ErrTooLate 撤回超时
var ErrTooLate = errors.New("recall window expired")

// ErrNotOwner 非消息所有者
var ErrNotOwner = errors.New("not message owner")

// ─── Group Chats ─────────────────────────────────────────────────

// GroupChat 群聊房间
type GroupChat struct {
	ID               int64      `json:"id"`
	RoomUUID         string     `json:"room_uuid"`
	Topic            string     `json:"topic"`
	Goal             string     `json:"goal"`
	MaxRounds        int        `json:"max_rounds"`
	CurrentRound     int        `json:"current_round"`
	Status           string     `json:"status"` // pending/active/paused/completed
	ModeratorAgentID int64      `json:"moderator_agent_id"`
	ModeratorPeerID  string     `json:"moderator_peer_id"`
	ScheduleMode     string     `json:"schedule_mode"` // 'roundrobin'|'moderator'|'mention'|'hybrid'
	ChatMode         string     `json:"chat_mode"`     // 'casual'(闲聊) | 'meeting'(工作会议)
	CreatedByLocal   bool       `json:"created_by_local"`
	HostPeerID       string     `json:"host_peer_id"` // 创建者 peer ID（用于回送消息聚合）
	LocalSessionID   int64      `json:"local_session_id"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	Deadline         *time.Time `json:"deadline"`
}

// GroupMember 群成员（每个 (peer, agent) 一行）
type GroupMember struct {
	ID           int64     `json:"id"`
	RoomID       int64     `json:"room_id"`
	PeerID       string    `json:"peer_id"`
	PeerNickname string    `json:"peer_nickname"`
	AgentID      int64     `json:"agent_id"` // 该 peer 的 agent ID（仅 peer 本端有效）
	AgentName    string    `json:"agent_name"`
	AgentCaps    string    `json:"agent_caps"` // JSON 字符串
	IsLocal      bool      `json:"is_local"`   // 是否为本端 Agent
	Status       string    `json:"status"`     // invited/joined/left/rejected
	JoinedAt     time.Time `json:"joined_at"`
}

// GroupMessage 群消息
type GroupMessage struct {
	ID              int64     `json:"id"`
	RoomID          int64     `json:"room_id"`
	SenderPeerID    string    `json:"sender_peer_id"`
	SenderAgentID   int64     `json:"sender_agent_id"`
	SenderAgentName string    `json:"sender_agent_name"`
	MsgType         string    `json:"msg_type"` // 'message'/'system'/'moderator_decision'/'user_post'
	Content         string    `json:"content"`
	MentionedAgents string    `json:"mentioned_agents"` // JSON [{peer_id, agent_name}]
	Round           int       `json:"round"`
	CreatedAt       time.Time `json:"created_at"`
	// WeChat-like extensions
	ReplyToID   int64      `json:"reply_to_id"`   // 引用的消息 ID，0 表示无
	IsRecalled  bool       `json:"is_recalled"`   // 是否已撤回
	RecalledAt  *time.Time `json:"recalled_at"`   // 撤回时间
	Images      string     `json:"images"`        // JSON 字符串数组（相对 URL）
	ClientMsgID string     `json:"client_msg_id"` // 前端生成的幂等键
	EditedAt    *time.Time `json:"edited_at"`     // 预留：编辑时间
}

// MigrateGroupChat 创建群聊相关表（在 db.go migrate() 中调用）
func MigrateGroupChat() {
	tables := []string{
		`CREATE TABLE IF NOT EXISTS group_chats (
			id                 INTEGER PRIMARY KEY AUTOINCREMENT,
			room_uuid          TEXT    NOT NULL UNIQUE,
			topic              TEXT    NOT NULL DEFAULT '',
			goal               TEXT    NOT NULL DEFAULT '',
			max_rounds         INTEGER NOT NULL DEFAULT 20,
			current_round      INTEGER NOT NULL DEFAULT 0,
			status             TEXT    NOT NULL DEFAULT 'pending',
			moderator_agent_id INTEGER NOT NULL DEFAULT 0,
			moderator_peer_id  TEXT    NOT NULL DEFAULT '',
			schedule_mode      TEXT    NOT NULL DEFAULT 'hybrid',
			created_by_local   INTEGER NOT NULL DEFAULT 1,
			host_peer_id       TEXT    NOT NULL DEFAULT '',
			local_session_id   INTEGER NOT NULL DEFAULT 0,
			deadline           DATETIME DEFAULT NULL,
			created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS group_members (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			room_id       INTEGER NOT NULL,
			peer_id       TEXT    NOT NULL,
			peer_nickname TEXT    NOT NULL DEFAULT '',
			agent_id      INTEGER NOT NULL DEFAULT 0,
			agent_name    TEXT    NOT NULL DEFAULT '',
			agent_caps    TEXT    NOT NULL DEFAULT '[]',
			is_local      INTEGER NOT NULL DEFAULT 0,
			status        TEXT    NOT NULL DEFAULT 'invited',
			joined_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_group_members_room ON group_members(room_id)`,
		`CREATE TABLE IF NOT EXISTS group_messages (
			id                INTEGER PRIMARY KEY AUTOINCREMENT,
			room_id           INTEGER NOT NULL,
			sender_peer_id    TEXT    NOT NULL,
			sender_agent_id   INTEGER NOT NULL DEFAULT 0,
			sender_agent_name TEXT    NOT NULL DEFAULT '',
			msg_type          TEXT    NOT NULL DEFAULT 'message',
			content           TEXT    NOT NULL DEFAULT '',
			mentioned_agents  TEXT    NOT NULL DEFAULT '[]',
			round             INTEGER NOT NULL DEFAULT 0,
			created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_group_messages_room ON group_messages(room_id, created_at)`,
	}
	for _, sql := range tables {
		DB.Exec(sql)
	}

	// 列级迁移：微信风群聊新增字段
	addColumnIfMissing("group_messages", "reply_to_id", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("group_messages", "is_recalled", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("group_messages", "recalled_at", "DATETIME DEFAULT NULL")
	addColumnIfMissing("group_messages", "images", "TEXT NOT NULL DEFAULT '[]'")
	addColumnIfMissing("group_messages", "client_msg_id", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("group_messages", "edited_at", "DATETIME DEFAULT NULL")

	// 群聊模式：casual=微信风闲聊（并发概率发言）| meeting=工作会议（主持人主导推进得出结论）
	addColumnIfMissing("group_chats", "chat_mode", "TEXT NOT NULL DEFAULT 'casual'")
}

const groupChatCols = `id, room_uuid, topic, goal, max_rounds, current_round, status,
	moderator_agent_id, moderator_peer_id, schedule_mode, created_by_local,
	host_peer_id, local_session_id, deadline, created_at, updated_at, chat_mode`

func scanGroupChat(scanner interface{ Scan(...interface{}) error }) (*GroupChat, error) {
	var g GroupChat
	var createdByLocal int
	var deadline sql.NullTime
	err := scanner.Scan(&g.ID, &g.RoomUUID, &g.Topic, &g.Goal, &g.MaxRounds, &g.CurrentRound, &g.Status,
		&g.ModeratorAgentID, &g.ModeratorPeerID, &g.ScheduleMode, &createdByLocal,
		&g.HostPeerID, &g.LocalSessionID, &deadline, &g.CreatedAt, &g.UpdatedAt, &g.ChatMode)
	if err != nil {
		return nil, err
	}
	g.CreatedByLocal = createdByLocal == 1
	if g.ChatMode == "" {
		g.ChatMode = "casual"
	}
	if deadline.Valid {
		v := deadline.Time
		g.Deadline = &v
	}
	return &g, nil
}

func CreateGroupChat(g *GroupChat) (int64, error) {
	createdByLocal := 0
	if g.CreatedByLocal {
		createdByLocal = 1
	}
	chatMode := g.ChatMode
	if chatMode == "" {
		chatMode = "casual"
	}
	res, err := DB.Exec(`
		INSERT INTO group_chats
			(room_uuid, topic, goal, max_rounds, status, moderator_agent_id, moderator_peer_id,
			 schedule_mode, created_by_local, host_peer_id, local_session_id, chat_mode)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		g.RoomUUID, g.Topic, g.Goal, g.MaxRounds, g.Status,
		g.ModeratorAgentID, g.ModeratorPeerID, g.ScheduleMode,
		createdByLocal, g.HostPeerID, g.LocalSessionID, chatMode)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func GetGroupChat(id int64) (*GroupChat, error) {
	return scanGroupChat(DB.QueryRow(`SELECT `+groupChatCols+` FROM group_chats WHERE id=?`, id))
}

func GetGroupChatByUUID(uuid string) (*GroupChat, error) {
	return scanGroupChat(DB.QueryRow(`SELECT `+groupChatCols+` FROM group_chats WHERE room_uuid=?`, uuid))
}

func ListGroupChats() ([]GroupChat, error) {
	rows, err := DB.Query(`SELECT ` + groupChatCols + ` FROM group_chats ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]GroupChat, 0)
	for rows.Next() {
		g, err := scanGroupChat(rows)
		if err != nil {
			continue
		}
		out = append(out, *g)
	}
	return out, nil
}

func UpdateGroupChatStatus(id int64, status string) error {
	_, err := DB.Exec(`UPDATE group_chats SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, status, id)
	return err
}

func UpdateGroupChatRound(id int64, round int) error {
	_, err := DB.Exec(`UPDATE group_chats SET current_round=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, round, id)
	return err
}

func UpdateGroupChatLocalSession(id, sessionID int64) error {
	_, err := DB.Exec(`UPDATE group_chats SET local_session_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, sessionID, id)
	return err
}

func DeleteGroupChat(id int64) error {
	DB.Exec(`DELETE FROM group_messages WHERE room_id=?`, id)
	DB.Exec(`DELETE FROM group_members WHERE room_id=?`, id)
	_, err := DB.Exec(`DELETE FROM group_chats WHERE id=?`, id)
	return err
}

// ─── Group Members ───────────────────────────────────────────────

func AddGroupMember(m *GroupMember) (int64, error) {
	isLocal := 0
	if m.IsLocal {
		isLocal = 1
	}
	res, err := DB.Exec(`
		INSERT INTO group_members (room_id, peer_id, peer_nickname, agent_id, agent_name, agent_caps, is_local, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		m.RoomID, m.PeerID, m.PeerNickname, m.AgentID, m.AgentName, m.AgentCaps, isLocal, m.Status)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListGroupMembers(roomID int64) ([]GroupMember, error) {
	rows, err := DB.Query(`
		SELECT id, room_id, peer_id, peer_nickname, agent_id, agent_name, agent_caps, is_local, status, joined_at
		FROM group_members WHERE room_id=? ORDER BY joined_at ASC`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]GroupMember, 0)
	for rows.Next() {
		var m GroupMember
		var isLocal int
		if err := rows.Scan(&m.ID, &m.RoomID, &m.PeerID, &m.PeerNickname, &m.AgentID, &m.AgentName, &m.AgentCaps, &isLocal, &m.Status, &m.JoinedAt); err != nil {
			continue
		}
		m.IsLocal = isLocal == 1
		out = append(out, m)
	}
	return out, nil
}

func UpdateGroupMemberStatus(roomID int64, peerID string, agentName string, status string) error {
	_, err := DB.Exec(`UPDATE group_members SET status=? WHERE room_id=? AND peer_id=? AND agent_name=?`,
		status, roomID, peerID, agentName)
	return err
}

func RemoveGroupMember(roomID int64, peerID string, agentName string) error {
	_, err := DB.Exec(`DELETE FROM group_members WHERE room_id=? AND peer_id=? AND agent_name=?`,
		roomID, peerID, agentName)
	return err
}

// LookupAgentIDByName 精确名称查找非内置 Agent（跨实例同步时重建 member.agent_id）
func LookupAgentIDByName(name string) int64 {
	n := strings.TrimSpace(name)
	if n == "" {
		return 0
	}
	var id sql.NullInt64
	err := DB.QueryRow(`SELECT id FROM agents WHERE name=? AND builtin=0 LIMIT 1`, n).Scan(&id)
	if err != nil || !id.Valid {
		return 0
	}
	return id.Int64
}

// GroupMemberSyncRow 跨实例同步用成员快照一行（宿主全量推送）
type GroupMemberSyncRow struct {
	PeerID       string `json:"peer_id"`
	PeerNickname string `json:"peer_nickname"`
	AgentName    string `json:"agent_name"`
	AgentID      int64  `json:"agent_id"` // 仅发送方本端成员的 ID；接收方只会保存「自己 peer」名下的 ID
	AgentCaps    string `json:"agent_caps"`
	Status       string `json:"status"`
}

// ReplaceGroupMembersForSync 丢弃旧成员并以快照重建（远端侧与宿主侧推送保持一致）
func ReplaceGroupMembersForSync(roomID int64, receiverPeerID string, rows []GroupMemberSyncRow) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM group_members WHERE room_id=?`, roomID); err != nil {
		return err
	}
	for _, r := range rows {
		if r.PeerID == "" || r.AgentName == "" {
			continue
		}
		isLocal := receiverPeerID != "" && r.PeerID == receiverPeerID
		isLocalFlag := 0
		if isLocal {
			isLocalFlag = 1
		}
		aid := int64(0)
		if isLocal {
			// 宿主推送的 AgentID 在接收端不可靠，必须与本地 agents 表按名称校准
			if r.AgentID > 0 {
				if ga, err := GetAgent(r.AgentID); err == nil && ga != nil && ga.Name == r.AgentName {
					aid = r.AgentID
				}
			}
			if aid == 0 {
				aid = LookupAgentIDByName(r.AgentName)
			}
		}
		caps := r.AgentCaps
		if caps == "" {
			caps = "[]"
		}
		st := r.Status
		if st == "" {
			st = "joined"
		}
		if _, err := tx.Exec(`
			INSERT INTO group_members (room_id, peer_id, peer_nickname, agent_id, agent_name, agent_caps, is_local, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			roomID, r.PeerID, r.PeerNickname, aid, r.AgentName, caps, isLocalFlag, st); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ─── Group Messages ──────────────────────────────────────────────

const groupMsgCols = `id, room_id, sender_peer_id, sender_agent_id, sender_agent_name,
	msg_type, content, mentioned_agents, round, created_at,
	reply_to_id, is_recalled, recalled_at, images, client_msg_id, edited_at`

func scanGroupMessage(scanner interface{ Scan(...interface{}) error }) (*GroupMessage, error) {
	var m GroupMessage
	var isRecalled int
	var recalledAt, editedAt sql.NullTime
	err := scanner.Scan(&m.ID, &m.RoomID, &m.SenderPeerID, &m.SenderAgentID, &m.SenderAgentName,
		&m.MsgType, &m.Content, &m.MentionedAgents, &m.Round, &m.CreatedAt,
		&m.ReplyToID, &isRecalled, &recalledAt, &m.Images, &m.ClientMsgID, &editedAt)
	if err != nil {
		return nil, err
	}
	m.IsRecalled = isRecalled == 1
	if recalledAt.Valid {
		t := recalledAt.Time
		m.RecalledAt = &t
	}
	if editedAt.Valid {
		t := editedAt.Time
		m.EditedAt = &t
	}
	if m.Images == "" {
		m.Images = "[]"
	}
	return &m, nil
}

// CreateGroupMessage 写入一条群消息
// 支持可选的 reply_to_id / images / client_msg_id
func CreateGroupMessage(m *GroupMessage) (int64, error) {
	images := m.Images
	if images == "" {
		images = "[]"
	}
	mentioned := m.MentionedAgents
	if mentioned == "" {
		mentioned = "[]"
	}
	res, err := DB.Exec(`
		INSERT INTO group_messages
			(room_id, sender_peer_id, sender_agent_id, sender_agent_name,
			 msg_type, content, mentioned_agents, round,
			 reply_to_id, images, client_msg_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.RoomID, m.SenderPeerID, m.SenderAgentID, m.SenderAgentName,
		m.MsgType, m.Content, mentioned, m.Round,
		m.ReplyToID, images, m.ClientMsgID)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	m.ID = id
	if m.MentionedAgents == "" {
		m.MentionedAgents = mentioned
	}
	if m.Images == "" {
		m.Images = images
	}
	return id, nil
}

func ListGroupMessages(roomID int64) ([]GroupMessage, error) {
	rows, err := DB.Query(`
		SELECT `+groupMsgCols+`
		FROM group_messages WHERE room_id=? ORDER BY created_at ASC, id ASC`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]GroupMessage, 0)
	for rows.Next() {
		m, err := scanGroupMessage(rows)
		if err != nil {
			continue
		}
		out = append(out, *m)
	}
	return out, nil
}

// ListGroupMessagesPaged 分页获取消息（按 ID 倒序游标）
// before=0 表示取最新一页；limit<=0 默认 30，最大 200
func ListGroupMessagesPaged(roomID int64, before int64, limit int) ([]GroupMessage, error) {
	if limit <= 0 {
		limit = 30
	}
	if limit > 200 {
		limit = 200
	}
	var rows *sql.Rows
	var err error
	if before > 0 {
		rows, err = DB.Query(`
			SELECT `+groupMsgCols+`
			FROM group_messages WHERE room_id=? AND id<? ORDER BY id DESC LIMIT ?`,
			roomID, before, limit)
	} else {
		rows, err = DB.Query(`
			SELECT `+groupMsgCols+`
			FROM group_messages WHERE room_id=? ORDER BY id DESC LIMIT ?`,
			roomID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]GroupMessage, 0, limit)
	for rows.Next() {
		m, err := scanGroupMessage(rows)
		if err != nil {
			continue
		}
		out = append(out, *m)
	}
	// 反转为时间正序
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// GetGroupMessage 按 ID 查询一条消息（用于引用渲染）
func GetGroupMessage(id int64) (*GroupMessage, error) {
	row := DB.QueryRow(`SELECT `+groupMsgCols+` FROM group_messages WHERE id=?`, id)
	return scanGroupMessage(row)
}

// GetRecentGroupMessages 取最近 N 条消息（群聊共享上下文）
func GetRecentGroupMessages(roomID int64, limit int) ([]GroupMessage, error) {
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := DB.Query(`
		SELECT `+groupMsgCols+`
		FROM group_messages WHERE room_id=? ORDER BY created_at DESC, id DESC LIMIT ?`, roomID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]GroupMessage, 0, limit)
	for rows.Next() {
		m, err := scanGroupMessage(rows)
		if err != nil {
			continue
		}
		out = append(out, *m)
	}
	// 反转：最早 → 最新
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// GetLastGroupMessageTime 群最后一条消息时间（用于冷场检测）
// 不存在则返回 group_chats.created_at
func GetLastGroupMessageTime(roomID int64) (time.Time, error) {
	var t sql.NullTime
	err := DB.QueryRow(`SELECT MAX(created_at) FROM group_messages WHERE room_id=?`, roomID).Scan(&t)
	if err != nil {
		return time.Time{}, err
	}
	if t.Valid {
		return t.Time, nil
	}
	// 回退到 room 创建时间
	var ct sql.NullTime
	DB.QueryRow(`SELECT created_at FROM group_chats WHERE id=?`, roomID).Scan(&ct)
	if ct.Valid {
		return ct.Time, nil
	}
	return time.Time{}, nil
}

// RecallGroupMessage 撤回一条消息
// senderPeerID + senderAgentName 用于校验所有者（用户消息时 senderAgentName 为用户昵称）
// withinSeconds 限制撤回时效（如 120）；<=0 表示不限制
func RecallGroupMessage(messageID int64, senderPeerID, senderAgentName string, withinSeconds int) error {
	m, err := GetGroupMessage(messageID)
	if err != nil {
		return err
	}
	if m == nil {
		return sql.ErrNoRows
	}
	if m.IsRecalled {
		return nil
	}
	// 所有者校验
	if senderPeerID != "" && m.SenderPeerID != senderPeerID {
		return ErrNotOwner
	}
	if senderAgentName != "" && m.SenderAgentName != senderAgentName {
		return ErrNotOwner
	}
	if withinSeconds > 0 && time.Since(m.CreatedAt) > time.Duration(withinSeconds)*time.Second {
		return ErrTooLate
	}
	_, err = DB.Exec(`UPDATE group_messages SET is_recalled=1, recalled_at=CURRENT_TIMESTAMP WHERE id=?`, messageID)
	return err
}
