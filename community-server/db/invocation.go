package db

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"community-server/model"
)

// generateCode 生成 6 位邀请码（大写字母+数字，避免 0/O/1/I 容易混淆）
func generateCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	rand.Read(b)
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

// CreateInvocation 创建邀请码
func CreateInvocation(agentID, issuerID string, dailyLimit int, expiresAt *time.Time) (*model.Invocation, error) {
	if dailyLimit <= 0 {
		dailyLimit = 50
	}
	// 重试最多 5 次防止 code 冲突
	var code string
	for i := 0; i < 5; i++ {
		code = generateCode()
		var exists int
		DB.QueryRow(`SELECT COUNT(*) FROM invocations WHERE code = ?`, code).Scan(&exists)
		if exists == 0 {
			break
		}
	}
	if code == "" {
		return nil, fmt.Errorf("failed to generate unique code")
	}

	var expInt *int64
	if expiresAt != nil {
		v := expiresAt.Unix()
		expInt = &v
	}

	now := time.Now().Unix()
	_, err := DB.Exec(`INSERT INTO invocations (code, agent_id, issuer_id, daily_limit, expires_at, is_active, created_at)
		VALUES (?, ?, ?, ?, ?, 1, ?)`, code, agentID, issuerID, dailyLimit, expInt, now)
	if err != nil {
		return nil, err
	}
	return &model.Invocation{
		Code:       code,
		AgentID:    agentID,
		IssuerID:   issuerID,
		DailyLimit: dailyLimit,
		ExpiresAt:  expiresAt,
		IsActive:   true,
		CreatedAt:  time.Unix(now, 0),
	}, nil
}

// GetInvocation 通过 code 查询邀请码
func GetInvocation(code string) (*model.Invocation, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	inv := &model.Invocation{}
	var isActive int
	var createdAt int64
	var expiresAt sql.NullInt64
	err := DB.QueryRow(`SELECT code, agent_id, issuer_id, daily_limit, expires_at, is_active, created_at
		FROM invocations WHERE code = ?`, code).
		Scan(&inv.Code, &inv.AgentID, &inv.IssuerID, &inv.DailyLimit, &expiresAt, &isActive, &createdAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if expiresAt.Valid {
		t := time.Unix(expiresAt.Int64, 0)
		inv.ExpiresAt = &t
	}
	inv.IsActive = isActive == 1
	inv.CreatedAt = time.Unix(createdAt, 0)
	return inv, nil
}

// ListInvocationsByAgent 列出某 Agent 的所有邀请码
func ListInvocationsByAgent(agentID string) ([]*model.Invocation, error) {
	rows, err := DB.Query(`SELECT code, agent_id, issuer_id, daily_limit, expires_at, is_active, created_at
		FROM invocations WHERE agent_id = ? ORDER BY created_at DESC`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*model.Invocation
	for rows.Next() {
		inv := &model.Invocation{}
		var isActive int
		var createdAt int64
		var expiresAt sql.NullInt64
		if err := rows.Scan(&inv.Code, &inv.AgentID, &inv.IssuerID, &inv.DailyLimit, &expiresAt, &isActive, &createdAt); err != nil {
			return nil, err
		}
		if expiresAt.Valid {
			t := time.Unix(expiresAt.Int64, 0)
			inv.ExpiresAt = &t
		}
		inv.IsActive = isActive == 1
		inv.CreatedAt = time.Unix(createdAt, 0)
		out = append(out, inv)
	}
	return out, nil
}

// ListInvocationsByIssuer 列出某用户发布的所有邀请码
func ListInvocationsByIssuer(userID string) ([]*model.Invocation, error) {
	rows, err := DB.Query(`SELECT code, agent_id, issuer_id, daily_limit, expires_at, is_active, created_at
		FROM invocations WHERE issuer_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*model.Invocation
	for rows.Next() {
		inv := &model.Invocation{}
		var isActive int
		var createdAt int64
		var expiresAt sql.NullInt64
		if err := rows.Scan(&inv.Code, &inv.AgentID, &inv.IssuerID, &inv.DailyLimit, &expiresAt, &isActive, &createdAt); err != nil {
			return nil, err
		}
		if expiresAt.Valid {
			t := time.Unix(expiresAt.Int64, 0)
			inv.ExpiresAt = &t
		}
		inv.IsActive = isActive == 1
		inv.CreatedAt = time.Unix(createdAt, 0)
		out = append(out, inv)
	}
	return out, nil
}

// ToggleInvocation 启用/禁用邀请码
func ToggleInvocation(code string, isActive bool) error {
	_, err := DB.Exec(`UPDATE invocations SET is_active = ? WHERE code = ?`, boolToInt(isActive), code)
	return err
}

// DeleteInvocation 删除邀请码（同时清理调用日志）
func DeleteInvocation(code string) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	tx.Exec(`DELETE FROM invocation_logs WHERE code = ?`, code)
	_, err = tx.Exec(`DELETE FROM invocations WHERE code = ?`, code)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// CountInvocationsToday 查询某邀请码今日已调用次数（用于限流）
func CountInvocationsToday(code string) (int, error) {
	// 计算今日 0 点（UTC）
	now := time.Now().UTC()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM invocation_logs WHERE code = ? AND success = 1 AND created_at >= ?`,
		code, start.Unix()).Scan(&count)
	return count, err
}

// LogInvocation 写入调用日志
func LogInvocation(code, callerID, callerIP string, success bool, errMsg string, latencyMs int64) {
	now := time.Now().Unix()
	var callerArg interface{} = nil
	if callerID != "" {
		callerArg = callerID
	}
	DB.Exec(`INSERT INTO invocation_logs (code, caller_id, caller_ip, success, error_msg, latency_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, code, callerArg, callerIP, boolToInt(success), errMsg, latencyMs, now)
}

// ListInvocationLogsByIssuer 列出某用户所有 Agent 的调用日志（审计页用）
func ListInvocationLogsByIssuer(userID string, limit int) ([]*model.InvocationLog, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := DB.Query(`SELECT l.id, l.code, l.caller_id, l.caller_ip, l.success, l.error_msg, l.latency_ms, l.created_at
		FROM invocation_logs l
		JOIN invocations i ON l.code = i.code
		WHERE i.issuer_id = ?
		ORDER BY l.created_at DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*model.InvocationLog
	for rows.Next() {
		log := &model.InvocationLog{}
		var success int
		var createdAt int64
		var callerID sql.NullString
		if err := rows.Scan(&log.ID, &log.Code, &callerID, &log.CallerIP, &success, &log.ErrorMsg, &log.LatencyMs, &createdAt); err != nil {
			return nil, err
		}
		if callerID.Valid {
			s := callerID.String
			log.CallerID = &s
		}
		log.Success = success == 1
		log.CreatedAt = time.Unix(createdAt, 0)
		out = append(out, log)
	}
	return out, nil
}
