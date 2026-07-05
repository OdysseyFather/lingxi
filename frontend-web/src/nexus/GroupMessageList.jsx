import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import GroupMessageBubble from './GroupMessageBubble';
import GroupNewMsgPill from './GroupNewMsgPill';
import { cn } from '../ui/cn';
import { BlocksRenderer } from '../chat/blocks';
import GroupMemberAvatar from './GroupMemberAvatar';

function GroupLiveStream({ streamKey, blocks, members, isMine }) {
  const [peerId, agentName] = streamKey.split('|');
  const sender = members.find((m) => m.peer_id === peerId && m.agent_name === agentName)
    || members.find((m) => m.agent_name === agentName);
  const label = sender?.display_name || agentName;
  return (
    <div className={cn('my-1 flex gap-2', isMine ? 'flex-row-reverse' : 'flex-row')}>
      <div className="w-9 shrink-0">
        <GroupMemberAvatar member={sender} name={label} size={36} />
      </div>
      <div className={cn('max-w-[85%] min-w-0 flex flex-col', isMine ? 'items-end' : 'items-start')}>
        <div className="text-[11px] text-[color:var(--text-faint)] mb-0.5 px-1 flex items-center gap-1.5">
          <span>{label}</span>
          <span className="flex items-end gap-[2px] h-2.5">
            <span className="w-1 h-1 bg-[color:var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 bg-[color:var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 bg-[color:var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          <span>正在输入…</span>
        </div>
        <div className={cn(
          'rounded-lg px-3 py-1.5 text-sm leading-relaxed border border-dashed prose-a2a min-h-[2em]',
          'bg-white/60 dark:bg-[color:var(--bg-elev)]/60 border-[color:var(--accent)]/30'
        )}>
          <BlocksRenderer
            blocks={blocks || []}
            live
          />
        </div>
      </div>
    </div>
  );
}

function TypingPlaceholder({ name, members }) {
  const sender = members.find((m) => m.agent_name === name);
  const label = sender?.display_name || name;
  return (
    <div className="my-1 flex gap-2">
      <div className="w-9 shrink-0">
        <GroupMemberAvatar member={sender} name={label} size={36} />
      </div>
      <div className="flex flex-col items-start">
        <div className="text-[11px] text-[color:var(--text-faint)] mb-0.5 px-1">{name}</div>
        <div className="rounded-lg px-3 py-2 bg-white dark:bg-[color:var(--bg-elev)] border border-[color:var(--line)] inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--text-faint)] animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--text-faint)] animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--text-faint)] animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

export default function GroupMessageList({
  messages,
  members,
  liveStreams,
  typingAgents,
  myInstanceID,
  myNickname,
  onReply,
  onRecall,
  onLoadOlder,
}) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lastLengthRef = useRef(messages.length);

  // 构建原消息查找表（用于引用渲染）
  const byId = useMemo(() => {
    const m = new Map();
    for (const msg of messages) m.set(msg.id, msg);
    return m;
  }, [messages]);

  // 增量消息时滚动 / 新消息计数
  useEffect(() => {
    const added = messages.length - lastLengthRef.current;
    lastLengthRef.current = messages.length;
    if (stickToBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (added > 0) {
      setNewCount((c) => c + added);
    }
  }, [messages.length, stickToBottom]);

  // 监听滚动 - 判断是否贴底
  const onScroll = async (e) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (distFromBottom < 80) {
      if (!stickToBottom) {
        setStickToBottom(true);
        setNewCount(0);
      }
    } else if (stickToBottom) {
      setStickToBottom(false);
    }
    // 下拉到顶 - 加载更早
    if (el.scrollTop < 24 && !loadingOlder) {
      setLoadingOlder(true);
      try {
        const prevHeight = el.scrollHeight;
        const ok = await onLoadOlder?.();
        if (ok) {
          // 维持滚动位置
          requestAnimationFrame(() => {
            const delta = el.scrollHeight - prevHeight;
            el.scrollTop = delta + 24;
          });
        }
      } finally {
        setLoadingOlder(false);
      }
    }
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setStickToBottom(true);
    setNewCount(0);
  };

  // 计算每条消息是否要展示时间戳（> 3 分钟差）
  const enriched = useMemo(() => {
    const out = [];
    for (let i = 0; i < messages.length; i++) {
      const cur = messages[i];
      const prev = i > 0 ? messages[i - 1] : null;
      let showTs = false;
      if (!prev) showTs = true;
      else {
        const dtMin = (new Date(cur.created_at) - new Date(prev.created_at)) / 60000;
        if (dtMin >= 3) showTs = true;
      }
      const reply = cur.reply_to_id ? byId.get(cur.reply_to_id) : null;
      out.push({ msg: { ...cur, _reply_original: reply }, prevMsg: prev, showTs });
    }
    return out;
  }, [messages, byId]);

  return (
    <div className="flex-1 min-h-0 relative">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="absolute inset-0 overflow-y-auto scrollable px-3 py-2 bg-[#ededed] dark:bg-[color:var(--bg)]"
      >
        {loadingOlder && (
          <div className="text-center py-2 text-[11px] text-[color:var(--text-faint)] inline-flex items-center justify-center gap-1 w-full">
            <Loader2 size={11} className="animate-spin" /> 加载更早…
          </div>
        )}
        {messages.length === 0 && Object.keys(liveStreams || {}).length === 0 && (
          <div className="text-center py-16 text-[color:var(--text-faint)] text-sm">
            还没有消息，输入内容开始群聊
          </div>
        )}
        {enriched.map(({ msg, prevMsg, showTs }) => (
          <GroupMessageBubble
            key={msg.id || msg.client_msg_id || `${msg.sender_peer_id}_${msg.created_at}`}
            msg={msg}
            prevMsg={prevMsg}
            members={members}
            myInstanceID={myInstanceID}
            myNickname={myNickname}
            onReply={onReply}
            onRecall={onRecall}
            showTimestamp={showTs}
            onJumpToReply={(id) => {
              const el = document.querySelector(`[data-msg-id="${id}"]`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          />
        ))}
        {/* "正在输入" 占位（agent 已被选中但尚未开始 stream） */}
        {typingAgents && Object.keys(typingAgents).map((name) => {
          // 若该 agent 已在 liveStreams 中（有 sender_agent_name 与之匹配），不重复显示
          const inStream = Object.values(liveStreams || {}).some(
            (s) => s.senderAgentName === name
          );
          if (inStream) return null;
          return <TypingPlaceholder key={`typing-${name}`} name={name} members={members} />;
        })}
        {Object.entries(liveStreams || {}).map(([key, val]) => (
          <GroupLiveStream
            key={key}
            streamKey={key}
            blocks={val.blocks || []}
            members={members}
            isMine={val.senderPeerId === myInstanceID && val.senderAgentName === myNickname}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <GroupNewMsgPill count={newCount} onClick={scrollToBottom} />
    </div>
  );
}
