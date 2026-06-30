export const createUISlice = (set, get) => ({
  theme: localStorage.getItem('lingxi-theme') || 'light',
  setTheme: (t) => {
    localStorage.setItem('lingxi-theme', t);
    document.documentElement.setAttribute('data-theme', t);
    set({ theme: t });
  },

  view: 'chat',
  setView: (v) => set({ view: v }),

  settingsTab: 'general',
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
