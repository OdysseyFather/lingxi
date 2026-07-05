import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, X, Camera, Loader2, StopCircle, Send, Play, Check, XCircle, Shield, AlertTriangle, Eye, MousePointer, Globe } from 'lucide-react';
import { useStore } from '../state/useStore';
import { cn } from '../ui/cn';
import { ScreenBlock, ScreenPlanBlock } from './ScreenBlock';

function ExecutionProgress() {
  const executing = useStore((s) => s.screenAgentExecuting);
  const stepIndex = useStore((s) => s.screenAgentStepIndex);
  const totalSteps = useStore((s) => s.screenAgentTotalSteps);
  const currentStep = useStore((s) => s.screenAgentCurrentStep);
  const confirmNeeded = useStore((s) => s.screenAgentConfirmNeeded);
  const confirmAction = useStore((s) => s.screenAgentConfirmAction);
  const screenAgentAbort = useStore((s) => s.screenAgentAbort);

  if (!executing && !confirmNeeded) return null;

  const progress = totalSteps > 0 ? ((stepIndex) / totalSteps) * 100 : 0;

  return (
    <div className="mx-2 mb-2 rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <div className="h-1 bg-[color:var(--bg-soft)]">
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
          <span className="text-xs text-[color:var(--text)]">
            {currentStep
              ? `步骤 ${currentStep.step}/${currentStep.total}：${currentStep.description}`
              : `正在执行… (${stepIndex}/${totalSteps})`
            }
          </span>
          <button
            onClick={screenAgentAbort}
            className="ml-auto p-1 rounded hover:bg-red-500/10 text-red-400 shrink-0"
            title="中止执行"
          >
            <StopCircle size={13} />
          </button>
        </div>

        {confirmNeeded && (
          <div className={cn(
            'mt-2 p-2 rounded-lg border',
            confirmNeeded.dangerous
              ? 'border-red-500/30 bg-red-500/5'
              : 'border-amber-500/30 bg-amber-500/5'
          )}>
            <div className="flex items-center gap-2 mb-1.5">
              <Shield size={13} className={confirmNeeded.dangerous ? 'text-red-500' : 'text-amber-500'} />
              <span className={cn('text-[11px] font-medium', confirmNeeded.dangerous ? 'text-red-600' : 'text-amber-600')}>
                {confirmNeeded.dangerous ? '危险操作 · 需要确认' : '需要确认'}
              </span>
            </div>
            <div className="text-xs text-[color:var(--text-soft)] mb-2">
              {confirmNeeded.description || `${confirmNeeded.action} 操作`}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => confirmAction(confirmNeeded.action_id, true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 transition"
              >
                <Check size={12} /> 确认执行
              </button>
              <button
                onClick={() => confirmAction(confirmNeeded.action_id, false)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition"
              >
                <XCircle size={12} /> 跳过
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ScreenAgentPanel() {
  const screenAgentMode = useStore((s) => s.screenAgentMode);
  const screenAgentAnalyzing = useStore((s) => s.screenAgentAnalyzing);
  const screenAgentResult = useStore((s) => s.screenAgentResult);
  const screenAgentPlan = useStore((s) => s.screenAgentPlan);
  const screenAgentExecuting = useStore((s) => s.screenAgentExecuting);
  const toggleScreenAgentMode = useStore((s) => s.toggleScreenAgentMode);
  const screenAgentAnalyze = useStore((s) => s.screenAgentAnalyze);
  const screenAgentMakePlan = useStore((s) => s.screenAgentMakePlan);
  const screenAgentAbort = useStore((s) => s.screenAgentAbort);
  const screenAgentExecuteStep = useStore((s) => s.screenAgentExecuteStep);
  const screenAgentExecutePlan = useStore((s) => s.screenAgentExecutePlan);
  const pushNotification = useStore((s) => s.pushNotification);

  const [instruction, setInstruction] = useState('');
  const [mode, setMode] = useState('analyze');

  if (!screenAgentMode) return null;

  const isElectron = !!window.electronAPI?.screenAgent;
  const busy = screenAgentAnalyzing || screenAgentExecuting;

  const handleSubmit = () => {
    if (busy) return;
    if (!isElectron) {
      pushNotification({ title: 'Screen Agent', body: '需要在桌面应用中使用，浏览器模式不支持' });
      return;
    }
    if (mode === 'analyze') {
      screenAgentAnalyze(instruction);
    } else {
      if (!instruction.trim()) {
        pushNotification({ title: 'Screen Agent', body: '请输入操作指令，例如"打开系统设置"' });
        return;
      }
      screenAgentMakePlan(instruction);
    }
    setInstruction('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      toggleScreenAgentMode();
    }
  };

  const handleExecuteAll = () => {
    if (!screenAgentPlan?.steps?.length) return;
    screenAgentExecutePlan(screenAgentPlan.steps, false);
  };

  const handleExecuteAllAuto = () => {
    if (!screenAgentPlan?.steps?.length) return;
    screenAgentExecutePlan(screenAgentPlan.steps, true);
  };

  const hasResult = screenAgentResult || screenAgentPlan;

  return (
    <motion.div
      key="screen-agent-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.18 }}
      className="absolute bottom-full left-0 right-0 mb-2 mx-4 z-30"
    >
      <div className={cn(
        'rounded-xl border bg-[color:var(--bg-elev)]',
        'shadow-xl overflow-hidden',
        'max-h-[70vh] flex flex-col',
        screenAgentExecuting ? 'border-blue-500/30' : 'border-[color:var(--line)]'
      )}>
        {/* ─── 头部 ───────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--line)] bg-gradient-to-r from-blue-500/8 to-transparent shrink-0">
          <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center">
            <Monitor size={14} className="text-blue-500" />
          </div>
          <span className="text-xs font-semibold text-[color:var(--text)]">Screen Agent</span>
          <span className="text-[10px] text-[color:var(--text-faint)]">
            {mode === 'analyze' ? '· 看屏幕' : mode === 'operate' ? '· 操控桌面' : '· 浏览器'}
          </span>

          {/* 模式切换 */}
          <div className="ml-3 flex gap-0.5 bg-[color:var(--bg-soft)] rounded-md p-0.5">
            {[
              { id: 'analyze', icon: Eye, label: '看屏幕' },
              { id: 'operate', icon: MousePointer, label: '操控' },
              { id: 'browser', icon: Globe, label: '浏览器' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                disabled={busy}
                className={cn(
                  'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition',
                  mode === m.id
                    ? 'bg-[color:var(--bg-elev)] text-[color:var(--text)] shadow-sm'
                    : 'text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)]'
                )}
              >
                <m.icon size={10} /> {m.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {busy && (
              <button
                onClick={screenAgentAbort}
                className="p-1 rounded hover:bg-red-500/10 text-red-400"
                title="中止"
              >
                <StopCircle size={14} />
              </button>
            )}
            <button
              onClick={toggleScreenAgentMode}
              className="p-1 rounded hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]"
              title="关闭 (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ─── 非 Electron 提示 ──────────────────────────── */}
        {!isElectron && (
          <div className="px-3 py-2 bg-amber-500/5 border-b border-amber-500/20 flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-500 shrink-0" />
            <span className="text-[11px] text-amber-600">屏幕操控需要在灵犀桌面应用中使用，浏览器开发模式不支持截屏和操控。</span>
          </div>
        )}

        {/* ─── 执行进度 ──────────────────────────────────── */}
        <ExecutionProgress />

        {/* ─── 空状态引导 ─────────────────────────────────── */}
        {!hasResult && !busy && mode !== 'browser' && (
          <div className="px-4 py-5 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 mb-3">
              {mode === 'analyze'
                ? <Eye size={20} className="text-blue-500" />
                : <MousePointer size={20} className="text-blue-500" />
              }
            </div>
            <div className="text-sm font-medium text-[color:var(--text)] mb-1">
              {mode === 'analyze' ? '看懂你的屏幕' : '替你操控桌面'}
            </div>
            <div className="text-xs text-[color:var(--text-faint)] mb-3 max-w-xs mx-auto">
              {mode === 'analyze'
                ? '点击下方「截屏分析」按钮，或输入你想了解的内容，AI 会截屏并告诉你屏幕上有什么。'
                : '告诉我你想做什么，例如「打开系统设置」「在 Finder 里新建文件夹」，AI 会制定操作计划。'
              }
            </div>
            {mode === 'analyze' && isElectron && (
              <button
                onClick={() => screenAgentAnalyze('')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition shadow-sm"
              >
                <Camera size={14} /> 截屏并分析
              </button>
            )}
          </div>
        )}

        {/* ─── 浏览器控制面板 ─────────────────────────────── */}
        {mode === 'browser' && !busy && (
          <BrowserControlPanel />
        )}

        {/* ─── 结果区域 ──────────────────────────────────── */}
        {hasResult && (
          <div className="overflow-y-auto flex-1 overscroll-contain" style={{ maxHeight: '45vh' }}>
            {screenAgentResult && (
              <div className="px-2 pt-2">
                <ScreenBlock
                  screenshot={screenAgentResult.screenshot}
                  analysis={screenAgentResult.analysis}
                  timestamp={screenAgentResult.timestamp}
                />
              </div>
            )}
            {screenAgentPlan && (
              <div className="px-2 pt-2">
                <ScreenPlanBlock
                  steps={screenAgentPlan.steps}
                  rawPlan={screenAgentPlan.rawPlan}
                  screenshot={screenAgentPlan.screenshot}
                  onExecuteStep={screenAgentExecuteStep}
                  onExecuteAll={!screenAgentExecuting ? handleExecuteAll : undefined}
                />
                {screenAgentPlan.steps?.length > 0 && !screenAgentExecuting && (
                  <div className="flex items-center gap-2 px-2 pb-2">
                    <button
                      onClick={handleExecuteAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[color:var(--accent)] text-white hover:opacity-90 transition"
                    >
                      <Play size={12} /> 逐步执行（需确认）
                    </button>
                    <button
                      onClick={handleExecuteAllAuto}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition"
                    >
                      <Play size={12} /> 自动执行
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── 加载中 ────────────────────────────────────── */}
        {screenAgentAnalyzing && !screenAgentExecuting && (
          <div className="px-4 py-4 flex flex-col items-center gap-2">
            <Loader2 size={20} className="text-blue-500 animate-spin" />
            <span className="text-xs text-[color:var(--text-soft)]">
              {mode === 'analyze' ? '正在截屏并分析…' : '正在截屏并制定操作计划…'}
            </span>
          </div>
        )}

        {/* ─── 输入区 ────────────────────────────────────── */}
        <div className="px-3 py-2 border-t border-[color:var(--line)] shrink-0">
          <div className="flex items-center gap-2">
            {isElectron && (
              <button
                onClick={() => screenAgentAnalyze('')}
                disabled={busy}
                className={cn(
                  'p-1.5 rounded-md transition shrink-0',
                  busy
                    ? 'text-[color:var(--text-faint)] cursor-not-allowed'
                    : 'text-blue-500 hover:bg-blue-500/10'
                )}
                title="截屏分析"
              >
                <Camera size={16} />
              </button>
            )}
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy}
              autoFocus
              placeholder={
                mode === 'analyze'
                  ? '输入想了解的屏幕内容（留空=分析全屏）'
                  : mode === 'browser'
                  ? '告诉我你想在浏览器中做什么，例如「打开百度搜索AI」'
                  : '告诉我你想做什么，例如「打开系统偏好设置」'
              }
              className="flex-1 text-sm bg-transparent outline-none text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={busy || (mode === 'operate' && !instruction.trim())}
              className={cn(
                'p-1.5 rounded-md transition shrink-0',
                busy || (mode === 'operate' && !instruction.trim())
                  ? 'text-[color:var(--text-faint)] cursor-not-allowed'
                  : 'text-blue-500 hover:bg-blue-500/10'
              )}
              title={mode === 'analyze' ? '截屏分析' : '制定操作计划'}
            >
              <Send size={15} />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[color:var(--text-faint)]">
            <span>⌘⇧Esc 紧急中止</span>
            <span>·</span>
            <span>Esc 关闭面板</span>
            {mode === 'operate' && <><span>·</span><span>危险操作会强制确认</span></>}
            {mode === 'browser' && <><span>·</span><span>通过 Playwright 自动化浏览器</span></>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function BrowserControlPanel() {
  const isElectron = !!window.electronAPI;
  const [browserUrl, setBrowserUrl] = useState('');

  const quickActions = [
    { label: '打开百度', desc: '导航到 baidu.com', icon: '🔍' },
    { label: '打开 GitHub', desc: '导航到 github.com', icon: '🐙' },
    { label: '截取网页', desc: '截图当前浏览器页面', icon: '📸' },
    { label: '提取内容', desc: '读取网页文本内容', icon: '📄' },
  ];

  return (
    <div className="px-4 py-4">
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 mb-2">
          <Globe size={20} className="text-purple-500" />
        </div>
        <div className="text-sm font-medium text-[color:var(--text)]">浏览器自动化</div>
        <div className="text-[11px] text-[color:var(--text-faint)] mt-0.5 max-w-xs mx-auto">
          通过 Playwright MCP 控制浏览器，支持导航、点击、输入、截图等操作
        </div>
      </div>

      {isElectron && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px]">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Playwright MCP 已就绪
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {quickActions.map(a => (
          <button
            key={a.label}
            className="flex items-center gap-2 p-2.5 rounded-lg border border-[color:var(--line)] hover:bg-[color:var(--bg-soft)] hover:border-[color:var(--accent)]/30 transition text-left"
          >
            <span className="text-lg">{a.icon}</span>
            <div>
              <div className="text-xs font-medium text-[color:var(--text)]">{a.label}</div>
              <div className="text-[10px] text-[color:var(--text-faint)]">{a.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-3 text-[10px] text-[color:var(--text-faint)] text-center">
        在对话中发送指令，Agent 会自动调用浏览器工具完成任务
      </div>
    </div>
  );
}
