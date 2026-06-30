import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, CornerUpLeft, Trash2, Undo2, AlertCircle, Crown } from 'lucide-react';
import GroupReplyCard from './GroupReplyCard';
import GroupMemberAvatar from './GroupMemberAvatar';
import { cn } from '../ui/cn';
import { BlocksRenderer, MD_COMPONENTS } from '../chat/blocks';
import { parseAssistantContent } from '../chat/blockUtils';

const TEXT_EMOJI_MAP = {
  '[微笑]': '😊', '[撇嘴]': '😣', '[色]': '😍', '[发呆]': '😳', '[得意]': '😎',
  '[流泪]': '😢', '[害羞]': '😊', '[闭嘴]': '🤐', '[睡]': '😴', '[大哭]': '😭',
  '[尴尬]': '😅', '[发怒]': '😡', '[调皮]': '😜', '[呲牙]': '😁', '[惊讶]': '😮',
  '[难过]': '😞', '[抓狂]': '🤯', '[吐]': '🤮', '[偷笑]': '🤭', '[可爱]': '🥰',
  '[白眼]': '🙄', '[傲慢]': '😤', '[饥饿]': '😋', '[困]': '😪', '[惊恐]': '😱',
  '[流汗]': '😓', '[憨笑]': '😄', '[悠闲]': '😌', '[奋斗]': '💪', '[咒骂]': '🤬',
  '[疑问]': '❓', '[嘘]': '🤫', '[晕]': '😵', '[衰]': '😩', '[骷髅]': '💀',
  '[敲打]': '🔨', '[再见]': '👋', '[擦汗]': '😓', '[抠鼻]': '🤏', '[鼓掌]': '👏',
  '[坏笑]': '😏', '[哈欠]': '🥱', '[鄙视]': '😒', '[委屈]': '🥺', '[阴险]': '😈',
  '[亲亲]': '😘', '[可怜]': '🥹', '[笑脸]': '😊', '[生病]': '🤒', '[脸红]': '☺️',
  '[破涕为笑]': '😂', '[恐惧]': '😰', '[失望]': '😞', '[无语]': '😑',
  '[捂脸]': '🤦', '[奸笑]': '😏', '[机智]': '🧐', '[皱眉]': '😟',
  '[耶]': '✌️', '[吃瓜]': '🍉', '[加油]': '💪', '[汗]': '😓', '[天啊]': '😱',
  '[Emm]': '🤔', '[社会社会]': '😎', '[旺柴]': '🐶', '[好的]': '👌',
  '[打脸]': '🤦', '[哇]': '😮', '[翻白眼]': '🙄', '[666]': '👍',
  '[让我看看]': '👀', '[叹气]': '😮‍💨', '[苦涩]': '😣', '[裂开]': '💔',
  '[嘿哈]': '😃', '[收到]': '✅', '[庆祝]': '🎉',
  '[doge]': '🐶', '[ok]': '👌', '[心]': '❤️', '[碎了]': '💔',
  '[太阳]': '☀️', '[月亮]': '🌙', '[星星]': '⭐', '[拥抱]': '🤗',
  '[强]': '👍', '[弱]': '👎', '[握手]': '🤝', '[胜利]': '✌️',
  '[抱拳]': '🙏', '[勾引]': '😏', '[拳头]': '✊', '[差劲]': '👎',
  '[爱你]': '🥰', '[NO]': '🙅', '[OK]': '👌',
  '[玫瑰]': '🌹', '[凋谢]': '🥀', '[咖啡]': '☕', '[蛋糕]': '🎂',
  '[闪电]': '⚡', '[炸弹]': '💣', '[刀]': '🔪', '[足球]': '⚽',
  '[瓢虫]': '🐞', '[便便]': '💩', '[西瓜]': '🍉', '[啤酒]': '🍺',
  '[礼物]': '🎁', '[红包]': '🧧', '[烟花]': '🎆', '[爆竹]': '🧨',
  '[猪头]': '🐷', '[跳跳]': '🤸', '[发抖]': '🥶', '[转圈]': '🔄',
};
const TEXT_EMOJI_RE = new RegExp('(\\[(?:' + Object.keys(TEXT_EMOJI_MAP).map(k => k.slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\])', 'g');

function findSenderMember(members, msg, myInstanceID, myNickname) {
  if (!members?.length) return null;
  if (msg.msg_type === 'user_post') {
    return members.find((m) => m.role === 'human')
      || members.find((m) => m.agent_name === msg.sender_agent_name);
  }
  return members.find((m) => m.agent_name === msg.sender_agent_name && m.role !== 'human');
}

function replaceTextEmojis(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(TEXT_EMOJI_RE, (match) => TEXT_EMOJI_MAP[match] || match);
}

function renderWithMentions(text) {
  if (!text) return text;
  const re = /@([一-鿿㐀-䶿\w_-]{1,40})/gu;
  const parts = [];
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(replaceTextEmojis(text.slice(last, m.index)));
    parts.push(
      <span key={i++} className="text-[color:var(--accent)] font-medium">
        @{m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(replaceTextEmojis(text.slice(last)));
  return parts;
}

function safeImages(imagesJSON) {
  if (!imagesJSON) return [];
  if (Array.isArray(imagesJSON)) return imagesJSON;
  try {
    const arr = JSON.parse(imagesJSON);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function GroupMessageBubble({
  msg,
  prevMsg,
  members,
  myInstanceID,
  myNickname,
  onReply,
  onRecall,
  onJumpToReply,
  showTimestamp,
}) {
  const isSystem = msg.msg_type === 'system';
  const isUserPost = msg.msg_type === 'user_post';
  const isAgentMsg = !isSystem && !isUserPost;
  const sender = findSenderMember(members, msg, myInstanceID, myNickname);
  const displayName = sender?.display_name || msg.sender_agent_name;
  const isMine = (isUserPost && msg.sender_peer_id === myInstanceID) ||
                 (msg.sender_agent_name === myNickname && msg.sender_agent_id === 0);
  const isHostAgent = sender?.is_local && sender?.role !== 'human' && !isMine;

  // 合并气泡判断（与上一条同发送者 + 3 分钟内）
  let merged = false;
  if (prevMsg && !isSystem && prevMsg.msg_type !== 'system') {
    const sameSender = prevMsg.sender_peer_id === msg.sender_peer_id
      && prevMsg.sender_agent_name === msg.sender_agent_name;
    const dtMin = (new Date(msg.created_at) - new Date(prevMsg.created_at)) / 60000;
    if (sameSender && dtMin < 3 && !msg.reply_to_id) merged = true;
  }

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef(null);
  const bubbleRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const openMenu = (e) => {
    e.preventDefault();
    const rect = bubbleRef.current?.getBoundingClientRect();
    setMenuPos({
      x: (e.clientX || rect?.right || 0),
      y: (e.clientY || rect?.bottom || 0),
    });
    setMenuOpen(true);
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => openMenu(e), 500);
  };
  const cancelLongPress = () => clearTimeout(longPressTimer.current);

  // system 消息：居中胶囊
  if (isSystem) {
    return (
      <div className="text-center my-3">
        <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--text-faint)] px-3 py-1 rounded-full bg-[color:var(--bg-soft)]">
          <AlertCircle size={11} /> {msg.content}
        </span>
      </div>
    );
  }

  // 撤回标记
  if (msg.is_recalled) {
    return (
      <div className="text-center my-2">
        <span className="text-[11px] text-[color:var(--text-faint)] italic">
          {isMine ? '你' : msg.sender_agent_name} 撤回了一条消息
        </span>
      </div>
    );
  }

  // 是否可撤回（自己的 + 2 分钟内）
  const canRecall = isMine && (Date.now() - new Date(msg.created_at).getTime() < 2 * 60 * 1000);

  const images = safeImages(msg.images);

  // 引用对象（如果有）
  const replyOriginal = msg.reply_to_id
    ? (msg._reply_original || null)
    : null;

  return (
    <div className="my-1">
      {showTimestamp && (
        <div className="text-center my-2">
          <span className="text-[11px] text-[color:var(--text-faint)] bg-black/[0.04] dark:bg-white/[0.04] px-2 py-0.5 rounded">
            {formatTimestamp(msg.created_at)}
          </span>
        </div>
      )}
      <div className={cn('flex gap-2', isMine ? 'flex-row-reverse' : 'flex-row')}>
        <div className="w-9 shrink-0">
          {!merged && (
            <GroupMemberAvatar
              member={sender}
              name={displayName}
              isLocal={sender?.is_local}
              isUser={isUserPost || sender?.role === 'human'}
              role={sender?.role}
              size={36}
            />
          )}
        </div>
        <div className={cn('max-w-[85%] min-w-0 flex flex-col', isMine ? 'items-end' : 'items-start')}>
          {!merged && !isMine && (
            <div className="text-[11px] text-[color:var(--text-faint)] mb-0.5 px-1 flex items-center gap-1">
              <span>{displayName}</span>
              {sender?.role === 'human' && (
                <span className="text-[9px] px-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">人类</span>
              )}
              {isHostAgent && <Crown size={10} className="text-amber-500" />}
            </div>
          )}
          <div
            ref={bubbleRef}
            onContextMenu={openMenu}
            onMouseDown={onMouseDown}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            className={cn(
              'relative rounded-lg px-3 py-1.5 text-[14px] leading-relaxed break-words',
              'shadow-sm transition select-text',
              isMine
                ? 'bg-[color:var(--accent)] text-white'
                : 'bg-[color:var(--bg-elev)] text-[color:var(--text)] border border-[color:var(--line)]'
            )}
          >
            {/* 引用块 */}
            {msg.reply_to_id > 0 && (
              <div className="mb-1.5">
                <GroupReplyCard
                  original={replyOriginal || { sender_agent_name: '?', content: '(原消息不在本地)' }}
                  onClick={() => replyOriginal && onJumpToReply?.(replyOriginal.id)}
                  compact
                />
              </div>
            )}

            {/* 图片 */}
            {images.length > 0 && (
              <div className={cn('grid gap-1', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                {images.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={src}
                      alt=""
                      className="rounded-md max-w-[220px] max-h-[220px] object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}

            {/* 文本 / Agent blocks */}
            {msg.content && (
              <div className="md-block prose-a2a">
                {isAgentMsg ? (
                  <BlocksRenderer
                    blocks={parseAssistantContent(msg.content)}
                    live={false}
                  />
                ) : looksLikeMarkdown(msg.content) ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                    {replaceTextEmojis(msg.content)}
                  </ReactMarkdown>
                ) : (
                  <div className="whitespace-pre-wrap">{renderWithMentions(msg.content)}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 长按 / 右键菜单 */}
      {menuOpen && (
        <div
          className="fixed z-50 min-w-[120px] rounded-lg shadow-lg border border-[color:var(--line)]
            bg-[color:var(--bg-elev)] py-1 text-sm"
          style={{ left: Math.min(menuPos.x, window.innerWidth - 160), top: Math.min(menuPos.y, window.innerHeight - 160) }}
        >
          <button
            onClick={() => { navigator.clipboard?.writeText(msg.content || ''); setMenuOpen(false); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-soft)] inline-flex items-center gap-2"
          >
            <Copy size={12} /> 复制
          </button>
          <button
            onClick={() => { onReply?.(msg); setMenuOpen(false); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-soft)] inline-flex items-center gap-2"
          >
            <CornerUpLeft size={12} /> 引用
          </button>
          {canRecall && (
            <button
              onClick={() => { onRecall?.(msg); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-soft)] inline-flex items-center gap-2 text-amber-600"
            >
              <Undo2 size={12} /> 撤回
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function looksLikeMarkdown(text) {
  if (!text) return false;
  return /^(#{1,6}\s|[-*]\s|>\s|\d+\.\s|```|~~~)/m.test(text) || /\*\*[^*]+\*\*/.test(text);
}

function formatTimestamp(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const hm = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    if (sameDay) return hm;
    if (isYesterday) return `昨天 ${hm}`;
    if (now.getFullYear() === d.getFullYear()) {
      return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
    }
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  } catch {
    return '';
  }
}
