#!/bin/bash
# MySQL 每日备份脚本
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-./backups/mysql}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/lingxi_${STAMP}.sql.gz"
mysqldump -h "${MYSQL_HOST:-127.0.0.1}" -u"${MYSQL_USER:-lingxi}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE:-lingxi}" | gzip > "$FILE"
find "$BACKUP_DIR" -name 'lingxi_*.sql.gz' -mtime +"$RETAIN_DAYS" -delete
echo "Backup: $FILE"
