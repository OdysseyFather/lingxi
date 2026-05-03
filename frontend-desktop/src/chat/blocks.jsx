import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import {
  Brain, Wrench, Search, Globe, FileText, Code2, Pencil,
  ListTodo, FolderOpen, Terminal, ChevronDown, ChevronRight,
  Loader2, CheckCircle2, AlertCircle, Cpu, Coins, Clock, Copy, Check,
  MessageCircleQuestion, Send, ArrowLeft, ArrowRight, RotateCcw,
  CheckCircle, Circle, Sparkles, Zap, Map, Rocket, BookOpen,
} from 'lucide-react';
import { Badge } from '../ui/primitives';
import { cn } from '../ui/cn';
import { formatNum } from './blockUtils';
import { useStore } from '../state/useStore';

const TOOL_ICONS = {
  Bash: Terminal, Write: Pencil, Edit: Pencil, MultiEdit: Pencil,
  Read: FileText, Glob: FolderOpen, Grep: Search, LS: FolderOpen,
  WebSearch: Search, WebFetch: Globe,
  TodoWrite: ListTodo, TodoRead: ListTodo,
};

function iconForTool(name) {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (name?.startsWith('mcp__playwright__')) return Globe;
  if (name?.startsWith('mcp__')) return Wrench;
  return Code2;
}

export function ThinkingCard({ text, live }) {
  const [manualOpen, setManualOpen] = useState(false);
  const open = live || manualOpen;
  if (!text && !live) return null;
  const lines = (text || '').split('\n');
  const preview = lines.slice(-3).join('\n').slice(-180);
  return (
    <div className={cn(
      'surface-soft my-2 overflow-hidden border relative',
      live ? 'border-[color:var(--accent)]/20' : 'border-[color:var(--line)]',
    )}>
      {live && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[14px] overflow-hidden">
          <span className="block w-full h-full" style={{
            background: 'linear-gradient(180deg, transparent, var(--accent), transparent)',
            backgroundSize: '100% 200%',
            animation: 'energyFlow 1.5s ease-in-out infinite',
          }} />
        </span>
      )}
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5 transition"
        onClick={() => setManualOpen((v) => !v)}
      >
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center transition-all',
          live
            ? 'bg-[color:var(--accent)] text-white shadow-[0_0_16px_var(--accent-glow)]'
            : 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]',
        )}>
          <Brain size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            {live ? '深度思考中…' : '已思考'}
            {live && (
              <span className="flex items-end gap-[2px] h-4">
                <span className="neural-bar" style={{ animationDelay: '0s' }} />
                <span className="neural-bar" style={{ animationDelay: '0.12s' }} />
                <span className="neural-bar" style={{ animationDelay: '0.24s' }} />
              </span>
            )}
          </div>
          {!open && (
            <div className="text-xs text-[color:var(--text-faint)] truncate font-mono">
              {preview || '组织思路…'}
            </div>
          )}
        </div>
        {open ? <ChevronDown size={14} className="text-[color:var(--text-faint)]" /> : <ChevronRight size={14} className="text-[color:var(--text-faint)]" />}
      </button>
      {open && (
        <div className="overflow-hidden animate-rise">
          <div className={cn(
            'px-4 pb-3 pt-1 text-[13px] leading-relaxed whitespace-pre-wrap font-mono rounded-b-[14px]',
            'bg-[#0a0c16] text-[color:var(--text-soft)]',
            live && 'thinking-shimmer',
          )}>
            {text || '组织思路…'}
          </div>
        </div>
      )}
    </div>
  );
}

function toolCategory(name) {
  if (!name) return { tag: '系统', tone: 'info' };
  if (name.startsWith('mcp__playwright__')) return { tag: '浏览器', tone: 'info' };
  if (name.startsWith('mcp__')) return { tag: 'MCP', tone: 'success' };
  if (['Bash', 'Write', 'Edit', 'MultiEdit'].includes(name)) return { tag: '系统', tone: 'warn' };
  if (['WebFetch', 'WebSearch'].includes(name)) return { tag: '网络', tone: 'info' };
  return { tag: '工具', tone: 'info' };
}

export function ToolCard({ name, label, done, startedAt, endedAt, input, ms, status }) {
  const icon = iconForTool(name);
  const [open, setOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const prevDoneRef = useRef(done);
  const dur = ms != null ? ms : (endedAt && startedAt ? Math.max(1, endedAt - startedAt) : null);
  const cat = toolCategory(name);
  const failed = status === 'failed';
  const showDetail = Boolean(input);

  useEffect(() => {
    if (done && !prevDoneRef.current && !failed) {
      setJustCompleted(true);
      const t = setTimeout(() => setJustCompleted(false), 700);
      return () => clearTimeout(t);
    }
    prevDoneRef.current = done;
  }, [done, failed]);

  return (
    <div
      className={cn(
        'surface-soft my-2 border overflow-hidden transition-all relative',
        failed ? 'border-red-500/30' : done ? 'border-[color:var(--line)]' : 'border-[color:var(--accent)]/15',
        justCompleted && 'completion-flash',
      )}
    >
      {!done && !failed && <div className="tool-shimmer-bar" />}
      <button
        type="button"
        onClick={() => showDetail && setOpen((v) => !v)}
        className={cn(
          'w-full px-3 py-2.5 flex items-center gap-3 text-left transition',
          showDetail && 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer',
        )}
      >
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all',
          failed
            ? 'bg-red-500/10 text-red-500'
            : done
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-gradient-to-br from-[color:var(--accent-soft)] to-[color:var(--accent-soft)]/50 text-[color:var(--accent)] shadow-[0_0_12px_var(--accent-glow)]',
        )}>
          {!done && !failed ? (
            <Loader2 size={16} className="animate-spin" style={{ filter: 'drop-shadow(0 0 4px var(--accent-glow))' }} />
          ) : (
            createElement(icon, { size: 16 })
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            <span className="truncate">{label || '执行技能'}</span>
            <Badge tone={cat.tone}>{cat.tag}</Badge>
          </div>
          <div className="text-xs text-[color:var(--text-faint)] truncate font-mono mt-0.5">
            {input || name}
          </div>
        </div>
        <div className="text-xs flex items-center gap-2 shrink-0">
          {failed ? (
            <span className="inline-flex items-center gap-1 text-red-500 font-medium">
              <AlertCircle size={13} />失败
            </span>
          ) : done ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={13} />完成{dur ? ` · ${(dur / 1000).toFixed(1)}s` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[color:var(--accent)] font-medium">
              进行中
            </span>
          )}
          {showDetail && (open ? <ChevronDown size={13} className="text-[color:var(--text-faint)]" /> : <ChevronRight size={13} className="text-[color:var(--text-faint)]" />)}
        </div>
      </button>
      {open && showDetail && (
        <div className="overflow-hidden animate-rise">
          <div className="px-4 pb-3 pt-0 text-[12px] font-mono text-[color:var(--text-soft)] whitespace-pre-wrap break-all border-t border-[color:var(--line)]">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)] mt-2 mb-1">输入摘要</div>
            <div>{input}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ children, className: langClass }) {
  const [copied, setCopied] = useState(false);
  const theme = useStore((s) => s.theme);
  const isCyber = theme === 'cyber';
  const lang = (langClass || '').replace('language-', '') || 'text';
  const code = String(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [code]);

  return (
    <div className="group/code relative my-2 transition-all hover:shadow-soft">
      <div className={cn(
        'flex items-center justify-between px-3 py-1.5 border border-b-0 rounded-t-lg text-xs',
        isCyber
          ? 'bg-[#0a0a18] border-[rgba(0,229,255,0.15)] text-[#00e5ff]/60'
          : 'bg-[color:var(--bg-soft)] border-[color:var(--line)] text-[color:var(--text-faint)]'
      )}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <span className="font-mono">{isCyber ? `> ${lang}` : lang}</span>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded transition',
            isCyber
              ? 'hover:bg-[rgba(0,229,255,0.1)] text-[#00e5ff]/50 hover:text-[#00e5ff]'
              : 'hover:bg-[color:var(--line)] text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)]'
          )}
        >
          {copied ? <><Check size={12} className="text-emerald-500" /> 已复制</> : <><Copy size={12} /> 复制</>}
        </button>
      </div>
      <div className={cn(
        'h-px',
        isCyber
          ? 'bg-gradient-to-r from-[#00e5ff]/40 via-[#ff00aa]/20 to-transparent'
          : 'bg-gradient-to-r from-[color:var(--accent)]/30 via-[color:var(--accent-2)]/15 to-transparent'
      )} />
      <Highlight theme={themes.nightOwl} code={code} language={lang}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className={cn(
            '!mt-0 !rounded-t-none overflow-x-auto p-3 text-[13px] leading-relaxed border border-t-0 rounded-b-lg',
            isCyber
              ? 'bg-[#020210] border-[rgba(0,229,255,0.15)]'
              : 'bg-[#011627] border-[color:var(--line)]'
          )}>
            <code>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  <span className={cn(
                    'inline-block w-8 text-right mr-3 text-[10px] select-none',
                    isCyber ? 'text-[#00e5ff]/20' : 'text-white/15'
                  )}>{i + 1}</span>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  );
}

const MD_COMPONENTS = {
  code({ children, className, ...rest }) {
    const isBlock = className?.startsWith('language-');
    if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
    return <code className={className} {...rest}>{children}</code>;
  },
  pre({ children }) {
    return <>{children}</>;
  },
};

// 从文本中提取交互式 JSON 块（choice / input）
// live=true 时，未闭合的交互块会被隐藏并显示占位符
const INTERACTIVE_TYPES = ['choice', 'input'];
function splitTextAndInteractiveBlocks(text, live = false) {
  if (!text) return [{ type: 'md', content: text }];
  // 匹配 ```json ... ``` 代码块（捕获整个内容，然后用 JSON.parse 验证）
  const blockRe = /```json\s*\n([\s\S]*?)\n```/g;
  const parts = [];
  let last = 0;
  let m;

  while ((m = blockRe.exec(text)) !== null) {
    const raw = m[1].trim();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch { /* not valid JSON */ }

    if (parsed && typeof parsed === 'object' && INTERACTIVE_TYPES.includes(parsed.type)) {
      if (m.index > last) {
        parts.push({ type: 'md', content: text.slice(last, m.index) });
      }
      parts.push({ type: parsed.type, data: parsed });
      last = m.index + m[0].length;
    }
    // non-interactive json blocks are left as markdown
  }
  if (last < text.length) {
    const tail = text.slice(last);
    if (live) {
      const pendingRe = /```json\s*\n[\s\S]*"type"\s*:\s*"(?:choice|input)"[\s\S]*$/;
      if (pendingRe.test(tail)) {
        const fenceStart = tail.search(/```json\s*\n/);
        if (fenceStart > 0) {
          parts.push({ type: 'md', content: tail.slice(0, fenceStart) });
        }
        parts.push({ type: 'pending-interactive' });
        return parts;
      }
    }
    parts.push({ type: 'md', content: tail });
  }
  if (parts.length === 0) {
    parts.push({ type: 'md', content: text });
  }
  return parts;
}

function PendingInteractivePlaceholder() {
  return (
    <div className="my-3 surface border border-[color:var(--accent)]/20 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-[color:var(--accent-soft)] to-transparent border-b border-[color:var(--line)]">
        <div className="flex items-center gap-2 text-sm text-[color:var(--text-soft)]">
          <Loader2 size={14} className="animate-spin text-[color:var(--accent)]" />
          正在生成选项…
        </div>
      </div>
      <div className="p-3 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 rounded-lg bg-[color:var(--bg-soft)] animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

function InputBlockInline({ data, value, onChange, disabled }) {
  const values = value || {};
  return (
    <div className="space-y-3">
      {(data.fields || []).map(f => (
        <div key={f.id}>
          <label className="block text-sm font-medium text-[color:var(--text-soft)] mb-1.5">
            {f.label}{f.required !== false && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {f.multiline ? (
            <textarea
              value={values[f.id] || ''}
              onChange={e => onChange({ ...values, [f.id]: e.target.value })}
              disabled={disabled}
              placeholder={f.placeholder || ''}
              rows={3}
              className={cn(
                'w-full px-3 py-2.5 rounded-xl border text-sm bg-[color:var(--bg-elev)] text-[color:var(--text)] transition-all',
                'border-[color:var(--line)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/20 focus:outline-none',
                disabled && 'opacity-60'
              )}
            />
          ) : (
            <input
              type={f.inputType || 'text'}
              value={values[f.id] || ''}
              onChange={e => onChange({ ...values, [f.id]: e.target.value })}
              disabled={disabled}
              placeholder={f.placeholder || ''}
              className={cn(
                'w-full px-3 py-2.5 rounded-xl border text-sm bg-[color:var(--bg-elev)] text-[color:var(--text)] transition-all',
                'border-[color:var(--line)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/20 focus:outline-none',
                disabled && 'opacity-60'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ChoiceBlockInline({ data, value, onChange, disabled }) {
  const selected = value;
  const toggle = (optId) => {
    if (disabled) return;
    if (data.multi) {
      const arr = Array.isArray(selected) ? selected : [];
      onChange(arr.includes(optId) ? arr.filter(x => x !== optId) : [...arr, optId]);
    } else {
      onChange(optId);
    }
  };

  return (
    <div className="space-y-2">
      {(data.options || []).map(opt => {
        const isSelected = data.multi
          ? (Array.isArray(selected) && selected.includes(opt.id))
          : selected === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            disabled={disabled}
            className={cn(
              'w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 group/opt',
              disabled && isSelected
                ? 'bg-[color:var(--accent-soft)] border-[color:var(--accent)] opacity-100'
                : disabled
                  ? 'opacity-40 border-[color:var(--line)]'
                  : isSelected
                    ? 'bg-[color:var(--accent-soft)] border-[color:var(--accent)]/60 shadow-[0_2px_12px_var(--accent-glow)]'
                    : 'bg-[color:var(--bg-elev)] border-[color:var(--line)] hover:border-[color:var(--accent)]/40 hover:shadow-sm'
            )}
          >
            <div className={cn(
              'w-5 h-5 border-2 flex items-center justify-center shrink-0 transition-all',
              data.multi ? 'rounded-md' : 'rounded-full',
              isSelected
                ? 'bg-[color:var(--accent)] border-[color:var(--accent)] text-white scale-110'
                : 'border-[color:var(--line)] group-hover/opt:border-[color:var(--accent)]/50'
            )}>
              {isSelected && <Check size={11} strokeWidth={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn('text-sm font-medium transition-colors', isSelected && 'text-[color:var(--accent)]')}>
                {opt.label}
              </div>
              {opt.desc && <div className="text-xs text-[color:var(--text-faint)] mt-0.5">{opt.desc}</div>}
            </div>
            {isSelected && (
              <CheckCircle size={16} className="text-[color:var(--accent)] shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function WizardFlow({ steps, introText }) {
  const sendMessage = useStore(s => s.sendMessage);
  const isStreaming = useStore(s => s.isStreaming);
  const [revealed, setRevealed] = useState(1);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const bottomRef = useRef(null);
  const autoAdvanceRef = useRef(null);

  const total = steps.length;

  const stepKey = (idx) => steps[idx]?.data?.id || idx;
  const stepAnswer = (idx) => answers[stepKey(idx)];

  const isStepComplete = (idx) => {
    const step = steps[idx];
    if (!step) return false;
    const ans = stepAnswer(idx);
    if (step.type === 'choice') {
      return step.data.multi ? (Array.isArray(ans) && ans.length > 0) : ans != null;
    }
    if (step.type === 'input') {
      const vals = ans || {};
      return (step.data.fields || []).filter(f => f.required !== false).every(f => (vals[f.id] || '').trim());
    }
    return false;
  };

  const getAnswerLabel = (idx) => {
    const step = steps[idx];
    const ans = stepAnswer(idx);
    if (!step || ans == null) return '';
    if (step.type === 'choice') {
      const chosen = step.data.multi ? ans : [ans];
      return chosen.map(id => step.data.options.find(o => o.id === id)?.label).filter(Boolean).join(', ');
    }
    if (step.type === 'input') {
      const vals = ans || {};
      return (step.data.fields || []).map(f => vals[f.id]).filter(Boolean).join(', ');
    }
    return '';
  };

  useEffect(() => {
    if (bottomRef.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 120);
    }
  }, [revealed, editingIdx]);

  const advanceFrom = useCallback((idx) => {
    const nextRevealed = idx + 2;
    if (nextRevealed > revealed && idx + 1 < total) {
      setTimeout(() => setRevealed(nextRevealed), 350);
    }
  }, [revealed, total]);

  const handleStepAnswer = (idx, value) => {
    const key = stepKey(idx);
    const step = steps[idx];
    setAnswers(prev => ({ ...prev, [key]: value }));

    if (step?.type === 'choice' && !step.data.multi && value != null && editingIdx === null) {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = setTimeout(() => {
        advanceFrom(idx);
      }, 600);
    }
  };

  const handleStepDone = (idx) => {
    if (!isStepComplete(idx)) return;
    setEditingIdx(null);
    advanceFrom(idx);
  };

  const handleEdit = (idx) => {
    setEditingIdx(idx);
  };

  const handleConfirm = () => {
    if (submitted || isStreaming) return;
    const parts = steps.map((step, idx) => {
      const ans = stepAnswer(idx);
      const title = step.data.title || `问题 ${idx + 1}`;
      if (step.type === 'choice') {
        const chosen = step.data.multi ? ans : [ans];
        const labels = chosen.map(id => step.data.options.find(o => o.id === id)?.label).filter(Boolean);
        return `${title}: ${labels.join(', ')}`;
      }
      if (step.type === 'input') {
        const vals = ans || {};
        const entries = (step.data.fields || []).map(f => `${f.label}: ${vals[f.id] || '(未填写)'}`);
        return `${title}:\n${entries.join('\n')}`;
      }
      return '';
    });
    const msg = `[方案确认] 以下是我的选择：\n\n${parts.join('\n\n')}`;
    sendMessage({ message: msg });
    setSubmitted(true);
  };

  const allComplete = steps.every((_, idx) => isStepComplete(idx));
  const completedCount = steps.filter((_, i) => isStepComplete(i)).length;

  if (submitted) {
    return (
      <div className="my-4 surface border border-emerald-500/30 overflow-hidden wizard-card-enter">
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-500/10 to-transparent">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle size={18} /> 方案已确认
          </div>
        </div>
        <div className="px-5 py-3 space-y-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-[color:var(--text-soft)]">
                <span className="font-medium text-[color:var(--text)]">{step.data.title}：</span>
                {getAnswerLabel(idx)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 my-3">
      {/* 进度指示 */}
      <div className="flex items-center gap-2 px-1">
        <Map size={14} className="text-[color:var(--accent)]" />
        <span className="text-xs font-medium text-[color:var(--text-soft)]">
          规划进度
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-[color:var(--bg-soft)] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[color:var(--accent)] to-[#5e8bff] transition-all duration-500 ease-out"
            style={{ width: `${(completedCount / total) * 100}%` }}
          />
        </div>
        <span className="text-xs text-[color:var(--text-faint)]">
          {completedCount}/{total}
        </span>
      </div>

      {/* 逐一展示的卡片 */}
      {steps.slice(0, revealed).map((step, idx) => {
        const key = stepKey(idx);
        const completed = isStepComplete(idx);
        const isEditing = editingIdx === idx;
        const needsConfirmBtn = step.type !== 'choice' || step.data.multi;

        if (completed && !isEditing) {
          return (
            <div
              key={key}
              className="wizard-card-enter surface border border-emerald-500/20 overflow-hidden group/done"
            >
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Check size={14} strokeWidth={3} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[color:var(--text)]">{step.data.title}</div>
                  <div className="text-xs text-[color:var(--text-faint)] truncate mt-0.5">{getAnswerLabel(idx)}</div>
                </div>
                <button
                  onClick={() => handleEdit(idx)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-[color:var(--text-faint)]
                    hover:text-[color:var(--accent)] hover:bg-[color:var(--accent-soft)]
                    opacity-0 group-hover/done:opacity-100 transition-all"
                >
                  修改
                </button>
              </div>
            </div>
          );
        }

        return (
          <div
            key={key}
            className="wizard-card-enter surface overflow-hidden border border-[color:var(--accent)]/30 shadow-[0_2px_16px_var(--accent-glow)] transition-all"
          >
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-[color:var(--accent)] text-white shadow-[0_0_10px_var(--accent-glow)]">
                  {idx + 1}
                </div>
                <div className="text-sm font-semibold text-[color:var(--text)]">{step.data.title}</div>
                {step.type === 'choice' && (
                  <Badge tone="accent">{step.data.multi ? '可多选' : '单选'}</Badge>
                )}
                <div className="ml-auto text-xs text-[color:var(--text-faint)]">{idx + 1}/{total}</div>
              </div>
              {step.data.desc && (
                <div className="text-xs text-[color:var(--text-faint)] ml-9 mb-1">{step.data.desc}</div>
              )}
            </div>

            <div className="px-4 pb-3">
              {step.type === 'choice' && (
                <ChoiceBlockInline
                  data={step.data}
                  value={answers[key]}
                  onChange={(v) => handleStepAnswer(idx, v)}
                  disabled={false}
                />
              )}
              {step.type === 'input' && (
                <InputBlockInline
                  data={step.data}
                  value={answers[key]}
                  onChange={(v) => handleStepAnswer(idx, v)}
                  disabled={false}
                />
              )}
            </div>

            {needsConfirmBtn && (
              <div className="px-4 pb-3 flex justify-end">
                <button
                  onClick={() => handleStepDone(idx)}
                  disabled={!isStepComplete(idx)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                    isStepComplete(idx)
                      ? 'bg-[color:var(--accent)] text-white hover:opacity-90 shadow-soft hover:-translate-y-px active:translate-y-0'
                      : 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] cursor-not-allowed',
                  )}
                >
                  {isEditing ? (
                    <><Check size={13} /> 确认修改</>
                  ) : idx < total - 1 ? (
                    <><ArrowRight size={13} /> 下一个问题</>
                  ) : (
                    <><Check size={13} /> 完成</>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* 全部完成后的确认按钮 */}
      {allComplete && editingIdx === null && (
        <div className="wizard-card-enter">
          <button
            onClick={handleConfirm}
            disabled={isStreaming}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold transition-all',
              'bg-gradient-to-r from-[color:var(--accent)] to-[#5e8bff] text-white',
              'hover:shadow-[0_6px_28px_var(--accent-glow)] hover:-translate-y-px active:translate-y-0',
              isStreaming && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Sparkles size={16} /> 确认方案，开始工作
          </button>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function PlanEntryBlock({ data, introText }) {
  const sendMessage = useStore(s => s.sendMessage);
  const isStreaming = useStore(s => s.isStreaming);
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (optId) => {
    if (submitted || isStreaming) return;
    setSelected(optId);
    const opt = data.options.find(o => o.id === optId);
    const msg = `[选择结果] ${data.title}: ${opt?.label || optId}`;
    sendMessage({ message: msg });
    setSubmitted(true);
  };

  const ICON_MAP = { quick: Zap, plan: Map };

  if (submitted) {
    const opt = data.options.find(o => o.id === selected);
    const isPlan = selected === 'plan';
    return (
      <div className={cn(
        'my-4 surface overflow-hidden border',
        isPlan ? 'border-[color:var(--accent)]/30' : 'border-emerald-500/30',
      )}>
        <div className={cn(
          'px-5 py-4 bg-gradient-to-r to-transparent',
          isPlan ? 'from-[color:var(--accent)]/10' : 'from-emerald-500/10',
        )}>
          <div className={cn(
            'flex items-center gap-2.5 text-sm font-semibold',
            isPlan ? 'text-[color:var(--accent)]' : 'text-emerald-600 dark:text-emerald-400',
          )}>
            {isPlan ? <Map size={18} /> : <Zap size={18} />}
            {isPlan ? '已进入规划模式' : '快速回答模式'}
          </div>
          <div className="text-xs text-[color:var(--text-faint)] mt-1">{opt?.desc}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 plan-entry-card surface overflow-hidden border border-[color:var(--accent)]/25">
      <div className="plan-entry-header px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="plan-entry-icon w-10 h-10 rounded-xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-lg">
            <Rocket size={20} />
          </div>
          <div>
            <div className="text-base font-bold text-[color:var(--text)]">选择工作方式</div>
            <div className="text-xs text-[color:var(--text-faint)] mt-0.5">我可以快速给出建议，也可以和你一起深入规划</div>
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 grid grid-cols-2 gap-3">
        {(data.options || []).map(opt => {
          const IconComp = ICON_MAP[opt.id] || Zap;
          const isPlan = opt.id === 'plan';
          return (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              disabled={isStreaming}
              className={cn(
                'plan-entry-option group/popt relative text-left p-4 rounded-xl border-2 transition-all',
                isPlan
                  ? 'border-[color:var(--accent)]/30 hover:border-[color:var(--accent)] hover:shadow-[0_4px_24px_var(--accent-glow)] bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent'
                  : 'border-[color:var(--line)] hover:border-[color:var(--accent)]/40 hover:shadow-md bg-[color:var(--bg-elev)]',
                isStreaming && 'opacity-50 cursor-not-allowed',
              )}
            >
              {isPlan && (
                <div className="absolute -top-2 -right-2">
                  <Badge tone="accent">推荐</Badge>
                </div>
              )}
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-all',
                isPlan
                  ? 'bg-[color:var(--accent)] text-white shadow-[0_2px_12px_var(--accent-glow)] group-hover/popt:scale-110'
                  : 'bg-[color:var(--bg-soft)] text-[color:var(--text-soft)] group-hover/popt:bg-[color:var(--accent-soft)] group-hover/popt:text-[color:var(--accent)]',
              )}>
                <IconComp size={18} />
              </div>
              <div className="text-sm font-semibold text-[color:var(--text)] mb-1">{opt.label}</div>
              <div className="text-xs text-[color:var(--text-faint)] leading-relaxed">{opt.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SingleChoiceBlock({ data }) {
  const sendMessage = useStore(s => s.sendMessage);
  const isStreaming = useStore(s => s.isStreaming);
  const [selected, setSelected] = useState(data.multi ? [] : null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (submitted || isStreaming) return;
    const chosen = data.multi ? selected : [selected];
    const labels = chosen.map(id => data.options.find(o => o.id === id)?.label).filter(Boolean);
    const msg = `[选择结果] ${data.title}: ${labels.join(', ')}`;
    sendMessage({ message: msg });
    setSubmitted(true);
  };

  const hasSelection = data.multi ? selected.length > 0 : selected != null;

  return (
    <div className="my-3 surface border border-[color:var(--accent)]/20 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-[color:var(--accent-soft)] to-transparent border-b border-[color:var(--line)]">
        <div className="text-sm font-semibold text-[color:var(--text)] flex items-center gap-2">
          <ListTodo size={15} className="text-[color:var(--accent)]" />
          {data.title || '请选择'}
        </div>
        <div className="text-xs text-[color:var(--text-faint)] mt-0.5">
          {data.multi ? '可多选' : '单选'} · {submitted ? '已提交' : '请选择后确认'}
        </div>
      </div>
      <div className="p-3">
        <ChoiceBlockInline
          data={data}
          value={selected}
          onChange={setSelected}
          disabled={submitted}
        />
      </div>
      {!submitted && (
        <div className="px-4 pb-3 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!hasSelection || isStreaming}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              hasSelection && !isStreaming
                ? 'bg-[color:var(--accent)] text-white hover:opacity-90 shadow-soft'
                : 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] cursor-not-allowed'
            )}
          >
            确认选择
          </button>
        </div>
      )}
    </div>
  );
}

function SingleInputBlock({ data }) {
  const sendMessage = useStore(s => s.sendMessage);
  const isStreaming = useStore(s => s.isStreaming);
  const [values, setValues] = useState(() =>
    Object.fromEntries((data.fields || []).map(f => [f.id, f.default || '']))
  );
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (submitted || isStreaming) return;
    const entries = (data.fields || []).map(f => `${f.label}: ${values[f.id] || '(未填写)'}`);
    const msg = `[信息回复] ${data.title || '用户回复'}:\n${entries.join('\n')}`;
    sendMessage({ message: msg });
    setSubmitted(true);
  };

  const allFilled = (data.fields || []).filter(f => f.required !== false).every(f => (values[f.id] || '').trim());

  return (
    <div className="my-3 surface border border-[color:var(--accent)]/20 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-[color:var(--accent-soft)] to-transparent border-b border-[color:var(--line)]">
        <div className="text-sm font-semibold text-[color:var(--text)] flex items-center gap-2">
          <MessageCircleQuestion size={15} className="text-[color:var(--accent)]" />
          {data.title || '请提供信息'}
        </div>
        {data.desc && (
          <div className="text-xs text-[color:var(--text-faint)] mt-0.5">{data.desc}</div>
        )}
      </div>
      <div className="p-3">
        <InputBlockInline
          data={data}
          value={values}
          onChange={setValues}
          disabled={submitted}
        />
      </div>
      {!submitted && (
        <div className="px-4 pb-3 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!allFilled || isStreaming}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              allFilled && !isStreaming
                ? 'bg-[color:var(--accent)] text-white hover:opacity-90 shadow-soft'
                : 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] cursor-not-allowed'
            )}
          >
            <Send size={13} /> 提交
          </button>
        </div>
      )}
      {submitted && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Check size={13} /> 已提交
          </div>
        </div>
      )}
    </div>
  );
}

// ── RAG 知识库引用解析与渲染 ──────────────────────────────────────
const KB_CITATION_RE = /<!--\s*KB_CITATIONS:\s*(\[[\s\S]*?\])\s*-->/;

function parseCitations(text) {
  if (!text) return { cleanText: text, citations: [] };
  const m = text.match(KB_CITATION_RE);
  if (!m) return { cleanText: text, citations: [] };
  let citations = [];
  try { citations = JSON.parse(m[1]); } catch { /* ignore */ }
  const cleanText = text.replace(KB_CITATION_RE, '').trimEnd();
  return { cleanText, citations };
}

function CitationBadge({ id, citation }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold
          bg-[color:var(--accent-soft)] text-[color:var(--accent)] rounded-full
          align-super -mt-1 mx-0.5 cursor-pointer
          hover:bg-[color:var(--accent)] hover:text-white transition"
      >
        {id}
      </button>
      {show && citation && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 z-50 animate-rise">
          <div className="surface border border-[color:var(--line)] shadow-lg rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <BookOpen size={13} className="text-[color:var(--accent)] shrink-0" />
              <span className="text-xs font-semibold text-[color:var(--text)] truncate">{citation.title || citation.file}</span>
            </div>
            <div className="text-xs text-[color:var(--text-soft)] leading-relaxed line-clamp-4">
              {citation.excerpt}
            </div>
            <div className="mt-1.5 text-[10px] text-[color:var(--text-faint)] font-mono truncate">{citation.file}</div>
          </div>
        </div>
      )}
    </span>
  );
}

function CitationFooter({ citations }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;
  return (
    <div className="mt-3 surface-soft border border-[color:var(--accent)]/15 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition"
      >
        <BookOpen size={14} className="text-[color:var(--accent)] shrink-0" />
        <span className="text-xs font-medium text-[color:var(--text-soft)]">
          引用了 {citations.length} 篇知识库文档
        </span>
        {open ? <ChevronDown size={13} className="ml-auto text-[color:var(--text-faint)]" /> : <ChevronRight size={13} className="ml-auto text-[color:var(--text-faint)]" />}
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-2 animate-rise">
          {citations.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                {c.id}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[color:var(--text)]">{c.title || c.file}</div>
                <div className="text-[11px] text-[color:var(--text-faint)] leading-relaxed mt-0.5 line-clamp-2">{c.excerpt}</div>
                <div className="text-[10px] text-[color:var(--text-faint)] font-mono mt-0.5">{c.file}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 自定义 ReactMarkdown 组件：将 [N] 样式引用标记渲染为 CitationBadge
function makeCitationMdComponents(baseCmps, citations) {
  if (!citations || citations.length === 0) return baseCmps;
  return {
    ...baseCmps,
    p({ children, ...rest }) {
      return <p {...rest}>{injectCitationBadges(children, citations)}</p>;
    },
    li({ children, ...rest }) {
      return <li {...rest}>{injectCitationBadges(children, citations)}</li>;
    },
  };
}

function injectCitationBadges(children, citations) {
  if (!children) return children;
  const arr = Array.isArray(children) ? children : [children];
  const result = [];
  for (const child of arr) {
    if (typeof child !== 'string') { result.push(child); continue; }
    const re = /\[(\d+)\]/g;
    let last = 0;
    let m;
    while ((m = re.exec(child)) !== null) {
      if (m.index > last) result.push(child.slice(last, m.index));
      const id = parseInt(m[1], 10);
      const cite = citations.find(c => c.id === id);
      result.push(<CitationBadge key={`cite-${id}-${m.index}`} id={id} citation={cite} />);
      last = re.lastIndex;
    }
    if (last < child.length) result.push(child.slice(last));
  }
  return result;
}

export function TextBlock({ text, live }) {
  if (!text) return null;

  const { cleanText, citations } = useMemo(() => parseCitations(text), [text]);
  const hasCitations = citations.length > 0;
  const renderText = hasCitations ? cleanText : text;

  const citationMdCmps = useMemo(
    () => hasCitations ? makeCitationMdComponents(MD_COMPONENTS, citations) : MD_COMPONENTS,
    [hasCitations, citations]
  );

  const parts = useMemo(() => splitTextAndInteractiveBlocks(renderText, live), [renderText, live]);

  if (parts.length === 1 && parts[0].type === 'md') {
    return (
      <>
        <div className={cn('md-block text-[15px] leading-7', live && 'caret')}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={citationMdCmps}>{renderText}</ReactMarkdown>
        </div>
        {!live && <CitationFooter citations={citations} />}
      </>
    );
  }

  const interactiveSteps = parts.filter(p => p.type === 'choice' || p.type === 'input');
  const mdParts = parts.filter(p => p.type === 'md');
  const introText = mdParts.map(p => p.content).join('\n').trim();
  const hasPending = parts.some(p => p.type === 'pending-interactive');

  const isPlanEntry = interactiveSteps.length === 1
    && interactiveSteps[0].type === 'choice'
    && interactiveSteps[0].data?.id === 'plan_entry';

  if (isPlanEntry && !live) {
    return (
      <>
        {introText && (
          <div className="md-block text-[15px] leading-7">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{introText}</ReactMarkdown>
          </div>
        )}
        <PlanEntryBlock data={interactiveSteps[0].data} introText={introText} />
      </>
    );
  }

  if (interactiveSteps.length >= 2 && !live) {
    return (
      <>
        {introText && (
          <div className="md-block text-[15px] leading-7">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{introText}</ReactMarkdown>
          </div>
        )}
        <WizardFlow steps={interactiveSteps} introText={introText} />
      </>
    );
  }

  if (live && interactiveSteps.length > 0) {
    return (
      <>
        {introText && (
          <div className="md-block text-[15px] leading-7 caret">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{introText}</ReactMarkdown>
          </div>
        )}
        <PendingInteractivePlaceholder />
      </>
    );
  }

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === 'choice') return <SingleChoiceBlock key={i} data={p.data} />;
        if (p.type === 'input') return <SingleInputBlock key={i} data={p.data} />;
        if (p.type === 'pending-interactive') return <PendingInteractivePlaceholder key={i} />;
        return (
          <div key={i} className={cn('md-block text-[15px] leading-7', live && i === parts.length - 1 && 'caret')}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={citationMdCmps}>{p.content}</ReactMarkdown>
          </div>
        );
      })}
      {!live && <CitationFooter citations={citations} />}
    </>
  );
}

export function BlocksRenderer({ blocks, live }) {
  return (
    <div className="space-y-1">
      {blocks.map((b, i) => {
        const isLast = i === blocks.length - 1;
        if (b.type === 'thinking') return <ThinkingCard key={i} text={b.text} live={live && isLast} />;
        if (b.type === 'tool') return <ToolCard key={i} {...b} />;
        if (b.type === 'text') return <TextBlock key={i} text={b.text} live={live && isLast} />;
        return null;
      })}
    </div>
  );
}

// ── Usage 徽章（每条 assistant 消息底部展示）─────────────────
export function UsageFooter({ usageJSON, modelOverride }) {
  const usage = useMemo(() => {
    if (!usageJSON) return null;
    try { return typeof usageJSON === 'string' ? JSON.parse(usageJSON) : usageJSON; } catch { return null; }
  }, [usageJSON]);
  if (!usage) return null;

  const totalIn = (usage.input_tokens || 0) + (usage.cache_read_tokens || 0);
  const out = usage.output_tokens || 0;
  const cost = usage.cost_usd || 0;
  const ms = usage.duration_ms || 0;
  const model = modelOverride || usage.model;

  return (
    <div className="mt-2 pt-2 border-t border-[color:var(--line)] flex items-center gap-3 text-xs text-[color:var(--text-faint)] flex-wrap">
      {model && (
        <span className="inline-flex items-center gap-1">
          <Cpu size={12} />{model}
        </span>
      )}
      <span className="inline-flex items-center gap-1" title="输入 / 输出 token">
        ↑{formatNum(totalIn)} ↓{formatNum(out)}
      </span>
      {cost > 0 && (
        <span className="inline-flex items-center gap-1">
          <Coins size={12} />${cost.toFixed(4)}{usage.estimated && <span className="text-amber-500/80">~</span>}
        </span>
      )}
      {ms > 0 && (
        <span className="inline-flex items-center gap-1">
          <Clock size={12} />{(ms / 1000).toFixed(1)}s
        </span>
      )}
      {usage.cache_read_tokens > 0 && (
        <Badge tone="success">cache hit {formatNum(usage.cache_read_tokens)}</Badge>
      )}
    </div>
  );
}

