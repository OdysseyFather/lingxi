import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp,
  ListTodo, Clock, X, SkipForward, Sparkles,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { StatusBadge, ThemedProgressBar } from './themed-containers';

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
  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  return `${mins}m ${elapsed % 60}s`;
}

function mapTaskStatus(status) {
  switch (status) {
    case 'completed': return 'done';
    case 'in_progress': return 'running';
    case 'cancelled': return 'error';
    default: return 'pending';
  }
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
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={cn(
        'shrink-0 border-b backdrop-blur-md transition-all duration-300',
        allDone
          ? 'border-emerald-500/20 bg-emerald-50/80'
          : 'border-[var(--coding-border)]/60 bg-[var(--coding-surface)]/90'
      )}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <motion.div
          animate={allDone ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {allDone
            ? <Sparkles size={15} className="text-emerald-500" />
            : <ListTodo size={15} className="text-[var(--accent)]" />
          }
        </motion.div>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <ThemedProgressBar
            progress={progress}
            variant={allDone ? 'success' : 'default'}
            className="w-24"
          />
          <span className="text-[12px] font-semibold text-[var(--text-soft)] whitespace-nowrap font-mono">
            {completed}/{total}
          </span>
          {current && !allDone && (
            <>
              <span className="text-[var(--coding-border)] text-[10px]">|</span>
              <span className="text-[12px] text-[var(--accent)] truncate max-w-[240px] font-medium">
                {current.content || current.title || 'Running...'}
              </span>
            </>
          )}
          {allDone && (
            <>
              <span className="text-[var(--coding-border)] text-[10px]">|</span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[12px] text-emerald-600 font-semibold"
              >
                All tasks complete
              </motion.span>
            </>
          )}
        </div>

        {elapsed && (
          <span className="text-[11px] text-[var(--text-faint)] flex items-center gap-1 shrink-0 font-mono">
            <Clock size={9} />
            {elapsed}
          </span>
        )}

        {!allDone && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleSkip}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition-all active:scale-95"
              title="Skip current task"
            >
              <SkipForward size={10} />
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
              title="Cancel all tasks"
            >
              <X size={10} />
            </button>
          </div>
        )}

        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1 text-[var(--text-faint)] hover:text-[var(--text-soft)] transition shrink-0 rounded-md hover:bg-[var(--accent-soft)]"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--coding-border)]/50 max-h-56 overflow-y-auto scrollable">
              <AnimatePresence mode="popLayout">
                {tasks.map((task, i) => (
                  <TaskRow key={task.id || `task-${i}`} task={task} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TaskRow({ task, index }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className={cn(
        'flex items-center gap-2.5 px-4 py-2 text-[12px] border-b border-[var(--coding-border)]/30 last:border-0 transition-all duration-200',
        task.status === 'in_progress' && 'bg-[var(--accent-soft)]/60',
        'hover:bg-[var(--accent-soft)]/30'
      )}
    >
      <StatusBadge status={mapTaskStatus(task.status)} size={14} />
      <span className="text-[var(--text-faint)] font-mono text-[10px] w-5 text-right shrink-0">
        {index + 1}
      </span>
      <span className={cn(
        'truncate flex-1 transition-all duration-200',
        task.status === 'completed' && 'text-[var(--text-faint)] line-through decoration-[var(--text-faint)]/50',
        task.status === 'in_progress' && 'text-[var(--text)] font-medium',
        task.status === 'pending' && 'text-[var(--text-soft)]',
        task.status === 'cancelled' && 'text-[var(--text-faint)] line-through'
      )}>
        {task.content || task.title}
      </span>
    </motion.div>
  );
}

export function TaskTodoList({ embedded }) {
  const tasks = useStore((s) => s.codingTasks);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mb-3">
          <ListTodo size={22} className="text-[var(--text-faint)]" />
        </div>
        <p className="text-[12px] text-[var(--text-faint)] leading-relaxed">
          Tasks will appear here as the agent<br />works through your request
        </p>
      </div>
    );
  }

  const flatTasks = flattenTasks(tasks);
  const completed = flatTasks.filter(t => t.status === 'completed').length;
  const total = flatTasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="px-3 py-3 space-y-2">
      <div className="flex items-center justify-between text-[12px] text-[var(--text-soft)]">
        <span className="font-semibold">Task Progress</span>
        <span className="font-mono text-[11px]">{completed}/{total}</span>
      </div>
      <ThemedProgressBar progress={progress} />
      <div className="space-y-0.5 mt-3">
        <AnimatePresence mode="popLayout">
          {flatTasks.map((task, i) => (
            <motion.div
              key={task.id || `t-${i}`}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 text-[12px] py-1.5 px-1 rounded-md hover:bg-[var(--accent-soft)]/30 transition-colors"
            >
              <StatusBadge status={mapTaskStatus(task.status)} size={13} />
              <span className={cn(
                'truncate flex-1',
                task.status === 'completed' && 'text-[var(--text-faint)] line-through',
                task.status === 'in_progress' && 'text-[var(--text)] font-medium',
                task.status === 'pending' && 'text-[var(--text-soft)]',
                task.status === 'cancelled' && 'text-[var(--text-faint)] line-through'
              )}>
                {task.content || task.title}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
