# ─── 灵犀 Web 版 Docker 构建 ─────────────────────────────────
# 多阶段构建：Go 后端 + Web 网关 + React 前端 + Claude CLI
#
# 构建命令（在项目根目录执行）:
#   docker build -f web-server/Dockerfile -t lingxi-web .
#
# 运行命令:
#   docker run -d -p 3000:3000 \
#     -e WEB_PASSWORD=your_password \
#     -e ANTHROPIC_AUTH_TOKEN=sk-xxx \
#     -v lingxi-data:/data \
#     lingxi-web

# ─── 阶段 1: 编译 Go 后端 ────────────────────────────────────
FROM golang:1.24-alpine AS backend-builder
RUN apk add --no-cache git
WORKDIR /build
COPY backend-desktop/go.mod backend-desktop/go.sum ./
RUN go mod download
COPY backend-desktop/ .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o smart-agent .

# ─── 阶段 2: 编译 Web 网关 ───────────────────────────────────
FROM golang:1.24-alpine AS gateway-builder
WORKDIR /build
COPY web-server/go.mod ./
RUN go mod download
COPY web-server/ .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o web-gateway .

# ─── 阶段 3: 构建前端 ────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /build
COPY frontend-desktop/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend-desktop/ .
RUN npm run build

# ─── 阶段 4: 运行时（alpine 基础镜像 + Node.js for Claude CLI）──
FROM node:22-alpine

# 安装 Claude CLI（AI 引擎）+ 必要的运行时依赖
RUN apk add --no-cache bash curl && \
    npm install -g @anthropic-ai/claude-code 2>/dev/null || true && \
    npm cache clean --force && \
    rm -rf /tmp/* /root/.npm

WORKDIR /app

# 复制构建产物
COPY --from=backend-builder /build/smart-agent ./smart-agent
COPY --from=gateway-builder /build/web-gateway ./web-gateway
COPY --from=frontend-builder /build/dist ./dist
COPY web-server/static ./static

# 创建数据目录
RUN mkdir -p /data/uploads /data/knowledge

# 环境变量默认值
ENV DATA_DIR=/data
ENV FRONTEND_DIST=./dist
ENV BACKEND_BIN=./smart-agent
ENV PORT=3000

EXPOSE 3000

# 数据卷
VOLUME ["/data"]

# 入口
CMD ["./web-gateway"]
