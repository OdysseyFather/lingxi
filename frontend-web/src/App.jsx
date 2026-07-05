import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SkillsPage from './SkillsPage';
import KnowledgePage from './KnowledgePage';
import IMConnectorPage from './IMConnectorPage';
import { authFetch } from './api/client';
import './App.css';

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI;

// ─── 主题配置 ────────────────────────────────────────────────────
const THEMES = [
  { id: 'dark',   label: '深色' },
  { id: 'light',  label: '浅色' },
  { id: 'cyber',  label: '赛博' },
  { id: 'aurora', label: '极光' },
  { id: 'cosmos', label: '星空' },
];

function useTheme() {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('lingxi-theme') || 'dark';
  });

  const setTheme = useCallback((t) => {
    setThemeState(t);
    localStorage.setItem('lingxi-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return [theme, setTheme];
}

// ─── 粒子背景 ────────────────────────────────────────────────────
function ParticleCanvas({ theme }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const particlesRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // 粒子颜色根据主题
    const colorMap = {
      dark:   'rgba(124,106,247,',
      light:  'rgba(108,92,231,',
      cyber:  'rgba(0,229,255,',
      aurora: 'rgba(74,222,128,',
      cosmos: 'rgba(192,132,252,',
    };
    const baseColor = colorMap[theme] || colorMap.dark;

    // 初始化粒子
    const count = 40;
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;

      // 连线
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `${baseColor}${((1 - dist / 120) * 0.15).toFixed(3)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // 粒子
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${baseColor}${p.alpha.toFixed(3)})`;
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="bg-canvas" />;
}

async function redirectToSSO() {
  const res = await authFetch('/api/auth/login-url').catch(() => null);
  if (res && res.ok) {
    const { url } = await res.json();
    window.location.href = url;
  }
}

// ─── 工具名称映射 ────────────────────────────────────────────────
const TOOL_LABELS = {
  bash: '执行技能', Bash: '执行技能',
  str_replace_editor: '整理内容', str_replace_based_edit_tool: '整理内容',
  MultiEdit: '批量整理', Write: '保存内容', read_file: '读取内容', write_file: '保存内容',
  Edit: '整理内容', Glob: '查找文件', LS: '浏览目录', Read: '读取内容', Grep: '搜索内容',
  web_search: '搜索网络', web_fetch: '获取网页', WebSearch: '搜索网络', WebFetch: '获取网页',
  TodoWrite: '更新计划', TodoRead: '查看计划', computer: '操作电脑',
  NotebookRead: '读取笔记', NotebookEdit: '编辑笔记',
  dispatch_agent: '并行处理', Task: '执行子任务', Agent: '执行子任务',
  navigate: '打开网页', screenshot: '截取屏幕', click: '点击操作', fill: '填写内容',
  evaluate: '执行技能', select_option: '选择选项', hover: '悬停操作',
  wait_for_selector: '等待加载', get_visible_text: '读取页面', get_visible_html: '读取页面',
  scroll: '滚动页面', default: '执行技能',
};

const TOOL_ICONS = {
  bash: '⚡', Bash: '⚡',
  str_replace_editor: '✏️', str_replace_based_edit_tool: '✏️',
  MultiEdit: '✏️', Write: '💾', read_file: '📄', write_file: '💾',
  Edit: '✏️', Read: '📄', Glob: '🔍', LS: '📁', Grep: '🔎',
  web_search: '🌐', web_fetch: '🌐', WebSearch: '🌐', WebFetch: '🌐',
  TodoWrite: '📋', TodoRead: '📋', computer: '🖥️',
  NotebookRead: '📓', NotebookEdit: '📓',
  dispatch_agent: '🔀', Task: '🔀', Agent: '🔀',
  navigate: '🌐', screenshot: '📸', click: '👆', fill: '✍️',
  evaluate: '⚡', select_option: '☑️', hover: '👆',
  wait_for_selector: '⏳', get_visible_text: '📄', get_visible_html: '📄',
  scroll: '↕️', default: '⚡',
};

const toolLabel = (name) => {
  if (!name) return TOOL_LABELS.default;
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    const toolPart = parts[parts.length - 1];
    if (TOOL_LABELS[toolPart]) return TOOL_LABELS[toolPart];
    if (parts[1] === 'playwright') return '浏览器操作';
    return '执行技能';
  }
  return TOOL_LABELS.default;
};

const toolIcon = (name) => {
  if (!name) return TOOL_ICONS.default;
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    const toolPart = parts[parts.length - 1];
    if (TOOL_ICONS[toolPart]) return TOOL_ICONS[toolPart];
    if (parts[1] === 'playwright') return '🌐';
  }
  return TOOL_ICONS.default;
};

// ─── Agent 状态指示器 ────────────────────────────────────────────
const AGENT_STATE_CONFIG = {
  THINKING: {
    icon: '◎',
    label: '思考中...',
    color: '#a78bfa',
    spin: true,
    desc: 'Agent 正在分析您的请求',
  },
  CHECKING: {
    icon: '🔍',
    label: '准备中...',
    color: '#60a5fa',
    spin: false,
    desc: '正在准备...',
  },
  CHECKING_FAILED: {
    icon: '⚠️',
    label: '配置验证失败',
    color: '#f87171',
    spin: false,
    desc: '缺少必要的配置信息',
  },
  WAITING_FOR_INPUT: {
    icon: '💬',
    label: '等待您的输入',
    color: '#fbbf24',
    spin: false,
    desc: '需要您提供额外信息才能继续',
  },
  EXECUTING: {
    icon: '⚡',
    label: '执行中',
    color: '#34d399',
    spin: true,
    desc: '任务正在执行',
  },
  EXECUTING_L2: {
    icon: '🔀',
    label: '后台执行中',
    color: '#34d399',
    spin: true,
    desc: '任务在后台异步执行',
  },
  EXECUTING_L3: {
    icon: '🤝',
    label: '团队协作中',
    color: '#818cf8',
    spin: true,
    desc: '多个助手并行处理',
  },
};

function AgentStateBar({ state, extra = {} }) {
  if (!state) return null;
  const cfg = AGENT_STATE_CONFIG[state] || AGENT_STATE_CONFIG.THINKING;
  const steps = extra.steps || [];
  const level = extra.level;
  const missing = extra.missing || [];

  const effectiveState = state === 'EXECUTING' && level === 2 ? 'EXECUTING_L2'
    : state === 'EXECUTING' && level === 3 ? 'EXECUTING_L3'
    : state;
  const effectiveCfg = AGENT_STATE_CONFIG[effectiveState] || cfg;

  return (
    <div className="agent-state-bar" style={{ borderColor: effectiveCfg.color }}>
      <div className="agent-state-header">
        <span className={`agent-state-icon${effectiveCfg.spin ? ' spin' : ''}`}>
          {effectiveCfg.icon}
        </span>
        <span className="agent-state-label" style={{ color: effectiveCfg.color }}>
          {effectiveCfg.label}
        </span>
        {level && <span className="agent-state-level">Level {level}</span>}
      </div>
      {steps.length > 0 && (
        <div className="agent-state-steps">
          {steps.map((step, i) => (
            <div key={i} className="agent-state-step">
              <span className="agent-state-step-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <div className="agent-state-missing">
          <span className="agent-state-missing-label">缺少信息：</span>
          {missing.map((f, i) => (
            <span key={i} className="agent-state-missing-tag">{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 挂起任务恢复提示 ────────────────────────────────────────────
function PendingTaskBanner({ pending, onResume, onDismiss }) {
  if (!pending) return null;
  let missingArr = [];
  try { missingArr = JSON.parse(pending.missing_fields); } catch {}
  return (
    <div className="pending-task-banner">
      <div className="pending-task-icon">⏸️</div>
      <div className="pending-task-body">
        <div className="pending-task-title">上次任务未完成</div>
        <div className="pending-task-desc">
          「{pending.task_desc}」需要您提供：
          {missingArr.map((f, i) => <span key={i} className="pending-task-field">{f}</span>)}
        </div>
      </div>
      <div className="pending-task-actions">
        <button className="pending-task-resume" onClick={onResume}>继续</button>
        <button className="pending-task-dismiss" onClick={onDismiss}>忽略</button>
      </div>
    </div>
  );
}

// ─── 思考块（默认折叠，展开后只显示占位文字）──────────────────
function ThinkingBlock({ text, live = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`thinking-block${live ? ' live' : ''}`}>
      <button className="thinking-toggle" onClick={() => setOpen(o => !o)}>
        <div className="thinking-toggle-left">
          <span className={`thinking-icon${live ? ' spin' : ''}`}>◎</span>
          <span>{live ? '思考中...' : '思考过程'}</span>
        </div>
        <span className="thinking-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="thinking-content">灵犀正在思考...</div>
      )}
    </div>
  );
}

// ─── 技能执行块（纯展示，无交互展开）────────────────────────────
function ToolBlock({ name, done }) {
  const label = toolLabel(name);
  const icon = toolIcon(name);
  return (
    <div className={`tool-block${done ? ' done' : ' running'}`}>
      <span className={`tool-status-dot${done ? ' done' : ' pulse'}`} />
      <span className="tool-icon-emoji">{icon}</span>
      <span className="tool-name">{label}</span>
      {done
        ? <span className="tool-done-badge">完成</span>
        : <span className="tool-running-text">进行中...</span>
      }
    </div>
  );
}

// ─── 助手消息 ─────────────────────────────────────────────────────
function AssistantMessage({ blocks }) {
  return (
    <div className="assistant-blocks">
      {blocks.map((block, i) => {
        if (block.type === 'thinking') return null;
        if (block.type === 'tool') return <ToolBlock key={i} name={block.name} done={block.done} />;
        if (block.type === 'text' && block.text) return (
          <div key={i} className="text-block"><ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown></div>
        );
        return null;
      })}
    </div>
  );
}

function useAutoScroll(dep) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dep]);
  return ref;
}

function NotificationToast({ notifications, onDismiss }) {
  if (!notifications.length) return null;
  return (
    <div className="notification-stack">
      {notifications.map(n => (
        <div key={n.id} className="notification-toast" onClick={() => onDismiss(n.id)}>
          <span className="notification-icon">✦</span>
          <div className="notification-body">
            {n.title && <div className="notification-title">{n.title}</div>}
            <div className="notification-text">{n.body}</div>
          </div>
          <button className="notification-close">✕</button>
        </div>
      ))}
    </div>
  );
}

// ─── 主题切换面板组件 ────────────────────────────────────────────
function ThemePanel({ theme, setTheme }) {
  return (
    <div className="theme-panel">
      <div className="theme-panel-label">主题</div>
      <div className="theme-swatches">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-swatch${theme === t.id ? ' active' : ''}`}
            data-theme={t.id}
            onClick={() => setTheme(t.id)}
            title={t.label}
          >
            <span className="theme-swatch-tooltip">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 主应用 ──────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useTheme();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [waitingLogin, setWaitingLogin] = useState(false);
  const [page, setPage] = useState('chat');

  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);

  const [input, setInput] = useState('');
  const [images, setImages] = useState([]); // [{mediaType, data, previewUrl}]
  const [useKB, setUseKB] = useState(false);
  const [runningSessionIds, setRunningSessionIds] = useState(new Set());
  const [liveBlocksMap, setLiveBlocksMap] = useState(new Map());
  const [notifications, setNotifications] = useState([]);

  // Agent 状态机：每个 session 独立维护当前状态
  const [agentStateMap, setAgentStateMap] = useState(new Map());

  // 挂起任务（从后端拉取）
  const [pendingTask, setPendingTask] = useState(null);
  const [suggestedReplies, setSuggestedReplies] = useState([]);

  const liveBlocksRef = useRef(new Map());
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeIdRef = useRef(null);
  const composingRef = useRef(false);
  const wsRef = useRef(null);
  const handleWSEventRef = useRef(null);

  const liveBlocks = (liveBlocksMap.get(activeId) || []);
  const loading = activeId != null && runningSessionIds.has(activeId);
  const scrollRef = useAutoScroll(liveBlocks);

  const connectWS = useCallback((sessionId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (sessionId) {
        wsRef.current.send(JSON.stringify({ type: 'subscribe', sessionId }));
      }
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      const originalOnOpen = wsRef.current.onopen;
      wsRef.current.onopen = (e) => {
        if (originalOnOpen) originalOnOpen(e);
        if (sessionId) wsRef.current.send(JSON.stringify({ type: 'subscribe', sessionId }));
      };
      return;
    }

    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (sessionId) params.set('sessionId', sessionId);
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProto}://${window.location.host}/ws?${params.toString()}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ws] connected');
      if (sessionId) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
      }
    };

    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      const { event, data, sessionId: msgSessionId } = msg;

      if (event === 'notification') {
        let payload = data;
        try { payload = JSON.parse(data); } catch {}
        const id = Date.now() + Math.random();
        setNotifications(prev => [...prev, { id, title: payload.title || '', body: payload.body || String(data) }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
        return;
      }

      const sid = msgSessionId || activeIdRef.current;
      if (!sid) return;

      if (handleWSEventRef.current) handleWSEventRef.current(event, data, sid);
    };

    ws.onclose = () => {
      console.log('[ws] disconnected, reconnecting in 2s...');
      setTimeout(() => {
        if (activeIdRef.current) connectWS(activeIdRef.current);
      }, 2000);
    };

    ws.onerror = (err) => {
      console.error('[ws] error', err);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWSEvent = useCallback((event, data, sessionId) => {
    let chunk = data;
    try { chunk = JSON.parse(data); } catch {}

    const getBlocks = () => liveBlocksRef.current.get(sessionId) || [];
    const setBlocks = (blocks) => {
      liveBlocksRef.current.set(sessionId, blocks);
      setLiveBlocksMap(new Map(liveBlocksRef.current));
    };

    const blocks = getBlocks();
    const last = blocks[blocks.length - 1];

    if (event === 'agent_state') {
      let stateData = chunk;
      if (typeof stateData === 'string') try { stateData = JSON.parse(stateData); } catch {}
      setAgentStateMap(prev => {
        const next = new Map(prev);
        next.set(sessionId, stateData);
        return next;
      });
      return;
    }

    if (event === 'thinking') {
      if (last?.type === 'thinking') {
        setBlocks([...blocks.slice(0, -1), { ...last, text: last.text + chunk }]);
      } else {
        setBlocks([...blocks, { type: 'thinking', text: chunk }]);
      }
    } else if (event === 'tool_start') {
      setBlocks([...blocks, { type: 'tool', name: chunk.name || '', text: '', done: false }]);
    } else if (event === 'tool_input') {
      if (last?.type === 'tool') {
        setBlocks([...blocks.slice(0, -1), { ...last, text: last.text + chunk }]);
      }
    } else if (event === 'tool_end') {
      if (last?.type === 'tool') {
        setBlocks([...blocks.slice(0, -1), { ...last, done: true }]);
      }
    } else if (event === 'text') {
      if (last?.type === 'text') {
        setBlocks([...blocks.slice(0, -1), { ...last, text: last.text + chunk }]);
      } else {
        setBlocks([...blocks, { type: 'text', text: chunk }]);
      }

    } else if (event === 'suggested_replies') {
      try {
        const replies = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
        if (Array.isArray(replies)) {
          const limited = replies.slice(0, 3);
          setSuggestedReplies(limited);
          try { localStorage.setItem(`lingxi_sr_${sessionId}`, JSON.stringify(limited)); } catch {}
        }
      } catch { /* ignore */ }
    } else if (event === 'done') {
      // 清除 agent 状态
      setAgentStateMap(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      setRunningSessionIds(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });

      const finalBlocks = getBlocks();
      if (finalBlocks.length > 0 && sessionId === activeIdRef.current) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: JSON.stringify(finalBlocks),
          id: Date.now() + 1,
        }]);
      }

      liveBlocksRef.current.delete(sessionId);
      setLiveBlocksMap(new Map(liveBlocksRef.current));

      if (sessionId === activeIdRef.current) {
        authFetch(`/api/sessions/${sessionId}/messages`)
          .then(r => r.json())
          .then(data => { if (data) setMessages(data); });
      }

      authFetch('/api/sessions', { credentials: 'include' })
        .then(r => r.json())
        .then(d => setSessions(d || []));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  handleWSEventRef.current = handleWSEvent;

  useEffect(() => {
    if (IS_ELECTRON) {
      setUser({ name: '本地用户', avatar: '', email: '' });
      setAuthLoading(false);
      return;
    }
    authFetch('/api/user/me', { credentials: 'include' })
      .then(r => {
        if (r.status === 401) { redirectToSSO(); return null; }
        if (!r.ok) throw new Error('user/me failed');
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setUser(data);
        setAuthLoading(false);
      })
      .catch(() => redirectToSSO());
  }, []);

  useEffect(() => {
    if (!waitingLogin) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await authFetch('/api/auth/status');
          const data = await res.json();
          if (data.logged_in && data.user) {
            if (!cancelled) { setUser(data.user); setWaitingLogin(false); }
            return;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [waitingLogin]);

  useEffect(() => {
    if (!user) return;
    authFetch('/api/sessions', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setSessions(data || []);
        if (data && data.length > 0) {
          setActiveId(data[0].id);
        }
      });
  }, [user]);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    try {
      const cached = localStorage.getItem(`lingxi_sr_${activeId}`);
      setSuggestedReplies(cached ? JSON.parse(cached) : []);
    } catch { setSuggestedReplies([]); }
    connectWS(activeId);
    authFetch(`/api/sessions/${activeId}/messages`)
      .then(r => r.json())
      .then(data => setMessages(data || []));
    authFetch(`/api/sessions/${activeId}/pending`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setPendingTask(data || null))
      .catch(() => setPendingTask(null));
  }, [activeId, connectWS]);

  const displayMessages = [
    ...messages.map(m => {
      if (m.role !== 'assistant') return { role: m.role, content: m.content, images: m.images };
      let blocks;
      try {
        const parsed = JSON.parse(m.content);
        if (Array.isArray(parsed)) blocks = parsed;
      } catch {}
      if (!blocks) blocks = [{ type: 'text', text: m.content }];
      return { role: 'assistant', blocks, proactive: !!m.proactive };
    }),
    ...(loading ? [{ role: 'assistant', blocks: liveBlocks, live: true }] : []),
  ];

  const handleAbort = async () => {
    if (activeIdRef.current) {
      authFetch('/api/chat/abort', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: String(activeIdRef.current) }),
      }).catch(() => {});
      setRunningSessionIds(prev => {
        const next = new Set(prev);
        next.delete(activeIdRef.current);
        return next;
      });
      setAgentStateMap(prev => {
        const next = new Map(prev);
        next.delete(activeIdRef.current);
        return next;
      });
    }
  };

  // 忽略挂起任务
  const handleDismissPending = async () => {
    if (!activeId) return;
    await authFetch(`/api/sessions/${activeId}/pending`, {
      method: 'DELETE',
    }).catch(() => {});
    setPendingTask(null);
  };

  // 继续挂起任务（提示用户填写缺失信息）
  const handleResumePending = () => {
    if (!pendingTask) return;
    let missingArr = [];
    try { missingArr = JSON.parse(pendingTask.missing_fields); } catch {}
    const hint = missingArr.length > 0
      ? `请提供${missingArr.join('、')}，以继续上次的任务。`
      : '请继续上次未完成的任务。';
    setInput(hint);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  };

  // ── 图片处理工具 ──────────────────────────────────────────────
  const addImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { alert('图片不能超过 5MB'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const [header, data] = dataUrl.split(',');
      const mediaType = header.replace('data:', '').replace(';base64', '');
      setImages(prev => [...prev, { mediaType, data, previewUrl: dataUrl }]);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        addImageFile(item.getAsFile());
        break;
      }
    }
  };

  const handleFileSelect = (e) => {
    Array.from(e.target.files || []).forEach(addImageFile);
    e.target.value = '';
  };

  const removeImage = (idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if ((!input.trim() && images.length === 0) || !activeId) return;

    const content = input;
    const sendImages = images.map(({ mediaType, data }) => ({ mediaType, data }));
    setInput('');
    setImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setPendingTask(null);
    setSuggestedReplies([]);
    try { localStorage.removeItem(`lingxi_sr_${activeId}`); } catch {}

    setMessages(prev => [...prev, {
      role: 'user',
      content,
      images: images.map(img => img.previewUrl),
      id: Date.now(),
    }]);
    setRunningSessionIds(prev => new Set([...prev, activeId]));
    setAgentStateMap(prev => {
      const next = new Map(prev);
      next.set(activeId, { state: 'THINKING' });
      return next;
    });
    liveBlocksRef.current.set(activeId, []);
    setLiveBlocksMap(new Map(liveBlocksRef.current));
    connectWS(activeId);

    try {
      const resp = await authFetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, sessionId: String(activeId), useKB, images: sendImages }),
      });

      if (resp.status === 401) { if (!IS_ELECTRON) redirectToSSO(); return; }
      if (!resp.ok) throw new Error('chat request failed');
    } catch (err) {
      console.error('chat error:', err);
      setRunningSessionIds(prev => {
        const next = new Set(prev);
        next.delete(activeId);
        return next;
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: JSON.stringify([{ type: 'text', text: `> 请求出错：${err.message}` }]),
        id: Date.now() + 1,
      }]);
    }
  };

  const handleCreate = async () => {
    const r = await authFetch('/api/sessions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新对话' }),
    });
    const data = await r.json();
    setSessions(prev => [{ id: data.id, title: data.title, message_count: 0 }, ...prev]);
    setActiveId(data.id);
    setMessages([]);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await authFetch(`/api/sessions/${id}`, { method: 'DELETE' });
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (id === activeId) {
        if (next.length > 0) setActiveId(next[0].id);
        else { setActiveId(null); setMessages([]); }
      }
      return next;
    });
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  const currentAgentState = agentStateMap.get(activeId) || null;

  if (authLoading) {
    return (
      <div className="auth-loading">
        <span className="auth-loading-icon">✦</span>
        <p>正在验证身份...</p>
      </div>
    );
  }

  if (page === 'skills') {
    return <SkillsPage onBack={() => setPage('chat')} />;
  }

  if (page === 'knowledge') {
    return <KnowledgePage onBack={() => setPage('chat')} />;
  }

  if (page === 'im-connectors') {
    return <IMConnectorPage onBack={() => setPage('chat')} />;
  }

  return (
    <div className="app">
      <ParticleCanvas theme={theme} />

      <NotificationToast
        notifications={notifications}
        onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
      />

      {/* ── 侧边栏 ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">✦</span>
            <span>灵犀</span>
          </div>
        </div>

        <ThemePanel theme={theme} setTheme={setTheme} />

        <button className="new-chat-btn" onClick={handleCreate}>
          <span className="new-chat-icon">＋</span>新对话
        </button>

        <div className="chat-list">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`chat-item${s.id === activeId ? ' active' : ''}${runningSessionIds.has(s.id) && s.id !== activeId ? ' bg-running' : ''}`}
              onClick={() => {
                if (s.id === activeId) return;
                setMessages([]);
                setActiveId(s.id);
              }}
            >
              <span className="chat-item-title">{s.title}</span>
              {runningSessionIds.has(s.id) && (
                <span className="chat-item-running" title="处理中" />
              )}
              <button className="chat-item-del" onClick={(e) => handleDelete(e, s.id)} title="删除">✕</button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="chat-list-empty">暂无对话，点击上方新建</div>
          )}
        </div>

        {/* ── 技能管理入口 ── */}
        <button className="skills-nav-btn" onClick={() => setPage('skills')}>
          <span className="skills-nav-icon">⚡</span>
          <span>技能管理</span>
        </button>

        {/* ── 知识库入口 ── */}
        <button className="skills-nav-btn" onClick={() => setPage('knowledge')}>
          <span className="skills-nav-icon">📚</span>
          <span>知识库</span>
        </button>

        {/* ── IM 连接器入口 ── */}
        <button className="skills-nav-btn" onClick={() => setPage('im-connectors')}>
          <span className="skills-nav-icon">🔗</span>
          <span>IM 连接器</span>
        </button>

        {user && (
          <div className="user-info">
            {user.avatar
              ? <img className="user-avatar" src={user.avatar} alt={user.name} referrerPolicy="no-referrer" />
              : <div className="user-avatar" style={{ display:'flex', alignItems:'center', justifyContent:'center', background:'#2a2a3a', fontSize:'16px' }}>✦</div>
            }
            <div className="user-detail">
              <div className="user-name">{user.name}</div>
              {user.email && <div className="user-email">{user.email}</div>}
            </div>
          </div>
        )}
      </aside>

      {/* ── 主区域 ── */}
      <main className="main">
        <div className="main-drag-bar" />
        <div className="chat-container" ref={scrollRef}>
          {displayMessages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon-wrap">
                <div className="welcome-icon-ring" />
                <div className="welcome-icon-ring" />
                <div className="welcome-icon-ring" />
                <div className="welcome-icon">✦</div>
              </div>
              <h1>你好，我是灵犀</h1>
              <p>你的专属 AI 桌面助理</p>
              <div className="welcome-caps">
                <span className="welcome-cap">🔍 搜索信息</span>
                <span className="welcome-cap">🌐 网页操作</span>
                <span className="welcome-cap">⚡ 执行技能</span>
                <span className="welcome-cap">🔀 并行任务</span>
              </div>
              {pendingTask && (
                <PendingTaskBanner
                  pending={pendingTask}
                  onResume={handleResumePending}
                  onDismiss={handleDismissPending}
                />
              )}
            </div>
          ) : (
            <div className="messages">
              {/* 挂起任务恢复横幅（消息列表顶部） */}
              {pendingTask && !loading && (
                <PendingTaskBanner
                  pending={pendingTask}
                  onResume={handleResumePending}
                  onDismiss={handleDismissPending}
                />
              )}
              {displayMessages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  {msg.role === 'user' ? (
                    <div className="user-bubble">
                      {msg.images && msg.images.length > 0 && (
                        <div className="user-bubble-images">
                          {msg.images.map((src, j) => (
                            <img key={j} src={src} alt="附图" className="user-bubble-img" />
                          ))}
                        </div>
                      )}
                      {msg.content && <div className="user-bubble-text">{msg.content}</div>}
                    </div>
                  ) : (
                    <div className={`assistant-wrapper${msg.live ? ' streaming' : ''}${msg.proactive ? ' proactive' : ''}`}>
                      <div className="assistant-avatar">✦</div>
                      <div className="assistant-blocks-wrap">
                        {msg.proactive && (
                          <div className="proactive-label">
                            <span className="proactive-dot" />
                            灵犀汇报
                          </div>
                        )}
                        <AssistantMessage blocks={msg.blocks ?? []} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {/* Agent 状态指示器（流式响应时显示在消息列表底部） */}
              {loading && currentAgentState && (
                <div className="message assistant">
                  <div className="assistant-wrapper streaming">
                    <div className="assistant-avatar">✦</div>
                    <div className="assistant-blocks-wrap">
                      <AgentStateBar
                        state={currentAgentState.state}
                        extra={currentAgentState}
                      />
                      {liveBlocks.length === 0 && (
                        <div className="loading-dots"><span /><span /><span /></div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {loading && !currentAgentState && liveBlocks.length === 0 && (
                <div className="message assistant">
                  <div className="assistant-wrapper streaming">
                    <div className="assistant-avatar">✦</div>
                    <div className="loading-dots"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              {/* 推荐后续问题 */}
              {suggestedReplies.length > 0 && !loading && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 12px', justifyContent: 'center' }}>
                  {suggestedReplies.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(q); setSuggestedReplies([]); }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '16px',
                        border: '1px solid var(--line, #e0e0e0)',
                        background: 'var(--bg-soft, #f8f8f8)',
                        color: 'var(--text, #333)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        maxWidth: '280px',
                        textAlign: 'left',
                        lineHeight: '1.4',
                      }}
                      onMouseEnter={(e) => { e.target.style.background = 'var(--accent-soft, #e8e0ff)'; e.target.style.borderColor = 'var(--accent, #7c3aed)'; }}
                      onMouseLeave={(e) => { e.target.style.background = 'var(--bg-soft, #f8f8f8)'; e.target.style.borderColor = 'var(--line, #e0e0e0)'; }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 输入区 ── */}
        <div className="input-area">
          {/* 图片预览条 */}
          {images.length > 0 && (
            <div className="image-preview-bar">
              {images.map((img, i) => (
                <div key={i} className="image-preview-item">
                  <img src={img.previewUrl} alt="预览" className="image-preview-thumb" />
                  <button className="image-preview-remove" onClick={() => removeImage(i)} title="移除">✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="input-wrapper">
            {/* 隐藏的文件选择 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onPaste={handlePaste}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={activeId ? '向灵犀提问… (Enter 发送，Shift+Enter 换行，可粘贴图片)' : '请先新建一个对话'}
              disabled={!activeId}
              rows={1}
            />
            {/* 图片上传按钮 */}
            <button
              className="img-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title="添加图片"
              disabled={loading || !activeId}
            >
              🖼️
            </button>
            <button
              className={`kb-toggle-btn${useKB ? ' active' : ''}`}
              onClick={() => setUseKB(v => !v)}
              title={useKB ? '知识库已启用（点击关闭）' : '点击启用知识库检索'}
              disabled={loading}
            >
              📚
            </button>
            {loading ? (
              <button className="stop-btn" onClick={handleAbort} title="终止任务">
                <span className="stop-icon" />
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={(!input.trim() && images.length === 0) || !activeId}
              >
                ↑
              </button>
            )}
          </div>
          <div className="input-hint">
            {loading ? (
              <span className="input-hint-running">
                {currentAgentState?.state === 'CHECKING' && (
                  <><span className="hint-dot checking" />验证配置中，请稍候...</>
                )}
                {currentAgentState?.state === 'CHECKING_FAILED' && (
                  <><span className="hint-dot error" />配置验证失败，请查看上方提示</>
                )}
                {currentAgentState?.state === 'WAITING_FOR_INPUT' && (
                  <><span className="hint-dot waiting" />等待您的输入...</>
                )}
                {(currentAgentState?.state === 'EXECUTING' || currentAgentState?.state === 'EXECUTING_BG') && (
                  <><span className="hint-dot pulse" />任务执行中，可继续提问...</>
                )}
                {(!currentAgentState || currentAgentState?.state === 'THINKING') && (
                  <><span className="hint-dot pulse" />灵犀正在思考中，稍等...</>
                )}
              </span>
            ) : (
              <span className="input-hint-idle">
                {useKB
                  ? <><span className="kb-hint-dot" />已启用知识库 · Enter 发送</>
                  : <>✦ 灵犀随时待命</>
                }
              </span>
            )}
          </div>
        </div>
      </main>

    </div>
  );
}
