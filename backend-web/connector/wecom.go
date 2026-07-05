package connector

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// WecomConfig 是企业微信连接器的配置
type WecomConfig struct {
	BaseConfig
	CorpID         string `json:"corp_id"`
	AgentID        string `json:"agent_id"`
	Secret         string `json:"secret"`
	Token          string `json:"token"`
	EncodingAESKey string `json:"encoding_aes_key"`
}

// WecomConnector 实现企业微信 Webhook 回调机器人
type WecomConnector struct {
	cfg     WecomConfig
	router  gin.IRouter
	cancel  context.CancelFunc
	agentID int64
}

func (w *WecomConnector) SetAgentID(id int64) { w.agentID = id }

// wecomXMLMsg 企业微信推送的 XML 消息体
type wecomXMLMsg struct {
	ToUserName   string `xml:"ToUserName"`
	FromUserName string `xml:"FromUserName"`
	CreateTime   int64  `xml:"CreateTime"`
	MsgType      string `xml:"MsgType"`
	Content      string `xml:"Content"`
	MsgId        string `xml:"MsgId"`
	AgentID      string `xml:"AgentID"`
}

// NewWecomConnector 创建企业微信连接器，router 用于注册 Webhook 路由
func NewWecomConnector(configJSON string, router gin.IRouter) (*WecomConnector, error) {
	cfg := WecomConfig{BaseConfig: DefaultBaseConfig()}
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, err
	}
	return &WecomConnector{cfg: cfg, router: router}, nil
}

func (w *WecomConnector) Platform() string { return "wecom" }

func (w *WecomConnector) Start(ctx context.Context) error {
	_, cancel := context.WithCancel(ctx)
	w.cancel = cancel

	// 注册 Webhook 路由
	w.router.GET("/wecom/callback", w.handleVerify)
	w.router.POST("/wecom/callback", w.handleMessage)

	slog.Info("webhook registered at /api/wecom/callback, corp_id", "corp_i_d", w.cfg.CorpID)
	// Webhook 模式无需阻塞，路由注册完即可
	<-ctx.Done()
	return nil
}

func (w *WecomConnector) Stop() {
	if w.cancel != nil {
		w.cancel()
	}
}

// handleVerify 处理企业微信服务器验证（GET 请求）
func (w *WecomConnector) handleVerify(c *gin.Context) {
	msgSignature := c.Query("msg_signature")
	timestamp := c.Query("timestamp")
	nonce := c.Query("nonce")
	echostr := c.Query("echostr")

	if !w.verifySignature(msgSignature, timestamp, nonce, echostr) {
		c.Status(http.StatusForbidden)
		return
	}

	// 解密 echostr
	plain, err := w.decryptMsg(echostr)
	if err != nil {
		slog.Warn("decrypt echostr error", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	c.String(http.StatusOK, plain)
}

// handleMessage 处理企业微信推送的消息（POST 请求）
func (w *WecomConnector) handleMessage(c *gin.Context) {
	msgSignature := c.Query("msg_signature")
	timestamp := c.Query("timestamp")
	nonce := c.Query("nonce")

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	// 解析加密 XML
	var encXML struct {
		Encrypt string `xml:"Encrypt"`
	}
	if err := xml.Unmarshal(body, &encXML); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	if !w.verifySignature(msgSignature, timestamp, nonce, encXML.Encrypt) {
		c.Status(http.StatusForbidden)
		return
	}

	plain, err := w.decryptMsg(encXML.Encrypt)
	if err != nil {
		slog.Warn("decrypt message error", "err", err)
		c.Status(http.StatusInternalServerError)
		return
	}

	var msg wecomXMLMsg
	if err := xml.Unmarshal([]byte(plain), &msg); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	c.Status(http.StatusOK)

	if msg.MsgType != "text" || msg.Content == "" {
		return
	}

	slog.Debug("received message from", "from_user_name", msg.FromUserName, "content", msg.Content)

	// 检测 @所有人：企业微信 XML 没有专门字段，通过消息文本检测
	isMentionAll := strings.Contains(msg.Content, "@所有人") || strings.Contains(msg.Content, "@all")

	replyFunc := func(reply string) error {
		return w.sendTextMsg(msg.FromUserName, reply)
	}

	// 企业微信 XML 消息中 FromUserName 是企业内的 userid
	// 企微不直接提供群名/用户昵称，后续可通过通讯录 API 扩展
	imMsg := IMMessage{
		Platform:       "wecom",
		UserID:         msg.FromUserName,
		ConversationID: msg.FromUserName,
		ConvType:       "private",
		Text:           msg.Content,
		AgentID:        w.agentID,
		IsMentionAll:   isMentionAll,
		BaseCfg:        w.cfg.BaseConfig,
		ReplyFunc:      replyFunc,
	}
	Dispatch(imMsg)
}

// verifySignature 验证企业微信消息签名
func (w *WecomConnector) verifySignature(msgSignature, timestamp, nonce, encrypt string) bool {
	strs := []string{w.cfg.Token, timestamp, nonce, encrypt}
	sort.Strings(strs)
	h := sha1.New()
	h.Write([]byte(strings.Join(strs, "")))
	signature := fmt.Sprintf("%x", h.Sum(nil))
	return signature == msgSignature
}

// decryptMsg 解密企业微信消息
func (w *WecomConnector) decryptMsg(encrypted string) (string, error) {
	aesKey, err := base64.StdEncoding.DecodeString(w.cfg.EncodingAESKey + "=")
	if err != nil {
		return "", err
	}
	cipherText, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", err
	}
	if len(cipherText) < aes.BlockSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	iv := aesKey[:aes.BlockSize]
	mode := cipher.NewCBCDecrypter(block, iv)
	mode.CryptBlocks(cipherText, cipherText)

	// 去除 PKCS7 填充
	pad := int(cipherText[len(cipherText)-1])
	if pad > aes.BlockSize || pad == 0 {
		return "", fmt.Errorf("invalid padding")
	}
	cipherText = cipherText[:len(cipherText)-pad]

	// 格式：16字节随机 + 4字节消息长度 + 消息内容 + CorpID
	if len(cipherText) < 20 {
		return "", fmt.Errorf("decrypted content too short")
	}
	msgLen := int(cipherText[16])<<24 | int(cipherText[17])<<16 | int(cipherText[18])<<8 | int(cipherText[19])
	if 20+msgLen > len(cipherText) {
		return "", fmt.Errorf("invalid message length")
	}
	return string(cipherText[20 : 20+msgLen]), nil
}

// sendTextMsg 通过企业微信 API 发送文本消息
func (w *WecomConnector) sendTextMsg(toUser, content string) error {
	token, err := w.getAccessToken()
	if err != nil {
		return err
	}
	payload := map[string]interface{}{
		"touser":  toUser,
		"msgtype": "text",
		"agentid": w.cfg.AgentID,
		"text":    map[string]string{"content": content},
	}
	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=%s", token)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	if errcode, ok := result["errcode"].(float64); ok && errcode != 0 {
		return fmt.Errorf("wecom send error: errcode=%.0f errmsg=%v", errcode, result["errmsg"])
	}
	return nil
}

// getAccessToken 获取企业微信 access_token（简单实现，无缓存）
func (w *WecomConnector) getAccessToken() (string, error) {
	url := fmt.Sprintf(
		"https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
		w.cfg.CorpID, w.cfg.Secret,
	)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	if token, ok := result["access_token"].(string); ok {
		return token, nil
	}
	return "", fmt.Errorf("wecom gettoken failed: %v", result)
}
