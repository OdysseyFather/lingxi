package db

import (
	"database/sql"
	"log/slog"
	"os"

	"community-server/config"

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

func migrate() {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS schema_version (
			version    INTEGER PRIMARY KEY,
			name       TEXT    NOT NULL DEFAULT '',
			applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS users (
			id              TEXT PRIMARY KEY,
			username        TEXT UNIQUE NOT NULL,
			display_name    TEXT,
			avatar          TEXT,
			bio             TEXT,
			auth_token      TEXT UNIQUE NOT NULL,
			created_at      INTEGER NOT NULL,
			last_active_at  INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS agents (
			id              TEXT PRIMARY KEY,
			author_id       TEXT NOT NULL REFERENCES users(id),
			name            TEXT NOT NULL,
			description     TEXT NOT NULL DEFAULT '',
			avatar          TEXT,
			tags            TEXT,
			category        TEXT,
			bundle_path     TEXT NOT NULL,
			bundle_size     INTEGER NOT NULL DEFAULT 0,
			version         TEXT NOT NULL,
			downloads_count INTEGER NOT NULL DEFAULT 0,
			rating_avg      REAL NOT NULL DEFAULT 0,
			rating_count    INTEGER NOT NULL DEFAULT 0,
			is_published    INTEGER NOT NULL DEFAULT 1,
			created_at      INTEGER NOT NULL,
			updated_at      INTEGER NOT NULL,
			UNIQUE(author_id, name, version)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category)`,
		`CREATE INDEX IF NOT EXISTS idx_agents_author ON agents(author_id)`,
		`CREATE INDEX IF NOT EXISTS idx_agents_published ON agents(is_published, created_at DESC)`,

		`CREATE TABLE IF NOT EXISTS ratings (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			agent_id    TEXT NOT NULL REFERENCES agents(id),
			user_id     TEXT NOT NULL REFERENCES users(id),
			score       INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
			review      TEXT,
			created_at  INTEGER NOT NULL,
			UNIQUE(agent_id, user_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_ratings_agent ON ratings(agent_id)`,

		`CREATE TABLE IF NOT EXISTS follows (
			follower_id  TEXT NOT NULL REFERENCES users(id),
			followee_id  TEXT NOT NULL REFERENCES users(id),
			created_at   INTEGER NOT NULL,
			PRIMARY KEY(follower_id, followee_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id)`,

		`CREATE TABLE IF NOT EXISTS comments (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			agent_id    TEXT NOT NULL REFERENCES agents(id),
			user_id     TEXT NOT NULL REFERENCES users(id),
			parent_id   INTEGER,
			content     TEXT NOT NULL,
			created_at  INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_comments_agent ON comments(agent_id, created_at)`,

		`CREATE TABLE IF NOT EXISTS invocations (
			code         TEXT PRIMARY KEY,
			agent_id     TEXT NOT NULL REFERENCES agents(id),
			issuer_id    TEXT NOT NULL REFERENCES users(id),
			daily_limit  INTEGER NOT NULL DEFAULT 50,
			expires_at   INTEGER,
			is_active    INTEGER NOT NULL DEFAULT 1,
			created_at   INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_invocations_agent ON invocations(agent_id)`,

		`CREATE TABLE IF NOT EXISTS invocation_logs (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			code        TEXT NOT NULL REFERENCES invocations(code),
			caller_id   TEXT,
			caller_ip   TEXT,
			success     INTEGER NOT NULL,
			error_msg   TEXT,
			latency_ms  INTEGER,
			created_at  INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_invocation_logs_code_date ON invocation_logs(code, created_at)`,
	}
	for _, s := range stmts {
		if _, err := DB.Exec(s); err != nil {
			slog.Error("migrate error", "err", err, "stmt", s)
			os.Exit(1)
		}
	}
	recordMigration(1, "initial schema")
	slog.Info("migration complete", "version", 1)
}

func recordMigration(version int, name string) {
	DB.Exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (?, ?)`, version, name)
}
