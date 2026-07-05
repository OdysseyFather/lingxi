package handler

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"strconv"

	"lingxi-web-agent/db/mysql"

	"github.com/gin-gonic/gin"
)

// ExportUserData GET /api/me/export — 导出用户数据 ZIP
func ExportUserData(c *gin.Context) {
	userID := c.GetInt64("userID")
	if userID == 0 {
		if v, ok := c.Get("userID"); ok {
			userID = v.(int64)
		}
	}
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	rows, _ := mysql.DB.QueryContext(c.Request.Context(), `
		SELECT id, title FROM sessions WHERE user_id=?`, userID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var sid int64
			var title string
			rows.Scan(&sid, &title)
			msgs, _ := mysql.DB.QueryContext(c.Request.Context(), `
				SELECT role, content FROM messages WHERE user_id=? AND session_id=? ORDER BY id`, userID, sid)
			if msgs == nil {
				continue
			}
			var content bytes.Buffer
			content.WriteString("# " + title + "\n\n")
			for msgs.Next() {
				var role, text string
				msgs.Scan(&role, &text)
				content.WriteString("## " + role + "\n" + text + "\n\n")
			}
			msgs.Close()
			fw, _ := zw.Create(title + ".md")
			fw.Write(content.Bytes())
		}
	}
	zw.Close()
	c.Header("Content-Disposition", `attachment; filename="lingxi-export.zip"`)
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// DeleteAccount DELETE /api/me/account — 软删除账号
func DeleteAccount(c *gin.Context) {
	userID := c.GetInt64("userID")
	if userID == 0 {
		if v, ok := c.Get("userID"); ok {
			userID = v.(int64)
		}
	}
	_, err := mysql.DB.ExecContext(c.Request.Context(), `
		UPDATE users SET status='deleted', deleted_at=NOW() WHERE id=?`, userID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "grace_days": 30})
}

func GetUserID(c *gin.Context) int64 {
	if v, ok := c.Get("userID"); ok {
		return v.(int64)
	}
	return 0
}

func ParseIDParam(c *gin.Context) int64 {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	return id
}

func init() { _ = context.Background() }
