export function parseAssistantContent(content) {
  if (!content) return [];
  try {
    const arr = JSON.parse(content);
    if (Array.isArray(arr)) return arr;
  } catch {
    // 兼容历史纯文本消息。
  }
  return [{ type: 'text', text: String(content) }];
}

export function formatNum(n) {
  if (!n) return 0;
  if (n < 1000) return n;
  if (n < 1000000) return (n / 1000).toFixed(1) + 'k';
  return (n / 1000000).toFixed(2) + 'M';
}

