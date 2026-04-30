import { useEffect, useState } from 'react';
import { Network, Loader2, CircleAlert } from 'lucide-react';
import { useStore } from '../state/useStore';
import { api } from '../api/client';
import { Badge, cn } from './primitives';

// RouterPill 仅在激活档案为 OpenAI 协议时显示，反映 bridge 路由层运行状态
export function RouterPill() {
  const active = useStore((s) => s.activeProfile);
  const [status, setStatus] = useState(null);

  const isOpenAI = active?.provider_protocol === 'openai';

  useEffect(() => {
    if (!isOpenAI) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api.getRouterStatus();
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus({ running: false, last_err: 'fetch_failed' });
      }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isOpenAI, active?.id]);

  if (!isOpenAI) return null;

  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-[11px] bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]">
        <Loader2 size={11} className="animate-spin" /> 路由层
      </span>
    );
  }

  if (status.running) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        title={`路由层运行于 127.0.0.1:${status.port}`}
      >
        <Network size={11} /> 路由层 已就绪
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 h-7 rounded-md text-[11px]',
        status.last_err ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]'
      )}
      title={status.last_err || '路由层尚未启动，发送消息时会自动启动'}
    >
      {status.last_err ? <CircleAlert size={11} /> : <Network size={11} />}
      路由层 {status.last_err ? '错误' : '待启动'}
    </span>
  );
}
