import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, initStore } from '../state/useStore';
import { SidebarSessions } from './SidebarSessions';
import { ModelSwitcher } from './ModelSwitcher';
import { RouterPill } from './RouterPill';
import { ChatView } from '../chat/ChatView';
import { AgentStatePill } from '../chat/AgentStatePill';
import { SettingsPage } from '../settings/SettingsPage';
import SkillsPage from '../SkillsPage';
import KnowledgePage from '../KnowledgePage';
import IMConnectorPage from '../IMConnectorPage';
import MCPPage from '../MCPPage';
import AgentFactoryPage from '../AgentFactoryPage';
import ScheduledTasksPage from '../ScheduledTasksPage';
import { ToastStack, Modal } from './primitives';
import { cn } from './cn';
import { MessageSquare, Settings as SettingsIcon, Brain, BookOpen, MessageCircle, Plug, Sparkles, PanelLeftClose, PanelLeftOpen, Clock } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: '搜索消息' },
  { keys: ['⌘', 'N'], desc: '新建对话' },
  { keys: ['⌘', 'B'], desc: '折叠/展开侧边栏' },
  { keys: ['⌘', ','], desc: '打开设置' },
  { keys: ['⌘', '/'], desc: '显示快捷键面板' },
  { keys: ['Enter'], desc: '发送消息' },
  { keys: ['Shift', 'Enter'], desc: '换行' },
  { keys: ['/'], desc: '唤起斜杠命令' },
  { keys: ['Esc'], desc: '关闭弹窗/面板' },
];

const pageMotion = {
  initial: { opacity: 0, x: 12, scale: 0.98, filter: 'blur(4px)' },
  animate: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -8, scale: 0.99, filter: 'blur(2px)' },
  transition: { duration: 0.25, ease: [.22, 1, .36, 1] },
};

const NAV_TABS = [
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'agents', label: '智能体', icon: Sparkles },
  { id: 'skills', label: '技能', icon: Brain },
  { id: 'knowledge', label: '知识库', icon: BookOpen },
  { id: 'mcp', label: 'MCP', icon: Plug },
  { id: 'im', label: 'IM', icon: MessageCircle },
  { id: 'scheduled', label: '定时', icon: Clock },
  { id: 'settings', label: '设置', icon: SettingsIcon },
];

export function AppShell() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const notifications = useStore((s) => s.notifications);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  useEffect(() => {
    initStore();
  }, []);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'b') { e.preventDefault(); toggleSidebar(); return; }
      if (mod && e.key === '/') { e.preventDefault(); setShortcutsOpen((v) => !v); return; }
      if (mod && e.key === 'n') { e.preventDefault(); useStore.getState().createSession(); return; }
      if (mod && e.key === ',') { e.preventDefault(); setView('settings'); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleSidebar, setView]);

  const showSidebar = view === 'chat';

  return (
    <div className="h-screen flex flex-col bg-[color:var(--bg)]">
      {/* 顶部栏：Logo + Tab 导航 + 模型切换 */}
      <header className="app-drag h-12 flex items-center px-4 border-b border-[color:var(--line)] glass relative shrink-0">
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)]/40 to-transparent" />
        <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-gradient-to-b from-[color:var(--line)] to-transparent opacity-50 pointer-events-none" />

        {/* 左侧：Logo + AgentState */}
        <div className="flex items-center gap-2 pl-16 shrink-0">
          <img src="/logo.png" alt="灵犀" className="w-7 h-7 rounded-lg shadow-soft ring-1 ring-[color:var(--accent-soft)]" />
          <div className="text-sm font-semibold tracking-tight text-gradient">灵犀</div>
          <div className="ml-2"><AgentStatePill /></div>
        </div>

        {/* 中间：Tab 导航 */}
        <nav className="app-no-drag flex-1 flex items-center justify-center gap-0.5 mx-4" aria-label="主导航">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
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
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* 右侧：路由状态 + 模型切换 + 侧边栏按钮 */}
        <div className="app-no-drag flex items-center gap-2 shrink-0">
          <RouterPill />
          <ModelSwitcher />
          {showSidebar && (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-[color:var(--text-faint)] hover:text-[color:var(--text)] hover:bg-[color:var(--bg-soft)] transition"
              title={sidebarCollapsed ? '展开侧边栏 ⌘B' : '收起侧边栏 ⌘B'}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 侧边栏：纯会话列表（仅对话页显示） */}
        {showSidebar && (
          <aside className={cn(
            'shrink-0 border-r border-[color:var(--line)] bg-[color:var(--bg-elev)]/80 backdrop-blur flex flex-col transition-all duration-300',
            sidebarCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-[260px] opacity-100'
          )}>
            <SidebarSessions />
          </aside>
        )}

        {/* 主区 */}
        <main className="flex-1 flex flex-col min-h-0 relative">
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
              <motion.div key="agents" className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-6" {...pageMotion}>
                <AgentFactoryPage onBack={() => setView('chat')} />
              </motion.div>
            )}
            {view === 'mcp' && (
              <motion.div key="mcp" className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-6" {...pageMotion}>
                <MCPPage onBack={() => setView('chat')} />
              </motion.div>
            )}
            {view === 'skills' && (
              <motion.div key="skills" className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-4" {...pageMotion}>
                <SkillsPage />
              </motion.div>
            )}
            {view === 'knowledge' && (
              <motion.div key="knowledge" className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-4" {...pageMotion}>
                <KnowledgePage />
              </motion.div>
            )}
            {view === 'im' && (
              <motion.div key="im" className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-4" {...pageMotion}>
                <IMConnectorPage />
              </motion.div>
            )}
            {view === 'scheduled' && (
              <motion.div key="scheduled" className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-4" {...pageMotion}>
                <ScheduledTasksPage />
              </motion.div>
            )}
          </AnimatePresence>
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

      <ToastStack items={notifications} />
    </div>
  );
}
