/**
 * Coding View 快捷键体系
 */

export const SHORTCUTS = [
  { key: 'Cmd+Enter', action: 'send', label: '发送消息' },
  { key: 'Cmd+K', action: 'search', label: '全局搜索' },
  { key: 'Cmd+N', action: 'newSession', label: '新建会话' },
  { key: 'Cmd+B', action: 'toggleSidebar', label: '收起/展开左栏' },
  { key: 'Cmd+/', action: 'shortcuts', label: '快捷键面板' },
  { key: 'Cmd+.', action: 'abort', label: '中止当前操作' },
  { key: 'Cmd+Shift+D', action: 'toggleDiff', label: '打开/关闭 Diff 面板' },
  { key: 'Cmd+`', action: 'toggleTerminal', label: '切换终端' },
  { key: 'Cmd+1', action: 'modeNormal', label: '切换到普通模式' },
  { key: 'Cmd+2', action: 'modePlan', label: '切换到 Plan 模式' },
  { key: 'Cmd+3', action: 'modeThink', label: '切换到 Think 模式' },
  { key: 'Escape', action: 'escape', label: '关闭弹窗/取消' },
];

export function formatShortcut(key) {
  const isMac = navigator.platform.includes('Mac');
  return key
    .replace('Cmd', isMac ? '⌘' : 'Ctrl')
    .replace('Shift', isMac ? '⇧' : 'Shift')
    .replace('Enter', '↵')
    .replace('Escape', 'Esc');
}

export function matchShortcut(e, key) {
  const parts = key.toLowerCase().split('+');
  const needCmd = parts.includes('cmd');
  const needShift = parts.includes('shift');
  const actualKey = parts.filter(p => p !== 'cmd' && p !== 'shift')[0];

  const hasCmd = e.metaKey || e.ctrlKey;
  const hasShift = e.shiftKey;

  if (needCmd && !hasCmd) return false;
  if (!needCmd && hasCmd) return false;
  if (needShift && !hasShift) return false;
  if (!needShift && hasShift && actualKey !== 'escape') return false;

  if (actualKey === 'enter') return e.key === 'Enter';
  if (actualKey === 'escape') return e.key === 'Escape';
  if (actualKey === '`') return e.key === '`';
  if (actualKey === '/') return e.key === '/';
  if (actualKey === '.') return e.key === '.';
  return e.key.toLowerCase() === actualKey;
}
