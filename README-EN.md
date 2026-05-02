<p align="center">
  <img src="logo.jpg" width="180" alt="Lingxi Logo" />
</p>

<h1 align="center">Lingxi AI Agent</h1>

<p align="center">
  <strong>A local-first, composable, extensible desktop AI Agent workspace.</strong>
</p>

<p align="center">
  <a href="README.md">中文</a> ·
  <a href="#-overview">Overview</a> ·
  <a href="#-highlights">Highlights</a> ·
  <a href="#-design-philosophy">Design</a> ·
  <a href="#-screenshots">Screenshots</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-license">License</a>
</p>

---

## 📌 Overview

**Lingxi AI Agent** is a desktop AI Agent workspace for personal productivity and business workflows. It is built with Electron, React, Go, SQLite, and a local AI engine / routing layer that connects to multiple model providers.

Lingxi is more than a chat UI. It provides a complete local AI workspace:

- General chat, search, content generation, and task execution;
- Agent Factory for building scenario-specific agents;
- Multi-provider and multi-model endpoint management;
- Skills, knowledge bases, MCP tools, and IM integrations;
- Local storage for sessions, profiles, knowledge, usage, and configuration.

<p align="center">
  <img src="images/首页.png" alt="Home" width="920" />
</p>

---

## ✨ Highlights

### 1. Agent Factory

Lingxi includes an **Agent Factory** that lets users create dedicated agents for specific workflows such as finance reconciliation, slide generation, customer support, code review, operation analysis, and more.

Each agent can define:

- Name, avatar, and description;
- Role / system prompt;
- Preferred model profile;
- Allowed skills;
- Allowed knowledge bases;
- Allowed MCP servers;
- Dedicated conversation space and message management.

A session is bound to one agent from creation to completion. The agent cannot be changed mid-session, which keeps context and role behavior consistent.

### 2. Multi-model and Multi-provider Support

Lingxi supports Anthropic-native endpoints and OpenAI-compatible providers, including Anthropic, Qwen / DashScope, DeepSeek, Doubao, GLM, Kimi, Gemini, OpenRouter, Groq, SiliconFlow, Ollama, OpenAI Official, and custom endpoints.

OpenAI-compatible providers are routed through a local bridge layer that translates protocols while preserving streaming, tool calls, usage tracking, and reasoning display when available.

### 3. Streaming Chat, Reasoning, and Tool Transparency

Lingxi supports real-time WebSocket streaming:

- Token-by-token response rendering;
- Collapsible reasoning / thinking blocks;
- Tool and skill invocation cards;
- Per-message model, token, latency, and cost display;
- Expandable tool-call details including type, status, input summary, and duration.

For providers that expose `reasoning_content` or `reasoning`, Lingxi translates the stream into visible thinking blocks in the UI.

### 4. Skills, Knowledge Base, and MCP

Lingxi offers multiple ways to extend agent capabilities:

- **Skills**: import, generate, install, and uninstall local skills;
- **Knowledge Base**: upload local documents for context-aware answers;
- **MCP**: configure stdio / SSE / HTTP MCP servers;
- **Transparency**: see which tools or skills were used during a conversation.

### 5. IM Integrations

Lingxi can connect to enterprise messaging platforms such as WeCom and DingTalk, enabling automated replies, internal Q&A, notifications, and workflow automation.

### 6. Local-first Security

- Sessions and messages are stored in local SQLite;
- API keys are encrypted using macOS `safeStorage`;
- Plaintext keys only exist in runtime memory;
- Frontend, backend, and bridge communicate over localhost;
- No telemetry or tracking is included.

---

## 🧭 Design Philosophy

### Local First

Lingxi is a desktop application first. It keeps your data, configuration, conversations, and credentials on your machine whenever possible.

### Composable Agents

Real-world AI usage is not just generic chat. A finance reconciliation agent, a slide-generation agent, a support agent, and a code-review agent all need different roles, models, knowledge, and tools.

Lingxi models an agent as a composable unit:

```text
Agent = Role + Model Profile + Skills + Knowledge Bases + MCP + Conversation Space
```

### Workflow-oriented

Lingxi focuses on getting work done:

- Answer directly when possible;
- Use local files, knowledge, web access, or tools when needed;
- Turn repeatable capabilities into skills or agents;
- Expose agents through IM integrations for team workflows.

### Transparent and Controllable

Tool-using agents can easily become black boxes. Lingxi surfaces tool and skill usage in the UI so users can see what happened.

### Experience Matters

The UI uses an aurora gradient background, glassmorphism, gradient buttons, modern cards, readable message bubbles, charts, and collapsible panels to make complex capabilities approachable.

---

## 🖼 Screenshots

### Home Workspace

<p align="center"><img src="images/首页.png" alt="Home" width="920" /></p>

### General Chat

<p align="center"><img src="images/普通对话.png" alt="General Chat" width="920" /></p>

### Agent Conversation

<p align="center"><img src="images/智能体交互.png" alt="Agent Conversation" width="920" /></p>

### Agent Factory

<p align="center"><img src="images/智能体工厂.png" alt="Agent Factory" width="920" /></p>

### Agent Configuration

<p align="center"><img src="images/智能体配置.png" alt="Agent Configuration" width="920" /></p>

### Agent Role Settings

<p align="center"><img src="images/智能体角色设定.png" alt="Agent Role Settings" width="920" /></p>

### Agent Slide Creation Scenario

<p align="center"><img src="images/agent%20ppt创作.png" alt="Agent PPT Creation" width="920" /></p>

### Model Endpoint Management

<p align="center"><img src="images/接入点管理.png" alt="Endpoint Management" width="920" /></p>

### LLM Routing

<p align="center"><img src="images/llm.png" alt="LLM Routing" width="920" /></p>

### MCP Management

<p align="center"><img src="images/mcp.png" alt="MCP" width="920" /></p>

### Skill Management

<p align="center"><img src="images/skill管理.png" alt="Skill Management" width="920" /></p>

### Knowledge Base

<p align="center"><img src="images/知识库.png" alt="Knowledge Base" width="920" /></p>

### IM Integration

<p align="center"><img src="images/IM.png" alt="IM Integration" width="920" /></p>

### Usage and Billing

<p align="center"><img src="images/用量计费.png" alt="Usage Billing" width="920" /></p>

---

## 🏗 Architecture

```text
┌────────────────────────────────────────────────────────────┐
│                       Electron Shell                       │
│  ┌────────────┐   ┌────────────┐   ┌─────────────────────┐ │
│  │ main.js    │   │ preload.js │   │ React Frontend      │ │
│  │ processes  │   │ IPC Bridge │   │ UI / State / WS     │ │
│  └─────┬──────┘   └─────┬──────┘   └──────────┬──────────┘ │
│        │                └──── REST + WebSocket┘            │
│        ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 Go Backend (Gin + SQLite)             │  │
│  │ Sessions / Messages / Agents / MCP / Skills / KB      │  │
│  │ Providers / Usage / IM Connectors / WebSocket Hub     │  │
│  └───────────────┬──────────────────────────────────────┘  │
│                  ▼                                         │
│         Local AI Engine / Local Bridge / Model Providers   │
└────────────────────────────────────────────────────────────┘
```

| Layer | Tech Stack |
|---|---|
| Desktop Shell | Electron 36 |
| Frontend | React 19, Vite 8, Tailwind CSS, Zustand, Framer Motion, Recharts |
| Backend | Go 1.24, Gin, Gorilla WebSocket, SQLite |
| AI Engine | Claude CLI / local wrapper |
| Routing Layer | LiteLLM Bridge / llm-bridge |
| Data | Local SQLite and filesystem storage |

---

## 🚀 Quick Start

### Prerequisites

| Dependency | Recommended Version | Notes |
|---|---:|---|
| macOS | Apple Silicon arm64 | Current packaging target |
| Node.js | ≥ 20.19 or ≥ 22.12 | Required by Vite 8 |
| Go | ≥ 1.24 | Backend compilation |
| Claude CLI | latest | Local AI engine dependency |

### 1. Clone

```bash
git clone https://github.com/MT-xjr2/lingxi-agent.git
cd lingxi-agent
```

### 2. Configure credentials

```bash
cp ai-config/auth.json.example ai-config/auth.json
```

Edit `ai-config/auth.json`:

```json
{
  "ANTHROPIC_AUTH_TOKEN": "sk-your-api-key-here",
  "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
  "ANTHROPIC_MODEL": "claude-opus-4-5"
}
```

You can also configure encrypted API keys inside the app via **Settings → Models & Endpoints**.

### 3. Build the desktop app

```bash
chmod +x build-desktop.sh
./build-desktop.sh
```

The packaged app will be generated at:

```bash
dist-electron/mac-arm64/灵犀.app
```

### 4. Launch

```bash
open dist-electron/mac-arm64/灵犀.app
```

If macOS blocks the unsigned build:

```bash
xattr -cr dist-electron/mac-arm64/灵犀.app
open dist-electron/mac-arm64/灵犀.app
```

---

## 🧑‍💻 Development

```bash
# Terminal 1: build frontend assets
cd frontend-desktop
npm install
npm run build
```

```bash
# Terminal 2: run backend
cd backend-desktop
go run .
```

```bash
# Terminal 3: run Electron
cd electron
npm install
npm start
```

> The Electron runtime injects environment variables such as `HOME`, `KB_PATH`, `SKILLS_PATH`, and `UPLOADS_PATH`. For the most complete local experience, start through Electron.

---

## ⚙️ Configuration

### Models and Endpoints

Open **Settings → Models & Endpoints** to create an API profile, select provider protocol, fill endpoint / model / API key, test connectivity, and activate it.

### Agent Factory

Open **Agents → New Agent** to configure basic info, role setting, model, skills, MCP servers, and knowledge bases.

### MCP

MCP management supports `stdio`, `sse`, and `http`, including headers and env configuration.

### Data Location

On macOS, app data is usually stored at:

```text
~/Library/Application Support/灵犀/
```

Common files and directories:

```text
smart-agent.db       # SQLite database
ai-home/             # isolated AI engine HOME
knowledge/           # knowledge base files
uploads/             # pasted / uploaded images
bridge-home/         # bridge runtime data
```

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Send message | `Enter` |
| Insert newline | `Shift + Enter` |
| Paste image and attach | `⌘ + V` |
| Stop generation | Click the stop button |
| Copy / Paste / Select all | `⌘ + C` / `⌘ + V` / `⌘ + A` |
| Open DevTools | `⌥ + ⌘ + I` |
| Reload | `⌘ + R` |
| Quit | `⌘ + Q` |

---

## 📁 Project Structure

```text
lingxi-agent/
├── backend-desktop/       # Go backend: APIs, WebSocket, SQLite, agent runtime
├── frontend-desktop/      # React frontend: chat, agents, settings, MCP, KB
├── electron/              # Electron main process, preload, packaging, resources
├── ai-config/             # AI engine configuration templates
├── images/                # README screenshots
├── build-desktop.sh       # one-click build script
├── logo.jpg               # project logo
├── LICENSE                # MIT License
├── README.md              # Chinese documentation
└── README-EN.md           # English documentation
```

---

## 🧩 Use Cases

- Personal desktop AI assistant;
- Internal knowledge-base Q&A;
- Dedicated agents for finance, operations, support, and engineering;
- Slide, report, and content generation;
- IM-based automation;
- Multi-model cost and quality evaluation;
- Local toolchain and MCP integration.

---

## ❓ FAQ

### Build fails with Vite Node version error

Vite 8 requires Node.js ≥ 20.19 or ≥ 22.12:

```bash
brew install node
node --version
```

### macOS says the app is damaged or unidentified

For unsigned local builds:

```bash
xattr -cr /Applications/灵犀.app
open /Applications/灵犀.app
```

### How do I fully reset the app?

```bash
pkill -x "灵犀" 2>/dev/null
rm -rf "/Applications/灵犀.app"
rm -rf "$HOME/Library/Application Support/灵犀"
```

### Where are pasted images stored?

Pasted or uploaded images are stored in the app data directory under `uploads/` and served locally via `/api/uploads/*`.

### Why can't a session switch agents?

An agent defines role, model, knowledge, and tool permissions. Switching mid-session would conflict with previous context, so each session is locked to one agent from start to finish.

---

## 🗺 Roadmap

- More granular agent permission controls;
- Stronger per-agent MCP isolation;
- More IM platforms;
- Skill marketplace / skill templates;
- Multi-device sync options;
- More advanced cost and budget analytics.

---

## 📜 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

