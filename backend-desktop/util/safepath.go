package util

import (
	"fmt"
	"path/filepath"
	"strings"
)

// SafeJoinPath 将 root 和 rel 安全拼接，防止路径穿越。
// 如果 rel 中含 ".." 导致最终路径跳出 root，返回 error。
func SafeJoinPath(root, rel string) (string, error) {
	if strings.ContainsRune(rel, 0) {
		return "", fmt.Errorf("path contains null byte")
	}

	cleaned := filepath.Clean("/" + rel)
	abs := filepath.Join(root, cleaned)

	relToRoot, err := filepath.Rel(root, abs)
	if err != nil {
		return "", fmt.Errorf("path resolution failed: %w", err)
	}
	if strings.HasPrefix(relToRoot, "..") {
		return "", fmt.Errorf("path escapes root: %s", rel)
	}
	return abs, nil
}

// SafeResolvePath 验证一个绝对路径是否在 root 目录下。
// 用于用户直接传入绝对路径的场景（如 filebrowser）。
func SafeResolvePath(root, absPath string) (string, error) {
	if strings.ContainsRune(absPath, 0) {
		return "", fmt.Errorf("path contains null byte")
	}

	cleaned := filepath.Clean(absPath)

	relToRoot, err := filepath.Rel(root, cleaned)
	if err != nil {
		return "", fmt.Errorf("path resolution failed: %w", err)
	}
	if strings.HasPrefix(relToRoot, "..") {
		return "", fmt.Errorf("path escapes root: %s", absPath)
	}
	return cleaned, nil
}
