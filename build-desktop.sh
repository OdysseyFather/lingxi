#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend-desktop"
FRONTEND_DIR="$ROOT_DIR/frontend-desktop"
ELECTRON_DIR="$ROOT_DIR/electron"
RESOURCES_DIR="$ELECTRON_DIR/resources"

echo "========================================"
echo "  灵犀 桌面客户端构建脚本 (Go + AI Engine + Bridge Router)"
echo "  目标平台: macOS arm64 (Apple Silicon)"
echo "========================================"

# ── 1. 编译 Go 后端 ───────────────────────────────────────────────
echo ""
echo "▶ [1/5] 编译 Go 后端..."
cd "$BACKEND_DIR"
GO_BIN="${GO_BIN:-$(which go)}"
if [ -z "$GO_BIN" ] || [ ! -x "$GO_BIN" ]; then
  echo "  ✗ 未找到可用的 go 工具链，请先安装 Go" >&2
  exit 1
fi
GOOS=darwin GOARCH=arm64 "$GO_BIN" build -o smart-agent .
chmod +x smart-agent
echo "  ✓ Go 后端编译完成: $(du -sh "$BACKEND_DIR/smart-agent" | cut -f1)"

# ── 2. 构建前端 ──────────────────────────────────────────────────
echo ""
echo "▶ [2/5] 构建前端..."
cd "$FRONTEND_DIR"
npm install --silent
npm run build
echo "  ✓ 前端构建完成: $(du -sh "$FRONTEND_DIR/dist" | cut -f1)"

# ── 3. 准备内置 AI 引擎 ──────────────────────────────────────────
echo ""
echo "▶ [3/5] 准备内置 AI 引擎..."
CLAUDE_CODE_DIR="$RESOURCES_DIR/ai-engine"
mkdir -p "$CLAUDE_CODE_DIR"

# 找到系统 claude 可执行文件
SYSTEM_CLAUDE="$(which claude 2>/dev/null || echo '')"
if [ -z "$SYSTEM_CLAUDE" ]; then
  echo "  ⚠️  未找到系统 AI 引擎，跳过内置（开发模式将使用系统 claude）"
else
  # 找到 claude 真实安装目录（npm global 包）
  if [ -L "$SYSTEM_CLAUDE" ]; then
    CLAUDE_REAL="$(readlink "$SYSTEM_CLAUDE")"
    # 处理相对路径的符号链接
    if [[ "$CLAUDE_REAL" != /* ]]; then
      CLAUDE_REAL="$(dirname "$SYSTEM_CLAUDE")/$CLAUDE_REAL"
    fi
  else
    CLAUDE_REAL="$SYSTEM_CLAUDE"
  fi
  # cli.js 路径: .../node_modules/@anthropic-ai/claude-code/cli.js
  # 包目录 = cli.js 的上一级目录
  CLAUDE_PKG_DIR="$(dirname "$CLAUDE_REAL")"
  echo "  ✓ 引擎包目录: $CLAUDE_PKG_DIR"

  # 复制 cli.js（AI 引擎核心脚本）
  cp "$CLAUDE_REAL" "$CLAUDE_CODE_DIR/cli.js"
  chmod +x "$CLAUDE_CODE_DIR/cli.js"
  echo "  ✓ cli.js 已复制"

  # 创建包装脚本 lingxi，使用内置 node 运行 cli.js（不依赖系统 node）
  cat > "$CLAUDE_CODE_DIR/lingxi" << 'WRAPPER_EOF'
#!/bin/bash
# 包装脚本：使用内置 node 运行 AI 引擎，不依赖系统 node
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$SCRIPT_DIR/../node-bin/node"
CLI_JS="$SCRIPT_DIR/cli.js"

# 确保使用内置 node，而不是系统 PATH 中的 node
exec "$NODE_BIN" "$CLI_JS" "$@"
WRAPPER_EOF
  chmod +x "$CLAUDE_CODE_DIR/lingxi"
  echo "  ✓ 创建了包装脚本 lingxi（使用内置 node，不依赖系统环境）"

  # 复制引擎 node_modules（AI 引擎依赖）
  if [ -d "$CLAUDE_PKG_DIR/node_modules" ]; then
    echo "  ✓ 复制引擎 node_modules..."
    cp -r "$CLAUDE_PKG_DIR/node_modules" "$CLAUDE_CODE_DIR/"
    echo "  ✓ node_modules 已复制: $(du -sh "$CLAUDE_CODE_DIR/node_modules" | cut -f1)"
  fi
  
  # 复制其他必要文件（如 resvg.wasm, vendor 等）
  for item in resvg.wasm vendor; do
    if [ -e "$CLAUDE_PKG_DIR/$item" ]; then
      cp -r "$CLAUDE_PKG_DIR/$item" "$CLAUDE_CODE_DIR/"
      echo "  ✓ 已复制: $item"
    fi
  done
fi

# ── 3.5 内置 Bridge 路由层（基于 supermemoryai/llm-bridge）─────────
# 当用户激活 OpenAI 协议接入点（DeepSeek / Qwen / Gemini 等）时，
# 后端会 spawn bridge-server.mjs：本地起一个 Anthropic 端点，使用
# llm-bridge 的 universal format 双向翻译，转发到上游 OpenAI 兼容 API。
echo ""
echo "▶ [3.5] 准备 Bridge 路由层 (llm-bridge)..."
BRIDGE_BUNDLE_DIR="$RESOURCES_DIR/bridge"
mkdir -p "$BRIDGE_BUNDLE_DIR"

# bridge-server.mjs / package.json / wrapper 已随仓库提交，这里仅装依赖
if [ ! -f "$BRIDGE_BUNDLE_DIR/bridge-server.mjs" ]; then
  echo "  ✗ 缺少 $BRIDGE_BUNDLE_DIR/bridge-server.mjs (仓库不完整)" >&2
  exit 1
fi
if [ ! -f "$BRIDGE_BUNDLE_DIR/package.json" ]; then
  echo "  ✗ 缺少 $BRIDGE_BUNDLE_DIR/package.json (仓库不完整)" >&2
  exit 1
fi
chmod +x "$BRIDGE_BUNDLE_DIR/bridge"

pushd "$BRIDGE_BUNDLE_DIR" > /dev/null
echo "  ▸ 安装 llm-bridge..."
npm install --omit=dev --no-audit --no-fund --loglevel=error || {
  echo "  ⚠️  llm-bridge 安装失败，OpenAI 协议供应商在打包后将不可用"
}
popd > /dev/null

echo "  ✓ Bridge 路由层已就绪: $(du -sh "$BRIDGE_BUNDLE_DIR" 2>/dev/null | cut -f1)"

# ── 4. 内嵌 Node.js 二进制（claude CLI 运行时）────────────────────
echo ""
echo "▶ [4/5] 准备 Node.js 运行时..."
NODE_BIN_DIR="$RESOURCES_DIR/node-bin"
mkdir -p "$NODE_BIN_DIR"

NODE_PATH="$(which node)"
NODE_ARCH="$(node -e 'console.log(process.arch)')"

if [ "$NODE_ARCH" != "arm64" ]; then
  echo "  ⚠️  警告：当前 node 架构为 $NODE_ARCH，目标为 arm64"
fi

cp "$NODE_PATH" "$NODE_BIN_DIR/node"
chmod +x "$NODE_BIN_DIR/node"
echo "  ✓ Node.js 已复制: $NODE_PATH (arch: $NODE_ARCH, $(du -sh "$NODE_BIN_DIR/node" | cut -f1))"

# Homebrew 的 node 在部分环境下是动态链接，运行时需要 libnode*.dylib
# 打包时一并复制，避免安装后报 dyld: Library not loaded
NODE_REAL="$NODE_PATH"
if [ -L "$NODE_PATH" ]; then
  NODE_REAL_LINK="$(readlink "$NODE_PATH")"
  if [[ "$NODE_REAL_LINK" != /* ]]; then
    NODE_REAL="$(dirname "$NODE_PATH")/$NODE_REAL_LINK"
  else
    NODE_REAL="$NODE_REAL_LINK"
  fi
fi

NODE_LIB_DIR="$(dirname "$NODE_REAL")/../lib"
COPIED_LIBNODE=0
for libnode in "$NODE_LIB_DIR"/libnode*.dylib; do
  if [ -e "$libnode" ]; then
    cp "$libnode" "$NODE_BIN_DIR/"
    chmod +x "$NODE_BIN_DIR/$(basename "$libnode")"
    COPIED_LIBNODE=1
  fi
done

if [ "$COPIED_LIBNODE" = "1" ]; then
  echo "  ✓ 已复制 libnode 动态库到 node-bin/"
else
  echo "  ℹ 未发现 libnode 动态库（当前 node 可能是静态/独立构建）"
fi

# ── 5. 打包 Electron App ─────────────────────────────────────────
echo ""
echo "▶ [5/5] 安装 Electron 依赖并打包..."
cd "$ELECTRON_DIR"
npm install --silent
npm run dist:mac

echo ""
echo "========================================"
echo "  ✓ 构建完成！"
echo "  输出目录: $ROOT_DIR/dist-electron"
echo "========================================"
ls -lh "$ROOT_DIR/dist-electron/" 2>/dev/null || true
