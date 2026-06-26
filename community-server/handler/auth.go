package handler

import (
	"net/http"
	"strings"

	"community-server/db"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware 校验 Authorization: Bearer <token>
// optional=true 表示未登录也可以访问（只读）
func AuthMiddleware(optional bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			if optional {
				c.Next()
				return
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			c.Abort()
			return
		}

		user, err := db.GetUserByToken(token)
		if err != nil {
			if optional {
				c.Next()
				return
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}
		c.Set("user_id", user.ID)
		c.Set("user", user)
		db.TouchUserLastActive(user.ID)
		c.Next()
	}
}

// RequireUser 从上下文中取出当前登录用户，未登录则返回 401
func RequireUser(c *gin.Context) (userID string, ok bool) {
	v, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return "", false
	}
	return v.(string), true
}

// CurrentUser 从上下文中取出当前登录用户对象
func CurrentUser(c *gin.Context) string {
	v, exists := c.Get("user_id")
	if !exists {
		return ""
	}
	return v.(string)
}

func extractToken(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	// 支持 query 参数 ?token=xxx
	if t := c.Query("token"); t != "" {
		return t
	}
	return ""
}

// RegisterAnon POST /community/auth/anon — 匿名注册
func RegisterAnon(c *gin.Context) {
	user, err := db.CreateUserByAnon()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"user":  user,
		"token": user.AuthToken,
	})
}

// GetMe GET /community/auth/me — 获取当前用户信息
func GetMe(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	user, err := db.GetUserByID(uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// UpdateMe PUT /community/auth/me — 更新个人资料
func UpdateMe(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	var req struct {
		DisplayName string `json:"display_name"`
		Avatar      string `json:"avatar"`
		Bio         string `json:"bio"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := db.UpdateUser(uid, req.DisplayName, req.Avatar, req.Bio); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	user, _ := db.GetUserByID(uid)
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// GetUser GET /community/users/:id — 用户主页
func GetUser(c *gin.Context) {
	id := c.Param("id")
	user, err := db.GetUserByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	// 附加：当前用户是否关注了此人
	currentUID := CurrentUser(c)
	isFollowing := false
	if currentUID != "" {
		isFollowing = db.IsFollowing(currentUID, id)
	}
	c.JSON(http.StatusOK, gin.H{
		"user":         user,
		"is_following": isFollowing,
	})
}

// FollowUser POST /community/users/:id/follow — 关注
func FollowUser(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	targetID := c.Param("id")
	if uid == targetID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot follow yourself"})
		return
	}
	if err := db.FollowUser(uid, targetID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UnfollowUser DELETE /community/users/:id/follow — 取关
func UnfollowUser(c *gin.Context) {
	uid := CurrentUser(c)
	if uid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	targetID := c.Param("id")
	if err := db.UnfollowUser(uid, targetID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListFollowing GET /community/users/:id/following — 关注列表
func ListFollowing(c *gin.Context) {
	id := c.Param("id")
	users, err := db.ListFollowing(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"users": users})
}

// ListFollowers GET /community/users/:id/followers — 粉丝列表
func ListFollowers(c *gin.Context) {
	id := c.Param("id")
	users, err := db.ListFollowers(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"users": users})
}
