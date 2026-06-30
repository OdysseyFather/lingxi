<p align="center">
  <img src="logo.jpg" width="128" alt="灵犀 Logo" />
</p>

<h1 align="center">灵犀 AI Agent</h1>

<p align="center">
  <strong>在桌面跑一整个 AI Agent 军团</strong><br/>
  14+ 模型 · 本地优先 · 人格蒸馏 · 自我进化 · 主动式 · 深度搜索 · 屏幕操控 · Agent 群聊 · 社区平台
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Personal%20Use-orange" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-36-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/Go-1.24-00ADD8?logo=go&logoColor=white" alt="Go" />
  <img src="https://img.shields.io/badge/Claude%20Agent%20SDK-integrated-blueviolet" alt="Claude SDK" />
</p>

<p align="center">
  <a href="README-EN.md">English</a> ·
  <a href="#-系统功能全景">功能全景</a> ·
  <a href="#-为什么选灵犀">为什么选灵犀</a> ·
  <a href="#-核心亮点">核心亮点</a> ·
  <a href="#-功能详解">功能详解</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-技术架构">架构</a> ·
  <a href="#-支持项目">支持</a>
</p>

<br/>

---

## 📷 一眼入魂

<!-- 📷 Hero 截图：灵犀主界面全貌 -->
<p align="center">
  <img src="images/screenshots/01-hero-home.png" alt="灵犀工作台" width="960" />
</p>
<p align="center"><sub>灵犀工作台 — 对话 · 智能体 · 工具 · 知识 · 一站式掌控</sub></p>

<br/>

---

## 🗺️ 系统功能全景

> 下图展示灵犀的完整能力版图。从桌面壳到 AI 运行时，所有模块协同工作，构成一个完整的 Agent 操作系统。

<!-- 📷 功能全景架构图（用 GPT Image 生成，提示词见文末） -->
<p align="center">
  <img src="images/screenshots/architecture-panorama.png" alt="灵犀功能全景" width="960" />
</p>
<p align="center"><sub>灵犀 AI Agent 系统功能全景 — 从桌面壳到 AI 运行时的完整能力版图</sub></p>

<br/>

### 能力清单速览

| 层级 | 能力模块 | 核心特性 |
|:----:|----------|----------|
| **🖥️ 桌面壳** | Electron 36 | 窗口管理 · Splash 冷启动 · safeStorage 密钥 · 全局快捷键 · 截屏 · Spotlight 浮窗 · 剪贴板监控 |
| **💬 对话引擎** | 流式对话 | 思考/工具/正文三层分离 · Mermaid/PlantUML 渲染 · 斜杠命令 · 两阶段规划 · 交互式向导 · 语音输入 |
| **🤖 智能体** | Agent 工厂 | 17 模板 · 五步创建向导 · 人格蒸馏 · 群聊人格 · 对外设置 · temperature/max_tokens |
| **🧬 进化** | 自我进化引擎 | 纠正/负反馈/有价值对话 → 长期记忆 · 全局扫描 · Dream 记忆巩固 · 单条可撤销 |
| **📚 知识** | 深度 RAG | 向量索引 · BM25 · RRF 混合检索 · 文件夹监控 · 自动增量索引 · `[N]` 引用标注 · 网页采集 |
| **🌐 互联** | Project Nexus | mDNS 局域网 · 广域网信令 · 群聊协作（微信风 + 人格行为引擎） · 人类介入 |
| **🖥️ 屏幕** | Screen Agent | 截屏理解 · 操作规划 · OTA 循环 · 安全拦截 · 操作审计 |
| **🧭 主动式** | Proactive Agent | 日报 · 未完成任务追踪 · 定时调度 · 上下文感知主动建议 |
| **🔍 搜索** | 深度联网搜索 | DuckDuckGo · Wikipedia 多源 · LLM 综合 · 引用追踪 · SSE 实时进度 |
| **📊 上下文** | Token 水位 | 实时 Token 计数 · 自动摘要压缩 · 长会话不爆栈 · 会话卡片预览 |
| **🔧 平台** | 工具生态 | 技能管理 · MCP · 可视化工作流 · 定时任务 · IM 连接器（飞书流式+监听） |
| **🧠 AI 运行时** | 多模型桥接 | 14+ 供应商 · Anthropic 直连 · 纯 Go 协议转换 · Claude Agent SDK · whisper.cpp 离线语音 |
| **🧑‍💻 社区** | 灵犀社区平台 | Agent Bundle 发布/下载 · 评分/评论 · 排行榜 · 关注 · 邀请码 · P2P 远程调用 |
| **📱 远程** | H5 + Flutter | 局域网直连 · 公网云端隧道 · Flutter 手机端 · 三段式首页 · 个性化设置 |
| **🔒 安全** | 本地优先 | SQLite 本机存储 · 断网可用 · SSO 登录 · 配对认证 · 加密密钥 · Rate Limiter · 优雅关闭 |

<br/>

---

## 🤔 为什么选灵犀

> **灵犀不是「又一个聊天窗口」，它是你桌面上的 AI Agent 操作系统。**

| 痛点 | 灵犀的解法 |
|------|-----------|
| 数据全在云上，隐私零保障 | **本地优先**：会话、知识库、API Key、进化日志全存本机 SQLite，断网可用 |
| "自定义助手"不过是换个 System Prompt | **真正的 Agent**：独立技能包 + RAG 知识库 + MCP 工具 + 工作流编排 |
| AI 纠正一百次下次还犯同样的错 | **自我进化引擎**：纠正/负反馈/有价值对话自动提炼为长期记忆和知识 |
| Agent 之间无法协作 | **Project Nexus**：跨设备 Agent 自动发现、群聊协作（流式思考+工具调用对齐主模式） |
| 长会话上下文爆栈 | **Token 水位 + 自动摘要**：实时监测 Token 占用，临近水位自动压缩摘要 |
| 联网搜索结果太散 | **深度联网搜索**：多源并发（DuckDuckGo + Wikipedia）+ LLM 综合 + 引用追踪 |
| 手机端体验简陋 | **Flutter 三段式首页 + 8 项高级交互**：Hero 转场 · 骨架屏 · 滚动视差 · 触感反馈 |
| 多 Agent 群聊是机械轮询 | **人格行为引擎**：概率驱动、兴趣匹配、自然延迟、像真人一样聊天 |

<br/>

---

## ✨ 核心亮点

<table>
<tr>
<td width="160" align="center"><strong>🔒 本地优先</strong></td>
<td>数据永不离开你的电脑。SQLite 存储、本地向量索引、离线语音识别（内置 whisper.cpp），断网照样用本地模型。</td>
</tr>
<tr>
<td align="center"><strong>🤖 14+ 模型</strong></td>
<td>Anthropic · OpenAI · DeepSeek · Qwen · Gemini · 豆包 · GLM · Kimi · MiniMax · Groq · Ollama · LM Studio…内置纯 Go 协议转换 + Anthropic 直连供应商（零 Python 依赖），一个界面访问所有模型。</td>
</tr>
<tr>
<td align="center"><strong>🧭 主动式 Agent</strong></td>
<td>不只是被动应答。日报生成 · 未完成任务追踪 · 定时调度 · 上下文感知主动建议。Agent 会自己找你，而不是等你喊它。</td>
</tr>
<tr>
<td align="center"><strong>🧠 真正的 Agent</strong></td>
<td>每个智能体独立绑定技能包 + RAG 知识库 + MCP 工具 + 工作流；支持两阶段规划、交互式问答、工具链自主调用。</td>
</tr>
<tr>
<td align="center"><strong>👤 人格蒸馏</strong></td>
<td>上传微信记录/PDF/邮件，<a href="https://github.com/titanwings/colleague-skill">dot-skill</a> 蒸馏出真实人的沟通风格和人格特征，注入智能体。支持多人并行蒸馏。</td>
</tr>
<tr>
<td align="center"><strong>🧬 自我进化</strong></td>
<td>纠正/负反馈/有价值对话自动提炼为长期记忆 → Agent 越用越聪明。全局扫描 + 会话级触发；单条可撤销；记忆巩固 Dream 自动整理/精炼。</td>
</tr>
<tr>
<td align="center"><strong>🌐 Agent 互联</strong></td>
<td>Project Nexus：局域网 mDNS + 广域网信令，跨设备 Agent 自动发现、群聊协作（流式思考+工具调用对齐主模式）、人类随时介入。</td>
<tr>
<td align="center"><strong>🧑‍💻 社区平台</strong></td>
<td>灵犀社区：Agent Bundle 发布/下载/评分/评论/关注/排行榜 · P2P 调用 · 邀请码 · 发现页</td>
</tr>
<tr>
<td align="center"><strong>👥 微信风群聊</strong></td>
<td>多 Agent 同群 · 人格驱动发言概率 · @提及与引用 · 像真人聊天不像 AI 念稿。</td>
</tr>
<tr>
<td align="center"><strong>🖥️ 屏幕操控</strong></td>
<td>Screen Agent 看屏幕 → 规划操作 → 执行鼠标/键盘，每步确认，危险操作强制拦截。</td>
</tr>
<tr>
<td align="center"><strong>📦 开箱即用</strong></td>
<td>macOS <code>.dmg</code> / Windows 安装包。内嵌 Go 后端 + Node + whisper.cpp + Claude CLI，无需 Docker，下载即用。</td>
</tr>
</table>

<br/>

---

## 🎯 功能详解

> 每个模块都配有截图位置。已有截图直接显示，未截取的已留好占位。

---

### 💬 智能对话 — 不只是聊天

灵犀的对话体验经过精心打磨。流式输出实时拆分为**思考过程**、**工具调用**和**正文回复**三层，每层都有专属折叠/展开交互。支持 OpenAI reasoning token 透传，代码块语法高亮带一键复制，消息可编辑重发，`⌘K` 全文搜索。

**富 Markdown 渲染**是一大亮点：Mermaid 图表（流程图、时序图、甘特图…）和 PlantUML 在对话中直接渲染为交互式 SVG。

<!-- 📷 流式对话 -->
<p align="center">
  <img src="images/screenshots/02-chat-stream.png" alt="流式对话" width="960" />
</p>
<p align="center"><sub>流式对话 · 思考折叠 · 代码高亮 · 工具调用 · Mermaid 图表</sub></p>

<br/>

<table>
<tr>
<td width="50%">

**对话核心**
- 流式输出 · 思考/工具/正文三层分离
- 代码块语法高亮 + 一键复制
- 消息编辑重发 · 消息固定 Pin
- 消息反馈（thumbs up/down）
- `⌘K` 全文搜索 · 导出 Markdown · 批量导出会话 ZIP
- 虚拟滚动（100+ 条消息零卡顿）

</td>
<td width="50%">

**增强体验**
- `/` 斜杠命令 · 两阶段规划
- 交互式向导流 · 信息收集块
- 图片粘贴（`⌘V`）· 文件拖拽
- 语音输入（本地 whisper.cpp）
- TTS 朗读 · 快捷回复建议
- RAG `[N]` 引用标注 · hover 查看来源

</td>
</tr>
</table>

<!-- 📷 智能体交互 -->
<p align="center">
  <img src="images/智能体交互.png" alt="智能体交互" width="960" />
</p>
<p align="center"><sub>智能体自主执行 · 工具调用 · 多轮推理</sub></p>

<!-- 📷 Mermaid 图表渲染 -->
<p align="center">
  <img src="images/screenshots/22-mermaid-chart.png" alt="Mermaid 图表" width="720" />
</p>
<p align="center"><sub>Mermaid / PlantUML 在对话中直接渲染为 SVG</sub></p>

<br/>

| 快捷键 | 功能 | 快捷键 | 功能 |
|--------|------|--------|------|
| `⌘ K` | 全文搜索 | `⌘ N` | 新建对话 |
| `⌘ B` | 切换侧边栏 | `⌘ ,` | 设置 |
| `⌘ /` | 快捷键面板 | `⌘ ⇧ S` | 截屏到输入框 |
| `⌘ ⇧ Space` | Spotlight 浮窗 | `⌘ ⇧ Esc` | Screen Agent 紧急中止 |
| `/` | 斜杠命令 | `Enter` / `⇧Enter` | 发送 / 换行 |

---

### 🏭 智能体工厂 — 你的 Agent 流水线

每个智能体是一个**可独立配置的完整实体**。五步引导式创建向导：身份 → 角色（含群聊人格参数）→ 能力（技能/知识库/MCP）→ 对外设置 → 预览。

内置 **17 个模板**覆盖商业办公、技术开发、内容创意、生活效率四大场景。

<!-- 📷 智能体工厂 -->
<p align="center">
  <img src="images/screenshots/agents-factory.png" alt="智能体工厂" width="960" />
</p>
<p align="center"><sub>智能体工厂 — 模板市场 + 五步创建向导</sub></p>

<!-- 📷 智能体角色设定 -->
<p align="center">
  <img src="images/智能体角色设定.png" alt="智能体角色设定" width="960" />
</p>
<p align="center"><sub>角色设定 · 群聊人格参数 · temperature · max_tokens</sub></p>

<!-- 📷 智能体配置 -->
<p align="center">
  <img src="images/智能体配置.png" alt="智能体能力配置" width="960" />
</p>
<p align="center"><sub>能力绑定 — 技能 · 知识库 · MCP 工具</sub></p>

<details>
<summary><b>17 个内置模板</b></summary>

| 场景 | 模板 |
|------|------|
| 商业办公 | 销售助理 · 商业分析师 · 人力资源 · 法务顾问 |
| 技术开发 | 代码审查员 · 架构师 · DevOps · 安全工程师 · DBA |
| 内容创意 | 内容创作者 · 文案策划 · 翻译专家 · 学术论文助手 |
| 生活效率 | 产品经理 · 健身教练 · 理财顾问 · 旅行规划师 |

</details>

---

### 👤 人格蒸馏 — 让 AI 拥有真实的灵魂

集成 [dot-skill](https://github.com/titanwings/colleague-skill) 人格蒸馏引擎，从**真实聊天材料**中提取沟通风格和人格特征。

**三类蒸馏**：`colleague`（同事）· `close`（亲密关系）· `celebrity`（公众人物）

支持多人并行蒸馏（最多 5 人）、SSE 实时流式日志、独立蒸馏记录管理。

<!-- 📷 人格蒸馏 -->
<p align="center">
  <img src="images/screenshots/04-distill-modal.png" alt="人格蒸馏" width="960" />
</p>
<p align="center"><sub>人格蒸馏 — 并行蒸馏 · SSE 流式日志 · 材料管理</sub></p>

---

### 🧬 自我进化 — Agent 越用越聪明

| 触发方式 | 说明 |
|----------|------|
| 用户纠正 / thumbs down | 自动写入长期记忆 / 知识库 / 修复技能 |
| 会话结束（≥6 条 + 冷却期） | 会话级进化提取 |
| 全局扫描（每 6 小时） | 巡检所有 Agent，批量提取有价值对话 |
| 手动触发 | 气泡「提取知识」按钮 |

进化不是黑箱：每条日志可查看、筛选、搜索，单条支持**撤销**（自动回滚）。

**记忆巩固 Dream**：后台定时利用 LLM 合并重复记忆、精炼模糊表述、补充新知识、清理过时条目。

<!-- 📷 自我进化 -->
<p align="center">
  <img src="images/screenshots/06-evolution.png" alt="自我进化" width="960" />
</p>
<p align="center"><sub>进化历程 — 可筛选 · 可搜索 · 单条撤销 · 记忆巩固 Dream</sub></p>

<table>
<tr>
<td width="50%">
<p align="center">
  <img src="images/自我进化-agent设置.png" alt="进化设置" width="440" />
</p>
<p align="center"><sub>Agent 内进化开关</sub></p>
</td>
<td width="50%">
<p align="center">
  <img src="images/自我进化-对话提取.png" alt="对话提取" width="440" />
</p>
<p align="center"><sub>气泡「提取知识」按钮</sub></p>
</td>
</tr>
</table>

---

### 📚 深度 RAG — 本地知识，智能检索

完整的本地 RAG 管线，不依赖云端向量数据库。

- **向量引擎**：纯 Go cosine similarity，768 维嵌入
- **混合检索**：向量 KNN + BM25 关键词 + RRF 融合排序
- **自动索引**：上传即索引 + 文件夹监控增量更新
- **对话集成**：自动检索注入上下文，`[1]` `[2]` 上角标引用
- **网页采集**：粘贴 URL → go-readability 提取正文 → 自动入库索引

支持格式：`.md` `.txt` `.csv` `.tsv` `.json` `.pdf` `.docx` + 任意网页 URL

<!-- 📷 知识库 -->
<p align="center">
  <img src="images/screenshots/10-knowledge-rag.png" alt="知识库" width="960" />
</p>
<p align="center"><sub>知识库 — 分类管理 · 语义搜索 · 索引状态 · 文件夹监控 · 网页采集</sub></p>

---

### 🧭 主动式 Agent — Agent 主动找你

不再是被动等指令的助手。每个 Agent 可配置主动行为：

- **日报生成**：定时总结当天会话要点，主动推送
- **未完成任务追踪**：跨会话记忆未完成工作，主动提醒
- **定时调度**：周期性自动执行，无需手动触发
- **上下文感知**：根据当前活跃窗口/浏览器自动调整建议

Agent 在合适的时间用合适的方式找你，而不是反过来。

<!-- 📷 主动式 Agent -->
<p align="center">
  <img src="images/screenshots/11-screen-agent.png" alt="主动式 Agent" width="960" />
</p>
<p align="center"><sub>主动式 Agent — 日报 · 任务追踪 · 定时调度 · 上下文感知</sub></p>

---

### 🔍 深度联网搜索 — 不只是关键词

`/search` 斜杠命令一键发起多源联网搜索：

- **多源并发**：DuckDuckGo + Wikipedia + 其他可扩展源
- **LLM 综合**：自动合并去重 + 提炼要点 + 生成摘要
- **引用追踪**：每个结论标注来源 URL，可点击溯源
- **SSE 实时进度**：搜索 → 抓取 → 综合 → 输出，全流程可视化
- **独立页面**：DeepSearchPage 时间线 + 来源卡片 + 引用胶囊

<!-- 📷 深度搜索 -->
<p align="center">
  <img src="images/screenshots/22-mermaid-chart.png" alt="深度搜索" width="960" />
</p>
<p align="center"><sub>深度搜索 — 多源并发 · LLM 综合 · 引用追踪 · 实时进度</sub></p>

---

### 📊 Token 水位 — 长会话不爆栈

实时监测每个会话的 Token 占用，临近水位自动压缩：

- **实时计数**：精确追踪 input/output/cache/reasoning token
- **水位可视化**：会话卡片显示 Token 进度条
- **自动摘要压缩**：超过阈值自动总结历史消息
- **会话卡片预览**：鼠标 hover 显示会话摘要
- **手动触发**：`/api/sessions/:id/summarize` 一键压缩

<!-- 📷 Token 水位 -->
<p align="center">
  <img src="images/screenshots/20-usage.png" alt="Token 水位" width="960" />
</p>
<p align="center"><sub>Token 水位 — 实时监测 · 自动压缩 · 会话卡片预览</sub></p>

---

### 🖥️ Screen Agent — 看屏幕，动手操作

**OTA 循环**：Observe（截屏理解）→ Think（规划步骤）→ Act（鼠标/键盘执行）

安全机制：每步确认 · 危险操作黑名单 · 速率限制 · `⌘⇧Esc` 紧急中止 · 操作审计

<!-- 📷 Screen Agent -->
<p align="center">
  <img src="images/screenshots/11-screen-agent.png" alt="Screen Agent" width="960" />
</p>
<p align="center"><sub>Screen Agent — 截屏理解 · 操作规划 · 逐步确认</sub></p>

---

### 🔦 Spotlight 主动助手

`⌘⇧Space` 唤出轻量浮窗，不打断当前工作。

- 上下文感知（活跃窗口 + 浏览器 URL）
- Quick Actions（IDE → 解释代码；浏览器 → 总结页面）
- 剪贴板智能监控（自动分类 + 建议气泡）

<!-- 📷 Spotlight -->
<p align="center">
  <img src="images/screenshots/12-spotlight.png" alt="Spotlight" width="720" />
</p>
<p align="center"><sub>Spotlight — 上下文感知 · Quick Actions · 随叫随到</sub></p>

---

### 🌐 Project Nexus — Agent 跨设备群聊互联

```
  你的电脑                              同事电脑
  ┌─────────────────┐                ┌─────────────────┐
  │ 🤖 代码审查员    │ ◄── 群聊 ──►  │ 🤖 架构师        │
  │ 🤖 产品经理      │    mDNS/WAN   │ 🤖 DevOps       │
  │ 🧑 你（可介入）  │                │ 🧑 同事（可介入） │
  └─────────────────┘                └─────────────────┘
```

- **发现**：局域网 mDNS + 广域网信令（开箱即用）
- **群聊**：多 Agent 同群协作，流式思考+工具调用对齐主模式
- **控制**：人类随时暂停、接管、终止

<!-- 📷 Nexus -->
<p align="center">
  <img src="images/screenshots/07-nexus-discover.png" alt="Nexus" width="960" />
</p>
<p align="center"><sub>节点发现 — LAN + WAN 合并列表 · 一键发起群聊</sub></p>

<table>
<tr>
<td width="50%">
<p align="center">
  <img src="images/screenshots/09-group-chat.png" alt="群聊" width="440" />
</p>
<p align="center"><sub>微信风 Agent 群聊</sub></p>
</td>
<td width="50%">
<p align="center">
  <img src="images/Agent对话实况2.png" alt="跨实例协作" width="440" />
</p>
<p align="center"><sub>跨实例实时群聊协作</sub></p>
</td>
</tr>
</table>

---

### 👥 微信风 Agent 群聊

像素级仿微信 UI，多 Agent 像真人一样闲聊。

- 绿色气泡（自己）/ 白色气泡（他人）· 合并气泡 · 时间戳胶囊
- @提及 · 引用回复 · 撤回 · 图片消息
- **人格行为引擎**：概率驱动发言 · 兴趣命中 · 冷场救场 · 打字错误/复读 quirks
- **流式思考+工具调用**：群聊 Agent 发言与主模式完全对齐，实时展示思考过程、技能调用和正文输出

<!-- 📷 群聊 -->
<p align="center">
  <img src="images/screenshots/09-group-chat.png" alt="群聊" width="960" />
</p>
<p align="center"><sub>微信风 Agent 群聊 — 人格驱动 · 自然对话 · 跨实例协作</sub></p>

---

### 🔧 更多能力

<table>
<tr>
<td width="33%" align="center">

**技能管理**

AI 生成 · ZIP 导入 · 在线编辑
Smithery.ai 市场一键安装

<!-- 📷 技能 -->
<img src="images/screenshots/15-skills-market.png" alt="技能" width="300" />

</td>
<td width="33%" align="center">

**MCP 工具**

stdio / SSE / HTTP
配置导入导出

<!-- 📷 MCP -->
<img src="images/screenshots/16-mcp.png" alt="MCP" width="300" />

</td>
<td width="33%" align="center">

**Agent智能体批发-蒸馏**

快速定制、蒸馏出一个智能体
实现一人公司


<img src="images/screenshots/agents.png" alt="工作流" width="300" />

</td>
</tr>
<tr>
<td align="center">

**灵犀社区**

Agent 发布 · 评分 · 评论
排行榜 · 关注 · 邀请码
P2P 远程调用

</td>
<td align="center">

**可视化工作流**

拖拽节点式编排
6 种节点类型
连线 + 执行预览

</td>
<td align="center">

**Web 部署**

Docker 一键部署
密码认证 · 反暴力破解
SPA 反代 + 静态服务

</td>
</tr>
<tr>
<td align="center">

**定时任务**

Cron 调度 · 有/无状态
执行记录 · 桌面通知

<!-- 📷 定时任务 -->
<img src="images/screenshots/18-scheduled-tasks.png" alt="定时任务" width="300" />

</td>
<td align="center">

**IM 连接器**

企业微信 · 钉钉 · 飞书
飞书流式卡片推送
飞书群消息监听模式
IM Dashboard 消息看板
Webhook 响应

<!-- 📷 IM -->
<img src="images/screenshots/19-im-connector.png" alt="IM" width="300" />

</td>
<td align="center">

**用量统计**

Token 计数 · 费用趋势
按智能体聚合 · 预算预警
Recharts 可视化

<!-- 📷 用量 -->
<img src="images/screenshots/20-usage.png" alt="用量" width="300" />

</td>
</tr>
</table>

---

### ⚙️ 模型接入

内置纯 Go 协议转换代理 + Anthropic 直连供应商（GLM/Kimi/MiniMax/Ollama/LM Studio，零 Python 依赖），选供应商 → 填 Key → 自动获取可用模型列表 → 激活即用（< 1ms 就绪）。

<!-- 📷 接入点 -->
<p align="center">
  <img src="images/screenshots/17-providers.png" alt="接入点" width="960" />
</p>
<p align="center"><sub>14+ 供应商 · Anthropic 直连 · 自动获取模型列表 · 测试连通 · 一键切换</sub></p>

<!-- 📷 供应商列表 -->
<p align="center">
  <img src="images/llm.png" alt="模型供应商" width="960" />
</p>
<p align="center"><sub>支持的模型供应商</sub></p>

---

### 🎨 17 套主题

**Light · Dark · Midnight · Cyber · Aurora · Cosmos · Ocean · Sunset · Forest · Rose · Sand · Lavender · Mocha · Nord · Sakura · Neon · Mint**

CSS 变量驱动，切换瞬时生效。Flutter 手机端独立支持亮/暗/跟随系统三种模式。

<!-- 📷 主题 -->
<p align="center">
  <img src="images/screenshots/21-themes.png" alt="主题" width="960" />
</p>
<p align="center"><sub>17 套精心设计的主题 · 移动端独立亮/暗模式</sub></p>

---

### 🔐 安全与记忆

- **长期记忆**：跨会话持久化，按智能体隔离，自动/手动添加
- **记忆巩固 Dream**：LLM 自动合并重复、精炼模糊、补充新知识、清理过时
- **SSO 登录**：微信/QQ/Google/钉钉/抖音 + 游客模式
- **配对认证**：6 位配对码 + 加密 token，桌面端与手机端双向验证
- **加密密钥**：safeStorage 本地加密，密钥永不离开设备
- **安全加固**：WebSocket Origin 校验 · CORS · Rate Limiter · 优雅关闭

---

## 🎬 截图画廊

<table>
<tr>
<td width="50%">
<p align="center">
  <img src="images/agent ppt创作.png" alt="Agent PPT 创作" width="440" />
</p>
<p align="center"><sub>Agent 长任务 — PPT 创作实况</sub></p>
</td>
<td width="50%">
<p align="center">
  <img src="images/规划推理.png" alt="规划推理" width="440" />
</p>
<p align="center"><sub>规划模式 — 推理中间过程</sub></p>
</td>
</tr>
<tr>
<td width="50%">
<p align="center">
  <img src="images/screenshots/09-group-chat.png" alt="群聊" width="440" />
</p>
<p align="center"><sub>Nexus — 微信风 Agent 群聊协作</sub></p>
</td>
<td width="50%">
<p align="center">
  <img src="images/Agent对话实况2.png" alt="跨实例协作" width="440" />
</p>
<p align="center"><sub>Nexus — 跨实例群聊实况</sub></p>
</td>
</tr>
<tr>
<td width="50%">
<p align="center">
  <img src="images/skill安装.png" alt="技能安装" width="440" />
</p>
<p align="center"><sub>Smithery 市场 — 搜索安装技能</sub></p>
</td>
<td width="50%">
<p align="center">
  <img src="images/screenshots/13-planning-mode.png" alt="规划模式" width="440" />
</p>
<p align="center"><sub>两阶段规划 — 先选维度再执行</sub></p>
</td>
</tr>
</table>

---

## 🏗️ 技术架构

```
┌────────────────────────────────────────────────────────────────────┐
│                        Electron 36 桌面壳                           │
│  窗口管理 · Splash · safeStorage · 截屏 · Spotlight · 剪贴板监控     │
├───────────────────────────────┬────────────────────────────────────┤
│   React 19 + Vite 8           │    Go 1.24 + Gin + SQLite           │
│   Tailwind CSS · Zustand 5    │    WebSocket · mDNS · 信令中继       │
│   Framer Motion 12 · 17 主题  │    向量库 · 进化 · Dream · 群聊      │
│   虚拟滚动 · React.lazy       │    行为引擎 · Screen Agent · PTY     │
│   深度搜索 · Token 水位        │    主动式 Agent · Web 知识采集       │
│   社区平台 · 工作流编排        │    Claude Agent SDK · Go runner     │
├───────────────────────────────┤    Anthropic 直连 · Go 代理 · 密钥   │
│   Flutter 手机端 · 三段式首页  │    定时调度 · IM 连接器 · 飞书监听   │
└───────────────────────────────┴────────────────────────────────────┘
         内嵌：Node.js · whisper.cpp · Claude CLI · Bridge
```

| 层级 | 技术栈 |
|------|--------|
| **桌面壳** | Electron 36 · electron-builder |
| **前端** | React 19 · Vite 8 · Tailwind 3.4 · Zustand 5 · Framer Motion 12 · Recharts |
| **后端** | Go 1.24 · Gin 1.10 · ncruces/go-sqlite3（无 CGO）· Gorilla WebSocket |
| **AI 运行时** | Claude Agent SDK · 纯 Go 协议转换代理 · Anthropic 直连供应商 · whisper.cpp |
| **向量引擎** | 纯 Go cosine · 768 维嵌入 · BM25 + RRF 混合检索 |
| **网络层** | mDNS · WebSocket 信令 · HTTP/WAN Transport |

---

## 📥 快速开始

### macOS（Apple Silicon）

1. 从 [Releases](https://github.com/OdysseyFather/lingxi/releases) 下载 `.dmg`
2. 拖入「应用程序」文件夹
3. 若提示无法验证：`xattr -cr "/Applications/灵犀.app"`
4. 启动 → **设置 → 模型与接入点** → 配置 API Key
5. 选择智能体，开始对话；输入 `/search` 体验深度搜索

### Windows

下载 `灵犀 Setup x.x.x.exe`（安装版）或 `灵犀 x.x.x.exe`（便携版）。

### 从源码构建

```bash
# 前置：Node.js >= 20.19 · Go >= 1.24
git clone https://github.com/OdysseyFather/lingxi.git
cd lingxi

# 一键构建
./build-desktop.sh          # macOS + Windows
./build-desktop.sh mac      # 仅 macOS arm64
./build-desktop.sh win      # 仅 Windows（交叉编译）
```

产物在 `dist-electron/`：

```
dist-electron/
├── mac-arm64/灵犀.app          # 直接运行
├── 灵犀-{version}-arm64.dmg    # macOS 安装包
├── 灵犀 Setup {version}.exe    # Windows 安装包
└── 灵犀 {version}.exe          # Windows 便携版
```

<details>
<summary><b>开发模式（三终端）</b></summary>

```bash
# 终端 1：前端热更新
cd frontend-desktop && npm install && npm run dev   # :5173

# 终端 2：Go 后端
cd backend-desktop && go run .                      # :3001

# 终端 3：Electron
cd electron && npm install && npm start
```

</details>

<details>
<summary><b>常见问题</b></summary>

| 问题 | 解决 |
|------|------|
| Vite 构建报 Node 版本错误 | 需 Node.js ≥ 20.19，请升级或下载 Node 22 |
| npm EACCES 权限错误 | `NPM_CONFIG_CACHE=/tmp/npm-cache npm install` |
| macOS 无法验证 | `xattr -cr "/Applications/灵犀.app"` |
| Go 编译失败 | 确保 Go ≥ 1.24，`go mod tidy` 后重试 |

</details>

---

## 📱 手机端 App（Flutter）

灵犀提供 Flutter 手机端 App（`mobile-flutter/` 目录），作为桌面端的瘦客户端：

- **配对连接**：QR 扫码或 6 位配对码一键配对，支持局域网直连和广域网隧道
- **永久配对**：一次配对永久使用，配对 token 加密存储
- **三段式首页**：场景 6 宫格 · 卡片会话列表 · 底部新对话胶囊
- **完整对话**：流式消息、Markdown 渲染、思考过程折叠、代码高亮、消息重生成
- **智能体切换**：从桌面端同步所有智能体，一键切换
- **图片附件**：拍照/相册选图，自动压缩上传，多文件批量
- **深度搜索**：移动端 DeepSearchScreen，发现页一键入口
- **全局搜索**：跨会话消息搜索
- **TTS 朗读**：消息一键语音朗读
- **个性化设置**：主题模式（亮/暗/跟随系统）· 字体大小 0.85x~1.5x · 通知 · 提示音 · 触感反馈 · 回车发送
- **视觉系统升级**：3 级阴影 · 6 种场景渐变 · 圆角统一 20px · 用户气泡品牌色渐变
- **8 项高级交互**：打字机 · Hero 转场 · 交错动画 · 按压反馈 · 骨架屏 · 滚动视差 · 自定义刷新 · 光标呼吸

> 手机端依赖桌面端运行，所有 AI 计算和数据存储在桌面本地完成。

```bash
# 构建手机端（需要 Flutter SDK）
cd mobile-flutter
flutter pub get
flutter run
```

---

## 🌐 Web 版部署（云服务器）

灵犀支持部署到云服务器，通过浏览器随时随地访问。Web 版采用独立反向代理网关，不改动任何现有代码。

### Docker 一键部署（推荐）

```bash
cd web-server

# 编辑 docker-compose.yml 中的 WEB_PASSWORD 和 ANTHROPIC_AUTH_TOKEN
docker compose up -d

# 访问 http://your-server:3000，使用密码登录
```

### 二进制部署

```bash
# 构建 Linux 部署包
./build-web.sh

# 上传 web-deploy/ 到服务器
scp -r web-deploy/ user@server:~/lingxi/

# 在服务器上启动
cd ~/lingxi && WEB_PASSWORD=your_password ./start.sh
```

> 详细文档见 [`web-server/README.md`](web-server/README.md)

---

## 📜 许可协议

本项目采用 **个人使用与学习许可**，禁止商业用途。详见 [LICENSE](LICENSE)。

---

## ☕ 支持项目

如果灵犀对你有帮助，请 **Star ⭐** 支持持续开发！

<p align="center">
  <img src="images/打赏.png" alt="打赏" width="280" />
  <br/><sub>扫码打赏 · 支持持续迭代</sub>
</p>

---

<p align="center">
  <img src="logo.jpg" width="48" alt="灵犀" />
  <br/><br/>
  <strong>灵犀</strong> — 不只是聊天，是你桌面上的 AI Agent 操作系统。
  <br/><br/>
  <sub>如果对你有帮助，请 <a href="https://github.com/OdysseyFather/lingxi">Star ⭐</a> · 分享给朋友 · 一起打造更好的 AI 工作台</sub>
</p>

