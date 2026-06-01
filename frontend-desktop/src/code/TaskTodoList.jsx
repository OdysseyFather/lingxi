import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp,
  ListTodo, Clock, X, SkipForward,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { ThemedProgressBar } from './themed-containers';

function flattenTasks(tasks) {
  const result = [];
  for (const task of tasks) {
    result.push(task);
    if (task.children) result.push(...flattenTasks(task.children));
  }
  return result;
}

function useElapsed(startedAt, active) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt || !active) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, active]);
  if (!startedAt || !active) return null;
  const secs = elapsed;
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

export function StickyTaskBar({ tasks }) {
  const [expanded, setExpanded] = useState(true);
  const startedAt = useStore((s) => s.codingStartedAt);
  const codingSendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);

  if (!tasks || tasks.length === 0) return null;

  const flatTasks = flattenTasks(tasks);
  const completed = flatTasks.filter(t => t.status === 'completed').length;
  const total = flatTasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const allDone = completed === total && total > 0;
  const current = flatTasks.find(t => t.status === 'in_progress');
  const elapsed = useElapsed(startedAt, !allDone);

  const handleSkip = useCallback(() => {
    if (current) {
      codingSendMessage({
        message: `跳过当前任务 "${current.content || current.id}"，继续下一个`,
        workingDir: codingProjectPath || '',
      });
    }
  }, [current, codingSendMessage, codingProjectPath]);

  const handleCancel = useCallback(() => {
    codingSendMessage({
      message: '取消所有剩余任务',
      workingDir: codingProjectPath || '',
    });
  }, [codingSendMessage, codingProjectPath]);

  return (
    <div className={cn(
      'shrink-0 border-b transition-colors',
      allDone ? 'border-green-500/30 bg-green-50' : 'border-[var(--coding-border)] bg-[var(--coding-surface)]'
    )}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2">
        <ListTodo size={14} className={allDone ? 'text-green-500' : 'text-[var(--accent)]'} />

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ThemedProgressBar progress={progress} className="w-28" />
          <span className="text-[12px] font-medium text-[var(--text-soft)] whitespace-nowrap">
            {completed}/{total}
          </span>
          {current && !allDone && (
            <>
              <span className="text-[var(--text-faint)] text-[10px]">|</span>
              <span className="text-[12px] text-[var(--accent)] truncate max-w-[260px]">
                {current.content || current.title || 'Running...'}
              </span>
            </>
          )}
          {allDone && (
            <>
              <span className="text-[var(--text-faint)] text-[10px]">|</span>
              <span className="text-[12px] text-green-600 font-medium">All done</span>
            </>
          )}
        </div>

        {elapsed && (
          <span className="text-[11px] text-[var(--text-faint)] flex items-center gap-1 shrink-0">
            <Clock size={9} />
            {elapsed}
          </span>
        )}

        {!allDone && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleSkip}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition"
              title="Skip current task"
            >
              <SkipForward size={10} />
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-red-400 hover:text-red-500 hover:bg-red-500/10 transition"
              title="Cancel all tasks"
            >
              <X size={10} />
            </button>
          </div>
        )}

        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1 text-[var(--text-faint)] hover:text-[var(--text-soft)] transition shrink-0"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Expanded task list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--coding-border)] max-h-56 overflow-y-auto scrollable">
              {tasks.map((task, i) => (
                <div
                  key={task.id || i}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-1.5 text-[12px] border-b border-[var(--coding-border)]/50 last:border-0 transition-colors',
                    task.status === 'in_progress' && 'bg-[var(--accent-soft)]'
                  )}
                >
                  <TaskStatusIcon status={task.status} />
                  <span className="text-[var(--text-faint)] font-mono text-[10px] w-4 text-right shrink-0">{i + 1}</span>
                  <span className={cn(
                    'truncate',
                    task.status === 'completed' && 'text-[var(--text-faint)] line-through',
                    task.status === 'in_progress' && 'text-[var(--text)] font-medium',
                    task.status === 'pending' && 'text-[var(--text-soft)]',
                    task.status === 'cancelled' && 'text-[var(--text-faint)] line-through'
                  )}>
                    {task.content || task.title}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskStatusIcon({ status }) {
  switch (status) {
    case 'completed': return <CheckCircle2 size={13} className="text-green-500 shrink-0" />;
    case 'in_progress': return <Loader2 size={13} className="text-[var(--accent)] animate-spin shrink-0" />;
    case 'cancelled': return <X size={13} className="text-[var(--text-faint)] shrink-0" />;
    default: return <Circle size={13} className="text-[var(--text-faint)] shrink-0" />;
  }
}
