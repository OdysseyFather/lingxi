package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var termUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// TerminalWsHandler GET /api/terminal/ws?cwd=xxx
func TerminalWsHandler(c *gin.Context) {
	if !WsAuthCheck(c) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "ws authentication required"})
		return
	}
	cwd := c.Query("cwd")
	if cwd == "" {
		home, _ := os.UserHomeDir()
		cwd = home
	}

	conn, err := termUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Warn("terminal ws upgrade failed", "err", err)
		return
	}
	defer conn.Close()

	shell := "/bin/zsh"
	shellArgs := []string{"-l"}
	if runtime.GOOS == "windows" {
		shell = "cmd.exe"
		shellArgs = []string{}
		if ps, _ := exec.LookPath("powershell.exe"); ps != "" {
			shell = ps
			shellArgs = []string{"-NoLogo"}
		}
	} else if s := os.Getenv("SHELL"); s != "" {
		shell = s
	}

	cmd := exec.Command(shell, shellArgs...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	// Unix: 使用 PTY（伪终端），支持完整的终端交互
	// Windows: PTY 不可用，回退到 stdin/stdout pipe 模式
	ptmx, err := startPty(cmd)
	if err != nil {
		if runtime.GOOS != "windows" {
			slog.Warn("pty start failed", "err", err)
			conn.WriteJSON(map[string]string{"error": "failed to start shell: " + err.Error()})
			return
		}
		// Windows pipe 模式
		runPipeTerminal(conn, cmd, cwd)
		return
	}
	defer func() {
		ptmx.Close()
		cmd.Process.Kill()
		cmd.Wait()
	}()

	var closeOnce sync.Once
	done := make(chan struct{})

	// pty → WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				msg, _ := json.Marshal(map[string]string{"type": "output", "data": string(buf[:n])})
				if writeErr := conn.WriteMessage(websocket.TextMessage, msg); writeErr != nil {
					break
				}
			}
			if err != nil {
				if err != io.EOF {
					slog.Debug("pty read error", "err", err)
				}
				break
			}
		}
		closeOnce.Do(func() { close(done) })
	}()

	// WebSocket → pty
	go func() {
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var msg struct {
				Type string `json:"type"`
				Data string `json:"data"`
				Cols int    `json:"cols"`
				Rows int    `json:"rows"`
			}
			if json.Unmarshal(message, &msg) != nil {
				continue
			}
			switch msg.Type {
			case "input":
				ptmx.Write([]byte(msg.Data))
			case "resize":
				if msg.Cols > 0 && msg.Rows > 0 {
					setPtySize(ptmx, msg.Cols, msg.Rows)
				}
			}
		}
		closeOnce.Do(func() { close(done) })
	}()

	<-done
}

// runPipeTerminal Windows 专用：通过 stdin/stdout pipe 实现终端交互
func runPipeTerminal(conn *websocket.Conn, cmd *exec.Cmd, cwd string) {
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		slog.Warn("stdin pipe failed", "err", err)
		conn.WriteJSON(map[string]string{"error": "failed to create stdin pipe: " + err.Error()})
		return
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		slog.Warn("stdout pipe failed", "err", err)
		conn.WriteJSON(map[string]string{"error": "failed to create stdout pipe: " + err.Error()})
		return
	}
	cmd.Stderr = cmd.Stdout // 合并 stderr 到 stdout

	if err := cmd.Start(); err != nil {
		slog.Warn("cmd start failed (pipe mode)", "err", err)
		conn.WriteJSON(map[string]string{"error": "failed to start shell: " + err.Error()})
		return
	}

	defer func() {
		stdinPipe.Close()
		cmd.Process.Kill()
		cmd.Wait()
	}()

	var closeOnce sync.Once
	done := make(chan struct{})

	// stdout → WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stdoutPipe.Read(buf)
			if n > 0 {
				msg, _ := json.Marshal(map[string]string{"type": "output", "data": string(buf[:n])})
				if writeErr := conn.WriteMessage(websocket.TextMessage, msg); writeErr != nil {
					break
				}
			}
			if err != nil {
				break
			}
		}
		closeOnce.Do(func() { close(done) })
	}()

	// WebSocket → stdin
	go func() {
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var msg struct {
				Type string `json:"type"`
				Data string `json:"data"`
			}
			if json.Unmarshal(message, &msg) != nil {
				continue
			}
			if msg.Type == "input" {
				stdinPipe.Write([]byte(msg.Data))
			}
		}
		closeOnce.Do(func() { close(done) })
	}()

	<-done
}
