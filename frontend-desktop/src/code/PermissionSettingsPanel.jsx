import { useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert, Info } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { RISK_META, TOOL_RISK_LEVELS } from './permissionConfig';

const MODES = [
  { id: 'trust', label: '完全信任', icon: ShieldCheck, desc: '所有操作自动放行，不弹确认框', color: 'green' },
  { id: 'managed', label: '分级管控', icon: Shield, desc: '按风险等级分别处理（推荐）', color: 'amber' },
  { id: 'strict', label: '严格模式', icon: ShieldAlert, desc: '所有写入操作均需确认', color: 'red' },
];

export function PermissionSettingsPanel() {
  const permissionMode = useStore((s) => s.codingPermissionMode);
  const setPermissionMode = useStore((s) => s.setCodingPermissionMode);
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-[var(--accent)]" />
        <span className="text-[13px] font-medium text-[var(--text)]">权限管控</span>
      </div>

      {/* 模式选择 */}
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setPermissionMode(mode.id)}
            className={cn(
              'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center',
              permissionMode === mode.id
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm'
                : 'border-[var(--coding-border)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/50'
            )}
          >
            <mode.icon
              size={18}
              className={cn(
                permissionMode === mode.id ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'
              )}
            />
            <span className="text-[11px] font-medium text-[var(--text)]">{mode.label}</span>
            <span className="text-[10px] text-[var(--text-faint)] leading-tight">{mode.desc}</span>
          </button>
        ))}
      </div>

      {/* 风险等级说明 */}
      <button
        onClick={() => setShowDetails(v => !v)}
        className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
      >
        <Info size={11} />
        {showDetails ? '收起详情' : '查看工具风险分级'}
      </button>

      {showDetails && (
        <div className="space-y-3 mt-2">
          {Object.entries(RISK_META).map(([level, meta]) => (
            <div key={level} className="rounded-lg border border-[var(--coding-border)] p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cn(
                  'w-2 h-2 rounded-full',
                  meta.color === 'green' && 'bg-green-500',
                  meta.color === 'amber' && 'bg-amber-500',
                  meta.color === 'red' && 'bg-red-500'
                )} />
                <span className="text-[12px] font-medium text-[var(--text)]">{meta.label}</span>
                <span className="text-[10px] text-[var(--text-faint)]">— {meta.description}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(TOOL_RISK_LEVELS)
                  .filter(([, l]) => l === level)
                  .map(([tool]) => (
                    <span key={tool} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--text-soft)] font-mono">
                      {tool}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
