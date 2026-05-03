# CLAUDE.md — 灵犀 AI Agent 项目指南

本文件为 AI 助手（Claude / Cursor / Copilot 等）提供项目上下文，帮助快速理解系统全貌并高效开发。

---

## 项目简介

**灵犀 AI Agent** 是一个本地优先的桌面 AI Agent 工作台，采用 Electron + React + Go 三层架构。支持多模型接入、智能体工厂、技能管理、知识库、MCP 工具、IM 集成等能力。

---

## 技术栈

### 前端 `frontend-desktop/`
- **React 19** + **Vite 8**（构建需 Node.js ≥ 20.19 或 ≥ 22.12）
- **Tailwind CSS 3.4** — 全局样式，6 套主题通过 CSS 变量切换
- **Zustand 5** — 全局状态管理（`src/state/useStore.js`）
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
│   ├── db/                   # SQLite 数据层
│   │   ├── db.go             # 表定义、CRUD
│   │   └── mcp_agent.go      # MCP-Agent 关联
│   ├── handler/              # HTTP Handlers
│   │   ├── agent.go          # 智能体 CRUD
│   │   ├── chat.go           # 对话 + WebSocket 流式
│   │   ├── knowledge.go      # 知识库（支持 .md/.txt/.csv/.json/.pdf/.docx）
│   │   ├── session.go        # 会话管理 + 消息搜索
│   │   ├── provider.go       # 模型接入点
│   │   ├── skill.go          # 技能管理
│   │   ├── mcp.go            # MCP 服务管理
│   │   ├── usage.go          # 用量统计
│   │   ├── im_connector.go   # IM 连接器
│   │   ├── scheduled.go      # 定时任务 CRUD
│   │   └── ws_hub.go         # WebSocket Hub
│   ├── connector/            # IM 平台对接（企微/钉钉/飞书）
│   ├── model/                # 数据模型
│   ├── router/               # AI 引擎路由（CCR）
│   ├── scheduler/            # 定时任务调度器
│   └── usage/                # 用量计算 + 定价
│
├── frontend-desktop/         # React 前端
│   ├── src/
│   │   ├── main.jsx          # 入口
│   │   ├── index.css         # Tailwind + 主题 CSS 变量
│   │   ├── api/client.js     # fetch 封装
│   │   ├── state/useStore.js # Zustand store
│   │   ├── ui/               # 通用 UI
│   │   │   ├── AppShell.jsx  # 主布局（侧边栏+主区域+AnimatePresence）
│   │   │   ├── primitives.jsx # 原子组件（Button/Card/Modal/Badge/Input...）
│   │   │   ├── cn.js         # clsx + tailwind-merge
│   │   │   ├── SidebarSessions.jsx  # 会话列表（重命名/删除）
│   │   │   ├── ModelSwitcher.jsx
│   │   │   └── RouterPill.jsx
│   │   ├── chat/             # 对话模块
│   │   │   ├── ChatView.jsx  # 对话主页面
│   │   │   ├── Composer.jsx  # 输入框 + 斜杠命令 + 图片粘贴
│   │   │   ├── MessageList.jsx # 消息列表 + 虚拟滚动
│   │   │   ├── Bubble.jsx    # 消息气泡 + 复制按钮
│   │   │   ├── blocks.jsx    # 文本块/思考块/工具块渲染
│   │   │   ├── SearchModal.jsx # Cmd+K 全文搜索
│   │   │   └── AgentPicker.jsx
│   │   ├── settings/         # 设置页
│   │   │   ├── SettingsPage.jsx
│   │   │   ├── ProfilesPage.jsx   # 接入点管理
│   │   │   ├── AppearancePage.jsx  # 6 套主题
│   │   │   └── UsagePage.jsx       # 用量 + 预算预警
│   │   ├── AgentFactoryPage.jsx    # 智能体工厂 + 模板市场
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
├── electron/                 # Electron 主进程
│   ├── main.js               # 窗口管理、子进程启动
│   ├── preload.js            # IPC Bridge
│   ├── package.json          # electron-builder 配置
│   ├── assets/               # 图标、entitlements
│   └── resources/            # 构建时填充的运行时资源
│       ├── ai-engine/        # Claude CLI
│       ├── bridge/           # llm-bridge (JS)
│       ├── litellm-bridge/   # LiteLLM Bridge (Python)
│       └── node-bin/         # 内嵌 Node.js
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

### 打包 & 安装

```bash
# 0. 确保 Node.js 版本足够
export PATH="/tmp/node22/bin:$PATH"  # 若系统 node < 20.19

# 1. 退出现有程序
pkill -x "灵犀" 2>/dev/null; sleep 1

# 2. 一键构建（支持 mac / win / all）
./build-desktop.sh          # 默认 macOS
./build-desktop.sh win      # Windows（交叉编译）
./build-desktop.sh all      # 同时构建两个平台

# 3. 覆盖安装（macOS）
rm -rf "/Applications/灵犀.app"
cp -R "dist-electron/mac-arm64/灵犀.app" "/Applications/灵犀.app"
xattr -cr "/Applications/灵犀.app"
open "/Applications/灵犀.app"
```

---

## 开发约定

### 必须遵守

1. **不允许开启子代理** — 所有开发任务在当前会话中直接完成
2. **每次开发完成后** 必须执行：
   - 打包 & 覆盖安装（流程见上方）
   - 更新 `.cursor/rules/lingxi-agent.mdc`（如有架构/规范变更）
   - 更新 `CLAUDE.md`（如有新模块/技术栈/流程变更）
   - 更新 `README.md`（如有用户可见的新功能/快捷键/配置）
3. **前端样式只用 Tailwind CSS + CSS 变量**，不写独立 CSS 文件
4. **组件必须使用 primitives.jsx 中的原子组件**（Button/Card/Modal 等）
5. **图标只用 lucide-react**
6. **状态管理只用 Zustand**（`useStore`）
7. **className 合并使用 `cn()` 函数**

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
| GET | /api/sessions | ListSessions | 会话列表 |
| POST | /api/sessions | CreateSession | 创建会话 |
| PUT | /api/sessions/:id | UpdateSession | 更新会话（重命名） |
| DELETE | /api/sessions/:id | DeleteSession | 删除会话 |
| GET | /api/sessions/:id/messages | ListMessages | 消息列表 |
| GET | /api/messages/search | SearchMessages | 消息全文搜索 |
| PUT | /api/messages/:id | UpdateMessage | 编辑用户消息（+删除后续） |
| POST | /api/messages/:id/feedback | SetMessageFeedback | 消息反馈（up/down） |
| POST | /api/chat | Chat | 发起对话 |
| GET | /ws | WebSocket | 流式对话 |
| GET/POST/PUT/DELETE | /api/agents/* | Agent CRUD | 智能体管理 |
| GET/POST/DELETE | /api/knowledge/* | Knowledge CRUD | 知识库管理 |
| GET | /api/knowledge/:id/preview | PreviewKnowledge | 知识库预览 |
| GET/POST/PUT/DELETE | /api/profiles/* | Profile CRUD | 接入点管理 |
| GET/POST/PUT/DELETE | /api/skills/* | Skill CRUD | 技能管理 |
| GET/POST/PUT/DELETE | /api/mcp-servers/* | MCP CRUD | MCP 管理 |
| GET/POST/PUT/DELETE | /api/im-connectors/* | IM CRUD | IM 连接器管理 |
| GET | /api/usage/* | Usage Query | 用量查询 |
| GET | /api/skills/:id/content | GetSkillContent | 技能文件内容 |
| PUT | /api/skills/:id/content | UpdateSkillContent | 更新技能文件 |
| GET | /api/skills/:id/export | ExportSkill | 导出技能 ZIP |
| GET | /api/skills/marketplace | MarketplaceSearch | Smithery 市场搜索 |
| POST | /api/skills/marketplace/install | MarketplaceInstall | 安装市场技能 |
| GET | /api/router/status | RouterStatus | 路由状态 |
| GET | /api/scheduled-tasks | ListScheduledTasks | 定时任务列表 |
| POST | /api/scheduled-tasks | CreateScheduledTask | 创建定时任务 |
| PUT | /api/scheduled-tasks/:id | UpdateScheduledTask | 更新定时任务 |
| DELETE | /api/scheduled-tasks/:id | DeleteScheduledTask | 删除定时任务 |
| POST | /api/scheduled-tasks/:id/toggle | ToggleScheduledTask | 启用/禁用 |
| POST | /api/scheduled-tasks/:id/run | TriggerScheduledTask | 手动触发 |
| GET | /api/scheduled-tasks/:id/runs | ListScheduledTaskRuns | 执行记录 |

---

## 数据存储

- **SQLite 数据库**: `~/Library/Application Support/灵犀/smart-agent.db`
- **知识库文件**: `~/Library/Application Support/灵犀/knowledge/`（按 docs/qa/data 分类）
- **上传图片**: `~/Library/Application Support/灵犀/uploads/`
- **AI 引擎 HOME**: `~/Library/Application Support/灵犀/ai-home/`
- **Bridge 数据**: `~/Library/Application Support/灵犀/bridge-home/`

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

### 智能体
- 智能体工厂（创建/编辑/删除）
- **四步引导式创建向导（身份/角色/能力/预览）**
- **支持 temperature、max_tokens 参数调整**
- 模板市场（4 类 17 个模板：商业办公/技术开发/内容创意/生活效率）
- 智能体绑定模型/技能/MCP/知识库

### 技能管理
- **Smithery.ai 技能市场集成（搜索/安装/同步）**
- **在线查看/编辑技能文件（SKILL.md + 脚本）**
- **技能导出为 ZIP 包**
- AI 生成技能 / ZIP 上传导入

### 知识库
- 支持 .md/.txt/.csv/.tsv/.json/.pdf/.docx 格式
- 分类管理（文档/问答/数据）
- 拖拽批量上传
- 内容预览

### UI/UX
- 6 套主题（light/dark/midnight/cyber/aurora/cosmos）
- AnimatePresence 页面切换动画
- 会话重命名（双击编辑）
- Modal 化删除确认
- **费用估算（非官方 API 本地定价表兜底，标注"~"估算标记）**
- 用量统计 + 预算预警
- **交互式向导流（Wizard Flow）：多选择题逐一展示，支持前后翻页、进度指示、汇总确认后才继续对话**
- **两阶段规划模式：用户决定是否进入规划模式，进入后沉浸式多维度选择面板，全部确认后再执行**
- **精致化 UI 细节：气泡圆角/阴影/hover 微交互、超薄滚动条、三点波浪连接动画、增强版空状态页**

### 定时任务
- **周期性自动执行 Agent 任务（每 N 分钟/小时/每天/每周/每月/自定义 Cron）**
- **有状态/无状态模式（有状态保持同一会话，Agent 可记忆上次执行内容）**
- **执行完成桌面通知**
- **执行记录查看 + 跳转到对应会话**
- **手动触发执行**

### 平台能力
- 多模型多供应商接入
- MCP 工具管理（stdio/SSE/HTTP）
- IM 集成（企业微信/钉钉/飞书）
- **Windows 构建支持（NSIS 安装包 + Portable）**
- **OpenAI 兼容模型技能识别增强（自动注入已安装技能清单到 system prompt）**
- **防死循环保护（禁止调用 Cursor 专有工具，避免 tool_use 循环）**
