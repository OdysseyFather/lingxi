package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// ListMCPServers GET /api/mcp
func ListMCPServers(c *gin.Context) {
	list, err := db.ListMCPServers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// UpsertMCPServer POST /api/mcp
func UpsertMCPServer(c *gin.Context) {
	var body db.MCPServer
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	if body.Transport == "" {
		body.Transport = "stdio"
	}
	if body.Args == "" {
		body.Args = "[]"
	}
	if body.Env == "" {
		body.Env = "{}"
	}
	if body.Headers == "" {
		body.Headers = "{}"
	}
	id, err := db.UpsertMCPServer(&body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	BroadcastEvent("mcp_changed", map[string]any{"id": id})
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// DeleteMCPServer DELETE /api/mcp/:id
func DeleteMCPServer(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := db.DeleteMCPServer(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	BroadcastEvent("mcp_changed", map[string]any{"id": id, "deleted": true})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ToggleMCPServer POST /api/mcp/:id/toggle  body: {enabled: bool}
func ToggleMCPServer(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Enabled bool `json:"enabled"`
	}
	c.ShouldBindJSON(&body)
	if err := db.SetMCPServerEnabled(id, body.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	BroadcastEvent("mcp_changed", map[string]any{"id": id, "enabled": body.Enabled})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ExportMCPConfig GET /api/mcp/export
// 返回 Claude Code .claude.json 期望的 mcpServers 对象
func ExportMCPConfig(c *gin.Context) {
	list, err := db.ListMCPServers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := map[string]any{}
	for _, m := range list {
		if !m.Enabled {
			continue
		}
		entry := map[string]any{}
		switch m.Transport {
		case "stdio", "":
			entry["command"] = m.Command
			var args []string
			json.Unmarshal([]byte(m.Args), &args)
			entry["args"] = args
			var env map[string]string
			json.Unmarshal([]byte(m.Env), &env)
			if len(env) > 0 {
				entry["env"] = env
			}
		case "sse":
			entry["transport"] = "sse"
			entry["url"] = m.URL
			var headers map[string]string
			json.Unmarshal([]byte(m.Headers), &headers)
			if len(headers) > 0 {
				entry["headers"] = headers
			}
		case "http":
			entry["transport"] = "http"
			entry["url"] = m.URL
			var headers map[string]string
			json.Unmarshal([]byte(m.Headers), &headers)
			if len(headers) > 0 {
				entry["headers"] = headers
			}
		}
		out[m.Name] = entry
	}
	c.JSON(http.StatusOK, gin.H{"mcpServers": out})
}

