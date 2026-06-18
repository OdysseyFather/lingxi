// 与后端 REST + WebSocket 通信的轻量封装

const baseHeaders = { 'Content-Type': 'application/json' };

// 检测隧道路径前缀（如 /tunnel/lx_tunnel_xxx）
function detectTunnelBase() {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/^(\/tunnel\/[^/]+)/);
  return m ? m[1] : '';
}
export const TUNNEL_BASE = detectTunnelBase();

async function req(method, path, body) {
  const opts = { method, headers: baseHeaders, credentials: 'include' };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(TUNNEL_BASE + path, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  // auth
  getAuthStatus: () => req('GET', '/api/auth/status'),
  getCurrentUser: () => req('GET', '/api/auth/me'),
  guestLogin: (nickname) => req('POST', '/api/auth/guest', { nickname }),
  oauthCallback: (data) => req('POST', '/api/auth/oauth/callback', data),
  logout: () => req('POST', '/api/auth/logout'),
  listOAuthConfigs: () => req('GET', '/api/auth/oauth-configs'),
  saveOAuthConfig: (data) => req('POST', '/api/auth/oauth-configs', data),

  // sessions
  listSessions: (agentId, mode, projectPath) => {
    const params = [];
    if (agentId != null) params.push(`agent_id=${agentId}`);
    if (mode) params.push(`mode=${mode}`);
    if (projectPath) params.push(`project_path=${encodeURIComponent(projectPath)}`);
    return req('GET', `/api/sessions${params.length ? '?' + params.join('&') : ''}`);
  },
  createSession: (titleOrPayload) =>
    req('POST', '/api/sessions',
      typeof titleOrPayload === 'string'
        ? { title: titleOrPayload }
        : (titleOrPayload || {})
    ),
  renameSession: (id, title) => req('PATCH', `/api/sessions/${id}`, { title }),
  pinSession: (id, pinned) => req('PATCH', `/api/sessions/${id}`, { pinned }),
  deleteSession: (id) => req('DELETE', `/api/sessions/${id}`),
  batchDeleteSessions: (ids) => req('POST', '/api/sessions/batch-delete', { ids }),
  batchExportSessions: async (ids) => {
    const res = await fetch(TUNNEL_BASE + '/api/sessions/batch-export', {
      method: 'POST', headers: baseHeaders, credentials: 'include',
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  },
  extractSessionKnowledge: (id) => req('POST', `/api/sessions/${id}/extract-knowledge`),
  forkSession: (id) => req('POST', `/api/sessions/${id}/fork`),
  listMessages: (id) => req('GET', `/api/sessions/${id}/messages`),
  setSessionAgent: (id, agent_id) => req('POST', `/api/sessions/${id}/agent`, { agent_id }),

  // messages
  updateMessage: (id, content) => req('PUT', `/api/messages/${id}`, { content }),
  setMessageFeedback: (id, feedback) => req('POST', `/api/messages/${id}/feedback`, { feedback }),

  // chat
  sendChat: (payload) => req('POST', '/api/chat', payload),
  abortChat: (sessionId) => req('POST', '/api/chat/abort', { sessionId: String(sessionId) }),
  restoreSession: (sessionId, messageId, workingDir, revertCode) =>
    req('POST', `/api/sessions/${sessionId}/restore`, { messageId, workingDir, revertCode }),

  // coding chat (独立于通用 chat)
  sendCodingChat: (payload) => req('POST', '/api/coding/chat', payload),
  submitCodingAnswerBatch: (payload) => req('POST', '/api/coding/chat/answer-batch', payload),
  submitCodingPermissionResponse: (payload) => req('POST', '/api/coding/chat/permission-response', payload),

  // coding checkpoints
  createCheckpoint: (sessionId, messageId) => req('POST', '/api/coding/checkpoint', { sessionId: String(sessionId), messageId }),
  rollbackCheckpoint: (checkpointId) => req('POST', `/api/coding/rollback/${checkpointId}`),
  listCheckpoints: (sessionId) => req('GET', `/api/coding/checkpoints/${sessionId}`),
  getCheckpointFiles: (checkpointId) => req('GET', `/api/coding/checkpoint-files/${checkpointId}`),

  // coding custom agents (sub-agent templates)
  listCodingAgents: () => req('GET', '/api/coding/agents'),
  saveCodingAgent: (agent) => req('POST', '/api/coding/agents', agent),
  deleteCodingAgent: (id) => req('DELETE', `/api/coding/agents/${id}`),

  // coding custom agents update
  updateCodingAgent: (id, agent) => req('PUT', `/api/coding/agents/${id}`, agent),

  // coding plugins
  getCodingPlugins: () => req('GET', '/api/coding/plugins'),
  saveCodingPlugins: (paths) => req('PUT', '/api/coding/plugins', { paths }),

  // coding hooks config
  getCodingHooksConfig: () => req('GET', '/api/coding/hooks-config'),
  saveCodingHooksConfig: (config) => req('PUT', '/api/coding/hooks-config', config),

  // coding prompt config
  getCodingPromptConfig: () => req('GET', '/api/coding/prompt-config'),
  saveCodingPromptConfig: (body) => req('PUT', '/api/coding/prompt-config', body),

  // coding permission config
  getCodingPermConfig: () => req('GET', '/api/coding/perm-config'),
  saveCodingPermConfig: (config) => req('PUT', '/api/coding/perm-config', config),

  // providers + profiles
  listProviders: () => req('GET', '/api/providers'),
  listProfiles: (includeCipher) => req('GET', `/api/api-profiles${includeCipher ? '?include_cipher=1' : ''}`),
  saveProfile: (p) => req('POST', '/api/api-profiles', p),
  deleteProfile: (id) => req('DELETE', `/api/api-profiles/${id}`),
  activateProfile: (id) => req('POST', `/api/api-profiles/${id}/activate`),
  testProfile: (id, body) => req('POST', `/api/api-profiles/${id}/test`, body || {}),
  fetchModels: (body) => req('POST', '/api/api-profiles/fetch-models', body),

  // skills / knowledge
  listSkills: () => req('GET', '/api/skills'),
  getSkillContent: (id) => req('GET', `/api/skills/${id}/content`),
  updateSkillContent: (id, files) => req('PUT', `/api/skills/${id}/content`, { files }),
  exportSkillUrl: (id) => `/api/skills/${id}/export`,
  searchMarketplace: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/api/skills/marketplace?${qs}`);
  },
  getMarketplaceSkill: (ns, slug) => req('GET', `/api/skills/marketplace/${ns}/${slug}`),
  installMarketplaceSkill: (data) => req('POST', '/api/skills/marketplace/install', data),
  getMarketplaceCategories: () => req('GET', '/api/skills/marketplace/categories'),
  listKnowledge: () => req('GET', '/api/knowledge'),

  // MCP
  listMCP: () => req('GET', '/api/mcp'),
  saveMCP: (m) => req('POST', '/api/mcp', m),
  deleteMCP: (id) => req('DELETE', `/api/mcp/${id}`),
  toggleMCP: (id, enabled) => req('POST', `/api/mcp/${id}/toggle`, { enabled }),

  // Agents（智能体工厂）
  listAgents: () => req('GET', '/api/agents'),
  getAgent: (id) => req('GET', `/api/agents/${id}`),
  saveAgent: (a) => req('POST', '/api/agents', a),
  deleteAgent: (id) => req('DELETE', `/api/agents/${id}`),
  uploadAgentAvatar: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/agents/upload-avatar', { method: 'POST', credentials: 'include', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data;
  },
  getDistillStatus: () => req('GET', '/api/agents/distill/status'),
  installDotSkill: () => req('POST', '/api/skills/install-github'),
  applyDistillResult: (body) => req('POST', '/api/agents/distill/apply', body),
  listDistillRecords: () => req('GET', '/api/agents/distill/records'),
  getDistillRecord: (id) => req('GET', `/api/agents/distill/records/${id}`),
  deleteDistillRecord: (id) => req('DELETE', `/api/agents/distill/records/${id}`),
  applyDistillRecord: (id) => req('POST', `/api/agents/distill/records/${id}/apply`),
  distillRecordFileUrl: (id, relPath) => `/api/agents/distill/records/${id}/files/${relPath}`,
  uploadKnowledgeFile: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/knowledge', { method: 'POST', credentials: 'include', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '知识库上传失败');
    return data;
  },

  // usage
  getUsage: (range = '7d') => req('GET', `/api/usage?range=${range}`),
  getQuota: (profileId) => req('GET', `/api/usage/quota?profile_id=${profileId}`),

  // router (bridge) status
  getRouterStatus: () => req('GET', '/api/router/status'),
  stopRouter: () => req('POST', '/api/router/stop'),

  // memories
  listMemories: (agentId = 0) => req('GET', `/api/memories?agent_id=${agentId}`),
  createMemory: (data) => req('POST', '/api/memories', data),
  deleteMemory: (id) => req('DELETE', `/api/memories/${id}`),
  clearMemories: (agentId = 0) => req('DELETE', `/api/memories/clear?agent_id=${agentId}`),

  // message pin
  toggleMessagePin: (id, pinned) => req('POST', `/api/messages/${id}/pin`, { pinned }),

  // 语音识别
  transcribeAudio: async (blob) => {
    const form = new FormData();
    form.append('file', blob, 'audio.webm');
    const res = await fetch('/api/transcribe', { method: 'POST', body: form, credentials: 'include' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(text).error || msg; } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    return data.text || '';
  },

  // scheduled tasks
  listScheduledTasks: () => req('GET', '/api/scheduled-tasks'),
  createScheduledTask: (data) => req('POST', '/api/scheduled-tasks', data),
  updateScheduledTask: (id, data) => req('PUT', `/api/scheduled-tasks/${id}`, data),
  deleteScheduledTask: (id) => req('DELETE', `/api/scheduled-tasks/${id}`),
  toggleScheduledTask: (id, enabled) => req('POST', `/api/scheduled-tasks/${id}/toggle`, { enabled }),
  triggerScheduledTask: (id) => req('POST', `/api/scheduled-tasks/${id}/run`),
  listScheduledTaskRuns: (id) => req('GET', `/api/scheduled-tasks/${id}/runs`),

  // ── Project Nexus: Agent-to-Agent ─────────────────────────────
  getNexusSettings: () => req('GET', '/api/nexus/settings'),
  updateNexusSettings: (data) => req('PUT', '/api/nexus/settings', data),
  listPeers: () => req('GET', '/api/peers'),
  listA2AConversations: () => req('GET', '/api/a2a-conversations'),
  getA2AConversation: (id) => req('GET', `/api/a2a-conversations/${id}`),
  createA2AConversation: (data) => req('POST', '/api/a2a-conversations', data),
  pauseA2AConversation: (id) => req('POST', `/api/a2a-conversations/${id}/pause`),
  takeoverA2AConversation: (id, content) => req('POST', `/api/a2a-conversations/${id}/takeover`, { content }),
  terminateA2AConversation: (id) => req('POST', `/api/a2a-conversations/${id}/terminate`),
  approveA2AConversation: (id, approved) => req('POST', `/api/a2a-conversations/${id}/approve`, { approved }),
  acceptRemoteConversation: (id, localAgentId) => req('POST', `/api/a2a-conversations/${id}/accept-remote`, { local_agent_id: localAgentId }),
  rejectRemoteConversation: (id) => req('POST', `/api/a2a-conversations/${id}/reject-remote`),
  deleteA2AConversation: (id) => req('DELETE', `/api/a2a-conversations/${id}`),
  getAgentNexusConfig: (id) => req('GET', `/api/agents/${id}/nexus-config`),
  updateAgentNexusConfig: (id, data) => req('PUT', `/api/agents/${id}/nexus-config`, data),

  // ── 群聊 ────────────────────────────────────────────────────────
  listGroupChats: () => req('GET', '/api/group-chats'),
  getGroupChat: (id) => req('GET', `/api/group-chats/${id}`),
  createGroupChat: (data) => req('POST', '/api/group-chats', data),
  postGroupMessage: (id, payload) => {
    // 兼容旧用法：传入字符串视为 content
    const body = typeof payload === 'string' ? { content: payload } : (payload || {});
    return req('POST', `/api/group-chats/${id}/post`, body);
  },
  listGroupMessagesPaged: (id, before, limit = 30) =>
    req('GET', `/api/group-chats/${id}/messages?before=${before || 0}&limit=${limit}`),
  recallGroupMessage: (id, msgId) => req('POST', `/api/group-chats/${id}/messages/${msgId}/recall`),
  leaveGroupChat: (id) => req('POST', `/api/group-chats/${id}/leave`),
  pauseGroupChat: (id) => req('POST', `/api/group-chats/${id}/pause`),
  resumeGroupChat: (id) => req('POST', `/api/group-chats/${id}/resume`),
  terminateGroupChat: (id) => req('POST', `/api/group-chats/${id}/terminate`),
  acceptGroupInvite: (id, localAgentIds) => req('POST', `/api/group-chats/${id}/accept`, { local_agent_ids: localAgentIds }),
  rejectGroupInvite: (id) => req('POST', `/api/group-chats/${id}/reject`),
  inviteGroupMembers: (id, data) => req('POST', `/api/group-chats/${id}/members/add`, data),
  kickGroupMember: (id, payload) => req('POST', `/api/group-chats/${id}/members/remove`, payload),
  deleteGroupChat: (id) => req('DELETE', `/api/group-chats/${id}`),
  uploadGroupImage: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/group-chats/upload', { method: 'POST', body: form, credentials: 'include' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
  },

  // ── Agent 群聊人格 ─────────────────────────────────────────
  getAgentPersonality: (id) => req('GET', `/api/agents/${id}/personality`),
  saveAgentPersonality: (id, data) => req('PUT', `/api/agents/${id}/personality`, data),

  // ── 自我进化 ─────────────────────────────────────────────────
  getEvolutionConfig: (id) => req('GET', `/api/agents/${id}/evolution`),
  setEvolutionConfig: (id, enabled) => req('PUT', `/api/agents/${id}/evolution`, { enabled }),
  listEvolutionLogs: (id, limit = 50) => req('GET', `/api/agents/${id}/evolution/logs?limit=${limit}`),
  clearEvolutionLogs: (id) => req('DELETE', `/api/agents/${id}/evolution/logs`),
  deleteEvolutionLog: (logId) => req('DELETE', `/api/evolution/logs/${logId}`),
  revertEvolutionLog: (logId) => req('POST', `/api/evolution/logs/${logId}/revert`),
  manualExtract: (id, data) => req('POST', `/api/agents/${id}/evolution/extract`, data),
  listAllEvolutionLogs: (limit = 100, offset = 0) => req('GET', `/api/evolution/logs?limit=${limit}&offset=${offset}`),
  getEvolutionStats: () => req('GET', '/api/evolution/stats'),
  getEvolutionScannerConfig: () => req('GET', '/api/evolution/scanner-config'),
  updateEvolutionScannerConfig: (cfg) => req('PUT', '/api/evolution/scanner-config', cfg),

  // ── 记忆巩固（Dream）──────────────────────────────────────────
  getDreamConfig: () => req('GET', '/api/dream/config'),
  updateDreamConfig: (cfg) => req('PUT', '/api/dream/config', cfg),
  getDreamStatus: () => req('GET', '/api/dream/status'),
  triggerDream: (agentId) => req('POST', '/api/dream/trigger', { agent_id: agentId }),
  getAgentDreamHistory: (agentId, limit = 20) => req('GET', `/api/agents/${agentId}/dream/history?limit=${limit}`),

  // ── 文件浏览（代码视图）──────────────────────────────────────
  listDirectory: (dirPath) => req('GET', `/api/files/list?path=${encodeURIComponent(dirPath || '')}`),
  readFile: (filePath) => req('GET', `/api/files/read?path=${encodeURIComponent(filePath)}`),
  writeFile: (filePath, content) => req('PUT', '/api/files/write', { path: filePath, content }),
  getProjectInfo: (dirPath) => req('GET', `/api/files/project?path=${encodeURIComponent(dirPath || '')}`),
  searchFiles: (dirPath, query, glob) => {
    let url = `/api/files/search?path=${encodeURIComponent(dirPath || '')}&query=${encodeURIComponent(query)}`;
    if (glob) url += `&glob=${encodeURIComponent(glob)}`;
    return req('GET', url);
  },
  searchFileNames: (dirPath, query) =>
    req('GET', `/api/files/search-names?path=${encodeURIComponent(dirPath || '')}&query=${encodeURIComponent(query)}`),

  // ── Coding 模式 ──────────────────────────────────────────────
  getCodingChanges: (dirPath) => req('GET', `/api/coding/changes?path=${encodeURIComponent(dirPath || '')}`),
  getCodingDiff: (dirPath, file) => req('GET', `/api/coding/diff?path=${encodeURIComponent(dirPath || '')}&file=${encodeURIComponent(file)}`),
  getCodingBranch: (dirPath) => req('GET', `/api/coding/branch?path=${encodeURIComponent(dirPath || '')}`),

  // ── 数据备份 ─────────────────────────────────────────────────
  exportBackup: () => `${BASE}/api/backup/export`,
  healthCheck: () => req('GET', '/api/health'),

  // ── 批量技能导出 ──────────────────────────────────────────────
  batchExportSkills: (ids) => req('POST', '/api/skills/batch-export', { ids }),

  // ── WAN (广域网) ──────────────────────────────────────────────
  listWANPeers: () => req('GET', '/api/wan/peers'),
  getWANStatus: () => req('GET', '/api/wan/status'),

  // ── Screen Agent ─────────────────────────────────────────────
  screenAgentAnalyze: (data) => req('POST', '/api/screen-agent/analyze', data),
  screenAgentPlan: (data) => req('POST', '/api/screen-agent/plan', data),
  screenAgentStep: (data) => req('POST', '/api/screen-agent/step', data),
  screenAgentStepResult: (data) => req('POST', '/api/screen-agent/step-result', data),
  screenAgentAbort: (sessionId) => req('POST', '/api/screen-agent/abort', { session_id: sessionId }),
  screenAgentReset: (sessionId) => req('POST', '/api/screen-agent/reset', { session_id: sessionId }),
  screenAgentExecutePlan: (data) => req('POST', '/api/screen-agent/execute-plan', data),
  screenAgentConfirm: (data) => req('POST', '/api/screen-agent/confirm', data),
  listScreenActions: (sessionId, limit = 50) => req('GET', `/api/screen-agent/actions?session_id=${sessionId}&limit=${limit}`),
  getAgentScreenConfig: (id) => req('GET', `/api/agents/${id}/screen-config`),
  setAgentScreenConfig: (id, data) => req('PUT', `/api/agents/${id}/screen-config`, data),

  // ── 权限审批 ──────────────────────────────────────────────────
  listPermissionRules: (agentId = 0) => req('GET', `/api/permission-rules?agent_id=${agentId}`),
  createPermissionRule: (data) => req('POST', '/api/permission-rules', data),
  deletePermissionRule: (id) => req('DELETE', `/api/permission-rules/${id}`),
  listPendingApprovals: () => req('GET', '/api/approvals/pending'),
  listRecentApprovals: (limit = 50) => req('GET', `/api/approvals?limit=${limit}`),
  reviewApproval: (id, action, reason = '') => req('POST', `/api/approvals/${id}/review`, { action, reason }),

  // ── H5 远程访问 ───────────────────────────────────────────────
  getH5Settings: () => req('GET', '/api/h5-access/settings'),
  updateH5Settings: (data) => req('PUT', '/api/h5-access/settings', data),
  listH5Tokens: () => req('GET', '/api/h5-access/tokens'),
  generateH5Token: (data) => req('POST', '/api/h5-access/tokens', data),
  revokeH5Token: (id) => req('POST', `/api/h5-access/tokens/${id}/revoke`),
  deleteH5Token: (id) => req('DELETE', `/api/h5-access/tokens/${id}`),

  // ── H5 云端隧道 ───────────────────────────────────────────────
  enableH5Tunnel: (data) => req('POST', '/api/h5-tunnel/enable', data),
  getH5TunnelStatus: () => req('GET', '/api/h5-tunnel/status'),
};

// ─── WebSocket ────────────────────────────────────────────────────
export class WSClient {
  constructor() {
    this.ws = null;
    this.handlers = new Set();
    this.subscribed = new Set();
    this._closed = false;
    this._reconnectTimer = null;
  }
  on(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  connect(initialSessionId) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}${TUNNEL_BASE}/api/ws${initialSessionId ? `?sessionId=${initialSessionId}` : ''}`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      // 重新订阅
      for (const sid of this.subscribed) this._send({ type: 'subscribe', sessionId: sid });
    };
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        for (const h of this.handlers) h(msg);
      } catch {}
    };
    this.ws.onclose = () => {
      if (this._closed) return;
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = setTimeout(() => this.connect(), 1500);
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch {} };
  }
  subscribe(sessionId) {
    this.subscribed.add(sessionId);
    this._send({ type: 'subscribe', sessionId });
  }
  unsubscribe(sessionId) {
    this.subscribed.delete(sessionId);
    this._send({ type: 'unsubscribe', sessionId });
  }
  _send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }
  close() { this._closed = true; try { this.ws?.close(); } catch {} }
}

export const wsClient = new WSClient();

// ─── Electron 桥接（可选）─────────────────────────────────────────
export const electron = {
  available: typeof window !== 'undefined' && !!window.electronAPI,
  encryptSecret: async (plain) => {
    if (window.electronAPI?.encryptSecret) return window.electronAPI.encryptSecret(plain);
    return 'b64:' + btoa(unescape(encodeURIComponent(plain)));
  },
  decryptSecret: async (cipher) => {
    if (window.electronAPI?.decryptSecret) return window.electronAPI.decryptSecret(cipher);
    if (cipher && cipher.startsWith('b64:')) {
      try { return decodeURIComponent(escape(atob(cipher.slice(4)))); } catch { return ''; }
    }
    return '';
  },
  pushActiveSecret: async (profileId) => {
    if (window.electronAPI?.pushActiveSecret) return window.electronAPI.pushActiveSecret(profileId);
    return { ok: false };
  },
  openExternal: (url) => {
    if (window.electronAPI?.openExternal) return window.electronAPI.openExternal(url);
    window.open(url, '_blank');
  },
  startOAuth: async (provider) => {
    if (window.electronAPI?.startOAuth) return window.electronAPI.startOAuth(provider);
    throw new Error('OAuth 登录仅在桌面应用中可用');
  },
};
