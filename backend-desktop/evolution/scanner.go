package evolution

import (
	"log/slog"
	"time"

	"lingxi-agent/db"
)

// AnalyzeFunc 由 main 包注入，触发针对 (agentID, sessionID, ctx, trigger) 的进化分析
type AnalyzeFunc func(agentID, sessionID int64, ctx, trigger string)

// ContextBuilder 由 main 包注入，根据会话 ID 构建对话上下文文本
type ContextBuilder func(sessionID int64, beforeMsgID int64) string

// BroadcastFunc 由 main 包注入，向 WebSocket 广播事件
type BroadcastFunc func(event, data string)

// Config 全局扫描器配置
type Config struct {
	Enabled            bool
	ScanInterval       time.Duration // 扫描周期（默认 6h）
	MinSessionMessages int           // 会话最少消息数（默认 10）
	CooldownHours      int           // 距上次进化的冷却时间（默认 24h）
	QuietStart         int           // 安静时段开始小时（0-23，-1 表示不启用）
	QuietEnd           int           // 安静时段结束小时
}

var (
	analyzer  AnalyzeFunc
	ctxBuild  ContextBuilder
	broadcast BroadcastFunc
	cfg       = Config{
		Enabled:            true,
		ScanInterval:       3 * time.Hour,
		MinSessionMessages: 4,
		CooldownHours:      6,
		QuietStart:         -1,
		QuietEnd:           -1,
	}
	stopCh chan struct{}
)

// Init 注入依赖
func Init(a AnalyzeFunc, cb ContextBuilder, b BroadcastFunc) {
	analyzer = a
	ctxBuild = cb
	broadcast = b
}

// SetConfig 更新运行时配置（前端 API 可调用）
func SetConfig(c Config) {
	if c.ScanInterval < 30*time.Minute {
		c.ScanInterval = 30 * time.Minute
	}
	if c.MinSessionMessages < 2 {
		c.MinSessionMessages = 2
	}
	if c.CooldownHours < 1 {
		c.CooldownHours = 1
	}
	cfg = c
}

// GetConfig 获取当前配置
func GetConfig() Config {
	return cfg
}

// StartScanner 启动全局进化扫描器（每 N 小时巡检一次）
func StartScanner() {
	stopCh = make(chan struct{})
	go func() {
		// 启动后等 60 秒再首扫，避开冷启动峰值
		select {
		case <-time.After(60 * time.Second):
		case <-stopCh:
			return
		}
		runScan()
		ticker := time.NewTicker(cfg.ScanInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if cfg.Enabled && !inQuietHours() {
					runScan()
				}
				// 配置可能变更，重设 ticker 周期
				ticker.Reset(cfg.ScanInterval)
			case <-stopCh:
				slog.Info("evolution scanner stopped")
				return
			}
		}
	}()
	slog.Info("evolution scanner started", "interval", cfg.ScanInterval.String())
}

// Stop 停止扫描器
func Stop() {
	if stopCh != nil {
		close(stopCh)
	}
}

func inQuietHours() bool {
	if cfg.QuietStart < 0 || cfg.QuietEnd < 0 {
		return false
	}
	h := time.Now().Hour()
	if cfg.QuietStart < cfg.QuietEnd {
		return h >= cfg.QuietStart && h < cfg.QuietEnd
	}
	// 跨午夜
	return h >= cfg.QuietStart || h < cfg.QuietEnd
}

// runScan 执行一次全量扫描：找出符合条件的会话并触发进化
func runScan() {
	if analyzer == nil || ctxBuild == nil {
		slog.Warn("evolution scan: skipped (analyzer or ctxBuild not initialized)")
		return
	}

	emitProgress("scan_start", "开始全局进化巡检", 0, 0)

	// 找出所有 agent 并检查 evolution_enabled
	rows, err := db.DB.Query(`SELECT id, name FROM agents`)
	if err != nil {
		slog.Warn("evolution scan: list agents failed", "err", err)
		return
	}
	type agentInfo struct {
		ID   int64
		Name string
	}
	var allAgents []agentInfo
	for rows.Next() {
		var a agentInfo
		if err := rows.Scan(&a.ID, &a.Name); err == nil {
			allAgents = append(allAgents, a)
		}
	}
	rows.Close()

	enabledAgents := make([]int64, 0, len(allAgents))
	for _, a := range allAgents {
		if db.GetAgentEvolutionEnabled(a.ID) {
			enabledAgents = append(enabledAgents, a.ID)
		}
	}

	slog.Info("evolution scan: agent check",
		"total_agents", len(allAgents),
		"evolution_enabled", len(enabledAgents),
	)
	if len(enabledAgents) == 0 {
		slog.Info("evolution scan: no agents have evolution enabled, skipping scan")
		emitProgress("scan_done", "未找到启用进化的智能体", 0, 0)
		return
	}

	totalCandidates := 0
	dispatched := 0
	cooldown := time.Duration(cfg.CooldownHours) * time.Hour

	for _, aid := range enabledAgents {
		// 找该 agent 下消息数 ≥ 阈值且未在冷却中的会话
		sessRows, err := db.DB.Query(`
			SELECT s.id, s.message_count, s.updated_at
			FROM sessions s
			WHERE s.agent_id = ?
			  AND s.message_count >= ?
			  AND COALESCE(s.is_a2a, 0) = 0
			ORDER BY s.updated_at DESC
			LIMIT 50
		`, aid, cfg.MinSessionMessages)
		if err != nil {
			continue
		}

		for sessRows.Next() {
			var sid int64
			var mc int
			var updated time.Time
			if err := sessRows.Scan(&sid, &mc, &updated); err != nil {
				continue
			}
			totalCandidates++

			// 检查冷却：该会话最近一次自动进化时间
			var lastEvoTS time.Time
			db.DB.QueryRow(`SELECT MAX(created_at) FROM evolution_logs WHERE session_id=? AND trigger LIKE 'auto%'`, sid).Scan(&lastEvoTS)
			if !lastEvoTS.IsZero() && time.Since(lastEvoTS) < cooldown {
				continue
			}

			ctx := ctxBuild(sid, 0)
			if ctx == "" {
				continue
			}
			analyzer(aid, sid, ctx, "auto_scanner")
			dispatched++

			// 每次最多分发 5 个，避免一波打爆 LLM
			if dispatched >= 5 {
				break
			}
		}
		sessRows.Close()
		if dispatched >= 5 {
			break
		}
	}

	emitProgress("scan_done", "巡检完成", totalCandidates, dispatched)
	slog.Info("evolution scan done", "agents", len(enabledAgents), "candidates", totalCandidates, "dispatched", dispatched)
}

func emitProgress(phase, msg string, total, dispatched int) {
	if broadcast == nil {
		return
	}
	payload := `{"phase":"` + phase + `","message":"` + msg + `","candidates":` + intStr(total) + `,"dispatched":` + intStr(dispatched) + `}`
	broadcast("evolution_scan_progress", payload)
}

func intStr(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
