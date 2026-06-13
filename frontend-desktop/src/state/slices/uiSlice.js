export const createUISlice = (set, get) => ({
  theme: localStorage.getItem('lingxi-theme') || 'light',
  setTheme: (t) => {
    localStorage.setItem('lingxi-theme', t);
    document.documentElement.setAttribute('data-theme', t);
    set({ theme: t });
  },

  // 应用模式：固定为灵犀主模式
  appMode: 'main',
  setAppMode: (m) => {
    localStorage.setItem('lingxi-app-mode', m);
    localStorage.setItem('lingxi-mode-selector-v2', '1');
    // 切换模式前：如果当前 coding 模式有正在流式输出的内容，先合并保留
    const prevMode = get().appMode;
    if (prevMode === 'coding') {
      const prevLive = get().codingLiveBlocks;
      const prevStreaming = get().codingIsStreaming;
      const prevSid = get().activeSessionId;
      if (prevStreaming && prevLive.length > 0 && prevSid) {
        const remaining = prevLive.filter((b) => b.text || b.type === 'tool');
        if (remaining.length > 0) {
          const partialMsg = {
            id: -Date.now(),
            session_id: prevSid,
            role: 'assistant',
            content: JSON.stringify(remaining),
            created_at: new Date().toISOString(),
          };
          set({ codingMessages: [...get().codingMessages, partialMsg] });
        }
      }
    }
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
