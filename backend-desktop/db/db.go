package db

import (
	"database/sql"
	"log/slog"
	"os"

	"lingxi-agent/config"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

var DB *sql.DB

func Init() {
	cfg := config.Get()

	var err error
	DB, err = sql.Open("sqlite3", "file:"+cfg.DB.Path+"?_journal=WAL&_timeout=5000")
	if err != nil {
		slog.Error("db open error", "err", err)
		os.Exit(1)
	}

	DB.SetMaxOpenConns(4)

	if err = DB.Ping(); err != nil {
		slog.Error("db ping error", "err", err)
		os.Exit(1)
	}

	migrate()
	slog.Info("SQLite ready", "path", cfg.DB.Path)
}

func ensureSchemaVersionTable() {
	DB.Exec(`CREATE TABLE IF NOT EXISTS schema_version (
		version    INTEGER PRIMARY KEY,
		name       TEXT    NOT NULL DEFAULT '',
		applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
}

func currentSchemaVersion() int {
	var v int
	DB.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_version`).Scan(&v)
	return v
}

func recordMigration(version int, name string) {
	DB.Exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (?, ?)`, version, name)
}

func migrate() {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			id                INTEGER PRIMARY KEY AUTOINCREMENT,
			title             TEXT    NOT NULL DEFAULT '新对话',
			claude_session_id TEXT    DEFAULT '',
			message_count     INTEGER NOT NULL DEFAULT 0,
			created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL,
			role       TEXT    NOT NULL,
			content    TEXT    NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS skills (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			name        TEXT    NOT NULL UNIQUE,
			description TEXT    NOT NULL DEFAULT '',
			file_path   TEXT    NOT NULL DEFAULT '',
			installed   INTEGER NOT NULL DEFAULT 0,
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id  INTEGER NOT NULL,
			title       TEXT    NOT NULL DEFAULT '',
			status      TEXT    NOT NULL DEFAULT 'running',
			progress    TEXT    NOT NULL DEFAULT '',
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS pending_tasks (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id     INTEGER NOT NULL UNIQUE,
			task_desc      TEXT    NOT NULL DEFAULT '',
			missing_fields TEXT    NOT NULL DEFAULT '[]',
			created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS knowledge (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			title      TEXT    NOT NULL DEFAULT '',
			file_path  TEXT    NOT NULL UNIQUE,
			category   TEXT    NOT NULL DEFAULT 'docs',
			tags       TEXT    NOT NULL DEFAULT '[]',
			summary    TEXT    NOT NULL DEFAULT '',
			size       INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS im_connectors (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			platform   TEXT    NOT NULL UNIQUE,
			enabled    INTEGER NOT NULL DEFAULT 0,
			config     TEXT    NOT NULL DEFAULT '{}',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS im_sessions (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			platform    TEXT    NOT NULL,
			scope_key   TEXT    NOT NULL,
			session_id  INTEGER NOT NULL,
			last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(platform, scope_key)
		)`,
		// ── providers / api_profiles / usage（v2+）────────────────
		`CREATE TABLE IF NOT EXISTS providers (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			code             TEXT    NOT NULL UNIQUE,
			name             TEXT    NOT NULL,
			protocol         TEXT    NOT NULL DEFAULT 'anthropic',
			default_base_url TEXT    NOT NULL DEFAULT '',
			default_model    TEXT    NOT NULL DEFAULT '',
			usage_api_meta   TEXT    NOT NULL DEFAULT '{}',
			doc_url          TEXT    NOT NULL DEFAULT '',
			builtin          INTEGER NOT NULL DEFAULT 0,
			created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS api_profiles (
			id                 INTEGER PRIMARY KEY AUTOINCREMENT,
			name               TEXT    NOT NULL,
			provider_id        INTEGER NOT NULL,
			base_url           TEXT    NOT NULL DEFAULT '',
			model              TEXT    NOT NULL DEFAULT '',
			auth_token_cipher  TEXT    NOT NULL DEFAULT '',
			auth_token_mask    TEXT    NOT NULL DEFAULT '',
			extra              TEXT    NOT NULL DEFAULT '{}',
			is_active          INTEGER NOT NULL DEFAULT 0,
			created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS usage_records (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id  INTEGER NOT NULL,
			message_id  INTEGER NOT NULL DEFAULT 0,
			profile_id  INTEGER NOT NULL DEFAULT 0,
			model       TEXT    NOT NULL DEFAULT '',
			input_tokens   INTEGER NOT NULL DEFAULT 0,
			output_tokens  INTEGER NOT NULL DEFAULT 0,
			cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
			cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
			cost_usd    REAL    NOT NULL DEFAULT 0,
			duration_ms INTEGER NOT NULL DEFAULT 0,
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_records_session ON usage_records(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_records_created ON usage_records(created_at)`,
		`CREATE TABLE IF NOT EXISTS usage_quota_cache (
			profile_id  INTEGER PRIMARY KEY,
			snapshot    TEXT    NOT NULL DEFAULT '{}',
			fetched_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		// ── MCP Servers ──────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS mcp_servers (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			name         TEXT    NOT NULL UNIQUE,
			transport    TEXT    NOT NULL DEFAULT 'stdio',
			command      TEXT    NOT NULL DEFAULT '',
			args         TEXT    NOT NULL DEFAULT '[]',
			env          TEXT    NOT NULL DEFAULT '{}',
			url          TEXT    NOT NULL DEFAULT '',
			headers      TEXT    NOT NULL DEFAULT '{}',
			enabled      INTEGER NOT NULL DEFAULT 1,
			builtin      INTEGER NOT NULL DEFAULT 0,
			description  TEXT    NOT NULL DEFAULT '',
			created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		// ── Agents（智能体工厂）─────────────────────────────────
		`CREATE TABLE IF NOT EXISTS agents (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			name            TEXT    NOT NULL,
			avatar          TEXT    NOT NULL DEFAULT '✦',
			description     TEXT    NOT NULL DEFAULT '',
			system_prompt   TEXT    NOT NULL DEFAULT '',
			profile_id      INTEGER NOT NULL DEFAULT 0,
			skill_ids       TEXT    NOT NULL DEFAULT '[]',
			mcp_server_ids  TEXT    NOT NULL DEFAULT '[]',
			knowledge_ids   TEXT    NOT NULL DEFAULT '[]',
			allow_all       INTEGER NOT NULL DEFAULT 1,
			builtin         INTEGER NOT NULL DEFAULT 0,
			created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s); err != nil {
			slog.Error("db migrate error", "err", err, "sql", s)
			os.Exit(1)
		}
	}

	// 列级迁移：messages.usage（保存每条消息的 token/cost 摘要）
	addColumnIfMissing("messages", "usage", "TEXT NOT NULL DEFAULT ''")
	// 列级迁移：api_profiles.transformer（bridge 路由层保留字段，留空表示自动）
	addColumnIfMissing("api_profiles", "transformer", "TEXT NOT NULL DEFAULT ''")
	// 列级迁移：sessions.agent_id（关联智能体；0=通用助理）
	addColumnIfMissing("sessions", "agent_id", "INTEGER NOT NULL DEFAULT 0")
	// 列级迁移：sessions.pinned（置顶会话）
	addColumnIfMissing("sessions", "pinned", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("usage_records", "estimated", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("agents", "temperature", "REAL NOT NULL DEFAULT 0")
	addColumnIfMissing("agents", "max_tokens", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("skills", "source", "TEXT NOT NULL DEFAULT 'local'")
	addColumnIfMissing("skills", "marketplace_id", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("skills", "marketplace_version", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("skills", "author", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("messages", "feedback", "TEXT NOT NULL DEFAULT ''")

	// ── 定时任务 表 ──────────────────────────────────────────────
	for _, s := range []string{
		`CREATE TABLE IF NOT EXISTS scheduled_tasks (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			name            TEXT    NOT NULL,
			prompt          TEXT    NOT NULL DEFAULT '',
			agent_id        INTEGER NOT NULL DEFAULT 0,
			cron_expr       TEXT    NOT NULL DEFAULT '',
			stateful        INTEGER NOT NULL DEFAULT 0,
			session_id      INTEGER DEFAULT NULL,
			notify_desktop  INTEGER NOT NULL DEFAULT 1,
			enabled         INTEGER NOT NULL DEFAULT 1,
			last_run_at     DATETIME DEFAULT NULL,
			next_run_at     DATETIME DEFAULT NULL,
			run_count       INTEGER NOT NULL DEFAULT 0,
			created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS scheduled_task_runs (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id     INTEGER NOT NULL,
			session_id  INTEGER NOT NULL,
			status      TEXT    NOT NULL DEFAULT 'running',
			summary     TEXT    NOT NULL DEFAULT '',
			started_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			finished_at DATETIME DEFAULT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_sched_runs_task ON scheduled_task_runs(task_id)`,
	} {
		if _, err := DB.Exec(s); err != nil {
			slog.Warn("scheduled_tasks migrate", "err", err)
		}
	}

	// ── 长期记忆表 ─────────────────────────────────────────────────
	for _, s := range []string{
		`CREATE TABLE IF NOT EXISTS memories (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			agent_id   INTEGER NOT NULL DEFAULT 0,
			content    TEXT    NOT NULL,
			category   TEXT    NOT NULL DEFAULT 'general',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id)`,
	} {
		if _, err := DB.Exec(s); err != nil {
			slog.Warn("memories migrate", "err", err)
		}
	}

	// ── 知识库自定义分类表 ───────────────────────────────────────────
	for _, s := range []string{
		`CREATE TABLE IF NOT EXISTS knowledge_categories (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT    NOT NULL,
			icon       TEXT    NOT NULL DEFAULT '📁',
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
	} {
		if _, err := DB.Exec(s); err != nil {
			slog.Warn("knowledge_categories migrate", "err", err)
		}
	}
	// ── 知识库向量嵌入分块表 ─────────────────────────────────────────
	for _, s := range []string{
		`CREATE TABLE IF NOT EXISTS kb_chunks (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			knowledge_id INTEGER NOT NULL,
			chunk_index  INTEGER NOT NULL DEFAULT 0,
			content      TEXT    NOT NULL,
			embedding    TEXT    NOT NULL DEFAULT '[]',
			created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (knowledge_id) REFERENCES knowledge(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_kb_chunks_kid ON kb_chunks(knowledge_id)`,
	} {
		if _, err := DB.Exec(s); err != nil {
			slog.Warn("kb_chunks migrate", "err", err)
		}
	}

	// 预置默认分类（仅在表为空时插入）
	var catCount int
	DB.QueryRow(`SELECT COUNT(1) FROM knowledge_categories`).Scan(&catCount)
	if catCount == 0 {
		for _, s := range []string{
			`INSERT INTO knowledge_categories (name, icon, sort_order) VALUES ('文档', '📄', 1)`,
			`INSERT INTO knowledge_categories (name, icon, sort_order) VALUES ('问答', '💬', 2)`,
			`INSERT INTO knowledge_categories (name, icon, sort_order) VALUES ('数据', '📊', 3)`,
		} {
			DB.Exec(s)
		}
	}

	// 列级迁移：sessions.summary（对话摘要压缩）
	addColumnIfMissing("sessions", "summary", "TEXT NOT NULL DEFAULT ''")
	// 列级迁移：messages.pinned（消息置顶）
	addColumnIfMissing("messages", "pinned", "INTEGER NOT NULL DEFAULT 0")
	// 列级迁移：sessions.folder（会话分组）
	addColumnIfMissing("sessions", "folder", "TEXT NOT NULL DEFAULT ''")
	// 列级迁移：agents.post_actions（工作流后续动作）
	addColumnIfMissing("agents", "post_actions", "TEXT NOT NULL DEFAULT '[]'")
	// 列级迁移：sessions.is_a2a（标记 A2A 专用会话，从主会话列表中隐藏）
	addColumnIfMissing("sessions", "is_a2a", "INTEGER NOT NULL DEFAULT 0")
	// 列级迁移：sessions.permission_mode（会话权限模式：trust=完全放行, managed=权限管控）
	addColumnIfMissing("sessions", "permission_mode", "TEXT NOT NULL DEFAULT 'trust'")
	// 列级迁移：sessions.mode（会话模式：''=通用, 'coding'=编程模式）
	addColumnIfMissing("sessions", "mode", "TEXT NOT NULL DEFAULT ''")
	// 列级迁移：sessions.project_path（Coding 模式关联的项目目录）
	addColumnIfMissing("sessions", "project_path", "TEXT NOT NULL DEFAULT ''")
	// 列级迁移：im_connectors 多实例支持
	addColumnIfMissing("im_connectors", "name", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("im_connectors", "agent_id", "INTEGER NOT NULL DEFAULT 0")
	// 移除旧的 platform 唯一索引（如果存在），允许同平台多实例
	DB.Exec(`DROP INDEX IF EXISTS sqlite_autoindex_im_connectors_1`)

	// 注意：a2a_conversations 的列级迁移移至 CREATE TABLE 之后执行（见下方）

	// ── Project Nexus: Agent-to-Agent Communication ──────────────
	for _, s := range []string{
		`CREATE TABLE IF NOT EXISTS nexus_settings (
			id          INTEGER PRIMARY KEY CHECK (id = 1),
			visible     INTEGER NOT NULL DEFAULT 1,
			nickname    TEXT    NOT NULL DEFAULT '',
			listen_port INTEGER NOT NULL DEFAULT 3001
		)`,
		`INSERT OR IGNORE INTO nexus_settings (id, visible, nickname, listen_port) VALUES (1, 1, '', 3001)`,
		`CREATE TABLE IF NOT EXISTS nexus_peers (
			id           TEXT PRIMARY KEY,
			nickname     TEXT    NOT NULL DEFAULT '',
			host         TEXT    NOT NULL,
			port         INTEGER NOT NULL,
			agents_json  TEXT    NOT NULL DEFAULT '[]',
			last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS nexus_contacts (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			peer_id       TEXT    NOT NULL,
			nickname      TEXT    NOT NULL DEFAULT '',
			host          TEXT    NOT NULL,
			port          INTEGER NOT NULL,
			status        TEXT    NOT NULL DEFAULT 'pending',
			shared_secret TEXT    NOT NULL DEFAULT '',
			created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS agent_nexus_config (
			agent_id             INTEGER PRIMARY KEY,
			public               INTEGER NOT NULL DEFAULT 0,
			public_name          TEXT    NOT NULL DEFAULT '',
			capability_tags      TEXT    NOT NULL DEFAULT '[]',
			auth_level           TEXT    NOT NULL DEFAULT 'readonly',
			forbidden_info       TEXT    NOT NULL DEFAULT '',
			public_knowledge_ids TEXT    NOT NULL DEFAULT '[]'
		)`,
		`CREATE TABLE IF NOT EXISTS a2a_conversations (
			id                   INTEGER PRIMARY KEY AUTOINCREMENT,
			local_agent_id       INTEGER NOT NULL,
			remote_agent_name    TEXT    NOT NULL,
			remote_peer_id       TEXT    NOT NULL,
			remote_peer_nickname TEXT    NOT NULL DEFAULT '',
			topic                TEXT    NOT NULL DEFAULT '',
			goal                 TEXT    NOT NULL DEFAULT '',
			initial_prompt       TEXT    NOT NULL DEFAULT '',
			max_rounds           INTEGER NOT NULL DEFAULT 10,
			current_round        INTEGER NOT NULL DEFAULT 0,
			status               TEXT    NOT NULL DEFAULT 'active',
			require_approval     INTEGER NOT NULL DEFAULT 1,
			summary              TEXT    NOT NULL DEFAULT '',
			decisions_json       TEXT    NOT NULL DEFAULT '[]',
			initiated_by         TEXT    NOT NULL DEFAULT 'local',
			remote_conv_id       INTEGER NOT NULL DEFAULT 0,
			local_session_id     INTEGER NOT NULL DEFAULT 0,
			conv_uuid            TEXT    NOT NULL DEFAULT '',
			deadline             DATETIME DEFAULT NULL,
			created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS a2a_messages (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			conversation_id  INTEGER NOT NULL,
			sender           TEXT    NOT NULL,
			sender_agent_name TEXT   NOT NULL DEFAULT '',
			msg_type         TEXT    NOT NULL DEFAULT 'message',
			content          TEXT    NOT NULL DEFAULT '',
			structured_data  TEXT    NOT NULL DEFAULT '{}',
			created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_a2a_messages_conv ON a2a_messages(conversation_id)`,
		`CREATE TABLE IF NOT EXISTS kv_store (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		)`,
	} {
		if _, err := DB.Exec(s); err != nil {
			slog.Warn("nexus migrate", "err", err)
		}
	}

	// 列级迁移：为旧版数据库补齐 a2a_conversations 缺失列
	addColumnIfMissing("a2a_conversations", "remote_conv_id", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("a2a_conversations", "local_session_id", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("a2a_conversations", "conv_uuid", "TEXT NOT NULL DEFAULT ''")

	// ── 用户表（SSO 登录 + 游客）───────────────────────────────────
	for _, s := range []string{
		`CREATE TABLE IF NOT EXISTS users (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			provider    TEXT    NOT NULL DEFAULT 'guest',
			provider_id TEXT    NOT NULL DEFAULT '',
			nickname    TEXT    NOT NULL DEFAULT '游客',
			avatar_url  TEXT    NOT NULL DEFAULT '',
			email       TEXT    NOT NULL DEFAULT '',
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		// OAuth 配置表（各平台 AppID/AppSecret）
		`CREATE TABLE IF NOT EXISTS oauth_configs (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			provider    TEXT    NOT NULL UNIQUE,
			app_id      TEXT    NOT NULL DEFAULT '',
			app_secret  TEXT    NOT NULL DEFAULT '',
			extra       TEXT    NOT NULL DEFAULT '{}',
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
	} {
		if _, err := DB.Exec(s); err != nil {
			slog.Warn("users migrate", "err", err)
		}
	}

	// 列级迁移：nexus_contacts.transport_type（lan/wan 传输类型）
	addColumnIfMissing("nexus_contacts", "transport_type", "TEXT NOT NULL DEFAULT 'lan'")
	// 列级迁移：nexus_settings 广域网相关字段
	addColumnIfMissing("nexus_settings", "signaling_url", "TEXT NOT NULL DEFAULT ''")
	addColumnIfMissing("nexus_settings", "wan_enabled", "INTEGER NOT NULL DEFAULT 0")
	addColumnIfMissing("nexus_settings", "signaling_secret", "TEXT NOT NULL DEFAULT ''")

	// 迁移：已有用户若 signaling_url 为空，填入默认值并启用广域网
	DB.Exec(`UPDATE nexus_settings SET signaling_url='wss://lingxi-singaling-server.onrender.com/ws', wan_enabled=1, signaling_secret='lingxi2026' WHERE id=1 AND (signaling_url='' OR signaling_url IS NULL)`)

	// ── 群聊（Project Nexus 群聊）────────────────────────────────
	MigrateGroupChat()

	// ── 群聊 Agent 人格 ──────────────────────────────────────────
	MigrateAgentPersonality()

	// ── 权限审批 ────────────────────────────────────────────────
	MigratePermission()

	// ── H5 远程访问 ─────────────────────────────────────────────
	MigrateH5Access()

	seedBuiltinProviders()
	seedBuiltinAgent()

	// ── 版本化迁移（增量 schema 变更在此追加）────────────────────────
	ensureSchemaVersionTable()
	v := currentSchemaVersion()

	if v < 1 {
		recordMigration(1, "baseline – all initial tables and columns")
	}
	if v < 2 {
		for _, s := range []string{
			`CREATE TABLE IF NOT EXISTS evolution_logs (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				agent_id    INTEGER NOT NULL DEFAULT 0,
				session_id  INTEGER NOT NULL DEFAULT 0,
				trigger     TEXT    NOT NULL DEFAULT '',
				action      TEXT    NOT NULL DEFAULT '',
				target_type TEXT    NOT NULL DEFAULT '',
				target_id   INTEGER NOT NULL DEFAULT 0,
				summary     TEXT    NOT NULL DEFAULT '',
				detail      TEXT    NOT NULL DEFAULT '{}',
				created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_evolution_logs_agent ON evolution_logs(agent_id)`,
		} {
			DB.Exec(s)
		}
		addColumnIfMissing("agents", "evolution_enabled", "INTEGER NOT NULL DEFAULT 0")
		recordMigration(2, "self-evolution engine – evolution_logs table + agents.evolution_enabled")
	}
	if v < 3 {
		addColumnIfMissing("evolution_logs", "status", "TEXT NOT NULL DEFAULT 'active'")
		addColumnIfMissing("evolution_logs", "raw_llm_response", "TEXT NOT NULL DEFAULT ''")
		addColumnIfMissing("evolution_logs", "steps_json", "TEXT NOT NULL DEFAULT '[]'")
		recordMigration(3, "evolution_logs – status/raw_llm_response/steps_json columns for visibility and revert")
	}
	if v < 4 {
		for _, s := range []string{
			`CREATE TABLE IF NOT EXISTS screen_actions (
				id                INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id        INTEGER NOT NULL,
				message_id        INTEGER NOT NULL DEFAULT 0,
				action_type       TEXT    NOT NULL DEFAULT '',
				action_data       TEXT    NOT NULL DEFAULT '{}',
				screenshot_before TEXT    NOT NULL DEFAULT '',
				screenshot_after  TEXT    NOT NULL DEFAULT '',
				status            TEXT    NOT NULL DEFAULT 'pending',
				error_msg         TEXT    NOT NULL DEFAULT '',
				created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_screen_actions_session ON screen_actions(session_id)`,
		} {
			DB.Exec(s)
		}
		addColumnIfMissing("agents", "screen_agent_enabled", "INTEGER NOT NULL DEFAULT 0")
		addColumnIfMissing("agents", "screen_agent_config", "TEXT NOT NULL DEFAULT '{}'")
		recordMigration(4, "screen agent – screen_actions table + agents screen_agent columns")
	}
	if v < 5 {
		DB.Exec(`CREATE TABLE IF NOT EXISTS agent_distill_records (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			family           TEXT    NOT NULL DEFAULT 'colleague',
			alias            TEXT    NOT NULL DEFAULT '',
			slug             TEXT    NOT NULL DEFAULT '',
			profile          TEXT    NOT NULL DEFAULT '',
			personality_hint TEXT    NOT NULL DEFAULT '',
			name             TEXT    NOT NULL DEFAULT '',
			description      TEXT    NOT NULL DEFAULT '',
			system_prompt    TEXT    NOT NULL DEFAULT '',
			personality_json TEXT    NOT NULL DEFAULT '{}',
			source_files_json TEXT   NOT NULL DEFAULT '[]',
			output_files_json TEXT   NOT NULL DEFAULT '[]',
			storage_dir      TEXT    NOT NULL DEFAULT '',
			version          INTEGER NOT NULL DEFAULT 1,
			status           TEXT    NOT NULL DEFAULT 'completed',
			created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`)
		DB.Exec(`CREATE INDEX IF NOT EXISTS idx_distill_records_alias ON agent_distill_records(alias)`)
		DB.Exec(`CREATE INDEX IF NOT EXISTS idx_distill_records_updated ON agent_distill_records(updated_at DESC)`)
		recordMigration(5, "agent distill records – standalone storage for personality distillation")
	}
	if v < 6 {
		if err := InitCheckpointsTable(); err != nil {
			slog.Warn("migrate v6: InitCheckpointsTable", "err", err)
		}
		recordMigration(6, "coding checkpoints – atomic rollback with file+message+todo snapshots")
	}
	if v < 7 {
		DB.Exec(`CREATE TABLE IF NOT EXISTS coding_agents (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			name        TEXT    NOT NULL DEFAULT '',
			description TEXT    NOT NULL DEFAULT '',
			prompt      TEXT    NOT NULL DEFAULT '',
			model       TEXT    NOT NULL DEFAULT '',
			max_turns   INTEGER NOT NULL DEFAULT 0,
			created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`)
		recordMigration(7, "coding_agents – custom sub-agent templates for Coding View")
	}
}

// seedBuiltinAgent 插入内置「通用助理」agent（id=1）
func seedBuiltinAgent() {
	var cnt int
	DB.QueryRow(`SELECT COUNT(1) FROM agents WHERE builtin=1`).Scan(&cnt)
	if cnt > 0 {
		return
	}
	_, err := DB.Exec(`INSERT INTO agents (name, avatar, description, system_prompt, allow_all, builtin)
		VALUES ('通用助理', '✦', '默认通用智能助理，开箱即用、无任何限制。', '', 1, 1)`)
	if err != nil {
		slog.Warn("seed builtin agent error", "err", err)
	}
}

// addColumnIfMissing 检查列是否存在，不存在则 ALTER TABLE 增加
func addColumnIfMissing(table, column, def string) {
	rows, err := DB.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		slog.Warn("PRAGMA error", "table", table, "err", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			continue
		}
		if name == column {
			return
		}
	}
	if _, err := DB.Exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + def); err != nil {
		slog.Warn("add column error", "table", table, "column", column, "err", err)
	}
}

// seedBuiltinProviders 写入内置 provider 模板（幂等）
func seedBuiltinProviders() {
	type p struct{ code, name, protocol, baseURL, model, meta, doc string }
	builtins := []p{
		// ── Anthropic 协议（直连，不经过 bridge 路由）──────────────────
		{
			code: "anthropic_official", name: "Anthropic Official", protocol: "anthropic",
			baseURL: "", model: "claude-opus-4-5", meta: `{}`, doc: "https://docs.anthropic.com",
		},
		{
			code: "dashscope_anthropic", name: "DashScope (Anthropic Compatible)", protocol: "anthropic",
			baseURL: "", model: "",
			meta: `{"usage":{"endpoint":"https://dashscope.aliyuncs.com/api/v1/account/balance","auth_header":"Authorization","auth_prefix":"Bearer "}}`,
			doc:  "https://help.aliyun.com/zh/model-studio/",
		},
		{
			code: "deepseek_anthropic", name: "DeepSeek (Anthropic 直连)", protocol: "anthropic",
			baseURL: "https://api.deepseek.com/anthropic", model: "deepseek-v4-pro",
			meta: `{"auth_strategy":"auth_token","context_windows":{"deepseek-v4-pro":1000000,"deepseek-v4-flash":1000000,"deepseek-chat":1000000,"deepseek-reasoner":1000000},"default_env":{"ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES":"thinking,effort,adaptive_thinking,max_effort","ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES":"thinking,effort,adaptive_thinking,max_effort","ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES":"thinking,effort,adaptive_thinking,max_effort"},"usage":{"endpoint":"https://api.deepseek.com/user/balance","auth_header":"Authorization","auth_prefix":"Bearer "}}`,
			doc:  "https://platform.deepseek.com/",
		},
		{
			code: "glm_anthropic", name: "GLM / 智谱 (Anthropic 直连)", protocol: "anthropic",
			baseURL: "https://open.bigmodel.cn/api/anthropic", model: "glm-5.1",
			meta: `{"auth_strategy":"auth_token","context_windows":{"glm-5.1":200000,"glm-5-turbo":200000,"glm-4.5-air":128000},"default_env":{"CC_HAHA_SEND_DISABLED_THINKING":"1"}}`,
			doc:  "https://open.bigmodel.cn/dev/api",
		},
		{
			code: "kimi_anthropic", name: "Kimi / Moonshot (Anthropic 直连)", protocol: "anthropic",
			baseURL: "https://api.kimi.com/coding", model: "kimi-k2.6",
			meta: `{"auth_strategy":"auth_token","context_windows":{"kimi-k2.6":262144,"kimi-k2.5":262144,"kimi-k2-0905-preview":262144,"kimi-k2-turbo-preview":262144},"default_env":{"CC_HAHA_SEND_DISABLED_THINKING":"1"}}`,
			doc:  "https://platform.moonshot.cn/docs",
		},
		{
			code: "minimax_anthropic", name: "MiniMax (Anthropic 直连)", protocol: "anthropic",
			baseURL: "https://api.minimaxi.com/anthropic", model: "MiniMax-M2.7",
			meta: `{"auth_strategy":"auth_token","context_windows":{"MiniMax-M2.7":204800,"MiniMax-M2.7-highspeed":204800,"MiniMax-M2.5":204800}}`,
			doc:  "https://platform.minimaxi.com",
		},
		// ── OpenAI 协议（经 bridge 路由层翻译）─────────────────────────
		{
			code: "deepseek_openai", name: "DeepSeek (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-v4-pro",
			meta: `{"transformer":"deepseek","context_windows":{"deepseek-v4-pro":1000000,"deepseek-chat":1000000},"usage":{"endpoint":"https://api.deepseek.com/user/balance","auth_header":"Authorization","auth_prefix":"Bearer "}}`,
			doc:  "https://platform.deepseek.com/",
		},
		{
			code: "qwen_openai", name: "Qwen / DashScope (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen3-coder-plus",
			meta: `{"transformer":"","context_windows":{"qwen3-coder-plus":131072,"qwen-max":32768,"qwen-plus":131072,"qwen-turbo":131072},"usage":{"endpoint":"https://dashscope.aliyuncs.com/api/v1/account/balance","auth_header":"Authorization","auth_prefix":"Bearer "}}`,
			doc:  "https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api",
		},
		{
			code: "doubao_openai", name: "Doubao / Volcengine (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "",
			meta: `{"transformer":"","context_windows":{"doubao-1.5-pro-32k":32768,"doubao-1.5-pro-256k":262144}}`,
			doc:  "https://www.volcengine.com/docs/82379",
		},
		{
			code: "glm_openai", name: "GLM / Z.ai (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4.6",
			meta: `{"transformer":"","context_windows":{"glm-4.6":128000,"glm-4-plus":128000,"glm-4-flash":128000}}`,
			doc:  "https://open.bigmodel.cn/dev/api",
		},
		{
			code: "moonshot_openai", name: "Moonshot / Kimi (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://api.moonshot.cn/v1/chat/completions", model: "kimi-k2-turbo-preview",
			meta: `{"transformer":"","context_windows":{"kimi-k2-turbo-preview":262144,"moonshot-v1-128k":131072}}`,
			doc:  "https://platform.moonshot.cn/docs",
		},
		{
			code: "gemini_openai", name: "Google Gemini (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.5-pro",
			meta: `{"transformer":"gemini","context_windows":{"gemini-2.5-pro":1000000,"gemini-2.5-flash":1000000}}`,
			doc:  "https://ai.google.dev/gemini-api/docs/openai",
		},
		{
			code: "openrouter_openai", name: "OpenRouter (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-2.5-pro",
			meta: `{"transformer":""}`,
			doc:  "https://openrouter.ai/docs",
		},
		{
			code: "groq_openai", name: "Groq (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile",
			meta: `{"transformer":""}`,
			doc:  "https://console.groq.com/docs",
		},
		{
			code: "siliconflow_openai", name: "SiliconFlow (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://api.siliconflow.cn/v1/chat/completions", model: "deepseek-ai/DeepSeek-V3",
			meta: `{"transformer":""}`,
			doc:  "https://docs.siliconflow.cn/",
		},
		{
			code: "ollama_anthropic", name: "Ollama (本地, Anthropic 直连)", protocol: "anthropic",
			baseURL: "http://127.0.0.1:11434", model: "qwen3.6:27b",
			meta: `{"auth_strategy":"auth_token_empty_api_key","default_env":{"ANTHROPIC_AUTH_TOKEN":"ollama"}}`,
			doc:  "https://docs.ollama.com/integrations/claude-code",
		},
		{
			code: "lmstudio_anthropic", name: "LM Studio (本地, Anthropic 直连)", protocol: "anthropic",
			baseURL: "http://localhost:1234", model: "qwen/qwen3.6-27b",
			meta: `{"auth_strategy":"auth_token_empty_api_key","default_env":{"ANTHROPIC_AUTH_TOKEN":"lmstudio"}}`,
			doc:  "https://lmstudio.ai/docs/integrations/claude-code",
		},
		{
			code: "openai_official", name: "OpenAI Official", protocol: "openai",
			baseURL: "https://api.openai.com/v1/chat/completions", model: "gpt-4o",
			meta: `{"transformer":"","context_windows":{"gpt-4o":128000,"gpt-4o-mini":128000,"o3":200000,"o4-mini":200000}}`,
			doc:  "https://platform.openai.com/docs",
		},
		// ── 通用 ────────────────────────────────────────────────────
		{
			code: "custom_anthropic", name: "Custom (Anthropic)", protocol: "anthropic",
			baseURL: "", model: "", meta: `{}`, doc: "",
		},
		{
			code: "custom_openai", name: "Custom (OpenAI)", protocol: "openai",
			baseURL: "", model: "", meta: `{}`, doc: "",
		},
	}
	for _, b := range builtins {
		_, err := DB.Exec(`
			INSERT INTO providers (code, name, protocol, default_base_url, default_model, usage_api_meta, doc_url, builtin)
			VALUES (?,?,?,?,?,?,?,1)
			ON CONFLICT(code) DO UPDATE SET
				name=excluded.name,
				protocol=excluded.protocol,
				default_base_url=excluded.default_base_url,
				default_model=excluded.default_model,
				usage_api_meta=excluded.usage_api_meta,
				doc_url=excluded.doc_url,
				builtin=1
		`, b.code, b.name, b.protocol, b.baseURL, b.model, b.meta, b.doc)
		if err != nil {
			slog.Warn("seed provider error", "code", b.code, "err", err)
		}
	}
}

// Domain CRUD functions are in separate files:
// session.go, knowledge.go, im_connector.go, provider.go, usage.go, scheduled.go, auth.go, nexus.go
