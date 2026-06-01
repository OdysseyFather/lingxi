/**
 * Coding View 专属主题系统
 * 5 套内置主题 + 自定义色彩变量
 */

export const CODING_THEMES = {
  warm: {
    id: 'warm',
    name: '暖光',
    description: '默认暖色调，护眼舒适',
    colors: {
      '--coding-bg': '#fdfcfa',
      '--coding-surface': '#faf8f5',
      '--coding-surface-raised': '#f5f2ed',
      '--coding-border': '#e8e0d8',
      '--coding-text': '#1a1a1a',
      '--coding-text-soft': '#555',
      '--coding-text-faint': '#999',
      '--coding-accent': '#c4a882',
      '--coding-accent-soft': '#f5f0eb',
    },
  },
  dark: {
    id: 'dark',
    name: '深夜',
    description: '深色主题，减少视觉疲劳',
    colors: {
      '--coding-bg': '#1e1e1e',
      '--coding-surface': '#252526',
      '--coding-surface-raised': '#2d2d30',
      '--coding-border': '#3e3e42',
      '--coding-text': '#e0e0e0',
      '--coding-text-soft': '#aaa',
      '--coding-text-faint': '#666',
      '--coding-accent': '#d4a574',
      '--coding-accent-soft': '#3a3228',
    },
  },
  midnight: {
    id: 'midnight',
    name: '午夜蓝',
    description: '蓝调深色主题',
    colors: {
      '--coding-bg': '#0d1117',
      '--coding-surface': '#161b22',
      '--coding-surface-raised': '#21262d',
      '--coding-border': '#30363d',
      '--coding-text': '#c9d1d9',
      '--coding-text-soft': '#8b949e',
      '--coding-text-faint': '#484f58',
      '--coding-accent': '#58a6ff',
      '--coding-accent-soft': '#1c3152',
    },
  },
  forest: {
    id: 'forest',
    name: '森林',
    description: '绿色自然主题',
    colors: {
      '--coding-bg': '#fafdf8',
      '--coding-surface': '#f5faf2',
      '--coding-surface-raised': '#eef5ea',
      '--coding-border': '#d4e5cc',
      '--coding-text': '#1a2e1a',
      '--coding-text-soft': '#4a6a4a',
      '--coding-text-faint': '#8aaa8a',
      '--coding-accent': '#4a9a4a',
      '--coding-accent-soft': '#e5f2e5',
    },
  },
  sakura: {
    id: 'sakura',
    name: '樱花',
    description: '粉色柔和主题',
    colors: {
      '--coding-bg': '#fdfafe',
      '--coding-surface': '#faf5fa',
      '--coding-surface-raised': '#f5eef5',
      '--coding-border': '#e8d8e8',
      '--coding-text': '#2a1a2a',
      '--coding-text-soft': '#6a4a6a',
      '--coding-text-faint': '#aa88aa',
      '--coding-accent': '#c87da8',
      '--coding-accent-soft': '#f5eaf2',
    },
  },
};

export function applyCodingTheme(themeId) {
  const theme = CODING_THEMES[themeId];
  if (!theme) return;

  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  localStorage.setItem('lingxi-coding-theme', themeId);
}

export function getCurrentCodingTheme() {
  return localStorage.getItem('lingxi-coding-theme') || 'warm';
}
