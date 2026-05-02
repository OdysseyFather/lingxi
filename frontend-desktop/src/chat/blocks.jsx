import { useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Wrench, Search, Globe, FileText, Code2, Pencil,
  ListTodo, FolderOpen, Terminal, ChevronDown, ChevronRight,
  Loader2, CheckCircle2, AlertCircle, Cpu, Coins, Clock,
} from 'lucide-react';
import { Badge, cn } from '../ui/primitives';

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
  const [open, setOpen] = useState(live); // 流式时默认展开，结束后收起
  useEffect(() => { if (!live) setOpen(false); }, [live]);
  if (!text && !live) return null;
  const lines = (text || '').split('\n');
  const preview = lines.slice(-3).join('\n').slice(-180);
  return (
    <div className="surface-soft my-2 overflow-hidden border border-[color:var(--line)]">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition"
        onClick={() => setOpen(!open)}
      >
        <div className="w-7 h-7 rounded-md bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center">
          <Brain size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            {live ? '深度思考中…' : '已思考'}
            {live && <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-breathe" />}
          </div>
          {!open && (
            <div className="text-xs text-[color:var(--text-faint)] truncate font-mono">
              {preview || '组织思路…'}
            </div>
          )}
        </div>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={cn(
              'px-4 pb-3 pt-1 text-[13px] leading-relaxed whitespace-pre-wrap font-mono',
              'text-[color:var(--text-soft)]',
              live && 'thinking-shimmer',
            )}>
              {text || '组织思路…'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const Icon = iconForTool(name);
  const [open, setOpen] = useState(false);
  const dur = ms != null ? ms : (endedAt && startedAt ? Math.max(1, endedAt - startedAt) : null);
  const cat = toolCategory(name);
  const failed = status === 'failed';

  const showDetail = Boolean(input);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={cn(
        'surface-soft my-2 border overflow-hidden',
        failed ? 'border-red-500/40' : 'border-[color:var(--line)]',
      )}
    >
      <button
        type="button"
        onClick={() => showDetail && setOpen((v) => !v)}
        className={cn(
          'w-full px-3 py-2 flex items-center gap-3 text-left transition',
          showDetail && 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer',
        )}
      >
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all',
          failed
            ? 'bg-red-500/10 text-red-500'
            : done
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] shadow-glow',
        )}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            <span className="truncate">{label || '执行技能'}</span>
            <Badge tone={cat.tone}>{cat.tag}</Badge>
          </div>
          <div className="text-xs text-[color:var(--text-faint)] truncate font-mono">
            {input || name}
          </div>
        </div>
        <div className="text-xs flex items-center gap-2">
          {failed ? (
            <span className="inline-flex items-center gap-1 text-red-500">
              <AlertCircle size={14} />失败
            </span>
          ) : done ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={14} />完成{dur ? ` · ${(dur / 1000).toFixed(1)}s` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[color:var(--accent)]">
              <Loader2 size={14} className="animate-spin" />进行中
            </span>
          )}
          {showDetail && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && showDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-0 text-[12px] font-mono text-[color:var(--text-soft)] whitespace-pre-wrap break-all">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)] mb-1">输入摘要</div>
              <div>{input}</div>
              <div className="mt-1 text-[10px] text-[color:var(--text-faint)]">
                工具: {name}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function TextBlock({ text, live }) {
  if (!text) return null;
  return (
    <div className={cn('md-block text-[15px] leading-7', live && 'caret')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

// 渲染一个 block 数组（assistant 内容的核心）
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

// 解析持久化的 assistant content：可能是 JSON blocks 数组，也可能是普通文本
export function parseAssistantContent(content) {
  if (!content) return [];
  try {
    const arr = JSON.parse(content);
    if (Array.isArray(arr)) return arr;
  } catch {}
  return [{ type: 'text', text: String(content) }];
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
          <Coins size={12} />${cost.toFixed(4)}
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

export function formatNum(n) {
  if (!n) return 0;
  if (n < 1000) return n;
  if (n < 1000000) return (n / 1000).toFixed(1) + 'k';
  return (n / 1000000).toFixed(2) + 'M';
}
