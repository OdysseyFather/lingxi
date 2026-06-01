import { useState, useCallback, useMemo } from 'react';
import {
  FileText, Pencil, Terminal, Search, FolderOpen, Wrench, Code2,
  ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle, Copy, Check,
  GitBranch, Eye, Download, Upload, Globe, BookOpen, ListTodo,
} from 'lucide-react';
import { cn } from '../ui/cn';

const TOOL_META = {
  Read:       { icon: Eye,        color: 'blue',    label: 'Read' },
  Glob:       { icon: FolderOpen, color: 'blue',    label: 'Glob' },
  Grep:       { icon: Search,     color: 'amber',   label: 'Grep' },
  LS:         { icon: FolderOpen, color: 'blue',    label: 'LS' },
  Edit:       { icon: Pencil,     color: 'purple',  label: 'Edit' },
  MultiEdit:  { icon: Pencil,     color: 'purple',  label: 'MultiEdit' },
  Write:      { icon: Upload,     color: 'purple',  label: 'Write' },
  Bash:       { icon: Terminal,   color: 'emerald', label: 'Bash' },
  WebFetch:   { icon: Globe,      color: 'sky',     label: 'WebFetch' },
  WebSearch:  { icon: Globe,      color: 'sky',     label: 'WebSearch' },
  Task:       { icon: ListTodo,   color: 'indigo',  label: 'Task' },
  TodoWrite:  { icon: ListTodo,   color: 'gray',    label: 'TodoWrite' },
};

function getMeta(name) {
  if (TOOL_META[name]) return TOOL_META[name];
  if (name?.startsWith('mcp__')) return { icon: Wrench, color: 'gray', label: name };
  return { icon: Code2, color: 'gray', label: name || 'Tool' };
}

function parseToolJSON(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function CodingToolCard({ name, label, done, input, fullInput, status, ms, fileDiff }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = getMeta(name);
  const Icon = meta.icon;
  const failed = status === 'failed';
  const hasDiff = Boolean(fileDiff?.diff);
  const parsed = useMemo(() => parseToolJSON(fullInput || input), [fullInput, input]);

  const filePath = useMemo(() => {
    if (!parsed) return '';
    return parsed.file_path || parsed.path || '';
  }, [parsed]);

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
    <div className="my-0.5 overflow-hidden">
      {/* 主行：工具名 + 文件路径 + 状态 */}
      <div className="flex items-center gap-2 px-4 py-2 text-[13px]">
        <span className="shrink-0 text-[var(--text-faint)]">
          {!done && !failed ? (
            <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
          ) : failed ? (
            <AlertCircle size={14} className="text-red-400" />
          ) : (
            <CheckCircle2 size={14} className="text-green-500" />
          )}
        </span>

        <span className="font-mono font-medium text-[var(--text-soft)] text-[12px]">{meta.label}</span>

        {/* Bash: 直接显示命令 */}
        {name === 'Bash' && parsed?.command && (
          <span className="flex-1 font-mono text-[12px] text-[var(--text)] truncate">
            <span className="text-green-600">$</span> {parsed.command.length > 120 ? parsed.command.slice(0, 120) + '…' : parsed.command}
          </span>
        )}

        {/* 文件操作：显示文件路径 */}
        {name !== 'Bash' && filePath && (
          <span
            className="font-mono text-[12px] text-[var(--accent)] truncate cursor-pointer hover:underline"
            onClick={handleCopyPath}
            title={filePath}
          >
            {filePath.length > 80 ? '…' + filePath.slice(-75) : filePath}
          </span>
        )}

        {/* Grep/Glob: 显示 pattern */}
        {(name === 'Grep' || name === 'Glob') && parsed?.pattern && !filePath && (
          <span className="font-mono text-[12px] text-orange-600 truncate">
            {parsed.pattern}
          </span>
        )}

        {/* Web: 显示 URL/query */}
        {(name === 'WebFetch' || name === 'WebSearch') && (
          <span className="font-mono text-[12px] text-sky-600 truncate">
            {parsed?.url || parsed?.query || parsed?.search_term || ''}
          </span>
        )}

        {/* Task: 显示描述 */}
        {name === 'Task' && parsed?.description && (
          <span className="text-[12px] text-indigo-600 truncate">
            {parsed.description}
          </span>
        )}

        {/* Diff 统计 */}
        {hasDiff && done && (
          <span className="text-[10px] flex items-center gap-1 shrink-0">
            {fileDiff.added > 0 && <span className="text-green-600 font-mono font-bold">+{fileDiff.added}</span>}
            {fileDiff.removed > 0 && <span className="text-red-500 font-mono font-bold">-{fileDiff.removed}</span>}
          </span>
        )}

        <span className="flex-shrink-0 ml-auto" />

        {/* 耗时 */}
        {done && ms > 0 && (
          <span className="text-[11px] text-[var(--text-faint)] font-mono shrink-0">
            {ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}
          </span>
        )}

        {/* 展开/收起详情 */}
        {(fullInput || hasDiff) && (
          <button
            onClick={() => setDetailOpen(v => !v)}
            className="p-0.5 text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
          >
            {detailOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}
      </div>

      {/* 展开的详情区 */}
      {detailOpen && (
        <div className="mx-4 mb-2 rounded-lg border border-[var(--coding-border)] overflow-hidden text-[12px]">
          {/* 文件路径头 */}
          {filePath && (
            <div className="flex items-center justify-between px-3 py-1 bg-[var(--coding-surface)] border-b border-[var(--coding-border)]">
              <span className="text-[11px] text-[var(--text-faint)] font-mono truncate">{filePath}</span>
              <button onClick={handleCopyPath} className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="复制路径">
                {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
              </button>
            </div>
          )}

          {/* Diff 区域 */}
          {hasDiff && (
            <div>
              <button
                onClick={(e) => { e.stopPropagation(); setDiffOpen(v => !v); }}
                className="w-full flex items-center gap-2 px-3 py-1 bg-[var(--coding-surface)] border-b border-[var(--coding-border)] text-[11px] hover:bg-[var(--accent-soft)] transition"
              >
                {diffOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span className="font-medium text-[var(--text-soft)]">
                  {fileDiff.isNew ? 'NEW FILE' : 'CHANGES'}
                </span>
                <span className="text-green-600 font-mono font-bold">+{fileDiff.added}</span>
                <span className="text-red-500 font-mono font-bold">-{fileDiff.removed}</span>
                <DiffBar added={fileDiff.added} removed={fileDiff.removed} />
              </button>
              {diffOpen && (
                <div className="max-h-[400px] overflow-y-auto scrollable font-mono text-[12px] leading-[1.6] bg-[var(--coding-surface-raised)]">
                  {fileDiff.diff.split('\n')
                    .filter(l => !l.startsWith('diff --git') && !l.startsWith('index ') && !l.startsWith('---') && !l.startsWith('+++'))
                    .map((line, i) => {
                      let bg = '';
                      let color = 'var(--text-soft)';
                      if (line.startsWith('@@')) { bg = 'bg-blue-500/5'; color = '#3b82f6'; }
                      else if (line.startsWith('+')) { bg = 'bg-green-500/10'; color = '#16a34a'; }
                      else if (line.startsWith('-')) { bg = 'bg-red-500/10'; color = '#dc2626'; }
                      return (
                        <div key={i} className={cn('px-3 whitespace-pre', bg)} style={{ color }}>
                          {line}
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </div>
          )}

          {/* Bash 命令详情 */}
          {name === 'Bash' && parsed?.command && !hasDiff && (
            <div className="font-mono bg-[#1e1e1e] text-[#d4d4d4] p-3 leading-relaxed">
              <div className="text-green-400">$ {parsed.command}</div>
              {parsed.timeout && <div className="text-[var(--text-faint)] mt-1 text-[11px]">timeout: {parsed.timeout}ms</div>}
            </div>
          )}

          {/* Edit/Write 操作详情 */}
          {(name === 'Edit' || name === 'MultiEdit') && parsed && !hasDiff && (
            <EditDetail parsed={parsed} />
          )}
          {name === 'Write' && parsed && !hasDiff && (
            <WriteDetail parsed={parsed} />
          )}

          {/* Read 详情 */}
          {name === 'Read' && parsed && (
            <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)] font-mono">
              {parsed.file_path || parsed.path}
              {parsed.offset && <span className="ml-2 text-[var(--text-faint)]">offset:{parsed.offset}</span>}
              {parsed.limit && <span className="ml-2 text-[var(--text-faint)]">limit:{parsed.limit}</span>}
            </div>
          )}

          {/* Grep 详情 */}
          {name === 'Grep' && parsed && (
            <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)] font-mono">
              <span className="text-orange-500">pattern:</span> {parsed.pattern}
              {parsed.path && <div className="text-[var(--text-faint)]">path: {parsed.path}</div>}
              {parsed.glob && <div className="text-[var(--text-faint)]">glob: {parsed.glob}</div>}
              {parsed.include && <div className="text-[var(--text-faint)]">include: {parsed.include}</div>}
            </div>
          )}

          {/* Glob 详情 */}
          {name === 'Glob' && parsed && (
            <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)] font-mono">
              <span className="text-blue-500">pattern:</span> {parsed.pattern || parsed.glob_pattern}
              {parsed.path && <div className="text-[var(--text-faint)]">path: {parsed.path}</div>}
            </div>
          )}

          {/* Task 详情 */}
          {name === 'Task' && parsed && (
            <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)]">
              {parsed.description && <div className="font-medium text-indigo-600 mb-1">{parsed.description}</div>}
              {parsed.prompt && <div className="text-[12px] whitespace-pre-wrap max-h-[200px] overflow-y-auto scrollable">{parsed.prompt.length > 500 ? parsed.prompt.slice(0, 500) + '…' : parsed.prompt}</div>}
            </div>
          )}

          {/* 通用兜底 */}
          {!['Bash', 'Edit', 'MultiEdit', 'Write', 'Read', 'Grep', 'Glob', 'Task'].includes(name) && fullInput && !hasDiff && (
            <div className="px-3 py-2 bg-[var(--coding-surface-raised)] text-[var(--text-soft)] font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto scrollable">
              {fullInput.length > 1000 ? fullInput.slice(0, 1000) + '\n…(truncated)' : fullInput}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiffBar({ added, removed }) {
  const total = added + removed;
  if (!total) return null;
  return (
    <div className="flex items-center gap-0.5 ml-1">
      {Array.from({ length: Math.min(added, 12) }).map((_, i) => (
        <span key={`a${i}`} className="w-1 h-2 bg-green-500 rounded-[1px]" />
      ))}
      {Array.from({ length: Math.min(removed, 12) }).map((_, i) => (
        <span key={`r${i}`} className="w-1 h-2 bg-red-400 rounded-[1px]" />
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
        <div key={`o${i}`} className="px-3 whitespace-pre bg-red-500/10 text-red-600 leading-5">
          <span className="inline-block w-4 text-center select-none">-</span>{line}
        </div>
      ))}
      {newStr && newStr.split('\n').map((line, i) => (
        <div key={`n${i}`} className="px-3 whitespace-pre bg-green-500/10 text-green-700 leading-5">
          <span className="inline-block w-4 text-center select-none">+</span>{line}
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
        <div key={i} className="px-3 whitespace-pre bg-green-500/5 text-green-700 leading-5">
          <span className="inline-block w-8 text-right mr-2 text-[var(--text-faint)] select-none text-[11px]">{i + 1}</span>
          {line}
        </div>
      ))}
    </div>
  );
}
