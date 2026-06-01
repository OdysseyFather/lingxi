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
