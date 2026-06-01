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
	if runtime.GOOS == "windows" {
		shell = "cmd.exe"
	}
	if s := os.Getenv("SHELL"); s != "" {
		shell = s
	}

	cmd := exec.Command(shell, "-l")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := startPty(cmd)
	if err != nil {
		slog.Warn("pty start failed", "err", err)
		conn.WriteJSON(map[string]string{"error": "failed to start shell: " + err.Error()})
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
