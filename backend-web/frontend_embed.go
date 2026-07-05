package main

import (
	"embed"
	"io/fs"
)

//go:embed frontend_dist/*
var frontendFS embed.FS

// EmbeddedFrontend 返回去掉 frontend_dist 前缀的嵌入文件系统
func EmbeddedFrontend() (fs.FS, error) {
	return fs.Sub(frontendFS, "frontend_dist")
}
