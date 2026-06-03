package handler

import (
	"encoding/json"
	"net/http"

	"lingxi-agent/db"

	"github.com/gin-gonic/gin"
)

// ─── 自定义子代理模板 ────────────────────────────────────────────

type codingAgentDef struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
	Model       string `json:"model,omitempty"`
	MaxTurns    int    `json:"maxTurns,omitempty"`
}

// buildSDKAgents 读取 coding_agents 表中的自定义子代理模板，
// 转换为 SDK options.agents 格式
func buildSDKAgents() []map[string]interface{} {
	rows, err := db.DB.Query(`SELECT id, name, description, prompt, model, max_turns FROM coding_agents ORDER BY id`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var agents []map[string]interface{}
	for rows.Next() {
		var a codingAgentDef
		if err := rows.Scan(&a.ID, &a.Name, &a.Description, &a.Prompt, &a.Model, &a.MaxTurns); err != nil {
			continue
		}
		def := map[string]interface{}{
			"name":        a.Name,
			"description": a.Description,
			"prompt":      a.Prompt,
		}
		if a.Model != "" {
			def["model"] = a.Model
		}
		if a.MaxTurns > 0 {
			def["maxTurns"] = a.MaxTurns
		}
		agents = append(agents, def)
	}
	return agents
}

// ─── Coding Agents CRUD API ──────────────────────────────────────

func ListCodingAgents(c *gin.Context) {
	rows, err := db.DB.Query(`SELECT id, name, description, prompt, model, max_turns FROM coding_agents ORDER BY id`)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"agents": []interface{}{}})
		return
	}
	defer rows.Close()

	var agents []codingAgentDef
	for rows.Next() {
		var a codingAgentDef
		if err := rows.Scan(&a.ID, &a.Name, &a.Description, &a.Prompt, &a.Model, &a.MaxTurns); err != nil {
			continue
		}
		agents = append(agents, a)
	}
	if agents == nil {
		agents = []codingAgentDef{}
	}
	c.JSON(http.StatusOK, gin.H{"agents": agents})
}

func SaveCodingAgent(c *gin.Context) {
	var a codingAgentDef
	if err := c.ShouldBindJSON(&a); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	if a.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	res, err := db.DB.Exec(
		`INSERT INTO coding_agents (name, description, prompt, model, max_turns) VALUES (?, ?, ?, ?, ?)`,
		a.Name, a.Description, a.Prompt, a.Model, a.MaxTurns,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()
	a.ID = id
	c.JSON(http.StatusOK, a)
}

func UpdateCodingAgent(c *gin.Context) {
	id := c.Param("id")
	var a codingAgentDef
	if err := c.ShouldBindJSON(&a); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	_, err := db.DB.Exec(
		`UPDATE coding_agents SET name=?, description=?, prompt=?, model=?, max_turns=? WHERE id=?`,
		a.Name, a.Description, a.Prompt, a.Model, a.MaxTurns, id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteCodingAgent(c *gin.Context) {
	id := c.Param("id")
	_, err := db.DB.Exec(`DELETE FROM coding_agents WHERE id=?`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ─── Plugins CRUD API ────────────────────────────────────────────

func GetCodingPlugins(c *gin.Context) {
	paths := loadPluginPaths()
	if paths == nil {
		paths = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"paths": paths})
}

func SaveCodingPlugins(c *gin.Context) {
	var body struct {
		Paths []string `json:"paths"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	raw, _ := json.Marshal(body.Paths)
	_, err := db.DB.Exec(
		`INSERT INTO kv_store (key, value) VALUES ('coding_plugin_paths', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		string(raw),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ─── Hooks Config API ────────────────────────────────────────────

func GetCodingHooksConfigHandler(c *gin.Context) {
	var raw string
	_ = db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='coding_hooks_config'`).Scan(&raw)
	if raw == "" {
		raw = `{"blockedPaths":[]}`
	}
	c.Data(http.StatusOK, "application/json", []byte(raw))
}

func UpdateCodingHooksConfigHandler(c *gin.Context) {
	rawBody, _ := c.GetRawData()
	_, err := db.DB.Exec(
		`INSERT INTO kv_store (key, value) VALUES ('coding_hooks_config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		string(rawBody),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ─── System Prompt Config API ────────────────────────────────────

func GetCodingPromptConfigHandler(c *gin.Context) {
	var raw string
	_ = db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='coding_prompt_append'`).Scan(&raw)
	c.JSON(http.StatusOK, gin.H{
		"append":  raw,
		"default": codingSDKSystemPrompt,
	})
}

func UpdateCodingPromptConfigHandler(c *gin.Context) {
	var body struct {
		Append string `json:"append"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	_, err := db.DB.Exec(
		`INSERT INTO kv_store (key, value) VALUES ('coding_prompt_append', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		body.Append,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ─── Permission Config API ───────────────────────────────────────

func GetCodingPermConfigHandler(c *gin.Context) {
	var raw string
	_ = db.DB.QueryRow(`SELECT value FROM kv_store WHERE key='coding_perm_config'`).Scan(&raw)
	if raw == "" {
		raw = `{"mode":"trust","allowedTools":[],"disallowedTools":[]}`
	}
	c.Data(http.StatusOK, "application/json", []byte(raw))
}

func UpdateCodingPermConfigHandler(c *gin.Context) {
	rawBody, _ := c.GetRawData()
	_, err := db.DB.Exec(
		`INSERT INTO kv_store (key, value) VALUES ('coding_perm_config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		string(rawBody),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
