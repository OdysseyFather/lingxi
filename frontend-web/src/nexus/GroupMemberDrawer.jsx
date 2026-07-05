import { useState } from 'react';
import { Crown, Trash2, UserPlus } from 'lucide-react';
import { Modal, Badge, Button } from '../ui/primitives';
import { api } from '../api/client';
import GroupMemberAvatar from './GroupMemberAvatar';
import GroupInviteMembersModal from './GroupInviteMembersModal';

export default function GroupMemberDrawer({
  open,
  onClose,
  room,
  members,
  onDoubleClickAvatar,
  canManageMembers,
  onMembersChanged,
}) {
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!open) return null;
  const joined = (members || []).filter((m) => m.status === 'joined' || m.role === 'human');
  const invited = (members || []).filter((m) => m.status === 'invited');
  const roomId = room?.id;

  const handleKickMember = async (m, e) => {
    e?.stopPropagation?.();
    if (!roomId || m.role === 'human') return;
    if (!window.confirm(`将「${m.display_name || m.agent_name}」移出群聊？`)) return;
    try {
      await api.kickGroupMember(roomId, {
        peer_id: m.peer_id || '',
        agent_name: m.agent_name || '',
      });
      onMembersChanged?.();
    } catch (_) {}
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={`群成员（${joined.length}）`} width={460} footer={null}>
        <div className="space-y-1 max-h-[56vh] overflow-y-auto scrollable">
          {joined.map((m) => (
            <div
              key={m.id || `human-${m.agent_name}`}
              onDoubleClick={() => onDoubleClickAvatar?.(m)}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[color:var(--bg-soft)] cursor-pointer"
            >
              <GroupMemberAvatar member={m} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {m.display_name || m.agent_name}
                  {m.role === 'human' && (
                    <Badge tone="success">人类</Badge>
                  )}
                  {room?.host_peer_id === m.peer_id && m.role !== 'human' && (
                    <Crown size={11} className="text-amber-500 shrink-0" />
                  )}
                </div>
                <div className="text-[11px] text-[color:var(--text-faint)] truncate">
                  {m.role === 'human' ? '你（可 @ 昵称插话）' : (m.peer_nickname || m.peer_id || 'Agent')}
                </div>
              </div>
              {m.role === 'human' ? (
                <Badge tone="success">你</Badge>
              ) : m.is_local ? (
                <Badge tone="accent">本端</Badge>
              ) : null}
              {canManageMembers && m.role !== 'human' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="移出群聊"
                  className="!p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  onClick={(ev) => handleKickMember(m, ev)}
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </div>
          ))}
          {invited.length > 0 && (
            <>
              <div className="text-[11px] text-[color:var(--text-faint)] mt-3 px-2">待加入</div>
              {invited.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg opacity-80"
                  onDoubleClick={() => onDoubleClickAvatar?.(m)}
                >
                  <GroupMemberAvatar member={m} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{m.display_name || m.agent_name}</div>
                  </div>
                  <Badge tone="warn">待加入</Badge>
                  {canManageMembers ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="!p-1.5 text-[color:var(--text-soft)]"
                      title="撤回邀请"
                      onClick={(ev) => handleKickMember({ ...m, role: 'agent' }, ev)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  ) : null}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="text-[11px] text-[color:var(--text-faint)] mt-2 text-center">
          双击成员可在输入框中 @ ta
        </div>

        {canManageMembers && roomId ? (
          <div className="mt-3 pt-3 border-t border-[color:var(--line)] flex justify-center">
            <Button type="button" variant="outline" size="sm" className="inline-flex items-center gap-1.5" onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} /> 邀请成员
            </Button>
          </div>
        ) : null}
      </Modal>

      <GroupInviteMembersModal
        open={inviteOpen}
        roomId={roomId}
        onClose={() => setInviteOpen(false)}
        onDone={onMembersChanged}
      />
    </>
  );
}
