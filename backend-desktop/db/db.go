package db

import (
	"database/sql"
	"log"
	"strconv"
	"time"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
	"lingxi-agent/config"
)

var DB *sql.DB

func Init() {
	cfg := config.Get()

	var err error
	DB, err = sql.Open("sqlite3", "file:"+cfg.DB.Path+"?_journal=WAL&_timeout=5000")
	if err != nil {
		log.Fatalf("[db] open error: %v", err)
	}

	DB.SetMaxOpenConns(1)

	if err = DB.Ping(); err != nil {
		log.Fatalf("[db] ping error: %v", err)
	}

	migrate()
	log.Printf("[db] SQLite ready: %s", cfg.DB.Path)
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
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s); err != nil {
			log.Fatalf("[db] migrate error: %v\nSQL: %s", err, s)
		}
	}

	// 列级迁移：messages.usage（保存每条消息的 token/cost 摘要）
	addColumnIfMissing("messages", "usage", "TEXT NOT NULL DEFAULT ''")
	// 列级迁移：api_profiles.transformer（bridge 路由层保留字段，留空表示自动）
	addColumnIfMissing("api_profiles", "transformer", "TEXT NOT NULL DEFAULT ''")

	seedBuiltinProviders()
}

// addColumnIfMissing 检查列是否存在，不存在则 ALTER TABLE 增加
func addColumnIfMissing(table, column, def string) {
	rows, err := DB.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		log.Printf("[db] PRAGMA error on %s: %v", table, err)
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
		log.Printf("[db] add column %s.%s error: %v", table, column, err)
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
			code: "deepseek_anthropic", name: "DeepSeek (Anthropic Compatible)", protocol: "anthropic",
			baseURL: "https://api.deepseek.com/anthropic", model: "deepseek-chat",
			meta: `{"usage":{"endpoint":"https://api.deepseek.com/user/balance","auth_header":"Authorization","auth_prefix":"Bearer "}}`,
			doc:  "https://platform.deepseek.com/",
		},
		// ── OpenAI 协议（经 bridge 路由层翻译）─────────────────────────
		{
			code: "deepseek_openai", name: "DeepSeek (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat",
			meta: `{"transformer":"deepseek","usage":{"endpoint":"https://api.deepseek.com/user/balance","auth_header":"Authorization","auth_prefix":"Bearer "}}`,
			doc:  "https://platform.deepseek.com/",
		},
		{
			code: "qwen_openai", name: "Qwen / DashScope (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen3-coder-plus",
			meta: `{"transformer":"","usage":{"endpoint":"https://dashscope.aliyuncs.com/api/v1/account/balance","auth_header":"Authorization","auth_prefix":"Bearer "}}`,
			doc:  "https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api",
		},
		{
			code: "doubao_openai", name: "Doubao / Volcengine (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "",
			meta: `{"transformer":""}`,
			doc:  "https://www.volcengine.com/docs/82379",
		},
		{
			code: "glm_openai", name: "GLM / Z.ai (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4.6",
			meta: `{"transformer":""}`,
			doc:  "https://open.bigmodel.cn/dev/api",
		},
		{
			code: "moonshot_openai", name: "Moonshot / Kimi (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://api.moonshot.cn/v1/chat/completions", model: "kimi-k2-turbo-preview",
			meta: `{"transformer":""}`,
			doc:  "https://platform.moonshot.cn/docs",
		},
		{
			code: "gemini_openai", name: "Google Gemini (OpenAI Compatible)", protocol: "openai",
			baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.5-pro",
			meta: `{"transformer":"gemini"}`,
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
			code: "ollama_openai", name: "Ollama (本地, OpenAI Compatible)", protocol: "openai",
			baseURL: "http://127.0.0.1:11434/v1/chat/completions", model: "qwen2.5-coder:14b",
			meta: `{"transformer":""}`,
			doc:  "https://github.com/ollama/ollama",
		},
		{
			code: "openai_official", name: "OpenAI Official", protocol: "openai",
			baseURL: "https://api.openai.com/v1/chat/completions", model: "gpt-4o",
			meta: `{"transformer":""}`,
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
			log.Printf("[db] seed provider %s error: %v", b.code, err)
		}
	}
}

// ─── Tasks ───────────────────────────────────────────────────────

func CreateTask(sessionID int64, title string) (int64, error) {
	res, err := DB.Exec(
		`INSERT INTO tasks (session_id, title) VALUES (?,?)`,
		sessionID, title,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdateTaskStatus(id int64, status string) {
	DB.Exec(`UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, status, id)
}

func UpdateTaskProgress(id int64, progress string) {
	DB.Exec(`UPDATE tasks SET progress=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, progress, id)
}

func ListTasks(sessionID int64) ([]map[string]interface{}, error) {
	var rows *sql.Rows
	var err error
	if sessionID > 0 {
		rows, err = DB.Query(
			`SELECT id, session_id, title, status, progress, created_at, updated_at
			 FROM tasks WHERE session_id=? ORDER BY created_at DESC`,
			sessionID,
		)
	} else {
		rows, err = DB.Query(
			`SELECT id, session_id, title, status, progress, created_at, updated_at
			 FROM tasks ORDER BY created_at DESC LIMIT 50`,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, sid int64
		var title, status, progress string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &sid, &title, &status, &progress, &createdAt, &updatedAt); err != nil {
			continue
		}
		result = append(result, map[string]interface{}{
			"id":         id,
			"session_id": sid,
			"title":      title,
			"status":     status,
			"progress":   progress,
			"created_at": createdAt,
			"updated_at": updatedAt,
		})
	}
	return result, nil
}

func DeleteTask(id int64) {
	DB.Exec(`DELETE FROM tasks WHERE id=?`, id)
}

// ─── Pending Tasks ───────────────────────────────────────────────

func SavePendingTask(sessionID int64, taskDesc, missingFields string) {
	DB.Exec(`
		INSERT INTO pending_tasks (session_id, task_desc, missing_fields)
		VALUES (?,?,?)
		ON CONFLICT(session_id) DO UPDATE SET
			task_desc=excluded.task_desc,
			missing_fields=excluded.missing_fields,
			updated_at=CURRENT_TIMESTAMP
	`, sessionID, taskDesc, missingFields)
}

func GetPendingTask(sessionID int64) (taskDesc, missingFields string, found bool) {
	err := DB.QueryRow(
		`SELECT task_desc, missing_fields FROM pending_tasks WHERE session_id=?`,
		sessionID,
	).Scan(&taskDesc, &missingFields)
	if err != nil {
		return "", "", false
	}
	return taskDesc, missingFields, true
}

func ClearPendingTask(sessionID int64) {
	DB.Exec(`DELETE FROM pending_tasks WHERE session_id=?`, sessionID)
}

// ─── Knowledge ───────────────────────────────────────────────────

func InsertKnowledge(title, filePath, category, tags, summary string, size int64) (int64, error) {
	res, err := DB.Exec(
		`INSERT INTO knowledge (title, file_path, category, tags, summary, size)
		 VALUES (?,?,?,?,?,?)`,
		title, filePath, category, tags, summary, size,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListKnowledge() ([]map[string]interface{}, error) {
	rows, err := DB.Query(
		`SELECT id, title, file_path, category, tags, summary, size, created_at
		 FROM knowledge ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, size int64
		var title, filePath, category, tags, summary string
		var createdAt time.Time
		if err := rows.Scan(&id, &title, &filePath, &category, &tags, &summary, &size, &createdAt); err != nil {
			continue
		}
		result = append(result, map[string]interface{}{
			"id":         id,
			"title":      title,
			"file_path":  filePath,
			"category":   category,
			"tags":       tags,
			"summary":    summary,
			"size":       size,
			"created_at": createdAt,
		})
	}
	return result, nil
}

func GetKnowledgeByID(id int64) (map[string]interface{}, error) {
	var kbID, size int64
	var title, filePath, category, tags, summary string
	var createdAt time.Time
	err := DB.QueryRow(
		`SELECT id, title, file_path, category, tags, summary, size, created_at
		 FROM knowledge WHERE id=?`, id,
	).Scan(&kbID, &title, &filePath, &category, &tags, &summary, &size, &createdAt)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id":         kbID,
		"title":      title,
		"file_path":  filePath,
		"category":   category,
		"tags":       tags,
		"summary":    summary,
		"size":       size,
		"created_at": createdAt,
	}, nil
}

func DeleteKnowledge(id int64) (string, error) {
	var filePath string
	err := DB.QueryRow(`SELECT file_path FROM knowledge WHERE id=?`, id).Scan(&filePath)
	if err != nil {
		return "", err
	}
	DB.Exec(`DELETE FROM knowledge WHERE id=?`, id)
	return filePath, nil
}

// ─── IM Connectors ───────────────────────────────────────────────

type IMConnector struct {
	ID        int64     `json:"id"`
	Platform  string    `json:"platform"`
	Enabled   bool      `json:"enabled"`
	Config    string    `json:"config"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func UpsertIMConnector(platform, configJSON string) error {
	_, err := DB.Exec(`
		INSERT INTO im_connectors (platform, config)
		VALUES (?, ?)
		ON CONFLICT(platform) DO UPDATE SET
			config=excluded.config,
			updated_at=CURRENT_TIMESTAMP
	`, platform, configJSON)
	return err
}

func SetIMConnectorEnabled(platform string, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := DB.Exec(`
		UPDATE im_connectors SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE platform=?
	`, v, platform)
	return err
}

func ListIMConnectors() ([]IMConnector, error) {
	rows, err := DB.Query(`SELECT id, platform, enabled, config, created_at, updated_at FROM im_connectors ORDER BY platform`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []IMConnector
	for rows.Next() {
		var c IMConnector
		var enabled int
		if err := rows.Scan(&c.ID, &c.Platform, &enabled, &c.Config, &c.CreatedAt, &c.UpdatedAt); err != nil {
			continue
		}
		c.Enabled = enabled == 1
		result = append(result, c)
	}
	return result, nil
}

func GetIMConnector(platform string) (*IMConnector, error) {
	var c IMConnector
	var enabled int
	err := DB.QueryRow(`SELECT id, platform, enabled, config, created_at, updated_at FROM im_connectors WHERE platform=?`, platform).
		Scan(&c.ID, &c.Platform, &enabled, &c.Config, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	c.Enabled = enabled == 1
	return &c, nil
}

func DeleteIMConnector(platform string) error {
	_, err := DB.Exec(`DELETE FROM im_connectors WHERE platform=?`, platform)
	return err
}

// ─── IM Sessions（群/用户 → session 映射）────────────────────────

// GetOrCreateIMSession 根据 platform+scopeKey 查找有效 session。
// ttlHours > 0 时，若 last_active 超过该时长则视为过期，自动创建新 session。
// ttlHours == 0 表示永不过期。
// title 用于新建 session 时的标题。
func GetOrCreateIMSession(platform, scopeKey, title string, ttlHours int) (int64, error) {
	var sessionID int64
	var lastActive time.Time

	err := DB.QueryRow(
		`SELECT session_id, last_active FROM im_sessions WHERE platform=? AND scope_key=?`,
		platform, scopeKey,
	).Scan(&sessionID, &lastActive)

	if err == nil {
		// 找到记录，检查 TTL
		expired := ttlHours > 0 && time.Since(lastActive) > time.Duration(ttlHours)*time.Hour
		if !expired {
			// 更新活跃时间
			DB.Exec(`UPDATE im_sessions SET last_active=CURRENT_TIMESTAMP WHERE platform=? AND scope_key=?`, platform, scopeKey)
			return sessionID, nil
		}
		// 已过期，创建新 session 替换旧的
	}

	// 新建 session
	res, e := DB.Exec(`INSERT INTO sessions (title) VALUES (?)`, title)
	if e != nil {
		return 0, e
	}
	newSessionID, _ := res.LastInsertId()

	_, e = DB.Exec(`
		INSERT INTO im_sessions (platform, scope_key, session_id)
		VALUES (?, ?, ?)
		ON CONFLICT(platform, scope_key) DO UPDATE SET
			session_id=excluded.session_id,
			last_active=CURRENT_TIMESTAMP
	`, platform, scopeKey, newSessionID)
	if e != nil {
		return 0, e
	}
	return newSessionID, nil
}

// TouchIMSession 更新 im_sessions 的 last_active（每次对话后调用）
func TouchIMSession(platform, scopeKey string) {
	DB.Exec(`UPDATE im_sessions SET last_active=CURRENT_TIMESTAMP WHERE platform=? AND scope_key=?`, platform, scopeKey)
}

// ─── Providers / API Profiles ────────────────────────────────────

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
	Name             string    `json:"name"`
	ProviderID       int64     `json:"provider_id"`
	ProviderCode     string    `json:"provider_code,omitempty"`
	ProviderName     string    `json:"provider_name,omitempty"`
	ProviderProtocol string    `json:"provider_protocol,omitempty"`
	BaseURL          string    `json:"base_url"`
	Model            string    `json:"model"`
	AuthTokenCipher  string    `json:"auth_token_cipher,omitempty"` // 仅 Electron 启动时读取
	AuthTokenMask    string    `json:"auth_token_mask"`
	Extra            string    `json:"extra"`
	Transformer      string    `json:"transformer"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func ListProviders() ([]Provider, error) {
	rows, err := DB.Query(`SELECT id, code, name, protocol, default_base_url, default_model, usage_api_meta, doc_url, builtin
		FROM providers ORDER BY builtin DESC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Provider, 0)
	for rows.Next() {
		var p Provider
		var builtin int
		if err := rows.Scan(&p.ID, &p.Code, &p.Name, &p.Protocol, &p.DefaultBaseURL, &p.DefaultModel, &p.UsageAPIMeta, &p.DocURL, &builtin); err != nil {
			continue
		}
		p.Builtin = builtin == 1
		out = append(out, p)
	}
	return out, nil
}

func GetProvider(id int64) (*Provider, error) {
	var p Provider
	var builtin int
	err := DB.QueryRow(`SELECT id, code, name, protocol, default_base_url, default_model, usage_api_meta, doc_url, builtin
		FROM providers WHERE id=?`, id).
		Scan(&p.ID, &p.Code, &p.Name, &p.Protocol, &p.DefaultBaseURL, &p.DefaultModel, &p.UsageAPIMeta, &p.DocURL, &builtin)
	if err != nil {
		return nil, err
	}
	p.Builtin = builtin == 1
	return &p, nil
}

func ListAPIProfiles(includeCipher bool) ([]APIProfile, error) {
	rows, err := DB.Query(`
		SELECT p.id, p.name, p.provider_id, COALESCE(pr.code,''), COALESCE(pr.name,''), COALESCE(pr.protocol,'anthropic'),
		       p.base_url, p.model, p.auth_token_cipher, p.auth_token_mask, p.extra, p.transformer, p.is_active, p.created_at, p.updated_at
		FROM api_profiles p LEFT JOIN providers pr ON pr.id=p.provider_id
		ORDER BY p.is_active DESC, p.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]APIProfile, 0)
	for rows.Next() {
		var ap APIProfile
		var active int
		if err := rows.Scan(&ap.ID, &ap.Name, &ap.ProviderID, &ap.ProviderCode, &ap.ProviderName, &ap.ProviderProtocol,
			&ap.BaseURL, &ap.Model, &ap.AuthTokenCipher, &ap.AuthTokenMask, &ap.Extra, &ap.Transformer, &active, &ap.CreatedAt, &ap.UpdatedAt); err != nil {
			continue
		}
		ap.IsActive = active == 1
		if !includeCipher {
			ap.AuthTokenCipher = ""
		}
		out = append(out, ap)
	}
	return out, nil
}

func GetAPIProfile(id int64, includeCipher bool) (*APIProfile, error) {
	var ap APIProfile
	var active int
	err := DB.QueryRow(`
		SELECT p.id, p.name, p.provider_id, COALESCE(pr.code,''), COALESCE(pr.name,''), COALESCE(pr.protocol,'anthropic'),
		       p.base_url, p.model, p.auth_token_cipher, p.auth_token_mask, p.extra, p.transformer, p.is_active, p.created_at, p.updated_at
		FROM api_profiles p LEFT JOIN providers pr ON pr.id=p.provider_id
		WHERE p.id=?`, id).
		Scan(&ap.ID, &ap.Name, &ap.ProviderID, &ap.ProviderCode, &ap.ProviderName, &ap.ProviderProtocol,
			&ap.BaseURL, &ap.Model, &ap.AuthTokenCipher, &ap.AuthTokenMask, &ap.Extra, &ap.Transformer, &active, &ap.CreatedAt, &ap.UpdatedAt)
	if err != nil {
		return nil, err
	}
	ap.IsActive = active == 1
	if !includeCipher {
		ap.AuthTokenCipher = ""
	}
	return &ap, nil
}

func GetActiveAPIProfile(includeCipher bool) (*APIProfile, error) {
	var id int64
	if err := DB.QueryRow(`SELECT id FROM api_profiles WHERE is_active=1 LIMIT 1`).Scan(&id); err != nil {
		return nil, err
	}
	return GetAPIProfile(id, includeCipher)
}

func UpsertAPIProfile(ap *APIProfile) (int64, error) {
	if ap.ID > 0 {
		_, err := DB.Exec(`
			UPDATE api_profiles SET
				name=?, provider_id=?, base_url=?, model=?,
				auth_token_cipher=?, auth_token_mask=?, extra=?, transformer=?, updated_at=CURRENT_TIMESTAMP
			WHERE id=?`,
			ap.Name, ap.ProviderID, ap.BaseURL, ap.Model,
			ap.AuthTokenCipher, ap.AuthTokenMask, ap.Extra, ap.Transformer, ap.ID)
		return ap.ID, err
	}
	res, err := DB.Exec(`
		INSERT INTO api_profiles (name, provider_id, base_url, model, auth_token_cipher, auth_token_mask, extra, transformer)
		VALUES (?,?,?,?,?,?,?,?)`,
		ap.Name, ap.ProviderID, ap.BaseURL, ap.Model, ap.AuthTokenCipher, ap.AuthTokenMask, ap.Extra, ap.Transformer)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func DeleteAPIProfile(id int64) error {
	_, err := DB.Exec(`DELETE FROM api_profiles WHERE id=?`, id)
	return err
}

func ActivateAPIProfile(id int64) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE api_profiles SET is_active=0`); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`UPDATE api_profiles SET is_active=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`, id); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// ─── Usage ───────────────────────────────────────────────────────

type UsageRecord struct {
	ID                int64     `json:"id"`
	SessionID         int64     `json:"session_id"`
	MessageID         int64     `json:"message_id"`
	ProfileID         int64     `json:"profile_id"`
	Model             string    `json:"model"`
	InputTokens       int64     `json:"input_tokens"`
	OutputTokens      int64     `json:"output_tokens"`
	CacheReadTokens   int64     `json:"cache_read_tokens"`
	CacheWriteTokens  int64     `json:"cache_write_tokens"`
	CostUSD           float64   `json:"cost_usd"`
	DurationMs        int64     `json:"duration_ms"`
	CreatedAt         time.Time `json:"created_at"`
}

func InsertUsageRecord(r *UsageRecord) (int64, error) {
	res, err := DB.Exec(`
		INSERT INTO usage_records
			(session_id, message_id, profile_id, model,
			 input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
			 cost_usd, duration_ms)
		VALUES (?,?,?,?,?,?,?,?,?,?)`,
		r.SessionID, r.MessageID, r.ProfileID, r.Model,
		r.InputTokens, r.OutputTokens, r.CacheReadTokens, r.CacheWriteTokens,
		r.CostUSD, r.DurationMs)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// SumUsage 汇总指定时间范围内的用量
type UsageSummary struct {
	InputTokens      int64   `json:"input_tokens"`
	OutputTokens     int64   `json:"output_tokens"`
	CacheReadTokens  int64   `json:"cache_read_tokens"`
	CacheWriteTokens int64   `json:"cache_write_tokens"`
	CostUSD          float64 `json:"cost_usd"`
	Requests         int64   `json:"requests"`
}

func SumUsageSince(since time.Time) (UsageSummary, error) {
	var s UsageSummary
	row := DB.QueryRow(`
		SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		       COALESCE(SUM(cache_read_tokens),0), COALESCE(SUM(cache_write_tokens),0),
		       COALESCE(SUM(cost_usd),0), COUNT(1)
		FROM usage_records WHERE created_at >= ?`, since)
	err := row.Scan(&s.InputTokens, &s.OutputTokens, &s.CacheReadTokens, &s.CacheWriteTokens, &s.CostUSD, &s.Requests)
	return s, err
}

// GroupUsageByDay 返回 [{date, in, out, cost}] 升序，最近 days 天
func GroupUsageByDay(days int) ([]map[string]interface{}, error) {
	rows, err := DB.Query(`
		SELECT date(created_at) AS d,
		       COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		       COALESCE(SUM(cache_read_tokens),0), COALESCE(SUM(cache_write_tokens),0),
		       COALESCE(SUM(cost_usd),0), COUNT(1)
		FROM usage_records
		WHERE created_at >= datetime('now', ?)
		GROUP BY d ORDER BY d ASC`, "-"+strconv.Itoa(days)+" days")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var d string
		var in, outT, cr, cw, n int64
		var cost float64
		if err := rows.Scan(&d, &in, &outT, &cr, &cw, &cost, &n); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"date": d, "input_tokens": in, "output_tokens": outT,
			"cache_read_tokens": cr, "cache_write_tokens": cw,
			"cost_usd": cost, "requests": n,
		})
	}
	return out, nil
}

// GroupUsageByModel 按模型聚合
func GroupUsageByModel(days int) ([]map[string]interface{}, error) {
	rows, err := DB.Query(`
		SELECT model,
		       COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		       COALESCE(SUM(cost_usd),0), COUNT(1)
		FROM usage_records
		WHERE created_at >= datetime('now', ?)
		GROUP BY model ORDER BY 4 DESC`, "-"+strconv.Itoa(days)+" days")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var model string
		var in, outT, n int64
		var cost float64
		if err := rows.Scan(&model, &in, &outT, &cost, &n); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"model": model, "input_tokens": in, "output_tokens": outT,
			"cost_usd": cost, "requests": n,
		})
	}
	return out, nil
}

func ListRecentUsage(limit int) ([]map[string]interface{}, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := DB.Query(`
		SELECT u.id, u.session_id, COALESCE(s.title,''), u.model, u.input_tokens, u.output_tokens,
		       u.cache_read_tokens, u.cache_write_tokens, u.cost_usd, u.duration_ms, u.created_at
		FROM usage_records u LEFT JOIN sessions s ON s.id=u.session_id
		ORDER BY u.id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, sid, in, outT, cr, cw, dur int64
		var title, model string
		var cost float64
		var createdAt time.Time
		if err := rows.Scan(&id, &sid, &title, &model, &in, &outT, &cr, &cw, &cost, &dur, &createdAt); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"id": id, "session_id": sid, "session_title": title,
			"model": model, "input_tokens": in, "output_tokens": outT,
			"cache_read_tokens": cr, "cache_write_tokens": cw,
			"cost_usd": cost, "duration_ms": dur, "created_at": createdAt,
		})
	}
	return out, nil
}

func SaveUsageQuotaSnapshot(profileID int64, snapshot string) {
	DB.Exec(`
		INSERT INTO usage_quota_cache (profile_id, snapshot)
		VALUES (?, ?)
		ON CONFLICT(profile_id) DO UPDATE SET
			snapshot=excluded.snapshot,
			fetched_at=CURRENT_TIMESTAMP`, profileID, snapshot)
}

func GetUsageQuotaCache(profileID int64) (string, time.Time, bool) {
	var snap string
	var t time.Time
	err := DB.QueryRow(`SELECT snapshot, fetched_at FROM usage_quota_cache WHERE profile_id=?`, profileID).Scan(&snap, &t)
	if err != nil {
		return "", time.Time{}, false
	}
	return snap, t, true
}
