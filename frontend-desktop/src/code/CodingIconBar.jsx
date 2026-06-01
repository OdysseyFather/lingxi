import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { Plus, Clock, Settings, ArrowLeftRight, FileEdit, FolderTree, Terminal } from 'lucide-react';

export function CodingIconBar() {
  const codingView = useStore((s) => s.codingView);
  const setCodingView = useStore((s) => s.setCodingView);
  const setAppMode = useStore((s) => s.setAppMode);
  const createSession = useStore((s) => s.createSession);
  const codingChangesOpen = useStore((s) => s.codingChangesOpen);
  const toggleCodingChanges = useStore((s) => s.toggleCodingChanges);
  const codingFileTreeOpen = useStore((s) => s.codingFileTreeOpen);
  const toggleCodingFileTree = useStore((s) => s.toggleCodingFileTree);
  const codingTerminalOpen = useStore((s) => s.codingTerminalOpen);
  const toggleCodingTerminal = useStore((s) => s.toggleCodingTerminal);

  const topBtns = [
    {
      id: 'logo',
      icon: () => (
        <span className="text-[var(--accent)] font-bold text-base font-mono leading-none flex items-center">&gt;<span className="opacity-60">;</span>]</span>
      ),
      action: () => setCodingView('chat'),
      title: '对话',
      active: codingView === 'chat',
    },
    { id: 'new', icon: Plus, action: () => createSession('编程会话'), title: '新建会话' },
    { id: 'scheduled', icon: Clock, action: () => setCodingView('scheduled'), title: '定时任务', active: codingView === 'scheduled' },
  ];

  return (
    <div className="w-10 bg-[var(--coding-surface)] border-r border-[var(--coding-border)] flex flex-col items-center py-2 gap-1 shrink-0">
      {topBtns.map((btn) => {
        const Icon = btn.icon;
        return (
          <button
            key={btn.id}
            onClick={btn.action}
            title={btn.title}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
              btn.active
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
            )}
          >
            <Icon size={16} />
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={toggleCodingFileTree}
        title="文件树"
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
          codingFileTreeOpen
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
        )}
      >
        <FolderTree size={15} />
      </button>
      <button
        onClick={toggleCodingTerminal}
        title="终端"
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
          codingTerminalOpen
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
        )}
      >
        <Terminal size={15} />
      </button>
      <button
        onClick={toggleCodingChanges}
        title="已更改文件"
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
          codingChangesOpen
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
        )}
      >
        <FileEdit size={15} />
      </button>
      <button
        onClick={() => setCodingView('settings')}
        title="设置"
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
          codingView === 'settings'
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
        )}
      >
        <Settings size={15} />
      </button>
      <button
        onClick={() => setAppMode('main')}
        title="切换到灵犀主模式"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition-all"
      >
        <ArrowLeftRight size={14} />
      </button>
    </div>
  );
}
