import { forwardRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle, Shield } from 'lucide-react';
import { cn } from '../ui/cn';

export const ThemedBox = forwardRef(({ className, variant = 'base', blur = false, children, ...props }, ref) => {
  const variants = {
    base: 'bg-[var(--coding-surface)] border-[var(--coding-border)]',
    raised: 'bg-[var(--coding-surface-raised)] border-[var(--coding-border)] shadow-sm',
    overlay: 'bg-[var(--coding-surface-raised)]/90 border-[var(--coding-border)] shadow-2xl',
    glass: 'bg-[var(--coding-surface-raised)]/70 border-[var(--coding-border)]/50 shadow-lg',
  };
  return (
    <div
      ref={ref}
      className={cn(
        'border rounded-xl',
        variants[variant],
        blur && 'backdrop-blur-xl',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
ThemedBox.displayName = 'ThemedBox';

export const GlassCard = forwardRef(({ className, children, glow, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl border border-[var(--coding-border)]/60 bg-[var(--coding-surface-raised)]/70 backdrop-blur-xl shadow-sm',
      'transition-all duration-200',
      'hover:shadow-md hover:border-[var(--coding-border)]',
      glow && 'ring-1 ring-[var(--accent)]/20',
      className
    )}
    {...props}
  >
    {children}
  </div>
));
GlassCard.displayName = 'GlassCard';

export const ThemedCard = forwardRef(({ className, active, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl border bg-[var(--coding-surface-raised)] transition-all duration-200',
      active ? 'border-[var(--coding-border-active)] shadow-sm' : 'border-[var(--coding-border)]',
      className
    )}
    {...props}
  >
    {children}
  </div>
));
ThemedCard.displayName = 'ThemedCard';

export function ThemedBorder({ className, variant = 'subtle', children, ...props }) {
  const variants = {
    subtle: 'border-[var(--coding-border)]',
    active: 'border-[var(--coding-border-active)]',
    strong: 'border-[var(--line-strong)]',
  };
  return (
    <div className={cn('border', variants[variant], className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Animated status badge with smooth icon transitions.
 * States: pending | running | done | error | warning
 */
export function StatusBadge({ status = 'pending', size = 14, showLabel = false, className }) {
  const configs = {
    pending: { icon: Circle, color: 'text-[var(--text-faint)]', bg: 'bg-[var(--coding-border)]/30', label: 'Pending' },
    running: { icon: Loader2, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent)]/10', label: 'Running', spin: true, pulse: true },
    done: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Done' },
    error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Error' },
    warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Warning' },
    approved: { icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Approved' },
  };
  const config = configs[status] || configs.pending;
  const Icon = config.icon;

  return (
    <motion.span
      key={status}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className={cn(
        'inline-flex items-center gap-1.5 shrink-0',
        showLabel && `px-2 py-0.5 rounded-full text-[11px] font-medium ${config.bg}`,
        config.color,
        config.pulse && 'animate-pulse',
        className
      )}
    >
      <Icon size={size} className={cn(config.spin && 'animate-spin')} />
      {showLabel && <span>{config.label}</span>}
    </motion.span>
  );
}

export function StatusIndicator({ status = 'idle', size = 8, className }) {
  const colors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    active: 'bg-[var(--accent)]',
    idle: 'bg-[var(--text-faint)]',
  };
  return (
    <span
      className={cn(
        'inline-block rounded-full shrink-0',
        colors[status] || colors.idle,
        status === 'active' && 'animate-pulse',
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}

export function ThemedButton({ className, variant = 'primary', disabled, children, ...props }) {
  const variants = {
    primary: 'bg-[var(--accent)] text-white hover:opacity-90 shadow-sm hover:shadow-md',
    ghost: 'bg-transparent text-[var(--text-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
    subtle: 'bg-[var(--coding-surface)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--accent-soft)]',
    glass: 'bg-[var(--coding-surface-raised)]/70 backdrop-blur-sm text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--accent-soft)] border border-[var(--coding-border)]/50',
  };
  return (
    <button
      className={cn(
        'px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200',
        'active:scale-[0.97]',
        variants[variant],
        disabled && 'opacity-50 cursor-default pointer-events-none',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function ThemedProgressBar({ progress = 0, className, variant = 'default' }) {
  const barColors = {
    default: 'bg-[var(--coding-progress,var(--accent))]',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-400',
  };
  const clampedProgress = Math.min(100, Math.max(0, progress));
  return (
    <div className={cn('h-1.5 rounded-full overflow-hidden bg-[var(--coding-border)]/50', className)}>
      <motion.div
        className={cn('h-full rounded-full', barColors[variant])}
        initial={{ width: 0 }}
        animate={{ width: `${clampedProgress}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
}

/**
 * Skeleton loader for content that's being fetched/generated.
 */
export function SkeletonLoader({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2 animate-pulse', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded-md bg-[var(--coding-border)]/40"
          style={{ width: `${70 + Math.random() * 30}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Pulse ring animation around an element (for active states).
 */
export function PulseRing({ active = false, color = 'var(--accent)', children, className }) {
  return (
    <span className={cn('relative inline-flex', className)}>
      {children}
      {active && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-30"
          style={{ backgroundColor: color }}
        />
      )}
    </span>
  );
}

/**
 * Auto-dismiss toast notification (non-blocking).
 */
export function ToastNotification({ message, type = 'info', visible, onDismiss, duration = 4000 }) {
  useEffect(() => {
    if (visible && duration > 0) {
      const t = setTimeout(onDismiss, duration);
      return () => clearTimeout(t);
    }
  }, [visible, duration, onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'fixed bottom-4 right-4 z-[9999] px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-xl border text-[13px] font-medium',
            type === 'info' && 'bg-[var(--coding-surface-raised)]/90 border-[var(--coding-border)] text-[var(--text-soft)]',
            type === 'success' && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600',
            type === 'warning' && 'bg-amber-500/10 border-amber-500/30 text-amber-600',
            type === 'error' && 'bg-red-500/10 border-red-500/30 text-red-500'
          )}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ThemedText({ className, variant = 'primary', as: Tag = 'span', children, ...props }) {
  const variants = {
    primary: 'text-[var(--text)]',
    secondary: 'text-[var(--text-soft)]',
    muted: 'text-[var(--text-faint)]',
    accent: 'text-[var(--accent)]',
  };
  return (
    <Tag className={cn(variants[variant], className)} {...props}>
      {children}
    </Tag>
  );
}
