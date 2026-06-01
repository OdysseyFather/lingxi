export const createUISlice = (set, get) => ({
  theme: localStorage.getItem('lingxi-theme') || 'light',
  setTheme: (t) => {
    localStorage.setItem('lingxi-theme', t);
    document.documentElement.setAttribute('data-theme', t);
    set({ theme: t });
  },

  // 应用模式：main=灵犀主模式，coding=编程模式
  // 每次启动都显示模式选择页，appMode 初始为空
  appMode: '',
  setAppMode: (m) => {
    localStorage.setItem('lingxi-app-mode', m);
    localStorage.setItem('lingxi-mode-selector-v2', '1');
    set({ appMode: m, activeSessionId: null, messages: [], liveBlocks: [], codingTasks: [], liveDiffs: [] });
    setTimeout(() => get().refreshSessions(), 0);
  },

  view: 'chat',
  setView: (v) => set({ view: v }),
  // coding 模式内的子视图
  codingView: 'chat',
  setCodingView: (v) => set({ codingView: v }),
  codingSidebarOpen: true,
  toggleCodingSidebar: () => set((s) => ({ codingSidebarOpen: !s.codingSidebarOpen })),
  codingChangesOpen: false,
  toggleCodingChanges: () => set((s) => ({ codingChangesOpen: !s.codingChangesOpen })),
  codingFileTreeOpen: true,
  toggleCodingFileTree: () => set((s) => ({ codingFileTreeOpen: !s.codingFileTreeOpen })),
  codingTerminalOpen: false,
  toggleCodingTerminal: () => set((s) => ({ codingTerminalOpen: !s.codingTerminalOpen })),

  settingsTab: 'profiles',
  setSettingsTab: (t) => set({ settingsTab: t }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  notifications: [],
  pushNotification: (n) => {
    const id = Date.now() + Math.random();
    set({ notifications: [...get().notifications, { id, ...n }] });
    setTimeout(() => {
      set({ notifications: get().notifications.filter((x) => x.id !== id) });
    }, 4000);
  },
});
