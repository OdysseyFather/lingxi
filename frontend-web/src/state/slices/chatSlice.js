import { api } from '../../api/client';

const TOKEN_FLUSH_MS = 50;
let _tokenBuf = { text: '', thinking: '' };
let _flushTimer = null;

function flushTokenBuffer(set, get) {
  const buf = _tokenBuf;
  _tokenBuf = { text: '', thinking: '' };
  _flushTimer = null;
  if (!buf.text && !buf.thinking) return;
  const blocks = [...get().liveBlocks];
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
  set({ liveBlocks: blocks });
}

function bufferToken(type, chunk, set, get) {
  _tokenBuf[type] += chunk;
  if (!_flushTimer) {
    _flushTimer = setTimeout(() => flushTokenBuffer(set, get), TOKEN_FLUSH_MS);
  }
}

function flushNow(set, get) {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  flushTokenBuffer(set, get);
}

function generateQuickReplies(text) {
  if (!text || text.length < 10) return [];
  const replies = [];

  if (/代码|函数|代码块|实现|编程|程序/.test(text)) {
    replies.push('请解释这段代码的工作原理');
    replies.push('能否优化一下这段代码？');
    replies.push('请为这段代码添加注释');
  } else if (/翻译|translation/i.test(text)) {
    replies.push('翻译得很好，再翻译一段');
    replies.push('改为更口语化的表达');
    replies.push('帮我校对一下语法');
  } else if (/步骤|方案|计划|方法|建议/.test(text)) {
    replies.push('请详细展开第一步');
    replies.push('有没有其他替代方案？');
    replies.push('请总结一下要点');
  } else if (/表格|数据|分析|统计/.test(text)) {
    replies.push('请用图表展示');
    replies.push('帮我进一步分析');
    replies.push('导出为 CSV 格式');
  } else if (/总结|摘要|要点/.test(text)) {
    replies.push('请更详细地展开');
    replies.push('能否用列表形式重新整理？');
  } else {
    replies.push('继续');
    replies.push('请详细说明');
    replies.push('帮我总结一下');
  }

  return replies.slice(0, 3);
}

export const createChatSlice = (set, get) => ({
  messages: [],
  liveBlocks: [],
  agentState: 'IDLE',
  isStreaming: false,
  startedAt: null,
  suggestedReplies: [],
  evolutionActivity: [],
  evolutionProgress: null,
  evolutionResults: [],
  dreamProgress: null,
  screenAgentMode: false,
  screenAgentAnalyzing: false,
  screenAgentResult: null,
  screenAgentPlan: null,
  screenAgentExecuting: false,
  screenAgentStepIndex: 0,
  screenAgentTotalSteps: 0,
  screenAgentCurrentStep: null,
  screenAgentConfirmNeeded: null,

  // 定时任务运行状态：{ [task_id]: { task_id, task_name, session_id, run_id, started_at } }
  runningScheduledTasks: {},
  // 最近完成的定时任务（最多 30 条）
  scheduledTaskHistory: [],

  handleWSEvent: (msg) => {
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
        set({ agentState: s });
        if (s === 'THINKING' && !state.isStreaming) {
          set({ isStreaming: true, startedAt: Date.now(), liveBlocks: [] });
        }
        break;
      }
      case 'thinking': {
        const text = typeof payload === 'string' ? payload : (data || '');
        bufferToken('thinking', text, set, get);
        break;
      }
      case 'text': {
        const text = typeof payload === 'string' ? payload : (data || '');
        bufferToken('text', text, set, get);
        break;
      }
      case 'task_update': {
        break;
      }
      case 'ask_question': {
        flushNow(set, get);
        const blocks = [...get().liveBlocks];
        blocks.push({
          type: 'ask_question',
          question: payload?.question || '',
          options: payload?.options || [],
          allowCustom: payload?.allow_custom !== false,
          id: payload?.id || Date.now(),
        });
        set({ liveBlocks: blocks });
        break;
      }
      case 'file_diff': {
        const diffs = get().liveDiffs || [];
        const existing = diffs.findIndex(d => d.file === payload?.file);
        const entry = {
          file: payload?.file || '',
          diff: payload?.diff || '',
          tool: payload?.tool || '',
          isNew: payload?.is_new || false,
          added: payload?.added || 0,
          removed: payload?.removed || 0,
          ts: Date.now(),
        };
        if (existing >= 0) {
          diffs[existing] = entry;
          set({ liveDiffs: [...diffs] });
        } else {
          set({ liveDiffs: [...diffs, entry] });
        }
        break;
      }
      case 'tool_start': {
        flushNow(set, get);
        const blocks = [...get().liveBlocks];
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
        if (payload?.hidden) break;
        flushNow(set, get);
        const blocks = [...get().liveBlocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          if (blocks[i].type === 'tool' && !blocks[i].done) {
            blocks[i].done = true;
            blocks[i].endedAt = Date.now();
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
        flushNow(set, get);
        const usage = payload?.usage;
        const messageId = payload?.messageId;
        if (!usage) break;
        const finalBlocks = get().liveBlocks.filter((b) => b.text || b.type === 'tool');
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
      case 'suggested_replies': {
        const replies = Array.isArray(payload) ? payload : [];
        set({ suggestedReplies: replies.slice(0, 3) });
        break;
      }
      case 'done': {
        flushNow(set, get);
        if (get().isStreaming) {
          const finalBlocks = get().liveBlocks.filter((b) => b.text || b.type === 'tool');
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

          const lastText = finalBlocks.filter(b => b.type === 'text').map(b => b.text).join('').slice(0, 500);

          // AI 生成的建议（suggested_replies WS 事件）优先；仅在无 AI 建议时用本地正则兜底
          if (get().suggestedReplies.length === 0) {
            const suggestions = generateQuickReplies(lastText);
            if (suggestions.length > 0) set({ suggestedReplies: suggestions });
          }

          if (localStorage.getItem('lingxi_notifications') !== 'false') {
            const preview = lastText.slice(0, 80) || 'Agent 已回复';
            if (window.electronAPI?.showNotification) {
              window.electronAPI.showNotification('灵犀 — 回复完成', preview);
            } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('灵犀 — 回复完成', { body: preview });
            } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
              Notification.requestPermission().then(perm => {
                if (perm === 'granted') new Notification('灵犀 — 回复完成', { body: preview });
              });
            }
          }
        }
        if (state.activeSessionId) {
          api.listMessages(state.activeSessionId).then((m) => {
            const existing = get().messages;
            const merged = m.map((msg) => {
              const prev = existing.find((e) => e.id === msg.id);
              if (prev && prev.usage && !msg.usage) {
                return { ...msg, usage: prev.usage };
              }
              return msg;
            });
            set({ messages: merged });
          }).catch(() => {});
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
      case 'evolution_progress': {
        const info = typeof payload === 'object' ? payload : {};
        if (info.phase === 'done' || info.phase === 'error') {
          const delay = info.phase === 'error' ? 10000 : 5000;
          setTimeout(() => {
            const cur = get().evolutionProgress;
            if (cur && (cur.phase === 'done' || cur.phase === 'error')) {
              set({ evolutionProgress: null });
            }
          }, delay);
        }
        set({ evolutionProgress: { ...info, ts: Date.now() } });
        break;
      }
      case 'evolution_scan_progress': {
        const info = typeof payload === 'object' ? payload : {};
        const evoLog = [...(state.evolutionActivity || [])];
        evoLog.unshift({ ...info, ts: Date.now() });
        if (evoLog.length > 50) evoLog.length = 50;
        set({ evolutionActivity: evoLog });
        break;
      }
      case 'evolution_status': {
        const info = typeof payload === 'object' ? payload : {};
        const evoLog = [...(state.evolutionActivity || [])];
        evoLog.unshift({ ...info, ts: Date.now() });
        if (evoLog.length > 50) evoLog.length = 50;
        set({ evolutionActivity: evoLog });
        if (info.phase === 'done' && info.results) {
          const results = [...(state.evolutionResults || [])];
          results.unshift({ ...info, ts: Date.now(), dismissed: false });
          if (results.length > 20) results.length = 20;
          set({ evolutionResults: results });
        }
        break;
      }
      case 'evolution_result': {
        const info = typeof payload === 'object' ? payload : {};
        const evoLog = [...(state.evolutionActivity || [])];
        evoLog.unshift({ phase: 'result', ...info, ts: Date.now() });
        if (evoLog.length > 50) evoLog.length = 50;
        set({ evolutionActivity: evoLog });
        const results = [...(state.evolutionResults || [])];
        results.unshift({ phase: 'result', ...info, ts: Date.now(), dismissed: false });
        if (results.length > 20) results.length = 20;
        set({ evolutionResults: results });
        break;
      }
      case 'evolution_reverted': {
        const info = typeof payload === 'object' ? payload : {};
        const evoLog = [...(state.evolutionActivity || [])];
        evoLog.unshift({ phase: 'reverted', ...info, ts: Date.now() });
        if (evoLog.length > 50) evoLog.length = 50;
        set({ evolutionActivity: evoLog });
        break;
      }
      case 'dream_progress': {
        const info = typeof payload === 'object' ? payload : {};
        set({ dreamProgress: { ...info, phase: 'progress', ts: Date.now() } });
        break;
      }
      case 'dream_scan_start': {
        const info = typeof payload === 'object' ? payload : {};
        set({ dreamProgress: { ...info, phase: 'scan_start', ts: Date.now() } });
        break;
      }
      case 'dream_scan_done': {
        const info = typeof payload === 'object' ? payload : {};
        if (!info.dispatched) {
          set({ dreamProgress: null });
        } else {
          set({ dreamProgress: { ...info, phase: 'scan_done', ts: Date.now() } });
        }
        break;
      }
      case 'dream_done': {
        const info = typeof payload === 'object' ? payload : {};
        set({ dreamProgress: { ...info, phase: 'done', ts: Date.now() } });
        setTimeout(() => {
          const cur = get().dreamProgress;
          if (cur && cur.phase === 'done') set({ dreamProgress: null });
        }, 8000);
        if (info.added || info.updated || info.removed) {
          state.pushNotification({
            title: '记忆巩固完成',
            body: `新增 ${info.added || 0} / 更新 ${info.updated || 0} / 清理 ${info.removed || 0}`,
          });
        }
        break;
      }
      case 'dream_error': {
        const info = typeof payload === 'object' ? payload : {};
        set({ dreamProgress: { ...info, phase: 'error', ts: Date.now() } });
        setTimeout(() => {
          const cur = get().dreamProgress;
          if (cur && cur.phase === 'error') set({ dreamProgress: null });
        }, 10000);
        state.pushNotification({ title: '记忆巩固失败', body: info.error || '未知错误' });
        break;
      }
      case 'desktop_notify': {
        const info = typeof payload === 'object' ? payload : {};
        const title = info.title || '灵犀 — 定时任务';
        const body = info.body || '任务已完成';
        state.pushNotification({ title, body });
        if (window.electronAPI?.showNotification) {
          window.electronAPI.showNotification(title, body);
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(title, { body });
        } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') new Notification(title, { body });
          });
        }
        break;
      }
      case 'screen_agent_plan_start': {
        const info = typeof payload === 'object' ? payload : {};
        set({
          screenAgentExecuting: true,
          screenAgentStepIndex: 0,
          screenAgentTotalSteps: info.total_steps || 0,
          screenAgentCurrentStep: null,
          screenAgentConfirmNeeded: null,
        });
        break;
      }
      case 'screen_agent_step_start': {
        const info = typeof payload === 'object' ? payload : {};
        set({
          screenAgentCurrentStep: {
            step: info.step,
            total: info.total,
            description: info.description,
            action: info.action,
          },
        });
        break;
      }
      case 'screen_agent_confirm_needed': {
        const info = typeof payload === 'object' ? payload : {};
        set({ screenAgentConfirmNeeded: info });
        break;
      }
      case 'screen_agent_step_done': {
        const info = typeof payload === 'object' ? payload : {};
        set({
          screenAgentStepIndex: info.step || ((state.screenAgentStepIndex || 0) + 1),
          screenAgentCurrentStep: null,
          screenAgentConfirmNeeded: null,
        });
        if (info.status === 'failed') {
          set({ screenAgentExecuting: false });
          state.pushNotification({ title: 'Screen Agent 操作失败', body: info.error || '' });
        }
        if (info.status === 'cancelled') {
          set({ screenAgentExecuting: false });
        }
        break;
      }
      case 'screen_agent_execute': {
        const info = typeof payload === 'object' ? payload : {};
        if (window.electronAPI?.screenAgent && info.action) {
          try {
            const actionObj = typeof info.action === 'string' ? JSON.parse(info.action) : info.action;
            window.electronAPI.screenAgent.executeAction(actionObj).then((result) => {
              api.screenAgentStepResult({
                action_id: info.action_id,
                status: result?.success ? 'success' : 'failed',
                error_msg: result?.error || '',
                screenshot_after: '',
              }).catch(() => {});
            }).catch((err) => {
              api.screenAgentStepResult({
                action_id: info.action_id,
                status: 'failed',
                error_msg: err.message || 'Unknown error',
                screenshot_after: '',
              }).catch(() => {});
            });
          } catch (e) {
            api.screenAgentStepResult({
              action_id: info.action_id,
              status: 'failed',
              error_msg: e.message || 'Parse error',
              screenshot_after: '',
            }).catch(() => {});
          }
        }
        break;
      }
      case 'screen_agent_plan_done': {
        set({
          screenAgentExecuting: false,
          screenAgentCurrentStep: null,
          screenAgentConfirmNeeded: null,
        });
        state.pushNotification({ title: 'Screen Agent', body: '操作计划执行完毕' });
        break;
      }
      case 'screen_agent_plan_abort':
      case 'screen_agent_abort': {
        set({
          screenAgentExecuting: false,
          screenAgentAnalyzing: false,
          screenAgentStepIndex: 0,
          screenAgentCurrentStep: null,
          screenAgentConfirmNeeded: null,
        });
        break;
      }
      case 'group_message': {
        const info = typeof payload === 'object' ? payload : null;
        if (info) state.applyGroupMessage(info);
        break;
      }
      case 'group_stream_token':
      case 'group_stream_token_remote': {
        const info = typeof payload === 'object' ? payload : null;
        if (info) {
          if (info.event === 'stream_start' || info.event === 'stream_done') {
            console.debug('[group stream]', info.event, info.sender_agent_name);
          }
          state.applyGroupStreamToken(info);
        }
        break;
      }
      case 'group_member_joined':
      case 'group_member_left':
      case 'group_status_change':
      case 'group_members_sync': {
        state.refreshGroupChats();
        state.refreshActiveGroupRoom();
        break;
      }
      case 'group_invite_received': {
        const info = typeof payload === 'object' ? payload : null;
        if (info) {
          state.enqueueGroupInvite(info);
          state.refreshGroupChats();
          state.pushNotification({ title: '收到群聊邀请', body: `${info.host_nickname || '某 peer'}：${info.topic || '(无主题)'}` });
        }
        break;
      }
      case 'group_message_recalled': {
        const info = typeof payload === 'object' ? payload : null;
        if (info) state.applyGroupRecall?.(info);
        break;
      }
      case 'group_agent_typing': {
        const info = typeof payload === 'object' ? payload : null;
        if (info) state.applyGroupAgentTyping?.(info);
        break;
      }
      case 'scheduled_task_started': {
        const info = typeof payload === 'object' ? payload : {};
        const tid = info.task_id;
        if (!tid) break;
        const next = { ...(state.runningScheduledTasks || {}) };
        next[tid] = { ...info, ts: Date.now() };
        set({ runningScheduledTasks: next });
        break;
      }
      case 'scheduled_task_done': {
        const info = typeof payload === 'object' ? payload : {};
        const tid = info.task_id;
        if (!tid) break;
        const running = { ...(state.runningScheduledTasks || {}) };
        delete running[tid];
        const history = [{ ...info, ts: Date.now() }, ...(state.scheduledTaskHistory || [])].slice(0, 30);
        set({ runningScheduledTasks: running, scheduledTaskHistory: history });
        break;
      }
      default: break;
    }
  },

  toggleScreenAgentMode: () => {
    const mode = !get().screenAgentMode;
    set({ screenAgentMode: mode, screenAgentResult: null, screenAgentPlan: null });
  },

  screenAgentAnalyze: async (instruction) => {
    const sid = get().activeSessionId;
    if (!sid) return;
    set({ screenAgentAnalyzing: true, screenAgentResult: null });
    try {
      let screenshot = null;
      let context = {};
      if (window.electronAPI?.screenAgent) {
        const cap = await window.electronAPI.screenAgent.capture();
        screenshot = cap.data;
        context = await window.electronAPI.screenAgent.getContext();
      } else {
        set({ screenAgentAnalyzing: false });
        get().pushNotification({ title: 'Screen Agent', body: '需要桌面应用才能使用屏幕操控' });
        return;
      }
      const result = await api.screenAgentAnalyze({
        screenshot,
        context: {
          app_name: context.appName || '',
          window_title: context.windowTitle || '',
          url: context.url || '',
          context_type: context.contextType || '',
          cursor_x: context.cursorX || 0,
          cursor_y: context.cursorY || 0,
          screen_width: context.screenWidth || 0,
          screen_height: context.screenHeight || 0,
          scale_factor: context.scaleFactor || 1,
        },
        instruction: instruction || '',
        session_id: sid,
      });
      set({ screenAgentResult: { analysis: result.analysis, screenshot, timestamp: Date.now() }, screenAgentAnalyzing: false });
    } catch (e) {
      set({ screenAgentAnalyzing: false });
      get().pushNotification({ title: 'Screen Agent 分析失败', body: e.message });
    }
  },

  screenAgentMakePlan: async (instruction) => {
    const sid = get().activeSessionId;
    if (!sid) return;
    set({ screenAgentAnalyzing: true, screenAgentPlan: null });
    try {
      let screenshot = null;
      let context = {};
      if (window.electronAPI?.screenAgent) {
        const cap = await window.electronAPI.screenAgent.capture();
        screenshot = cap.data;
        context = await window.electronAPI.screenAgent.getContext();
      } else {
        set({ screenAgentAnalyzing: false });
        return;
      }
      const result = await api.screenAgentPlan({
        screenshot,
        context: {
          app_name: context.appName || '',
          window_title: context.windowTitle || '',
          screen_width: context.screenWidth || 0,
          screen_height: context.screenHeight || 0,
        },
        instruction,
        session_id: sid,
      });
      set({
        screenAgentPlan: { steps: result.steps || [], rawPlan: result.raw_plan, screenshot, timestamp: Date.now() },
        screenAgentAnalyzing: false,
      });
    } catch (e) {
      set({ screenAgentAnalyzing: false });
      get().pushNotification({ title: 'Screen Agent 规划失败', body: e.message });
    }
  },

  screenAgentExecuteStep: async (actionJson) => {
    const sid = get().activeSessionId;
    if (!sid) return;
    try {
      await api.screenAgentStep({ session_id: sid, action: actionJson });
    } catch (e) {
      get().pushNotification({ title: '操作执行失败', body: e.message });
    }
  },

  screenAgentExecutePlan: async (steps, autoMode = false) => {
    const sid = get().activeSessionId;
    if (!sid || !steps?.length) return;
    try {
      await api.screenAgentExecutePlan({ session_id: sid, steps, auto_mode: autoMode });
    } catch (e) {
      get().pushNotification({ title: '执行计划失败', body: e.message });
    }
  },

  screenAgentConfirmAction: async (actionId, confirmed) => {
    const sid = get().activeSessionId;
    if (!sid) return;
    set({ screenAgentConfirmNeeded: null });
    try {
      await api.screenAgentConfirm({ session_id: sid, action_id: actionId, confirmed });
    } catch (e) {
      get().pushNotification({ title: '确认失败', body: e.message });
    }
  },

  screenAgentAbort: async () => {
    const sid = get().activeSessionId;
    if (!sid) return;
    set({ screenAgentExecuting: false, screenAgentAnalyzing: false, screenAgentConfirmNeeded: null });
    await api.screenAgentAbort(sid).catch(() => {});
    if (window.electronAPI?.screenAgent) {
      await window.electronAPI.screenAgent.abort().catch(() => {});
    }
  },

  sendMessage: async ({ message, images = [], useKB = false, files = [], workingDir = '' }) => {
    let sid = get().activeSessionId;
    if (!sid) {
      sid = await get().createSession();
    }

    // 如果当前有正在进行的流式对话，先 abort 再发送新消息
    if (get().isStreaming && sid) {
      await api.abortChat(sid).catch(() => {});
      set({ isStreaming: false, agentState: 'IDLE' });
      // 等待后端进程清理
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
      messages: [...get().messages, localUserMsg],
      liveBlocks: [],
      liveDiffs: [],
      isStreaming: true,
      startedAt: Date.now(),
      agentState: 'THINKING',
      suggestedReplies: [],
    });
    try {
      const payload = {
        message,
        sessionId: String(sid),
        useKB,
        images,
        files,
      };
      if (workingDir) payload.workingDir = workingDir;
      // 通用设置：思考模式 + 回复语言
      try {
        const thinkingEnabled = JSON.parse(localStorage.getItem('lingxi_thinking_enabled') ?? 'true');
        if (!thinkingEnabled) payload.thinking = false;
        const replyLang = localStorage.getItem('lingxi_reply_lang')?.replace(/"/g, '') || '';
        if (replyLang && replyLang !== 'zh') payload.replyLang = replyLang;
      } catch {}
      await api.sendChat(payload);
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

  editAndResend: async (messageId, newContent) => {
    const { messages, activeSessionId, isStreaming } = get();
    if (isStreaming || !activeSessionId) return;
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    try {
      await api.updateMessage(messageId, newContent);
    } catch (e) {
      get().pushNotification({ title: '编辑失败', body: e.message });
      return;
    }
    const updated = { ...messages[idx], content: newContent };
    set({
      messages: [...messages.slice(0, idx), updated],
      liveBlocks: [],
      isStreaming: true,
      startedAt: Date.now(),
      agentState: 'THINKING',
    });
    try {
      await api.sendChat({ message: newContent, sessionId: String(activeSessionId) });
    } catch (e) {
      set({ isStreaming: false, agentState: 'IDLE' });
      get().pushNotification({ title: '重新生成失败', body: e.message });
    }
  },

  setFeedback: async (messageId, feedback) => {
    try {
      await api.setMessageFeedback(messageId, feedback);
    } catch (e) {
      get().pushNotification({ title: '反馈失败', body: e.message });
      return;
    }
    set({
      messages: get().messages.map((m) =>
        m.id === messageId ? { ...m, feedback } : m
      ),
    });
  },

  regenerate: async (messageId) => {
    const { messages, activeSessionId, isStreaming } = get();
    if (isStreaming || !activeSessionId) return;
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    let userMsg = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsg = messages[i]; break; }
    }
    if (!userMsg) return;
    let text = userMsg.content || '';
    let images = [];
    try {
      const obj = JSON.parse(text);
      if (obj?.text != null) {
        text = obj.text;
        images = (obj.images || []).filter(src => src.startsWith('data:')).map((src) => {
          const [header, b64] = src.split(',');
          const mt = (header.match(/data:(.*?);/) || [])[1] || 'image/png';
          return { mediaType: mt, data: b64 || '' };
        });
      }
    } catch {}
    set({
      messages: messages.slice(0, idx),
      liveBlocks: [],
      isStreaming: true,
      startedAt: Date.now(),
      agentState: 'THINKING',
    });
    try {
      await api.sendChat({ message: text, sessionId: String(activeSessionId), images });
    } catch (e) {
      set({ isStreaming: false, agentState: 'IDLE' });
      get().pushNotification({ title: '重新生成失败', body: e.message });
    }
  },
});
