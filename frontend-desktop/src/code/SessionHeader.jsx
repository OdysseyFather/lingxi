import { FolderOpen } from 'lucide-react';
import { useStore } from '../state/useStore';

export function SessionHeader({ projectPath }) {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const messages = useStore((s) => s.codingMessages);
  const isStreaming = useStore((s) => s.codingIsStreaming);
  const agentState = useStore((s) => s.codingAgentState);

  const session = sessions.find((s) => s.id === activeSessionId);
  if (!session) return null;

  const msgCount = messages.length;
  const updated = session.updated_at || session.created_at;
  const timeAgo = updated ? formatTimeAgo(updated) : '';

  const stateLabel = {
    THINKING: 'thinking',
    CHECKING: 'reading files',
    EXECUTING: 'executing',
    WAITING_FOR_USER: 'waiting for input',
    WAITING_FOR_BATCH_ANSWER: 'waiting for answers',
    DONE: 'done',
  }[agentState] || '';

  return (
    <div className="px-6 pt-6 pb-2">
      <h1 className="text-xl font-bold text-[var(--text)]">{session.title || 'Untitled Session'}</h1>
      <div className="flex items-center gap-2 mt-1 text-[12px] text-[var(--text-faint)] flex-wrap">
        {isStreaming && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-600 font-medium">{stateLabel || 'active'}</span>
          </span>
        )}
        {isStreaming && <span className="text-[var(--coding-border)]">·</span>}
        {projectPath && (
          <>
            <span className="flex items-center gap-1 text-[var(--text-faint)]">
              <FolderOpen size={10} />
              <span className="truncate max-w-[200px]">{projectPath.split('/').pop()}</span>
            </span>
            <span className="text-[var(--coding-border)]">·</span>
          </>
        )}
        {timeAgo && <span>last updated {timeAgo}</span>}
        {msgCount > 0 && (
          <>
            <span className="text-[var(--coding-border)]">·</span>
            <span>{msgCount} messages</span>
          </>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
