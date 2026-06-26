package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"community-server/config"
)

// SaveBundle 保存 Bundle 文件到磁盘，返回相对路径（存到 DB）和绝对路径
// agentID + version 作为子目录
func SaveBundle(agentID, version string, src io.Reader) (relPath string, absPath string, size int64, err error) {
	cfg := config.Get()
	dir := filepath.Join(cfg.Storage.BundlesDir, agentID, version)
	os.MkdirAll(dir, 0755)

	absPath = filepath.Join(dir, "bundle.lxbundle")
	f, err := os.Create(absPath)
	if err != nil {
		return "", "", 0, err
	}
	defer f.Close()

	size, err = io.Copy(f, src)
	if err != nil {
		return "", "", 0, err
	}
	relPath = fmt.Sprintf("%s/%s/bundle.lxbundle", agentID, version)
	return relPath, absPath, size, nil
}

// BundleAbsPath 把 DB 里的相对路径转换为绝对路径
func BundleAbsPath(relPath string) string {
	cfg := config.Get()
	return filepath.Join(cfg.Storage.BundlesDir, relPath)
}

// BundleURL 生成下载 URL
func BundleURL(relPath string) string {
	cfg := config.Get()
	return cfg.Storage.BundlesURLPrefix + "/" + relPath
}

// DeleteBundle 删除 Agent 的某个版本目录
func DeleteBundle(agentID, version string) error {
	cfg := config.Get()
	dir := filepath.Join(cfg.Storage.BundlesDir, agentID, version)
	return os.RemoveAll(dir)
}

// DeleteAllBundles 删除 Agent 的所有版本
func DeleteAllBundles(agentID string) error {
	cfg := config.Get()
	dir := filepath.Join(cfg.Storage.BundlesDir, agentID)
	return os.RemoveAll(dir)
}
