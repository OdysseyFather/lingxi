import { forwardRef, useEffect, useId, useRef } from 'react';
import { cn } from './cn';

export function Button({ className, variant = 'default', size = 'md', children, ...rest }) {
  const variants = {
    default: `bg-gradient-to-r from-[color:var(--accent)] via-[#6d6fff] to-[#5e8bff] bg-[length:200%_100%] bg-left text-white
      shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_8px_rgba(124,92,255,0.2)]
      hover:bg-right hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_24px_var(--accent-glow)] hover:-translate-y-px active:translate-y-0`,
    ghost:   'bg-transparent text-[color:var(--text)] hover:bg-[color:var(--bg-soft)]',
    outline: 'border border-[color:var(--line)] hover:border-[color:var(--accent)]/60 hover:bg-[color:var(--bg-soft)] text-[color:var(--text)]',
    danger:  'bg-danger text-white hover:opacity-90',
    soft:    'bg-[color:var(--accent-soft)] text-[color:var(--accent)] hover:bg-[color:var(--accent-soft)]/80',
  };
  const sizes = {
    sm: 'h-7 px-2.5 text-xs rounded-md',
    md: 'h-9 px-3.5 text-sm rounded-lg',
    lg: 'h-11 px-5 text-base rounded-xl',
    icon: 'h-9 w-9 rounded-lg flex items-center justify-center',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium select-none transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >{children}</button>
  );
}

export function Input({ className, ...rest }) {
  return (
    <input
      className={cn(
        'h-9 px-3 rounded-lg w-full bg-[color:var(--bg-elev)] border border-[color:var(--line)]',
        'text-[color:var(--text)] placeholder:text-[color:var(--text-faint)]',
        'focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30 focus:border-[color:var(--accent)]',
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }) {
  return (
    <textarea
      className={cn(
        'min-h-[80px] w-full rounded-lg px-3 py-2 bg-[color:var(--bg-elev)]',
        'border border-[color:var(--line)] text-[color:var(--text)] placeholder:text-[color:var(--text-faint)]',
        'focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30 focus:border-[color:var(--accent)]',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }) {
  return (
    <select
      className={cn(
        'h-9 px-3 rounded-lg bg-[color:var(--bg-elev)] border border-[color:var(--line)]',
        'text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30',
        className,
      )}
      {...rest}
    >{children}</select>
  );
}

export function Badge({ className, tone = 'default', children }) {
  const tones = {
    default: 'bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]',
    accent:  'bg-[color:var(--accent-soft)] text-[color:var(--accent)]',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warn:    'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    danger:  'bg-red-500/10 text-red-600 dark:text-red-400',
    info:    'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export const Card = forwardRef(function Card({ className, children }, ref) {
  return <div ref={ref} className={cn('surface p-4 shadow-[0_1px_2px_rgba(0,0,0,.03),0_8px_24px_-4px_rgba(0,0,0,.06)]', className)}>{children}</div>;
});

// Modal/Dialog 简单实现
export function Modal({ open, onClose, title, footer, children, width = 520 }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      first?.focus?.();
    });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md"
      style={{ animation: 'modalBackdropIn .25s ease forwards' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className="surface w-full mx-4"
        style={{ maxWidth: width, animation: 'modalContentIn .3s cubic-bezier(.22,1,.36,1) forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-5 py-3 border-b border-[color:var(--line)] flex items-center justify-between">
            <div id={titleId} className="font-semibold">{title}</div>
            <button
              className="text-[color:var(--text-faint)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 rounded-md"
              onClick={onClose}
              aria-label="关闭弹窗"
            >✕</button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-[color:var(--line)] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// 简易 toast 容器
export function ToastStack({ items }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {items.map((n) => (
        <div key={n.id} className="surface px-4 py-3 shadow-soft animate-rise min-w-[260px]">
          {n.title && <div className="font-medium">{n.title}</div>}
          {n.body && <div className="text-sm text-[color:var(--text-soft)]">{n.body}</div>}
        </div>
      ))}
    </div>
  );
}

export function Tooltip({ children, label }) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap
        bg-ink-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition">
        {label}
      </span>
    </span>
  );
}

export function Skeleton({ className, lines = 1, circle = false }) {
  if (circle) {
    return <div className={cn('rounded-full bg-[color:var(--bg-soft)] animate-pulse', className)} />;
  }
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-3 rounded-md bg-[color:var(--bg-soft)] animate-pulse',
            i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full',
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn('surface p-4 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Skeleton circle className="w-10 h-10" />
        <Skeleton lines={2} className="flex-1" />
      </div>
      <Skeleton lines={2} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center mb-4 pulse-ring">
          <Icon size={28} />
        </div>
      )}
      <h3 className="text-base font-semibold text-gradient mb-1">{title}</h3>
      {description && <p className="text-sm text-[color:var(--text-soft)] max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}
