import { api, wsClient } from '../../api/client';

export const createNexusSlice = (set, get) => ({
  nexusNotifications: [],
  addNexusNotif: (notif) => set((s) => ({
    nexusNotifications: [...s.nexusNotifications, { ...notif, id: Date.now() + Math.random() }],
  })),
  removeNexusNotif: (id) => set((s) => ({
    nexusNotifications: s.nexusNotifications.filter((n) => n.id !== id),
  })),
  clearNexusNotifs: () => set({ nexusNotifications: [] }),

  // ── 群聊 ─────────────────────────────────────────
  groupChats: [],
  activeGroupRoomId: null,
  groupRoomDetail: null, // {room, members, messages}
  groupLiveStreams: {},  // { 'peerId|agentName': { event, blocks } }
  groupInvites: [],      // 收到但未处理的邀请
  groupTypingAgents: {}, // { roomId: { agentName: { ts, delayMs } } }
  groupDrafts: {},       // { roomId: { text, replyTo, images:[], mentions:[] } }
  groupOldestId: {},     // { roomId: minMessageId } 用于下拉加载

  refreshGroupChats: async () => {
    try {
      const data = await api.listGroupChats();
      set({ groupChats: data || [] });
    } catch {}
  },

  setActiveGroupRoom: async (roomId) => {
    set({ activeGroupRoomId: roomId, groupRoomDetail: null, groupLiveStreams: {} });
    if (roomId) {
      try {
        const detail = await api.getGroupChat(roomId);
        const msgs = detail?.messages || [];
        const minId = msgs.length > 0 ? msgs[0].id : 0;
        const oldest = { ...(get().groupOldestId || {}) };
        oldest[roomId] = minId;
        set({ groupRoomDetail: detail, groupOldestId: oldest });
      } catch {}
    }
  },

  refreshActiveGroupRoom: async () => {
    const id = get().activeGroupRoomId;
    if (!id) return;
    try {
      const detail = await api.getGroupChat(id);
      // 保留尚未被服务端确认的乐观消息
      const prev = get().groupRoomDetail;
      if (prev && prev.room?.id === id) {
        const optimistic = (prev.messages || []).filter((m) => m._optimistic);
        if (optimistic.length > 0) {
          const serverMsgs = detail?.messages || [];
          const merged = [...serverMsgs];
          for (const opt of optimistic) {
            const found = serverMsgs.some(
              (s) => s.msg_type === 'user_post' && s.content === opt.content,
            );
            if (!found) merged.push(opt);
          }
          detail.messages = merged;
        }
      }
      set({ groupRoomDetail: detail });
    } catch {}
  },

  // 下拉加载更早消息
  loadOlderGroupMessages: async (roomId) => {
    const oldest = get().groupOldestId || {};
    const before = oldest[roomId] || 0;
    if (!before) return false;
    try {
      const older = await api.listGroupMessagesPaged(roomId, before, 30);
      if (!older || older.length === 0) return false;
      const detail = get().groupRoomDetail;
      if (!detail || detail.room?.id !== roomId) return false;
      const merged = [...older, ...(detail.messages || [])];
      const minId = older[0].id;
      const oldestNext = { ...(get().groupOldestId || {}) };
      oldestNext[roomId] = minId;
      set({
        groupRoomDetail: { ...detail, messages: merged },
        groupOldestId: oldestNext,
      });
      return true;
    } catch {
      return false;
    }
  },

  applyGroupMessage: (msg) => {
    const detail = get().groupRoomDetail;
    if (!detail || !msg || msg.room_id !== detail.room?.id) return;
    const existing = detail.messages || [];
    // 去重（按 id 或 client_msg_id）
    const dup = existing.find(
      (m) =>
        (!m._optimistic && msg.id != null && m.id != null && String(m.id) === String(msg.id)) ||
        (msg.client_msg_id && m.client_msg_id === msg.client_msg_id),
    );
    if (dup) return;
    // 如果有对应的乐观消息（同 content + user_post），替换之
    const isUserPost = msg.msg_type === 'user_post';
    let merged = existing;
    if (isUserPost) {
      const optIdx = existing.findIndex(
        (m) => m._optimistic && m.content === msg.content,
      );
      if (optIdx >= 0) {
        merged = [...existing];
        merged[optIdx] = msg;
        set({ groupRoomDetail: { ...detail, messages: merged } });
        return;
      }
    }
    set({
      groupRoomDetail: {
        ...detail,
        messages: [...existing, msg],
      },
    });
  },

  applyGroupRecall: ({ room_id, message_id }) => {
    const detail = get().groupRoomDetail;
    if (!detail || detail.room?.id !== room_id) return;
    const messages = (detail.messages || []).map((m) =>
      m.id === message_id ? { ...m, is_recalled: true } : m
    );
    set({ groupRoomDetail: { ...detail, messages } });
  },

  applyGroupAgentTyping: ({ room_id, agent_name, delay_ms }) => {
    const typing = { ...(get().groupTypingAgents || {}) };
    const room = typing[room_id] || {};
    room[agent_name] = { ts: Date.now(), delayMs: delay_ms };
    typing[room_id] = room;
    set({ groupTypingAgents: typing });
    // 自动过期（避免卡死）
    setTimeout(() => {
      const t = { ...(get().groupTypingAgents || {}) };
      const r = t[room_id];
      if (r && r[agent_name] && Date.now() - r[agent_name].ts > (delay_ms || 5000) + 2000) {
        delete r[agent_name];
        t[room_id] = r;
        set({ groupTypingAgents: t });
      }
    }, (delay_ms || 3000) + 3000);
  },

  setGroupDraft: (roomId, patch) => {
    const drafts = { ...(get().groupDrafts || {}) };
    drafts[roomId] = { ...(drafts[roomId] || {}), ...patch };
    set({ groupDrafts: drafts });
  },
  clearGroupDraft: (roomId) => {
    const drafts = { ...(get().groupDrafts || {}) };
    delete drafts[roomId];
    set({ groupDrafts: drafts });
  },

  applyGroupStreamToken: (info) => {
    const id = get().activeGroupRoomId;
    if (!info) return;
    // 即使 room_id 缺失，仍然尝试匹配（后端 forwarder 不一定填 room_id 字段）
    if (info.room_id != null && id != null && info.room_id !== id) return;
    // 以 agent_name 作为唯一 key（peer_id 跨端会变化），更稳定
    const key = `${info.sender_peer_id || 'local'}|${info.sender_agent_name || 'agent'}`;
    const streams = { ...(get().groupLiveStreams || {}) };
    const cur = streams[key] || { blocks: [] };
    if (info.event === 'stream_start') {
      streams[key] = { blocks: [], senderPeerId: info.sender_peer_id, senderAgentName: info.sender_agent_name };
      // 进入流式后清除 typing 占位
      const typing = { ...(get().groupTypingAgents || {}) };
      const rid = get().activeGroupRoomId;
      if (typing[rid]) {
        const r = { ...typing[rid] };
        delete r[info.sender_agent_name];
        typing[rid] = r;
        set({ groupTypingAgents: typing });
      }
    } else if (info.event === 'stream_done') {
      // 延迟 200ms 清除，给前端最后渲染时间，避免最终消息到达前流式消失造成的闪烁
      setTimeout(() => {
        const cur2 = { ...(get().groupLiveStreams || {}) };
        delete cur2[key];
        set({ groupLiveStreams: cur2 });
      }, 200);
    } else if (info.event === 'text') {
      const blocks = [...(cur.blocks || [])];
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'text') last.text += info.data || '';
      else blocks.push({ type: 'text', text: info.data || '' });
      streams[key] = { ...cur, blocks, senderPeerId: info.sender_peer_id, senderAgentName: info.sender_agent_name };
      set({ groupLiveStreams: streams });
      return;
    } else if (info.event === 'thinking_start') {
      const blocks = [...(cur.blocks || [])];
      blocks.push({ type: 'thinking', text: '' });
      streams[key] = { ...cur, blocks, senderPeerId: info.sender_peer_id, senderAgentName: info.sender_agent_name };
      set({ groupLiveStreams: streams });
      return;
    } else if (info.event === 'thinking_delta') {
      const blocks = [...(cur.blocks || [])];
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'thinking') last.text += info.data || '';
      else blocks.push({ type: 'thinking', text: info.data || '' });
      streams[key] = { ...cur, blocks, senderPeerId: info.sender_peer_id, senderAgentName: info.sender_agent_name };
      set({ groupLiveStreams: streams });
      return;
    } else if (info.event === 'thinking_done') {
      const blocks = [...(cur.blocks || [])];
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].type === 'thinking') { blocks[i] = { ...blocks[i], done: true }; break; }
      }
      streams[key] = { ...cur, blocks, senderPeerId: info.sender_peer_id, senderAgentName: info.sender_agent_name };
      set({ groupLiveStreams: streams });
      return;
    } else if (info.event === 'tool_start') {
      let payload = info.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = {}; }
      }
      const blocks = [...(cur.blocks || [])];
      blocks.push({
        type: 'tool',
        name: payload?.name || '',
        label: payload?.label || payload?.name || '工具',
        done: false,
      });
      streams[key] = { ...cur, blocks, senderPeerId: info.sender_peer_id, senderAgentName: info.sender_agent_name };
      set({ groupLiveStreams: streams });
      return;
    } else if (info.event === 'tool_end') {
      let payload = info.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = {}; }
      }
      const blocks = [...(cur.blocks || [])];
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].type === 'tool' && !blocks[i].done) {
          blocks[i] = {
            ...blocks[i],
            done: true,
            input: payload?.input,
            ms: payload?.ms,
            status: payload?.status || 'ok',
          };
          break;
        }
      }
      streams[key] = { ...cur, blocks, senderPeerId: info.sender_peer_id, senderAgentName: info.sender_agent_name };
      set({ groupLiveStreams: streams });
      return;
    }
    set({ groupLiveStreams: streams });
  },

  enqueueGroupInvite: (invite) => {
    const list = [...(get().groupInvites || [])];
    list.push(invite);
    set({ groupInvites: list });
  },
  popGroupInvite: (roomId) => {
    set({ groupInvites: (get().groupInvites || []).filter((i) => i.room_id !== roomId) });
  },
});
