import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, AlertTriangle } from 'lucide-react';
import { cn } from '../ui/cn';
import { api } from '../api/client';
import { useStore } from '../state/useStore';

export default function TokenWaterLevel() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const isStreaming = useStore((s) => s.isStreaming);
  const messages = useStore((s) => s.messages);
  const [stats, setStats] = useState(null);

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
    </div>
  );
}
