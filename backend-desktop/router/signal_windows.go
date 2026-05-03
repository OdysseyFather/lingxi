//go:build windows

package router

import "os"

// Windows 下不支持 Signal(0) 探测存活，使用 FindProcess 后检查。
// 这里用 os.Kill（在 Windows 上不会实际杀进程，只探测存在性）作为替代。
var zeroSignal = os.Kill
