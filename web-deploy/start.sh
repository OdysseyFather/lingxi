#!/bin/bash
# ─── 灵犀 Web 多用户版启动脚本 ────────────────────────────────
# 环境变量:
#   MYSQL_DSN        (必填) MySQL 连接串
#   JWT_SECRET       (必填) JWT 签名密钥
#   PORT             (可选) 网关端口，默认 3000
#   BACKEND_PORT     (可选) 后端端口，默认 13001
#   DATA_DIR         (可选) 用户数据目录，默认 ./data
#   ADMIN_BOOTSTRAP  (可选) 首次 admin:password
#   OPEN_REGISTRATION (可选) true/false

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -z "$MYSQL_DSN" ]; then
    echo "错误: 请设置 MYSQL_DSN"
    exit 1
fi
if [ -z "$JWT_SECRET" ]; then
    echo "错误: 请设置 JWT_SECRET"
    exit 1
fi

export PORT="${PORT:-3000}"
export BACKEND_PORT="${BACKEND_PORT:-13001}"
export DATA_DIR="${DATA_DIR:-./data}"
export FRONTEND_DIST="${FRONTEND_DIST:-./dist}"
export BACKEND_BIN="${BACKEND_BIN:-./smart-agent}"

mkdir -p "$DATA_DIR"

echo "灵犀 Web 多用户版启动中..."
echo "  网关端口: $PORT"
echo "  后端端口: $BACKEND_PORT"
echo "  数据目录: $DATA_DIR"

exec ./web-gateway
