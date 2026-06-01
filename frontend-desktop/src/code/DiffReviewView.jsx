import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, ChevronDown, ChevronRight, FileText, Plus, Minus,
  CheckCheck, XCircle, Copy, ExternalLink,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { api } from '../api/client';

function parseDiffHunks(diffText) {
  if (!diffText) return [];
  const lines = diffText.split('\n');
  const hunks = [];
  let currentHunk = null;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk);
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)/);
      currentHunk = {
        header: line,
        oldStart: match ? parseInt(match[1]) : 0,
        newStart: match ? parseInt(match[2]) : 0,
        context: match ? match[3].trim() : '',
        lines: [],
        additions: 0,
        deletions: 0,
      };
    } else if (currentHunk) {
      currentHunk.lines.push(line);
      if (line.startsWith('+') && !line.startsWith('+++')) currentHunk.additions++;
      if (line.startsWith('-') && !line.startsWith('---')) currentHunk.deletions++;
    }
  }
  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

export function DiffReviewView({ filePath, diffText, onClose, onAcceptAll, onRejectAll }) {
  const hunks = useMemo(() => parseDiffHunks(diffText), [diffText]);
  const [hunkStates, setHunkStates] = useState(() =>
    hunks.reduce((acc, _, i) => ({ ...acc, [i]: 'pending' }), {})
  );
  const [expandedHunks, setExpandedHunks] = useState(() =>
    hunks.reduce((acc, _, i) => ({ ...acc, [i]: true }), {})
  );

  const fileName = filePath?.split('/').pop() || '未知文件';
  const totalAdditions = hunks.reduce((s, h) => s + h.additions, 0);
  const totalDeletions = hunks.reduce((s, h) => s + h.deletions, 0);

  const acceptedCount = Object.values(hunkStates).filter(s => s === 'accepted').length;
  const rejectedCount = Object.values(hunkStates).filter(s => s === 'rejected').length;
  const pendingCount = Object.values(hunkStates).filter(s => s === 'pending').length;

  const handleHunkAction = useCallback((index, action) => {
    setHunkStates(prev => ({ ...prev, [index]: action }));
  }, []);

  const handleAcceptAll = useCallback(() => {
    const newStates = {};
    hunks.forEach((_, i) => { newStates[i] = 'accepted'; });
    setHunkStates(newStates);
    onAcceptAll?.();
  }, [hunks, onAcceptAll]);

  const handleRejectAll = useCallback(() => {
    const newStates = {};
    hunks.forEach((_, i) => { newStates[i] = 'rejected'; });
    setHunkStates(newStates);
    onRejectAll?.();
  }, [hunks, onRejectAll]);

  const toggleHunk = useCallback((index) => {
    setExpandedHunks(prev => ({ ...prev, [index]: !prev[index] }));
  }, []);

  if (!diffText) {
    return (
      <div className="h-full flex items-center justify-center text-[13px] text-[var(--text-faint)]">
        选择一个文件查看变更
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--coding-surface,#faf8f5)]">
      {/* 文件标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--coding-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-[var(--accent)] shrink-0" />
          <span className="text-[13px] font-medium text-[var(--text)] truncate" title={filePath}>
            {fileName}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] shrink-0">
            <span className="text-green-600">+{totalAdditions}</span>
            <span className="text-red-500">-{totalDeletions}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleAcceptAll}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition"
            title="全部接受"
          >
            <CheckCheck size={12} />
            全部接受
          </button>
          <button
            onClick={handleRejectAll}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition"
            title="全部拒绝"
          >
            <XCircle size={12} />
            全部拒绝
          </button>
        </div>
      </div>

      {/* 进度概览 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--coding-border)] text-[11px]">
        <span className="text-[var(--text-faint)]">{hunks.length} 个变更块</span>
        {acceptedCount > 0 && <span className="text-green-600">{acceptedCount} 已接受</span>}
        {rejectedCount > 0 && <span className="text-red-500">{rejectedCount} 已拒绝</span>}
        {pendingCount > 0 && <span className="text-[var(--text-faint)]">{pendingCount} 待审</span>}
      </div>

      {/* Hunk 列表 */}
      <div className="flex-1 overflow-y-auto scrollable">
        {hunks.map((hunk, i) => (
          <div
            key={i}
            className={cn(
              'border-b border-[var(--coding-border)]',
              hunkStates[i] === 'accepted' && 'bg-green-50/30',
              hunkStates[i] === 'rejected' && 'bg-red-50/30 opacity-60'
            )}
          >
            {/* Hunk 头部 */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--coding-surface-raised)]">
              <button
                onClick={() => toggleHunk(i)}
                className="text-[var(--text-faint)] hover:text-[var(--text-soft)] transition p-0.5"
              >
                {expandedHunks[i] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <span className="text-[10px] font-mono text-[var(--text-faint)] flex-1 truncate">
                {hunk.context || `@@ ${hunk.oldStart} → ${hunk.newStart}`}
              </span>
              <span className="text-[10px] text-green-600">+{hunk.additions}</span>
              <span className="text-[10px] text-red-500">-{hunk.deletions}</span>
              {hunkStates[i] === 'pending' && (
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={() => handleHunkAction(i, 'accepted')}
                    className="p-1 rounded text-green-600 hover:bg-green-100 transition"
                    title="接受此块"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => handleHunkAction(i, 'rejected')}
                    className="p-1 rounded text-red-500 hover:bg-red-100 transition"
                    title="拒绝此块"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {hunkStates[i] === 'accepted' && (
                <button
                  onClick={() => handleHunkAction(i, 'pending')}
                  className="text-[10px] text-green-600 hover:underline"
                >
                  已接受
                </button>
              )}
              {hunkStates[i] === 'rejected' && (
                <button
                  onClick={() => handleHunkAction(i, 'pending')}
                  className="text-[10px] text-red-500 hover:underline"
                >
                  已拒绝
                </button>
              )}
            </div>

            {/* Hunk 代码行 */}
            <AnimatePresence>
              {expandedHunks[i] && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <pre className="text-[11px] font-mono leading-[18px] overflow-x-auto">
                    {hunk.lines.map((line, li) => {
                      const isAdd = line.startsWith('+') && !line.startsWith('+++');
                      const isDel = line.startsWith('-') && !line.startsWith('---');
                      return (
                        <div
                          key={li}
                          className={cn(
                            'px-3 py-0',
                            isAdd && 'bg-green-50 text-green-800',
                            isDel && 'bg-red-50 text-red-700',
                            !isAdd && !isDel && 'text-[var(--text-soft)]'
                          )}
                        >
                          <span className="inline-block w-4 text-[var(--text-faint)] select-none mr-2">
                            {isAdd ? '+' : isDel ? '-' : ' '}
                          </span>
                          {line.slice(1) || ' '}
                        </div>
                      );
                    })}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
