import { useState, useCallback, useEffect } from 'react';
import { Search, RefreshCw, X, FileText, ChevronDown, Plus, Minus } from 'lucide-react';
import { cn } from '../ui/cn';

const STATUS_COLORS = {
  M: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'M' },
  U: { bg: 'bg-green-100', text: 'text-green-700', label: 'U' },
  D: { bg: 'bg-red-100', text: 'text-red-700', label: 'D' },
  A: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'A' },
};

export function WorkspaceChanges({ changes, onClose, onSelectFile, onRefresh }) {
  const [filter, setFilter] = useState('');
  const [filterType, setFilterType] = useState('all');

  const filtered = (changes || []).filter(c => {
    if (filter && !c.path.toLowerCase().includes(filter.toLowerCase())) return false;
    if (filterType !== 'all' && c.status !== filterType) return false;
    return true;
  });

  return (
    <div className="h-full bg-[var(--coding-surface-raised)] flex flex-col border-r border-[var(--coding-border)] shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--coding-border)]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-[var(--text)]">已更改文件</span>
          <button
            onClick={() => {}}
            className="text-[12px] text-[var(--text-faint)] hover:text-[var(--text-soft)] transition flex items-center gap-1"
          >
            <ChevronDown size={11} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button onClick={onRefresh} className="p-1.5 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="刷新">
              <RefreshCw size={13} />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="关闭">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜选文件..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-[var(--coding-surface)] border border-[var(--coding-border)] text-[12px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollable">
        {filtered.length === 0 && (
          <div className="text-center text-[12px] text-[var(--text-faint)] py-8">暂无文件变更</div>
        )}
        {filtered.map((change) => {
          const statusInfo = STATUS_COLORS[change.status] || STATUS_COLORS.M;
          return (
            <button
              key={change.path}
              onClick={() => onSelectFile?.(change)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--coding-surface)] transition border-b border-[var(--coding-border)] last:border-0"
            >
              <span className={cn('w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0', statusInfo.bg, statusInfo.text)}>
                {statusInfo.label}
              </span>
              <span className="flex-1 text-[13px] text-[var(--text)] truncate font-mono">
                {change.path}
              </span>
              <div className="flex items-center gap-1 shrink-0 text-[11px] font-mono">
                {change.added > 0 && (
                  <span className="text-green-600">+{change.added}</span>
                )}
                {change.removed > 0 && (
                  <span className="text-red-500">-{change.removed}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
