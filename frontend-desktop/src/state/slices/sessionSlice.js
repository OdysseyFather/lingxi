import { api, wsClient } from '../../api/client';

export const createSessionSlice = (set, get) => ({
  sessions: [],
  activeSessionId: null,
  setActiveSession: async (id) => {
    set({
      activeSessionId: id,
      messages: [], liveBlocks: [], liveDiffs: [],
    });
    if (id) {
      wsClient.subscribe(id);
      const msgs = await api.listMessages(id).catch(() => []);
      set({ messages: msgs });
    }
  },
  refreshSessions: async () => {
    const agentId = get().activeAgentId;
    const sessions = await api.listSessions(agentId).catch(() => []);
    set({ sessions });
    return sessions;
  },
  createSession: async (titleOrPayload) => {
    const activeAgentId = get().activeAgentId || 0;
    const payload = typeof titleOrPayload === 'string'
      ? { title: titleOrPayload || '新对话', agent_id: activeAgentId }
      : { title: '新对话', agent_id: activeAgentId, ...(titleOrPayload || {}) };
    const r = await api.createSession(payload);
    await get().refreshSessions();
    await get().setActiveSession(r.id);
    return r.id;
  },
  deleteSession: async (id) => {
    await api.deleteSession(id);
    const list = await get().refreshSessions();
    if (get().activeSessionId === id) {
      const next = list[0]?.id || null;
      await get().setActiveSession(next);
    }
  },
  batchDeleteSessions: async (ids) => {
    if (!ids || ids.length === 0) return;
    await api.batchDeleteSessions(ids);
    const list = await get().refreshSessions();
    if (ids.includes(get().activeSessionId)) {
      const next = list[0]?.id || null;
      await get().setActiveSession(next);
    }
  },
  renameSession: async (id, title) => {
    await api.renameSession(id, title);
    await get().refreshSessions();
  },
  pinSession: async (id, pinned) => {
    await api.pinSession(id, pinned);
    await get().refreshSessions();
  },

  providers: [],
  profiles: [],
  activeProfile: null,
  refreshProfiles: async () => {
    const [providers, profiles] = await Promise.all([
      api.listProviders().catch(() => []),
      api.listProfiles(true).catch(() => []),
    ]);
    const activeProfile = profiles.find((p) => p.is_active) || null;
    set({ providers, profiles, activeProfile });
  },
  activateProfile: async (id) => {
    await api.activateProfile(id);
    if (window.electronAPI?.pushActiveSecret) {
      await window.electronAPI.pushActiveSecret(id);
    }
    await get().refreshProfiles();
  },

  agents: [],
  activeAgentId: Number(localStorage.getItem('lingxi-active-agent')) || 1,
  refreshAgents: async () => {
    const agents = await api.listAgents().catch(() => []);
    set({ agents });
    const cur = get().activeAgentId;
    if (!agents.find((a) => a.id === cur)) {
      const fallback = (agents.find((a) => a.builtin) || agents[0]);
      if (fallback) {
        localStorage.setItem('lingxi-active-agent', String(fallback.id));
        set({ activeAgentId: fallback.id });
      }
    }
    return agents;
  },
  setActiveAgent: async (agentId) => {
    localStorage.setItem('lingxi-active-agent', String(agentId));
    set({ activeAgentId: agentId, activeSessionId: null, messages: [], liveBlocks: [], liveDiffs: [] });
    const sessions = await get().refreshSessions();
    if (sessions.length > 0) {
      await get().setActiveSession(sessions[0].id);
    }
  },

  todayUsage: { input_tokens: 0, output_tokens: 0, cost_usd: 0, requests: 0 },
  refreshTodayUsage: async () => {
    const u = await api.getUsage('today').catch(() => null);
    if (u) set({ todayUsage: u.today || u.summary });
  },
});
