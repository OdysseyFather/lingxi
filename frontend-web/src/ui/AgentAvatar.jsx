import { cn } from './cn';

/** 智能体头像：URL 显示图片，否则 emoji 或首字 */
export default function AgentAvatar({ avatar, name, size = 40, className }) {
  const av = (avatar || '✦').trim();
  const isUrl =
    av.startsWith('/api/uploads/') ||
    av.startsWith('http://') ||
    av.startsWith('https://');
  const isEmoji = !isUrl && av.length <= 8;

  const px = size;
  const style = { width: px, height: px };

  if (isUrl) {
    return (
      <img
        src={av}
        alt={name || ''}
        className={cn('rounded-xl object-cover shrink-0 bg-[color:var(--bg-soft)]', className)}
        style={style}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl flex items-center justify-center font-bold shrink-0 select-none overflow-hidden',
        'bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent text-[color:var(--accent)] ring-1 ring-[color:var(--accent-soft)]',
        className
      )}
      style={{ ...style, fontSize: isEmoji ? px * 0.5 : px * 0.42 }}
      title={name}
    >
      {isEmoji ? av : (name?.[0] || '?')}
    </div>
  );
}
