package config

import (
	"log/slog"
	"os"
	"path/filepath"
)

// Config 社区服务器配置
type Config struct {
	Server   ServerConfig
	DB       DBConfig
	Storage  StorageConfig
	Tunnel   TunnelConfig
}

type ServerConfig struct {
	Port string
}

type DBConfig struct {
	Path string
}

type StorageConfig struct {
	// BundlesDir 存放 .lxbundle 文件的根目录
	BundlesDir string
	// AvatarsDir 存放用户/Agent 头像的目录
	AvatarsDir string
	// BundlesURLPrefix 对外暴露的下载 URL 前缀
	BundlesURLPrefix string
	// AvatarsURLPrefix 头像访问 URL 前缀
	AvatarsURLPrefix string
}

type TunnelConfig struct {
	// SignalingServer 信令服务器地址（用于通过 h5_tunnel 转发调用）
	SignalingServer string
}

var current *Config

func Get() *Config {
	if current != nil {
		return current
	}
	return reload()
}

// Reload 强制重新读取环境变量并刷新配置（测试用）
func Reload() *Config {
	return reload()
}

func reload() *Config {

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		home, _ := os.UserHomeDir()
		dbPath = filepath.Join(home, "Library", "Application Support", "lingxi-community", "community.db")
	}
	os.MkdirAll(filepath.Dir(dbPath), 0755)

	storageRoot := os.Getenv("STORAGE_ROOT")
	if storageRoot == "" {
		home, _ := os.UserHomeDir()
		storageRoot = filepath.Join(home, "Library", "Application Support", "lingxi-community", "storage")
	}
	bundlesDir := filepath.Join(storageRoot, "bundles")
	avatarsDir := filepath.Join(storageRoot, "avatars")
	os.MkdirAll(bundlesDir, 0755)
	os.MkdirAll(avatarsDir, 0755)

	signalingServer := os.Getenv("SIGNALING_SERVER")
	if signalingServer == "" {
		signalingServer = "https://lingxi-singaling-server.onrender.com"
	}

	current = &Config{
		Server: ServerConfig{Port: port},
		DB:     DBConfig{Path: dbPath},
		Storage: StorageConfig{
			BundlesDir:       bundlesDir,
			AvatarsDir:       avatarsDir,
			BundlesURLPrefix: "/static/bundles",
			AvatarsURLPrefix: "/static/avatars",
		},
		Tunnel: TunnelConfig{SignalingServer: signalingServer},
	}

	slog.Info("config loaded",
		"port", port,
		"db", dbPath,
		"storage", storageRoot,
	)
	return current
}
