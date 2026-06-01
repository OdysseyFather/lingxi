import { useState, useEffect, useCallback } from 'react';
import {
  Folder, FolderOpen, FileText, FileCode2, Image, ChevronRight, ChevronDown,
  RefreshCw, Home, X, Search,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { api } from '../api/client';
import { useStore } from '../state/useStore';

const EXT_ICONS = {
  go: FileCode2, js: FileCode2, jsx: FileCode2, ts: FileCode2, tsx: FileCode2,
  py: FileCode2, rs: FileCode2, java: FileCode2, c: FileCode2, cpp: FileCode2,
  png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, webp: Image,
};

const EXT_COLORS = {
  go: 'text-sky-500', js: 'text-yellow-500', jsx: 'text-blue-400',
  ts: 'text-blue-500', tsx: 'text-blue-400', py: 'text-green-500',
  rs: 'text-orange-500', java: 'text-red-400', json: 'text-yellow-600',
  md: 'text-gray-400', css: 'text-purple-400', html: 'text-orange-400',
};

function getFileIcon(name, isDir) {
  if (isDir) return Folder;
  const ext = name.split('.').pop()?.toLowerCase();
  return EXT_ICONS[ext] || FileText;
}

function getFileColor(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  return EXT_COLORS[ext] || 'text-[var(--text-faint)]';
}

const GIT_STATUS_MAP = {
  'M': { label: 'M', color: 'text-yellow-600 bg-yellow-50' },
  'A': { label: 'A', color: 'text-green-600 bg-green-50' },
  'D': { label: 'D', color: 'text-red-500 bg-red-50' },
  'U': { label: 'U', color: 'text-orange-500 bg-orange-50' },
  '?': { label: 'U', color: 'text-green-500 bg-green-50' },
};

function TreeNode({ entry, depth, onNavigate, expanded, onToggle, filter }) {
  const Icon = getFileIcon(entry.name, entry.is_dir);
  const isOpen = expanded[entry.path];
  const color = entry.is_dir ? 'text-amber-500' : getFileColor(entry.name);
  const codingActiveFiles = useStore((s) => s.codingActiveFiles);
  const workspaceChanges = useStore((s) => s.workspaceChanges);
  const isActive = codingActiveFiles?.has?.(entry.path) || false;
  const gitChange = workspaceChanges?.find(c => entry.path?.endsWith(c.path));
  const gitStatus = gitChange ? GIT_STATUS_MAP[gitChange.status] : null;

  if (filter && !entry.is_dir && !entry.name.toLowerCase().includes(filter.toLowerCase())) {
    return null;
  }

  const handleDragStart = useCallback((e) => {
    e.dataTransfer.setData('text/plain', entry.path);
    e.dataTransfer.setData('application/x-file-path', entry.path);
    e.dataTransfer.setData('application/x-is-dir', entry.is_dir ? 'true' : 'false');
    e.dataTransfer.effectAllowed = 'copy';
  }, [entry]);

  return (
    <div>
      <button
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-[4px] text-[12px]',
          'text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--accent-soft)] transition rounded-md',
          isActive && 'bg-amber-50 ring-1 ring-amber-200/60 text-amber-700 animate-pulse',
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (entry.is_dir) onToggle(entry.path);
          else onNavigate(entry.path);
        }}
        draggable
        onDragStart={handleDragStart}
        title={entry.is_dir ? `拖拽引用目录: ${entry.name}` : `拖拽引用: ${entry.name}`}
      >
        {entry.is_dir ? (
          isOpen ? <ChevronDown size={11} className="shrink-0 text-[var(--text-faint)]" />
                 : <ChevronRight size={11} className="shrink-0 text-[var(--text-faint)]" />
        ) : <span className="w-[11px] shrink-0" />}
        <Icon size={13} className={cn('shrink-0', color, isActive && 'text-amber-500')} />
        <span className={cn('truncate', gitStatus && 'font-medium')}>{entry.name}</span>
        {gitStatus && (
          <span className={cn('ml-auto text-[9px] font-bold px-1 rounded shrink-0', gitStatus.color)}>
            {gitStatus.label}
          </span>
        )}
        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />}
      </button>

      {entry.is_dir && isOpen && entry.children && (
        <div>
          {entry.children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onNavigate={onNavigate}
              expanded={expanded}
              onToggle={onToggle}
              filter={filter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileSidebar({ projectPath, onFileSelect, onClose, embedded }) {
  const [tree, setTree] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  const loadDir = useCallback(async (dirPath) => {
    try {
      const res = await api.listDirectory(dirPath);
      return (res.entries || []).sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!projectPath) return;
    setLoading(true);
    loadDir(projectPath).then((entries) => {
      setTree(entries);
      setLoading(false);
    });
  }, [projectPath, loadDir]);

  const handleToggle = useCallback(async (path) => {
    setExpanded((prev) => {
      const next = { ...prev };
      if (next[path]) {
        delete next[path];
        return next;
      }
      next[path] = true;
      return next;
    });

    const entry = findEntry(tree, path);
    if (entry && entry.is_dir && !entry.children) {
      const children = await loadDir(path);
      setTree((prev) => updateChildren(prev, path, children));
    }
  }, [tree, loadDir]);

  const shortPath = projectPath?.split('/').pop() || 'workspace';

  return (
    <div className={cn(
      'flex flex-col select-none',
      embedded ? 'w-full h-full bg-transparent' : 'w-56 border-r border-[var(--coding-border)] bg-[var(--coding-surface)] shrink-0'
    )}>
      <div className="flex items-center justify-between px-2 py-2 border-b border-[var(--coding-border)]">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-soft)] font-medium truncate">
          <FolderOpen size={12} className="text-amber-500" />
          <span className="truncate">{shortPath}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setLoading(true);
              loadDir(projectPath).then((entries) => { setTree(entries); setLoading(false); });
            }}
            className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
            title="刷新"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="关闭">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-1.5 border-b border-[var(--coding-border)]">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] text-[11px]">
          <Search size={11} className="text-[var(--text-faint)] shrink-0" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索文件…"
            className="flex-1 bg-transparent outline-none text-[var(--text)] placeholder-[var(--text-faint)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollable py-1">
        {tree.length === 0 && !loading && (
          <div className="px-3 py-8 text-[11px] text-[var(--text-faint)] text-center">
            <FolderOpen size={24} className="mx-auto mb-2 text-[var(--coding-border)]" />
            <p>目录为空</p>
          </div>
        )}
        {loading && tree.length === 0 && (
          <div className="px-3 py-8 text-[11px] text-[var(--text-faint)] text-center">
            <RefreshCw size={14} className="mx-auto mb-2 animate-spin text-[var(--text-faint)]" />
            <p>加载中…</p>
          </div>
        )}
        {tree.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            onNavigate={onFileSelect}
            expanded={expanded}
            onToggle={handleToggle}
            filter={filter}
          />
        ))}
      </div>

      <div className="px-2 py-1.5 border-t border-[var(--coding-border)] text-[10px] text-[var(--text-faint)] text-center">
        拖拽文件到输入框引用
      </div>
    </div>
  );
}

function findEntry(entries, path) {
  for (const e of entries) {
    if (e.path === path) return e;
    if (e.children) {
      const found = findEntry(e.children, path);
      if (found) return found;
    }
  }
  return null;
}

function updateChildren(entries, path, children) {
  return entries.map((e) => {
    if (e.path === path) return { ...e, children };
    if (e.children) return { ...e, children: updateChildren(e.children, path, children) };
    return e;
  });
}
