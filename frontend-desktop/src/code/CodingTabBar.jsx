import { useCallback } from 'react';
import { X, Plus, Settings, Clock } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';

export function CodingTabBar() {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const createSession = useStore((s) => s.createSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const codingView = useStore((s) => s.codingView);
  const setCodingView = useStore((s) => s.setCodingView);

  const openSessions = sessions.slice(0, 8);

  const handleNew = useCallback(() => {
    createSession('编程会话');
    setCodingView('chat');
  }, [createSession, setCodingView]);

  const handleClose = useCallback((e, id) => {
    e.stopPropagation();
    deleteSession(id);
  }, [deleteSession]);

  return (
    <div className="h-9 flex items-center bg-[var(--coding-surface)] border-b border-[var(--coding-border)] shrink-0 select-none app-drag overflow-hidden">
      <div className="flex items-center h-full overflow-x-auto no-scrollbar app-no-drag">
        {codingView === 'settings' && (
          <div className={cn(
            'h-full flex items-center gap-1.5 px-4 text-[12px] font-medium border-r border-[var(--coding-border)] shrink-0',
            'bg-[var(--coding-surface-raised)] text-[var(--text)] border-b-2 border-b-[var(--accent)]'
          )}>
            <Settings size={12} />
            <span>Settings</span>
            <button
              onClick={() => setCodingView('chat')}
              className="ml-1 p-0.5 rounded hover:bg-[var(--accent-soft)] text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
            >
              <X size={11} />
            </button>
          </div>
        )}
        {codingView === 'scheduled' && (
          <div className={cn(
            'h-full flex items-center gap-1.5 px-4 text-[12px] font-medium border-r border-[var(--coding-border)] shrink-0',
            'bg-[var(--coding-surface-raised)] text-[var(--text)] border-b-2 border-b-[var(--accent)]'
          )}>
            <Clock size={12} />
            <span>Scheduled</span>
            <button
              onClick={() => setCodingView('chat')}
              className="ml-1 p-0.5 rounded hover:bg-[var(--accent-soft)] text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
            >
              <X size={11} />
            </button>
          </div>
        )}
        {openSessions.map((s) => {
          const active = codingView === 'chat' && s.id === activeSessionId;
          return (
            <button
              key={s.id}
              onClick={() => { setActiveSession(s.id); setCodingView('chat'); }}
              className={cn(
                'h-full flex items-center gap-1.5 px-4 text-[12px] border-r border-[var(--coding-border)] shrink-0 max-w-[180px] transition-all app-no-drag',
                active
                  ? 'bg-[var(--coding-surface-raised)] text-[var(--text)] font-medium border-b-2 border-b-[var(--accent)]'
                  : 'text-[var(--text-faint)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-soft)]'
              )}
            >
              {active && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
              <span className="truncate">{s.title || 'Untitled Session'}</span>
              <span
                onClick={(e) => handleClose(e, s.id)}
                className="ml-0.5 p-0.5 rounded hover:bg-[var(--accent-soft)] text-[var(--text-faint)] hover:text-[var(--text-soft)] transition shrink-0"
              >
                <X size={11} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 app-drag" />
      <div className="flex items-center gap-1 pr-2 app-no-drag shrink-0">
        <button
          onClick={handleNew}
          className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition"
          title="新建会话"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
