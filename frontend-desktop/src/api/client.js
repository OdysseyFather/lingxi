// 与后端 REST + WebSocket 通信的轻量封装

const baseHeaders = { 'Content-Type': 'application/json' };

async function req(method, path, body) {
  const opts = { method, headers: baseHeaders, credentials: 'include' };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  // sessions
  listSessions: (agentId) =>
    req('GET', `/api/sessions${agentId != null ? `?agent_id=${agentId}` : ''}`),
  createSession: (titleOrPayload) =>
    req('POST', '/api/sessions',
      typeof titleOrPayload === 'string'
        ? { title: titleOrPayload }
        : (titleOrPayload || {})
    ),
  renameSession: (id, title) => req('PATCH', `/api/sessions/${id}`, { title }),
  deleteSession: (id) => req('DELETE', `/api/sessions/${id}`),
  listMessages: (id) => req('GET', `/api/sessions/${id}/messages`),
  setSessionAgent: (id, agent_id) => req('POST', `/api/sessions/${id}/agent`, { agent_id }),

  // chat
  sendChat: (payload) => req('POST', '/api/chat', payload),
  abortChat: (sessionId) => req('POST', '/api/chat/abort', { sessionId: String(sessionId) }),

  // providers + profiles
  listProviders: () => req('GET', '/api/providers'),
  listProfiles: (includeCipher) => req('GET', `/api/api-profiles${includeCipher ? '?include_cipher=1' : ''}`),
  saveProfile: (p) => req('POST', '/api/api-profiles', p),
  deleteProfile: (id) => req('DELETE', `/api/api-profiles/${id}`),
  activateProfile: (id) => req('POST', `/api/api-profiles/${id}/activate`),
  testProfile: (id, body) => req('POST', `/api/api-profiles/${id}/test`, body || {}),

  // skills / knowledge
  listSkills: () => req('GET', '/api/skills'),
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

  // usage
  getUsage: (range = '7d') => req('GET', `/api/usage?range=${range}`),
  getQuota: (profileId) => req('GET', `/api/usage/quota?profile_id=${profileId}`),

  // router (bridge) status
  getRouterStatus: () => req('GET', '/api/router/status'),
  stopRouter: () => req('POST', '/api/router/stop'),
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
    const url = `${proto}//${location.host}/api/ws${initialSessionId ? `?sessionId=${initialSessionId}` : ''}`;
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
    // Web 模式下退化为 base64（不安全，仅本地开发）
    return 'b64:' + btoa(unescape(encodeURIComponent(plain)));
  },
  pushActiveSecret: async (profileId) => {
    if (window.electronAPI?.pushActiveSecret) return window.electronAPI.pushActiveSecret(profileId);
    return { ok: false };
  },
  openExternal: (url) => {
    if (window.electronAPI?.openExternal) return window.electronAPI.openExternal(url);
    window.open(url, '_blank');
  },
};
