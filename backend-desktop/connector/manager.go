package connector

import (
	"context"
	"log/slog"
	"sync"

	"github.com/gin-gonic/gin"
	"lingxi-agent/db"
)

// Manager 管理所有 IM 连接器的生命周期
type Manager struct {
	mu         sync.Mutex
	running    map[string]context.CancelFunc // platform -> cancel
	ginRouter  gin.IRouter
}

var GlobalManager *Manager

func InitManager(router gin.IRouter) {
	GlobalManager = &Manager{
		running:   make(map[string]context.CancelFunc),
		ginRouter: router,
	}
}

// LoadFromDB 从数据库读取所有已启用的连接器并启动
func (m *Manager) LoadFromDB() {
	connectors, err := db.ListIMConnectors()
	if err != nil {
		slog.Warn("[connector manager] LoadFromDB error", "err", err)
		return
	}
	for _, c := range connectors {
		if c.Enabled {
			if err := m.StartWithAgent(c.Platform, c.Config, c.AgentID); err != nil {
				slog.Warn("[connector manager] start  error", "platform", c.Platform, "err", err)
			}
		}
	}
}

// Start 启动指定平台的连接器（已在运行则先停止再重启）
func (m *Manager) Start(platform, configJSON string) error {
	return m.StartWithAgent(platform, configJSON, 0)
}

// StartWithAgent 启动连接器并绑定智能体
func (m *Manager) StartWithAgent(platform, configJSON string, agentID int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 先停止已有的
	if cancel, ok := m.running[platform]; ok {
		cancel()
		delete(m.running, platform)
	}

	conn, err := m.buildConnector(platform, configJSON)
	if err != nil {
		return err
	}

	// 注入 agentID 到连接器
	if setter, ok := conn.(interface{ SetAgentID(int64) }); ok {
		setter.SetAgentID(agentID)
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.running[platform] = cancel

	go func() {
		slog.Info("[connector manager] starting", "value", platform)
		if err := conn.Start(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("[connector manager]  exited with error", "value", platform, "err", err)
		}
		m.mu.Lock()
		delete(m.running, platform)
		m.mu.Unlock()
	}()

	return nil
}

// Stop 停止指定平台的连接器
func (m *Manager) Stop(platform string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cancel, ok := m.running[platform]; ok {
		cancel()
		delete(m.running, platform)
		slog.Info("[connector manager] stopped", "value", platform)
	}
}

// IsRunning 返回指定平台是否正在运行
func (m *Manager) IsRunning(platform string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.running[platform]
	return ok
}

// buildConnector 根据平台名和配置 JSON 构建对应连接器
func (m *Manager) buildConnector(platform, configJSON string) (Connector, error) {
	switch platform {
	case "dingtalk":
		return NewDingtalkConnector(configJSON)
	case "feishu":
		return NewFeishuConnector(configJSON)
	case "wecom":
		return NewWecomConnector(configJSON, m.ginRouter)
	case "wecom_webhook":
		return NewWecomWebhookConnector(configJSON)
	default:
		return nil, nil
	}
}

// StartWebhook 启动 Webhook 连接器并注册实例（供 handler 调用发送）
func (m *Manager) StartWebhook(connID int64, platform, configJSON string) error {
	if platform != "wecom_webhook" {
		return m.Start(platform, configJSON)
	}
	conn, err := NewWecomWebhookConnector(configJSON)
	if err != nil {
		return err
	}
	RegisterWebhookInstance(connID, conn)
	return nil
}

// StopWebhook 停止 Webhook 连接器并注销实例
func (m *Manager) StopWebhook(connID int64, platform string) {
	if platform == "wecom_webhook" {
		UnregisterWebhookInstance(connID)
	} else {
		m.Stop(platform)
	}
}
