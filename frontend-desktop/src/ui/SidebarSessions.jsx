import { useState } from 'react';
import { useStore } from '../state/useStore';
import { Plus, MessageSquare, Trash2, Search, ChevronDown, Sparkles, Settings as SettingsIcon } from 'lucide-react';
import { Input, cn } from './primitives';
import { motion, AnimatePresence } from 'framer-motion';

export function SidebarSessions() {
  const sessions = useStore((s) => s.sessions);
  const activeId = useStore((s) => s.activeSessionId);
  const setActive = useStore((s) => s.setActiveSession);
  const createSession = useStore((s) => s.createSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const setView = useStore((s) => s.setView);
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const setActiveAgent = useStore((s) => s.setActiveAgent);

  const [q, setQ] = useState('');
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const filtered = sessions.filter((s) => !q || (s.title || '').toLowerCase().includes(q.toLowerCase()));
  const currentAgent = agents.find((a) => a.id === activeAgentId) || agents.find((a) => a.builtin) || agents[0];

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* 当前智能体（点击切换） */}
      {currentAgent && (
        <div className="relative">
          <button
            onClick={() => setAgentMenuOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl
              bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent
              border border-[color:var(--accent-soft)] hover:border-[color:var(--accent)]/40
              hover:shadow-glow transition text-left"
          >
            <span className="w-9 h-9 rounded-xl bg-[color:var(--bg-elev)] flex items-center justify-center text-base shrink-0 ring-1 ring-[color:var(--accent-soft)]">
              {currentAgent.avatar || '✦'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">当前智能体</div>
              <div className="text-sm font-semibold truncate text-[color:var(--text)]">{currentAgent.name}</div>
            </div>
            <ChevronDown size={14} className="text-[color:var(--text-faint)]" />
          </button>
          <AnimatePresence>
            {agentMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAgentMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute z-50 left-0 right-0 top-full mt-1 surface p-1.5 shadow-glow"
                >
                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)] px-2 py-1">
                    切换智能体
                  </div>
                  <div className="max-h-[300px] overflow-auto">
                    {agents.map((a) => {
                      const sel = a.id === activeAgentId;
                      return (
                        <button
                          key={a.id}
                          onClick={async () => {
                            setAgentMenuOpen(false);
                            if (!sel) await setActiveAgent(a.id);
                          }}
                          className={cn(
                            'w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition',
                            sel
                              ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                              : 'hover:bg-[color:var(--bg-soft)]'
                          )}
                        >
                          <span className="w-7 h-7 rounded-lg bg-[color:var(--bg-soft)] flex items-center justify-center text-sm shrink-0">
                            {a.avatar || '✦'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{a.name}</div>
                            {a.description && (
                              <div className="text-[11px] text-[color:var(--text-faint)] truncate">
                                {a.description}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-[color:var(--line)] mt-1 pt-1">
                    <button
                      onClick={() => { setAgentMenuOpen(false); setView('agents'); }}
                      className="w-full px-2 py-1.5 rounded-lg flex items-center gap-2 text-sm text-[color:var(--accent)] hover:bg-[color:var(--accent-soft)]"
                    >
                      <SettingsIcon size={13} />管理智能体…
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}

      <button
        onClick={async () => { await createSession(); setView('chat'); }}
        className="flex items-center justify-center gap-2 px-3 h-10 rounded-lg text-white transition-all duration-200
          bg-gradient-to-r from-[color:var(--accent)] to-[#5e8bff]
          hover:shadow-[0_8px_24px_var(--accent-glow)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99] shadow-soft"
      >
        <Plus size={16} /> 新对话
      </button>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)]" />
        <Input className="pl-8 h-9" placeholder="搜索对话…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex-1 overflow-y-auto scrollable -mx-1 px-1 space-y-0.5">
        {filtered.map((s) => (
          <SessionItem
            key={s.id}
            session={s}
            active={s.id === activeId}
            onClick={() => { setActive(s.id); setView('chat'); }}
            onDelete={() => deleteSession(s.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-xs text-[color:var(--text-faint)] text-center">
            <Sparkles size={20} className="mx-auto mb-2 opacity-50" />
            {currentAgent ? `${currentAgent.name} 还没有对话` : '暂无对话'}
            <div className="mt-1">点击上方 ➕ 开始</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionItem({ session, active, onClick, onDelete }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200',
        active
          ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
          : 'hover:bg-[color:var(--bg-soft)] text-[color:var(--text)] hover:translate-x-0.5',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-gradient-to-b from-[color:var(--accent)] to-[#5e8bff]" />
      )}
      <MessageSquare size={14} className="shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{session.title || '新对话'}</div>
        <div className="text-[11px] text-[color:var(--text-faint)] truncate">
          {session.message_count || 0} 条消息
        </div>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 transition text-[color:var(--text-faint)] hover:text-red-500 p-1"
        onClick={(e) => { e.stopPropagation(); if (confirm('删除该对话？')) onDelete(); }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
