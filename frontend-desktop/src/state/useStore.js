import { create } from 'zustand';
import { wsClient } from '../api/client';
import { createAuthSlice } from './slices/authSlice';
import { createUISlice } from './slices/uiSlice';
import { createSessionSlice } from './slices/sessionSlice';
import { createChatSlice } from './slices/chatSlice';
import { createNexusSlice } from './slices/nexusSlice';

export const useStore = create((set, get, store) => ({
  ...createAuthSlice(set, get, store),
  ...createUISlice(set, get, store),
  ...createSessionSlice(set, get, store),
  ...createChatSlice(set, get, store),
  ...createNexusSlice(set, get, store),
}));

let _storeInitialized = false;
let _wsUnsubscribe = null;

export function initStore() {
  const { theme, checkAuth } = useStore.getState();
  document.documentElement.setAttribute('data-theme', theme);

  // 防止重复注册 WS handler
  if (!_storeInitialized) {
    _storeInitialized = true;
    wsClient.connect();
    _wsUnsubscribe = wsClient.on((msg) => {
      const state = useStore.getState();
      state.handleWSEvent(msg);
    });
  }

  // Screen Agent 紧急中止监听
  if (window.electronAPI?.screenAgent?.onEmergencyAbort) {
    window.electronAPI.screenAgent.onEmergencyAbort(() => {
      useStore.getState().screenAgentAbort();
      useStore.getState().pushNotification({ title: 'Screen Agent', body: '已紧急中止所有操作 (⌘⇧Esc)' });
    });
  }

  checkAuth().then(() => {
    const { isLoggedIn } = useStore.getState();
    if (isLoggedIn) {
      initAppData();
    }
  });
}

export function initAppData() {
  const { refreshProfiles, refreshTodayUsage, refreshSessions, setActiveSession } = useStore.getState();
  refreshProfiles();
  refreshTodayUsage();
  useStore.getState().refreshAgents().then(() => {
    refreshSessions().then((list) => {
      if (list.length > 0) setActiveSession(list[0].id);
    });
  });
}
