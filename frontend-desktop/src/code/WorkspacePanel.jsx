import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderTree, ListTodo, Plus, ChevronLeft, ChevronRight, Settings, ArrowLeftRight, Terminal } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { AgentStatusCard } from './AgentStatusCard';
import { FileSidebar } from './FileSidebar';
import { TaskTodoList } from './TaskTodoList';

const MINI_WIDTH = 52;
const EXPANDED_WIDTH = 260;

export function WorkspacePanel({ projectPath, onFileSelect, onChangeProject }) {
  const [mode, setMode] = useState('expanded');
  const [activeTab, setActiveTab] = useState('files');
  const createSession = useStore((s) => s.createSession);
  const setCodingView = useStore((s) => s.setCodingView);
  const setAppMode = useStore((s) => s.setAppMode);
  const codingTerminalOpen = useStore((s) => s.codingTerminalOpen);
  const toggleCodingTerminal = useStore((s) => s.toggleCodingTerminal);
  const codingTasks = useStore((s) => s.codingTasks);
  const codingMode = useStore((s) => s.codingMode);

  // Auto-switch to tasks tab when in plan mode or when tasks arrive
  useEffect(() => {
    if (codingMode === 'plan') {
      setActiveTab('tasks');
    }
  }, [codingMode]);

  useEffect(() => {
    if (codingTasks?.length > 0 && activeTab !== 'tasks') {
      setActiveTab('tasks');
    }
  }, [codingTasks?.length]);

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
          onClick={() => setActiveTab('files')}
          title="文件树"
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-lg transition-all',
            activeTab === 'files' ? 'bg-[var(--accent-soft,#f5f0eb)] text-[var(--accent,#c4a882)]' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)]'
          )}
        >
          <FolderTree size={16} />
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          title="任务列表"
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-lg transition-all relative',
            activeTab === 'tasks' ? 'bg-[var(--accent-soft,#f5f0eb)] text-[var(--accent,#c4a882)]' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft,#f5f0eb)]'
          )}
        >
          <ListTodo size={16} />
          {codingTasks.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--accent,#c4a882)]" />
          )}
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

      {/* Tab 切换 */}
      <div className="flex items-center border-b border-[var(--coding-border,#e8e0d8)] px-1">
        <button
          onClick={() => setActiveTab('files')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors border-b-2',
            activeTab === 'files'
              ? 'text-[var(--accent,#c4a882)] border-[var(--accent,#c4a882)]'
              : 'text-[var(--text-faint)] border-transparent hover:text-[var(--text-soft)]'
          )}
        >
          <FolderTree size={13} />
          文件
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors border-b-2 relative',
            activeTab === 'tasks'
              ? 'text-[var(--accent,#c4a882)] border-[var(--accent,#c4a882)]'
              : 'text-[var(--text-faint)] border-transparent hover:text-[var(--text-soft)]'
          )}
        >
          <ListTodo size={13} />
          任务
          {codingTasks.length > 0 && (
            <span className="ml-1 text-[10px] bg-[var(--accent-soft,#f5f0eb)] text-[var(--accent,#c4a882)] px-1.5 rounded-full">
              {codingTasks.filter(t => t.status !== 'completed').length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'files' && projectPath && (
          <FileSidebar projectPath={projectPath} onFileSelect={onFileSelect} embedded />
        )}
        {activeTab === 'files' && !projectPath && (
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
        {activeTab === 'tasks' && (
          <div className="h-full overflow-y-auto">
            <TaskTodoList embedded />
          </div>
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
