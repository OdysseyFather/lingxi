import { api } from '../../api/client';

export const createCodingSlice = (set, get) => ({
  // Coding 模式的项目路径
  codingProjectPath: localStorage.getItem('lingxi-code-project-path') || '',
  setCodingProjectPath: (p) => {
    localStorage.setItem('lingxi-code-project-path', p);
    set({ codingProjectPath: p });
  },

  // 工作区文件变更
  workspaceChanges: [],
  loadingChanges: false,
  refreshWorkspaceChanges: async () => {
    const path = get().codingProjectPath;
    if (!path) return;
    set({ loadingChanges: true });
    try {
      const res = await api.getCodingChanges(path);
      set({ workspaceChanges: res.changes || [] });
    } catch {
      set({ workspaceChanges: [] });
    }
    set({ loadingChanges: false });
  },

  // Diff 查看
  activeDiff: null,
  loadDiff: async (file) => {
    const path = get().codingProjectPath;
    if (!path) return;
    try {
      const res = await api.getCodingDiff(path, file);
      set({ activeDiff: res });
    } catch {
      set({ activeDiff: null });
    }
  },
  clearDiff: () => set({ activeDiff: null }),

  // 实时文件修改 diff 列表
  liveDiffs: [],
  clearLiveDiffs: () => set({ liveDiffs: [] }),

  // Task Todo List 状态
  codingTasks: [],
  addCodingTask: (task) => set((s) => ({
    codingTasks: [...s.codingTasks, { id: Date.now(), status: 'pending', ...task }],
  })),
  updateCodingTask: (id, updates) => set((s) => ({
    codingTasks: s.codingTasks.map(t => t.id === id ? { ...t, ...updates } : t),
  })),
  clearCodingTasks: () => set({ codingTasks: [] }),

  // Agent Team 状态
  codingTeam: null,
  setCodingTeam: (team) => set({ codingTeam: team }),

  // 思考模式开关
  codingThinkingEnabled: localStorage.getItem('lingxi-coding-thinking') !== 'false',
  setCodingThinkingEnabled: (v) => {
    localStorage.setItem('lingxi-coding-thinking', v ? 'true' : 'false');
    set({ codingThinkingEnabled: v });
  },

  // 交互模式切换（normal=直接执行, plan=先规划再执行, think=深度思考）
  codingMode: localStorage.getItem('lingxi-coding-mode') || 'normal',
  setCodingMode: (mode) => {
    localStorage.setItem('lingxi-coding-mode', mode);
    set({ codingMode: mode, codingThinkingEnabled: mode === 'think' });
  },

  // 权限管控模式（trust=全部自动放行, managed=分级管控, strict=所有写入需确认）
  codingPermissionMode: localStorage.getItem('lingxi-coding-permission-mode') || 'managed',
  setCodingPermissionMode: (mode) => {
    localStorage.setItem('lingxi-coding-permission-mode', mode);
    set({ codingPermissionMode: mode });
  },

  // 权限白名单/黑名单
  codingPermissionWhitelist: JSON.parse(localStorage.getItem('lingxi-coding-perm-whitelist') || '[]'),
  codingPermissionBlacklist: JSON.parse(localStorage.getItem('lingxi-coding-perm-blacklist') || '[]'),
  updatePermissionLists: (whitelist, blacklist) => {
    localStorage.setItem('lingxi-coding-perm-whitelist', JSON.stringify(whitelist));
    localStorage.setItem('lingxi-coding-perm-blacklist', JSON.stringify(blacklist));
    set({ codingPermissionWhitelist: whitelist, codingPermissionBlacklist: blacklist });
  },

  // Coding View 主题
  codingTheme: localStorage.getItem('lingxi-coding-theme') || 'warm',
  setCodingTheme: (themeId) => {
    localStorage.setItem('lingxi-coding-theme', themeId);
    set({ codingTheme: themeId });
  },

  // Diff 预览（右侧 Drawer 自动弹出）
  codingActiveDiff: null, // { filePath, diffText }
  setCodingActiveDiff: (diff) => set({ codingActiveDiff: diff }),
  clearCodingActiveDiff: () => set({ codingActiveDiff: null }),

  // 文件树动态高亮（Agent 正在操作的文件路径集合）
  codingActiveFiles: new Set(),
  addCodingActiveFile: (path) => set((s) => {
    const next = new Set(s.codingActiveFiles);
    next.add(path);
    return { codingActiveFiles: next };
  }),
  removeCodingActiveFile: (path) => set((s) => {
    const next = new Set(s.codingActiveFiles);
    next.delete(path);
    return { codingActiveFiles: next };
  }),
  clearCodingActiveFiles: () => set({ codingActiveFiles: new Set() }),

  // Git 分支
  gitBranch: '',
  refreshGitBranch: async () => {
    const path = get().codingProjectPath;
    if (!path) return;
    try {
      const res = await api.getCodingBranch(path);
      set({ gitBranch: res.branch || '' });
    } catch {
      set({ gitBranch: '' });
    }
  },
});
