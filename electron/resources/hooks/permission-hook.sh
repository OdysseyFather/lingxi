#!/bin/bash
# 灵犀 PreToolUse Hook：调用后端权限检查 API
# 读取 stdin JSON → POST 到后端 → 根据返回决定 allow/deny/ask

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq '.tool_input // {}')

LINGXI_PORT="${LINGXI_PORT:-3001}"
BASE="http://127.0.0.1:${LINGXI_PORT}/api"

RESPONSE=$(curl -s -X POST "${BASE}/permission/check" \
  -H "Content-Type: application/json" \
  -d "{\"tool_name\":\"${TOOL_NAME}\",\"tool_input\":${TOOL_INPUT}}" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
  exit 0
fi

BEHAVIOR=$(echo "$RESPONSE" | jq -r '.behavior // "allow"')

case "$BEHAVIOR" in
  "allow")
    exit 0
    ;;
  "deny")
    REASON=$(echo "$RESPONSE" | jq -r '.reason // "操作被权限规则禁止"')
    echo "$REASON" >&2
    exit 2
    ;;
  "ask")
    APPROVAL_ID=$(echo "$RESPONSE" | jq -r '.approval_id // ""')
    if [ -z "$APPROVAL_ID" ] || [ "$APPROVAL_ID" = "null" ]; then
      exit 0
    fi
    TIMEOUT=120
    ELAPSED=0
    while [ $ELAPSED -lt $TIMEOUT ]; do
      sleep 2
      ELAPSED=$((ELAPSED + 2))
      STATUS_RESP=$(curl -s "${BASE}/approvals/${APPROVAL_ID}/status" 2>/dev/null)
      STATUS=$(echo "$STATUS_RESP" | jq -r '.status // "pending"')
      case "$STATUS" in
        "approved")
          exit 0
          ;;
        "rejected")
          echo "用户拒绝了此操作" >&2
          exit 2
          ;;
      esac
    done
    echo "审批超时，操作被阻止" >&2
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
