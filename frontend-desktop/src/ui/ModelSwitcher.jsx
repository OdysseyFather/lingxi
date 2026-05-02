import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Cpu, Settings, Check } from 'lucide-react';
import { useStore } from '../state/useStore';
import { Badge, cn } from './primitives';

export function ModelSwitcher() {
  const profiles = useStore((s) => s.profiles);
  const active = useStore((s) => s.activeProfile);
  const activate = useStore((s) => s.activateProfile);
  const setView = useStore((s) => s.setView);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const todayUsage = useStore((s) => s.todayUsage);

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const handlePick = async (p) => {
    setOpen(false);
    if (p.id === active?.id) return;
    await activate(p.id);
  };

  const goSettings = () => {
    setOpen(false);
    setView('settings');
    setSettingsTab('profiles');
  };

  return (
    <div ref={ref} className="relative app-no-drag">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg surface hover:border-[color:var(--accent)] transition"
      >
        <span className="w-6 h-6 rounded-md bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center">
          <Cpu size={14} />
        </span>
        <div className="text-left leading-tight">
          <div className="text-[13px] font-medium">{active?.name || '未配置'}</div>
          <div className="text-[10px] text-[color:var(--text-faint)] -mt-0.5">{active?.model || '点此选择模型'}</div>
        </div>
        <ChevronDown size={14} className="text-[color:var(--text-faint)]" />
      </button>
      {todayUsage && (todayUsage.input_tokens || todayUsage.output_tokens || todayUsage.cost_usd) ? (
        <button
          onClick={() => { setView('settings'); setSettingsTab('usage'); }}
          className="ml-2 inline-flex items-center gap-1 h-9 px-3 rounded-lg hover:bg-[color:var(--bg-soft)] text-xs text-[color:var(--text-soft)]"
          title="查看今日用量"
        >
          今日 ${(todayUsage.cost_usd || 0).toFixed(3)} · {formatCompact((todayUsage.input_tokens || 0) + (todayUsage.output_tokens || 0))}
        </button>
      ) : null}

      {open && (
        <div className="absolute top-11 right-0 z-40 w-[340px] surface shadow-soft p-2 animate-rise">
          <div className="px-2 pt-1 pb-2 text-xs text-[color:var(--text-faint)]">选择接入档案</div>
          <div className="max-h-[320px] overflow-y-auto scrollable -mx-1 px-1 space-y-1">
            {profiles.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-[color:var(--text-faint)]">
                还没有配置接入点，去
                <button onClick={goSettings} className="ml-1 text-[color:var(--accent)] hover:underline">添加</button>
              </div>
            )}
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePick(p)}
                className={cn(
                  'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition',
                  p.is_active ? 'bg-[color:var(--accent-soft)]' : 'hover:bg-[color:var(--bg-soft)]',
                )}
              >
                <div className="w-8 h-8 rounded-md bg-[color:var(--bg-soft)] flex items-center justify-center text-[color:var(--text-soft)]">
                  <Cpu size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {p.name}
                    {p.is_active && <Badge tone="accent">激活</Badge>}
                  </div>
                  <div className="text-[11px] text-[color:var(--text-faint)] truncate">
                    {p.provider_name || p.provider_code} · {p.model || '默认模型'}
                  </div>
                </div>
                {p.is_active && <Check size={14} className="text-[color:var(--accent)]" />}
              </button>
            ))}
          </div>
          <div className="border-t border-[color:var(--line)] mt-2 pt-2">
            <button
              onClick={goSettings}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[color:var(--bg-soft)] text-sm"
            >
              <Settings size={14} /> 管理接入点 / 密钥
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCompact(n) {
  if (n < 1000) return n + ' tok';
  if (n < 1e6) return (n / 1000).toFixed(1) + 'k';
  return (n / 1e6).toFixed(2) + 'M';
}
