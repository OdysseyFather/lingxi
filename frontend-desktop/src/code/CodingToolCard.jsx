import { useState, useCallback } from 'react';
import {
  FileText, Pencil, Terminal, Search, FolderOpen, Wrench, Code2,
  ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle, Copy, Check,
} from 'lucide-react';
import { cn } from '../ui/cn';

const TOOL_META = {
  Read:      { icon: FileText, color: 'blue',   label: '读取文件' },
  Glob:      { icon: FolderOpen, color: 'blue',  label: '搜索文件' },
  Grep:      { icon: Search, color: 'amber',     label: '搜索内容' },
  LS:        { icon: FolderOpen, color: 'blue',  label: '列出目录' },
  Edit:      { icon: Pencil, color: 'purple',    label: '编辑文件' },
  MultiEdit: { icon: Pencil, color: 'purple',    label: '批量编辑' },
  Write:     { icon: Pencil, color: 'purple',    label: '写入文件' },
  Bash:      { icon: Terminal, color: 'emerald',  label: '执行命令' },
};

function getMeta(name) {
  if (TOOL_META[name]) return TOOL_META[name];
  if (name?.startsWith('mcp__')) return { icon: Wrench, color: 'gray', label: name };
  return { icon: Code2, color: 'gray', label: name || '工具' };
}

export function CodingToolCard({ name, label, done, input, status, ms }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = getMeta(name);
  const Icon = meta.icon;
  const failed = status === 'failed';
  const showDetail = Boolean(input);

  const summary = buildSummary(name, input);
  const filePath = extractFilePath(name, input);
  const shortFilePath = filePath ? filePath.split('/').pop() : '';

  const handleCopyPath = useCallback((e) => {
    e.stopPropagation();
    if (filePath) {
      navigator.clipboard.writeText(filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [filePath]);

  return (
    <div className="my-1 overflow-hidden">
      <button
        type="button"
        onClick={() => showDetail && setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-[13px]',
          showDetail && 'hover:bg-[var(--accent-soft)] cursor-pointer transition',
        )}
      >
        <span className="shrink-0 text-[var(--text-faint)]">
          {!done && !failed ? (
            <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
          ) : (
            <Icon size={14} />
          )}
        </span>

        <span className="font-medium text-[var(--text-soft)]">{meta.label}</span>

        {shortFilePath && (
          <span className="text-[var(--text-faint)] font-mono text-[12px] truncate">{shortFilePath}</span>
        )}

        {summary && !shortFilePath && (
          <span className="text-[var(--text-faint)] truncate text-[12px] flex-1">{summary}</span>
        )}

        <span className="flex items-center gap-1.5 shrink-0 ml-auto text-[12px]">
          {failed ? (
            <span className="text-red-400 flex items-center gap-1">
              <AlertCircle size={13} /> 失败
            </span>
          ) : done ? (
            <CheckCircle2 size={14} className="text-green-500" />
          ) : (
            <span className="text-[var(--text-faint)]">执行中</span>
          )}
          {showDetail && (
            open ? <ChevronDown size={13} className="text-[var(--text-faint)]" />
                 : <ChevronRight size={13} className="text-[var(--text-faint)]" />
          )}
        </span>
      </button>

      {open && showDetail && (
        <div className="mx-4 mb-3 rounded-xl border border-[var(--coding-border)] overflow-hidden">
          {filePath && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--coding-surface)] border-b border-[var(--coding-border)]">
              <span className="text-[11px] text-[var(--text-faint)] font-mono truncate">{filePath}</span>
              <button onClick={handleCopyPath} className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="Copy path">
                {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
              </button>
            </div>
          )}
          {(name === 'Edit' || name === 'MultiEdit' || name === 'Write') && (
            <DiffStats input={input} />
          )}
          <div className="text-[12px] font-mono whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto scrollable bg-[var(--coding-surface-raised)]">
            {renderDetail(name, input)}
          </div>
        </div>
      )}
    </div>
  );
}

function DiffStats({ input }) {
  const lines = (input || '').split('\n');
  let added = 0, removed = 0;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('+') && !trimmed.startsWith('+++')) added++;
    else if (trimmed.startsWith('-') && !trimmed.startsWith('---')) removed++;
  }
  if (!added && !removed) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-[var(--coding-surface)] border-b border-[var(--coding-border)] text-[11px]">
      <span className="text-green-600 font-mono">+{added}</span>
      <span className="text-red-500 font-mono">-{removed}</span>
      <div className="flex items-center gap-0.5 ml-1">
        {Array.from({ length: Math.min(added, 20) }).map((_, i) => (
          <span key={`a${i}`} className="w-1.5 h-2 bg-green-500 rounded-[1px]" />
        ))}
        {Array.from({ length: Math.min(removed, 20) }).map((_, i) => (
          <span key={`r${i}`} className="w-1.5 h-2 bg-red-400 rounded-[1px]" />
        ))}
      </div>
    </div>
  );
}

function extractFilePath(name, input) {
  if (!input) return '';
  if (name === 'Read' || name === 'Write' || name === 'Edit' || name === 'MultiEdit') {
    const match = input.match(/(?:file_path|path)['":\s]+([^\s'",$}]+)/);
    return match ? match[1] : '';
  }
  return '';
}

function buildSummary(name, input) {
  if (!input) return '';
  if (name === 'Bash') {
    const match = input.match(/(?:command)['":\s]+(.+?)(?:['"}]|$)/);
    return match ? `$ ${match[1].slice(0, 80)}` : input.slice(0, 80);
  }
  if (name === 'Grep') {
    const match = input.match(/(?:pattern)['":\s]+(.+?)(?:['"}]|$)/);
    return match ? `/${match[1]}/` : input.slice(0, 60);
  }
  if (name === 'Glob') {
    const match = input.match(/(?:pattern|glob)['":\s]+(.+?)(?:['"}]|$)/);
    return match ? match[1] : input.slice(0, 60);
  }
  return '';
}

function renderDetail(name, input) {
  if (name === 'Edit' || name === 'MultiEdit' || name === 'Write') {
    return <DiffPreview input={input} />;
  }
  if (name === 'Bash') {
    return <BashPreview input={input} />;
  }
  return <div className="p-3 text-[var(--text-soft)]">{input}</div>;
}

function DiffPreview({ input }) {
  const lines = (input || '').split('\n');
  return (
    <div>
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        let cls = 'text-[var(--text-soft)] bg-[var(--coding-surface-raised)]';
        let lineNum = i + 1;
        let marker = ' ';
        if (trimmed.startsWith('+') && !trimmed.startsWith('+++')) {
          cls = 'text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400';
          marker = '+';
        } else if (trimmed.startsWith('-') && !trimmed.startsWith('---')) {
          cls = 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
          marker = '-';
        } else if (trimmed.startsWith('@@')) {
          cls = 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
        }
        return (
          <div key={i} className={cn('flex leading-5 px-1', cls)}>
            <span className="inline-block w-10 text-right mr-1 text-[var(--text-faint)] select-none text-[11px] shrink-0">{lineNum}</span>
            <span className="inline-block w-4 text-center text-[11px] shrink-0 select-none">{marker}</span>
            <span className="flex-1">{line}</span>
          </div>
        );
      })}
    </div>
  );
}

function BashPreview({ input }) {
  const match = input?.match(/(?:command)['":\s]+(.+?)(?:['"}]|$)/s);
  const cmd = match ? match[1] : input;
  return (
    <div className="p-3">
      <div className="text-[var(--text)]">
        <span className="text-[var(--accent)]">$</span> {cmd}
      </div>
    </div>
  );
}
