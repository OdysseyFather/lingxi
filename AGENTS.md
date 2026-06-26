# AGENTS.md — 灵犀 AI Agent 项目指南

本文件为 AI 助手（Codex / Cursor / Copilot 等）提供项目上下文，帮助快速理解系统全貌并高效开发。

---

## 项目简介

**灵犀 AI Agent** 是一个本地优先的桌面 AI Agent 工作台，采用 Electron + React + Go 三层架构。支持多模型接入、智能体工厂、技能管理、知识库、MCP 工具、IM 集成等能力。

---

## 技术栈

### 前端 `frontend-desktop/`
- **React 19** + **Vite 8**（构建需 Node.js ≥ 20.19 或 ≥ 22.12）
- **Tailwind CSS 3.4** — 全局样式，6 套主题通过 CSS 变量切换
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

### 手机端 `mobile-flutter/`
- **Flutter 3.24+** + **Dart 3.5+**
- **Provider 6** — 状态管理
- **mobile_scanner 5** — QR 扫码配对
- **flutter_markdown** — Markdown 渲染
- **web_socket_channel 3** — WebSocket（流式对话 + 实时事件）
- **shared_preferences 2** — 本地持久化（pair_token / 连接信息）
- **image_picker 1** + **flutter_image_compress 2** — 图片附件
- 瘦客户端架构：所有 AI 计算和数据存储在 PC 端，手机端通过 LAN 直连或 WAN 隧道代理连接

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
│   │   ├── pair_auth.go      # 手机配对认证中间件 + WS 一次性票据 + 配对 API
│   │   ├── push_notify.go    # 推送通知（FCM v1 + /api/push/config + /api/push/test）
│   │   ├── proactive.go      # 主动式 Agent（日报 + 未完成任务追踪 + 定时调度）
│   │   ├── deep_search.go    # 深度联网搜索（DuckDuckGo + Wikipedia 多源 + LLM 综合 + SSE）
│   │   ├── knowledge_web.go  # 网页知识采集（go-readability + 自动入库索引）
│   │   ├── token_stats.go    # Token 水位 + 自动摘要压缩（/api/sessions/:id/token-stats + summarize）
│   │   ├── terminal.go       # PTY 终端 WebSocket handler（creack/pty）
│   │   ├── permission.go      # 权限分级（low/medium/high）配置 + 安全 hooks
│   │   ├── pty_unix.go       # Unix PTY 实现
│   │   ├── pty_windows.go    # Windows PTY 实现
│   │   ├── quick_chat.go     # Spotlight 快捷对话
│   │   ├── tasks.go          # 后台任务列表 + 删除
│   │   ├── router_status.go  # 路由器状态查询
│   │   └── ws_hub.go         # WebSocket Hub
│   ├── connector/            # IM 平台对接（企微/钉钉/飞书，飞书支持流式卡片消息）
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
│   ├── dream/                # 记忆巩固引擎（Dream：跨会话记忆整理/合并/精炼/清理）
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
│   │   │   └── slices/       # authSlice/uiSlice/sessionSlice/chatSlice/nexusSlice/codingSlice/codingChatSlice
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
│   │   │   ├── AppearancePage.jsx  # 6 套主题
│   │   │   ├── MemoryPage.jsx     # 长期记忆管理
│   │   │   ├── NexusSettingsPage.jsx # 网络与协作设置
│   │   │   └── UsagePage.jsx       # 用量 + 预算预警
│   │   ├── DeepSearchPage.jsx    # 深度搜索独立页（进度时间线 + 来源卡片 + 引用胶囊）
│   │   ├── EvolutionPage.jsx      # 自我进化日志 + Recharts 可视化（AreaChart/PieChart）
│   │   ├── ProactiveAgentPage.jsx # 主动式 Agent 配置页（日报 + 未完成任务追踪）
│   │   ├── TokenWaterLevel.jsx    # Token 水位可视化组件
│   │   ├── SessionTemplates.jsx   # 快速开始对话模板
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
│   │   ├── KnowledgePage.jsx       # 知识库（含「网页导入」tab）
│   │   ├── MCPPage.jsx
│   │   ├── IMConnectorPage.jsx
│   │   └── ScheduledTasksPage.jsx  # 定时任务管理
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── mobile-flutter/           # Flutter 手机端（瘦客户端，连接 PC 后端）
│   ├── pubspec.yaml           # 依赖配置
│   ├── lib/
│   │   ├── main.dart          # 入口（Provider + 路由）
│   │   ├── services/
│   │   │   ├── api_client.dart      # HTTP 请求封装（X-Pair-Token 认证）
│   │   │   ├── ws_client.dart       # WebSocket 客户端（ticket 认证 + 自动重连）
│   │   │   ├── connection_manager.dart # LAN/WAN 自动切换 + 心跳检测
│   │   │   └── pair_service.dart    # QR 扫码 / 6 位码配对
│   │   ├── models/
│   │   │   ├── session.dart         # 会话模型
│   │   │   ├── message.dart         # 消息模型 + LiveBlock
│   │   │   └── agent.dart           # 智能体模型
│   │   ├── providers/
│   │   │   └── app_state.dart       # 全局状态（Provider ChangeNotifier）
│   │   ├── screens/
│   │   │   ├── pair_screen.dart     # 配对页（QR 扫码 tab + 手动输码 tab）
│   │   │   ├── home_screen.dart     # 首页（会话列表 + 智能体选择）
│   │   │   ├── chat_screen.dart     # 对话页（流式消息 + Markdown + 图片）
│   │   │   └── settings_screen.dart # 设置页（连接状态 + 智能体 + 解除配对）
│   │   └── widgets/
│   │       ├── message_bubble.dart  # 消息气泡（多块渲染 + Markdown + 图片 + 反馈 + 复制）
│   │       ├── thinking_indicator.dart # 思考中指示器（可折叠）
│   │       ├── thinking_block.dart  # 思考过程折叠块（done 态，紫色主题 + 预览）
│   │       ├── tool_card.dart       # 工具调用卡片（颜色编码 + 折叠详情 + 聚合组）
│   │       ├── code_block.dart      # 代码块（语法高亮 + 语言标签 + 复制）
│   │       └── citation_block.dart  # RAG 引用脚注（编号标记 + 折叠来源列表）
│   └── android/app/src/main/res/xml/
│       └── network_security_config.xml # LAN 明文 HTTP 白名单
│
├── signaling-server/         # 广域网信令服务器（独立部署到 github.com/OdysseyFather/lingxi-singaling-server）
│   └── main.go               # WebSocket 信令（注册/发现/消息中继，无 HMAC，支持 conversation_invite/accept/reject）
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
│       ├── ai-engine/        # Codex CLI
│       ├── bridge/           # llm-bridge (JS, 旧版回退)
│       ├── litellm-bridge/   # [已移除] 已被 backend-desktop/proxy/ 纯 Go 代理替代
│       ├── node-bin/         # 内嵌 Node.js
│       └── whisper/          # whisper.cpp 离线 ASR (whisper-cli + ggml-base.bin)
│
├── ai-config/                # AI 引擎配置模板
├── build-desktop.sh          # 一键构建脚本
├── AGENTS.md                 # 本文件
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

### Flutter 手机端构建

**前置条件：**
- Flutter SDK 3.24+（可下载到 /tmp/flutter/）
- Android SDK（cmdline-tools + platforms;android-34 + build-tools;34.0.0）
- Java 17+（sdkmanager 需要）

```bash
# 0. 环境变量
export PATH="/tmp/flutter/bin:$PATH"
export JAVA_HOME="/Users/xiejiarong/Library/Java/JavaVirtualMachines/corretto-17.0.18/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PUB_HOSTED_URL=https://pub.flutter-io.cn      # 中国镜像
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn

# 1. 安装依赖
cd mobile-flutter && flutter pub get

# 2. 构建 APK
flutter build apk --release    # Release APK (~71MB)
flutter build apk --debug      # Debug APK (~200MB)

# 产物位置
# build/app/outputs/flutter-apk/app-release.apk
# build/app/outputs/flutter-apk/app-debug.apk
```

---

## 开发约定

### 必须遵守

1. **不允许开启子代理** — 所有开发任务在当前会话中直接完成
2. **每次开发完成后必须执行以下全部步骤（强制，不可跳过）：**
   1. 更新 `.cursor/rules/lingxi-agent.mdc`（如有架构/规范变更）
   2. 更新 `AGENTS.md`（如有新模块/技术栈/流程变更）
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
| POST | /api/sessions/batch-export | BatchExportSessions | 批量导出会话为 ZIP（Markdown） |
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
| GET | /api/dream/config | GetDreamConfig | 记忆巩固配置 |
| PUT | /api/dream/config | UpdateDreamConfig | 更新巩固配置 |
| GET | /api/dream/status | GetDreamStatus | 巩固运行状态 |
| POST | /api/dream/trigger | TriggerDream | 手动触发记忆巩固 |
| GET | /api/agents/:id/dream/history | GetAgentDreamHistory | 巩固历史日志 |
| GET | /api/files/list | ListDirectory | 列出目录内容 |
| GET | /api/files/read | ReadFileContent | 读取文件内容 |
| PUT | /api/files/write | WriteFileContent | 写入文件内容 |
| GET | /api/files/project | GetProjectInfo | 获取项目信息 |
| GET | /api/files/search | SearchFiles | 全局文件内容搜索（path+query+glob） |
| GET | /api/files/search-names | SearchFileNames | 按文件名搜索 |
| GET | /api/terminal/ws | TerminalWsHandler | PTY 终端 WebSocket（多标签页交互式 shell） |
| POST | /api/search/deep | DeepSearch | 深度联网搜索（SSE 流式 + DuckDuckGo + Wikipedia + LLM 综合） |
| POST | /api/knowledge/from-url | KnowledgeFromURL | 网页知识采集（go-readability 提取 + 入库索引） |
| GET | /api/sessions/:id/token-stats | GetTokenStats | 会话 Token 水位统计 |
| POST | /api/sessions/:id/summarize | SummarizeSession | 自动摘要压缩长会话 |
| GET | /api/proactive/config | GetProactiveConfig | 主动式 Agent 配置 |
| PUT | /api/proactive/config | SetProactiveConfig | 更新主动式 Agent 配置 |
| POST | /api/push/config | SetPushConfig | 配置 FCM 推送 |
| POST | /api/push/test | TestPush | 测试推送 |
| POST | /api/pair/init | PairInit | 手机配对初始化（生成 6 位码） |
| POST | /api/pair/verify | PairVerify | 手机配对验证 |
| GET | /api/health | HealthCheck | 结构化健康检查 |
| GET | /api/backup/export | ExportBackup | 导出数据库备份 |
| POST | /api/pair/initiate | PairInitiateHandler | 发起配对（返回 challenge+code+QR） |
| POST | /api/pair/complete | PairCompleteHandler | 完成配对（返回永久 pair_token） |
| POST | /api/pair/verify | PairVerifyHandler | 验证 token 有效性 |
| GET | /api/pair/devices | PairListDevicesHandler | 已配对设备列表 |
| DELETE | /api/pair/devices/:id | PairUnpairHandler | 解除配对设备 |
| POST | /api/pair/devices/:id/rotate | PairRotateHandler | 轮换设备 token |
| POST | /api/pair/devices/:id/push-token | PairRegisterPushTokenHandler | 注册 FCM/APNs 推送 token |
| POST | /api/pair/revoke-all | PairRevokeAllHandler | 一键撤销所有配对 |
| POST | /api/auth/ws-ticket | IssueWsTicketHandler | 获取 WS 一次性握手票据 |
| GET | /api/push/config | GetPushConfigHandler | 获取推送通知配置 |
| PUT | /api/push/config | SetPushConfigHandler | 更新推送通知配置 |
| POST | /api/push/test | TestPushHandler | 发送测试推送通知 |
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
- **快捷回复建议（assistant 回复后显示 2-3 个推荐后续问题胶囊按钮）**
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
- **网页知识采集（`POST /api/knowledge/from-url` + go-readability 提取正文 + 自动入库索引）**
- **KnowledgePage 新增「网页导入」tab**

### 主动式 Agent + 深度搜索 + Token 水位
- **主动式 Agent（`backend-desktop/handler/proactive.go`）**
  - 日报生成（每日总结当天会话要点主动推送）
  - 未完成任务追踪（跨会话记忆未完成工作主动提醒）
  - 定时调度（周期性自动执行，无需手动触发）
  - 上下文感知（根据当前活跃窗口/浏览器自动调整建议）
  - ProactiveAgentPage 配置页 + /api/proactive/config
- **深度联网搜索（`backend-desktop/handler/deep_search.go`）**
  - `/api/search/deep` SSE 流式接口
  - 多源并发（DuckDuckGo + Wikipedia + 其他可扩展源）
  - LLM 综合合并去重 + 提炼要点 + 生成摘要
  - 引用追踪（每个结论标注来源 URL，可点击溯源）
  - DeepSearchPage 前端（进度时间线 + 来源卡片 + 引用胶囊）
  - `/search` 斜杠命令一键跳转深度搜索
- **Token 水位 + 自动摘要压缩（`backend-desktop/handler/token_stats.go`）**
  - 实时 Token 计数（input/output/cache/reasoning 全维度）
  - 水位可视化（会话卡片 Token 进度条）
  - 临近阈值自动摘要压缩历史消息
  - 会话卡片预览（鼠标 hover 显示会话摘要）
  - `/api/sessions/:id/token-stats` + `/api/sessions/:id/summarize`
- **EvolutionPage Recharts 可视化**：AreaChart 进化趋势 + PieChart 类型/触发源分布

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
- 6 套主题（light/dark/midnight/cyber/aurora/cosmos）
- AnimatePresence 页面切换动画
- **顶部导航栏（主导航 5 项：对话/智能体/技能/知识库/MCP + 辅助导航：search/deep-search/evolution/proactive/nexus/im/workflow/scheduled/settings，layoutId 动画指示器）**
- 会话重命名（双击编辑）+ **会话置顶**
- **会话批量删除**
- **会话批量导出（选中多个会话导出为 Markdown ZIP 包）**
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
- **记忆巩固 Dream（后台定时巡检 + LLM 分析跨会话记忆 → 自动合并重复/精炼模糊/补充缺失/清理过时 + 手动触发 + WS 实时进度 + MemoryPage Dream 面板 + 巩固历史日志）**
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
- **流式实时对话（每端映射独立 Codex 会话，token 级流式 WS 推送，主聊天同款 UI）**
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
- **Windows 构建支持（NSIS 安装包 + Portable）**
- **OpenAI 兼容模型技能识别增强（自动注入已安装技能清单到 system prompt）**
- **防死循环保护（禁止调用 Cursor 专有工具，避免 tool_use 循环）**
- **冷启动优化（Splash 页面立即显示，后端就绪后无缝切换）**
- **本地离线语音识别（内置 whisper.cpp + ggml-base 模型，无需网络）**
- **定时任务调度修复（Go 侧时间比较，15 秒检查间隔，时区兼容）**
- **后台任务管理（GET /api/tasks、DELETE /api/tasks/:id）**
- **挂起任务机制（Agent 向用户请求信息时挂起，前端提交后继续）**
- **手机配对认证（pair_auth.go：6 位配对码 + WS 一次性票据 + /api/pair/init + /api/pair/verify + 加密 token 持久化）**
- **推送通知（push_notify.go：FCM v1 + /api/push/config + /api/push/test + 客户端通知开关）**
- **加密密钥（crypto/secret.go：safeStorage 本地加密，密钥永不离开设备）**
- **飞书流式卡片消息（connector/feishu_streaming.go：CardKit v1 + 80ms flush + 交互按钮回调）**
- **会话批量导出 ZIP（选中多个会话导出为 Markdown ZIP 包）**
- **H5 公网云端隧道（HTTP+WebSocket 反向代理 + 微信浏览器兼容 + QR 扫码 + 6 位配对码）**

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
- **后端自动化测试（api_extended_test.go + api_integration_test.go + ws_hub_test.go + pair_auth_test.go + cache_test.go + middleware_test.go，覆盖 WS 协议/配对认证/缓存/CORS）**
- **OpenAI 协议代理 cache/reasoning token 透传修复**

### 灵犀 4 大功能改造（2026-05）
- **定时任务时区 BUG 修复**：fmtTimeForSQLite 改为 UTC 写入 + scan 时统一 Local() 化，避免 next_run_at 永远在未来而永不触发
- **定时任务启动自检 + 实时交互**：启动时补齐缺失 next_run_at；scheduled_task_started/done WS 事件 + ScheduledTasksPage 实时运行中徽章 + AppShell 顶部小红点
- **会话级自动进化**：每轮对话结束时检测「消息数 ≥ 6 且距上次进化 > 30 分钟」自动 TryAutoEvolution
- **全局进化扫描器**（`backend-desktop/evolution/scanner.go`）：每 6 小时巡检所有启用进化的 Agent + 安静时段 + 冷却控制 + 前端可视化配置
- **记忆巩固 Dream**（`backend-desktop/dream/dream.go`）：定时巡检所有启用进化的 Agent，自动整理/合并/精炼/清理记忆库，支持手动触发 + WS 实时进度 + 前端 MemoryPage Dream 面板
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

### cc-haha Provider 架构优化（v2026-05 Phase 2）
- **新增 Anthropic 直连供应商**：GLM/智谱（`glm_anthropic`）、Kimi（`kimi_anthropic`）、MiniMax（`minimax_anthropic`）、Ollama（`ollama_anthropic`）、LM Studio（`lmstudio_anthropic`），绕过外部协议转换层零 Python 依赖
- **DeepSeek 默认模型更新**：`deepseek-chat` → `deepseek-v4-pro`
- **模型上下文窗口管理**：provider meta 中 `context_windows` 映射 + `CLAUDE_CODE_MAX_CONTEXT_LENGTH_TOKENS` / `ANTHROPIC_MODEL_CONTEXT_WINDOWS` 环境变量
- **认证策略（auth_strategy）**：`auth_token` / `auth_token_empty_api_key`（Ollama/LM Studio）/ `api_key`
- **Provider 特定环境变量（default_env）**：`CC_HAHA_SEND_DISABLED_THINKING`（GLM/Kimi）、`ANTHROPIC_DEFAULT_*_MODEL_SUPPORTED_CAPABILITIES`（DeepSeek）
- **两阶段 Provider 测试**：直连验证 + 代理管道验证
- **前端增强**：新供应商图标/色彩/模型列表 + "直连"/"代理"徽章 + 分步延迟显示

### 定时任务与用量统计增强（v2026-05 Phase 4）
- **定时任务页面重构**：渐变 Hero 卡片 + 4 格统计 + 任务卡片（智能体头像/倒计时/进度/hover 操作栏）+ 时间线风格执行记录
- **用量统计增强**：费用趋势折线图 + 按智能体聚合（头像 + 占比进度条）+ 后端 GroupUsageByAgent / GroupUsageCostByDay + 双列布局
- **Screen Agent 浏览器控制入口**：面板新增"浏览器"模式 tab + Playwright MCP 就绪状态 + 快捷操作

### 移除 Coding View + 多模块大规模重做（v2026-06 大重做）
- **移除 Coding View 全部模块**：删除 `backend-desktop/handler/coding.go / coding_chat.go / coding_agents.go / coding_prompt.go / checkpoint.go` + `frontend-desktop/src/code/` 整目录 + `frontend-desktop/src/state/slices/codingSlice.js / codingChatSlice.js` + `frontend-desktop/src/ModeSelector.jsx` + `electron/resources/sdk-runner/`
- **主动式 Agent（proactive.go）**：日报 / 未完成任务追踪 / 定时调度 / 上下文感知主动建议
- **Token 水位 + 自动摘要压缩（token_stats.go）**：实时 Token 计数 + 水位可视化 + 临近阈值自动摘要 + 会话卡片预览（`/api/sessions/:id/token-stats` + `/api/sessions/:id/summarize`）
- **Web 知识采集（knowledge_web.go）**：`/api/knowledge/from-url` + go-readability 正文提取 + 自动入库索引
- **深度联网搜索（deep_search.go）**：`/api/search/deep` SSE + DuckDuckGo + Wikipedia 多源并发 + LLM 综合 + 引用追踪（DeepSearchPage 前端 + `/search` 斜杠命令）
- **Token 使用量透传修复**：OpenAI 协议代理 cache/reasoning token 透传
- **飞书流式卡片消息（feishu_streaming.go）**：CardKit v1 + 80ms flush
- **配对认证（pair_auth.go + pair_auth_test.go）**：6 位配对码 + WS 一次性票据 + `/api/pair/init` + `/api/pair/verify`
- **推送通知（push_notify.go）**：FCM v1 + `/api/push/config` + `/api/push/test`
- **加密模块（crypto/secret.go）**：safeStorage 本地加密，密钥永不离开设备
- **会话批量导出 ZIP**：`489a9ad` 落地
- **H5 公网云端隧道**：`6a99638` 落地
- **Flutter 手机端深度重做（对标豆包/千问）**：
  - ConversationTab 三段式首页（场景 6 宫格 + 卡片会话 + 底部新对话胶囊）
  - DiscoverTab 分类横滑 + Hero Banner + 横滑 Agent 推荐 + 使用技巧
  - ChatScreen Composer 浮起式胶囊 + Hero 欢迎页 + 渐变 ShaderMask
  - 视觉系统升级：3 级阴影 + 6 种场景渐变 + 圆角统一 20px + 用户气泡品牌色渐变
  - 8 项高级交互：打字机 / Hero 转场 / 交错动画 / 按压反馈 / 骨架屏 / 滚动视差 / 自定义刷新 / 光标呼吸
  - Tab 懒加载（IndexedStack 动态构建）
  - DeepSearchScreen + 发现页深度搜索入口
  - 个性化设置（user_preferences.dart）：主题模式 / 字体大小 0.85x~1.5x / 通知 / 提示音 / 触感反馈 / 回车发送
  - iOS 风格分组卡片设置页 + Agent 回复消失修复（_mergeMessagesWithLocal 合并策略 + 2s 延迟）
- **EvolutionPage Recharts 可视化**：AreaChart 趋势 + PieChart 类型/触发源分布
- **KnowledgePage 网页导入 tab**
- **MessageList Empty 移动端 6 宫格场景入口**
- **SessionTemplates 快速开始对话模板**

---

> **历史档案**：以下 Phase 5-22 是 Coding View 演进历史，**该功能已在 v2026-06 大重做中整体移除**。保留这些记录仅供追溯设计演进，不再代表当前代码状态。所有 `coding_*` 路由、`/code/` 目录、`codingSlice` 状态切片均已被删除。

### Coding View 全面重做（v2026-05 Phase 5）
- **独立模式架构**：Coding View 提升为与灵犀主模式并肩的独立应用模式（`appMode: 'main' | 'coding'`），首次启动 ModeSelector 选择页，随时可切换
- **CodingShell 独立布局**：完全独立的布局壳（顶部 tab 栏 + 左侧图标栏 + 左侧会话侧边栏 + 主区域 + 右侧 Workspace Changes + 底部状态栏）
- **CodingComposer 重做**：文件 chip 附件（拖拽显示文件名，非绝对路径）+ +号文件浏览器 + 内联模型选择器 + Run/Stop 按钮 + 斜杠命令面板
- **cc-haha 风格渲染**：工具调用聚合卡片 + diff 视图 + 思考折叠 + coding 风格 Markdown + SessionHeader 状态
- **工具调用卡片颜色编码**：文件操作=蓝色、编辑=紫色、终端=绿色、搜索=橙色 + diff 统计（+N -M）+ 行级颜色
- **AskQuestionBlock**：Agent 向用户提问的内联交互卡片（单选/自由文本 + Submit）
- **PermissionBlock**：工具权限确认卡片（Allow / Allow for session / Deny + AWAITING APPROVAL 状态）
- **TaskTodoList**：内联任务列表面板（进度条 + 编号 + 状态图标 + Agent 派发 + 折叠展开）
- **AgentTeamPanel**：Agent 团队协作面板（总指挥 + 子代理列表 + Working/Done/Idle 状态 + Start/Stop）
- **WorkspaceChanges**：右侧 git status 文件变更面板（M/U/D/A 标记 + +N -M 统计 + 搜索过滤）
- **DiffViewer**：完整 diff 渲染（双行号 + 行级颜色 + 变更统计柱状图 + Copy path）
- **FileChip**：文件附件 chip（文件类型颜色区分 + 可点击/可移除）
- **CodingTabBar**：顶部多 tab 会话栏（类似浏览器标签 + 活跃绿点 + 关闭按钮）
- **CodingSidebar**：左侧会话侧边栏（搜索 + 按日期分组 Today/Yesterday/Earlier）
- **H5 响应式**：移动端自动隐藏侧边栏/图标栏/tab/Changes，显示 MobileHeader
- **后端 Coding API**：GET /api/coding/changes + /api/coding/diff + /api/coding/branch
- **codingSlice**：Zustand 独立切片（项目路径/工作区变更/Diff/Task/Agent Team/Git 分支）
- **完全独立主题**：强制 `data-theme="light"`，硬编码暖色调，不受主界面主题切换影响
- **CodingSettingsPage 独立设置页**：模型与接入点/长期记忆/用量统计/远程访问/关于（不复用主界面 SettingsPage）
- **FileSidebar 文件树**：工作目录文件树（暖色调 + 搜索过滤 + 拖拽文件引用 + 类型颜色区分 + 懒加载）
- **主界面 Coding 入口**：顶栏"Coding"标签按钮，一键切换模式

### Coding View 增强（v2026-05 Phase 6）
- **工作目录上下文注入**：Chat API 新增 `workingDir` 参数，后端 `cmd.Dir` + system prompt 注入，AI 在正确的项目目录下工作
- **文件夹拖拽引用**：FileSidebar/CodingComposer 支持拖拽文件夹，FileChip 区分文件/文件夹，文件浏览器可附加整个目录
- **TaskTodoList 实时集成**：`TodoWrite` 工具调用 → `task_update` WS 事件 → codingTasks 实时更新 → 消息流内联进度面板
- **AskQuestion/Permission 内联**：`ask_question`/`permission_request` WS 事件 → 内联交互卡片（单选/文本 + Allow/Deny）
- **Agent 状态增强**：ThinkingIndicator 详细状态 + 实时计时 + SessionHeader 显示项目名/状态
- **ToolGroupCard 增强**：工具组总耗时 + 工具名预览 + Zap 图标
- **UserMessage 文件引用渲染**：`@file` 和 `[目录:]` 引用解析为 chip 标签
- **交互式选择/输入块渲染**：检测 AI 回复中的 `choice`/`input` JSON 代码块，自动渲染为可点击的选项卡片和输入表单（InteractiveChoiceBlock/InteractiveInputBlock），替代纯代码块展示
- **任务计划 task_plan**：系统 prompt 指导 AI 在多步骤任务前输出 `task_plan` JSON 块，后端 `emitTaskPlanFromText` 检测并推送 `task_update` WS 事件
- **StickyTaskBar 吸顶任务栏**：任务进度条固定在聊天区域顶部，显示当前执行步骤/完成数/总数/可展开查看详情，实时根据 AI 输出更新
- **智能体选择器（Agent Picker）**：CodingComposer 工具栏新增 Agent 选择器下拉菜单，显示当前智能体名称/头像，支持一键切换
- **代码预览面板（CodePreview）**：点击 FileSidebar 文件时右侧弹出代码预览面板（语法高亮 + 行号 + 复制 + 插入到对话），暖色调 light 主题
- **WorkspaceChanges 实时刷新**：集成后端 `/api/coding/changes` API，30 秒自动刷新 + 手动刷新，点击变更文件可预览
- **Cmd+K 全文搜索**：Coding View 支持 Cmd+K 快捷键弹出搜索面板
- **消息操作栏**：UserMessage hover 复制/编辑（内联编辑+重发）；AssistantMessage hover 复制

### Coding View 深度优化（v2026-05 Phase 8）
- **裸 JSON 交互块检测**：前后端均支持检测未包在代码围栏内的裸 JSON 交互对象（花括号配对扫描），解决 AI 输出裸 `choice`/`input`/`task_plan` JSON 时无法渲染交互 UI 的问题
- **后端 emitInteractiveFromText**：`content_block_stop` 时检测文本中的 `choice`/`input` JSON → 推送 `ask_question` WS 事件
- **代码预览上方布局**：CodePreview 面板从右侧分栏改为聊天区域上方展示
- **代码编辑保存**：CodePreview 支持 Edit/Save 模式切换 + Cmd+S 快捷保存 + 展开/收起
- **后端文件写入 API**：`PUT /api/files/write`（WriteFileContent），前端 `api.writeFile`
- **Coding 会话与主界面会话隔离**：`sessions.mode` 列（`''`=通用, `'coding'`=编程），ListSessions API 支持 `?mode=coding` 筛选，CreateSession 自动携带 mode。切换 appMode 时清空当前会话并刷新

### Coding View 全面重构（v2026-05 Phase 9）
- **后端 Chat 逻辑分离**：独立 `coding_chat.go` + `coding_prompt.go`，`POST /api/coding/chat` 和 `POST /api/coding/chat/answer-batch`，Coding 模式使用纯编程 system prompt
- **AskQuestion 批量缓冲协议**：后端缓冲所有问题直到 `message_stop`，通过 `ask_questions_batch` WS 事件一次性推送；支持 `questions_batch` JSON 格式
- **Sub-agent 事件检测**：检测 Claude Code 输出中的 sub-agent 创建/完成信号，推送 `subagent_start`/`subagent_done` WS 事件
- **前端状态层分离**：`codingChatSlice.js` 独立管理 Coding 消息/流式/Agent 状态，WS 事件路由按 `appMode` 分发
- **AskQuestion 渐进式向导**：`AskQuestionWizard.jsx` 实现批量问题逐个展示 + 汇总确认 + 一次性提交
- **Agents Window**：`AgentsWindow.jsx` Cursor 风格 Sub-agent 监控面板（主 Agent 卡片+子 Agent 列表+实时状态）
- **CodePreview 右侧分栏**：CodePreview 从聊天上方改为右侧分栏（flex 布局+可拖拽宽度+多文件标签页+Cmd+F 搜索+Tab 缩进）
- **TaskTodoList 增强**：双向同步 + 子任务支持 + 任务耗时；StickyTaskBar 增加跳过/取消操作按钮

### Coding View 持续增强（v2026-06 Phase 10）
- **会话按项目路径关联**：`sessions.project_path` 列 + ListSessions API `?project_path=xxx` 筛选 + CreateSession 携带项目路径，切换项目目录时自动过滤会话
- **文件 Diff 内联展示**：移除顶部实时 LiveDiffPanel，改为在 CodingToolCard 内展示可折叠的 git diff（行级颜色编码 + 变更统计）
- **终端集成**：后端 `GET /api/terminal/ws` PTY WebSocket（creack/pty）+ 前端 `TerminalPanel.jsx`（@xterm/xterm），多标签页、最大化、VSCode 深色主题
- **H5 移动端完整适配**：viewport-fit=cover + safe-area-inset + 100dvh + MobileHeader 增强（汉堡菜单/终端/设置）+ MobileDrawer 会话抽屉 + 全屏移动端终端 + 响应式 padding + 触摸优化

### Coding View 专业化增强（v2026-06 Phase 11）
- **工具调用完整展示**：后端 `tool_end` 事件新增 `fullInput` 字段传递完整工具输入 JSON，前端 CodingToolCard 重写为专业开发者视图（Bash 命令直接显示、文件路径可复制、Edit 操作 old/new 对比、Read/Grep/Glob 参数详情、Task 子代理描述+prompt 预览）
- **ToolGroupCard 默认展开**：工具组卡片默认展开显示所有工具调用详情（可折叠），区别于主模式的默认折叠
- **任务计划强制规则**：system prompt 中 task_plan 规则升级为"最高优先级"，要求 Agent 在所有非 trivial 任务前必须先输出任务计划，每步完成后立即更新状态
- **图片粘贴支持**：CodingComposer 新增 `onPaste` 处理器，支持 Cmd+V 粘贴图片（预览缩略图 + 移除按钮）和 `<ImagePlus>` 图片上传按钮
- **桌面文件拖拽**：CodingComposer 增强 `handleDrop`，支持从桌面拖拽图片文件（自动 base64 编码）和文本文件（读取内容作为附件）
- **思考模式开关**：`codingSlice` 新增 `codingThinkingEnabled` 状态（持久化 localStorage），CodingComposer 工具栏新增 Think 开关按钮（紫色高亮），发送消息时携带 `thinking` 参数
- **后端思考模式支持**：`POST /api/coding/chat` 新增 `thinking` 参数，传递 `DISABLE_THINKING=1` 环境变量控制 Claude 思考链
- **CodePreview 全高度**：移除 `h-[45%]` 限制，改为 `h-full` 占满右侧面板全部可用空间，移除无用的展开/收起按钮

### Coding View Agent-First 重构（v2026-06 Phase 12）
- **三栏布局重构**：`CodingShell` 从双栏改为三栏（左侧 `WorkspacePanel` + 中央对话 + 右侧 `DrawerPanel`），删除旧 `CodingIconBar`
- **WorkspacePanel 左侧面板**：mini（40px 图标栏）/ expanded（240px 面板）双模式 + 文件树/任务列表 tab 切换 + AgentStatusCard Agent 状态卡片 + 快捷操作栏
- **AgentMessageCard 消息分层**：替换原 AssistantMessage，四层结构（ThinkingLayer 可折叠思考 / ToolLayer 工具调用 / TextLayer Markdown 渲染 / ChangeSummaryLayer 文件变更汇总）
- **DrawerPanel 右侧抽屉**：多标签页（代码预览 / Diff Review）+ 可拖拽宽度 + 最大化 + framer-motion 动画
- **DiffReviewView 逐块审查**：统一 diff 解析（parseDiffHunks）+ 每个 hunk 独立 Accept/Reject + 进度可视化 + 批量操作
- **PlanCard 计划模式**：AI 生成可编辑任务计划 + 步骤拖拽排序/新增/删除 + 确认后执行 + 进度条
- **ModeSwitcher 模式切换**：Normal / Plan / Think 三模式，CodingComposer 内嵌切换器，替代独立 Think 开关
- **权限分级系统**：`permissionConfig.js` 定义工具风险等级（low/medium/high）+ `PermissionSettingsPanel.jsx` UI（trust/managed/strict 三档 + CodingSettingsPage 集成）
- **codingThemes 主题系统**：5 套预定义主题（warm/dark/midnight/forest/sakura）+ CSS 变量动态注入 + `codingTheme` 状态持久化
- **keyboardShortcuts 快捷键**：21 个全局快捷键定义 + 平台适配（Mac/Win）+ 匹配工具函数
- **CodingErrorBoundary**：Coding View 专用 ErrorBoundary（友好错误 UI + 一键重试）
- **手机 H5 远程接入前端**：`RemoteAccessPanel.jsx` 桌面端配对码生成面板（6 位一次性码 + 5 分钟过期 + 连接状态）+ `MobileRemoteView.jsx` 移动端完整 UI（配对输入 / 审批卡片 / 实时进度 / 断连重连）
- **代码清理**：删除 5 个废弃文件（CodeView/CodeComposer/CodeToolCard/CodeToolbar/CodingIconBar），减少死代码约 1200 行

### Coding View UI/UX 深度重构（v2026-06 Phase 13）
- **原子组件库升级**：StatusBadge（五态动画）、GlassCard（glassmorphism）、SkeletonLoader（骨架屏）、ToastNotification（非阻塞通知）、PulseRing（呼吸光晕）
- **TaskTodoList 流式重构**：任务卡片 AnimatePresence 逐条动画入场，StatusBadge 状态图标弹性过渡，完成时 Sparkles 放大动画
- **工具调用聚合**：连续同类型工具自动聚合（Read ×5）为折叠组，summary 头显示聚合信息 + 总耗时；避免流水账式展示
- **CodingToolCard 颜色体系**：6 色编码（blue/amber/purple/emerald/sky/indigo），running 状态边框发光，详情面板动画展开
- **AskQuestionWizard 升级**：问题卡片滑入动画 + 选项 whileHover/whileTap 微交互 + 彩色进度段 + 装饰性 accent 线
- **AgentsWindow 树状化**：虚线连接器 + 并行 Agent mini 时间轴色块 + AgentStatusPill 替代文字标签
- **PermissionBlock 风险分级**：low→内联 auto-approved；medium→amber 确认条；high→红色全卡片阻断 + 脉冲标签
- **全局视觉升级**：glassmorphism 悬浮栏、hover 微交互（scale/bg）、骨架屏替代 loading 文字、dark mode CSS 变量兼容

### Coding View 交互修复（v2026-06 Phase 14）
- **AskQuestion 提交后 Q&A 显示**：提交答案后将问答内容追加为用户消息 + 之前 liveBlocks 合并为 assistant 消息
- **AskQuestion 提交后 Thinking 反馈**：清空 liveBlocks + 设置 agentState 为 THINKING，确保 ThinkingIndicator 显示
- **Permission Allow 修复**：修正 LiveBlock 组件 activeSession 引用错误，改为正确的 activeSessionId
- **Permission 状态自动解除**：agent_state 从 AWAITING_PERMISSION → THINKING 时自动标记 permission block resolved
- **AgentsWindow 固定到聊天上方**：Agent Tree 从消息流内移到滚动区域外固定位置，始终可见

### Coding View 体验优化（v2026-06 Phase 15）
- **灵犀主模式移除 task_plan**：主模式 system prompt 不再要求 AI 输出 task_plan JSON 块
- **新建会话按钮**：WorkspacePanel expanded 模式左上角添加显眼的「新建会话」按钮
- **会话-项目绑定**：切换工作目录后自动刷新会话列表并定位到对应项目的最近会话
- **全局文件搜索**：后端 `GET /api/files/search`（内容搜索）+ `GET /api/files/search-names`（文件名搜索）；前端 WorkspacePanel 搜索 tab（Cmd+Shift+F）+ glob 过滤 + 按文件分组
- **Agent Tree 自动清空**：done 事件自动清空 subAgents
- **思考模式开关生效**：后端 DISABLE_THINKING env + SDK runner 双重检查
- **Task 工具卡片默认折叠**：Task/TaskCreate 类型工具卡片默认不展开
- **任务 tab 替换为变更 tab**：WorkspacePanel 从「文件/任务」改为「文件/搜索/变更」

### Coding View 多媒体增强（v2026-06 Phase 16）
- **语音识别输入**：CodingComposer 麦克风按钮（MediaRecorder + whisper.cpp 转写 + 录音脉冲指示）
- **Finder 多选文件/目录**：Electron `select-files` IPC（openFile + openDirectory + multiSelections），`+` 按钮原生 Finder 多选
- **桌面拖拽绝对路径**：拖拽非图片文件使用 `file.path` 绝对路径（不读取内容不上传）
- **用户消息图片显示修复**：UserMessage 解析 JSON 消息中的 images 数组，渲染缩略图网格 + 点击全屏预览

### Coding View 7 项修复（v2026-06 Phase 17）
- **任务规划前置化**：system prompt 强化"先完整规划、再逐项执行"工作流，禁止边做边想
- **Diff 弹窗修复**：剥离绝对路径前缀传相对路径给 git diff + DrawerPanel 自动切换 diff tab
- **Markdown 预览**：CodePreview 支持 .md 文件渲染模式（ReactMarkdown + remarkGfm），预览/源码一键切换
- **弹窗替代三栏**：DrawerPanel 从右侧分栏改为全屏居中弹窗（960px + Escape 关闭 + scale 动画）
- **技能共享**：Coding 模式注入 buildSkillInventory，可使用灵犀主模式安装的全部技能
- **Stop 崩溃修复**：codingAbort 原子清空流式状态 + WS 事件 guard 跳过残留事件 + done handler try-catch
- **SubAgent 卡片精简**：默认收起，隐藏 tools 列表和 output 预览，只显示描述 + 状态

### Coding View SDK 对齐（v2026-06 Phase 18）
- **Task 管理策略**：`CLAUDE_CODE_ENABLE_TASKS=0` 强制 TodoWrite（前端管线基于此构建），避免 SDK 默认 TaskCreate/TaskUpdate 不兼容
- **System Prompt 预设化**：从自定义 string 改为 `claude_code` 预设 + `append` 模式，继承内置工具指导/安全规则/编码规范
- **SDK 文件检查点**：`fileCheckpointing: true` 启用 SDK 原生文件追踪，捕获 checkpoint UUID，后端推送 `sdk_checkpoint` WS 事件，前端记录+回滚
- **Hooks 系统**：PreToolUse 拦截敏感文件路径（.env/.pem/.key/credentials.json/id_rsa），PostToolUse 审计日志所有工具调用
- **自定义子代理模板**：`coding_agents` 表 CRUD + `GET/POST/DELETE /api/coding/agents` API + 自动注入 SDK `options.agents`
- **会话 Fork**：`POST /api/sessions/:id/fork` 分叉会话（复制消息 + SDK fork 选项），尝试不同方案
- **Plugin 加载**：`options.plugins` 支持加载本地 plugin 包（skills/agents/hooks/MCP），`GET/PUT /api/coding/plugins` 管理路径
- **Per-Model 成本追踪**：从 SDK `result.modelUsage` 提取子代理不同模型的成本明细，前端 usage payload 包含 `model_usage` 字段

### Coding View SDK 深度对齐（v2026-06 Phase 19）
- **Task 管理迁移**：移除 `CLAUDE_CODE_ENABLE_TASKS=0`，启用原生 `TaskCreate`/`TaskUpdate` 工具体系；前端 `TaskTodoList` 兼容 `subject` 字段；后端 `emitTaskCreateAsUpdate`/`emitTaskStatusUpdate` 统一映射 `subject`→`content`
- **CodingSettingsPage 设置页全面增强**：从 4 个 tab 扩展到 9 个 tab（模型/权限/用量/远程接入/子代理/系统提示词/Plugins/Hooks/Checkpoint）
- **子代理配置 UI**：`coding_agents` 表 CRUD + `GET/POST/PUT/DELETE /api/coding/agents` API + CodingAgentsPanel 管理面板（名称/描述/prompt/模型/maxTurns 编辑）
- **系统提示词配置 UI**：`CodingPromptPanel` 支持编辑 system prompt append 指令 + 查看/编辑项目 CLAUDE.md 文件（kv_store `coding_prompt_append` 持久化）
- **Plugins 管理 UI**：`CodingPluginsPanel` 支持添加/移除本地 plugin 目录路径 + 加载状态指示（kv_store `coding_plugins` 持久化）
- **Hooks 配置 UI**：`CodingHooksPanel` 支持管理自定义敏感文件阻止路径 + 内置 hook 模式可视化（PreToolUse 敏感文件拦截 + PostToolUse 审计日志）
- **权限管控增强**：新增 `acceptEdits`（仅允许文件编辑）和 `plan`（仅规划不执行）模式；支持 `allowedTools`/`disallowedTools` 声明式工具白名单/黑名单配置
- **Checkpoint 回滚 UI**：`CodingCheckpointPanel` 可视化 checkpoint 时间线（时间戳 + 文件修改数 + 工具来源）+ 一键回滚按钮
- **后端 API 新增**：`GET/PUT /api/coding/hooks-config`、`GET/PUT /api/coding/prompt-config`、`GET/PUT /api/coding/perm-config` 统一配置管理端点
- **System Prompt 动态加载**：`buildCodingSystemPrompt()` 从 kv_store 读取 `coding_prompt_append` 动态追加用户自定义指令
- **Hooks Config 运行时注入**：`coding_chat.go` 从 kv_store 读取 `coding_hooks_config` 注入 SDK runner 配置

### Coding View 稳定性修复（v2026-06 Phase 20）
- **会话切换流式进度保留**：`setActiveSession`/`setAppMode` 切换前检测正在流式的 `codingLiveBlocks`，自动合并为 assistant 消息保留进度，避免切换后聊天记录消失
- **DrawerPanel 弹窗布局修复**：从右侧 flex 分栏改为 `fixed` 全屏居中弹窗（dimmed backdrop + 960px + Escape + 最大化），解决文件预览/Diff 审查布局错乱
- **DrawerPanel 移除 codingView 限制**：弹窗模式在任何子视图下都可打开

### Coding View 移动端增强（v2026-06 Phase 21）
- **Agent 选择器**：ComposerV2 工具栏新增 Agent Picker 下拉菜单，支持从灵犀主模式智能体工厂选择任意智能体进行编程对话
- **移动端工作目录切换**：手机端顶栏项目名称可点击切换工作目录（DirectoryBrowserModal 浏览桌面端目录），侧边抽屉也增加项目目录切换入口
- **移动端发送/停止按钮优化**：增加最小宽度 + 移动端增大 padding + 右侧增加间距，不再贴边难按
- **移动端自动进入 Coding View**：非 Electron 环境（H5/手机端）窗口 < 768px 时自动 `appMode = 'coding'`，跳过模式选择页

### Coding View 三大修复（v2026-06 Phase 22）
- **防止子代理嵌套**：`sdk-runner.js` 自动从子代理 `tools` 中过滤 `Agent`/`Task` 并注入 `disallowedTools`，后端 `buildSDKAgents()` 双重保险
- **Agents 卡片右侧悬浮**：从消息流移出，改为 CodingShellV2 中 `fixed` 悬浮卡片（右侧中间，AnimatePresence 动画），仅有 sub-agents 时显示
- **Checkpoint Rollback 修复**：修正 API 调用（`rewindCheckpoint` → `rollbackCheckpoint`），成功后刷新消息
- **Checkpoint 文件展示**：新增 `GET /api/coding/checkpoint-files/:id` API，前端可展开查看关联文件列表 + 点击查看 git diff
- **PermissionDialog 增强**：工具摘要行（Bash 命令/文件路径 + Copy）、Deny with reason 模式、完整参数可折叠查看
- **权限管道确认完整**：permission_request/response stdin/stdout 双向通信 + AskUserQuestion 阻塞流程均已正确实现

### H5 公网远程访问（v2026-06 Phase 23）
- **云端 HTTP 隧道**：信令服务器新增 HTTP 反向代理能力，桌面端通过 WebSocket 注册隧道 token，手机端通过 `/tunnel/<token>/` 路径透明代理所有 HTTP 请求到桌面端
- **WebSocket 隧道代理**：信令服务器支持 WebSocket 升级请求的代理，手机端 WS 连接经信令服务器中转到桌面端本地 WS（实现流式对话等实时功能）
- **前端相对路径构建**：Vite `base: './'` + `TUNNEL_BASE` 动态检测，确保隧道模式下所有资源/API/WS 请求正确路由，桌面端零影响
- **隧道入口免 token 验证**：`lx_tunnel_` 前缀的隧道访问跳过 H5 令牌验证，直接游客登录进入
- **隧道配置持久化**：信令地址和 token 持久化到 kv_store，应用重启自动重新连接
- **灵犀主模式移动端适配**：AppShell 响应式布局 + 微信浏览器兼容 + 移动端侧边栏/智能体选择器
- **设置页云端隧道面板**：RemoteAccessPage 新增云端隧道区块（信令地址配置 + 连接/断开 + 隧道 URL + 二维码）

### 手机 App 配对认证（v2026-06 Phase 24）
- **PairTokenAuthMiddleware**：Gin 中间件，对非 localhost 请求强制 `X-Pair-Token` 认证，localhost 请求（Electron 桌面端 + h5_tunnel 本地代理）自动放行
- **路径豁免**：`/api/ping`、`/api/health`、`/api/pair/complete`、`/api/auth/guest` 等公开端点免认证
- **WS 一次性票据**：`POST /api/auth/ws-ticket` 生成 60 秒有效票据，避免 pair_token 泄漏到 WS URL 日志
- **配对 API**：PC 端 `POST /api/pair/initiate`（生成 challenge UUID + 6 位数字码 + QR 数据），手机端 `POST /api/pair/complete`（返回永久 pair_token）
- **设备管理**：列表/解绑/token 轮换/推送 token 注册/一键撤销全部
- **h5_access_tokens 表扩展**：新增 permanent/device_id/platform/device_name/push_token/last_seen_at 列，永久 token 跳过过期检查
- **配对挑战清理**：后台 goroutine 每 60 秒清理过期挑战，防止内存泄漏
- **WS 认证增强**：WsHandler 和 TerminalWsHandler 入口增加 `WsAuthCheck`，非 localhost 需 ticket 或 pair_token
- **CORS 更新**：`Access-Control-Allow-Headers` 增加 `X-Pair-Token`

### Flutter 手机端骨架（v2026-06 Phase 25）
- **Flutter 项目骨架**：`mobile-flutter/` 目录，Flutter 3.24+ / Dart 3.5+，Provider 状态管理
- **ApiClient**：HTTP 请求封装（自动注入 `X-Pair-Token`，401 统一处理，RESTful CRUD 方法）
- **WsClient**：WebSocket 客户端（one-time ticket 认证，自动重连，session 订阅/取消订阅，ping 保活）
- **ConnectionManager**：LAN/WAN 自动切换（优先 LAN 直连，回退 WAN 隧道代理，30s 心跳检测，SharedPreferences 持久化）
- **PairService**：QR 扫码配对 + 6 位码手动配对，支持 LAN 直连和 WAN 回退
- **PairScreen**：配对页面（QR 扫码 tab + 手动输码 tab，mobile_scanner 集成）
- **HomeScreen**：首页（会话列表 + 下拉刷新 + 智能体选择器 + 连接状态指示 + 左滑删除）
- **ChatScreen**：对话页面（WS 流式消息集成 + Markdown 渲染 + 思考块折叠 + 图片粘贴/拍照 + 发送/中止按钮 + sticky-to-bottom 滚动）
- **SettingsScreen**：设置页（LAN/WAN 连接状态 + 智能体列表 + 解除配对 + 重连）
- **MessageBubble**：消息气泡（flutter_markdown 渲染 + 代码高亮 + 图片缩略图 + 复制按钮）
- **ThinkingIndicator**：思考中指示器（折叠/展开思考内容）
- **数据模型**：Session / Message / LiveBlock / Agent，对齐后端 JSON 格式
- **Android 网络安全配置**：`network_security_config.xml` 允许 192.168/10.0/172.16 局域网明文 HTTP

### 推送通知（v2026-06 Phase 26）
- **信令服务器 /push 端点**：接收 PC 端推送请求，通过 FCM Legacy HTTP API 发送到手机端（PUSH_SECRET 鉴权）
- **后端推送集成**：AI 回复完成后异步检测已配对设备的 push_token，通过信令服务器中转 FCM 推送
- **推送配置 API**：`GET/PUT /api/push/config` + `POST /api/push/test`，kv_store 持久化
- **前端推送配置 UI**：RemoteAccessPage 新增"推送通知"折叠面板
- **Flutter FCM 集成**：firebase_messaging + flutter_local_notifications，前台/后台/冷启动通知
- **Flutter push token 注册**：配对成功和应用恢复时自动注册，token 刷新时自动更新
- **通知点击跳转**：携带 session_id，跳转到对应对话页面

### Flutter 手机端 Chat 增强（v2026-06 Phase 27）
- **代码块语法高亮**：`CodeBlockWidget`（flutter_highlight + github/atom-one-dark 主题 + 语言标签 + 复制按钮 + 横向滚动）
- **工具调用卡片**：`ToolCard`（颜色编码：文件操作=蓝色/编辑=紫色/终端=绿色/搜索=橙色 + 折叠展开详情 + 耗时显示 + running 状态动画）
- **工具组聚合**：`ToolGroupCard`（连续同类型工具自动聚合为折叠组，如 "Read ×5" + 总耗时）
- **思考过程折叠块**：`ThinkingBlock`（折叠/展开 + 预览文字 + 紫色主题 + live 模式呼吸脉冲动画）
- **RAG 引用脚注**：`CitationFooter`（引用来源列表 + 编号标记 + 折叠展开 + 标题/摘要预览）
- **WS 事件块级处理**：`_handleWsEvent` 重写为块级架构（tool_start/tool_end/thinking_delta/thinking_done/text/stream_delta），AppState 维护 `List<LiveBlock>` 实时状态
- **流式渲染增强**：ChatScreen `_buildLiveBlocks` 实时渲染思考块/工具卡片/Markdown 文本，工具组自动聚合
- **消息气泡多块渲染**：`MessageBubble` 支持 `Message.blocks` 结构化块列表，AI 消息分层渲染（思考→工具→正文）
- **消息反馈**：thumbs up/down 按钮（持久化到后端 + 选中高亮 + 取消反馈切换）
- **AppState 块级流式**：流式状态从 `streamingText/thinkingText` 升级为 `List<LiveBlock>` 块列表，done 事件自动合并为 Message
- **API 扩展**：新增 `setMessageFeedback`/`toggleMessagePin`/`searchMessages` 方法
- **流式状态栏增强**：AppBar 显示详细状态（思考中/执行工具名/回复中）
- **消息编辑/重发**：长按用户消息弹出编辑对话框，保存后自动删除后续消息并重发
- **消息固定 Pin**：消息操作栏 Pin 按钮，已固定消息显示金色图钉标记
- **APK 构建验证**：Flutter 3.27.4 + Android SDK 34 构建通过，Release APK 71.2MB

### Flutter 手机端视觉重做（v2026-06 Phase 28）
- **Design Tokens 体系**：`app_colors.dart`（品牌色/语义色/工具色/渐变/暗色映射）+ `app_dimens.dart`（圆角/间距/字号/头像统一定义）+ `app_theme.dart`（Light/Dark 双主题工厂）
- **Widgets 全面重写**：message_bubble（蓝紫用户/浅灰蓝 AI 气泡）、thinking_block（金色折叠 chip）、tool_card（6 色降饱和编码+聚合组）、citation_block（引用块蓝色折叠）
- **新增 Widgets**：streaming_cursor（金色闪烁竖条）、skeleton_loader（shimmer 骨架屏）、recommendation_chips（后续问题胶囊）
- **ChatScreen 重做**：胶囊浮起 Composer + 红色停止按钮 + 流式渲染 + 精致空状态欢迎页
- **HomeScreen 重做**：智能体 Chip 选择器 + 连接状态 Dot + 会话卡片化 + 滑动删除 + NavigationBar
- **PairScreen 重做**：渐变 Hero 背景 + 胶囊 Tab 切换
- **SettingsScreen 重做**：分组卡片 + 连接信息 + 设备管理

### 飞书机器人流式卡片消息（v2026-06 Phase 29）
- **StreamReplyFunc 接口扩展**：`IMMessage` 新增可选 `StreamReplyFunc func(chunk, done)` 支持流式回复
- **飞书流式卡片 API 封装**：`feishu_streaming.go` 实现创建卡片→发送→定期批量追加→完成的完整生命周期
- **RunClaudeStreaming**：`handler/chat.go` 新增流式 LLM 调用函数，text_delta 实时回调
- **Dispatcher 流式路径**：检测 StreamReplyFunc 走流式路径，流式模式不发"收到"确认
- **FeishuConfig 扩展**：`streaming_enabled` / `streaming_card_title` / `streaming_flush_ms` 配置项
- **向后兼容**：默认不启用，钉钉/企微保持原有同步路径，流式失败 fallback 错误提示
- **平台扩展预留**：`ClaudeStreamRunner` 接口 + `SetClaudeStreamRunner` 注入点

### WS 稳定性 + 后端自动化测试（v2026-06 Phase 30）
- **后端 WS Ping/Pong 保活**：`ws_hub.go` WsHandler 新增 `wsPingInterval=20s` + `wsPongTimeout=40s`，定时发送 Ping 帧保持移动网络 NAT 映射，Pong handler 重置读取超时，超时未收到 Pong 自动断开死连接
- **Flutter 心跳加强**：客户端 ping 从 25s 缩短到 15s，且无论 `_subscribedSessions` 是否为空都发送保活消息（`{type:'ping', sessionId:0}`），避免空闲连接被 NAT 静默断开
- **后端接口自动化测试 58 用例**：`ws_hub_test.go`（12 个 WS Hub 测试）+ `pair_auth_test.go`（5 个认证测试）+ `api_integration_test.go`（21 个核心 API 测试）+ `api_extended_test.go`（20 个扩展 API 测试），覆盖 WS/认证/Sessions/Messages/Agents/Memories/Knowledge/Skills/FileBrowser/ScheduledTasks/Chat/Health，使用独立临时 SQLite 数据库
- **WS 认证简化**：`WsAuthCheck` 新增 `pair_token` query 参数直接认证（优先级最高），手机端 WS URL 直接拼 `?pair_token=xxx` 一步连接；移除 Flutter `getWsTicket()` 调用和 `ApiClient` 依赖；旧 ticket 方式保留为兼容回退

### Flutter 手机端全面重构（v2026-06 Phase 31）
- **飞书流式消息修复**：`feishu_streaming.go` 新增 `frozenThinking`/`frozenTool` 字段，确保每次 PUT content 为前缀扩展，解决飞书 IM "重复说话"问题
- **移动端 ask_question 支持**：`LiveBlock` 模型扩展 ask_question 字段，新增 `AskQuestionCard` Widget，ChatScreen 实时渲染交互卡片
- **消息消失修复**：`done` 事件延迟 1.5s 后 `loadMessages`，解决后端持久化竞态导致消息闪失
- **5 Tab 底部导航**：HomeScreen 重构为 `BottomNavigationBar` + `IndexedStack`（对话/智能体/发现/我的/设置），animated 底部指示器
- **全局消息搜索**：新增 `SearchMessagesScreen`（防抖搜索 + API 调用 + 结果卡片 + 点击跳转会话）
- **TTS 朗读**：集成 `flutter_tts`，消息长按菜单增加"朗读"选项
- **多文件上传**：`file_picker` 集成，附件 strip 预览 + 移除 + 多文件发送
- **消息重生成**：长按消息菜单增加"重生成"，自动定位前一条用户消息并重发
- **智能体详情页**：新增 `AgentDetailScreen`（Hero header + 描述 + 参数 + 开始对话），AgentsTab 点击跳转详情
- **技能市场页**：新增 `SkillListScreen`（搜索 + 已安装标记 + 列表卡片）
- **知识库页**：新增 `KnowledgeListScreen`（语义搜索 + 分类颜色 + 相关度展示）
- **发现页增强**：DiscoverTab 新增技能市场/知识库/定时任务/MCP 四宫格入口 + 热门智能体横向滚动 + 使用技巧推荐卡片
- **用量统计页**：新增 `UsageScreen`（时段筛选 + 总费用 Hero 卡片 + token/请求数统计 + 消费记录列表）
- **长期记忆管理**：新增 `MemoryScreen`（记忆列表 + 添加/删除 + 分类标签 + 时间显示）
- **我的页功能化**：MineTab 菜单项跳转到用量统计/长期记忆等子页面
- **首次启动引导**：新增 `OnboardingScreen`（3 页滑动引导 + 渐变背景 + 进度指示器 + 跳过/下一步/开始使用）
- **SharedPreferences 持久化**：`onboarding_done` 标记，首次启动显示引导，之后不再显示
- **Accessibility 增强**：会话卡片增加 Semantics 标签，底部导航指示器动画化
- **图片缓存**：集成 `cached_network_image` 依赖
- **Android SDK 升级**：minSdkVersion 24 + compileSdk 36 + Kotlin 2.1.0
- **Release APK 构建验证**：76.9MB，构建通过

### Flutter 手机端 ask_question 交互修复（v2026-06 Phase 32）
- **完全对齐 PC 端交互逻辑**：重写 `ask_question_card.dart`，新增 `ChoiceCard`/`InputCard`/`PendingInteractivePlaceholder`，与 PC 端 `SingleChoiceBlock`/`SingleInputBlock`/`PendingInteractivePlaceholder` 一一对应
- **选择/输入后发送普通消息**：`ChoiceCard` 格式化为 `[选择结果]`、`InputCard` 格式化为 `[信息回复]` 通过 `sendMessage` 发送（与 PC 端完全一致），不再使用特殊 API
- **本地 submitted 状态**：交互卡片已提交状态由组件内部管理，历史消息重新加载后卡片恢复可交互（与 PC 端一致）
- **流式占位符**：流式阶段检测到 choice/input JSON 显示"正在生成交互选项..."占位符，流式结束后变为可交互卡片
- **splitInteractiveBlocks 解析器**：`message_bubble.dart` 新增 Dart 版交互块解析器，支持 ` ```json ` 围栏和裸 JSON 花括号配对
- **三层渲染覆盖**：MessageBubble（历史消息 text 块）+ ChatScreen（流式 text 块）+ WS ask_question 事件，确保 choice/input JSON 在任何场景下都正确渲染为交互 UI

### 纯 Go 协议转换代理（v2026-05 Phase 3）
- **替代 LiteLLM Bridge**：`backend-desktop/proxy/` 纯 Go 实现，启动零延迟、无 Python 依赖
- **完整协议转换**：Anthropic `/v1/messages` ↔ OpenAI `/v1/chat/completions`（流式 + 非流式 + Tool use + 思考链 + 多模态）
- **router/ccr.go 重写**：移除 Python 子进程管理，改用 proxy.Server 内置 HTTP 服务
