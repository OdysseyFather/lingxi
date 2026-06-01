import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ListOrdered, Brain, ChevronDown, Check } from 'lucide-react';
import { cn } from '../ui/cn';

const MODES = [
  { id: 'normal', label: 'Normal', icon: MessageSquare, desc: '直接执行指令', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'plan', label: 'Plan', icon: ListOrdered, desc: '先制定计划，确认后再执行', color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'think', label: 'Think', icon: Brain, desc: '深度思考，给出更周全的方案', color: 'text-purple-600', bg: 'bg-purple-50' },
];

export function ModeSwitcher({ value = 'normal', onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = MODES.find(m => m.id === value) || MODES[0];

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all',
          'border border-[var(--coding-border)] hover:border-[var(--accent)]',
          current.bg, current.color
        )}
      >
        <current.icon size={13} />
        <span>{current.label}</span>
        <ChevronDown size={10} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-[var(--coding-border)] bg-white shadow-xl z-50 overflow-hidden"
          >
            <div className="p-1.5">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => { onChange(mode.id); setOpen(false); }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all',
                    value === mode.id
                      ? 'bg-[var(--accent-soft)]'
                      : 'hover:bg-gray-50'
                  )}
                >
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', mode.bg)}>
                    <mode.icon size={14} className={mode.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-[var(--text)]">{mode.label}</div>
                    <div className="text-[10px] text-[var(--text-faint)] leading-tight">{mode.desc}</div>
                  </div>
                  {value === mode.id && (
                    <Check size={14} className="text-[var(--accent)] shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
