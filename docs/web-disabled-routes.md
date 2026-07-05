# 灵犀 Web 端 — 禁用功能清单

前后端必须双向对齐：**前端不展示 + 后端不注册路由**。

## 后端不注册（backend-web/main.go）

| 模块 | 桌面路由前缀 | Web 状态 |
|------|-------------|----------|
| Screen Agent | `/api/screen-agent/*` | 禁用 |
| H5 / Pair | `/api/pair/*`, `/api/auth/ws-ticket`, `/h5` | 禁用 |
| Terminal | `/api/terminal/ws` | 禁用 |
| OAuth SSO | `/api/auth/guest`, `/api/auth/oauth/*` | 禁用（改用 JWT login/register） |
| Push 通知 | `/api/push/*` | 禁用 |
| IM 连接器 | `/api/im-connectors/*` | 可选禁用（当前未注册） |
| Coding View | 已移除 | — |
| A2A 1v1 | 已移除 | — |

## 前端隐藏（frontend-web）

| 功能 | 处理方式 |
|------|----------|
| Screen Agent 面板 | 不渲染 |
| Electron IPC | 检测 `window.electronAPI` 缺失 |
| OAuth / 游客登录 | 使用 WebLoginPage |
| 远程配对 / H5 | 设置页隐藏 |
| Terminal | 无入口 |

## Web 保留

对话、智能体、技能、知识库、MCP、Nexus 群聊、定时任务、进化、深度搜索、用量统计、Admin 管理后台。
