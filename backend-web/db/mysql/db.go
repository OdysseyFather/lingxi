package mysql

import (
	"database/sql"
	"embed"
	"fmt"
	"log/slog"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

//go:embed schema/*.sql
var schemaFS embed.FS

var DB *sql.DB

func Init(dsn string) error {
	if dsn == "" {
		return fmt.Errorf("MYSQL_DSN 未设置")
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	if err := db.Ping(); err != nil {
		return fmt.Errorf("MySQL ping: %w", err)
	}
	DB = db
	return migrate()
}

func migrate() error {
	data, err := schemaFS.ReadFile("schema/001_initial.sql")
	if err != nil {
		return err
	}
	script := string(data)
	for _, stmt := range splitSQL(script) {
		stmt = stripSQLComments(stmt)
		if stmt == "" {
			continue
		}
		if _, err := DB.Exec(stmt); err != nil {
			if strings.Contains(err.Error(), "already exists") {
				continue
			}
			return fmt.Errorf("migrate: %w\nstmt: %.80s", err, stmt)
		}
	}
	seedBuiltinProviders()
	return nil
}

// seedBuiltinProviders 写入内置 provider 模板（幂等），完全复制桌面端
func seedBuiltinProviders() {
	type p struct{ code, name, protocol, baseURL, model, meta, doc string }
	builtins := []p{
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
			ON DUPLICATE KEY UPDATE
				name=VALUES(name),
				protocol=VALUES(protocol),
				default_base_url=VALUES(default_base_url),
				default_model=VALUES(default_model),
				usage_api_meta=VALUES(usage_api_meta),
				doc_url=VALUES(doc_url),
				builtin=1
		`, b.code, b.name, b.protocol, b.baseURL, b.model, b.meta, b.doc)
		if err != nil {
			slog.Warn("seed provider error", "code", b.code, "err", err)
		}
	}
}

// stripSQLComments 移除 SQL 语句中的单行注释（-- 开头的行），保留实际 SQL
func stripSQLComments(stmt string) string {
	var lines []string
	for _, line := range strings.Split(stmt, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "--") {
			continue
		}
		lines = append(lines, line)
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func splitSQL(script string) []string {
	var parts []string
	var cur strings.Builder
	inString := false
	for i := 0; i < len(script); i++ {
		ch := script[i]
		if ch == '\'' {
			inString = !inString
		}
		if ch == ';' && !inString {
			parts = append(parts, cur.String())
			cur.Reset()
			continue
		}
		cur.WriteByte(ch)
	}
	if s := strings.TrimSpace(cur.String()); s != "" {
		parts = append(parts, s)
	}
	return parts
}

func Close() {
	if DB != nil {
		_ = DB.Close()
	}
}

func UserDataDir(base string, userID int64) string {
	return fmt.Sprintf("%s/users/%d", base, userID)
}

func EnsureUserDirs(base string, userID int64) error {
	dirs := []string{
		UserDataDir(base, userID),
		UserDataDir(base, userID) + "/ai-home",
		UserDataDir(base, userID) + "/uploads",
		UserDataDir(base, userID) + "/knowledge",
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return err
		}
	}
	return nil
}
