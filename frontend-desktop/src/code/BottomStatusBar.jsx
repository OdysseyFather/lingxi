import { useState, useEffect } from 'react';
import { FolderOpen, GitBranch, ChevronDown, Monitor } from 'lucide-react';

export function BottomStatusBar({ projectPath, onChangeProject }) {
  const [gitBranch, setGitBranch] = useState('');
  const shortPath = projectPath
    ? projectPath.split('/').pop() || projectPath.replace(/^\/Users\/[^/]+/, '~')
    : '未选择项目';

  useEffect(() => {
    if (!projectPath) return;
    fetch(`/api/files/project?path=${encodeURIComponent(projectPath)}`)
      .then(r => r.json())
      .then(d => {
        if (d.git_branch) setGitBranch(d.git_branch);
      })
      .catch(() => {});
  }, [projectPath]);

  return (
    <div className="h-7 flex items-center gap-3 px-3 bg-[var(--coding-surface)] border-t border-[var(--coding-border)] text-[11px] text-[var(--text-faint)] select-none shrink-0">
      <button
        onClick={onChangeProject}
        className="flex items-center gap-1.5 hover:text-[var(--text-soft)] transition"
        title="切换项目目录"
      >
        <FolderOpen size={12} className="text-[var(--accent)]" />
        <span className="font-medium text-[var(--text-soft)]">{shortPath}</span>
        <ChevronDown size={10} />
      </button>

      {gitBranch && (
        <>
          <span className="text-[var(--coding-border)]">|</span>
          <div className="flex items-center gap-1">
            <GitBranch size={11} />
            <span>{gitBranch}</span>
          </div>
        </>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Monitor size={11} />
        <span>当前工作树</span>
        <ChevronDown size={10} />
      </div>
    </div>
  );
}
