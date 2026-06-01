import { api } from '../../api/client';

const TOKEN_FLUSH_MS = 50;
let _codingTokenBuf = { text: '', thinking: '' };
let _codingFlushTimer = null;

function flushCodingTokenBuffer(set, get) {
  const buf = _codingTokenBuf;
  _codingTokenBuf = { text: '', thinking: '' };
  _codingFlushTimer = null;
  if (!buf.text && !buf.thinking) return;
  const blocks = [...get().codingLiveBlocks];
  if (buf.thinking) {
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'thinking') last.text += buf.thinking;
    else blocks.push({ type: 'thinking', text: buf.thinking });
  }
  if (buf.text) {
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'text') last.text += buf.text;
    else blocks.push({ type: 'text', text: buf.text });
  }
  set({ codingLiveBlocks: blocks });
}

function bufferCodingToken(type, chunk, set, get) {
  _codingTokenBuf[type] += chunk;
  if (!_codingFlushTimer) {
    _codingFlushTimer = setTimeout(() => flushCodingTokenBuffer(set, get), TOKEN_FLUSH_MS);
  }
}

function flushCodingNow(set, get) {
  if (_codingFlushTimer) { clearTimeout(_codingFlushTimer); _codingFlushTimer = null; }
  flushCodingTokenBuffer(set, get);
}

export const createCodingChatSlice = (set, get) => ({
  // ─── Coding 独立消息状态 ─────────────────────────────────────
  codingMessages: [],
  codingLiveBlocks: [],
  codingIsStreaming: false,
  codingAgentState: 'IDLE',
  codingStartedAt: null,

  // ─── 批量 AskQuestion 状态 ──────────────────────────────────
  codingPendingQuestions: [],
  codingCurrentQuestionIdx: 0,
  codingAnswers: {},
  codingQuestionsSubmitted: false,

  // ─── Sub-agent 状态 ─────────────────────────────────────────
  subAgents: [],

  // ─── Checkpoint 状态 ────────────────────────────────────────
  codingCheckpoints: [],

  // ─── Coding WS 事件处理（独立于 chatSlice） ─────────────────
  codingHandleWSEvent: (msg) => {
    const { event, data, sessionId } = msg;
    const state = get();

    if (sessionId && sessionId !== state.activeSessionId) {
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
        set({ codingAgentState: s });
        if (s === 'THINKING' && !state.codingIsStreaming) {
          set({ codingIsStreaming: true, codingStartedAt: Date.now(), codingLiveBlocks: [] });
        }
        break;
      }
      case 'thinking': {
        const text = typeof payload === 'string' ? payload : (data || '');
        bufferCodingToken('thinking', text, set, get);
        break;
      }
      case 'text': {
        const text = typeof payload === 'string' ? payload : (data || '');
        bufferCodingToken('text', text, set, get);
        break;
      }
      case 'task_update': {
        const newTasks = Array.isArray(payload?.todos) ? payload.todos : [];
        if (newTasks.length > 0) {
          const existing = get().codingTasks;
          const map = new Map(existing.map(t => [t.id, { ...t }]));
          for (const t of newTasks) {
            if (map.has(t.id)) {
              const old = map.get(t.id);
              map.set(t.id, { ...old, ...t });
            } else {
              map.set(t.id, t);
            }
          }
          set({ codingTasks: Array.from(map.values()) });
          flushCodingNow(set, get);
        }
        break;
      }
      case 'ask_questions_batch': {
        flushCodingNow(set, get);
        const questions = payload?.questions || [];
        if (questions.length > 0) {
          set({
            codingPendingQuestions: questions,
            codingCurrentQuestionIdx: 0,
            codingAnswers: {},
            codingQuestionsSubmitted: false,
          });
        }
        break;
      }
      // 兼容旧的单个 ask_question 事件——也缓冲到 batch
      case 'ask_question': {
        flushCodingNow(set, get);
        const current = get().codingPendingQuestions;
        const q = {
          type: payload?.type || 'choice',
          id: payload?.id || `q_${Date.now()}`,
          question: payload?.question || '',
          title: payload?.title || payload?.question || '',
          options: payload?.options || [],
          allow_custom: payload?.allow_custom !== false,
        };
        set({
          codingPendingQuestions: [...current, q],
          codingQuestionsSubmitted: false,
        });
        break;
      }
      case 'permission_request': {
        flushCodingNow(set, get);
        const blocks = [...get().codingLiveBlocks];
        blocks.push({
          type: 'permission',
          toolName: payload?.tool_name || '',
          input: payload?.input || '',
          id: payload?.id || Date.now(),
        });
        set({ codingLiveBlocks: blocks });
        break;
      }
      case 'file_diff': {
        flushCodingNow(set, get);
        const blocks = [...get().codingLiveBlocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          if (blocks[i].type === 'tool' && blocks[i].done) {
            blocks[i] = {
              ...blocks[i],
              fileDiff: {
                file: payload?.file || '',
                diff: payload?.diff || '',
                isNew: payload?.is_new || false,
                added: payload?.added || 0,
                removed: payload?.removed || 0,
              },
            };
            break;
          }
        }
        set({ codingLiveBlocks: blocks });
        break;
      }
      case 'tool_start': {
        flushCodingNow(set, get);
        const blocks = [...get().codingLiveBlocks];
        blocks.push({
          type: 'tool',
          name: payload?.name || '',
          label: payload?.label || '执行技能',
          startedAt: Date.now(),
          done: false,
        });
        set({ codingLiveBlocks: blocks });
        break;
      }
      case 'tool_end': {
        if (payload?.hidden) break;
        flushCodingNow(set, get);
        const blocks = [...get().codingLiveBlocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          if (blocks[i].type === 'tool' && !blocks[i].done) {
            blocks[i].done = true;
            blocks[i].endedAt = Date.now();
            if (payload && typeof payload === 'object') {
              if (payload.input != null) blocks[i].input = payload.input;
              if (payload.fullInput != null) blocks[i].fullInput = payload.fullInput;
              if (payload.label) blocks[i].label = payload.label;
              if (payload.ms != null) blocks[i].ms = payload.ms;
              if (payload.status) blocks[i].status = payload.status;
            }
            break;
          }
        }
        set({ codingLiveBlocks: blocks });
        break;
      }
      case 'checkpoint_created': {
        const cps = [...get().codingCheckpoints];
        cps.push({
          id: payload?.id,
          session_id: payload?.session_id,
          message_id: payload?.message_id,
          created_at: payload?.created_at || new Date().toISOString(),
          files_count: payload?.files_count || 0,
          messages_count: payload?.messages_count || 0,
          todo_snapshot: payload?.todo_snapshot || null,
        });
        set({ codingCheckpoints: cps });
        break;
      }
      case 'subagent_start': {
        const agents = [...get().subAgents];
        agents.push({
          id: payload?.id || `sa_${Date.now()}`,
          description: payload?.description || '',
          status: 'working',
          parent_id: payload?.parent_id || null,
          message_id: payload?.message_id || null,
        });
        set({ subAgents: agents });
        break;
      }
      case 'subagent_update': {
        const agents = [...get().subAgents];
        const idx = agents.findIndex(a => a.id === payload?.id);
        if (idx >= 0) {
          agents[idx] = { ...agents[idx], ...payload };
          set({ subAgents: agents });
        }
        break;
      }
      case 'subagent_done': {
        const agents = [...get().subAgents];
        const idx = agents.findIndex(a => a.id === payload?.id);
        if (idx >= 0) {
          agents[idx].status = 'done';
          set({ subAgents: agents });
        }
        break;
      }
      case 'message_usage': {
        flushCodingNow(set, get);
        const usage = payload?.usage;
        const messageId = payload?.messageId;
        if (!usage) break;
        const finalBlocks = get().codingLiveBlocks.filter((b) => b.text || b.type === 'tool');
        const newMsg = {
          id: messageId || -Date.now(),
          session_id: state.activeSessionId,
          role: 'assistant',
          content: JSON.stringify(finalBlocks),
          usage: JSON.stringify(usage),
          created_at: new Date().toISOString(),
        };
        set({
          codingMessages: [...get().codingMessages, newMsg],
          codingLiveBlocks: [],
        });
        break;
      }
      case 'done': {
        flushCodingNow(set, get);
        // 如果没有 message_usage 事件但有 liveBlocks，合并为消息
        const remaining = get().codingLiveBlocks.filter((b) => b.text || b.type === 'tool');
        if (remaining.length > 0) {
          const newMsg = {
            id: -Date.now(),
            session_id: state.activeSessionId,
            role: 'assistant',
            content: JSON.stringify(remaining),
            created_at: new Date().toISOString(),
          };
          set({
            codingMessages: [...get().codingMessages, newMsg],
            codingLiveBlocks: [],
          });
        }
        set({ codingIsStreaming: false, codingAgentState: 'IDLE' });
        break;
      }
      default:
        break;
    }
  },

  // ─── Coding 发送消息（调用独立 API） ───────────────────────
  codingSendMessage: async ({ message, images = [], files = [], workingDir = '', thinking }) => {
    let sid = get().activeSessionId;
    if (!sid) {
      sid = await get().createSession();
    }

    if (get().codingIsStreaming && sid) {
      await api.abortChat(sid).catch(() => {});
      set({ codingIsStreaming: false, codingAgentState: 'IDLE' });
      await new Promise((r) => setTimeout(r, 300));
    }

    let localContent = message || (images.length ? '[图片]' : '');
    if (images.length > 0 || files.length > 0) {
      const previewImages = images.map((img) => `data:${img.mediaType};base64,${img.data}`);
      const fileRefs = files.map((f) => ({ name: f.name, size: f.size }));
      localContent = JSON.stringify({ text: message || '', images: previewImages, files: fileRefs });
    }
    const localUserMsg = {
      id: -Date.now(),
      session_id: sid,
      role: 'user',
      content: localContent,
      created_at: new Date().toISOString(),
    };
    set({
      codingMessages: [...get().codingMessages, localUserMsg],
      codingLiveBlocks: [],
      liveDiffs: [],
      codingIsStreaming: true,
      codingStartedAt: Date.now(),
      codingAgentState: 'THINKING',
      codingPendingQuestions: [],
      codingCurrentQuestionIdx: 0,
      codingAnswers: {},
      codingQuestionsSubmitted: false,
      subAgents: [],
    });
    try {
      const payload = { message, sessionId: String(sid), images, files };
      if (workingDir) payload.workingDir = workingDir;
      if (thinking !== undefined) payload.thinking = thinking;
      await api.sendCodingChat(payload);
    } catch (e) {
      set({ codingIsStreaming: false, codingAgentState: 'IDLE' });
      get().pushNotification({ title: '发送失败', body: e.message });
    }
  },

  // ─── 批量答案提交 ─────────────────────────────────────────
  submitCodingAnswerBatch: async () => {
    const sid = get().activeSessionId;
    const answers = get().codingAnswers;
    const workingDir = get().codingProjectPath || '';
    if (!sid || Object.keys(answers).length === 0) return;

    set({ codingQuestionsSubmitted: true });
    try {
      await api.submitCodingAnswerBatch({
        sessionId: String(sid),
        answers,
        workingDir,
      });
      set({
        codingPendingQuestions: [],
        codingCurrentQuestionIdx: 0,
        codingAnswers: {},
      });
    } catch (e) {
      set({ codingQuestionsSubmitted: false });
      get().pushNotification({ title: '提交失败', body: e.message });
    }
  },

  // ─── Wizard 导航 ──────────────────────────────────────────
  setCodingAnswer: (questionId, answer) => {
    set({
      codingAnswers: { ...get().codingAnswers, [questionId]: answer },
    });
  },
  codingNextQuestion: () => {
    const idx = get().codingCurrentQuestionIdx;
    const total = get().codingPendingQuestions.length;
    if (idx < total - 1) {
      set({ codingCurrentQuestionIdx: idx + 1 });
    }
  },
  codingPrevQuestion: () => {
    const idx = get().codingCurrentQuestionIdx;
    if (idx > 0) {
      set({ codingCurrentQuestionIdx: idx - 1 });
    }
  },

  // ─── 清空 Coding 对话状态 ─────────────────────────────────
  clearCodingChat: () => {
    set({
      codingMessages: [],
      codingLiveBlocks: [],
      codingIsStreaming: false,
      codingAgentState: 'IDLE',
      codingStartedAt: null,
      codingPendingQuestions: [],
      codingCurrentQuestionIdx: 0,
      codingAnswers: {},
      codingQuestionsSubmitted: false,
      codingTasks: [],
      liveDiffs: [],
      subAgents: [],
      codingCheckpoints: [],
    });
  },

  // ─── 加载 Coding 会话消息 ─────────────────────────────────
  loadCodingMessages: async (sessionId) => {
    try {
      const msgs = await api.listMessages(sessionId);
      set({ codingMessages: msgs || [] });
    } catch {
      set({ codingMessages: [] });
    }
  },

  // ─── Coding abort ─────────────────────────────────────────
  codingAbort: async () => {
    const sid = get().activeSessionId;
    if (!sid) return;
    await api.abortChat(sid).catch(() => {});
    set({ codingIsStreaming: false, codingAgentState: 'IDLE' });
  },
});
