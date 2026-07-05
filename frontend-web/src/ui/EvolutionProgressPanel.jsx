import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dna, Loader2, Check, AlertCircle, Brain, BookOpen, Wrench, X } from 'lucide-react';
import { useStore } from '../state/useStore';
import { cn } from './cn';

const PHASE_META = {
  fetching_context: { label: '准备上下文', icon: Dna, progress: 20 },
  calling_llm: { label: '分析对话', icon: Loader2, progress: 40 },
  parsing_result: { label: '解析结果', icon: Dna, progress: 60 },
  executing: { label: '执行进化', icon: Brain, progress: 80 },
  executing_action: { label: '写入中', icon: BookOpen, progress: 85 },
  done: { label: '完成', icon: Check, progress: 100 },
  error: { label: '失败', icon: AlertCircle, progress: 100 },
};

export default function EvolutionProgressPanel() {
  const progress = useStore((s) => s.evolutionProgress);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (progress) setDismissed(false);
  }, [progress?.phase, progress?.ts]);

  if (!progress || dismissed) return null;

  const meta = PHASE_META[progress.phase] || PHASE_META.fetching_context;
  const Icon = meta.icon;
  const isDone = progress.phase === 'done';
  const isError = progress.phase === 'error';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 w-80"
      >
        <div className={cn(
          'rounded-2xl border shadow-xl backdrop-blur-md overflow-hidden',
          'bg-[color:var(--bg-elev)]/95 border-[color:var(--line)]',
          isError && 'border-red-500/30',
          isDone && 'border-emerald-500/30'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-6 h-6 rounded-lg flex items-center justify-center',
                isDone ? 'bg-emerald-500/10 text-emerald-500' :
                isError ? 'bg-red-500/10 text-red-500' :
                'bg-purple-500/10 text-purple-500'
              )}>
                <Dna size={14} />
              </div>
              <span className="text-xs font-semibold text-[color:var(--text)]">自我进化</span>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-[color:var(--text-faint)] hover:text-[color:var(--text)] transition p-1 rounded-md hover:bg-[color:var(--bg-soft)]"
            >
              <X size={12} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-4 py-1">
            <div className="h-1 rounded-full bg-[color:var(--bg-soft)] overflow-hidden">
              <motion.div
                className={cn(
                  'h-full rounded-full',
                  isDone ? 'bg-emerald-500' : isError ? 'bg-red-500' : 'bg-purple-500'
                )}
                initial={{ width: '0%' }}
                animate={{ width: `${meta.progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Status */}
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Icon size={13} className={cn(
                isDone ? 'text-emerald-500' : isError ? 'text-red-500' : 'text-purple-500',
                !isDone && !isError && 'animate-spin'
              )} />
              <span className="text-xs text-[color:var(--text-soft)]">{meta.label}</span>
              {progress.step && progress.total_steps && (
                <span className="text-[10px] text-[color:var(--text-faint)] ml-auto">
                  {progress.step}/{progress.total_steps}
                </span>
              )}
            </div>
            {progress.message && (
              <p className="text-[11px] text-[color:var(--text-faint)] mt-1.5 line-clamp-2 leading-relaxed">
                {progress.message}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
