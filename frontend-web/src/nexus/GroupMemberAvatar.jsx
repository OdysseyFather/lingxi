import AgentAvatar from '../ui/AgentAvatar';
import { cn } from '../ui/cn';

/** 群成员头像：Agent 用 emoji/图片，人类用绿色首字 */
export default function GroupMemberAvatar({
  member,
  name,
  isLocal,
  isUser,
  role,
  avatar,
  size = 36,
}) {
  const displayName = member?.display_name || member?.agent_name || name || '?';
  const av = member?.avatar || avatar;
  const isHuman = role === 'human' || member?.role === 'human' || isUser;
  const local = member?.is_local ?? isLocal;

  if (!isHuman && av) {
    return (
      <AgentAvatar
        avatar={av}
        name={displayName}
        size={size}
        className={cn(
          !local && 'ring-1 ring-purple-300/50'
        )}
      />
    );
  }

  const px = size;
  const fontSize = px * 0.42;
  const tone = isHuman
    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
    : local
      ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
      : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400';

  return (
    <div
      className={cn('rounded-md flex items-center justify-center font-bold shrink-0 select-none overflow-hidden', tone)}
      style={{ width: px, height: px, fontSize }}
      title={displayName}
    >
      {displayName[0] || '?'}
    </div>
  );
}
