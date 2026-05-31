import { useState, useMemo, useCallback } from 'react';
import { Search, Plus, Trash2 } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';

function groupByDate(sessions) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const groups = { today: [], yesterday: [], older: [] };
  for (const s of sessions) {
    const t = new Date(s.updated_at || s.created_at).getTime();
    if (t >= today) groups.today.push(s);
    else if (t >= yesterday) groups.yesterday.push(s);
    else groups.older.push(s);
  }
  return groups;
}

export function CodingSidebar() {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const createSession = useStore((s) => s.createSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const [search, setSearch] = useState('');
  const [hoverId, setHoverId] = useState(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter((s) => (s.title || '').toLowerCase().includes(q));
  }, [sessions, search]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const handleNew = useCallback(() => createSession('编程会话'), [createSession]);

  const renderGroup = (label, items) => {
    if (items.length === 0) return null;
    return (
      <div key={label} className="mb-2">
        <div className="px-3 py-1.5 text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wider">{label}</div>
        {items.map((s) => (
          <div
            key={s.id}
            className="relative group"
            onMouseEnter={() => setHoverId(s.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            <button
              onClick={() => setActiveSession(s.id)}
              className={cn(
                'w-full text-left px-3 py-2 text-[13px] truncate transition-all rounded-md mx-1',
                'flex items-center gap-2',
                s.id === activeSessionId
                  ? 'bg-[var(--accent-soft)] text-[var(--text)] font-medium'
                  : 'text-[var(--text-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]'
              )}
              style={{ maxWidth: 'calc(100% - 8px)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                backgroundColor: s.id === activeSessionId ? 'var(--accent)' : 'transparent',
              }} />
              <span className="truncate">{s.title || '未命名会话'}</span>
            </button>
            {hoverId === s.id && s.id !== activeSessionId && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--text-faint)] hover:text-red-400 transition"
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-[220px] bg-[var(--coding-surface)] border-r border-[var(--coding-border)] flex flex-col shrink-0 select-none">
      <div className="p-2 border-b border-[var(--coding-border)]">
        <button
          onClick={handleNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] transition"
        >
          <Plus size={14} />
          <span>New session</span>
        </button>
      </div>

      <div className="px-2 py-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] text-[12px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollable px-1">
        {renderGroup('Today', groups.today)}
        {renderGroup('Yesterday', groups.yesterday)}
        {renderGroup('Earlier', groups.older)}
        {filtered.length === 0 && (
          <div className="text-center text-[12px] text-[var(--text-faint)] py-8">暂无会话</div>
        )}
      </div>
    </div>
  );
}
