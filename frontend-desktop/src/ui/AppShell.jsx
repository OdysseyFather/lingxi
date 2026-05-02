import { useEffect } from 'react';
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
import { ToastStack, cn } from './primitives';
import { MessageSquare, Settings as SettingsIcon, Brain, BookOpen, MessageCircle, Plug, Sparkles } from 'lucide-react';

const NAV = [
  { id: 'chat',     label: '对话',   icon: MessageSquare },
  { id: 'agents',   label: '智能体', icon: Sparkles },
  { id: 'skills',   label: '技能',   icon: Brain },
  { id: 'knowledge',label: '知识库', icon: BookOpen },
  { id: 'mcp',      label: 'MCP',    icon: Plug },
  { id: 'im',       label: 'IM',     icon: MessageCircle },
  { id: 'settings', label: '设置',   icon: SettingsIcon },
];

export function AppShell() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const notifications = useStore((s) => s.notifications);

  useEffect(() => {
    initStore();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[color:var(--bg)]">
      {/* 顶部栏（macOS 红绿灯让出空间） */}
      <header className="app-drag h-12 flex items-center justify-between px-4 border-b border-[color:var(--line)] glass relative">
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)]/40 to-transparent" />
        <div className="flex items-center gap-2 pl-16">
          <img src="/logo.png" alt="灵犀" className="w-7 h-7 rounded-lg shadow-soft ring-1 ring-[color:var(--accent-soft)]" />
          <div className="text-sm font-semibold tracking-tight text-gradient">灵犀</div>
          <div className="ml-3"><AgentStatePill /></div>
        </div>
        <div className="app-no-drag flex items-center gap-2">
          <RouterPill />
          <ModelSwitcher />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 左侧导航 + 会话列表 */}
        <aside className="w-64 shrink-0 border-r border-[color:var(--line)] bg-[color:var(--bg-elev)]/80 backdrop-blur flex flex-col">
          <nav className="px-2 pt-3 pb-1 grid grid-cols-4 gap-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[11px] transition-all duration-200',
                    active
                      ? 'bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent text-[color:var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-soft)]'
                      : 'text-[color:var(--text-soft)] hover:bg-[color:var(--bg-soft)] hover:-translate-y-px'
                  )}
                  title={n.label}
                >
                  <Icon size={14} />
                  {n.label}
                </button>
              );
            })}
          </nav>
          <div className="flex-1 min-h-0">
            {(view === 'chat') ? <SidebarSessions /> : null}
          </div>
        </aside>

        {/* 主区 */}
        <main className="flex-1 flex flex-col min-h-0">
          {view === 'chat' && <ChatView />}
          {view === 'settings' && <SettingsPage />}
          {view === 'agents' && (
            <div className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-6">
              <AgentFactoryPage onBack={() => setView('chat')} />
            </div>
          )}
          {view === 'mcp' && (
            <div className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-6">
              <MCPPage onBack={() => setView('chat')} />
            </div>
          )}
          {view === 'skills' && (
            <div className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-4">
              <SkillsPage onBack={() => setView('chat')} />
            </div>
          )}
          {view === 'knowledge' && (
            <div className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-4">
              <KnowledgePage onBack={() => setView('chat')} />
            </div>
          )}
          {view === 'im' && (
            <div className="flex-1 overflow-auto scrollable bg-[color:var(--bg)] p-4">
              <IMConnectorPage onBack={() => setView('chat')} />
            </div>
          )}
        </main>
      </div>

      <ToastStack items={notifications} />
    </div>
  );
}
