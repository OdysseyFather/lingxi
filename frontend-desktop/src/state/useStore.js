import { create } from 'zustand';
import { api, wsClient } from '../api/client';

// 全局状态：会话、当前激活档案、用量、消息流
export const useStore = create((set, get) => ({
  // ─── 主题 ────────────────────────────────────────────────────
  theme: localStorage.getItem('lingxi-theme') || 'light',
  setTheme: (t) => {
    localStorage.setItem('lingxi-theme', t);
    document.documentElement.setAttribute('data-theme', t);
    set({ theme: t });
  },

  // ─── 视图 ────────────────────────────────────────────────────
  view: 'chat', // chat | settings | skills | knowledge | im
  setView: (v) => set({ view: v }),
  settingsTab: 'profiles', // profiles | usage | appearance
  setSettingsTab: (t) => set({ settingsTab: t }),

  // ─── 会话 ────────────────────────────────────────────────────
  sessions: [],
  activeSessionId: null,
  setActiveSession: async (id) => {
    set({ activeSessionId: id, messages: [], liveBlocks: [] });
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
  renameSession: async (id, title) => {
    await api.renameSession(id, title);
    await get().refreshSessions();
  },

  // ─── 消息 ────────────────────────────────────────────────────
  messages: [],
  liveBlocks: [], // 流式中的 assistant block 数组：{type:'text'|'thinking'|'tool', text, name, done}
  agentState: 'IDLE', // IDLE | THINKING | CHECKING | EXECUTING | DONE
  isStreaming: false,
  startedAt: null,

  // ─── 档案 ────────────────────────────────────────────────────
  providers: [],
  profiles: [],
  activeProfile: null,
  refreshProfiles: async () => {
    const [providers, profiles] = await Promise.all([
      api.listProviders().catch(() => []),
      api.listProfiles().catch(() => []),
    ]);
    const activeProfile = profiles.find((p) => p.is_active) || null;
    set({ providers, profiles, activeProfile });
  },
  activateProfile: async (id) => {
    await api.activateProfile(id);
    // 让 Electron 推送新明文
    if (window.electronAPI?.pushActiveSecret) {
      await window.electronAPI.pushActiveSecret(id);
    }
    await get().refreshProfiles();
  },

  // ─── 智能体 ────────────────────────────────────────────────
  agents: [],
  activeAgentId: Number(localStorage.getItem('lingxi-active-agent')) || 1,
  refreshAgents: async () => {
    const agents = await api.listAgents().catch(() => []);
    set({ agents });
    // 校正 activeAgentId：如果当前选的 agent 不存在，则回退到第一个 builtin
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
    set({ activeAgentId: agentId, activeSessionId: null, messages: [], liveBlocks: [] });
    const sessions = await get().refreshSessions();
    if (sessions.length > 0) {
      await get().setActiveSession(sessions[0].id);
    }
  },

  // ─── 用量摘要（顶部小标签）─────────────────────────────────
  todayUsage: { input_tokens: 0, output_tokens: 0, cost_usd: 0, requests: 0 },
  refreshTodayUsage: async () => {
    const u = await api.getUsage('today').catch(() => null);
    if (u) set({ todayUsage: u.today || u.summary });
  },

  // ─── 通知（toast） ──────────────────────────────────────────
  notifications: [],
  pushNotification: (n) => {
    const id = Date.now() + Math.random();
    set({ notifications: [...get().notifications, { id, ...n }] });
    setTimeout(() => {
      set({ notifications: get().notifications.filter((x) => x.id !== id) });
    }, 4000);
  },

  // ─── WS 处理 ────────────────────────────────────────────────
  handleWSEvent: (msg) => {
    const { event, data, sessionId } = msg;
    const state = get();
    if (sessionId && sessionId !== state.activeSessionId) {
      // 仅处理当前会话事件（其它会话忽略；后台运行 indicator 由 sessions 列表展示）
      if (event === 'profile_changed') {
        state.refreshProfiles();
      }
      return;
    }
    let payload;
    try { payload = data ? JSON.parse(data) : null; } catch { payload = data; }

    switch (event) {
      case 'agent_state': {
        const s = (payload && payload.state) || 'IDLE';
        set({ agentState: s });
        if (s === 'THINKING' && !state.isStreaming) {
          set({ isStreaming: true, startedAt: Date.now(), liveBlocks: [] });
        }
        break;
      }
      case 'thinking': {
        const text = typeof payload === 'string' ? payload : (data || '');
        const blocks = [...state.liveBlocks];
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'thinking') last.text += text;
        else blocks.push({ type: 'thinking', text });
        set({ liveBlocks: blocks });
        break;
      }
      case 'text': {
        const text = typeof payload === 'string' ? payload : (data || '');
        const blocks = [...state.liveBlocks];
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'text') last.text += text;
        else blocks.push({ type: 'text', text });
        set({ liveBlocks: blocks });
        break;
      }
      case 'tool_start': {
        const blocks = [...state.liveBlocks];
        blocks.push({
          type: 'tool',
          name: payload?.name || '',
          label: payload?.label || '执行技能',
          startedAt: Date.now(),
          done: false,
        });
        set({ liveBlocks: blocks });
        break;
      }
      case 'tool_end': {
        const blocks = [...state.liveBlocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          if (blocks[i].type === 'tool' && !blocks[i].done) {
            blocks[i].done = true;
            blocks[i].endedAt = Date.now();
            // 富 payload：input/label/ms/status
            if (payload && typeof payload === 'object') {
              if (payload.input != null) blocks[i].input = payload.input;
              if (payload.label) blocks[i].label = payload.label;
              if (payload.ms != null) blocks[i].ms = payload.ms;
              if (payload.status) blocks[i].status = payload.status;
            }
            break;
          }
        }
        set({ liveBlocks: blocks });
        break;
      }
      case 'message_usage': {
        // 把 usage 附到当前流式产生的 assistant 消息上
        const usage = payload?.usage;
        const messageId = payload?.messageId;
        if (!usage) break;
        // 立即把 liveBlocks 固化为一条 assistant 消息（使用 server 给的 messageId）
        const finalBlocks = state.liveBlocks.filter((b) => b.text || b.type === 'tool');
        const newMsg = {
          id: messageId || -Date.now(),
          session_id: state.activeSessionId,
          role: 'assistant',
          content: JSON.stringify(finalBlocks),
          usage: JSON.stringify(usage),
          created_at: new Date().toISOString(),
        };
        set({
          messages: [...state.messages, newMsg],
          liveBlocks: [],
          isStreaming: false,
          agentState: 'DONE',
        });
        state.refreshTodayUsage();
        break;
      }
      case 'done': {
        // 兜底：如果没有 message_usage（旧消息无 usage），仍要清流
        if (state.isStreaming) {
          const finalBlocks = state.liveBlocks.filter((b) => b.text || b.type === 'tool');
          if (finalBlocks.length > 0) {
            const newMsg = {
              id: -Date.now(),
              session_id: state.activeSessionId,
              role: 'assistant',
              content: JSON.stringify(finalBlocks),
              usage: '',
              created_at: new Date().toISOString(),
            };
            set({ messages: [...state.messages, newMsg] });
          }
          set({ liveBlocks: [], isStreaming: false, agentState: 'DONE' });
        }
        // 重新拉取最新消息（保证持久化的版本与流式一致）
        if (state.activeSessionId) {
          api.listMessages(state.activeSessionId).then((m) => set({ messages: m })).catch(() => {});
        }
        break;
      }
      case 'profile_changed': {
        state.refreshProfiles();
        state.pushNotification({ title: '已切换模型', body: payload?.name || '激活档案已更新' });
        break;
      }
      case 'agent_changed': {
        state.refreshAgents();
        break;
      }
      case 'mcp_changed': {
        state.pushNotification({ title: 'MCP 配置已更新', body: '将在下次新对话生效' });
        break;
      }
      case 'notification': {
        if (payload) state.pushNotification(payload);
        break;
      }
      default: break;
    }
  },

  // ─── 发送消息 ──────────────────────────────────────────────
  sendMessage: async ({ message, images = [], useKB = false }) => {
    let sid = get().activeSessionId;
    if (!sid) {
      sid = await get().createSession();
    }
    // 立即在本地追加 user 消息（含图片预览，data: URL 直接可渲染）
    let localContent = message || (images.length ? '[图片]' : '');
    if (images.length > 0) {
      const previewImages = images.map((img) => `data:${img.mediaType};base64,${img.data}`);
      localContent = JSON.stringify({ text: message || '', images: previewImages });
    }
    const localUserMsg = {
      id: -Date.now(),
      session_id: sid,
      role: 'user',
      content: localContent,
      created_at: new Date().toISOString(),
    };
    set({
      messages: [...get().messages, localUserMsg],
      liveBlocks: [],
      isStreaming: true,
      startedAt: Date.now(),
      agentState: 'THINKING',
    });
    try {
      await api.sendChat({
        message,
        sessionId: String(sid),
        useKB,
        images,
      });
    } catch (e) {
      set({ isStreaming: false, agentState: 'IDLE' });
      get().pushNotification({ title: '发送失败', body: e.message });
    }
  },
  abort: async () => {
    const sid = get().activeSessionId;
    if (!sid) return;
    await api.abortChat(sid).catch(() => {});
    set({ isStreaming: false, agentState: 'IDLE' });
  },
}));

// 一次性初始化：主题与 WS
export function initStore() {
  const { theme, handleWSEvent, refreshSessions, refreshProfiles, refreshTodayUsage, setActiveSession } = useStore.getState();
  document.documentElement.setAttribute('data-theme', theme);

  wsClient.connect();
  wsClient.on(handleWSEvent);

  refreshProfiles();
  refreshTodayUsage();
  // 先加载 agents（影响 sessions 过滤）
  useStore.getState().refreshAgents().then(() => {
    refreshSessions().then((list) => {
      if (list.length > 0) setActiveSession(list[0].id);
    });
  });
}
