import { api, setJwtToken, getJwtToken } from '../../api/client';

const isWeb = typeof window !== 'undefined' && !window.electronAPI;

export const createAuthSlice = (set, get) => ({
  currentUser: null,
  isLoggedIn: false,
  authChecked: false,
  checkAuth: async () => {
    if (!isWeb) {
      set({ authChecked: true, isLoggedIn: false });
      return;
    }
    if (!getJwtToken()) {
      set({ currentUser: null, isLoggedIn: false, authChecked: true });
      return;
    }
    try {
      const res = await api.getCurrentUser();
      set({ currentUser: res.user, isLoggedIn: true, authChecked: true, webUsage: res.usage, webLimits: res.limits });
    } catch {
      setJwtToken('');
      set({ currentUser: null, isLoggedIn: false, authChecked: true });
    }
  },
  webLogin: async (username, password) => {
    const res = await api.webLogin(username, password);
    setJwtToken(res.token);
    set({ currentUser: res.user, isLoggedIn: true });
    return res.user;
  },
  webRegister: async (username, password, inviteCode) => {
    const res = await api.webRegister(username, password, inviteCode || undefined);
    setJwtToken(res.token);
    set({ currentUser: res.user, isLoggedIn: true });
    return res.user;
  },
  logout: async () => {
    try { await api.logout(); } catch {}
    setJwtToken('');
    set({ currentUser: null, isLoggedIn: false });
  },
});
