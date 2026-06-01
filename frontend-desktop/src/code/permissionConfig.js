/**
 * 工具风险分级配置
 * low: 只读操作，自动放行
 * medium: 可逆写入，提示但可配置自动放行
 * high: 不可逆操作，必须人工确认
 */

export const TOOL_RISK_LEVELS = {
  // 低风险 - 只读
  Read: 'low',
  Glob: 'low',
  Grep: 'low',
  SemanticSearch: 'low',
  ReadLints: 'low',
  WebSearch: 'low',
  WebFetch: 'low',
  TodoWrite: 'low',
  TodoRead: 'low',
  AskQuestion: 'low',

  // 中风险 - 可逆写入
  Write: 'medium',
  StrReplace: 'medium',
  EditNotebook: 'medium',
  Shell: 'medium',

  // 高风险 - 不可逆/系统级操作
  Delete: 'high',
  SwitchMode: 'high',
};

export const RISK_META = {
  low: { label: '低风险', color: 'green', autoApprove: true, description: '只读操作，自动放行' },
  medium: { label: '中风险', color: 'amber', autoApprove: false, description: '文件写入/命令执行，可配置自动放行' },
  high: { label: '高风险', color: 'red', autoApprove: false, description: '不可逆操作，必须人工确认' },
};

export function getToolRiskLevel(toolName) {
  return TOOL_RISK_LEVELS[toolName] || 'medium';
}

export function shouldAutoApprove(toolName, settings = {}) {
  const level = getToolRiskLevel(toolName);

  if (level === 'low') return true;
  if (level === 'high') return false;

  // medium 级别查询白名单
  if (settings.whitelist?.includes(toolName)) return true;
  if (settings.autoApproveMedium) return true;

  return false;
}

/**
 * 默认权限设置
 */
export const DEFAULT_PERMISSION_SETTINGS = {
  mode: 'managed',
  autoApproveMedium: false,
  whitelist: [],
  blacklist: [],
  requireConfirmForShell: true,
  requireConfirmForDelete: true,
};
