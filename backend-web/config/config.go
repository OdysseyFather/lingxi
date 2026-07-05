package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
)

type Config struct {
	Port             string
	MySQLDSN         string
	JWTSecret        string
	DataDir          string
	FrontendDist     string
	OpenRegistration bool
	AdminBootstrap   string // username:password for first admin
	ClaudeBin        string // claude CLI 可执行文件路径（内嵌或系统）
}

func Load() Config {
	openReg := os.Getenv("OPEN_REGISTRATION") == "true"
	cfg := Config{
		Port:             envOr("PORT", "13001"),
		MySQLDSN:         os.Getenv("MYSQL_DSN"),
		JWTSecret:        envOr("JWT_SECRET", "change-me-in-production"),
		DataDir:          envOr("DATA_DIR", "./data"),
		FrontendDist:     envOr("FRONTEND_DIST", "embed"),
		OpenRegistration: openReg,
		AdminBootstrap:   os.Getenv("ADMIN_BOOTSTRAP"),
		ClaudeBin:        envOr("CLAUDE_BIN", ""),
	}
	if cfg.ClaudeBin == "" {
		cfg.ClaudeBin = detectClaudeBin()
	}
	return cfg
}

// detectClaudeBin 自动探测内嵌的 ai-engine/lingxi（与桌面端 Electron getClaudeBin 对齐）
func detectClaudeBin() string {
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)

	isWin := runtime.GOOS == "windows"
	name := "lingxi"
	if isWin {
		name = "lingxi.cmd"
	}

	// 优先检查与可执行文件同目录的 ai-engine/
	bundled := filepath.Join(exeDir, "ai-engine", name)
	if _, err := os.Stat(bundled); err == nil {
		return bundled
	}
	// 开发模式：相对于项目根目录
	devPath := filepath.Join(exeDir, "..", "electron", "resources", "ai-engine", name)
	if _, err := os.Stat(devPath); err == nil {
		abs, _ := filepath.Abs(devPath)
		return abs
	}
	return "claude"
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func ParseInt64(s string, def int64) int64 {
	if s == "" {
		return def
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return v
}
