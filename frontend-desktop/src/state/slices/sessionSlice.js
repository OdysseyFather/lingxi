import { api, wsClient } from '../../api/client';

export const createSessionSlice = (set, get) => ({
  sessions: [],
  activeSessionId: null,
  setActiveSession: async (id) => {
    const isCoding = get().appMode === 'coding';

    if (isCoding) {
      // 切换会话前：如果当前有正在流式输出的内容，先把 liveBlocks 合并为 assistant 消息保留
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

    set({
      activeSessionId: id,
      messages: [], liveBlocks: [], codingTasks: [], liveDiffs: [],
      codingMessages: [], codingLiveBlocks: [],
      codingIsStreaming: false, codingAgentState: 'IDLE',
      codingPendingQuestions: [], codingCurrentQuestionIdx: 0,
      codingAnswers: {}, codingQuestionsSubmitted: false,
      subAgents: [],
    });
    if (id) {
      wsClient.subscribe(id);
      const msgs = await api.listMessages(id).catch(() => []);
      if (isCoding) {
        set({ codingMessages: msgs });
      } else {
        set({ messages: msgs });
      }
    }
  },
  refreshSessions: async () => {
    const agentId = get().activeAgentId;
    const appMode = get().appMode;
    const mode = appMode === 'coding' ? 'coding' : undefined;
    const projectPath = appMode === 'coding' ? get().codingProjectPath : undefined;
    const sessions = await api.listSessions(agentId, mode, projectPath || undefined).catch(() => []);
    set({ sessions });
    return sessions;
  },
  createSession: async (titleOrPayload) => {
    const activeAgentId = get().activeAgentId || 0;
    const appMode = get().appMode;
    const mode = appMode === 'coding' ? 'coding' : '';
    const projectPath = appMode === 'coding' ? (get().codingProjectPath || '') : '';
    const permissionMode = appMode === 'coding' ? (get().codingPermissionMode || 'trust') : 'trust';
    const payload = typeof titleOrPayload === 'string'
      ? { title: titleOrPayload || '新对话', agent_id: activeAgentId, mode, project_path: projectPath, permission_mode: permissionMode }
      : { title: '新对话', agent_id: activeAgentId, mode, project_path: projectPath, permission_mode: permissionMode, ...(titleOrPayload || {}) };
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
    set({ activeAgentId: agentId, activeSessionId: null, messages: [], liveBlocks: [], codingTasks: [], liveDiffs: [] });
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
