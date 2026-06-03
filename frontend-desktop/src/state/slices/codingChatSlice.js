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
  codingQuestionsPermissionId: null,

  // ─── Sub-agent 状态 ─────────────────────────────────────────
  subAgents: [],
  _codingAborted: false,
  _subAgentIdMap: {},

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

    // Guard: skip ALL streaming events after abort to prevent stale state updates and crashes
    const streamEvents = [
      'text', 'thinking', 'tool_start', 'tool_end', 'file_diff', 'message_usage',
      'subagent_start', 'subagent_update', 'subagent_done',
      'task_update', 'ask_question', 'ask_questions_batch',
      'permission_request', 'sdk_checkpoint',
    ];
    if (!state.codingIsStreaming && streamEvents.includes(event)) {
      return;
    }
    // Also guard agent_state after abort (but not when starting a new session)
    if (event === 'agent_state' && !state.codingIsStreaming && state._codingAborted) {
      return;
    }

    let payload;
    try { payload = data ? JSON.parse(data) : null; } catch { payload = data; }

    switch (event) {
      case 'agent_state': {
        const s = (payload && payload.state) || 'IDLE';
        const prevState = state.codingAgentState;
        set({ codingAgentState: s });
        if (s === 'THINKING' && !state.codingIsStreaming) {
          set({ codingIsStreaming: true, codingStartedAt: Date.now(), codingLiveBlocks: [] });
        }
        if (s === 'THINKING' && prevState === 'AWAITING_PERMISSION') {
          const blocks = [...get().codingLiveBlocks];
          let changed = false;
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (blocks[i].type === 'permission' && !blocks[i].resolved) {
              blocks[i] = { ...blocks[i], resolved: true };
              changed = true;
              break;
            }
          }
          if (changed) set({ codingLiveBlocks: blocks });
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
          const shouldMerge = payload?.merge !== false;
          if (shouldMerge) {
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
          } else {
            set({ codingTasks: newTasks });
          }
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
            codingQuestionsPermissionId: payload?.permission_id || null,
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
        const toolBlock = {
          type: 'tool',
          name: payload?.name || '',
          label: payload?.label || '执行技能',
          startedAt: Date.now(),
          done: false,
        };
        if (payload?.parent_tool_use_id) {
          toolBlock.parent_tool_use_id = payload.parent_tool_use_id;
          const agents = [...get().subAgents];
          const idMap = get()._subAgentIdMap || {};
          const mappedId = idMap[payload.parent_tool_use_id];
          const saFallback = `sa_${payload.parent_tool_use_id}`;
          const idx = agents.findIndex(a =>
            a.id === mappedId || a.id === saFallback || a.id === payload.parent_tool_use_id
          );
          if (idx >= 0) {
            const toolName = payload.name || '';
            agents[idx] = {
              ...agents[idx],
              last_tool_name: toolName,
              toolActivities: [
                ...(agents[idx].toolActivities || []).slice(-9),
                { name: toolName, ts: Date.now(), done: false },
              ],
            };
            set({ subAgents: agents });
          }
        }
        blocks.push(toolBlock);
        set({ codingLiveBlocks: blocks });
        // Track active file for glow effect
        const toolPath = payload?.input?.path || payload?.input?.file_path;
        if (toolPath && get().addCodingActiveFile) {
          get().addCodingActiveFile(toolPath);
        }
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
              if (payload.parent_tool_use_id && !blocks[i].parent_tool_use_id) {
                blocks[i].parent_tool_use_id = payload.parent_tool_use_id;
              }
            }
            // Mark tool activity done in the sub-agent
            if (blocks[i].parent_tool_use_id) {
              const pId = blocks[i].parent_tool_use_id;
              const agents = [...get().subAgents];
              const idMap = get()._subAgentIdMap || {};
              const mappedId = idMap[pId];
              const saFallback = `sa_${pId}`;
              const saIdx = agents.findIndex(a =>
                a.id === mappedId || a.id === saFallback || a.id === pId
              );
              if (saIdx >= 0) {
                const activities = [...(agents[saIdx].toolActivities || [])];
                for (let j = activities.length - 1; j >= 0; j--) {
                  if (!activities[j].done && activities[j].name === blocks[i].name) {
                    activities[j] = { ...activities[j], done: true, endedAt: Date.now() };
                    break;
                  }
                }
                agents[saIdx] = { ...agents[saIdx], toolActivities: activities };
                set({ subAgents: agents });
              }
            }
            // Remove from active files after delay
            const toolPath = payload?.input?.path || payload?.input?.file_path || blocks[i]?.input?.path;
            if (toolPath && get().removeCodingActiveFile) {
              setTimeout(() => get().removeCodingActiveFile(toolPath), 2000);
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
      case 'sdk_checkpoint': {
        const cps = [...get().codingCheckpoints];
        cps.push({
          id: payload?.checkpoint_id,
          sdk_checkpoint: true,
          session_id: payload?.session_id,
          created_at: payload?.created_at || new Date().toISOString(),
        });
        set({ codingCheckpoints: cps });
        break;
      }
      case 'checkpoint_rolled_back': {
        const sid = get().activeSessionId;
        if (sid) get().loadCodingMessages(sid);
        set({ codingTasks: [], codingLiveBlocks: [] });
        break;
      }
      case 'subagent_start': {
        const agents = [...get().subAgents];
        const saId = payload?.id || `sa_${Date.now()}`;
        agents.push({
          id: saId,
          description: payload?.description || '',
          status: 'working',
          parent_id: payload?.parent_id || null,
          message_id: payload?.message_id || null,
          toolActivities: [],
        });
        // Track sa_xxx -> id mapping for parent_tool_use_id lookup
        if (saId.startsWith('sa_')) {
          const toolUseId = saId.slice(3);
          set({ _subAgentIdMap: { ...get()._subAgentIdMap, [toolUseId]: saId } });
        }
        set({ subAgents: agents });
        break;
      }
      case 'subagent_update': {
        const agents = [...get().subAgents];
        // Try to match by current id, or by previous_id (when task_started renames sa_xxx → task_id)
        let idx = agents.findIndex(a => a.id === payload?.id);
        if (idx < 0 && payload?.previous_id) {
          idx = agents.findIndex(a => a.id === payload.previous_id);
        }
        if (idx >= 0) {
          const oldId = agents[idx].id;
          const { previous_id: _prev, ...rest } = payload || {};
          agents[idx] = { ...agents[idx], ...rest, toolActivities: agents[idx].toolActivities || [] };
          // Update the ID mapping for parent_tool_use_id lookup
          if (oldId !== rest.id && oldId.startsWith('sa_')) {
            const toolUseId = oldId.slice(3);
            set({ _subAgentIdMap: { ...get()._subAgentIdMap, [toolUseId]: rest.id } });
          }
          set({ subAgents: agents });
        }
        break;
      }
      case 'subagent_done': {
        const agents = [...get().subAgents];
        const idx = agents.findIndex(a => a.id === payload?.id);
        if (idx >= 0) {
          agents[idx] = { ...agents[idx], ...payload, status: 'done' };
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
        try {
          // Skip if already aborted
          if (!get().codingIsStreaming) break;
          flushCodingNow(set, get);
          const remaining = get().codingLiveBlocks.filter((b) => b.text || b.type === 'tool');
          if (remaining.length > 0) {
            const newMsg = {
              id: -Date.now(),
              session_id: get().activeSessionId,
              role: 'assistant',
              content: JSON.stringify(remaining),
              created_at: new Date().toISOString(),
            };
            set({
              codingMessages: [...get().codingMessages, newMsg],
              codingLiveBlocks: [],
            });
          }
          set({ codingIsStreaming: false, codingAgentState: 'IDLE', subAgents: [] });
        } catch (e) {
          console.warn('[codingChat] done handler error:', e);
          set({ codingIsStreaming: false, codingAgentState: 'IDLE', codingLiveBlocks: [], subAgents: [] });
        }
        break;
      }
      default:
        break;
    }
  },

  // ─── Coding 发送消息（调用独立 API） ───────────────────────
  codingSendMessage: async ({ message, images = [], files = [], workingDir, thinking }) => {
    const effectiveWorkingDir = workingDir || get().codingProjectPath || '';
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
      codingQuestionsPermissionId: null,
      subAgents: [],
      _subAgentIdMap: {},
      codingTasks: [],
      _codingAborted: false,
    });
    try {
      const payload = { message, sessionId: String(sid), images, files };
      if (effectiveWorkingDir) payload.workingDir = effectiveWorkingDir;
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
    const questions = get().codingPendingQuestions;
    const workingDir = get().codingProjectPath || '';
    const permissionId = get().codingQuestionsPermissionId;
    if (!sid || Object.keys(answers).length === 0) return;

    set({ codingQuestionsSubmitted: true });

    // 将当前的 liveBlocks 合并为 assistant 消息（如果有内容的话）
    const currentLiveBlocks = get().codingLiveBlocks.filter((b) => b.text || b.type === 'tool');
    let updatedMessages = [...get().codingMessages];
    if (currentLiveBlocks.length > 0) {
      const assistantMsg = {
        id: -(Date.now() - 1),
        session_id: sid,
        role: 'assistant',
        content: JSON.stringify(currentLiveBlocks),
        created_at: new Date().toISOString(),
      };
      updatedMessages.push(assistantMsg);
    }

    // 将问答记录作为结构化用户消息添加到聊天历史中
    const qaItems = questions.map((q, i) => {
      const parsed = typeof q === 'string' ? (() => { try { return JSON.parse(q); } catch { return q; } })() : q;
      const qText = parsed?.title || parsed?.question || parsed?.prompt || `Question ${i + 1}`;
      const qId = parsed?.id || `q_${i}`;
      const opts = parsed?.options || [];
      const ans = answers[qId] || '';
      return { question: qText, answer: ans, options: opts };
    });
    if (qaItems.length > 0) {
      const qaMsg = {
        id: -Date.now(),
        session_id: sid,
        role: 'user',
        content: JSON.stringify({ type: 'ask_question_reply', items: qaItems }),
        created_at: new Date().toISOString(),
      };
      updatedMessages.push(qaMsg);
    }
    // 清空 liveBlocks 以便 ThinkingIndicator 显示，告知用户 agent 正在继续
    set({ codingMessages: updatedMessages, codingLiveBlocks: [] });

    try {
      if (permissionId) {
        // AskUserQuestion 走 permission-response 通道（阻塞式）
        await api.submitCodingPermissionResponse({
          sessionId: String(sid),
          permissionId,
          behavior: 'allow',
          updatedInput: { answers },
        });
      } else {
        // 兼容旧的非阻塞流程
        await api.submitCodingAnswerBatch({
          sessionId: String(sid),
          answers,
          workingDir,
        });
      }
      set({
        codingPendingQuestions: [],
        codingCurrentQuestionIdx: 0,
        codingAnswers: {},
        codingQuestionsPermissionId: null,
        codingAgentState: 'THINKING',
      });
      // Auto-dismiss the "submitted" banner after a short delay
      setTimeout(() => {
        set({ codingQuestionsSubmitted: false });
      }, 3000);
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

  // ─── Rewind to checkpoint ────────────────────────────────
  rewindToCheckpoint: async (checkpointId) => {
    try {
      const result = await api.rollbackCheckpoint(checkpointId);
      const sid = get().activeSessionId;
      if (sid) {
        await get().loadCodingMessages(sid);
      }
      const cps = get().codingCheckpoints.filter(cp => {
        if (typeof cp.id === 'number' && typeof checkpointId === 'number') return cp.id <= checkpointId;
        return true;
      });
      set({ codingCheckpoints: cps, codingTasks: [], codingLiveBlocks: [] });
      if (result?.todo_snapshot) {
        try {
          const todos = JSON.parse(result.todo_snapshot);
          if (Array.isArray(todos)) set({ codingTasks: todos });
        } catch {}
      }
      get().pushNotification?.({ title: '回滚成功', body: `已恢复 ${result?.files_restored || 0} 个文件` });
    } catch (e) {
      get().pushNotification?.({ title: '回滚失败', body: e.message });
    }
  },

  // ─── Load checkpoints for session ──────────────────────
  loadCheckpoints: async (sessionId) => {
    try {
      const cps = await api.listCheckpoints(sessionId);
      set({ codingCheckpoints: cps || [] });
    } catch {
      set({ codingCheckpoints: [] });
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
      codingQuestionsPermissionId: null,
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
    // Flush pending token buffer before clearing state
    flushCodingNow(set, get);
    // Merge any remaining live blocks into a message before clearing
    const remaining = get().codingLiveBlocks.filter((b) => b.text || b.type === 'tool');
    if (remaining.length > 0) {
      const newMsg = {
        id: -Date.now(),
        session_id: sid,
        role: 'assistant',
        content: JSON.stringify(remaining),
        created_at: new Date().toISOString(),
      };
      set({ codingMessages: [...get().codingMessages, newMsg] });
    }
    // Clear all streaming state atomically to prevent stale renders
    set({
      codingIsStreaming: false,
      codingAgentState: 'IDLE',
      codingLiveBlocks: [],
      codingTasks: [],
      subAgents: [],
      _subAgentIdMap: {},
      codingPendingQuestions: [],
      codingCurrentQuestionIdx: 0,
      codingAnswers: {},
      codingQuestionsSubmitted: false,
      _codingAborted: true,
    });
    await api.abortChat(sid).catch(() => {});
  },
});
