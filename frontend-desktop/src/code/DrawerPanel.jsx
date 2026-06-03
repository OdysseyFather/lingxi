import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, GitCompareArrows, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../ui/cn';
import { DiffReviewView } from './DiffReviewView';
import { CodePreview } from './CodePreview';

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
  const [activeTab, setActiveTab] = useState(activeDiff ? 'diff' : 'preview');
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (activeDiff) setActiveTab('diff');
  }, [activeDiff]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const modalWidth = maximized ? 'max-w-[90vw] w-[90vw]' : 'max-w-[960px] w-[90vw]';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'relative flex flex-col bg-[var(--coding-surface,#faf8f5)] rounded-2xl shadow-2xl border border-[var(--coding-border,#e8e0d8)] overflow-hidden',
          modalWidth,
          'h-[80vh]'
        )}
      >
        {/* Tab bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--coding-border)] bg-[var(--coding-surface-raised,#f5f0eb)]">
          <div className="flex items-center gap-1.5">
            {activeFile && (
              <button
                onClick={() => setActiveTab('preview')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg transition-all font-medium',
                  activeTab === 'preview'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--coding-surface)]/80'
                )}
              >
                <FileText size={13} />
                预览
              </button>
            )}
            {activeDiff && (
              <button
                onClick={() => setActiveTab('diff')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg transition-all font-medium',
                  activeTab === 'diff'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--coding-surface)]/80'
                )}
              >
                <GitCompareArrows size={13} />
                Diff 审查
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMaximized(v => !v)}
              className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--coding-surface)] transition-all"
              title={maximized ? '还原' : '最大化'}
            >
              {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--coding-surface)] transition-all"
              title="关闭 (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
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
      </motion.div>
    </motion.div>
  );
}
