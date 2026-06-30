import { api, electron as electronBridge } from '../../api/client';

export const createAuthSlice = (set, get) => ({
  currentUser: null,
  isLoggedIn: false,
  authChecked: false,
  checkAuth: async () => {
    try {
      const res = await api.getCurrentUser();
      if (res.logged_in) {
        set({ currentUser: res.user, isLoggedIn: true, authChecked: true });
        return;
      }
      // Web 版（非 Electron）自动游客登录，跳过 SSO 登录页
      if (!window.electronAPI) {
        const guest = await api.guestLogin('Web 用户');
        set({ currentUser: guest.user, isLoggedIn: true, authChecked: true });
        return;
      }
      set({ currentUser: null, isLoggedIn: false, authChecked: true });
    } catch {
      // Web 版兜底：即使 getCurrentUser 失败也尝试游客登录
      if (!window.electronAPI) {
        try {
          const guest = await api.guestLogin('Web 用户');
          set({ currentUser: guest.user, isLoggedIn: true, authChecked: true });
          return;
        } catch {}
      }
      set({ currentUser: null, isLoggedIn: false, authChecked: true });
    }
  },
  loginAsGuest: async (nickname) => {
    const res = await api.guestLogin(nickname);
    set({ currentUser: res.user, isLoggedIn: true });
    return res.user;
  },
  loginWithOAuth: async (provider) => {
    const res = await electronBridge.startOAuth(provider);
    if (res?.user) {
      set({ currentUser: res.user, isLoggedIn: true });
      return res.user;
    }
    throw new Error('登录未完成');
  },
  logout: async () => {
    try {
      await api.logout();
    } catch {}
    set({ currentUser: null, isLoggedIn: false });
  },
});
