import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Plus, FolderOpen, Search, Menu, Terminal, Settings, X } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore, initStore } from '../state/useStore';
import { CodingTabBar } from './CodingTabBar';
import { BottomStatusBar } from './BottomStatusBar';
import { CodingChatView } from './CodingChatView';
import { WorkspacePanel } from './WorkspacePanel';
import { WorkspaceChanges } from './WorkspaceChanges';
import { CodingSettingsPage } from './CodingSettingsPage';
import { DrawerPanel } from './DrawerPanel';
import { TerminalPanel } from './TerminalPanel';
import { CodingErrorBoundary } from './CodingErrorBoundary';
import { ToastStack } from '../ui/primitives';
import { api } from '../api/client';

const ScheduledTasksPage = lazy(() => import('../ScheduledTasksPage'));

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-[#c4a882] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function CodingShell() {
  const codingView = useStore((s) => s.codingView);
  const codingChangesOpen = useStore((s) => s.codingChangesOpen);
  const toggleCodingChanges = useStore((s) => s.toggleCodingChanges);
  const codingTerminalOpen = useStore((s) => s.codingTerminalOpen);
  const toggleCodingTerminal = useStore((s) => s.toggleCodingTerminal);
  const codingActiveDiff = useStore((s) => s.codingActiveDiff);
  const clearCodingActiveDiff = useStore((s) => s.clearCodingActiveDiff);
  const notifications = useStore((s) => s.notifications);
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const authChecked = useStore((s) => s.authChecked);
  const setCodingProjectPath = useStore((s) => s.setCodingProjectPath);
  const refreshSessions = useStore((s) => s.refreshSessions);
  const projectPath = useStore((s) => s.codingProjectPath);
  const [workspaceChanges, setWorkspaceChanges] = useState([]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileTerminalOpen, setMobileTerminalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openFiles, setOpenFiles] = useState([]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleChangeProject = useCallback(async () => {
    let newPath = '';
    if (window.electronAPI?.selectDirectory) {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) newPath = selected;
    } else {
      const fallback = prompt('请输入项目目录路径：', projectPath || '');
      if (fallback?.trim()) newPath = fallback.trim();
    }
    if (newPath && newPath !== projectPath) {
      setCodingProjectPath(newPath);
      await refreshSessions();
    }
  }, [projectPath, setCodingProjectPath, refreshSessions]);

  const fetchChanges = useCallback(async () => {
    if (!projectPath) return;
    try {
      const res = await api.getCodingChanges(projectPath);
      setWorkspaceChanges(res.changes || []);
    } catch {
      setWorkspaceChanges([]);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchChanges();
    const interval = setInterval(fetchChanges, 30000);
    return () => clearInterval(interval);
  }, [fetchChanges]);

  const handleFileSelect = useCallback(async (filePath) => {
    setPreviewFile(filePath);
    setOpenFiles(prev => prev.includes(filePath) ? prev : [...prev, filePath]);
    setPreviewLoading(true);
    setPreviewContent('');
    try {
      const res = await api.readFile(filePath);
      setPreviewContent(res.content || '');
    } catch {
      setPreviewContent('// Failed to read file');
    }
    setPreviewLoading(false);
  }, []);

  const handleCloseFile = useCallback((filePath) => {
    setOpenFiles(prev => {
      const next = prev.filter(f => f !== filePath);
      if (previewFile === filePath) {
        if (next.length > 0) {
          const newActive = next[next.length - 1];
          handleFileSelect(newActive);
        } else {
          setPreviewFile(null);
          setPreviewContent('');
        }
      }
      return next;
    });
  }, [previewFile, handleFileSelect]);


  useEffect(() => {
    initStore();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mx-auto">
            <span className="text-[var(--accent)] font-bold text-lg font-mono">&gt;;</span>
          </div>
          <p className="text-sm text-[var(--text-faint)]">加载中…</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    const LoginPage = lazy(() => import('../LoginPage'));
    return (
      <Suspense fallback={<PageFallback />}>
        <LoginPage />
        <ToastStack items={notifications} />
      </Suspense>
    );
  }

  return (
    <CodingErrorBoundary title="Coding View 发生错误">
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      {/* 移动端顶部栏 */}
      {isMobile && (
        <MobileHeader
          projectPath={projectPath}
          onSwitchMode={() => useStore.getState().setAppMode('main')}
          onToggleDrawer={() => setMobileDrawerOpen(v => !v)}
          onToggleTerminal={() => setMobileTerminalOpen(v => !v)}
          onOpenSettings={() => useStore.getState().setCodingView('settings')}
          terminalOpen={mobileTerminalOpen}
        />
      )}
      {/* 顶部 tab 栏（移动端隐藏） */}
      {!isMobile && <CodingTabBar />}

      {/* 三栏主体 */}
      <div className="flex-1 flex min-h-0">
        {/* 左栏：WorkspacePanel */}
        {!isMobile && (
          <WorkspacePanel
            projectPath={projectPath}
            onFileSelect={handleFileSelect}
            onChangeProject={handleChangeProject}
          />
        )}

        {/* 中栏：聊天/设置区域 + 终端 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col min-h-0">
            <Suspense fallback={<PageFallback />}>
              <AnimatePresence mode="wait">
                {codingView === 'chat' && (
                  <motion.div
                    key="coding-chat"
                    className="flex-1 flex flex-col min-h-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <CodingErrorBoundary title="对话视图发生错误">
                      <CodingChatView projectPath={projectPath} onChangeProject={handleChangeProject} />
                    </CodingErrorBoundary>
                  </motion.div>
                )}
                {codingView === 'settings' && (
                  <motion.div
                    key="coding-settings"
                    className="flex-1 flex flex-col min-h-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <CodingSettingsPage />
                  </motion.div>
                )}
                {codingView === 'scheduled' && (
                  <motion.div
                    key="coding-scheduled"
                    className="flex-1 overflow-auto scrollable bg-[var(--bg)] p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ScheduledTasksPage />
                  </motion.div>
                )}
              </AnimatePresence>
            </Suspense>
          </div>

          {/* 底部终端面板 */}
          {codingTerminalOpen && !isMobile && (
            <TerminalPanel
              projectPath={projectPath}
              onClose={toggleCodingTerminal}
            />
          )}
        </div>

        {/* 右栏：Drawer Panel（代码预览 + Diff 审查） */}
        <AnimatePresence>
          {(previewFile || codingActiveDiff) && codingView === 'chat' && !isMobile && (
            <DrawerPanel
              key="drawer-panel"
              activeFile={previewFile}
              activeDiff={codingActiveDiff}
              fileContent={previewContent}
              fileLoading={previewLoading}
              openFiles={openFiles}
              onFileSelect={handleFileSelect}
              onCloseFile={handleCloseFile}
              onContentChange={(newContent) => setPreviewContent(newContent)}
              onClose={() => { setPreviewFile(null); setOpenFiles([]); clearCodingActiveDiff(); }}
            />
          )}
        </AnimatePresence>

        {/* Workspace Changes 抽屉（覆盖式） */}
        <AnimatePresence>
          {!isMobile && codingChangesOpen && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/10 z-30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={toggleCodingChanges}
              />
              <motion.div
                className="fixed right-0 top-0 bottom-0 z-40 w-[320px] shadow-xl"
                initial={{ x: 320 }}
                animate={{ x: 0 }}
                exit={{ x: 320 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              >
                <WorkspaceChanges
                  changes={workspaceChanges}
                  onClose={toggleCodingChanges}
                  onSelectFile={(change) => {
                    const fullPath = projectPath ? `${projectPath}/${change.path}` : change.path;
                    handleFileSelect(fullPath);
                    toggleCodingChanges();
                  }}
                  onRefresh={fetchChanges}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* 移动端侧边抽屉 */}
      <AnimatePresence>
        {isMobile && mobileDrawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/30 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileDrawerOpen(false)}
            />
            <motion.div
              className="fixed left-0 top-0 bottom-0 w-[280px] bg-[var(--coding-surface)] z-50 flex flex-col shadow-2xl"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              <MobileDrawer
                onClose={() => setMobileDrawerOpen(false)}
                onChangeProject={handleChangeProject}
                projectPath={projectPath}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 移动端终端面板（全屏覆盖） */}
      <AnimatePresence>
        {isMobile && mobileTerminalOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-[#1e1e1e] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <TerminalPanel
              projectPath={projectPath}
              onClose={() => setMobileTerminalOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部状态栏（移动端简化） */}
      {!isMobile && <BottomStatusBar projectPath={projectPath} onChangeProject={handleChangeProject} />}

      {searchOpen && (
        <CodingSearchModal
          onClose={() => setSearchOpen(false)}
          onSelect={(result) => {
            setSearchOpen(false);
            useStore.getState().setActiveSession(result.session_id);
            useStore.getState().setCodingView('chat');
          }}
        />
      )}

      <ToastStack items={notifications} />
    </div>
    </CodingErrorBoundary>
  );
}

function CodingSearchModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useCallback((el) => el?.focus(), []);
  const timerRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/messages/search?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' });
      const data = await r.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        className="relative w-[560px] max-h-[60vh] rounded-2xl bg-[var(--coding-surface-raised)] shadow-2xl border border-[var(--coding-border)] flex flex-col overflow-hidden backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--coding-border)]">
          <Search size={16} className="text-[var(--accent)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              clearTimeout(timerRef.current);
              timerRef.current = setTimeout(() => doSearch(e.target.value), 300);
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            placeholder="搜索消息..."
            className="flex-1 text-[15px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none bg-transparent"
          />
          <kbd className="px-2 py-0.5 rounded-md bg-[var(--coding-surface)] border border-[var(--coding-border)] text-[10px] text-[var(--text-faint)]">ESC</kbd>
        </div>
        <div className="flex-1 overflow-y-auto scrollable">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-4 h-4 border-2 border-[var(--coding-border)] border-t-[var(--accent)] rounded-full animate-spin" />
            </div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="text-center text-[13px] text-[var(--text-faint)] py-8">未找到匹配消息</div>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => onSelect(r)}
              className="w-full text-left px-5 py-3 hover:bg-[var(--coding-surface)] transition border-b border-[var(--coding-border)] last:border-0"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded',
                  r.role === 'user' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--coding-surface)] text-[var(--text-soft)]'
                )}>
                  {r.role === 'user' ? 'User' : 'Assistant'}
                </span>
                {r.session_title && (
                  <span className="text-[11px] text-[var(--text-faint)] truncate">{r.session_title}</span>
                )}
              </div>
              <div className="text-[13px] text-[var(--text-soft)] line-clamp-2">{r.content?.slice(0, 200)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileHeader({ projectPath, onSwitchMode, onToggleDrawer, onToggleTerminal, onOpenSettings, terminalOpen }) {
  const createSession = useStore((s) => s.createSession);
  const shortProject = projectPath ? projectPath.split('/').pop() : 'Coding';
  return (
    <div className="h-12 flex items-center justify-between px-3 bg-[var(--bg-elev)] border-b border-[var(--coding-border)] shrink-0 safe-area-top">
      <div className="flex items-center gap-2">
        <button onClick={onToggleDrawer} className="p-2 -ml-1 rounded-lg text-[var(--text-soft)] active:bg-[var(--accent-soft)] transition">
          <Menu size={20} />
        </button>
        <span className="text-[14px] font-bold text-[var(--text)] truncate max-w-[120px]">{shortProject}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => createSession('编程会话')}
          className="p-2 rounded-lg text-[var(--text-faint)] active:bg-[var(--accent-soft)] transition"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={onToggleTerminal}
          className={cn(
            'p-2 rounded-lg transition',
            terminalOpen ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-[var(--text-faint)] active:bg-[var(--accent-soft)]'
          )}
        >
          <Terminal size={16} />
        </button>
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg text-[var(--text-faint)] active:bg-[var(--accent-soft)] transition"
        >
          <Settings size={16} />
        </button>
        <button
          onClick={onSwitchMode}
          className="p-2 rounded-lg text-[var(--text-faint)] active:bg-[var(--accent-soft)] transition"
        >
          <ArrowLeftRight size={15} />
        </button>
      </div>
    </div>
  );
}

function MobileDrawer({ onClose, onChangeProject, projectPath }) {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const createSession = useStore((s) => s.createSession);
  const deleteSession = useStore((s) => s.deleteSession);

  const handleSelect = useCallback(async (id) => {
    await setActiveSession(id);
    onClose();
  }, [setActiveSession, onClose]);

  const handleNew = useCallback(async () => {
    await createSession('编程会话');
    onClose();
  }, [createSession, onClose]);

  return (
    <>
      <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--coding-border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[var(--accent)] font-bold text-base font-mono">&gt;;</span>
          <span className="text-[14px] font-bold text-[var(--text)]">Sessions</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-[var(--text-faint)] active:bg-[var(--accent-soft)]">
          <X size={18} />
        </button>
      </div>

      {/* 项目路径 */}
      <button
        onClick={() => { onChangeProject(); }}
        className="mx-3 mt-3 mb-2 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--coding-border)] text-[13px] text-[var(--accent)] font-medium active:scale-[0.98] transition"
      >
        <FolderOpen size={15} />
        <span className="truncate">{projectPath ? projectPath.split('/').pop() : '选择工作目录'}</span>
      </button>

      {/* 新建会话 */}
      <button
        onClick={handleNew}
        className="mx-3 mb-2 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[var(--coding-border)] text-[13px] text-[var(--text-soft)] font-medium active:bg-[var(--accent-soft)] transition"
      >
        <Plus size={15} />
        <span>New session</span>
      </button>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto px-2">
        {sessions.map((s) => (
          <div key={s.id} className="relative group">
            <button
              onClick={() => handleSelect(s.id)}
              className={cn(
                'w-full text-left px-3 py-3 text-[14px] rounded-xl my-0.5 transition-all flex items-center gap-2',
                s.id === activeSessionId
                  ? 'bg-[var(--accent-soft)] text-[var(--text)] font-medium'
                  : 'text-[var(--text-soft)] active:bg-[var(--accent-soft)]'
              )}
            >
              <span className={cn(
                'w-2 h-2 rounded-full shrink-0',
                s.id === activeSessionId ? 'bg-[var(--accent)]' : 'bg-transparent'
              )} />
              <span className="truncate">{s.title || '未命名会话'}</span>
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-center text-[13px] text-[var(--text-faint)] py-10">暂无会话</div>
        )}
      </div>
    </>
  );
}
