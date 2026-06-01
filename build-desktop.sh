#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend-desktop"
FRONTEND_DIR="$ROOT_DIR/frontend-desktop"
ELECTRON_DIR="$ROOT_DIR/electron"
RESOURCES_DIR="$ELECTRON_DIR/resources"

# ── 解析目标平台 ───────────────────────────────────────────────
TARGET="${1:-all}"  # mac | win | all
case "$TARGET" in
  mac|darwin)  BUILD_TARGETS="mac" ;;
  win|windows) BUILD_TARGETS="win" ;;
  all)         BUILD_TARGETS="mac win" ;;
  *)           echo "用法: $0 [mac|win|all]"; exit 1 ;;
esac

# ── 自动递增版本号（patch +1）──────────────────────────────────
PKG_JSON="$ELECTRON_DIR/package.json"
CURRENT_VERSION=$(node -e "console.log(require('$PKG_JSON').version)")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$PKG_JSON', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('$PKG_JSON', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  ✓ 版本号: $CURRENT_VERSION → $NEW_VERSION"

echo "========================================"
echo "  灵犀 桌面客户端构建脚本 (Go + AI Engine)"
echo "  目标平台: $BUILD_TARGETS | 版本: $NEW_VERSION"
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

for bt in $BUILD_TARGETS; do
  if [ "$bt" = "mac" ]; then
    GOOS=darwin GOARCH=arm64 "$GO_BIN" build -o smart-agent .
    chmod +x smart-agent
    echo "  ✓ Go 后端 (macOS arm64) 编译完成: $(du -sh "$BACKEND_DIR/smart-agent" | cut -f1)"
  fi
  if [ "$bt" = "win" ]; then
    GOOS=windows GOARCH=amd64 "$GO_BIN" build -o smart-agent.exe .
    echo "  ✓ Go 后端 (Windows amd64) 编译完成: $(du -sh "$BACKEND_DIR/smart-agent.exe" | cut -f1)"
  fi
done

# ── 2. 构建前端 ──────────────────────────────────────────────────
echo ""
echo "▶ [2/5] 构建前端..."
cd "$FRONTEND_DIR"

# 强制使用 Node 22（Vite 8 要求 ≥20.19 或 ≥22.12）
if [ -d "/tmp/node22/bin" ]; then
  export PATH="/tmp/node22/bin:$PATH"
  echo "  ✓ 使用 Node 22 (Vite 8 兼容)"
else
  echo "  ⚠️  未找到 /tmp/node22，使用系统 Node"
fi

npm install --silent
npm run build
echo "  ✓ 前端构建完成: $(du -sh "$FRONTEND_DIR/dist" | cut -f1)"

# dot-skill 内置（可选，失败不阻断构建）
if [ -x "$ROOT_DIR/scripts/fetch-dot-skill.sh" ]; then
  echo ""
  echo "▶ [2b] 拉取 dot-skill 内置技能..."
  bash "$ROOT_DIR/scripts/fetch-dot-skill.sh" || echo "  ⚠️  dot-skill 拉取失败，可在应用内一键安装"
fi

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

  # 检测 cli.js 的实际类型，创建正确的包装脚本
  CLI_FILE_TYPE="$(file -b "$CLAUDE_CODE_DIR/cli.js" 2>/dev/null || echo 'unknown')"
  if echo "$CLI_FILE_TYPE" | grep -q "Mach-O\|executable\|ELF"; then
    # cli.js 是原生二进制（SEA 或编译产物），直接执行
    cat > "$CLAUDE_CODE_DIR/lingxi" << 'WRAPPER_EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/cli.js" "$@"
WRAPPER_EOF
    echo "  ✓ 创建了包装脚本 lingxi（原生二进制模式）"
  else
    # cli.js 是 JavaScript 文件，通过内置 node 运行
    cat > "$CLAUDE_CODE_DIR/lingxi" << 'WRAPPER_EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$SCRIPT_DIR/../node-bin/node"
CLI_JS="$SCRIPT_DIR/cli.js"
exec "$NODE_BIN" "$CLI_JS" "$@"
WRAPPER_EOF
    echo "  ✓ 创建了包装脚本 lingxi（Node.js 模式）"
  fi
  chmod +x "$CLAUDE_CODE_DIR/lingxi"

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

# ── 3.6 准备 whisper.cpp 离线语音识别（仅 macOS）──────────────────
if [[ "$BUILD_TARGETS" == *"mac"* ]]; then
echo ""
echo "▶ [3.6] 准备 whisper.cpp 离线语音识别..."
WHISPER_DIR="$RESOURCES_DIR/whisper"
mkdir -p "$WHISPER_DIR"

WHISPER_BIN="$WHISPER_DIR/whisper-cli"
WHISPER_MODEL="$WHISPER_DIR/ggml-base.bin"

if [ ! -f "$WHISPER_BIN" ]; then
  BREW_WHISPER="$(which whisper-cli 2>/dev/null || echo '')"
  if [ -n "$BREW_WHISPER" ] && [ -x "$BREW_WHISPER" ]; then
    cp "$BREW_WHISPER" "$WHISPER_BIN"
    chmod +x "$WHISPER_BIN"
    echo "  ✓ whisper-cli 已从系统复制: $BREW_WHISPER"
  else
    echo "  ▸ 从源码编译 whisper.cpp..."
    WHISPER_SRC="/tmp/whisper-cpp-src"
    if [ ! -d "$WHISPER_SRC" ]; then
      git clone --depth=1 https://github.com/ggml-org/whisper.cpp.git "$WHISPER_SRC" 2>/dev/null
    fi
    if [ -d "$WHISPER_SRC" ]; then
      pushd "$WHISPER_SRC" > /dev/null
      cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_METAL=ON 2>/dev/null
      cmake --build build --config Release -j$(sysctl -n hw.ncpu) 2>/dev/null
      if [ -f "build/bin/whisper-cli" ]; then
        cp "build/bin/whisper-cli" "$WHISPER_BIN"
        chmod +x "$WHISPER_BIN"
        echo "  ✓ whisper-cli 编译完成"
      else
        echo "  ⚠️  whisper-cli 编译失败（语音识别将仅支持远端 API）"
      fi
      popd > /dev/null
    else
      echo "  ⚠️  whisper.cpp 仓库克隆失败，跳过"
    fi
  fi
else
  echo "  ✓ whisper-cli 已存在"
fi

if [ ! -f "$WHISPER_MODEL" ]; then
  echo "  ▸ 下载 ggml-base 模型 (~148MB)..."
  MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
  if curl -fsSL "$MODEL_URL" -o "$WHISPER_MODEL" 2>/dev/null; then
    echo "  ✓ ggml-base.bin 已下载: $(du -sh "$WHISPER_MODEL" | cut -f1)"
  else
    echo "  ⚠️  模型下载失败（语音识别将仅支持远端 API）"
    rm -f "$WHISPER_MODEL"
  fi
else
  echo "  ✓ ggml-base.bin 已存在: $(du -sh "$WHISPER_MODEL" | cut -f1)"
fi
else
  echo ""
  echo "▶ [3.6] 跳过 whisper.cpp（仅 macOS 支持离线语音识别）"
fi

# ── 3.7 安装 SDK Runner 依赖 ────────────────────────────────────
echo ""
echo "▶ [3.7] 安装 SDK Runner 依赖..."
SDK_RUNNER_DIR="$RESOURCES_DIR/sdk-runner"
if [ -f "$SDK_RUNNER_DIR/package.json" ]; then
  pushd "$SDK_RUNNER_DIR" > /dev/null
  NPM_CONFIG_CACHE=/tmp/npm-lingxi-cache npm install --omit=dev --no-audit --no-fund --loglevel=error 2>&1 || {
    echo "  ⚠️  SDK Runner 依赖安装失败"
  }
  popd > /dev/null
  echo "  ✓ SDK Runner 已就绪: $(du -sh "$SDK_RUNNER_DIR" | cut -f1)"
else
  echo "  ⚠️  未找到 $SDK_RUNNER_DIR/package.json，跳过"
fi

# ── 4. 内嵌 Node.js 二进制（claude CLI 运行时）────────────────────
echo ""
echo "▶ [4/5] 准备 Node.js 运行时..."

NODE_VERSION="${NODE_VERSION:-v22.15.0}"

for bt in $BUILD_TARGETS; do
  if [ "$bt" = "mac" ]; then
    NODE_BIN_DIR="$RESOURCES_DIR/node-bin"
    mkdir -p "$NODE_BIN_DIR"

    NODE_PATH="$(which node)"
    NODE_ARCH="$(node -e 'console.log(process.arch)')"

    if [ "$NODE_ARCH" != "arm64" ]; then
      echo "  ⚠️  警告：当前 node 架构为 $NODE_ARCH，目标为 arm64"
    fi

    cp "$NODE_PATH" "$NODE_BIN_DIR/node"
    chmod +x "$NODE_BIN_DIR/node"
    echo "  ✓ Node.js (macOS) 已复制: $NODE_PATH (arch: $NODE_ARCH, $(du -sh "$NODE_BIN_DIR/node" | cut -f1))"

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
  fi

  if [ "$bt" = "win" ]; then
    NODE_BIN_WIN_DIR="$RESOURCES_DIR/node-bin-win"
    mkdir -p "$NODE_BIN_WIN_DIR"

    if [ ! -f "$NODE_BIN_WIN_DIR/node.exe" ]; then
      echo "  ▸ 下载 Node.js $NODE_VERSION (Windows x64)..."
      NODE_WIN_URL="https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe"
      if curl -fsSL "$NODE_WIN_URL" -o "$NODE_BIN_WIN_DIR/node.exe"; then
        echo "  ✓ Node.js (Windows x64) 已下载: $(du -sh "$NODE_BIN_WIN_DIR/node.exe" | cut -f1)"
      else
        echo "  ✗ Node.js (Windows x64) 下载失败" >&2
        exit 1
      fi
    else
      echo "  ✓ Node.js (Windows x64) 已存在: $(du -sh "$NODE_BIN_WIN_DIR/node.exe" | cut -f1)"
    fi
  fi
done

# ── 5. 打包 Electron App ─────────────────────────────────────────
echo ""
echo "▶ [5/5] 安装 Electron 依赖并打包..."
cd "$ELECTRON_DIR"
npm install --silent

for bt in $BUILD_TARGETS; do
  if [ "$bt" = "mac" ]; then
    echo "  ▸ 打包 macOS..."
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    npm run dist:mac
  fi
  if [ "$bt" = "win" ]; then
    echo "  ▸ 打包 Windows..."
    # 为 Windows 创建 lingxi.cmd 包装脚本
    CLAUDE_CODE_DIR="$RESOURCES_DIR/ai-engine"
    if [ ! -f "$CLAUDE_CODE_DIR/lingxi.cmd" ] && [ -f "$CLAUDE_CODE_DIR/cli.js" ]; then
      cat > "$CLAUDE_CODE_DIR/lingxi.cmd" << 'WIN_WRAPPER_EOF'
@echo off
set SCRIPT_DIR=%~dp0
set NODE_BIN=%SCRIPT_DIR%..\node-bin\node.exe
set CLI_JS=%SCRIPT_DIR%cli.js
"%NODE_BIN%" "%CLI_JS%" %*
WIN_WRAPPER_EOF
      echo "  ✓ 创建了 Windows 包装脚本 lingxi.cmd"
    fi
    npm run dist:win
  fi
done

echo ""
echo "========================================"
echo "  ✓ 构建完成！版本: $NEW_VERSION"
echo "  输出目录: $ROOT_DIR/dist-electron"
echo "========================================"
ls -lh "$ROOT_DIR/dist-electron/" 2>/dev/null || true

# ── 6. 自动安装到 /Applications（仅 macOS）──────────────────────
for bt in $BUILD_TARGETS; do
  if [ "$bt" = "mac" ]; then
    APP_SRC="$ROOT_DIR/dist-electron/mac-arm64/灵犀.app"
    APP_DST="/Applications/灵犀.app"
    if [ -d "$APP_SRC" ]; then
      echo ""
      echo "▶ [6/6] 安装到 /Applications..."
      # 杀掉正在运行的旧版本进程
      pkill -f "$APP_DST/Contents/MacOS" 2>/dev/null || true
      sleep 1
      rm -rf "$APP_DST"
      cp -R "$APP_SRC" "$APP_DST"
      echo "  ✓ 已安装到 $APP_DST (v$NEW_VERSION)"
      echo ""
      echo "  启动命令: open \"$APP_DST\""
    fi
  fi
done

