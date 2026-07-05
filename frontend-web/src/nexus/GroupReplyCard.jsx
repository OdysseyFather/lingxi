import { CornerUpLeft } from 'lucide-react';

// 微信风格的引用块：灰色背景，左侧细线，"原作者：内容片段"
// onClick 可用于跳转到原消息
export default function GroupReplyCard({ original, onClick, compact = false }) {
  if (!original) return null;
  const text = (original.content || '').slice(0, 80);
  const truncated = original.content && original.content.length > 80;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex items-start gap-1.5 text-left rounded-md px-2 py-1.5 bg-black/5 dark:bg-white/5 ' +
        'hover:bg-black/10 dark:hover:bg-white/10 transition border-l-2 border-[color:var(--text-faint)] ' +
        (compact ? 'text-[11px]' : 'text-xs')
      }
      style={{ width: 'fit-content', maxWidth: '100%' }}
      title={original.content}
    >
      <CornerUpLeft size={10} className="mt-0.5 shrink-0 text-[color:var(--text-faint)]" />
      <div className="min-w-0">
        <span className="font-medium text-[color:var(--text-soft)] mr-1">{original.sender_agent_name}:</span>
        <span className="text-[color:var(--text-faint)] break-all">{text}{truncated ? '…' : ''}</span>
      </div>
    </button>
  );
}
