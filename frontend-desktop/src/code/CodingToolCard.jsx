import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Pencil, Terminal, Search, FolderOpen, Wrench, Code2,
  ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle, Copy, Check,
  Eye, Upload, Globe, ListTodo,
} from 'lucide-react';
import { cn } from '../ui/cn';

const TOOL_META = {
  Read:       { icon: Eye,        color: 'blue',    label: 'Read' },
  Glob:       { icon: FolderOpen, color: 'blue',    label: 'Glob' },
  Grep:       { icon: Search,     color: 'amber',   label: 'Grep' },
  LS:         { icon: FolderOpen, color: 'blue',    label: 'LS' },
  Edit:       { icon: Pencil,     color: 'purple',  label: 'Edit' },
  MultiEdit:  { icon: Pencil,     color: 'purple',  label: 'MultiEdit' },
  StrReplace: { icon: Pencil,     color: 'purple',  label: 'StrReplace' },
  Write:      { icon: Upload,     color: 'purple',  label: 'Write' },
  Bash:       { icon: Terminal,   color: 'emerald', label: 'Bash' },
  Shell:      { icon: Terminal,   color: 'emerald', label: 'Shell' },
  WebFetch:   { icon: Globe,      color: 'sky',     label: 'WebFetch' },
  WebSearch:  { icon: Globe,      color: 'sky',     label: 'WebSearch' },
  Task:        { icon: ListTodo,   color: 'indigo',  label: 'Task' },
  TodoWrite:   { icon: ListTodo,   color: 'gray',    label: 'TodoWrite' },
  TaskCreate:  { icon: ListTodo,   color: 'gray',    label: 'TaskCreate' },
  TaskUpdate:  { icon: ListTodo,   color: 'gray',    label: 'TaskUpdate' },
};

const COLOR_MAP = {
  blue:    { border: 'border-l-blue-400',    bg: 'bg-blue-50/20',    text: 'text-blue-500',    glow: 'shadow-blue-100/30' },
  amber:   { border: 'border-l-amber-400',   bg: 'bg-amber-50/20',   text: 'text-amber-600',   glow: 'shadow-amber-100/30' },
  purple:  { border: 'border-l-purple-400',  bg: 'bg-purple-50/20',  text: 'text-purple-500',  glow: 'shadow-purple-100/30' },
  emerald: { border: 'border-l-emerald-400', bg: 'bg-emerald-50/20', text: 'text-emerald-500', glow: 'shadow-emerald-100/30' },
  sky:     { border: 'border-l-sky-400',     bg: 'bg-sky-50/20',     text: 'text-sky-500',     glow: 'shadow-sky-100/30' },
  indigo:  { border: 'border-l-indigo-400',  bg: 'bg-indigo-50/20',  text: 'text-indigo-500',  glow: 'shadow-indigo-100/30' },
  gray:    { border: 'border-l-gray-300',    bg: 'bg-gray-50/20',    text: 'text-gray-500',    glow: '' },
  red:     { border: 'border-l-red-400',     bg: 'bg-red-50/20',     text: 'text-red-400',     glow: '' },
};

function getMeta(name) {
  if (TOOL_META[name]) return TOOL_META[name];
  if (name?.startsWith('mcp__')) return { icon: Wrench, color: 'gray', label: name.replace('mcp__', '') };
  return { icon: Code2, color: 'gray', label: name || 'Tool' };
}

function parseToolJSON(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export function CodingToolCard({ name, label, done, input, fullInput, status, ms, fileDiff, block, defaultExpanded }) {
  const actualName = block?.name || name;
  const actualDone = block?.done !== undefined ? block.done : done;
  const actualInput = block?.fullInput || block?.input || fullInput || input;
  const actualStatus = block?.status || status;
  const actualMs = block?.ms || ms;
  const actualFileDiff = block?.fileDiff || fileDiff;
  const actualLabel = block?.label || label;

  const isSubAgentTool = actualName === 'Task' || actualName === 'TaskCreate';
  const [detailOpen, setDetailOpen] = useState(isSubAgentTool ? false : (defaultExpanded || false));
  const [copied, setCopied] = useState(false);
  const meta = getMeta(actualName);
  const Icon = meta.icon;
  const failed = actualStatus === 'failed';
  const hasDiff = Boolean(actualFileDiff?.diff);
  const parsed = useMemo(() => parseToolJSON(actualInput), [actualInput]);
  const colorSet = COLOR_MAP[failed ? 'red' : meta.color] || COLOR_MAP.gray;

  const filePath = useMemo(() => {
    if (!parsed) return '';
    return parsed.file_path || parsed.path || '';
  }, [parsed]);

  const handleCopyPath = useCallback((e) => {
    e.stopPropagation();
    if (filePath) {
      navigator.clipboard.writeText(filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [filePath]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'my-1.5 rounded-xl border border-[var(--coding-border)]/60 border-l-[3px] overflow-hidden transition-all duration-300',
        colorSet.border,
        actualDone === false && !failed ? `${colorSet.bg} shadow-sm ${colorSet.glow}` : 'bg-[var(--coding-surface-raised)]/60',
        'hover:shadow-sm hover:border-[var(--coding-border)]'
      )}
    >
      <button
        onClick={() => setDetailOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left hover:bg-[var(--accent-soft)]/30 transition-colors"
      >
        {/* Status icon */}
        <span className="shrink-0">
          {actualDone === false && !failed ? (
            <Loader2 size={14} className={cn('animate-spin', colorSet.text)} />
          ) : failed ? (
            <AlertCircle size={14} className="text-red-400" />
          ) : (
            <CheckCircle2 size={14} className="text-emerald-500" />
          )}
        </span>

        {/* Tool name badge */}
        <span className={cn(
          'shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold',
          `${colorSet.bg} ${colorSet.text}`
        )}>
          {meta.label}
        </span>

        {/* Primary info */}
        <span className="flex-1 min-w-0 truncate text-[12px] font-mono text-[var(--text-soft)]">
          {actualName === 'Bash' || actualName === 'Shell'
            ? parsed?.command && (
                <><span className="text-emerald-600">$</span> {parsed.command.length > 100 ? parsed.command.slice(0, 100) + '…' : parsed.command}</>
              )
            : actualName === 'Task'
              ? <span className="text-indigo-600 not-italic font-sans">{parsed?.description || ''}</span>
              : (actualName === 'WebFetch' || actualName === 'WebSearch')
                ? <span className="text-sky-600">{parsed?.url || parsed?.query || parsed?.search_term || ''}</span>
                : (actualName === 'Grep' || actualName === 'Glob') && parsed?.pattern && !filePath
                  ? <span className="text-amber-600">{parsed.pattern}</span>
                  : filePath
                    ? <span className="text-[var(--accent)] cursor-pointer hover:underline" onClick={handleCopyPath} title={filePath}>
                        {filePath.length > 70 ? '…' + filePath.slice(-65) : filePath}
                      </span>
                    : null
          }
        </span>

        {/* Diff stats */}
        {hasDiff && actualDone && (
          <span className="text-[10px] flex items-center gap-1 shrink-0 font-mono">
            {actualFileDiff.added > 0 && <span className="text-emerald-600 font-bold">+{actualFileDiff.added}</span>}
            {actualFileDiff.removed > 0 && <span className="text-red-500 font-bold">-{actualFileDiff.removed}</span>}
          </span>
        )}

        {/* Duration */}
        {actualDone && actualMs > 0 && (
          <span className="text-[11px] text-[var(--text-faint)] font-mono shrink-0">
            {actualMs > 1000 ? `${(actualMs / 1000).toFixed(1)}s` : `${actualMs}ms`}
          </span>
        )}

        {/* Chevron */}
        {(actualInput || hasDiff) && (
          <span className="text-[var(--text-faint)] shrink-0">
            {detailOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>

      {/* Detail panel */}
      <AnimatePresence>
        {detailOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ToolDetailPanel
              name={actualName}
              parsed={parsed}
              filePath={filePath}
              fileDiff={actualFileDiff}
              hasDiff={hasDiff}
              fullInput={typeof actualInput === 'string' ? actualInput : JSON.stringify(actualInput, null, 2)}
              copied={copied}
              onCopyPath={handleCopyPath}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ToolDetailPanel({ name, parsed, filePath, fileDiff, hasDiff, fullInput, copied, onCopyPath }) {
  const [diffOpen, setDiffOpen] = useState(true);

  return (
    <div className="mx-3 mb-2 rounded-lg border border-[var(--coding-border)]/50 overflow-hidden text-[12px] bg-[var(--coding-surface)]">
      {filePath && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--coding-surface-raised)]/50 border-b border-[var(--coding-border)]/50">
          <span className="text-[11px] text-[var(--text-faint)] font-mono truncate">{filePath}</span>
          <button onClick={onCopyPath} className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="Copy path">
            {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
          </button>
        </div>
      )}

      {hasDiff && (
        <div>
          <button
            onClick={(e) => { e.stopPropagation(); setDiffOpen(v => !v); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 bg-[var(--coding-surface-raised)]/30 border-b border-[var(--coding-border)]/50 text-[11px] hover:bg-[var(--accent-soft)] transition"
          >
            {diffOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="font-semibold text-[var(--text-soft)]">
              {fileDiff.isNew ? 'NEW FILE' : 'CHANGES'}
            </span>
            <span className="text-emerald-600 font-mono font-bold">+{fileDiff.added}</span>
            <span className="text-red-500 font-mono font-bold">-{fileDiff.removed}</span>
            <DiffBar added={fileDiff.added} removed={fileDiff.removed} />
          </button>
          <AnimatePresence>
            {diffOpen && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="max-h-[400px] overflow-y-auto scrollable font-mono text-[12px] leading-[1.6] bg-[var(--coding-surface-raised)]">
                  {fileDiff.diff.split('\n')
                    .filter(l => !l.startsWith('diff --git') && !l.startsWith('index ') && !l.startsWith('---') && !l.startsWith('+++'))
                    .map((line, i) => {
                      let bg = '';
                      let color = 'var(--text-soft)';
                      if (line.startsWith('@@')) { bg = 'bg-blue-500/5'; color = '#3b82f6'; }
                      else if (line.startsWith('+')) { bg = 'bg-emerald-500/8'; color = '#059669'; }
                      else if (line.startsWith('-')) { bg = 'bg-red-500/8'; color = '#dc2626'; }
                      return (
                        <div key={i} className={cn('px-3 whitespace-pre', bg)} style={{ color }}>
                          {line}
                        </div>
                      );
                    })
                  }
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {(name === 'Bash' || name === 'Shell') && parsed?.command && !hasDiff && (
        <div className="font-mono bg-[#1a1a2e] text-[#e0e0e0] p-3 leading-relaxed rounded-b-lg">
          <div className="text-emerald-400">$ {parsed.command}</div>
          {parsed.timeout && <div className="text-gray-500 mt-1 text-[11px]">timeout: {parsed.timeout}ms</div>}
        </div>
      )}

      {(name === 'Edit' || name === 'MultiEdit' || name === 'StrReplace') && parsed && !hasDiff && (
        <EditDetail parsed={parsed} />
      )}
      {name === 'Write' && parsed && !hasDiff && (
        <WriteDetail parsed={parsed} />
      )}
      {name === 'Read' && parsed && (
        <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)] font-mono">
          {parsed.file_path || parsed.path}
          {parsed.offset && <span className="ml-2 text-[var(--text-faint)]">offset:{parsed.offset}</span>}
          {parsed.limit && <span className="ml-2 text-[var(--text-faint)]">limit:{parsed.limit}</span>}
        </div>
      )}
      {(name === 'Grep' || name === 'Glob') && parsed && (
        <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)] font-mono">
          <span className="text-amber-500">pattern:</span> {parsed.pattern || parsed.glob_pattern}
          {parsed.path && <div className="text-[var(--text-faint)]">path: {parsed.path}</div>}
          {parsed.glob && <div className="text-[var(--text-faint)]">glob: {parsed.glob}</div>}
        </div>
      )}
      {name === 'Task' && parsed && (
        <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)]">
          {parsed.description && <div className="font-semibold text-indigo-600 mb-1">{parsed.description}</div>}
          {parsed.prompt && (
            <div className="text-[12px] whitespace-pre-wrap max-h-[200px] overflow-y-auto scrollable text-[var(--text-faint)]">
              {parsed.prompt.length > 500 ? parsed.prompt.slice(0, 500) + '…' : parsed.prompt}
            </div>
          )}
        </div>
      )}
      {!['Bash', 'Shell', 'Edit', 'MultiEdit', 'StrReplace', 'Write', 'Read', 'Grep', 'Glob', 'Task'].includes(name) && fullInput && !hasDiff && (
        <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)] font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto scrollable">
          {fullInput.length > 1000 ? fullInput.slice(0, 1000) + '\n…(truncated)' : fullInput}
        </div>
      )}
    </div>
  );
}

function DiffBar({ added, removed }) {
  const total = added + removed;
  if (!total) return null;
  const addBlocks = Math.min(added, 10);
  const removeBlocks = Math.min(removed, 10);
  return (
    <div className="flex items-center gap-px ml-1.5">
      {Array.from({ length: addBlocks }).map((_, i) => (
        <span key={`a${i}`} className="w-[3px] h-[10px] bg-emerald-500 rounded-[1px]" />
      ))}
      {Array.from({ length: removeBlocks }).map((_, i) => (
        <span key={`r${i}`} className="w-[3px] h-[10px] bg-red-400 rounded-[1px]" />
      ))}
    </div>
  );
}

function EditDetail({ parsed }) {
  const oldStr = parsed.old_string || parsed.old_str || '';
  const newStr = parsed.new_string || parsed.new_str || '';
  if (!oldStr && !newStr) {
    return (
      <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)] font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto scrollable">
        {JSON.stringify(parsed, null, 2).slice(0, 800)}
      </div>
    );
  }
  return (
    <div className="font-mono bg-[var(--coding-surface-raised)] max-h-[400px] overflow-y-auto scrollable">
      {oldStr && oldStr.split('\n').map((line, i) => (
        <div key={`o${i}`} className="px-3 whitespace-pre bg-red-500/8 text-red-600 leading-5">
          <span className="inline-block w-4 text-center select-none opacity-60">-</span>{line}
        </div>
      ))}
      {newStr && newStr.split('\n').map((line, i) => (
        <div key={`n${i}`} className="px-3 whitespace-pre bg-emerald-500/8 text-emerald-700 leading-5">
          <span className="inline-block w-4 text-center select-none opacity-60">+</span>{line}
        </div>
      ))}
    </div>
  );
}

function WriteDetail({ parsed }) {
  const content = parsed.content || parsed.file_text || '';
  if (!content) return null;
  const lines = content.split('\n');
  const preview = lines.length > 30 ? lines.slice(0, 30).join('\n') + `\n… (${lines.length - 30} more lines)` : content;
  return (
    <div className="font-mono bg-[var(--coding-surface-raised)] max-h-[300px] overflow-y-auto scrollable">
      {preview.split('\n').map((line, i) => (
        <div key={i} className="px-3 whitespace-pre bg-emerald-500/5 text-emerald-700 leading-5">
          <span className="inline-block w-8 text-right mr-2 text-[var(--text-faint)] select-none text-[11px]">{i + 1}</span>
          {line}
        </div>
      ))}
    </div>
  );
}
