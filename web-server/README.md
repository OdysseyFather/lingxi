# 灵犀 AI Agent — Web 版

将灵犀部署到云服务器，通过浏览器随时随地访问你的 AI 工作台。

## 架构

Web 版采用**反向代理网关**架构，在不改动任何现有代码的前提下，为灵犀添加 Web 部署能力：

```
浏览器 → web-gateway(:3000) → smart-agent(:13001)
              ↓
        密码认证 + CORS + 静态文件服务
```

- `web-gateway`: 新建的轻量 Go 反向代理，负责密码认证、CORS、静态文件服务
- `smart-agent`: 灵犀现有后端，作为子进程运行，功能完全不变

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone <repo-url> lingxi-agent
cd lingxi-agent

# 2. 修改配置
cd web-server
# 编辑 docker-compose.yml 中的 WEB_PASSWORD 和 ANTHROPIC_AUTH_TOKEN

# 3. 启动
docker compose up -d

# 4. 访问
# 打开浏览器访问 http://your-server:3000
# 使用 WEB_PASSWORD 中设置的密码登录
```

### 方式二：本地运行（macOS/Linux）

```bash
# 1. 构建当前平台的部署包（自动检测 macOS/Linux）
./build-web.sh

# 2. 启动
cd web-deploy
WEB_PASSWORD=your_password ./start.sh

# 3. 访问
# http://localhost:3000
```

### 方式三：二进制部署（Linux 服务器）

```bash
# 1. 在开发机上交叉编译 Linux amd64 部署包
./build-web.sh linux

# 2. 将压缩包上传到服务器
scp lingxi-web-linux-amd64.tar.gz user@server:~/

# 3. 在服务器上解压并安装 Claude CLI
ssh user@server
tar -xzf lingxi-web-linux-amd64.tar.gz
npm install -g @anthropic-ai/claude-code

# 4. 启动
cd web-deploy
WEB_PASSWORD=your_password ./start.sh

# 5. 访问
# http://your-server:3000
```

### 方式四：仅构建 Docker 镜像

```bash
./build-web.sh docker
# 输出: lingxi-web 镜像

docker run -d -p 3000:3000 \
  -e WEB_PASSWORD=your_password \
  -e ANTHROPIC_AUTH_TOKEN=sk-xxx \
  -v lingxi-data:/data \
  lingxi-web
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `WEB_PASSWORD` | 是 | — | Web 登录密码 |
| `PORT` | 否 | `3000` | 网关对外端口 |
| `ANTHROPIC_AUTH_TOKEN` | 否 | — | Anthropic API Key（使用 Claude 时需要） |
| `DATA_DIR` | 否 | `./data` | 数据存储目录 |
| `BACKEND_BIN` | 否 | `./smart-agent` | 后端二进制路径 |
| `FRONTEND_DIST` | 否 | `./dist` | React 构建产物路径 |
| `CLAUDE_BIN` | 否 | `claude` | Claude CLI 路径 |
| `BACKEND_PORT` | 否 | `13001` | 内部后端端口 |

## 数据持久化

所有数据存储在 `DATA_DIR`（默认 `./data`）目录下：

```
data/
├── smart-agent.db     # SQLite 数据库（会话、智能体、设置等）
├── web_tokens.json    # Web 登录 token
├── uploads/           # 上传的图片、头像
└── knowledge/         # 知识库文件
```

Docker 部署时通过 volume 持久化：`-v lingxi-data:/data`

## HTTPS 配置（推荐）

生产环境建议在 web-gateway 前面加一层 Nginx 或 Caddy 反向代理：

### Caddy（最简单）

```
your-domain.com {
    reverse_proxy localhost:3000
}
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
```

## 功能说明

Web 版保留了灵犀的绝大部分功能：

| 功能 | Web 版 | 说明 |
|------|--------|------|
| 多模型对话 | 正常 | 需配置模型接入点 |
| 智能体工厂 | 正常 | |
| 知识库 RAG | 正常 | |
| 技能管理 | 正常 | |
| MCP 工具 | 正常 | |
| Agent 群聊 | 正常 | 通过 WAN 信令 |
| 定时任务 | 正常 | |
| 自我进化 | 正常 | |
| 语音输入 | 正常 | 浏览器 MediaRecorder |
| IM 连接器 | 正常 | 企微/钉钉/飞书 |
| 截屏/剪贴板 | 不可用 | 桌面端专属 |
| Screen Agent | 不可用 | 桌面端专属 |
| OAuth 登录 | 不可用 | 使用密码登录替代 |

## 安全建议

1. **务必修改默认密码** — `WEB_PASSWORD=changeme` 必须修改
2. **使用 HTTPS** — 配置 Nginx/Caddy 反向代理
3. **限制端口访问** — 通过防火墙仅开放必要端口
4. **定期备份数据** — 备份 `DATA_DIR` 目录
