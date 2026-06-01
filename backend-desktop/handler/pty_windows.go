//go:build windows

package handler

import (
	"fmt"
	"os"
	"os/exec"
)

func startPty(cmd *exec.Cmd) (*os.File, error) {
	return nil, fmt.Errorf("PTY not supported on Windows")
}

func setPtySize(f *os.File, cols, rows int) {}
