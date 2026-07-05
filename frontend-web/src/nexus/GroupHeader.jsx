import { createPortal } from 'react-dom';
import { ArrowLeft, Users, MoreHorizontal, Trash2, Pause, Play, Briefcase } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../ui/cn';
import GroupMemberAvatar from './GroupMemberAvatar';

// 微信风顶部栏：返回 / 标题 / 头像堆叠 / 更多菜单（Portal 避免被消息层遮挡）
export default function GroupHeader({
  room,
  members,
  onBack,
  onOpenMembers,
  onPause,
  onResume,
  onTerminate,
  onLeave,
  onDelete,
}) {
  const joined = (members || []).filter((m) => m.status === 'joined' || m.role === 'human');
  const stack = joined.slice(0, 9);
  const remaining = joined.length - stack.length;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuRef = useRef(null);
  const btnRef = useRef(null);

  const openMenu = useCallback((e) => {
    e?.stopPropagation?.();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [menuOpen]);

  const menu = menuOpen ? (
    <div
      ref={menuRef}
      className="fixed z-[300] w-40 rounded-xl shadow-2xl border border-[color:var(--line)] bg-[color:var(--bg-elev)] py-1"
      style={{ top: menuPos.top, right: menuPos.right }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {room.status === 'active' && (
        <button
          type="button"
          onClick={() => { setMenuOpen(false); onPause?.(); }}
          className="w-full text-left px-3 py-2 text-xs hover:bg-[color:var(--bg-soft)] text-[color:var(--text)] inline-flex items-center gap-2"
        >
          <Pause size={12} /> 停止群聊
        </button>
      )}
      {room.status === 'paused' && (
        <button
          type="button"
          onClick={() => { setMenuOpen(false); onResume?.(); }}
          className="w-full text-left px-3 py-2 text-xs hover:bg-[color:var(--bg-soft)] text-emerald-600 inline-flex items-center gap-2"
        >
          <Play size={12} /> 继续群聊
        </button>
      )}
      {room.status === 'active' && (
        <button
          type="button"
          onClick={() => { setMenuOpen(false); onTerminate?.(); }}
          className="w-full text-left px-3 py-2 text-xs hover:bg-[color:var(--bg-soft)] text-[color:var(--text)]"
        >
          结束群聊
        </button>
      )}
      <button
        type="button"
        onClick={() => { setMenuOpen(false); onLeave?.(); }}
        className="w-full text-left px-3 py-2 text-xs hover:bg-[color:var(--bg-soft)] text-[color:var(--text)]"
      >
        退出群聊
      </button>
      <div className="my-1 border-t border-[color:var(--line)]" />
      <button
        type="button"
        onClick={() => { setMenuOpen(false); onDelete?.(); }}
        className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 inline-flex items-center gap-2"
      >
        <Trash2 size={12} /> 删除群聊
      </button>
    </div>
  ) : null;

  return (
    <div className="relative z-20 border-b border-[color:var(--line)] px-3 py-2 flex items-center gap-2 bg-[color:var(--bg-elev)]/70 backdrop-blur shrink-0">
      <button
        type="button"
        onClick={onBack}
        className="p-1.5 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]"
        title="返回"
      >
        <ArrowLeft size={16} />
      </button>
      <button
        type="button"
        onClick={onOpenMembers}
        className="flex-1 min-w-0 text-left px-2 py-1 rounded-lg hover:bg-[color:var(--bg-soft)] transition"
      >
        <div className="flex items-center gap-2">
          {room.chat_mode === 'meeting' && (
            <span className="text-[10px] px-1.5 py-px rounded shrink-0 inline-flex items-center gap-0.5 bg-[color:var(--accent-soft)] text-[color:var(--accent)] font-medium">
              <Briefcase size={10} /> 会议
            </span>
          )}
          <span className="text-sm font-semibold truncate">
            {room.topic || (room.chat_mode === 'meeting' ? '工作会议' : '群聊')}
          </span>
          <span className={cn(
            'text-[10px] px-1.5 py-px rounded shrink-0',
            room.status === 'active'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : room.status === 'paused'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]'
          )}>
            {room.status === 'active' ? '进行中' : room.status === 'paused' ? '已停止' : room.status === 'completed' ? '已结束' : room.status}
          </span>
          {room.chat_mode === 'meeting' && room.status === 'active' && room.max_rounds > 0 && (
            <span className="text-[10px] px-1.5 py-px rounded shrink-0 bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]">
              第 {Math.min((room.current_round || 0) + 1, room.max_rounds)}/{room.max_rounds} 轮
            </span>
          )}
          <span className="text-[11px] text-[color:var(--text-faint)]">{joined.length} 人</span>
        </div>
        {room.goal && <div className="text-[11px] text-[color:var(--text-faint)] truncate mt-0.5">{room.chat_mode === 'meeting' ? '目标：' : ''}{room.goal}</div>}
      </button>

      <button
        type="button"
        onClick={onOpenMembers}
        className="hidden md:flex items-center -space-x-1.5 pl-2 pr-1 py-1 rounded-lg hover:bg-[color:var(--bg-soft)] transition"
        title="查看成员"
      >
        {stack.map((m) => (
          <div key={m.id || m.agent_name} className="ring-2 ring-[color:var(--bg-elev)] rounded-md">
            <GroupMemberAvatar member={m} size={24} />
          </div>
        ))}
        {remaining > 0 && (
          <div className="ring-2 ring-[color:var(--bg-elev)] w-6 h-6 rounded-md bg-[color:var(--bg-soft)] flex items-center justify-center text-[9px] text-[color:var(--text-faint)] font-bold">
            +{remaining}
          </div>
        )}
        <Users size={12} className="ml-1.5 text-[color:var(--text-faint)]" />
      </button>

      <div className="relative shrink-0">
        <button
          ref={btnRef}
          type="button"
          onClick={openMenu}
          className="p-1.5 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]"
          title="更多"
        >
          <MoreHorizontal size={16} />
        </button>
        {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
      </div>
    </div>
  );
}
