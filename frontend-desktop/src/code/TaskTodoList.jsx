import { useState, useCallback, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp,
  ListTodo, Bot, Clock, X, SkipForward, ChevronRight,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { ThemedProgressBar } from './themed-containers';

const SPRING = { type: 'spring', damping: 25, stiffness: 300 };

export function TaskTodoList({ tasks, title, collapsed: initialCollapsed, onTaskClick }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? false);
  const [, startTransition] = useTransition();
  const codingSendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);

  if (!tasks || tasks.length === 0) return null;

  const flatTasks = flattenTasks(tasks);
  const completed = flatTasks.filter(t => t.status === 'completed').length;
  const total = flatTasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const allDone = completed === total && total > 0;
  const startedAt = useStore.getState().codingStartedAt;
  const elapsed = startedAt ? formatElapsed(Date.now() - startedAt) : null;

  const handleToggle = useCallback((taskId, currentStatus) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    startTransition(() => {
      codingSendMessage({
        message: `请将任务 "${taskId}" 标记为 ${newStatus === 'completed' ? '完成' : '待办'}`,
        workingDir: codingProjectPath || '',
      });
    });
  }, [codingSendMessage, codingProjectPath, startTransition]);

  return (
    <motion.div
      layout
      className={cn(
        'my-4 rounded-xl border overflow-hidden transition-colors',
        allDone ? 'border-green-500/30 bg-green-500/5' : 'border-[var(--coding-border)] bg-[var(--coding-surface-raised)]'
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--accent-soft)] transition"
      >
        <ListTodo size={16} className={allDone ? 'text-green-500' : 'text-[var(--accent)]'} />
        <span className="text-[14px] font-bold text-[var(--text)]">{title || 'Tasks'}</span>

        <div className="flex items-center gap-2 ml-2 flex-1">
          <ThemedProgressBar progress={progress} className="w-24" />
          <span className="text-[12px] text-[var(--text-faint)]">{completed}/{total}</span>
        </div>

        {elapsed && !allDone && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--text-faint)]">
            <Clock size={10} />
            {elapsed}
          </span>
        )}

        {collapsed ? <ChevronDown size={14} className="text-[var(--text-faint)]" /> : <ChevronUp size={14} className="text-[var(--text-faint)]" />}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-[var(--coding-border)] overflow-hidden"
          >
            {tasks.map((task, i) => (
              <TaskItem
                key={task.id || i}
                task={task}
                index={i}
                depth={0}
                onToggle={handleToggle}
                onClick={onTaskClick}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TaskItem({ task, index, depth, onToggle, onClick }) {
  const [subCollapsed, setSubCollapsed] = useState(false);
  const hasChildren = task.children && task.children.length > 0;

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'flex items-start gap-3 px-5 py-3 border-b border-[var(--coding-border)] last:border-0 transition group',
          task.status === 'in_progress' && 'bg-[var(--accent-soft)]',
          depth > 0 && 'bg-[var(--coding-surface)]/50',
          onClick && 'cursor-pointer hover:bg-[var(--accent-soft)]'
        )}
        style={{ paddingLeft: `${20 + depth * 20}px` }}
        onClick={() => onClick?.(task)}
      >
        <button
          className="mt-0.5 shrink-0 hover:scale-110 transition"
          onClick={(e) => {
            e.stopPropagation();
            if (task.status !== 'in_progress') {
              onToggle?.(task.id, task.status);
            }
          }}
        >
          {task.status === 'completed' && <CheckCircle2 size={16} className="text-green-500" />}
          {task.status === 'in_progress' && <Loader2 size={16} className="text-[var(--accent)] animate-spin" />}
          {task.status === 'pending' && <Circle size={16} className="text-[var(--text-faint)] group-hover:text-[var(--text-soft)]" />}
          {task.status === 'cancelled' && <X size={16} className="text-[var(--text-faint)]" />}
        </button>

        {hasChildren && (
          <button
            className="mt-0.5 shrink-0 text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
            onClick={(e) => { e.stopPropagation(); setSubCollapsed(v => !v); }}
          >
            {subCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-faint)] font-mono">#{index + 1}</span>
            <span className={cn(
              'text-[13px] transition-all duration-300',
              task.status === 'completed' ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text)]',
              task.status === 'cancelled' && 'line-through text-[var(--text-faint)]'
            )}>
              {task.content || task.title || task.description}
            </span>
          </div>
          {task.agent && (
            <div className="flex items-center gap-1 mt-1 text-[11px] text-[var(--text-faint)]">
              <Bot size={10} />
              <span>{task.agent}</span>
            </div>
          )}
          {task.elapsed && (
            <div className="text-[11px] text-[var(--text-faint)] mt-0.5">
              {task.elapsed}
              {task.tokens && <span className="ml-2">{task.tokens.toLocaleString()} tokens</span>}
            </div>
          )}
        </div>
      </motion.div>

      {hasChildren && !subCollapsed && (
        task.children.map((child, ci) => (
          <TaskItem
            key={child.id || ci}
            task={child}
            index={ci}
            depth={depth + 1}
            onToggle={onToggle}
            onClick={onClick}
          />
        ))
      )}
    </>
  );
}

function flattenTasks(tasks) {
  const result = [];
  for (const task of tasks) {
    result.push(task);
    if (task.children) result.push(...flattenTasks(task.children));
  }
  return result;
}

function formatElapsed(ms) {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remaining = secs % 60;
  return `${mins}m ${remaining}s`;
}

export function StickyTaskBar({ tasks }) {
  const [expanded, setExpanded] = useState(true);
  const startedAt = useStore.getState().codingStartedAt;
  const codingSendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);

  if (!tasks || tasks.length === 0) return null;

  const flatTasks = flattenTasks(tasks);
  const completed = flatTasks.filter(t => t.status === 'completed').length;
  const total = flatTasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const allDone = completed === total && total > 0;
  const current = flatTasks.find(t => t.status === 'in_progress');
  const elapsed = startedAt ? formatElapsed(Date.now() - startedAt) : null;

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
      'shrink-0 border-b transition-colors backdrop-blur-sm',
      allDone ? 'border-green-500/30 bg-green-500/5' : 'border-[var(--coding-border)] bg-[var(--coding-surface)]'
    )}>
      <div className="flex items-center gap-3 px-5 py-2.5">
        <ListTodo size={14} className={allDone ? 'text-green-500' : 'text-[var(--accent)]'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[var(--text)]">
              {allDone ? 'All tasks completed' : (current?.content || 'Running...')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ThemedProgressBar progress={progress} className="w-32" />
            <span className="text-[11px] text-[var(--text-faint)]">{completed}/{total}</span>
            {elapsed && !allDone && (
              <span className="text-[11px] text-[var(--text-faint)] flex items-center gap-1">
                <Clock size={9} />
                {elapsed}
              </span>
            )}
          </div>
        </div>

        {!allDone && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleSkip}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition"
              title="Skip current task"
            >
              <SkipForward size={11} />
              Skip
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-red-400 hover:text-red-500 hover:bg-red-500/10 transition"
              title="Cancel all tasks"
            >
              <X size={11} />
              Cancel
            </button>
          </div>
        )}

        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1 text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            className="border-t border-[var(--coding-border)] max-h-48 overflow-auto"
          >
            {tasks.map((task, i) => (
              <div
                key={task.id || i}
                className={cn(
                  'flex items-center gap-3 px-5 py-2 text-[12px] border-b border-[var(--coding-border)] last:border-0',
                  task.status === 'in_progress' && 'bg-[var(--accent-soft)]'
                )}
              >
                {task.status === 'completed' && <CheckCircle2 size={13} className="text-green-500 shrink-0" />}
                {task.status === 'in_progress' && <Loader2 size={13} className="text-[var(--accent)] animate-spin shrink-0" />}
                {task.status === 'pending' && <Circle size={13} className="text-[var(--text-faint)] shrink-0" />}
                {task.status === 'cancelled' && <X size={13} className="text-[var(--text-faint)] shrink-0" />}
                <span className="text-[var(--text-faint)] font-mono">#{i + 1}</span>
                <span className={cn(
                  task.status === 'completed' ? 'text-[var(--text-faint)]' : 'text-[var(--text-soft)]',
                  task.status === 'cancelled' && 'text-[var(--text-faint)] line-through'
                )}>
                  {task.content || task.title}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
