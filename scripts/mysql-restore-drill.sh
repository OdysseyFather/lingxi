#!/bin/bash
# MySQL 恢复演练（每月执行，验证备份可用）
set -euo pipefail
BACKUP="${1:-}"
if [ -z "$BACKUP" ]; then
  echo "用法: $0 backups/mysql/lingxi_YYYYMMDD.sql.gz"
  exit 1
fi
TEST_DB="lingxi_restore_drill"
mysql -h "${MYSQL_HOST:-127.0.0.1}" -u"${MYSQL_USER:-root}" -p"${MYSQL_ROOT_PASSWORD}" -e "DROP DATABASE IF EXISTS ${TEST_DB}; CREATE DATABASE ${TEST_DB};"
gunzip -c "$BACKUP" | mysql -h "${MYSQL_HOST:-127.0.0.1}" -u"${MYSQL_USER:-root}" -p"${MYSQL_ROOT_PASSWORD}" "$TEST_DB"
COUNT=$(mysql -h "${MYSQL_HOST:-127.0.0.1}" -u"${MYSQL_USER:-root}" -p"${MYSQL_ROOT_PASSWORD}" -N -e "SELECT COUNT(1) FROM information_schema.tables WHERE table_schema='${TEST_DB}'")
mysql -h "${MYSQL_HOST:-127.0.0.1}" -u"${MYSQL_USER:-root}" -p"${MYSQL_ROOT_PASSWORD}" -e "DROP DATABASE ${TEST_DB};"
echo "Restore drill OK: ${COUNT} tables restored"
