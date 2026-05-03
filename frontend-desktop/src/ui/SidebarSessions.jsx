import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../state/useStore';
import { Plus, MessageSquare, Trash2, Search, ChevronDown, Sparkles, Settings as SettingsIcon, Pencil, Pin } from 'lucide-react';
import { Input, Button, Modal } from './primitives';
import { cn } from './cn';

function groupSessionsByDate(sessions) {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups = { pinned: [], today: [], yesterday: [], week: [], older: [] };
  for (const s of sessions) {
    if (s.pinned) { groups.pinned.push(s); continue; }
    const d = new Date(s.updated_at || s.created_at);
    const ds = d.toDateString();
    if (ds === todayStr) groups.today.push(s);
    else if (ds === yesterdayStr) groups.yesterday.push(s);
    else if (d >= weekAgo) groups.week.push(s);
    else groups.older.push(s);
  }
  const result = [];
  if (groups.pinned.length) result.push({ label: '置顶', items: groups.pinned });
  if (groups.today.length) result.push({ label: '今天', items: groups.today });
  if (groups.yesterday.length) result.push({ label: '昨天', items: groups.yesterday });
  if (groups.week.length) result.push({ label: '本周', items: groups.week });
  if (groups.older.length) result.push({ label: '更早', items: groups.older });
  return result;
}

export function SidebarSessions() {
  const sessions = useStore((s) => s.sessions);
  const activeId = useStore((s) => s.activeSessionId);
  const setActive = useStore((s) => s.setActiveSession);
  const createSession = useStore((s) => s.createSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const renameSession = useStore((s) => s.renameSession);
  const pinSession = useStore((s) => s.pinSession);
  const setView = useStore((s) => s.setView);
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const setActiveAgent = useStore((s) => s.setActiveAgent);

  const [q, setQ] = useState('');
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const filtered = sessions.filter((s) => !q || (s.title || '').toLowerCase().includes(q.toLowerCase()));
  const grouped = useMemo(() => groupSessionsByDate(filtered), [filtered]);
  const currentAgent = agents.find((a) => a.id === activeAgentId) || agents.find((a) => a.builtin) || agents[0];

  const handleConfirmDelete = useCallback(async () => {
    if (deleteTarget) {
      await deleteSession(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteSession]);

  return (
    <div className="flex flex-col h-full pt-3 pb-3 px-3 gap-2.5">
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
          {agentMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAgentMenuOpen(false)} />
              <div className="absolute z-50 left-0 right-0 top-full mt-1 surface p-1.5 shadow-glow animate-rise">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)] px-2 py-1">切换智能体</div>
                <div className="max-h-[300px] overflow-auto">
                  {agents.map((a) => {
                    const sel = a.id === activeAgentId;
                    return (
                      <button
                        key={a.id}
                        onClick={async () => { setAgentMenuOpen(false); if (!sel) await setActiveAgent(a.id); }}
                        className={cn(
                          'w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition',
                          sel ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'hover:bg-[color:var(--bg-soft)]'
                        )}
                      >
                        <span className="w-7 h-7 rounded-lg bg-[color:var(--bg-soft)] flex items-center justify-center text-sm shrink-0">{a.avatar || '✦'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{a.name}</div>
                          {a.description && <div className="text-[11px] text-[color:var(--text-faint)] truncate">{a.description}</div>}
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
              </div>
            </>
          )}
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
      <div className="flex-1 overflow-y-auto scrollable -mx-1 px-1 relative">
        {grouped.length > 0 ? grouped.map((group) => (
          <div key={group.label} className="mb-2">
            <div className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-faint)] flex items-center gap-2">
              <span className="w-3 h-[2px] rounded-full bg-[color:var(--accent)]/40" />
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  active={s.id === activeId}
                  onClick={() => { setActive(s.id); setView('chat'); }}
                  onDelete={() => setDeleteTarget(s)}
                  onRename={(title) => renameSession(s.id, title)}
                  onPin={() => pinSession(s.id, !s.pinned)}
                />
              ))}
            </div>
          </div>
        )) : (
          <div className="px-3 py-8 text-xs text-[color:var(--text-faint)] text-center">
            <Sparkles size={20} className="mx-auto mb-2 opacity-50" />
            {currentAgent ? `${currentAgent.name} 还没有对话` : '暂无对话'}
            <div className="mt-1">点击上方 + 开始</div>
          </div>
        )}
      </div>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="确认删除" width={380}>
        <p className="text-sm text-[color:var(--text-soft)] mb-4">
          确定要删除对话 <span className="font-medium text-[color:var(--text)]">「{deleteTarget?.title || '新对话'}」</span>？此操作不可恢复。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" size="sm" onClick={handleConfirmDelete}>删除</Button>
        </div>
      </Modal>
    </div>
  );
}

function SessionItem({ session, active, onClick, onDelete, onRename, onPin }) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef(null);

  const startEditing = useCallback(() => {
    setEditTitle(session.title || '新对话');
    setEditing(true);
  }, [session.title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== session.title) onRename(trimmed);
    setEditing(false);
  }, [editTitle, session.title, onRename]);

  return (
    <div
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}
      className={cn(
        'group relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200',
        active
          ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
          : 'hover:bg-[color:var(--bg-soft)] text-[color:var(--text)] hover:translate-x-0.5',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-gradient-to-b from-[color:var(--accent)] to-[#5e8bff] shadow-[0_0_8px_var(--accent-glow)]" />
      )}
      <MessageSquare size={14} className="shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm w-full bg-transparent border-b border-[color:var(--accent)] outline-none py-0.5"
          />
        ) : (
          <>
            <div className="text-sm truncate">{session.title || '新对话'}</div>
            <div className="text-[11px] text-[color:var(--text-faint)] truncate">{session.message_count || 0} 条消息</div>
          </>
        )}
      </div>
      {!editing && (
        <div className="opacity-0 group-hover:opacity-100 transition flex gap-0.5">
          <button
            className={cn('p-1 rounded', session.pinned ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-faint)] hover:text-[color:var(--accent)]')}
            onClick={(e) => { e.stopPropagation(); onPin?.(); }}
            title={session.pinned ? '取消置顶' : '置顶'}
          >
            <Pin size={12} />
          </button>
          <button
            className="text-[color:var(--text-faint)] hover:text-[color:var(--accent)] p-1 rounded"
            onClick={(e) => { e.stopPropagation(); startEditing(); }}
            title="重命名"
          >
            <Pencil size={12} />
          </button>
          <button
            className="text-[color:var(--text-faint)] hover:text-red-500 p-1 rounded"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
