package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"lingxi-core/store"

	"github.com/gin-gonic/gin"
)

// ListProviders GET /api/providers
func ListProviders(c *gin.Context) {
	list, err := webStore.ListProviders(c.Request.Context())
	if err != nil {
		slog.Warn("ListProviders", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, list)
}

// ListAPIProfiles GET /api/api-profiles
func ListAPIProfiles(c *gin.Context) {
	uid := userID(c)
	includeCipher := c.Query("include_cipher") == "1"
	list, err := webStore.ListAPIProfiles(c.Request.Context(), uid, includeCipher)
	if err != nil {
		slog.Warn("ListAPIProfiles", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, list)
}

// UpsertAPIProfile POST /api/api-profiles
// body: { id?, name, provider_id, base_url, model, auth_token_cipher, auth_token_mask, extra }
func UpsertAPIProfile(c *gin.Context) {
	uid := userID(c)
	var body struct {
		ID               int64  `json:"id"`
		Name             string `json:"name"`
		ProviderID       int64  `json:"provider_id"`
		ProviderCode     string `json:"provider_code"`
		ProviderName     string `json:"provider_name"`
		ProviderProtocol string `json:"provider_protocol"`
		BaseURL          string `json:"base_url"`
		Model            string `json:"model"`
		AuthTokenCipher  string `json:"auth_token_cipher"`
		AuthTokenMask    string `json:"auth_token_mask"`
		Extra            string `json:"extra"`
		Transformer      string `json:"transformer"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" || body.ProviderID == 0 {
		c.Status(http.StatusBadRequest)
		return
	}
	if body.Extra == "" {
		body.Extra = "{}"
	}
	// 如果是更新且未提供新的 cipher，则保留旧值
	if body.ID > 0 && body.AuthTokenCipher == "" {
		old, err := webStore.GetAPIProfile(c.Request.Context(), uid, body.ID, true)
		if err == nil {
			body.AuthTokenCipher = old.AuthTokenCipher
			if body.AuthTokenMask == "" {
				body.AuthTokenMask = old.AuthTokenMask
			}
		}
	}
	ap := &store.APIProfile{
		ID:               body.ID,
		Name:             body.Name,
		ProviderID:       body.ProviderID,
		ProviderCode:     body.ProviderCode,
		ProviderName:     body.ProviderName,
		ProviderProtocol: body.ProviderProtocol,
		BaseURL:          body.BaseURL,
		Model:            body.Model,
		AuthTokenCipher:  body.AuthTokenCipher,
		AuthTokenMask:    body.AuthTokenMask,
		Extra:            body.Extra,
		Transformer:      body.Transformer,
	}
	id, err := webStore.UpsertAPIProfile(c.Request.Context(), uid, ap)
	if err != nil {
		slog.Warn("upsert api profile error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// DeleteAPIProfile DELETE /api/api-profiles/:id
func DeleteAPIProfile(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := webStore.DeleteAPIProfile(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

// ActivateAPIProfile POST /api/api-profiles/:id/activate
func ActivateAPIProfile(c *gin.Context) {
	uid := userID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if err := webStore.ActivateAPIProfile(c.Request.Context(), uid, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
