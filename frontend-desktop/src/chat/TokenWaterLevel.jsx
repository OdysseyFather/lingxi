import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '../ui/cn';
import { api } from '../api/client';
import { useStore } from '../state/useStore';

export default function TokenWaterLevel() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const isStreaming = useStore((s) => s.isStreaming);
  const messages = useStore((s) => s.messages);
  const [stats, setStats] = useState(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (!activeSessionId) { setStats(null); return; }
    const load = () => {
      api.getSessionTokenStats(activeSessionId).then(setStats).catch(() => {});
    };
    load();
  }, [activeSessionId, messages.length, isStreaming]);

  if (!stats || stats.context_tokens === 0) return null;

  const level = Math.min(stats.water_level, 1);
  const percentage = Math.round(level * 100);
  const isHigh = level >= 0.7;
  const isCritical = level >= 0.9;

  const contextK = Math.round(stats.context_tokens / 1000);
  const windowK = Math.round(stats.context_window / 1000);

  const handleSummarize = async () => {
    if (summarizing || !activeSessionId) return;
    setSummarizing(true);
    try {
      await api.summarizeSession(activeSessionId);
      const updated = await api.getSessionTokenStats(activeSessionId);
      setStats(updated);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 text-[11px] rounded-lg transition-all',
      isCritical ? 'bg-red-50 text-red-700 border border-red-200' :
      isHigh ? 'bg-amber-50 text-amber-700 border border-amber-200' :
      'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] border border-transparent'
    )}>
      {isCritical ? <AlertTriangle size={12} /> : <Zap size={12} />}

      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="font-medium shrink-0">{contextK}K / {windowK}K</span>
        <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden min-w-[40px] max-w-[80px]">
          <motion.div
            className={cn(
              'h-full rounded-full',
              isCritical ? 'bg-red-500' : isHigh ? 'bg-amber-500' : 'bg-blue-400'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        <span className="tabular-nums">{percentage}%</span>
      </div>

      {isHigh && !stats.has_summary && (
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          className={cn(
            'shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition',
            isCritical ? 'bg-red-100 hover:bg-red-200 text-red-800' : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
          )}
        >
          <Sparkles size={10} />
          {summarizing ? '压缩中…' : '压缩上下文'}
        </button>
      )}
    </div>
  );
}
