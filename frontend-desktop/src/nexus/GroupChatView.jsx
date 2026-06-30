import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../state/useStore';
import GroupHeader from './GroupHeader';
import GroupMessageList from './GroupMessageList';
import GroupComposer from './GroupComposer';
import GroupMemberDrawer from './GroupMemberDrawer';

export default function GroupChatView({ roomId, onBack }) {
  const detail = useStore((s) => s.groupRoomDetail);
  const liveStreams = useStore((s) => s.groupLiveStreams || {});
  const typingAgents = useStore((s) => s.groupTypingAgents || {});
  const drafts = useStore((s) => s.groupDrafts || {});
  const refreshDetail = useStore((s) => s.refreshActiveGroupRoom);
  const setActive = useStore((s) => s.setActiveGroupRoom);
  const refreshList = useStore((s) => s.refreshGroupChats);
  const loadOlder = useStore((s) => s.loadOlderGroupMessages);
  const setGroupDraft = useStore((s) => s.setGroupDraft);
  const clearGroupDraft = useStore((s) => s.clearGroupDraft);

  const [membersOpen, setMembersOpen] = useState(false);
  const [myInstanceID, setMyInstanceID] = useState('');
  const [myNickname, setMyNickname] = useState('我');

  useEffect(() => {
    setActive(roomId);
  }, [roomId, setActive]);

  // 全员共享消息：定时拉取兜底（跨端/漏 WS 时补齐）
  useEffect(() => {
    if (!roomId) return;
    const t = setInterval(() => {
      const detail = useStore.getState().groupRoomDetail;
      if (detail?.room?.id === roomId && detail.room.status === 'active') {
        refreshDetail();
      }
    }, 12000);
    return () => clearInterval(t);
  }, [roomId, refreshDetail]);

  // 获取本端身份信息
  useEffect(() => {
    api.getNexusSettings().then((s) => {
      if (s?.nickname) setMyNickname(s.nickname);
    }).catch(() => {});
    fetch('/api/nexus/info', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((info) => {
        if (info?.instance_id) setMyInstanceID(info.instance_id);
        if (info?.nickname) setMyNickname(info.nickname);
      })
      .catch(() => {});
  }, []);

  const draft = drafts[roomId] || { text: '', replyTo: null, images: [] };

  const handleSend = async (payload) => {
    // 乐观更新：发送后立即在本地显示消息，不等 WS 或轮询
    const optimisticMsg = {
      id: `_opt_${Date.now()}`,
      room_id: roomId,
      sender_peer_id: myInstanceID,
      sender_agent_id: 0,
      sender_agent_name: myNickname || '我',
      msg_type: 'user_post',
      content: payload.content || '',
      reply_to_id: payload.reply_to_id || 0,
      images: JSON.stringify(payload.images || []),
      mentioned_agents: JSON.stringify(
        (payload.mentioned_agents || []).map((n) => ({ agent_name: n })),
      ),
      created_at: new Date().toISOString(),
      _optimistic: true,
    };

    const detail = useStore.getState().groupRoomDetail;
    if (detail && detail.room?.id === roomId) {
      useStore.setState({
        groupRoomDetail: {
          ...detail,
          messages: [...(detail.messages || []), optimisticMsg],
        },
      });
    }

    try {
      await api.postGroupMessage(roomId, payload);
      clearGroupDraft(roomId);
      setTimeout(refreshDetail, 300);
    } catch (e) {
      console.error('postGroupMessage failed', e);
      // 发送失败时移除乐观消息
      const cur = useStore.getState().groupRoomDetail;
      if (cur && cur.room?.id === roomId) {
        useStore.setState({
          groupRoomDetail: {
            ...cur,
            messages: (cur.messages || []).filter((m) => m.id !== optimisticMsg.id),
          },
        });
      }
    }
  };

  const handleRecall = async (msg) => {
    try {
      await api.recallGroupMessage(roomId, msg.id);
      // WS 会广播 group_message_recalled
    } catch (e) {
      alert(e?.message || '撤回失败');
    }
  };

  const handleReply = (msg) => {
    setGroupDraft(roomId, { replyTo: msg });
  };

  const handleCancelReply = () => {
    setGroupDraft(roomId, { replyTo: null });
  };

  const handlePause = async () => {
    if (!confirm('停止后 Agent 将不再自动发言，你可以继续查看记录或手动发消息。')) return;
    await api.pauseGroupChat(roomId);
    refreshDetail();
    refreshList();
  };

  const handleResume = async () => {
    await api.resumeGroupChat(roomId);
    refreshDetail();
    refreshList();
  };

  const handleTerminate = async () => {
    if (!confirm('确认结束该群聊？所有成员都会收到通知。')) return;
    await api.terminateGroupChat(roomId);
    refreshDetail();
    refreshList();
  };

  const handleLeave = async () => {
    if (!confirm('确认退出该群聊？')) return;
    await api.leaveGroupChat(roomId);
    refreshList();
    onBack?.();
  };

  const handleDelete = async () => {
    if (!confirm('确认删除该群聊？聊天记录将被永久清除。')) return;
    await api.deleteGroupChat(roomId);
    refreshList();
    onBack?.();
  };

  const handleDoubleClickAvatar = (member) => {
    setMembersOpen(false);
    setGroupDraft(roomId, { text: (draft.text || '') + ` @${member.agent_name} ` });
  };

  if (!detail || !detail.room) {
    return (
      <div className="flex-1 flex items-center justify-center text-[color:var(--text-faint)] text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> 加载群聊…
      </div>
    );
  }

  const { room, members, messages } = detail;
  const roomTypingAgents = typingAgents[roomId] || {};

  const composerDisabled = room.status !== 'active';

  const amHost =
    !!(room.created_by_local && room.host_peer_id === myInstanceID && myInstanceID);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <GroupHeader
        room={room}
        members={members}
        onBack={onBack}
        onOpenMembers={() => setMembersOpen(true)}
        onPause={handlePause}
        onResume={handleResume}
        onTerminate={handleTerminate}
        onLeave={handleLeave}
        onDelete={handleDelete}
      />

      <GroupMessageList
        messages={messages || []}
        members={members}
        liveStreams={liveStreams}
        typingAgents={roomTypingAgents}
        myInstanceID={myInstanceID}
        myNickname={myNickname}
        onReply={handleReply}
        onRecall={handleRecall}
        onLoadOlder={() => loadOlder(roomId)}
      />

      <GroupComposer
        members={members}
        draft={draft}
        setDraft={(patch) => setGroupDraft(roomId, patch)}
        onSend={handleSend}
        onCancelReply={handleCancelReply}
        onUploadImage={api.uploadGroupImage}
        disabled={composerDisabled}
      />

      <GroupMemberDrawer
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        room={room}
        members={members}
        onDoubleClickAvatar={handleDoubleClickAvatar}
        canManageMembers={amHost && room.status === 'active'}
        onMembersChanged={() => refreshDetail()}
      />

      {composerDisabled && (
        <div className="px-3 py-2 text-center text-[11px] text-[color:var(--text-faint)] bg-[color:var(--bg-soft)] border-t border-[color:var(--line)]">
          {room.status === 'completed' ? '该群聊已结束' : room.status === 'paused' ? '群聊已停止，Agent 不会自动发言（右上角可继续）' : '群聊未激活'}
        </div>
      )}
    </div>
  );
}
