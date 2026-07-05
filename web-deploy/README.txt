灵犀 AI Agent — Web 多用户版部署包 (darwin arm64)
================================

快速启动:
  1. 准备 MySQL 8 并创建数据库 lingxi
  2. 设置环境变量并启动:
     export MYSQL_DSN="user:pass@tcp(localhost:3306)/lingxi?parseTime=true&charset=utf8mb4"
     export JWT_SECRET="your-random-secret"
     export ADMIN_BOOTSTRAP="admin:yourpassword"   # 首次创建管理员（可选）
     ./start.sh

  3. 浏览器访问 http://localhost:3000
  4. 管理员登录后可在「设置 > 管理后台」生成邀请码
  5. 在「设置 > 接入点」中配置模型供应商 API Key

环境变量:
  MYSQL_DSN           (必填) MySQL 连接串
  JWT_SECRET          (必填) JWT 签名密钥
  PORT                (可选) 网关端口，默认 3000
  BACKEND_PORT        (可选) 后端端口，默认 13001
  DATA_DIR            (可选) 用户数据目录，默认 ./data
  ADMIN_BOOTSTRAP     (可选) 首次 admin:password 创建管理员
  OPEN_REGISTRATION   (可选) true 开放注册 / false 仅邀请码（默认 false）

Docker 多用户部署:
  cd web-server && docker compose -f docker-compose.web.yml up -d --build

注意事项:
  - 公网部署请配置 HTTPS 反向代理（Nginx/Caddy）
  - 定期备份 MySQL：scripts/mysql-backup.sh
