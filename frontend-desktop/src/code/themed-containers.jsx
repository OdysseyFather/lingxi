import { forwardRef } from 'react';
import { cn } from '../ui/cn';

/**
 * Semantic themed container components for Coding View.
 * Maps visual intent to CSS variables, ensuring 6-theme compatibility.
 * Uses global vars (--bg, --text, --accent, --line, etc.) as primary source,
 * supplemented by --coding-* vars only where global vars lack specificity.
 */

export const ThemedBox = forwardRef(({ className, variant = 'base', blur = false, children, ...props }, ref) => {
  const variants = {
    base: 'bg-[var(--coding-surface)] border-[var(--coding-border)]',
    raised: 'bg-[var(--coding-surface-raised)] border-[var(--coding-border)] shadow-sm',
    overlay: 'bg-[var(--coding-surface-raised)] border-[var(--coding-border)] shadow-xl',
  };
  return (
    <div
      ref={ref}
      className={cn(
        'border rounded-xl',
        variants[variant],
        blur && 'backdrop-blur-md bg-opacity-80',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
ThemedBox.displayName = 'ThemedBox';

export const ThemedCard = forwardRef(({ className, active, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl border bg-[var(--coding-surface-raised)] transition-colors',
      active ? 'border-[var(--coding-border-active)]' : 'border-[var(--coding-border)]',
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

export function StatusIndicator({ status = 'idle', size = 8, className }) {
  const colors = {
    success: 'bg-green-500',
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
    primary: 'bg-[var(--accent)] text-white hover:opacity-90',
    ghost: 'bg-transparent text-[var(--text-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
    subtle: 'bg-[var(--coding-surface)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--accent-soft)]',
  };
  return (
    <button
      className={cn(
        'px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all',
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

export function ThemedProgressBar({ progress = 0, className }) {
  return (
    <div className={cn('h-1.5 rounded-full overflow-hidden bg-[var(--coding-border)]', className)}>
      <div
        className="h-full rounded-full bg-[var(--coding-progress)] transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
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
