import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderTree, GitCompareArrows, Plus, ChevronLeft, ChevronRight, Settings, ArrowLeftRight, Terminal, Search, X, FileText, Folder, Loader2 } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { api } from '../api/client';
import { AgentStatusCard } from './AgentStatusCard';
import { FileSidebar } from './FileSidebar';

const MINI_WIDTH = 52;
const EXPANDED_WIDTH = 260;

function SessionDiffList({ projectPath, onFileSelect }) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchChanges = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const res = await api.getCodingChanges(projectPath);
      setChanges(res.changes || []);
    } catch {
      setChanges([]);
    }
    setLoading(false);
  }, [projectPath]);

  useEffect(() => {
    fetchChanges();
    const interval = setInterval(fetchChanges, 30000);
    return () => clearInterval(interval);
  }, [fetchChanges]);

  if (loading && changes.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-[var(--text-faint)]" />
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <GitCompareArrows size={28} className="text-[var(--text-faint)] mb-2" />
        <p className="text-[12px] text-[var(--text-faint)]">暂无文件变更</p>
      </div>
    );
  }

  const statusColors = {
    M: 'text-amber-500',
    A: 'text-emerald-500',
    D: 'text-red-400',
    U: 'text-blue-400',
    '?': 'text-gray-400',
  };

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-2 py-1.5 flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-faint)] font-medium">{changes.length} 个文件变更</span>
        <button onClick={fetchChanges} className="text-[11px] text-[var(--accent,#c4a882)] hover:underline">刷新</button>
      </div>
      {changes.map((change, i) => {
        const status = change.status || 'M';
        const fileName = change.file?.split('/').pop() || change.file;
        const dirPath = change.file?.split('/').slice(0, -1).join('/') || '';
        return (
          <button
            key={i}
            onClick={() => onFileSelect?.(change.file)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--accent-soft,#f5f0eb)] transition-colors group"
          >
            <span className={cn('text-[11px] font-mono font-bold w-3 shrink-0', statusColors[status] || 'text-gray-400')}>
              {status}
            </span>
            <FileText size={13} className="text-[var(--text-faint)] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-[var(--text)] truncate">{fileName}</div>
              {dirPath && <div className="text-[10px] text-[var(--text-faint)] truncate">{dirPath}</div>}
            </div>
            {change.additions != null && (
              <span className="text-[10px] font-mono text-emerald-500 shrink-0">+{change.additions}</span>
            )}
            {change.deletions != null && (
              <span className="text-[10px] font-mono text-red-400 shrink-0">-{change.deletions}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function GlobalSearchPanel({ projectPath, onFileSelect }) {
  const [query, setQuery] = useState('');
  const [glob, setGlob] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q.trim() || !projectPath) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.searchFiles(projectPath, q.trim(), glob || undefined);
      setResults(res.results || []);
      setTruncated(res.truncated || false);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [projectPath, glob]);

  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  }, [doSearch]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query);
    }
  }, [query, doSearch]);

  // 按文件分组
  const grouped = {};
  results.forEach((r) => {
    if (!grouped[r.relPath]) grouped[r.relPath] = [];
    grouped[r.relPath].push(r);
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 pt-2 pb-1 space-y-1.5">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="搜索文件内容..."
            className="w-full pl-8 pr-7 py-1.5 text-[12px] rounded-md border border-[var(--coding-border,#e8e0d8)] bg-[var(--coding-surface,#faf8f5)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--accent,#c4a882)]"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setSearched(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text-soft)]">
              <X size={12} />
            </button>
          )}
        </div>
        <input
          value={glob}
          onChange={(e) => setGlob(e.target.value)}
          placeholder="文件过滤（如 *.jsx）"
          className="w-full px-2.5 py-1 text-[11px] rounded-md border border-[var(--coding-border,#e8e0d8)] bg-[var(--coding-surface,#faf8f5)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--accent,#c4a882)]"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={14} className="animate-spin text-[var(--accent,#c4a882)]" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-6 text-[12px] text-[var(--text-faint)]">无匹配结果</div>
        )}

        {!loading && Object.keys(grouped).length > 0 && (
          <div className="px-1 pb-2">
            {truncated && (
              <div className="px-2 py-1 text-[10px] text-amber-500">结果已截断（超过 200 条）</div>
            )}
            {Object.entries(grouped).map(([relPath, matches]) => (
              <div key={relPath} className="mb-1">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[var(--text-soft)]">
                  <FileText size={11} className="text-[var(--accent,#c4a882)] shrink-0" />
                  <span className="truncate">{relPath}</span>
                  <span className="text-[var(--text-faint)] shrink-0">({matches.length})</span>
                </div>
                {matches.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => onFileSelect?.(m.file)}
                    className="w-full flex items-start gap-2 px-3 py-1 text-left hover:bg-[var(--accent-soft,#f5f0eb)] transition-colors"
                  >
                    <span className="text-[10px] font-mono text-[var(--text-faint)] w-6 text-right shrink-0 pt-0.5">{m.line}</span>
                    <span className="text-[11px] text-[var(--text)] break-all line-clamp-2">{m.content}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkspacePanel({ projectPath, onFileSelect, onChangeProject }) {
  const [mode, setMode] = useState('expanded');
  const [activeTab, setActiveTab] = useState('files');
  const [searchOpen, setSearchOpen] = useState(false);
  const createSession = useStore((s) => s.createSession);
  const setCodingView = useStore((s) => s.setCodingView);
  const setAppMode = useStore((s) => s.setAppMode);
  const codingTerminalOpen = useStore((s) => s.codingTerminalOpen);
  const toggleCodingTerminal = useStore((s) => s.toggleCodingTerminal);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        if (mode === 'mini') setMode('expanded');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'mini' ? 'expanded' : 'mini'));
  }, []);

  if (mode === 'mini') {
    return (
      <motion.div
        className="h-full bg-[var(--coding-surface,#faf8f5)] border-r border-[var(--coding-border,#e8e0d8)] flex flex-col items-center py-2 gap-1 shrink-0"
        initial={{ width: EXPANDED_WIDTH }}
        animate={{ width: MINI_WIDTH }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <button
          onClick={() => createSession('编程会话')}
          title="新建会话"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)] transition-all"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={() => { setActiveTab('files'); setSearchOpen(false); if (mode === 'mini') setMode('expanded'); }}
          title="文件树"
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-lg transition-all',
            activeTab === 'files' && !searchOpen ? 'bg-[var(--accent-soft,#f5f0eb)] text-[var(--accent,#c4a882)]' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)]'
          )}
        >
          <FolderTree size={16} />
        </button>
        <button
          onClick={() => { setSearchOpen(true); if (mode === 'mini') setMode('expanded'); }}
          title="全局搜索"
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-lg transition-all',
            searchOpen ? 'bg-[var(--accent-soft,#f5f0eb)] text-[var(--accent,#c4a882)]' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)]'
          )}
        >
          <Search size={16} />
        </button>
        <button
          onClick={() => { setActiveTab('changes'); setSearchOpen(false); if (mode === 'mini') setMode('expanded'); }}
          title="文件变更"
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-lg transition-all',
            activeTab === 'changes' && !searchOpen ? 'bg-[var(--accent-soft,#f5f0eb)] text-[var(--accent,#c4a882)]' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)]'
          )}
        >
          <GitCompareArrows size={16} />
        </button>

        <div className="flex-1" />

        <button
          onClick={toggleCodingTerminal}
          title="终端"
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-lg transition-all',
            codingTerminalOpen ? 'bg-[var(--accent-soft,#f5f0eb)] text-[var(--accent,#c4a882)]' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)]'
          )}
        >
          <Terminal size={16} />
        </button>
        <button
          onClick={() => setCodingView('settings')}
          title="设置"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)] transition-all"
        >
          <Settings size={16} />
        </button>
        <button
          onClick={() => setAppMode('main')}
          title="切换到灵犀主模式"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)] transition-all"
        >
          <ArrowLeftRight size={16} />
        </button>
        <button
          onClick={toggleMode}
          title="展开侧边栏"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)] transition-all"
        >
          <ChevronRight size={16} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="h-full bg-[var(--coding-surface,#faf8f5)] border-r border-[var(--coding-border,#e8e0d8)] flex flex-col shrink-0 overflow-hidden"
      initial={{ width: MINI_WIDTH }}
      animate={{ width: EXPANDED_WIDTH }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
    >
      <AgentStatusCard />

      {/* 新建会话 */}
      <div className="px-2 py-1.5 border-b border-[var(--coding-border,#e8e0d8)]">
        <button
          onClick={() => createSession('编程会话')}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium text-[var(--accent,#c4a882)] bg-[var(--accent-soft,#f5f0eb)] hover:bg-[var(--accent,#c4a882)] hover:text-white transition-all"
        >
          <Plus size={14} />
          新建会话
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center border-b border-[var(--coding-border,#e8e0d8)] px-1">
        <button
          onClick={() => { setActiveTab('files'); setSearchOpen(false); }}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors border-b-2',
            activeTab === 'files' && !searchOpen
              ? 'text-[var(--accent,#c4a882)] border-[var(--accent,#c4a882)]'
              : 'text-[var(--text-faint)] border-transparent hover:text-[var(--text-soft)]'
          )}
        >
          <FolderTree size={13} />
          文件
        </button>
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className={cn(
            'flex items-center justify-center gap-1 py-2 px-2 text-[12px] font-medium transition-colors border-b-2',
            searchOpen
              ? 'text-[var(--accent,#c4a882)] border-[var(--accent,#c4a882)]'
              : 'text-[var(--text-faint)] border-transparent hover:text-[var(--text-soft)]'
          )}
          title="全局搜索 (⌘⇧F)"
        >
          <Search size={13} />
        </button>
        <button
          onClick={() => { setActiveTab('changes'); setSearchOpen(false); }}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors border-b-2',
            activeTab === 'changes' && !searchOpen
              ? 'text-[var(--accent,#c4a882)] border-[var(--accent,#c4a882)]'
              : 'text-[var(--text-faint)] border-transparent hover:text-[var(--text-soft)]'
          )}
        >
          <GitCompareArrows size={13} />
          变更
        </button>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden">
        {searchOpen && (
          <GlobalSearchPanel projectPath={projectPath} onFileSelect={onFileSelect} />
        )}
        {!searchOpen && activeTab === 'files' && projectPath && (
          <FileSidebar projectPath={projectPath} onFileSelect={onFileSelect} embedded />
        )}
        {!searchOpen && activeTab === 'files' && !projectPath && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center">
            <FolderTree size={32} className="text-[var(--text-faint)] mb-3" />
            <p className="text-[13px] text-[var(--text-faint)] mb-3">选择一个工作目录开始</p>
            <button
              onClick={onChangeProject}
              className="text-[12px] px-3 py-1.5 rounded-md bg-[var(--accent,#c4a882)] text-white hover:opacity-90 transition-opacity"
            >
              打开目录
            </button>
          </div>
        )}
        {!searchOpen && activeTab === 'changes' && (
          <SessionDiffList projectPath={projectPath} onFileSelect={onFileSelect} />
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="border-t border-[var(--coding-border,#e8e0d8)] flex items-center px-1 py-1">
        <button
          onClick={toggleCodingTerminal}
          title="终端"
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-md transition-all',
            codingTerminalOpen ? 'text-[var(--accent,#c4a882)]' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)]'
          )}
        >
          <Terminal size={14} />
        </button>
        <button
          onClick={() => setCodingView('settings')}
          title="设置"
          className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] transition-all"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={() => setAppMode('main')}
          title="切换到灵犀主模式"
          className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] transition-all"
        >
          <ArrowLeftRight size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={toggleMode}
          title="收起侧边栏"
          className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] transition-all"
        >
          <ChevronLeft size={14} />
        </button>
      </div>
    </motion.div>
  );
}
