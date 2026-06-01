import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pencil, Trash2, GripVertical, Plus, Check, X,
  ChevronDown, ChevronRight, ListOrdered, AlertCircle,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';

export function PlanCard({ plan, onExecute, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [editedSteps, setEditedSteps] = useState(plan?.steps || []);
  const [expanded, setExpanded] = useState(true);
  const [newStepText, setNewStepText] = useState('');

  const handleSave = useCallback(() => {
    onEdit?.(editedSteps);
    setEditing(false);
  }, [editedSteps, onEdit]);

  const handleAddStep = useCallback(() => {
    if (!newStepText.trim()) return;
    setEditedSteps(prev => [...prev, { id: Date.now(), content: newStepText.trim(), status: 'pending' }]);
    setNewStepText('');
  }, [newStepText]);

  const handleRemoveStep = useCallback((id) => {
    setEditedSteps(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleEditStep = useCallback((id, content) => {
    setEditedSteps(prev => prev.map(s => s.id === id ? { ...s, content } : s));
  }, []);

  const handleMoveStep = useCallback((fromIdx, direction) => {
    setEditedSteps(prev => {
      const next = [...prev];
      const toIdx = fromIdx + direction;
      if (toIdx < 0 || toIdx >= next.length) return prev;
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      return next;
    });
  }, []);

  if (!plan) return null;

  const steps = editing ? editedSteps : (plan.steps || []);
  const completedCount = steps.filter(s => s.status === 'completed').length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div className="my-3 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface-raised)] overflow-hidden shadow-sm">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--coding-border)]">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 text-[13px] font-medium text-[var(--text)]"
        >
          <ListOrdered size={15} className="text-[var(--accent)]" />
          <span>{plan.title || '执行计划'}</span>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <>
              <button
                onClick={() => { setEditing(true); setEditedSteps(plan.steps || []); }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition"
                title="编辑计划"
              >
                <Pencil size={11} />
                编辑
              </button>
              <button
                onClick={() => onExecute?.(plan)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition font-medium"
              >
                <Play size={11} />
                执行
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
              >
                <X size={11} />
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-green-600 text-white hover:bg-green-700 transition font-medium"
              >
                <Check size={11} />
                保存
              </button>
            </>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {!editing && steps.length > 0 && (
        <div className="h-1 bg-[var(--coding-border)]">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* 步骤列表 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-1">
              {steps.map((step, i) => (
                <div
                  key={step.id || i}
                  className={cn(
                    'flex items-start gap-2 px-2 py-1.5 rounded-lg text-[12px] group transition',
                    editing && 'hover:bg-[var(--accent-soft)]',
                    step.status === 'completed' && 'opacity-60'
                  )}
                >
                  {editing && (
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      <button
                        onClick={() => handleMoveStep(i, -1)}
                        className="text-[var(--text-faint)] hover:text-[var(--text-soft)] transition opacity-0 group-hover:opacity-100"
                        disabled={i === 0}
                      >
                        <ChevronDown size={10} className="rotate-180" />
                      </button>
                      <GripVertical size={10} className="text-[var(--text-faint)]" />
                      <button
                        onClick={() => handleMoveStep(i, 1)}
                        className="text-[var(--text-faint)] hover:text-[var(--text-soft)] transition opacity-0 group-hover:opacity-100"
                        disabled={i === steps.length - 1}
                      >
                        <ChevronDown size={10} />
                      </button>
                    </div>
                  )}
                  <span className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                    {step.status === 'completed' ? (
                      <Check size={12} className="text-green-500" />
                    ) : step.status === 'in_progress' ? (
                      <div className="w-3 h-3 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                    ) : (
                      <span className="text-[10px] font-mono text-[var(--text-faint)]">{i + 1}</span>
                    )}
                  </span>
                  {editing ? (
                    <input
                      type="text"
                      value={step.content}
                      onChange={(e) => handleEditStep(step.id || i, e.target.value)}
                      className="flex-1 bg-transparent border-b border-[var(--coding-border)] focus:border-[var(--accent)] outline-none py-0.5 text-[var(--text)]"
                    />
                  ) : (
                    <span className={cn(
                      'flex-1 text-[var(--text-soft)]',
                      step.status === 'completed' && 'line-through',
                      step.status === 'in_progress' && 'text-[var(--text)] font-medium'
                    )}>
                      {step.content}
                    </span>
                  )}
                  {editing && (
                    <button
                      onClick={() => handleRemoveStep(step.id || i)}
                      className="p-0.5 text-[var(--text-faint)] hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}

              {/* 添加步骤 */}
              {editing && (
                <div className="flex items-center gap-2 px-2 pt-2">
                  <Plus size={12} className="text-[var(--text-faint)]" />
                  <input
                    type="text"
                    value={newStepText}
                    onChange={(e) => setNewStepText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                    placeholder="添加新步骤…"
                    className="flex-1 text-[12px] bg-transparent border-b border-dashed border-[var(--coding-border)] focus:border-[var(--accent)] outline-none py-0.5 placeholder:text-[var(--text-faint)] text-[var(--text)]"
                  />
                </div>
              )}
            </div>

            {/* 警告提示 */}
            {plan.warnings && plan.warnings.length > 0 && (
              <div className="mx-3 mb-3 p-2 rounded-lg bg-amber-50 border border-amber-200">
                {plan.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                    <AlertCircle size={12} className="shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
