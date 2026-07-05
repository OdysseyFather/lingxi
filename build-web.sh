#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT/frontend-web"
BACKEND_DIR="$ROOT/backend-web"
EMBED_DIR="$BACKEND_DIR/frontend_dist"
OUTPUT="$BACKEND_DIR/lingxi-web"

# 确保 Node.js 版本足够（Vite 8 要求 ≥20.19 或 ≥22.12）
if [ -d "/tmp/node22/bin" ]; then
  export PATH="/tmp/node22/bin:$PATH"
fi

echo "=== [1/4] 构建前端 ==="
cd "$FRONTEND_DIR"
if [ ! -d node_modules ]; then
  npm install --prefer-offline 2>/dev/null || npm install
fi
npm run build

echo ""
echo "=== [2/4] 复制前端产物到嵌入目录 ==="
rm -rf "$EMBED_DIR"
cp -r "$FRONTEND_DIR/dist" "$EMBED_DIR"
echo "已复制 $(find "$EMBED_DIR" -type f | wc -l | tr -d ' ') 个文件到 $EMBED_DIR"

echo ""
echo "=== [3/4] 编译 Go 后端 ==="
cd "$BACKEND_DIR"

# 默认构建当前平台
GOOS_TARGET="${GOOS:-$(go env GOOS)}"
GOARCH_TARGET="${GOARCH:-$(go env GOARCH)}"

# 输出文件名
if [ "$GOOS_TARGET" = "windows" ]; then
  OUTPUT="${OUTPUT}.exe"
fi

echo "目标平台: ${GOOS_TARGET}/${GOARCH_TARGET}"
CGO_ENABLED=0 GOOS="$GOOS_TARGET" GOARCH="$GOARCH_TARGET" go build \
  -ldflags="-s -w" \
  -o "$OUTPUT" \
  .

echo ""
echo "=== [4/4] 构建完成 ==="
SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
echo "产物: $OUTPUT ($SIZE)"
echo ""
echo "使用方式："
echo "  MYSQL_DSN='user:pass@tcp(host:3306)/lingxi' JWT_SECRET='xxx' $OUTPUT"
echo ""
echo "可选环境变量："
echo "  PORT              监听端口（默认 13001）"
echo "  DATA_DIR          数据目录（默认 ./data）"
echo "  OPEN_REGISTRATION 开放注册（true/false，默认 false）"
echo "  ADMIN_BOOTSTRAP   初始管理员（格式 username:password）"
echo "  FRONTEND_DIST     外部前端目录（默认使用内嵌资源）"
echo "  CLAUDE_BIN        Claude CLI 路径（自动探测）"
