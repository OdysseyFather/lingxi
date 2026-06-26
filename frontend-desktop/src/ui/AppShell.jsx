import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, initStore } from '../state/useStore';
import { SidebarSessions } from './SidebarSessions';
import { ModelSwitcher } from './ModelSwitcher';
import { RouterPill } from './RouterPill';
import { ChatView } from '../chat/ChatView';
import { AgentStatePill } from '../chat/AgentStatePill';
import { ToastStack, Modal, Button } from './primitives';

function lazyRetry(importFn, retries = 3) {
  return lazy(() => {
    const attempt = (remaining) =>
      importFn().catch((err) => {
        if (remaining <= 0) throw err;
        return new Promise((resolve) => setTimeout(resolve, 500)).then(() => attempt(remaining - 1));
      });
    return attempt(retries);
  });
}

const SettingsPage = lazyRetry(() => import('../settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SkillsPage = lazyRetry(() => import('../SkillsPage'));
const KnowledgePage = lazyRetry(() => import('../KnowledgePage'));
const IMConnectorPage = lazyRetry(() => import('../IMConnectorPage'));
const MCPPage = lazyRetry(() => import('../MCPPage'));
const AgentFactoryPage = lazyRetry(() => import('../AgentFactoryPage'));
const ScheduledTasksPage = lazyRetry(() => import('../ScheduledTasksPage'));
const WorkflowPage = lazyRetry(() => import('../WorkflowPage'));
const NexusPage = lazyRetry(() => import('../nexus/NexusPage'));
const EvolutionPage = lazyRetry(() => import('../EvolutionPage'));
const DeepSearchPage = lazyRetry(() => import('../DeepSearchPage'));
const CommunityPage = lazyRetry(() => import('../CommunityPage'));

const LoginPage = lazyRetry(() => import('../LoginPage'));
import EvolutionProgressPanel from './EvolutionProgressPanel';
import { cn, isH5Mobile } from './cn';
import { MessageSquare, Settings as SettingsIcon, Brain, BookOpen, MessageCircle, Plug, Sparkles, PanelLeftClose, PanelLeftOpen, Clock, Workflow, Globe, LogOut, User, UserPlus, Check, X, Dna, Menu, Plus, Search, Users } from 'lucide-react';
import { api, wsClient } from '../api/client';

const SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: '搜索消息' },
  { keys: ['⌘', 'N'], desc: '新建对话' },
  { keys: ['⌘', 'B'], desc: '折叠/展开侧边栏' },
  { keys: ['⌘', ','], desc: '打开设置' },
  { keys: ['⌘', '/'], desc: '显示快捷键面板' },
  { keys: ['⌘', '⇧', 'S'], desc: '截屏到输入框' },
  { keys: ['⌘', '⇧', 'Space'], desc: '唤出 Spotlight' },
  { keys: ['Enter'], desc: '发送消息' },
  { keys: ['Shift', 'Enter'], desc: '换行' },
  { keys: ['/'], desc: '唤起斜杠命令' },
  { keys: ['Esc'], desc: '关闭弹窗/面板' },
];

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

import { Component } from 'react';
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error) {
    const msg = error?.message || '';
    if (msg.includes('dynamically imported module') || msg.includes('Failed to fetch')) {
      setTimeout(() => window.location.reload(), 100);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-6">
            <p className="text-sm text-[color:var(--text-soft)] mb-3">页面加载失败，正在刷新…</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[color:var(--accent)] text-white text-sm"
            >刷新页面</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const pageMotion = {
  initial: { opacity: 0, x: 12, scale: 0.98, filter: 'blur(4px)' },
  animate: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -8, scale: 0.99, filter: 'blur(2px)' },
  transition: { duration: 0.25, ease: [.22, 1, .36, 1] },
};

// 主导航（居中带文字标签）
const NAV_TABS = [
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'agents', label: '智能体', icon: Sparkles },
  { id: 'skills', label: '技能', icon: Brain },
  { id: 'knowledge', label: '知识库', icon: BookOpen },
  { id: 'mcp', label: 'MCP', icon: Plug },
];

// 右侧辅助导航（仅图标）
const RIGHT_TABS = [
  { id: 'search', label: '搜索', icon: Search },
  { id: 'community', label: '社区', icon: Users },
  { id: 'nexus', label: 'Nexus', icon: Globe },
  { id: 'im', label: 'IM', icon: MessageCircle },
  { id: 'workflow', label: '工作流', icon: Workflow },
  { id: 'scheduled', label: '定时', icon: Clock },
  { id: 'evolution', label: '进化', icon: Dna },
  { id: 'settings', label: '设置', icon: SettingsIcon },
];

// 定时任务运行中徽章（右上角小红点 + 数量）
function ScheduledRunningDot() {
  const running = useStore((s) => s.runningScheduledTasks || {});
  const count = Object.keys(running).length;
  if (count === 0) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[color:var(--accent)] text-white text-[9px] font-bold flex items-center justify-center shadow-[0_0_8px_var(--accent-glow)] animate-pulse">
      {count}
    </span>
  );
}

function UserAvatarMenu({ user, onLogout, onSettings }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const providerLabel = { dingtalk: '钉钉', guest: '游客', google: 'Google', wechat: '微信', qq: 'QQ' };
  const initial = (user?.nickname || '?')[0].toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 p-0.5 rounded-full hover:ring-2 hover:ring-[color:var(--accent)]/30 transition-all"
        title={user?.nickname || '用户'}
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-1 ring-[color:var(--line)]" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[color:var(--accent)] flex items-center justify-center text-white text-xs font-bold ring-1 ring-[color:var(--accent)]">
            {initial}
          </div>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elev)] shadow-xl z-50 overflow-hidden"
          >
            <div className="p-4 border-b border-[color:var(--line)]">
              <div className="flex items-center gap-3">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-[color:var(--line)]" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[color:var(--accent)] flex items-center justify-center text-white text-sm font-bold">
                    {initial}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[color:var(--text)] truncate">{user?.nickname || '用户'}</div>
                  <div className="text-xs text-[color:var(--text-faint)] truncate">
                    {user?.email || (providerLabel[user?.provider] || user?.provider) + '账号'}
                  </div>
                </div>
              </div>
            </div>
            <div className="py-1">
              <button
                onClick={() => { setOpen(false); onSettings(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[color:var(--text)] hover:bg-[color:var(--bg-soft)] transition"
              >
                <User size={14} className="text-[color:var(--text-faint)]" />
                账号设置
              </button>
              <button
                onClick={() => { setOpen(false); onLogout(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
              >
                <LogOut size={14} />
                退出登录
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 全局 Nexus 通知浮层
function NexusNotificationOverlay() {
  const nexusNotifications = useStore((s) => s.nexusNotifications);
  const removeNexusNotif = useStore((s) => s.removeNexusNotif);
  const setView = useStore((s) => s.setView);
  const view = useStore((s) => s.view);

  const handleRespondConnect = useCallback(async (notifId, contactId, accept) => {
    try {
      await api.respondConnect(contactId, accept);
    } catch {}
    removeNexusNotif(notifId);
  }, [removeNexusNotif]);

  const handleGoToNexus = useCallback((notifId) => {
    setView('nexus');
    removeNexusNotif(notifId);
  }, [setView, removeNexusNotif]);

  // 不在 Nexus 页面时才显示浮层
  if (view === 'nexus' || nexusNotifications.length === 0) return null;

  return (
    <div className="fixed top-14 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {nexusNotifications.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className="p-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elev)] shadow-xl backdrop-blur"
          >
            {notif.type === 'connect_request' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <UserPlus size={14} className="text-amber-500" />
                  <span className="text-xs font-medium text-[color:var(--text)]">
                    <span className="font-bold">{notif.nickname || '未知'}</span> 请求建联
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => handleRespondConnect(notif.id, notif.contactId, true)}>
                    <Check size={12} /> 同意
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleRespondConnect(notif.id, notif.contactId, false)}>
                    <X size={12} /> 拒绝
                  </Button>
                </div>
              </div>
            )}
            {notif.type === 'conversation_request' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-blue-500" />
                  <span className="text-xs font-medium text-[color:var(--text)]">
                    <span className="font-bold">{notif.peerNickname || '未知'}</span> 发起对话请求
                  </span>
                </div>
                <div className="text-[10px] text-[color:var(--text-faint)] truncate">{notif.topic || ''}</div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => handleGoToNexus(notif.id)}>
                    前往处理
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeNexusNotif(notif.id)}>
                    稍后
                  </Button>
                </div>
              </div>
            )}
            {notif.type === 'contact_deleted' && (
              <div className="flex items-center gap-2">
                <X size={14} className="text-red-400" />
                <span className="text-xs text-[color:var(--text-soft)]">联系人已被对方删除</span>
                <Button variant="ghost" size="sm" onClick={() => removeNexusNotif(notif.id)}>
                  <X size={12} />
                </Button>
              </div>
            )}
            {notif.type === 'delivery_failed' && (
              <div className="flex items-center gap-2">
                <X size={14} className="text-red-400" />
                <span className="text-xs text-[color:var(--text-soft)]">消息投递失败: {notif.reason}</span>
                <Button variant="ghost" size="sm" onClick={() => removeNexusNotif(notif.id)}>
                  <X size={12} />
                </Button>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}


export function AppShell() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const notifications = useStore((s) => s.notifications);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const authChecked = useStore((s) => s.authChecked);
  const currentUser = useStore((s) => s.currentUser);
  const logout = useStore((s) => s.logout);
  const addNexusNotif = useStore((s) => s.addNexusNotif);

  // 移动端检测：视口宽度 < 768px 或通过 H5 远程访问标记或微信浏览器
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (isH5Mobile()) return true;
    return window.innerWidth < 768;
  });
  useEffect(() => {
    const h5 = isH5Mobile();
    const check = () => setIsMobile(h5 || window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 移动端侧边栏滑出状态（独立于桌面端的 sidebarCollapsed）
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // 移动端自动折叠桌面侧边栏
  useEffect(() => {
    if (isMobile && !sidebarCollapsed) toggleSidebar();
  }, [isMobile]);

  const [pendingInvite, setPendingInvite] = useState(null);
  const [inviteAgentId, setInviteAgentId] = useState('');
  const [inviteAgents, setInviteAgents] = useState([]);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  useEffect(() => {
    initStore();
  }, []);

  // 全局 Nexus WS 事件监听（不依赖 NexusPage 是否挂载）
  useEffect(() => {
    if (!isLoggedIn) return;
    const unsub = wsClient.on((msg) => {
      if (msg.event === 'nexus_connect_request') {
        try {
          const d = JSON.parse(msg.data);
          addNexusNotif({
            type: 'connect_request',
            contactId: d.id,
            peerId: d.peer_id,
            nickname: d.nickname,
          });
        } catch {}
      }
      if (msg.event === 'a2a_conversation_request' || msg.event === 'a2a_conversation_invite') {
        try {
          const d = JSON.parse(msg.data);
          const convId = d.id || d.conv_id;
          if (convId) {
            setPendingInvite((prev) => prev || {
              convId,
              peerNickname: d.peer_nickname,
              agentName: d.agent_name,
              topic: d.topic,
              goal: d.goal,
            });
            api.listAgents().then(setInviteAgents).catch(() => {});
          }
        } catch {}
      }
      if (msg.event === 'nexus_contact_deleted') {
        try {
          addNexusNotif({ type: 'contact_deleted' });
        } catch {}
      }
      if (msg.event === 'wan_delivery_failed') {
        try {
          const d = JSON.parse(msg.data);
          if (d.original_type === 'relay') {
            addNexusNotif({
              type: 'delivery_failed',
              reason: d.reason === 'peer_offline' ? '对方不在线' : '投递失败',
            });
          }
        } catch {}
      }
    });
    return unsub;
  }, [isLoggedIn, addNexusNotif]);

  const handleAcceptInvite = useCallback(async () => {
    if (!pendingInvite || !inviteAgentId) return;
    setInviteSubmitting(true);
    try {
      await api.acceptRemoteConversation(pendingInvite.convId, Number(inviteAgentId));
      setPendingInvite(null);
      setInviteAgentId('');
      setView('nexus');
    } catch {}
    setInviteSubmitting(false);
  }, [pendingInvite, inviteAgentId, setView]);

  const handleRejectInvite = useCallback(async () => {
    if (!pendingInvite) return;
    try {
      await api.rejectRemoteConversation(pendingInvite.convId);
    } catch {}
    setPendingInvite(null);
    setInviteAgentId('');
  }, [pendingInvite]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'b') { e.preventDefault(); toggleSidebar(); return; }
      if (mod && e.key === '/') { e.preventDefault(); setShortcutsOpen((v) => !v); return; }
      if (mod && e.key === 'n') { e.preventDefault(); useStore.getState().createSession(); return; }
      if (mod && e.key === ',') { e.preventDefault(); setView('settings'); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isLoggedIn, toggleSidebar, setView]);

  // 认证状态检查中，显示加载
  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center bg-[color:var(--bg)]" style={{ WebkitAppRegion: 'no-drag' }}>
        <div className="fixed top-0 left-0 right-0 h-9 z-50" style={{ WebkitAppRegion: 'drag' }} />
        <div className="text-center space-y-3">
          <img src="/logo.png" alt="灵犀" className="w-16 h-16 rounded-2xl mx-auto animate-pulse" />
          <p className="text-sm text-[color:var(--text-soft)]">加载中…</p>
        </div>
      </div>
    );
  }

  // 未登录，显示登录页
  if (!isLoggedIn) {
    return (
      <PageErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <LoginPage />
          <ToastStack items={notifications} />
        </Suspense>
      </PageErrorBoundary>
    );
  }



  const showSidebar = view === 'chat';

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-[color:var(--bg)] overflow-hidden">
      {/* 顶部栏 */}
      <header className={cn(
        'app-drag flex items-center border-b border-[color:var(--line)] glass relative shrink-0',
        isMobile ? 'h-12 px-2 safe-area-top' : 'h-12 px-4'
      )}>
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)]/40 to-transparent" />
        <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-gradient-to-b from-[color:var(--line)] to-transparent opacity-50 pointer-events-none" />

        {/* 移动端左侧：汉堡菜单 + 新建 */}
        {isMobile && (
          <div className="flex items-center gap-1 shrink-0 app-no-drag">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[color:var(--text)] hover:bg-[color:var(--bg-soft)] transition active:scale-95"
              aria-label="打开菜单"
            >
              <Menu size={20} />
            </button>
            <button
              onClick={() => { useStore.getState().createSession(); }}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[color:var(--accent)] hover:bg-[color:var(--accent-soft)] transition active:scale-95"
              aria-label="新建对话"
            >
              <Plus size={20} />
            </button>
          </div>
        )}

        {/* 桌面端左侧：Logo + AgentState */}
        {!isMobile && (
          <div className="flex items-center gap-2 shrink-0 pl-16">
            <img src="/logo.png" alt="灵犀" className="w-7 h-7 rounded-lg shadow-soft ring-1 ring-[color:var(--accent-soft)]" />
            <div className="text-sm font-semibold tracking-tight text-gradient">灵犀</div>
            <div className="ml-2"><AgentStatePill /></div>
          </div>
        )}

        <div className="flex-1 min-w-[4px]" />

        {/* 主导航 */}
        <nav className="app-no-drag flex items-center justify-center gap-0.5 overflow-x-auto scrollbar-none" aria-label="主导航">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setView(tab.id); if (isMobile) setMobileSidebarOpen(false); }}
                title={tab.label}
                className={cn(
                  'relative flex items-center justify-center rounded-lg text-xs font-medium transition-all duration-200 shrink-0',
                  isMobile ? 'p-2' : 'gap-1 px-2.5 py-1.5',
                  active
                    ? 'text-[color:var(--accent)]'
                    : 'text-[color:var(--text-soft)] hover:text-[color:var(--text)] hover:bg-[color:var(--bg-soft)]'
                )}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute inset-0 rounded-lg bg-[color:var(--accent-soft)] shadow-[0_0_12px_var(--accent-glow),inset_0_1px_0_rgba(255,255,255,0.08)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <Icon size={isMobile ? 18 : 14} />
                  {!isMobile && <span>{tab.label}</span>}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-[4px]" />

        {/* 右侧 */}
        <div className="app-no-drag flex items-center gap-1 shrink-0">
          {!isMobile && (
            <div className="flex items-center gap-px mr-2 border-r border-[color:var(--line)]/60 pr-2">
              {RIGHT_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    title={tab.label}
                    className={cn(
                      'relative p-1.5 rounded-lg transition-all duration-200',
                      active
                        ? 'text-[color:var(--accent)] bg-[color:var(--accent-soft)] shadow-[0_0_8px_var(--accent-glow)]'
                        : 'text-[color:var(--text-faint)] hover:text-[color:var(--text)] hover:bg-[color:var(--bg-soft)]'
                    )}
                  >
                    <Icon size={15} />
                    {tab.id === 'scheduled' && <ScheduledRunningDot />}
                  </button>
                );
              })}
            </div>
          )}
          {!isMobile && <RouterPill />}
          {!isMobile && <ModelSwitcher />}
          {!isMobile && currentUser && (
            <UserAvatarMenu
              user={currentUser}
              onLogout={logout}
              onSettings={() => { setView('settings'); useStore.getState().setSettingsTab('account'); }}
            />
          )}
          {showSidebar && !isMobile && (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-[color:var(--text-faint)] hover:text-[color:var(--text)] hover:bg-[color:var(--bg-soft)] transition"
              title={sidebarCollapsed ? '展开侧边栏 ⌘B' : '收起侧边栏 ⌘B'}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          )}
          {isMobile && (
            <button
              onClick={() => setView('settings')}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[color:var(--text-faint)] hover:text-[color:var(--text)] active:scale-95 transition"
            >
              <SettingsIcon size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* 移动端滑出式侧边栏 + 遮罩 */}
        {isMobile && (
          <>
            {mobileSidebarOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={() => setMobileSidebarOpen(false)}
              />
            )}
            <aside
              className={cn(
                'fixed inset-y-0 left-0 z-50 w-[min(85vw,300px)] bg-[color:var(--bg-elev)] border-r border-[color:var(--line)] shadow-xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              )}
              aria-hidden={!mobileSidebarOpen}
            >
              <SidebarSessions onSessionSelect={() => setMobileSidebarOpen(false)} />
            </aside>
          </>
        )}

        {/* 桌面端侧边栏 */}
        {showSidebar && !isMobile && (
          <aside className={cn(
            'shrink-0 border-r border-[color:var(--line)] bg-[color:var(--bg-elev)]/80 backdrop-blur flex flex-col transition-all duration-300',
            sidebarCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-[260px] opacity-100'
          )}>
            <SidebarSessions />
          </aside>
        )}

        {/* 主区 */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          <PageErrorBoundary>
          <Suspense fallback={<PageFallback />}>
          <AnimatePresence mode="wait">
            {view === 'chat' && (
              <motion.div key="chat" className="flex-1 flex flex-col min-h-0" {...pageMotion}>
                <ChatView />
              </motion.div>
            )}
            {view === 'settings' && (
              <motion.div key="settings" className="flex-1 flex flex-col min-h-0" {...pageMotion}>
                <SettingsPage />
              </motion.div>
            )}
            {view === 'agents' && (
              <motion.div key="agents" className={cn('flex-1 overflow-auto scrollable bg-[color:var(--bg)]', isMobile ? 'p-3' : 'p-6')} {...pageMotion}>
                <AgentFactoryPage onBack={() => setView('chat')} />
              </motion.div>
            )}
            {view === 'mcp' && (
              <motion.div key="mcp" className={cn('flex-1 overflow-auto scrollable bg-[color:var(--bg)]', isMobile ? 'p-3' : 'p-6')} {...pageMotion}>
                <MCPPage onBack={() => setView('chat')} />
              </motion.div>
            )}
            {view === 'skills' && (
              <motion.div key="skills" className={cn('flex-1 overflow-auto scrollable bg-[color:var(--bg)]', isMobile ? 'p-3' : 'p-4')} {...pageMotion}>
                <SkillsPage />
              </motion.div>
            )}
            {view === 'knowledge' && (
              <motion.div key="knowledge" className={cn('flex-1 overflow-auto scrollable bg-[color:var(--bg)]', isMobile ? 'p-3' : 'p-4')} {...pageMotion}>
                <KnowledgePage />
              </motion.div>
            )}
            {view === 'im' && (
              <motion.div key="im" className={cn('flex-1 overflow-auto scrollable bg-[color:var(--bg)]', isMobile ? 'p-3' : 'p-4')} {...pageMotion}>
                <IMConnectorPage />
              </motion.div>
            )}
            {view === 'workflow' && (
              <motion.div key="workflow" className={cn('flex-1 overflow-auto scrollable bg-[color:var(--bg)]', isMobile ? 'p-3' : 'p-6')} {...pageMotion}>
                <WorkflowPage />
              </motion.div>
            )}
            {view === 'nexus' && (
              <motion.div key="nexus" className="flex-1 flex flex-col min-h-0" {...pageMotion}>
                <NexusPage />
              </motion.div>
            )}
            {view === 'scheduled' && (
              <motion.div key="scheduled" className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-4" {...pageMotion}>
                <ScheduledTasksPage />
              </motion.div>
            )}
            {view === 'evolution' && (
              <motion.div key="evolution" className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-6" {...pageMotion}>
                <EvolutionPage />
              </motion.div>
            )}
            {view === 'community' && (
              <motion.div key="community" className="flex-1 flex min-h-0 bg-[color:var(--bg)]" {...pageMotion}>
                <CommunityPage />
              </motion.div>
            )}
            {view === 'search' && (
              <motion.div key="search" className="flex-1 flex flex-col min-h-0" {...pageMotion}>
                <DeepSearchPage />
              </motion.div>
            )}
          </AnimatePresence>
          </Suspense>
          </PageErrorBoundary>
        </main>
      </div>

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="快捷键" width={420}>
        <div className="space-y-1">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center justify-between py-2 px-1 border-b border-[color:var(--line)] last:border-0">
              <span className="text-sm text-[color:var(--text-soft)]">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-xs font-mono text-[color:var(--text-soft)]">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* 对话邀请弹窗 */}
      <Modal open={!!pendingInvite} onClose={() => {}} title="收到对话邀请" width={440}>
        {pendingInvite && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[color:var(--bg-soft)] space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-sm">
                  {(pendingInvite.peerNickname || '?')[0]}
                </div>
                <div>
                  <div className="text-sm font-medium text-[color:var(--text)]">{pendingInvite.peerNickname || '未知用户'}</div>
                  <div className="text-[10px] text-[color:var(--text-faint)]">通过 {pendingInvite.agentName || 'Agent'} 向你发起对话</div>
                </div>
              </div>
              {pendingInvite.topic && (
                <div className="text-xs text-[color:var(--text-soft)]">
                  <span className="text-[color:var(--text-faint)]">主题：</span>{pendingInvite.topic}
                </div>
              )}
              {pendingInvite.goal && (
                <div className="text-xs text-[color:var(--text-soft)]">
                  <span className="text-[color:var(--text-faint)]">目标：</span>{pendingInvite.goal}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1.5 block">选择代表你回答的 Agent</label>
              <select
                value={inviteAgentId}
                onChange={(e) => setInviteAgentId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-sm text-[color:var(--text)] focus:outline-none focus:border-[color:var(--accent)]"
              >
                <option value="">请选择 Agent...</option>
                {inviteAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={handleRejectInvite}>拒绝</Button>
              <Button variant="primary" onClick={handleAcceptInvite} disabled={!inviteAgentId || inviteSubmitting}>
                {inviteSubmitting ? '接受中...' : '接受对话'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <NexusNotificationOverlay />
      <EvolutionProgressPanel />
      <ClipboardSuggestionBubble onSendToChat={(text) => {
        setView('chat');
        setTimeout(() => {
          window.__clipboardPrefill = text;
          window.dispatchEvent(new CustomEvent('clipboard-prefill', { detail: text }));
        }, 100);
      }} />
      <ToastStack items={notifications} />
    </div>
  );
}

function ClipboardSuggestionBubble({ onSendToChat }) {
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    if (!window.electronAPI?.onClipboardSuggestion) return;
    const unsub = window.electronAPI.onClipboardSuggestion((data) => {
      setSuggestion(data);
      setTimeout(() => setSuggestion(null), 6000);
    });
    return unsub;
  }, []);

  if (!suggestion) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={suggestion.timestamp}
        initial={{ opacity: 0, y: 20, x: 20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-20 right-6 z-[9999] max-w-sm"
      >
        <div className="bg-[color:var(--bg-elev)] border border-[color:var(--line)] rounded-2xl shadow-xl p-4 backdrop-blur-lg">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">{suggestion.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[color:var(--text)]">{suggestion.label}</div>
              <div className="text-xs text-[color:var(--text-faint)] mt-0.5 line-clamp-2">{suggestion.preview}</div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { onSendToChat?.(suggestion.fullText); setSuggestion(null); }}
                  className="px-3 py-1 text-xs font-medium rounded-lg bg-[color:var(--accent)] text-white hover:opacity-90 transition"
                >
                  {suggestion.action}
                </button>
                <button
                  onClick={() => setSuggestion(null)}
                  className="px-3 py-1 text-xs text-[color:var(--text-soft)] hover:text-[color:var(--text)] transition"
                >
                  忽略
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
