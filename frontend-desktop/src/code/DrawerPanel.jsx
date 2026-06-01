import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, GitCompareArrows, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../ui/cn';
import { DiffReviewView } from './DiffReviewView';
import { CodePreview } from './CodePreview';

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 480;

export function DrawerPanel({
  activeFile,
  activeDiff,
  fileContent,
  fileLoading,
  openFiles,
  onFileSelect,
  onCloseFile,
  onContentChange,
  onClose,
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [activeTab, setActiveTab] = useState(activeDiff ? 'diff' : 'preview');
  const [maximized, setMaximized] = useState(false);
  const resizingRef = useRef(false);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;
    const handleMove = (moveE) => {
      if (!resizingRef.current) return;
      const diff = startX - moveE.clientX;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + diff)));
    };
    const handleUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [width]);

  const actualWidth = maximized ? '50vw' : `${width}px`;

  return (
    <motion.div
      className="flex shrink-0 h-full"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: maximized ? '50vw' : width + 4, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
    >
      {/* 拖拽调整宽度 */}
      <div
        className="w-1 cursor-col-resize bg-[var(--coding-border)] hover:bg-[var(--accent)] transition shrink-0"
        onMouseDown={handleResizeStart}
      />

      {/* Drawer 主体 */}
      <div style={{ width: actualWidth }} className="flex flex-col h-full bg-[var(--coding-surface)] border-l border-[var(--coding-border)] overflow-hidden">
        {/* 顶部 Tab 栏 */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--coding-border)] bg-[var(--coding-surface-raised)]">
          <div className="flex items-center gap-1">
            {activeFile && (
              <button
                onClick={() => setActiveTab('preview')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition',
                  activeTab === 'preview'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-soft)]'
                )}
              >
                <FileText size={11} />
                预览
              </button>
            )}
            {activeDiff && (
              <button
                onClick={() => setActiveTab('diff')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition',
                  activeTab === 'diff'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-soft)]'
                )}
              >
                <GitCompareArrows size={11} />
                Diff 审查
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setMaximized(v => !v)}
              className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
              title={maximized ? '还原' : '最大化'}
            >
              {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
              title="关闭"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'preview' && activeFile && (
            <CodePreview
              filePath={activeFile}
              content={fileContent}
              loading={fileLoading}
              onClose={onClose}
              onInsertToChat={() => {}}
              onContentChange={onContentChange}
              openFiles={openFiles}
              activeFile={activeFile}
              onSelectFile={onFileSelect}
              onCloseFile={onCloseFile}
              embedded
            />
          )}
          {activeTab === 'diff' && activeDiff && (
            <DiffReviewView
              filePath={activeDiff.filePath}
              diffText={activeDiff.diffText}
              onClose={onClose}
              onAcceptAll={activeDiff.onAcceptAll}
              onRejectAll={activeDiff.onRejectAll}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
