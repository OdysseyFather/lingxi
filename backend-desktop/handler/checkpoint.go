package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// CreateCheckpoint 创建一个检查点快照
// POST /api/coding/checkpoint
func CreateCheckpoint(c *gin.Context) {
	var body struct {
		SessionID string `json:"sessionId"`
		MessageID int64  `json:"messageId"`
		WorkingDir string `json:"workingDir"`
		Files     []struct {
			Path string `json:"path"`
		} `json:"files"`
		TodoSnapshot json.RawMessage `json:"todoSnapshot"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.SessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	sessionID, err := strconv.ParseInt(body.SessionID, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sessionId"})
		return
	}

	var snapshots []db.FileSnapshot
	for _, f := range body.Files {
		fullPath := f.Path
		if body.WorkingDir != "" && !filepath.IsAbs(f.Path) {
			fullPath = filepath.Join(body.WorkingDir, f.Path)
		}
		content, err := os.ReadFile(fullPath)
		if err != nil {
			slog.Warn("checkpoint: cannot read file", "path", fullPath, "err", err)
			continue
		}
		snapshots = append(snapshots, db.FileSnapshot{
			Path:    f.Path,
			Content: string(content),
		})
	}

	cpID, err := db.CreateCheckpoint(sessionID, body.MessageID, snapshots, body.TodoSnapshot)
	if err != nil {
		slog.Error("CreateCheckpoint failed", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create checkpoint"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":             cpID,
		"session_id":     sessionID,
		"message_id":     body.MessageID,
		"files_count":    len(snapshots),
		"messages_count": 0,
	})
}

// RollbackCheckpoint 回滚到指定检查点
// POST /api/coding/rollback/:id
func RollbackCheckpoint(c *gin.Context) {
	cpID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid checkpoint id"})
		return
	}

	cp, err := db.GetCheckpoint(cpID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "checkpoint not found"})
		return
	}

	// 获取文件快照
	files, err := db.GetCheckpointFilesSnapshot(cpID)
	if err != nil {
		slog.Error("GetCheckpointFilesSnapshot failed", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file snapshot"})
		return
	}

	// 恢复文件（在事务前执行，失败则不回滚 DB）
	var restoredFiles []string
	for _, f := range files {
		fullPath := f.Path
		dir := filepath.Dir(fullPath)
		if dir != "" && dir != "." {
			_ = os.MkdirAll(dir, 0755)
		}
		if err := os.WriteFile(fullPath, []byte(f.Content), 0644); err != nil {
			slog.Warn("rollback: failed to restore file", "path", fullPath, "err", err)
			// 回滚已恢复的文件 — 但我们无法恢复原始内容，所以继续
			continue
		}
		restoredFiles = append(restoredFiles, f.Path)
	}

	// DB 事务：截断消息 + 删除后续检查点
	if err := db.RollbackToCheckpoint(cp); err != nil {
		slog.Error("RollbackToCheckpoint DB failed", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database rollback failed", "restored_files": restoredFiles})
		return
	}

	// 通过 WS 通知前端
	BroadcastEvent("checkpoint_rolled_back", map[string]any{
		"checkpoint_id":  cpID,
		"message_id":    cp.MessageID,
		"files_restored": len(restoredFiles),
	})

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"files_restored": len(restoredFiles),
		"todo_snapshot":  cp.TodoSnapshot,
	})
}

// ListCheckpoints 列出某会话的所有检查点
// GET /api/coding/checkpoints/:sessionId
func ListCheckpoints(c *gin.Context) {
	sessionID, err := strconv.ParseInt(c.Param("sessionId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sessionId"})
		return
	}

	cps, err := db.ListCheckpoints(sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list checkpoints"})
		return
	}
	if cps == nil {
		cps = []db.Checkpoint{}
	}
	c.JSON(http.StatusOK, cps)
}
