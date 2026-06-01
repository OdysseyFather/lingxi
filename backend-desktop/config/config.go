package config

import (
	"os"
	"sync"
)

type Config struct {
	Server struct {
		Port         string
		FrontendDist string
	}
	DB struct {
		Path string
	}
	Claude struct {
		Model     string
		Bin       string // claude CLI 可执行文件路径（内置或系统）
		AuthToken string // ANTHROPIC_AUTH_TOKEN
		BaseURL   string // ANTHROPIC_BASE_URL
		ModelEnv  string // ANTHROPIC_MODEL（覆盖 settings.json）
	}
	SDK struct {
		RunnerScript string // sdk-runner.js 脚本路径
		NodeBin      string // Node.js 可执行文件路径
	}
	DingTalk struct {
		ClientID     string
		ClientSecret string
	}
}

var (
	cfg  Config
	once sync.Once
)

func Get() *Config {
	once.Do(func() {
		cfg.Server.Port = "3001"
		cfg.Server.FrontendDist = "../frontend-desktop/dist"
		cfg.DB.Path = "smart-agent.db"
		cfg.Claude.Model = "claude-opus-4-5"
		cfg.Claude.Bin = "claude"
		cfg.Claude.AuthToken = ""
		cfg.Claude.BaseURL = ""
		cfg.Claude.ModelEnv = ""

		override(&cfg.Server.Port, "PORT")
		override(&cfg.Server.FrontendDist, "FRONTEND_DIST")
		override(&cfg.DB.Path, "DB_PATH")
		override(&cfg.Claude.Model, "CLAUDE_MODEL")
		override(&cfg.Claude.Bin, "CLAUDE_BIN")
		override(&cfg.Claude.AuthToken, "ANTHROPIC_AUTH_TOKEN")
		override(&cfg.Claude.BaseURL, "ANTHROPIC_BASE_URL")
		override(&cfg.Claude.ModelEnv, "ANTHROPIC_MODEL")

		cfg.SDK.RunnerScript = "../electron/resources/sdk-runner/sdk-runner.js"
		cfg.SDK.NodeBin = "node"
		override(&cfg.SDK.RunnerScript, "SDK_RUNNER_SCRIPT")
		override(&cfg.SDK.NodeBin, "SDK_NODE_BIN")

		cfg.DingTalk.ClientID = ""
		cfg.DingTalk.ClientSecret = ""
		override(&cfg.DingTalk.ClientID, "DINGTALK_CLIENT_ID")
		override(&cfg.DingTalk.ClientSecret, "DINGTALK_CLIENT_SECRET")
	})
	return &cfg
}

func override(field *string, envKey string) {
	if v := os.Getenv(envKey); v != "" {
		*field = v
	}
}
