//go:build !windows

package handler

import (
	"os"
	"os/exec"

	"github.com/creack/pty"
)

func startPty(cmd *exec.Cmd) (*os.File, error) {
	return pty.Start(cmd)
}

func setPtySize(f *os.File, cols, rows int) {
	pty.Setsize(f, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}
