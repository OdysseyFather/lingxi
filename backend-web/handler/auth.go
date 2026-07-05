package handler

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"lingxi-core/store"
	"lingxi-web-agent/config"
	"lingxi-web-agent/db/mysql"
	"lingxi-web-agent/middleware"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

var (
	webCfg    config.Config
	webSecret []byte
	webStore  store.Store
)

func InitWeb(cfg config.Config, st store.Store) {
	webCfg = cfg
	webSecret = []byte(cfg.JWTSecret)
	webStore = st
}

func RegisterAuthRoutes(r *gin.RouterGroup) {
	r.POST("/auth/login", Login)
	r.POST("/auth/register", Register)
	r.GET("/auth/me", middleware.RequireUser(webSecret), Me)
	r.POST("/auth/logout", middleware.RequireUser(webSecret), Logout)
}

func RegisterAdminRoutes(r *gin.RouterGroup) {
	admin := r.Group("/admin", middleware.RequireUser(webSecret), middleware.RequireAdmin())
	admin.GET("/users", ListUsers)
	admin.POST("/invitations", CreateInvitation)
	admin.GET("/invitations", ListInvitations)
}

func BootstrapAdmin(ctx context.Context) error {
	if webCfg.AdminBootstrap == "" {
		return nil
	}
	n, err := mysql.CountUsers(ctx)
	if err != nil || n > 0 {
		return err
	}
	parts := strings.SplitN(webCfg.AdminBootstrap, ":", 2)
	if len(parts) != 2 {
		return nil
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(parts[1]), bcrypt.DefaultCost)
	id, err := webStore.CreateUser(ctx, &store.WebUser{
		Username: parts[0], PasswordHash: string(hash), Role: "admin", Status: "active", DisplayName: parts[0],
	})
	if err != nil {
		return err
	}
	_ = mysql.EnsureUserDirs(webCfg.DataDir, id)
	return nil
}

func Login(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Username == "" || body.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名和密码必填"})
		return
	}
	ip := c.ClientIP()
	ok, _ := webStore.CheckRateLimit(c.Request.Context(), 0, ip, "login", 10, 60)
	if !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "登录过于频繁"})
		return
	}
	u, err := webStore.GetUserByUsername(c.Request.Context(), body.Username)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(body.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}
	if u.Status != "active" {
		c.JSON(http.StatusForbidden, gin.H{"error": "账号已停用"})
		return
	}
	token, err := issueToken(c, u)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	_ = mysql.UpdateLastLogin(c.Request.Context(), u.ID)
	c.JSON(http.StatusOK, gin.H{"token": token, "user": publicUser(u)})
}

func Register(c *gin.Context) {
	var body struct {
		Username   string `json:"username"`
		Password   string `json:"password"`
		InviteCode string `json:"invite_code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Username == "" || body.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	if !webCfg.OpenRegistration && body.InviteCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要邀请码"})
		return
	}
	role := "user"
	if body.InviteCode != "" {
		inv, err := webStore.GetInvitationByCode(c.Request.Context(), body.InviteCode)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邀请码无效"})
			return
		}
		role = inv.Role
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	id, err := webStore.CreateUser(c.Request.Context(), &store.WebUser{
		Username: body.Username, PasswordHash: string(hash), Role: role, Status: "active", DisplayName: body.Username,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
		return
	}
	if body.InviteCode != "" {
		_ = mysql.UseInvitation(c.Request.Context(), body.InviteCode)
	}
	_ = mysql.EnsureUserDirs(webCfg.DataDir, id)
	u, _ := webStore.GetUserByID(c.Request.Context(), id)
	token, err := issueToken(c, u)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": publicUser(u)})
}

func Me(c *gin.Context) {
	uid, _ := c.Get("userID")
	userID := uid.(int64)
	u, err := webStore.GetUserByID(c.Request.Context(), userID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	usage, _ := webStore.GetUsageQuota(c.Request.Context(), userID)
	limits, _ := webStore.GetQuotaLimits(c.Request.Context(), userID)
	c.JSON(http.StatusOK, gin.H{"user": publicUser(u), "usage": usage, "limits": limits})
}

func Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func issueToken(c *gin.Context, u *store.WebUser) (string, error) {
	raw := randomToken()
	hash := middleware.HashToken(raw)
	expires := time.Now().Add(7 * 24 * time.Hour)
	_, _ = webStore.CreateAuthToken(c.Request.Context(), &store.AuthToken{
		UserID: u.ID, TokenHash: hash, DeviceInfo: c.GetHeader("User-Agent"), IPAddress: c.ClientIP(), ExpiresAt: expires,
	})
	return middleware.IssueJWT(webSecret, u.ID, u.Username, u.Role, 7*24*time.Hour)
}

func randomToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func publicUser(u *store.WebUser) gin.H {
	return gin.H{
		"id": u.ID, "username": u.Username, "role": u.Role, "display_name": u.DisplayName, "status": u.Status,
	}
}

func ListUsers(c *gin.Context) {
	rows, err := mysql.DB.QueryContext(c.Request.Context(), `
		SELECT id, username, role, status, display_name, created_at FROM users WHERE status != 'deleted' ORDER BY id`)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	users := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var username, role, status, displayName string
		var createdAt time.Time
		if err := rows.Scan(&id, &username, &role, &status, &displayName, &createdAt); err != nil {
			continue
		}
		users = append(users, gin.H{"id": id, "username": username, "role": role, "status": status, "display_name": displayName, "created_at": createdAt})
	}
	c.JSON(http.StatusOK, users)
}

func CreateInvitation(c *gin.Context) {
	var body struct {
		Code     string `json:"code"`
		Role     string `json:"role"`
		MaxUses  int    `json:"max_uses"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if body.Code == "" {
		body.Code = randomToken()[:12]
	}
	if body.Role == "" {
		body.Role = "user"
	}
	if body.MaxUses <= 0 {
		body.MaxUses = 1
	}
	uid, _ := c.Get("userID")
	_, err := mysql.DB.ExecContext(c.Request.Context(), `
		INSERT INTO invitations (code, role, max_uses, created_by) VALUES (?,?,?,?)`,
		body.Code, body.Role, body.MaxUses, uid)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "邀请码已存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": body.Code, "role": body.Role, "max_uses": body.MaxUses})
}

func ListInvitations(c *gin.Context) {
	rows, err := mysql.DB.QueryContext(c.Request.Context(), `
		SELECT code, role, max_uses, used_count, expires_at, created_at FROM invitations ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var code, role string
		var maxUses, used int
		var exp *time.Time
		var created time.Time
		var expNull sql.NullTime
		if err := rows.Scan(&code, &role, &maxUses, &used, &expNull, &created); err != nil {
			continue
		}
		if expNull.Valid {
			t := expNull.Time
			exp = &t
		}
		list = append(list, gin.H{"code": code, "role": role, "max_uses": maxUses, "used_count": used, "expires_at": exp, "created_at": created})
	}
	c.JSON(http.StatusOK, list)
}
