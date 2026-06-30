#!/bin/bash
# ─── 灵犀 Web 版构建脚本 ─────────────────────────────────────
# 构建部署包（Go 后端 + Web 网关 + React 前端）
#
# 用法:
#   ./build-web.sh          # 构建当前平台（macOS/Linux）本地可运行的部署包
#   ./build-web.sh local    # 同上，构建当前平台部署包
#   ./build-web.sh linux    # 交叉编译 Linux amd64 部署包（用于服务器）
#   ./build-web.sh docker   # 构建 Docker 镜像
#
# 前置条件:
#   - Go 1.24+
#   - Node.js 20.19+ 或 22+
#   - Docker（仅 docker 模式需要）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DEPLOY_DIR="$SCRIPT_DIR/web-deploy"
MODE="${1:-local}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# ─── Docker 模式 ─────────────────────────────────────────────
if [ "$MODE" = "docker" ]; then
    info "构建 Docker 镜像..."
    docker build -f web-server/Dockerfile -t lingxi-web .
    ok "Docker 镜像构建完成: lingxi-web"
    echo ""
    echo "运行命令:"
    echo "  docker run -d -p 3000:3000 \\"
    echo "    -e WEB_PASSWORD=your_password \\"
    echo "    -e ANTHROPIC_AUTH_TOKEN=sk-xxx \\"
    echo "    -v lingxi-data:/data \\"
    echo "    lingxi-web"
    exit 0
fi

# ─── 确定目标平台 ────────────────────────────────────────────
if [ "$MODE" = "linux" ]; then
    TARGET_OS="linux"
    TARGET_ARCH="amd64"
    PLATFORM_LABEL="Linux amd64"
    TARBALL_NAME="lingxi-web-linux-amd64.tar.gz"
else
    # local 模式：使用当前系统的 OS/ARCH
    TARGET_OS="$(go env GOOS)"
    TARGET_ARCH="$(go env GOARCH)"
    PLATFORM_LABEL="${TARGET_OS} ${TARGET_ARCH}"
    TARBALL_NAME="lingxi-web-${TARGET_OS}-${TARGET_ARCH}.tar.gz"
fi
info "目标平台: $PLATFORM_LABEL"

# ─── 检查依赖 ────────────────────────────────────────────────

# 检查 Node.js 版本
if [ -x "/tmp/node22/bin/node" ]; then
    export PATH="/tmp/node22/bin:$PATH"
    info "使用 /tmp/node22 Node.js"
fi

NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//')
if [ -z "$NODE_VERSION" ]; then
    fail "未找到 Node.js，请安装 Node.js 20.19+ 或 22+"
fi
info "Node.js 版本: v$NODE_VERSION"

# 检查 Go 版本
GO_VERSION=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//')
if [ -z "$GO_VERSION" ]; then
    fail "未找到 Go，请安装 Go 1.24+"
fi
info "Go 版本: $GO_VERSION"

# 清理并创建部署目录
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# ── 步骤 1: 编译 Go 后端 ──
info "编译 Go 后端 ($PLATFORM_LABEL)..."
cd "$SCRIPT_DIR/backend-desktop"
CGO_ENABLED=0 GOOS="$TARGET_OS" GOARCH="$TARGET_ARCH" go build -ldflags="-s -w" -o "$DEPLOY_DIR/smart-agent" .
ok "后端编译完成: smart-agent"

# ── 步骤 2: 编译 Web 网关 ──
info "编译 Web 网关 ($PLATFORM_LABEL)..."
cd "$SCRIPT_DIR/web-server"
CGO_ENABLED=0 GOOS="$TARGET_OS" GOARCH="$TARGET_ARCH" go build -ldflags="-s -w" -o "$DEPLOY_DIR/web-gateway" .
ok "网关编译完成: web-gateway"

# ── 步骤 3: 构建前端 ──
info "构建前端..."
cd "$SCRIPT_DIR/frontend-desktop"
# 使用临时 npm 缓存，避免 EACCES 权限问题
NPM_CONFIG_CACHE=/tmp/npm-lingxi-web-cache npm ci --no-audit --no-fund 2>/dev/null || NPM_CONFIG_CACHE=/tmp/npm-lingxi-web-cache npm install --no-audit --no-fund
npm run build
cp -r dist "$DEPLOY_DIR/dist"
ok "前端构建完成"

# ── 步骤 4: 复制静态资源 ──
cp -r "$SCRIPT_DIR/web-server/static" "$DEPLOY_DIR/static"

# ── 步骤 4.5: 内嵌 AI 引擎（Claude Code CLI） ──
AI_ENGINE_SRC="$SCRIPT_DIR/electron/resources/ai-engine"
if [ -d "$AI_ENGINE_SRC" ]; then
    info "复制 AI 引擎（Claude Code CLI）..."
    mkdir -p "$DEPLOY_DIR/ai-engine"
    # 只复制运行必需的文件，跳过 src/ 等开发目录
    cp "$AI_ENGINE_SRC/cli.js" "$DEPLOY_DIR/ai-engine/"
    cp "$AI_ENGINE_SRC/lingxi" "$DEPLOY_DIR/ai-engine/"
    [ -f "$AI_ENGINE_SRC/lingxi.cmd" ] && cp "$AI_ENGINE_SRC/lingxi.cmd" "$DEPLOY_DIR/ai-engine/"
    cp "$AI_ENGINE_SRC/package.json" "$DEPLOY_DIR/ai-engine/"
    [ -f "$AI_ENGINE_SRC/bunfig.toml" ] && cp "$AI_ENGINE_SRC/bunfig.toml" "$DEPLOY_DIR/ai-engine/"
    [ -f "$AI_ENGINE_SRC/preload.ts" ] && cp "$AI_ENGINE_SRC/preload.ts" "$DEPLOY_DIR/ai-engine/"
    # node_modules 是 CLI 运行时依赖
    if [ -d "$AI_ENGINE_SRC/node_modules" ]; then
        cp -r "$AI_ENGINE_SRC/node_modules" "$DEPLOY_DIR/ai-engine/"
    fi
    # bin 目录（如果有）
    if [ -d "$AI_ENGINE_SRC/bin" ]; then
        cp -r "$AI_ENGINE_SRC/bin" "$DEPLOY_DIR/ai-engine/"
    fi
    # src 目录（CLI 运行时可能需要）
    if [ -d "$AI_ENGINE_SRC/src" ]; then
        cp -r "$AI_ENGINE_SRC/src" "$DEPLOY_DIR/ai-engine/"
    fi
    # stubs 目录
    if [ -d "$AI_ENGINE_SRC/stubs" ]; then
        cp -r "$AI_ENGINE_SRC/stubs" "$DEPLOY_DIR/ai-engine/"
    fi
    chmod +x "$DEPLOY_DIR/ai-engine/lingxi" "$DEPLOY_DIR/ai-engine/cli.js" 2>/dev/null
    AI_SIZE=$(du -sh "$DEPLOY_DIR/ai-engine" | awk '{print $1}')
    ok "AI 引擎复制完成 ($AI_SIZE)"
else
    warn "未找到 AI 引擎目录: $AI_ENGINE_SRC"
    warn "Web 版将使用系统 claude 命令（如果有的话）"
fi

# ── 步骤 4.6: 复制 AI 配置模板 ──
AI_CONFIG_SRC="$SCRIPT_DIR/ai-config"
if [ -d "$AI_CONFIG_SRC" ]; then
    info "复制 AI 配置模板..."
    cp -r "$AI_CONFIG_SRC" "$DEPLOY_DIR/ai-config"
    ok "AI 配置模板复制完成"
fi

# ── 步骤 5: 生成启动脚本 ──
cat > "$DEPLOY_DIR/start.sh" << 'STARTEOF'
#!/bin/bash
# ─── 灵犀 Web 版启动脚本 ─────────────────────────────────────
# 环境变量:
#   WEB_PASSWORD     (必填) Web 登录密码
#   PORT             (可选) 端口，默认 3000
#   ANTHROPIC_AUTH_TOKEN (可选) Anthropic API Key
#   DATA_DIR         (可选) 数据目录，默认 ./data
#   CLAUDE_BIN       (可选) Claude CLI 路径（默认使用内嵌 CLI）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -z "$WEB_PASSWORD" ]; then
    echo "错误: 请设置 WEB_PASSWORD 环境变量"
    echo "用法: WEB_PASSWORD=your_password ./start.sh"
    exit 1
fi

export PORT="${PORT:-3000}"
export DATA_DIR="${DATA_DIR:-./data}"
export FRONTEND_DIST="${FRONTEND_DIST:-./dist}"
export BACKEND_BIN="${BACKEND_BIN:-./smart-agent}"

# Claude CLI 检测优先级：环境变量 > 内嵌 CLI > 系统 CLI
if [ -z "$CLAUDE_BIN" ]; then
    BUNDLED_CLI="$SCRIPT_DIR/ai-engine/lingxi"
    if [ -x "$BUNDLED_CLI" ]; then
        export CLAUDE_BIN="$BUNDLED_CLI"
        echo "使用内嵌 Claude CLI: $CLAUDE_BIN"
    elif command -v claude >/dev/null 2>&1; then
        export CLAUDE_BIN="$(command -v claude)"
        echo "使用系统 Claude CLI: $CLAUDE_BIN"
    else
        echo "警告: 未找到 Claude CLI，AI 对话功能将不可用"
        echo "安装方法: npm install -g @anthropic-ai/claude-code"
    fi
else
    echo "使用指定 Claude CLI: $CLAUDE_BIN"
fi

mkdir -p "$DATA_DIR"

echo "灵犀 Web 版启动中..."
echo "  端口: $PORT"
echo "  数据: $DATA_DIR"
echo "  Claude: ${CLAUDE_BIN:-未配置}"

exec ./web-gateway
STARTEOF
chmod +x "$DEPLOY_DIR/start.sh"

# ── 步骤 6: 生成说明文件 ──
cat > "$DEPLOY_DIR/README.txt" << READMEEOF
灵犀 AI Agent — Web 版部署包 ($PLATFORM_LABEL)
============================

快速启动:
  1. 设置环境变量并启动:
     WEB_PASSWORD=your_password ./start.sh

  2. 浏览器访问:
     http://localhost:3000

  3. 在「设置 > 接入点」中配置模型供应商（API Key）

说明:
  - 部署包已内嵌 Claude Code CLI（ai-engine/ 目录），无需额外安装
  - AI 引擎运行在独立的隔离目录中，不影响本地 Claude 配置
  - 数据存储在 DATA_DIR 目录下（SQLite + 上传文件 + 知识库）

环境变量:
  WEB_PASSWORD          (必填) Web 登录密码
  PORT                  (可选) 端口，默认 3000
  ANTHROPIC_AUTH_TOKEN  (可选) Anthropic API Key
  DATA_DIR              (可选) 数据目录，默认 ./data
  CLAUDE_BIN            (可选) Claude CLI 路径（默认使用内嵌 CLI）

注意事项:
  - 部署到公网建议使用 Nginx/Caddy 反向代理并配置 HTTPS
READMEEOF

# ── 步骤 7: 打包 tar.gz ──
info "打包 tar.gz..."
cd "$SCRIPT_DIR"
tar -czf "$TARBALL_NAME" -C "$(dirname "$DEPLOY_DIR")" "$(basename "$DEPLOY_DIR")"
TARBALL_SIZE=$(du -sh "$TARBALL_NAME" | awk '{print $1}')
ok "tar.gz 打包完成: $TARBALL_NAME ($TARBALL_SIZE)"

# ── 完成 ──
DEPLOY_SIZE=$(du -sh "$DEPLOY_DIR" | awk '{print $1}')
ok "构建完成！"
echo ""
echo "部署包: $DEPLOY_DIR/ ($DEPLOY_SIZE)"
echo "压缩包: $TARBALL_NAME ($TARBALL_SIZE)"
echo ""
echo "文件列表:"
ls -la "$DEPLOY_DIR/"
echo ""
if [ "$MODE" = "linux" ]; then
    echo "部署步骤（服务器）:"
    echo "  1. 上传 $TARBALL_NAME 到服务器"
    echo "  2. tar -xzf $TARBALL_NAME"
    echo "  3. cd web-deploy"
    echo "  4. 安装 Claude CLI: npm install -g @anthropic-ai/claude-code"
    echo "  5. 启动: WEB_PASSWORD=xxx ./start.sh"
    echo "  6. 访问: http://your-server:3000"
else
    echo "本地启动:"
    echo "  cd web-deploy && WEB_PASSWORD=xxx ./start.sh"
    echo ""
    echo "访问: http://localhost:3000"
fi
