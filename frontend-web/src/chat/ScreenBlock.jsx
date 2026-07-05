import { useState } from 'react';
import { Monitor, ZoomIn, ZoomOut, Eye } from 'lucide-react';
import { cn } from '../ui/cn';

export function ScreenBlock({ screenshot, analysis, timestamp }) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(false);

  return (
    <div className="my-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elev)] overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--line)] bg-[color:var(--bg-soft)]/50">
        <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center">
          <Monitor size={14} className="text-blue-500" />
        </div>
        <span className="text-xs font-medium text-[color:var(--text)]">屏幕分析</span>
        {timestamp && (
          <span className="text-[10px] text-[color:var(--text-faint)] ml-auto">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]"
        >
          <Eye size={13} />
        </button>
      </div>

      {/* 截图 */}
      {screenshot && (expanded || !analysis) && (
        <div className="relative group">
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="屏幕截图"
            className={cn(
              'w-full cursor-pointer transition-all',
              zoom ? 'max-h-none' : 'max-h-64 object-cover object-top'
            )}
            onClick={() => setZoom(!zoom)}
          />
          <button
            onClick={() => setZoom(!zoom)}
            className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
          >
            {zoom ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
          </button>
        </div>
      )}

      {/* 分析结果 */}
      {analysis && (
        <div className="px-3 py-2.5 text-sm text-[color:var(--text)] leading-relaxed whitespace-pre-wrap">
          {analysis}
        </div>
      )}
    </div>
  );
}

export function ScreenPlanBlock({ steps, rawPlan, screenshot, onExecuteStep, onExecuteAll }) {
  const [showRaw, setShowRaw] = useState(false);
  const [expandedScreen, setExpandedScreen] = useState(false);

  if (!steps || steps.length === 0) {
    return rawPlan ? (
      <div className="my-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elev)] p-3">
        <div className="flex items-center gap-2 mb-2">
          <Monitor size={14} className="text-amber-500" />
          <span className="text-xs font-medium text-[color:var(--text)]">操作计划</span>
        </div>
        <div className="text-sm text-[color:var(--text-soft)] whitespace-pre-wrap">{rawPlan}</div>
      </div>
    ) : null;
  }

  return (
    <div className="my-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elev)] overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--line)] bg-[color:var(--bg-soft)]/50">
        <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
          <Monitor size={14} className="text-amber-500" />
        </div>
        <span className="text-xs font-medium text-[color:var(--text)]">操作计划 · {steps.length} 步</span>
        <div className="ml-auto flex items-center gap-1">
          {rawPlan && (
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-[10px] px-2 py-0.5 rounded bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)]"
            >
              {showRaw ? '步骤视图' : '原始输出'}
            </button>
          )}
          {onExecuteAll && (
            <button
              onClick={onExecuteAll}
              className="text-[10px] px-2 py-0.5 rounded bg-[color:var(--accent)] text-white hover:opacity-90"
            >
              全部执行
            </button>
          )}
        </div>
      </div>

      {/* 截图预览 */}
      {screenshot && expandedScreen && (
        <img
          src={`data:image/png;base64,${screenshot}`}
          alt="规划时截图"
          className="w-full max-h-48 object-cover object-top border-b border-[color:var(--line)]"
        />
      )}

      {/* 步骤列表或原始文本 */}
      {showRaw ? (
        <div className="p-3 text-xs text-[color:var(--text-soft)] whitespace-pre-wrap font-mono">{rawPlan}</div>
      ) : (
        <div className="divide-y divide-[color:var(--line)]">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2 hover:bg-[color:var(--bg-soft)]/30 group">
              <div className="w-5 h-5 rounded-full bg-[color:var(--accent)]/15 text-[color:var(--accent)] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                {step.step || i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[color:var(--text)]">{step.description || JSON.stringify(step)}</div>
                {step.action && (
                  <div className="text-[10px] text-[color:var(--text-faint)] mt-0.5 font-mono">
                    {step.action}
                    {step.params && ` · ${JSON.stringify(step.params)}`}
                  </div>
                )}
              </div>
              {onExecuteStep && (
                <button
                  onClick={() => onExecuteStep(JSON.stringify({ type: step.action, ...step.params }))}
                  className="text-[10px] px-2 py-0.5 rounded bg-[color:var(--accent)]/10 text-[color:var(--accent)] opacity-0 group-hover:opacity-100 transition shrink-0"
                >
                  执行
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
