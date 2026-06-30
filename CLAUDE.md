# CLAUDE.md — 灵犀 AI Agent 项目指南

本文件为 AI 助手（Claude / Cursor / Copilot 等）提供项目上下文，帮助快速理解系统全貌并高效开发。

---

## 项目简介

**灵犀 AI Agent** 是一个本地优先的桌面 AI Agent 工作台，采用 Electron + React + Go 三层架构。支持多模型接入、智能体工厂、技能管理、知识库、MCP 工具、IM 集成等能力。

---

## 技术栈

### 前端 `frontend-desktop/`
- **React 19** + **Vite 8**（构建需 Node.js ≥ 20.19 或 ≥ 22.12）
- **Tailwind CSS 3.4** — 全局样式，17 套主题通过 CSS 变量切换
- **Zustand 5** — 全局状态管理（`src/state/useStore.js`，模块化切片：auth/ui/session/chat/nexus）
- **Framer Motion 12** — 页面过渡、列表动画
- **Lucide React** — 图标（不使用 emoji）
- **prism-react-renderer 2** — 代码高亮
- **@tanstack/react-virtual 3** — 虚拟滚动
- **react-markdown + remark-gfm** — Markdown 渲染
- **Recharts 3** — 用量图表

### 后端 `backend-desktop/`
- **Go 1.24** + **Gin 1.10**
- **Gorilla WebSocket** — 流式对话
- **ncruces/go-sqlite3** — 纯 Go SQLite（无 CGO 依赖）
- **ledongthuc/pdf** — PDF 文本提取
- **nguyenthenguyen/docx** — DOCX 文本提取

### 桌面壳 `electron/`
- **Electron 36** + **electron-builder 25**
- 打包目标: macOS arm64

---

## 项目结构

```
lingxi-agent/
├── backend-desktop/          # Go 后端
│   ├── main.go               # 入口 + 路由注册
│   ├── config/               # 配置管理
│   ├── logger/               # 结构化日志（slog JSON + LOG_LEVEL 环境变量）
│   ├── db/                   # SQLite 数据层（模块化拆分）
│   │   ├── db.go             # 初始化 + 迁移（schema_version 版本化）
│   │   ├── session.go        # 会话/任务/挂起任务 CRUD
│   │   ├── knowledge.go      # 知识库/分类 CRUD
│   │   ├── provider.go       # Provider/APIProfile CRUD
│   │   ├── usage.go          # 用量记录/配额 CRUD
│   │   ├── scheduled.go      # 定时任务 CRUD
│   │   ├── auth.go           # 用户/OAuth 配置 CRUD
│   │   ├── im_connector.go   # IM 连接器 CRUD
│   │   ├── feishu_monitor.go # 飞书监听模式规则 + 日志 CRUD
│   │   ├── evolution.go      # 自我进化日志 CRUD + InsertMemory
│   │   ├── nexus.go          # Nexus 表 CRUD（peers/contacts/a2a）
│   │   ├── group_chat.go     # 群聊 CRUD（group_chats/group_members/group_messages，含微信风扩展列）
│   │   ├── agent_personality.go  # 群聊 Agent 人格（agent_personalities 表）
│   │   ├── mcp_agent.go      # MCP-Agent 关联
│   │   └── screen_agent.go   # Screen Agent screen_actions 表 CRUD
│   ├── handler/              # HTTP Handlers
│   │   ├── agent_distill.go  # 人格蒸馏（dot-skill SSE + apply）
│   │   ├── agent_avatar.go   # 智能体头像上传
│   │   ├── dot_skill.go      # dot-skill 安装与路径
│   │   ├── agent.go          # 智能体 CRUD（含 API 缓存）
│   │   ├── cache.go          # TTL 缓存（sync.RWMutex，30s）
│   │   ├── chat.go           # 对话 + WebSocket 流式
│   │   ├── knowledge.go      # 知识库（支持 .md/.txt/.csv/.json/.pdf/.docx）
│   │   ├── session.go        # 会话管理 + 消息搜索
│   │   ├── provider.go       # 模型接入点（含 API 缓存）
│   │   ├── skill.go          # 技能管理（含 API 缓存 + 增强导出）
│   │   ├── mcp.go            # MCP 服务管理
│   │   ├── usage.go          # 用量统计
│   │   ├── im_connector.go   # IM 连接器
│   │   ├── feishu_monitor.go # 飞书监听模式规则 CRUD + 日志 + 群列表 API
│   │   ├── scheduled.go      # 定时任务 CRUD
│   │   ├── auth.go           # SSO 登录（OAuth code 换 token + 游客登录）
│   │   ├── nexus.go          # Nexus 对外 API + 设置 + WAN API
│   │   ├── a2a_conversation.go # A2A 对话管理（发起/接受/拒绝/暂停/接管/终止/审批）
│   │   ├── agent_nexus_config.go # Agent 对外设置 CRUD
│   │   ├── evolution.go      # 自我进化引擎 + API（分析/提取/日志）
│   │   ├── screen_agent.go   # Screen Agent API（截屏分析/规划/OTA循环/安全确认）
│   │   ├── backup.go         # 数据库备份（VACUUM INTO + 导出）
│   │   ├── health.go         # 结构化健康检查
│   │   ├── middleware.go     # CORS + Body Size + Rate Limiter
│   │   ├── memory.go         # 长期记忆 CRUD + 消息固定
│   │   ├── transcribe.go     # 语音识别（本地 whisper.cpp 优先，回退远端 API）
│   │   ├── group_chat.go     # 群聊 HTTP API（创建/列表/发言/撤回/分页消息/邀请处理）
│   │   ├── group_upload.go   # 群聊图片上传（POST /api/group-chats/upload）
│   │   ├── agent_personality.go # Agent 群聊人格 CRUD（GET/PUT /api/agents/:id/personality）
│   │   └── ws_hub.go         # WebSocket Hub
│   ├── connector/            # IM 平台对接（企微/钉钉/飞书，含飞书监听模式）
│   ├── model/                # 数据模型
│   ├── nexus/                # Agent 间对话引擎（无 Token 认证，无联系人机制）
│   │   ├── discovery.go      # mDNS 发现服务 + 广域网信令客户端启动
│   │   ├── conversation.go   # 对话执行引擎（第一人称自然对话提示词）
│   │   ├── http_client.go    # HTTP 通信工具（PostJSON + 重试）
│   │   ├── transport.go      # Transport 接口（Send 无 token 参数）
│   │   ├── lan_transport.go  # 局域网 HTTP 直连传输
│   │   ├── wan_transport.go  # 广域网传输（信令中继）
│   │   └── signaling.go      # 信令客户端（无 HMAC，支持 conversation_invite/accept/reject）
│   ├── proxy/                # 纯 Go 协议转换代理（Anthropic ↔ OpenAI，替代 Python LiteLLM）
│   │   ├── types.go          # Anthropic + OpenAI 类型定义
│   │   ├── transform.go      # 请求转换（messages / system / tools / thinking）
│   │   ├── stream.go         # 流式响应转换（OpenAI SSE → Anthropic SSE）
│   │   ├── nonstream.go      # 非流式响应转换
│   │   └── server.go         # HTTP 服务器（/v1/messages + /health + /v1/models）
│   ├── router/               # AI 引擎路由（Go 代理管理 + OpenAI 协议桥接）
│   ├── scheduler/            # 定时任务调度器
│   ├── groupbehavior/        # 群聊行为引擎（人格驱动并发评估 + quirks + 冷场守望者）
│   ├── vectordb/             # 向量数据库（纯 Go cosine + 分块/嵌入/混合检索）
│   │   ├── vectordb.go       # 向量 DB 初始化 + CRUD + cosine 搜索 + 配置管理
│   │   ├── chunker.go        # 文本递归分块（512 字符，128 重叠）
│   │   ├── embedder.go       # 嵌入接口（API 模式）
│   │   ├── retriever.go      # 混合检索（向量 + BM25 + RRF 融合）
│   │   └── indexer.go        # 索引引擎（全量/增量/监控目录）
│   ├── watcher/              # 文件夹监控（fsnotify 变化检测 + 增量索引）
│   │   └── watcher.go
│   └── usage/                # 用量计算 + 定价
│
├── frontend-desktop/         # React 前端
│   ├── src/
│   │   ├── main.jsx          # 入口
│   │   ├── index.css         # Tailwind + 主题 CSS 变量
│   │   ├── api/client.js     # fetch 封装
│   │   ├── state/
│   │   │   ├── useStore.js   # Zustand store（组合多切片）
│   │   │   └── slices/       # authSlice/uiSlice/sessionSlice/chatSlice/nexusSlice
│   │   ├── ui/               # 通用 UI
│   │   │   ├── AppShell.jsx  # 主布局（顶部导航+侧边栏+主区域+AnimatePresence）
│   │   │   ├── primitives.jsx # 原子组件（Button/Card/Modal/Badge/Input...）
│   │   │   ├── cn.js         # clsx + tailwind-merge
│   │   │   ├── SidebarSessions.jsx  # 会话列表（置顶/重命名/批量删除）
│   │   │   ├── ModelSwitcher.jsx
│   │   │   └── RouterPill.jsx
│   │   ├── chat/             # 对话模块
│   │   │   ├── ChatView.jsx  # 对话主页面
│   │   │   ├── Composer.jsx  # 输入框 + 斜杠命令 + 图片粘贴
│   │   │   ├── MessageList.jsx # 消息列表 + 虚拟滚动
│   │   │   ├── Bubble.jsx    # 消息气泡 + 复制按钮
│   │   │   ├── blocks.jsx    # 文本块/思考块/工具块渲染
│   │   │   ├── SearchModal.jsx # Cmd+K 全文搜索
│   │   │   ├── AgentPicker.jsx
│   │   │   ├── ScreenBlock.jsx      # Screen Agent 截图+标注+操作计划渲染
│   │   │   └── ScreenAgentPanel.jsx # Screen Agent 控制面板
│   │   ├── settings/         # 设置页
│   │   │   ├── SettingsPage.jsx
│   │   │   ├── ProfilesPage.jsx   # 接入点管理
│   │   │   ├── AppearancePage.jsx  # 17 套主题
│   │   │   ├── MemoryPage.jsx     # 长期记忆管理
│   │   │   ├── NexusSettingsPage.jsx # 网络与协作设置
│   │   │   └── UsagePage.jsx       # 用量 + 预算预警
│   │   ├── nexus/            # Agent 间对话（Project Nexus）
│   │   │   ├── NexusPage.jsx        # 双栏界面（左侧对话列表 + 右侧发现/对话视图，无联系人）
│   │   │   ├── A2AConversationView.jsx # Agent 对话观察视图
│   │   │   ├── A2AMessageBubble.jsx    # 专用消息气泡
│   │   │   └── StartA2AModal.jsx       # 发起对话弹窗（直接从 peer 发起）
│   │   ├── LoginPage.jsx           # SSO 登录页（微信/QQ/Google/钉钉/抖音 + 游客）
│   │   ├── AgentFactoryPage.jsx    # 智能体工厂 + 模板市场 + 人格蒸馏入口
│   │   ├── agents/DistillAgentModal.jsx  # dot-skill 蒸馏向导
│   │   ├── ui/AgentAvatar.jsx      # emoji / 图片头像统一组件
│   │   ├── WorkflowPage.jsx        # 可视化工作流编排（拖拽节点式编辑器）
│   │   ├── SkillsPage.jsx
│   │   ├── KnowledgePage.jsx
│   │   ├── MCPPage.jsx
│   │   ├── IMConnectorPage.jsx
│   │   └── ScheduledTasksPage.jsx  # 定时任务管理
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── signaling-server/         # 广域网信令服务器（独立部署到 github.com/OdysseyFather/lingxi-singaling-server）
│   └── main.go               # WebSocket 信令（注册/发现/消息中继，无 HMAC，支持 conversation_invite/accept/reject）
│
├── community-server/         # 灵犀社区平台（独立服务，端口 8090）
│   ├── main.go               # Gin HTTP 服务 + 路由
│   ├── config/               # 配置（端口/DB/Storage/Tunnel 全可环境变量）
│   ├── db/                   # SQLite 数据层（users/agents/ratings/follows/comments/invocations/logs）
│   ├── handler/              # HTTP handler（auth/agent/rating/comment/invocation 全部）
│   ├── model/                # 数据模型
│   ├── storage/              # 本地磁盘 Bundle 存储
│   ├── go.mod                # 独立 module（gin + sqlite3 + uuid）
│   └── README.md             # 社区平台文档
│
├── web-server/               # Web 版部署网关（独立反向代理，零改动现有代码）
│   ├── main.go               # Go 反向代理网关（密码认证 + CORS + 子进程管理）
│   ├── go.mod                # 独立 Go module
│   ├── static/login.html     # Web 登录页（独立 HTML）
│   ├── Dockerfile            # 多阶段 Docker 构建
│   ├── docker-compose.yml    # 一键部署配置
│   └── README.md             # Web 部署文档
│
├── electron/                 # Electron 主进程
│   ├── main.js               # 窗口管理、子进程启动
│   ├── preload.js            # IPC Bridge（含 Spotlight/剪贴板 API）
│   ├── spotlight.js           # Spotlight 悬浮窗管理（BrowserWindow）
│   ├── spotlight.html         # Spotlight UI（极简浮窗）
│   ├── context-sensor.js      # 上下文传感器（活跃窗口 + 浏览器 URL）
│   ├── clipboard-monitor.js   # 剪贴板智能监控（内容分类 + 建议推送）
│   ├── screen-controller.js   # Screen Agent 桌面操控引擎（截屏/鼠标/键盘/速率限制）
│   ├── splash.html           # 冷启动 Splash 页（后端就绪前显示）
│   ├── package.json          # electron-builder 配置
│   ├── assets/               # 图标、entitlements
│   └── resources/            # 构建时填充的运行时资源
│       ├── ai-engine/        #  灵犀agent引擎
│       ├── bridge/           # llm-bridge (JS, 旧版回退)
│       ├── litellm-bridge/   # [已移除] 已被 backend-desktop/proxy/ 纯 Go 代理替代
│       ├── node-bin/         # 内嵌 Node.js
│       └── whisper/          # whisper.cpp 离线 ASR (whisper-cli + ggml-base.bin)
│
├── ai-config/                # AI 引擎配置模板
├── build-desktop.sh          # 一键构建脚本
├── CLAUDE.md                 # 本文件
├── README.md                 # 用户文档
└── README-EN.md              # 英文文档
```

---

## 核心开发流程

### 开发模式

```bash
# 终端 1: 前端（热更新）
cd frontend-desktop && npm install && npm run dev

# 终端 2: Go 后端
cd backend-desktop && go run .

# 终端 3: Electron
cd electron && npm install && npm start
```

### 打包 & 发版

```bash
# 0. 确保 Node.js 版本足够（Vite 8 要求 ≥20.19 或 ≥22.12）
# 若系统 Node < 20.19，需提前准备 Node 22：
#   mkdir -p /tmp/node22 && cd /tmp/node22
#   curl -fsSL https://nodejs.org/dist/v22.15.0/node-v22.15.0-darwin-arm64.tar.gz | tar -xzf - --strip-components=1
# build-desktop.sh 会自动检测并使用 /tmp/node22/bin/node

# 1. 一键构建（支持 mac / win / all，默认 all）
./build-desktop.sh          # 默认同时构建 macOS + Windows
./build-desktop.sh mac      # 仅 macOS arm64
./build-desktop.sh win      # 仅 Windows x64（交叉编译）
```

构建产物在 `dist-electron/` 目录，手动分发安装包。

**构建产物：**
```
dist-electron/
├── mac-arm64/灵犀.app              # 直接运行
├── 灵犀-{version}-arm64.dmg        # 安装包
├── 灵犀 Setup {version}.exe        # Windows 安装包
└── 灵犀 {version}.exe              # Windows 便携版
```

---

## 开发约定

### 必须遵守

1. **不允许开启子代理** — 所有开发任务在当前会话中直接完成
2. **每次开发完成后必须执行以下全部步骤（强制，不可跳过）：**
   1. 更新 `.cursor/rules/lingxi-agent.mdc`（如有架构/规范变更）
   2. 更新 `CLAUDE.md`（如有新模块/技术栈/流程变更）
   3. 更新 `README.md`（如有用户可见的新功能/快捷键/配置）
   4. **打包编译：`export PATH="/tmp/node22/bin:$PATH" && ./build-desktop.sh`**
   5. **安装验证：打开 `dist-electron/mac-arm64/灵犀.app` 确认新功能可用**
   ⚠️ 任何代码变更（无论大小）完成后都必须执行打包→安装，确保交付物始终可用。
3. **信令服务器变更必须推送** — 凡对 `signaling-server/` 有代码变更，必须 push 到 `https://github.com/OdysseyFather/lingxi-singaling-server`（Render 自动部署）
4. **前端样式只用 Tailwind CSS + CSS 变量**，不写独立 CSS 文件
5. **组件必须使用 primitives.jsx 中的原子组件**（Button/Card/Modal 等）
6. **图标只用 lucide-react**
7. **状态管理只用 Zustand**（`useStore`）
8. **className 合并使用 `cn()` 函数**

### 编码风格

- 前端：函数组件 + Hooks，不使用 class 组件
- 后端：标准 Go 风格，handler 函数签名统一 `func XxxHandler(c *gin.Context)`
- 注释语言：中文
- 变量/函数命名：英文

### CSS 变量命名

```
--bg           背景
--bg-soft      次级背景
--bg-elev      悬浮/卡片背景
--text          主文字
--text-soft     次级文字
--text-faint    最淡文字
--accent        主题强调色
--accent-soft   强调色淡底
--accent-glow   强调色发光
--line          分割线
--ring          聚焦边框
```

### API 路由一览

| Method | Path | Handler | 说明 |
|--------|------|---------|------|
| GET | /api/sessions | ListSessions | 会话列表（支持 agent_id 筛选，按 pinned DESC 排序） |
| POST | /api/sessions | CreateSession | 创建会话 |
| PATCH | /api/sessions/:id | UpdateSession | 更新会话（title/pinned/folder） |
| DELETE | /api/sessions/:id | DeleteSession | 删除会话 |
| POST | /api/sessions/batch-delete | BatchDeleteSessions | 批量删除会话 |
| GET | /api/sessions/:id/messages | ListMessages | 消息列表 |
| GET | /api/sessions/:id/pending | GetPendingTask | 查询挂起任务 |
| DELETE | /api/sessions/:id/pending | ClearPendingTask | 清除挂起任务 |
| POST | /api/sessions/:id/agent | SetSessionAgent | 设置会话智能体 |
| GET | /api/messages/search | SearchMessages | 消息全文搜索 |
| PUT | /api/messages/:id | UpdateMessage | 编辑用户消息（+删除后续） |
| POST | /api/messages/:id/feedback | SetMessageFeedback | 消息反馈（up/down） |
| POST | /api/messages/:id/pin | ToggleMessagePin | 固定/取消固定消息 |
| POST | /api/chat | Chat | 发起对话 |
| POST | /api/chat/batch | BatchChat | 批量对话 |
| POST | /api/chat/abort | AbortChat | 中止正在进行的对话 |
| GET | /ws | WebSocket | 流式对话 |
| GET | /api/tasks | ListTasks | 后台任务列表 |
| DELETE | /api/tasks/:id | DeleteTask | 删除后台任务 |
| GET/POST/DELETE | /api/agents/* | Agent CRUD | 智能体管理 |
| GET/POST/DELETE | /api/knowledge/* | Knowledge CRUD | 知识库管理 |
| GET | /api/knowledge/:id/preview | PreviewKnowledge | 知识库预览 |
| POST | /api/knowledge/reindex | ReindexKnowledge | 全量重建向量索引 |
| GET | /api/knowledge/index-status | GetIndexStatus | 索引状态（文档数/分块数/进度） |
| GET | /api/knowledge/search | SemanticSearch | 语义搜索（混合检索） |
| GET | /api/knowledge/watched-dirs | ListWatchedDirs | 监控目录列表 |
| POST | /api/knowledge/watched-dirs | AddWatchedDir | 添加监控目录 |
| DELETE | /api/knowledge/watched-dirs/:id | RemoveWatchedDir | 删除监控目录 |
| GET | /api/knowledge/embedding-config | GetEmbeddingConfig | 嵌入模型配置 |
| PUT | /api/knowledge/embedding-config | SetEmbeddingConfig | 更新嵌入配置 |
| POST | /api/chat/quick | QuickChat | Spotlight 快捷对话 |
| GET/POST/DELETE | /api/api-profiles/* | Profile CRUD | 接入点管理 |
| POST | /api/api-profiles/:id/activate | ActivateAPIProfile | 激活接入点 |
| POST | /api/api-profiles/:id/test | TestAPIProfile | 测试连通性 |
| POST | /api/api-profiles/fetch-models | FetchModels | 自动获取供应商可用模型列表 |
| GET | /api/skills | ListSkills | 技能列表 |
| POST | /api/skills/upload | UploadSkill | 上传技能 |
| POST | /api/skills/batch-upload | BatchUploadSkill | 批量上传技能 |
| POST | /api/skills/generate/stream | GenerateSkillStream | AI 流式生成技能 |
| POST | /api/skills/generate/confirm | ConfirmGeneratedSkill | 确认生成的技能 |
| GET | /api/skills/:id/content | GetSkillContent | 技能文件内容 |
| PUT | /api/skills/:id/content | UpdateSkillContent | 更新技能文件 |
| GET | /api/skills/:id/export | ExportSkill | 导出技能 ZIP |
| POST | /api/skills/:id/install | InstallSkill | 安装技能 |
| POST | /api/skills/:id/uninstall | UninstallSkill | 卸载技能 |
| DELETE | /api/skills/:id | DeleteSkill | 删除技能 |
| GET | /api/skills/marketplace | MarketplaceSearch | Smithery 市场搜索 |
| GET | /api/skills/marketplace/categories | MarketplaceCategories | 市场分类 |
| GET | /api/skills/marketplace/:ns/:slug | MarketplaceGetSkill | 市场技能详情 |
| POST | /api/skills/marketplace/install | MarketplaceInstall | 安装市场技能 |
| GET/POST/PUT/DELETE | /api/mcp/* | MCP CRUD | MCP 管理 |
| POST | /api/mcp/:id/toggle | ToggleMCPServer | 启用/禁用 MCP |
| GET | /api/mcp/export | ExportMCPConfig | 导出 MCP 配置 |
| GET/POST/PUT/DELETE | /api/im-connectors/* | IM CRUD | IM 连接器管理 |
| GET | /api/feishu-monitor/rules | ListMonitorRules | 飞书监听规则列表 |
| POST | /api/feishu-monitor/rules | CreateMonitorRule | 创建监听规则 |
| PUT | /api/feishu-monitor/rules/:id | UpdateMonitorRule | 更新监听规则 |
| DELETE | /api/feishu-monitor/rules/:id | DeleteMonitorRule | 删除监听规则 |
| PUT | /api/feishu-monitor/rules/:id/toggle | ToggleMonitorRule | 启用/禁用监听规则 |
| GET | /api/feishu-monitor/logs | ListMonitorLogs | 飞书监听日志列表 |
| GET | /api/feishu-monitor/chats | ListFeishuChats | 获取机器人所在的群列表 |
| GET | /api/providers | ListProviders | 供应商列表 |
| GET | /api/usage | GetUsage | 用量查询 |
| GET | /api/usage/quota | GetUsageQuota | 额度查询 |
| GET | /api/router/status | GetRouterStatus | 路由状态 |
| POST | /api/router/stop | StopRouter | 停止路由 |
| GET | /api/scheduled-tasks | ListScheduledTasks | 定时任务列表 |
| POST | /api/scheduled-tasks | CreateScheduledTask | 创建定时任务 |
| PUT | /api/scheduled-tasks/:id | UpdateScheduledTask | 更新定时任务 |
| DELETE | /api/scheduled-tasks/:id | DeleteScheduledTask | 删除定时任务 |
| POST | /api/scheduled-tasks/:id/toggle | ToggleScheduledTask | 启用/禁用 |
| POST | /api/scheduled-tasks/:id/run | TriggerScheduledTask | 手动触发 |
| GET | /api/scheduled-tasks/:id/runs | ListScheduledTaskRuns | 执行记录 |
| GET | /api/memories | ListMemories | 长期记忆列表 |
| POST | /api/memories | CreateMemory | 添加记忆 |
| DELETE | /api/memories/:id | DeleteMemory | 删除记忆 |
| DELETE | /api/memories/clear | ClearMemories | 清空记忆 |
| POST | /api/transcribe | TranscribeAudio | 语音识别（本地 whisper.cpp 优先，回退远端 API） |
| POST | /api/runtime/active-secret | SetActiveSecret | 运行时密钥注入 |
| GET | /api/nexus/info | NexusInfo | 本实例公开信息 |
| POST | /api/nexus/conversation/invite | NexusReceiveConvInvite | 接收对话邀请 |
| POST | /api/nexus/conversation/accept | NexusReceiveConvAccept | 接收对话接受通知 |
| POST | /api/nexus/conversation/reject | NexusReceiveConvReject | 接收对话拒绝通知 |
| POST | /api/nexus/conversation/message | NexusReceiveMessage | 接收 A2A 对话消息 |
| POST | /api/nexus/conversation/pause | NexusReceivePause | 接收暂停通知 |
| POST | /api/nexus/conversation/terminate | NexusReceiveTerminate | 接收终止通知 |
| POST | /api/nexus/conversation/stream-token | NexusReceiveStreamToken | 接收远端流式 token 转发 |
| GET | /api/nexus/settings | GetNexusSettings | 网络协作设置 |
| PUT | /api/nexus/settings | UpdateNexusSettings | 更新协作设置 |
| GET | /api/peers | ListPeers | 已发现的局域网实例 |
| GET | /api/wan/peers | ListWANPeers | 广域网远程节点列表 |
| GET | /api/wan/status | WANStatus | 广域网连接状态 |
| GET | /api/a2a-conversations | ListA2AConversations | Agent 对话列表 |
| POST | /api/a2a-conversations | CreateA2AConversation | 发起 Agent 对话（直接从 peer 发起） |
| GET | /api/a2a-conversations/:id | GetA2AConversation | 对话详情+消息 |
| POST | /api/a2a-conversations/:id/pause | PauseA2AConversation | 暂停对话 |
| POST | /api/a2a-conversations/:id/takeover | TakeoverA2AConversation | 人类接管 |
| POST | /api/a2a-conversations/:id/terminate | TerminateA2AConversation | 终止对话 |
| POST | /api/a2a-conversations/:id/approve | ApproveA2AConversation | 审批结果 |
| POST | /api/a2a-conversations/:id/accept-remote | AcceptRemoteConversation | 接受远端对话（含创建会话+生成 UUID） |
| POST | /api/a2a-conversations/:id/reject-remote | RejectRemoteConversation | 拒绝远端对话 |
| GET | /api/agents/:id/nexus-config | GetAgentNexusConfig | Agent 对外设置 |
| PUT | /api/agents/:id/nexus-config | UpsertAgentNexusConfig | 更新对外设置 |
| GET | /api/agents/:id/evolution | GetEvolutionConfig | 获取进化设置 |
| PUT | /api/agents/:id/evolution | SetEvolutionConfig | 设置进化开关 |
| GET | /api/agents/:id/evolution/logs | ListEvolutionLogs | 进化日志列表 |
| DELETE | /api/agents/:id/evolution/logs | ClearEvolutionLogs | 清空进化日志 |
| POST | /api/agents/:id/evolution/extract | ManualExtract | 手动提取知识 |
| DELETE | /api/evolution/logs/:id | DeleteEvolutionLog | 删除单条进化日志 |
| POST | /api/evolution/logs/:id/revert | RevertEvolutionLog | 撤销单条进化（恢复记忆/知识/技能） |
| GET | /api/health | HealthCheck | 结构化健康检查 |
| GET | /api/backup/export | ExportBackup | 导出数据库备份 |
| POST | /api/skills/batch-export | BatchExportSkills | 批量导出技能 ZIP |
| POST | /api/screen-agent/analyze | ScreenAgentAnalyze | 截屏 + 多模态模型分析屏幕 |
| POST | /api/screen-agent/plan | ScreenAgentPlan | 截屏 + 生成操作计划 |
| POST | /api/screen-agent/step | ScreenAgentExecuteStep | 执行单步操作 |
| POST | /api/screen-agent/step-result | ScreenAgentStepResult | 回报操作执行结果 |
| POST | /api/screen-agent/execute-plan | ScreenAgentExecutePlan | 执行完整操作计划（OTA 循环） |
| POST | /api/screen-agent/confirm | ScreenAgentConfirmStep | 用户确认/拒绝操作步骤 |
| POST | /api/screen-agent/abort | ScreenAgentAbort | 中止 Screen Agent |
| POST | /api/screen-agent/reset | ScreenAgentReset | 重置中止状态 |
| GET | /api/screen-agent/actions | ListScreenActions | Screen Agent 操作日志 |
| GET | /api/agents/:id/screen-config | GetAgentScreenConfig | Agent 屏幕操控设置 |
| PUT | /api/agents/:id/screen-config | SetAgentScreenConfig | 更新屏幕操控设置 |

---

## 数据存储

- **SQLite 数据库**: `~/Library/Application Support/灵犀/smart-agent.db`
- **知识库文件**: `~/Library/Application Support/灵犀/knowledge/`（按 docs/qa/data 分类）
- **上传图片**: `~/Library/Application Support/灵犀/uploads/`
- **AI 引擎 HOME**: `~/Library/Application Support/灵犀/ai-home/`
- **Bridge 数据**: `~/Library/Application Support/灵犀/bridge-home/`

---

## 本地多实例测试（Agent Nexus）

测试 Agent 间对话需要两个完全独立的灵犀实例（不同端口、不同数据库、不同 instance ID）。

### 一键脚本

```bash
./scripts/start-test-instances.sh   # 启动两个实例
./scripts/stop-test-instances.sh    # 关闭所有实例
```

### 实例说明

| 实例 | 端口 | 数据库 | 访问方式 |
|------|------|--------|----------|
| 实例1（安装版） | 3001 | `~/Library/Application Support/lingxi-agent/smart-agent.db` | 灵犀桌面 App |
| 实例2（开发版） | 3099 | `/tmp/lingxi-instance2/smart-agent.db` | 浏览器 `http://localhost:3099` |

实例2首次使用需在设置中配置模型接入点。两个实例通过广域网信令自动发现对方。

### 手动启动

```bash
mkdir -p /tmp/lingxi-instance2
cd backend-desktop
PORT=3099 DB_PATH=/tmp/lingxi-instance2/smart-agent.db FRONTEND_DIST=../frontend-desktop/dist go run .
```

---

## 常见问题排查

### Vite 构建报 Node 版本错误
Vite 8 需要 Node.js ≥ 20.19。解决：下载 Node 22 并设置 PATH。

### npm EACCES 权限错误
使用临时缓存目录：`NPM_CONFIG_CACHE=/tmp/npm-lingxi-cache npm install ...`

### macOS 提示应用无法验证
```bash
xattr -cr "/Applications/灵犀.app"
```

### Go 编译失败
确保 Go ≥ 1.24，执行 `go mod tidy` 后重试。

---

## 已实现的功能（最新）

### 对话体验
- 流式输出 + 思考过程折叠
- 代码块语法高亮 + 复制按钮
- 消息一键复制
- Cmd+K 全文消息搜索
- 对话导出为 Markdown
- / 斜杠命令快捷输入（12 个内置命令）
- 虚拟滚动（100+ 条消息自动启用）
- **统一 Agent 模式（自主执行）**
- **交互式信息收集块（选择块 + 输入块），Agent 按需向用户提问**
- **用户 & 智能体头像显示**
- **图片粘贴（Cmd+V）+ 聊天中图片展示**
- **OpenAI 兼容模型思考链（reasoning）展示**
- **消息编辑/重发（hover 编辑按钮 → textarea 内联编辑 → 保存并重发，自动截断后续消息）**
- **消息反馈（thumbs up/down，持久化到 SQLite，选中状态高亮）**
- **知识库 RAG 引用可视化（内联 [N] 上角标 + hover 弹出引用详情 + 气泡底部引用列表折叠卡片）**
- **语音输入（MediaRecorder 录音 + 本地 whisper.cpp 离线识别，回退远端 API → 文字填入输入框）**
- **TTS 朗读（Web Speech API，AssistantBubble 朗读按钮，支持中/英文）**
- **文件拖拽对话（拖入 .md/.py/.go/.json 等文本文件，内容作为消息附件发送）**
- **快捷截屏（Cmd+Shift+S 全局快捷键 + 按钮截屏，截图自动填入输入框）**
- **消息固定（Pin 重要消息，用户和助理消息均支持）**
- **快捷回复建议（Claude CLI `--prompt-suggestions` AI 预测下一轮提问，回退本地正则兜底，assistant 回复后显示 2-3 个推荐后续问题胶囊按钮）**
- **对话中止按钮（abort 正在进行的 AI 回复）**
- **对话批量发送（batch chat）**

### 智能体
- 智能体工厂（创建/编辑/删除）
- **自定义头像**（`POST /api/agents/upload-avatar`，`agents.avatar` 支持 `/api/uploads/` URL）
- **人格蒸馏**（集成 [dot-skill](https://github.com/titanwings/colleague-skill)：`GET /api/agents/distill/status`、`POST /api/agents/distill/stream`、`POST /api/agents/distill/apply`、`POST /api/skills/install-github`；前端 `DistillAgentModal.jsx`）
- **五步引导式创建向导（身份/角色/能力/对外设置/预览）**
- **支持 temperature、max_tokens 参数调整**
- **支持 post_actions 后续动作（工作流链式执行数据模型）**
- **Agent 对外设置（公开/能力标签/授权级别/禁止透露信息/知识库限定）**
- **自我进化引擎（负面反馈/用户纠正/有价值对话/手动触发 → LLM 分析 → 自动写入记忆/知识库，含实时进度广播/撤销/进化日志审计）**
- 模板市场（4 类 17 个模板：商业办公/技术开发/内容创意/生活效率）
- 智能体绑定模型/技能/MCP/知识库

### 工作流
- **可视化工作流编排（WorkflowPage：拖拽节点式编辑器）**
- **6 种节点类型：提示词/条件分支/循环/延迟/代码/输出**
- **节点间连线 + 执行预览**

### 技能管理
- **Smithery.ai 技能市场集成（搜索/分类/详情/安装）**
- **在线查看/编辑技能文件（SKILL.md + 脚本）**
- **技能导出为 ZIP 包（含 manifest.json 元数据）**
- **技能批量上传 + 批量导出（多个技能打包为单个 ZIP）**
- AI 生成技能 / ZIP 上传导入

### 知识库 + 深度 RAG
- 支持 .md/.txt/.csv/.tsv/.json/.pdf/.docx 格式
- 分类管理（文档/问答/数据）
- 拖拽批量上传
- 内容预览
- **本地向量索引引擎（纯 Go cosine similarity，768 维嵌入，独立 vectors.db）**
- **文本递归分块（512 字符/块，128 重叠，按段落/句子/字符边界分割）**
- **嵌入模型接口（API 模式，调用 OpenAI 兼容 /embeddings 端点）**
- **混合检索（向量 KNN + 关键词 BM25 + RRF 融合排序）**
- **对话时自动向量检索注入知识库上下文（优先向量，回退关键词）**
- **语义搜索 UI（知识库页面新增语义搜索面板）**
- **索引状态面板（已索引文档数/分块数/进度条/最后更新时间）**
- **文件夹监控（fsnotify 自动检测变化 + 增量索引 + 监控目录管理 UI）**
- **嵌入模型配置 UI（API 地址 + 模型名称）**

### 屏幕感知主动助手 + Screen Agent
- **Spotlight 悬浮窗（Cmd+Shift+Space 全局唤出，alwaysOnTop 独立窗口）**
- **上下文传感器（AppleScript/Win32 获取活跃窗口 + 浏览器 URL）**
- **Quick Actions（基于上下文动态快捷操作：IDE → 解释代码/生成测试；浏览器 → 总结/翻译）**
- **快捷对话（POST /api/chat/quick，带上下文元数据 + 知识库检索）**
- **剪贴板智能监控（2 秒轮询 + 内容分类：代码/报错/URL/英文长文/命令）**
- **剪贴板建议气泡（右下角非侵入式通知，6 秒自动消失，点击发送到对话）**
- **Screen Agent 截屏理解（Agent 主动截屏 + 多模态模型分析屏幕内容）**
- **Screen Agent 操作规划（Agent 根据截图生成操作步骤列表，支持风险评估）**
- **Screen Agent 桌面操控（AppleScript 实现鼠标点击/键盘输入/滚动/打开应用）**
- **Screen Agent OTA 循环（Observe-Think-Act 逐步执行 + 每步人类确认）**
- **Screen Agent 安全机制（危险操作黑名单强制确认/速率限制/紧急中止 ⌘⇧Esc）**
- **Screen Agent 操作审计（screen_actions 表记录所有操作日志）**

### UI/UX
- 17 套主题（light/dark/midnight/cyber/aurora/cosmos/ocean/sunset/forest/rose/sand/lavender/mocha/nord/sakura/neon/mint）
- AnimatePresence 页面切换动画
- **顶部导航栏（主导航 5 项 + 辅助导航 5 项，layoutId 动画指示器）**
- 会话重命名（双击编辑）+ **会话置顶**
- **会话批量删除**
- Modal 化删除确认
- **费用估算（非官方 API 本地定价表兜底，标注"~"估算标记）**
- 用量统计 + 预算预警
- **交互式向导流（Wizard Flow）：多选择题逐一展示，支持前后翻页、进度指示、汇总确认后才继续对话**
- **两阶段规划模式：用户决定是否进入规划模式，进入后沉浸式多维度选择面板，全部确认后再执行**
- **精致化 UI 细节：气泡圆角/阴影/hover 微交互、超薄滚动条、三点波浪连接动画、增强版空状态页**
- **快捷键面板（Cmd+/ 唤出）**

### 定时任务
- **周期性自动执行 Agent 任务（每 N 分钟/小时/每天/每周/每月/自定义 Cron）**
- **有状态/无状态模式（有状态保持同一会话，Agent 可记忆上次执行内容）**
- **执行完成桌面通知**
- **执行记录查看 + 跳转到对应会话**
- **手动触发执行**

### 长期记忆与上下文
- **跨会话长期记忆（memories 表，按智能体隔离，自动/手动添加，分类管理）**
- **记忆管理 UI（设置 > 长期记忆：查看/添加/删除/分类/清空）**
- **对话摘要数据模型（sessions.summary 字段，为后续自动摘要压缩做准备）**
- **会话文件夹数据模型（sessions.folder 字段）**
- **会话置顶（sessions.pinned 字段，置顶会话排序优先）**

### 用户登录（SSO）
- **首次启动登录页（微信/QQ/Google/钉钉/抖音 SSO + 游客登录）**
- **Electron Loopback OAuth（临时 HTTP Server + 系统浏览器跳转，无需公网回调）**
- **用户身份持久化（users 表，支持多供应商 + 游客模式）**
- **OAuth 配置管理（oauth_configs 表，App ID/Secret 存储）**

### Agent 间对话（Project Nexus）
- **局域网 mDNS 自动发现（_lingxi._tcp 服务广播 + 10 秒扫描周期）**
- **无需建联/无 Token 认证（直接从发现的 peer 发起对话邀请，极简架构）**
- **对话邀请流程（conversation_invite → accept/reject → 生成共享 conv_uuid）**
- **一对一 Agent 自然对话（第一人称表达，不客套寒暄，可使用技能和知识库）**
- **流式实时对话（每端映射独立会话，token 级流式 WS 推送，主聊天同款 UI）**
- **双向流式对话（跨实例 stream-token 转发，双方均可实时看到对方 Agent 思考和输出过程）**
- **持久会话（a2a_conversations.local_session_id + conv_uuid 关联，跨轮次保持对话上下文）**
- **统一 Bubble 渲染（A2AAgentBubble 组件 + BlocksRenderer，完整 Markdown/代码高亮/思考块/工具块）**
- **己方/对方 Agent 视觉区分（不同颜色头像+标签+边框，紫色=对方，主题色=己方）**
- **实时观察模式 UI（发起方和接收方均可看到 Agent 流式输出）**
- **智能滚动（stick-to-bottom 逻辑：用户上滚后不强制拉回，新消息时自动回底部）**
- **人类介入（暂停/接管/终止）**
- **接收方完整邀请流程（显示主题/目标/对方Agent，选择己方Agent，接受/拒绝）**
- **Agent 对外设置（公开开关/能力标签/授权级别/禁止透露信息）**
- **双栏通信界面 NexusPage（左侧 280px 对话列表，右侧发现面板/对话视图/空状态引导）**
- **网络与协作全局设置（对外可见/昵称/端口）**
- **Transport 抽象层（LANTransport HTTP 直连 + WANTransport 信令中继，Send 无 token 参数）**
- **WebSocket 信令服务器（用户注册/发现/消息中继，无 HMAC，WSS/TLS 可选）**
- **发现面板（合并 LAN + WAN 节点统一列表，直接"发起对话"按钮）**
- **广域网开箱即用（默认连接 wss://lingxi-singaling-server.onrender.com/ws，无需手动配置）**
- **增强错误可见性（delivery_failed 详情、对话内 error 消息、前端实时展示连接问题）**
- **A2A 对话持久化（离开页面后重新进入自动恢复，定时轮询补充缺失消息）**
- **A2A 对话自动结束（[CLOSE] 标记检测 → 自动 terminate + 通知对方，避免无限寒暄循环）**
- **A2A 严格轮次对话（stream_done 同步发送 + 500ms 缓冲延迟 + 前端兜底清除远端流式状态，确保一来一回不抢话）**

### 平台能力
- 多模型多供应商接入
- **纯 Go 协议转换代理**（`backend-desktop/proxy/`：Anthropic /v1/messages ↔ OpenAI /v1/chat/completions，支持流式/非流式/Tool use/思考链/多模态，零启动延迟、零外部依赖）
- **Go 代理预启动**（激活 OpenAI 协议接入点时自动预启动代理，< 1ms 就绪）
- **自动获取可用模型列表**（POST /api/api-profiles/fetch-models，输入 API key 后自动查询供应商 /models 端点，返回可用模型列表供用户选择）
- **供应商预设配置**（内置 DeepSeek/Qwen/GLM/Moonshot/Doubao 等供应商的 base_url 和推荐模型列表，减少用户手动配置错误）
- MCP 工具管理（stdio/SSE/HTTP）+ 配置导出
- IM 集成（企业微信/钉钉/飞书，支持 @所有人 消息过滤配置）
- **飞书监听模式**（群内所有消息接收 + 规则过滤 + 四种动作类型 + 自定义提示词 + 审计日志）
- **飞书图片多模态解析**（`extractFeishuImageKeys` 提取 image_key → `downloadFeishuImage` 下载 base64 → `IMMessage.Images` 透传 → dispatcher 落盘 → `RunClaude*` 切换 stream-json 多模态输入。@机器人 / 监听模式均生效）
- **Windows 构建支持（NSIS 安装包 + Portable）**
- **OpenAI 兼容模型技能识别增强（自动注入已安装技能清单到 system prompt）**
- **防死循环保护（禁止调用 Cursor 专有工具，避免 tool_use 循环）**
- **冷启动优化（Splash 页面立即显示，后端就绪后无缝切换）**
- **本地离线语音识别（内置 whisper.cpp + ggml-base 模型，无需网络）**
- **定时任务调度修复（Go 侧时间比较，15 秒检查间隔，时区兼容）**
- **后台任务管理（GET /api/tasks、DELETE /api/tasks/:id）**
- **挂起任务机制（Agent 向用户请求信息时挂起，前端提交后继续）**

### 工程化改进
- **结构化日志（log/slog JSON 格式，LOG_LEVEL 环境变量配置）**
- **安全加固（WebSocket Origin 校验 + CORS + Body Size 限制 + Rate Limiter）**
- **优雅关闭（os.Signal 捕获 + context.WithTimeout）**
- **API 缓存（TTL 30s，ListProviders/ListAgents/ListSkills，变更自动失效）**
- **SQLite 连接池（SetMaxOpenConns(4) + WAL 并发读）**
- **数据库备份（每日 VACUUM INTO + 7 天自动清理 + /api/backup/export）**
- **结构化健康检查（/api/health：db/goroutines/mem/uptime）**
- **数据库迁移版本化（schema_version 表 + 编号迁移系统）**
- **db 模块化拆分（session/knowledge/provider/usage/scheduled/auth/evolution）**
- **前端 Zustand 切片化（auth/ui/session/chat/nexus 独立切片）**
- **React.lazy 懒加载（非默认页按需加载）**
- **Modal 焦点陷阱 + ARIA 无障碍**
- **WS 流式 token 50ms 缓冲刷新（减少 React 重渲染）**

### 灵犀 4 大功能改造（2026-05）
- **定时任务时区 BUG 修复**：fmtTimeForSQLite 改为 UTC 写入 + scan 时统一 Local() 化，避免 next_run_at 永远在未来而永不触发
- **定时任务启动自检 + 实时交互**：启动时补齐缺失 next_run_at；scheduled_task_started/done WS 事件 + ScheduledTasksPage 实时运行中徽章 + AppShell 顶部小红点
- **会话级自动进化**：每轮对话结束时检测「消息数 ≥ 6 且距上次进化 > 30 分钟」自动 TryAutoEvolution
- **全局进化扫描器**（`backend-desktop/evolution/scanner.go`）：每 6 小时巡检所有启用进化的 Agent + 安静时段 + 冷却控制 + 前端可视化配置
- **聊天富 Markdown 渲染**：MermaidBlock（mermaid v11 ESM 懒加载 + SVG 渲染 + 源码切换 + 放大）+ PlantUMLBlock（pako encode → kroki.io SVG）
- **System prompt 强化输出格式**：必用 Markdown 元素（标题/列表/表格/代码围栏）+ 主动 Mermaid 图表（流程/时序/架构/状态机/甘特/类图）+ 复杂 UML 用 PlantUML
- **Agent 群聊（Group Chat）完整实现**：
  - 数据模型：group_chats / group_members / group_messages
  - Nexus 协议：/group/invite、/group/join_ack、/group/message、/group/leave、/group/stream_token、/group/recall
  - 调度：@提及 + LLM 主持人决策 + 轮询 + 混合（hybrid 默认）
  - 跨实例广播：群主作为消息中转，向所有远端成员转发
  - HTTP API：CRUD + accept/reject/leave/terminate/post
  - UI：NexusPage tab 切换、GroupChatView 成员列表+流式气泡+@提及 picker、CreateGroupModal、群邀请卡片
- **信令服务器 relay_multi 多播**：SignalMessage 新增 to_list 字段，群聊广播 O(N) 往返降为 O(1)

### 微信风群聊重做（v2026-05 Phase 1）
- **WeChat 风 UI**：GroupChatView 拆分为 GroupHeader（话题 + 9 头像堆叠 + 菜单）/ GroupMessageList（带合并气泡 / 时间戳胶囊 / 下拉加载更早 / 新消息蓝色 Pill）/ GroupMessageBubble（绿色自己 #95ec69 + 白色他人 + 引用卡 + 撤回标记 + 长按菜单 + 图片网格）/ GroupComposer（+菜单 / Emoji picker / @ picker / 引用预览 / 图片上传）/ GroupMemberDrawer（双击 @）
- **引用 / 撤回 / 时间戳**：消息间隔 ≥3min 才显示时间戳；自己消息 2 分钟内可撤回；引用块灰底左竖线；撤回后跨实例同步（/group/recall）
- **Agent 群聊人格表 `agent_personalities`**：tags / interests / speak_probability / min_delay_ms / max_delay_ms / emoji_freq / quiet_start / quiet_end / typo_rate / echo_rate / ghost_minutes / cold_start_eligible / style_hint
- **行为引擎 `backend-desktop/groupbehavior/`**：
  - `engine.go` PickSpeakers — 每条新消息让所有 joined 本地 Agent **并发独立**评估发言概率（@me 强制 / 兴趣 +30 / 冷场 +40 / 安静时段 ×0.1 / 被怼 +50 / 自己刚说过 ×0.2）
  - 各自延迟（min~max + 抖动；高分加速；@提及 500-1500ms 秒回）后调用 LLM 发言，多 Agent 可"抢话"
  - `quirks.go` 微观人格：MaybeAddTypo / MaybeEcho（"+1"复读）/ MaybeEmpty（0.5% 直接 [SKIP]）/ EmojiSuffix
  - `watcher.go` 冷场守望者：每 60s 巡检 host 本地的活跃群，>5min 无消息 + 4min 冷却内未触发过 → 触发"冷场救场"专属调用
- **Prompt 重做**：buildGroupSystemPrompt（替代 buildA2ASystemPrompt：WeChat 铁律 + 人格 + 标签 + 兴趣 + style_hint）+ buildGroupUserPrompt（成员名单 + 最近 15 条带 id 的消息 + 引用映射）
- **`@reply:<id>` 协议**：Agent 在回复开头写 `@reply:142`，后端解析为 reply_to_id（剥离标记后持久化），UI 自动渲染灰色引用块
- **group_messages 扩展列**：reply_to_id / is_recalled / recalled_at / images / client_msg_id / edited_at（addColumnIfMissing 迁移）
- **新增 API**：
  - GET `/api/group-chats/:id/messages?before=&limit=` — 下拉加载更早
  - POST `/api/group-chats/:id/messages/:msgId/recall` — 用户撤回（≤120s）
  - POST `/api/group-chats/upload` — 群聊图片上传（multipart，10MB 上限）
  - POST `/api/group-chats/:id/members/add` — 群主增员（本端 Agent + 远端 Peer 列表）
  - POST `/api/group-chats/:id/members/remove` — 群主将某 Peer 名下的 Agent（或 invited 占位）移出群
  - GET/PUT `/api/agents/:id/personality` — Agent 群聊人格 CRUD
- **新增 Nexus 端点**：POST `/api/nexus/group/recall` — 跨实例同步撤回；POST `/api/nexus/group/member_sync` — 宿主推送成员全量快照
- **新增 WS 事件**：group_message_recalled / group_agent_typing / **group_members_sync**（刷新成员列表）
- **AgentFactoryPage 角色步骤增加"群聊人格"折叠面板**：ChipInput（标签/兴趣）+ 概率 slider + min/max 延迟 + 安静时段（HH:MM）+ Emoji 频率 + 错别字/复读/被怼冷静 + cold_start 开关 + style_hint Textarea
- **前端 nexusSlice 扩展**：groupTypingAgents / groupDrafts / groupOldestId + loadOlderGroupMessages + applyGroupRecall + applyGroupAgentTyping

### 群聊体验对齐主模式（v2026-06）
- **群聊 Agent 流式思考/工具调用**：`RunGroupAgentTurn` 重写事件处理，群聊 Agent 发言时实时转发 thinking_start/thinking_delta/thinking_done/tool_start/tool_end 事件（之前只推正文 text），前端可实时看到 Agent 的思考过程和工具调用
- **群聊消息保留完整 blocks**：后端不再过滤 thinking/tool blocks，最终消息 JSON 包含完整的思考块和工具调用块，历史消息也能展示
- **前端 GroupLiveStream 流式渲染增强**：移除 thinking/tool 过滤，BlocksRenderer 渲染完整流式过程（思考折叠 + 工具卡片 + 正文）
- **前端 GroupMessageBubble 历史消息增强**：移除 thinking/tool 过滤，历史消息展示完整的思考块和工具调用记录
- **nexusSlice thinking 事件处理**：新增 thinking_start/thinking_delta/thinking_done 三个事件在 groupLiveStreams 中的状态管理
- **NexusPage 响应式侧边栏**：窗口宽度 < 900px 且正在查看群聊时自动隐藏左侧边栏，给消息区域更多空间
- **消息气泡宽度放宽**：max-w 从 78% 增至 85%，长消息/代码块展示更充分
- **1v1 A2A 功能完全移除**：删除所有 Agent-to-Agent 一对一对话相关代码（后端路由/handler/前端组件/状态管理/API），仅保留群聊

### cc-haha Provider 架构优化（v2026-05 Phase 2）
- **新增 Anthropic 直连供应商**：GLM/智谱（`glm_anthropic`，`open.bigmodel.cn/api/anthropic`）、Kimi（`kimi_anthropic`，`api.kimi.com/coding`）、MiniMax（`minimax_anthropic`，`api.minimaxi.com/anthropic`）、Ollama（`ollama_anthropic`，本地 Anthropic 直连）、LM Studio（`lmstudio_anthropic`），均绕过外部协议转换层零 Python 依赖
- **DeepSeek 默认模型更新**：`deepseek-chat` → `deepseek-v4-pro`
- **模型上下文窗口管理**：provider meta 中新增 `context_windows` 映射（如 `{"deepseek-v4-pro":1000000}`），`buildClaudeEnv` 自动设置 `CLAUDE_CODE_MAX_CONTEXT_LENGTH_TOKENS` + `ANTHROPIC_MODEL_CONTEXT_WINDOWS` 环境变量
- **认证策略（auth_strategy）**：支持 `auth_token`（默认）/ `auth_token_empty_api_key`（Ollama/LM Studio 用，ANTHROPIC_API_KEY=""）/ `api_key`（官方），buildClaudeEnv 按策略设置正确的认证头
- **Provider 特定环境变量（default_env）**：从 meta JSON 读取并注入，如 `CC_HAHA_SEND_DISABLED_THINKING`（GLM/Kimi）、`ANTHROPIC_DEFAULT_*_MODEL_SUPPORTED_CAPABILITIES`（DeepSeek 推理能力）
- **两阶段 Provider 测试**：Step 1 直连上游验证 → Step 2 代理管道验证（仅 OpenAI 协议），前端展示分步延迟
- **前端增强**：新供应商图标/色彩/模型列表 + ProfileCard 显示"直连"/"代理"徽章 + 测试结果分步延迟显示

### 定时任务与用量统计增强（v2026-05 Phase 4）
- **定时任务页面重构**：渐变 Hero 卡片头部 + 4 格统计（全部/已启用/运行中/累计执行）+ 任务卡片（智能体头像/倒计时/执行进度条/hover 操作栏）+ 时间线风格执行记录弹窗
- **用量统计增强**：
  - 新增费用趋势折线图（AreaChart 渐变面积 + 日环比变化箭头）
  - 新增按智能体聚合面板（AgentAvatar + 占比进度条 + 百分比）
  - 后端新增 `GroupUsageByAgent` / `GroupUsageCostByDay` DB 函数 + API 返回 `by_agent` / `cost_trend`
  - Token 日柱图与费用趋势并排双列布局
  - 预算预警 UI 紧凑化
- **Screen Agent 浏览器控制入口**：Screen Agent 面板新增"浏览器"模式 tab（Globe 图标），展示 Playwright MCP 就绪状态 + 快捷操作（打开网页/截取/提取内容），通过 Playwright MCP 工具自动化浏览器

### 纯 Go 协议转换代理（v2026-05 Phase 3）
- **替代 LiteLLM Bridge**：用纯 Go 实现的 `backend-desktop/proxy/` 包替代外部 Python LiteLLM 进程
- **零启动延迟**：Go 代理随 HTTP handler 调用即时启动（< 1ms），无需等待 Python 进程 + LiteLLM 加载（30s+）
- **零外部依赖**：不再需要 Python 环境、pip 安装 litellm/yaml、内嵌 bridge.py 脚本
- **完整协议转换**：Anthropic `/v1/messages` → OpenAI `/v1/chat/completions`，支持：
  - 流式（SSE）和非流式响应
  - Tool use（tool_use / tool_result 双向转换）
  - 思考链（reasoning_content → thinking block）
  - 多模态（图片 base64）
  - System prompt（字符串 + content block 两种格式）
  - 上游错误透传（包装为 Anthropic error 格式）
- **DeepSeek 特殊兼容**：自动检测 DeepSeek API URL，启用 reasoning_content 字段回传
- **代码结构**：
  - `proxy/types.go` — Anthropic + OpenAI 类型定义
  - `proxy/transform.go` — 请求转换（messages / system / tools / thinking）
  - `proxy/stream.go` — 流式响应转换（OpenAI SSE → Anthropic SSE）
  - `proxy/nonstream.go` — 非流式响应转换
  - `proxy/server.go` — HTTP 服务器（/v1/messages + /health + /v1/models）
  - `router/ccr.go` — 重写为使用 Go proxy.Server（删除 Python 子进程管理逻辑）

### 灵犀社区平台（v2026-06 Phase 1）
- **独立服务 `community-server/`**：与 signaling-server 解耦的全新 Gin HTTP 服务，端口 8090（可配置）
- **匿名身份系统**：服务器生成 UUID + auth_token，客户端 localStorage 缓存；后续可扩展 OAuth
- **Agent Bundle 格式 `.lxbundle`**：zip 压缩包，含 `manifest.json` + `agent.json` + `avatar.png` + `skills/` + `knowledge/` + `README.md`
- **本地磁盘 Bundle 存储**：`~/Library/Application Support/lingxi-community/storage/bundles/<agentID>/<version>/bundle.lxbundle`，后期可迁 OSS
- **完整 HTTP API**（`/community/*`）：
  - `POST /auth/anon` 匿名注册，返回 token
  - `GET/PUT /auth/me` 个人资料
  - `GET/POST/PUT/DELETE /agents` Agent 发布/列表/详情/更新/删除
  - `GET /agents/:id/bundle` 下载 .lxbundle（含下载计数 +1）
  - `POST /agents/:id/rate` 评分（1-5，唯一约束 upsert + 自动更新 rating_avg）
  - `GET /agents/:id/ratings` 评分列表
  - `POST /agents/:id/comments` + `GET` 评论（树形回复）
  - `GET /users/:id` 用户主页 + 关注列表 + 粉丝列表
  - `POST/DELETE /users/:id/follow` 关注/取关
  - `GET /leaderboard?kind=hot|newest|top_rated` 排行榜
  - `POST /agents/:id/invocations` 创建 6 位邀请码（大写字母+数字，避免 0/O/1/I）
  - `POST /invocations/:code/invoke` 通过 h5_tunnel 转发调用（含每日限流 + 调用日志审计）
  - `GET /invocations/logs/mine` 调用日志
- **P2P 调用链路**：调用方 → community-server → 信令服务器 `/tunnel/<token>/api/chat/quick` → 发布方灵犀实例
- **发布方 tunnel token 约定**：在个人简介中写入 `[tunnel:<token>]` 标记（同时展示在主页便于核对）
- **客户端集成**：
  - `backend-desktop/handler/agent_bundle.go`：`ExportAgentBundleHandler` + `ImportAgentBundleHandler` + `GET /api/agents/:id/export-bundle` + `POST /api/agents/import-bundle`
  - `frontend-desktop/src/api/client.js`：新增 `community.*` 命名空间（封装所有社区 API + 自动带 Bearer token）
  - `frontend-desktop/src/CommunityPage.jsx`：完整社区页面（发现/排行榜/关注/我的/邀请码/个人资料 6 个 Tab）
  - `AppShell.jsx`：右侧导航新增「社区」入口（Users 图标）
- **接口自动化测试**：`community-server/handler/api_test.go` 14 个测试覆盖全部 API（auth/agent/rating/comment/follow/invocation/leaderboard/rate_limit/permission）
- **本地启动**：
  ```bash
  cd community-server
  PORT=8090 DB_PATH=/tmp/lingxi-community/community.db STORAGE_ROOT=/tmp/lingxi-community/storage go run .
  ```
- **设计文档**：`docs/superpowers/specs/2026-06-21-agent-community-platform-phase1-design.md`（如有）

### Web 版部署网关（v2026-06）
- **独立反向代理网关 `web-server/`**：零改动现有代码，通过反向代理模式为灵犀提供 Web 部署能力
- **密码认证**：`WEB_PASSWORD` 环境变量，`POST /web/login` 端点，token 通过 Cookie + Header 双重传递
- **反暴力破解**：同 IP 5 次失败锁定 5 分钟
- **子进程管理**：启动现有 `smart-agent` 后端作为子进程，健康检查等待就绪，优雅关闭
- **反向代理**：`/api/*` 和 `/ws` 代理到内部后端（localhost 自动绕过 PairTokenAuth）
- **静态文件服务**：直接服务 React SPA 构建产物 + SPA fallback
- **Docker 一键部署**：多阶段构建（Go backend + Web gateway + React frontend + Node.js + Claude CLI），运行时基于 `node:22-alpine`
- **二进制部署**：`build-web.sh` 交叉编译 Linux amd64 部署包 + 自动打包 `lingxi-web-linux-amd64.tar.gz`
- **启动脚本增强**：`start.sh` 自动检测 Claude CLI 路径（`command -v claude`），未找到时输出安装提示
- **独立登录页**：`static/login.html`，灵犀品牌风格，不依赖 React

### 四项修复（v2026-06-28）
- **图片分析修复**：有图片附件时自动切换到 `--input-format stream-json` 多模态模式，图片 base64 编码后作为 image content block 直接传给 Claude CLI（替代之前的 Read 工具提示方式），Claude CLI 原生多模态能力正确激活
- **自我进化增强**：`callActiveLLM` 新增 Claude CLI 可执行文件检测（`exec.LookPath`），错误信息推送到前端（WS `evolution_progress` 事件）；`TryAutoEvolution` 增加诊断日志；扫描器 `runScan` 增加详细 agent 统计输出
- **定时任务修复**：调度器增加心跳日志（每 5 分钟输出 enabled 任务数和最近到期时间）；`GetDueScheduledTasks` 将 Go 侧时间过滤移入 SQL WHERE 条件；`matchField` 修复 cron 步进解析（支持 `*/5`、`3/10`、`1-5/2` 三种步进格式）
- **Web 部署优化**：Dockerfile 运行时镜像从 `node:22-slim` 改为 `node:22-alpine`（体积更小）；`build-web.sh` 新增 tar.gz 自动打包；`start.sh` 自动检测 Claude CLI
