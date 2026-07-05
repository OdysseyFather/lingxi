import { useEffect, useRef, useState } from 'react';
import { Send, Plus, AtSign, Image as ImageIcon, X, Smile, Loader2 } from 'lucide-react';
import GroupReplyCard from './GroupReplyCard';
import GroupMemberAvatar from './GroupMemberAvatar';
import { cn } from '../ui/cn';

const COMMON_EMOJIS = ['😀','😂','🤣','😅','😏','🤔','🙄','😮‍💨','😩','🥲','🫠','🥹','👍','🙌','🙏','👀','✨','💯','🔥','🎉','😎','😭','🥰','😴','🫡','💡','📌','✅','❌','❓'];

// 微信风输入区：+ 菜单（图片）/ emoji / @ 选择器 / 引用预览 / 多行输入
export default function GroupComposer({
  members,
  draft,
  setDraft,
  onSend,
  onCancelReply,
  onUploadImage,
  disabled,
}) {
  const textareaRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionListRef = useRef(null);

  const text = draft.text || '';
  const replyTo = draft.replyTo || null;
  const images = draft.images || [];

  // 引用变化时自动聚焦输入框
  useEffect(() => {
    if (replyTo) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [replyTo]);

  const onChange = (e) => {
    const v = e.target.value;
    setDraft({ text: v });
    const cursor = e.target.selectionStart || v.length;
    const left = v.slice(0, cursor);
    const m = /@([一-鿿㐀-䶿\w_-]{0,40})$/u.exec(left);
    if (m) {
      setMentionQuery(m[1] || '');
      if (!showMentions) setMentionIndex(0);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart || text.length;
    const left = text.slice(0, cursor);
    const right = text.slice(cursor);
    const stripped = left.replace(/@([一-鿿㐀-䶿\w_-]*)$/u, '');
    const nextLeft = stripped + '@' + name + ' ';
    const next = nextLeft + right;
    setDraft({ text: next });
    setShowMentions(false);
    setMentionQuery('');
    setTimeout(() => {
      el.focus();
      const pos = nextLeft.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const insertEmoji = (emoji) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart || text.length;
    const left = text.slice(0, cursor);
    const right = text.slice(cursor);
    const next = left + emoji + right;
    setDraft({ text: next });
    setTimeout(() => {
      el.focus();
      const pos = (left + emoji).length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleSend = async () => {
    const t = text.trim();
    if (!t && images.length === 0) return;
    setSending(true);
    try {
      // 提取 mentions
      const mentions = [];
      const re = /@([一-鿿㐀-䶿\w_-]{1,40})/gu;
      let m;
      while ((m = re.exec(t)) !== null) {
        if (members.find((x) => x.agent_name === m[1])) mentions.push(m[1]);
      }
      await onSend({
        content: t,
        reply_to_id: replyTo?.id || 0,
        images,
        mentioned_agents: mentions,
      });
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex].agent_name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && replyTo) {
      onCancelReply?.();
    }
  };

  const handlePickFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await onUploadImage(file);
      if (r?.url) {
        setDraft({ images: [...images, r.url] });
      }
    } catch (e) {
      console.error('upload image failed', e);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx) => {
    const next = [...images];
    next.splice(idx, 1);
    setDraft({ images: next });
  };

  const filteredMembers = members
    .filter((m) => m.status === 'joined' || m.role === 'human')
    .filter((m) => !mentionQuery || (m.display_name || m.agent_name || '').toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 8);

  // mentionQuery 变化时重置选中索引
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  return (
    <div className="border-t border-[color:var(--line)] bg-[color:var(--bg-elev)] shrink-0">
      {/* 引用预览 */}
      {replyTo && (
        <div className="px-3 pt-2 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <GroupReplyCard original={replyTo} />
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 rounded hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]"
            title="取消引用"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* 图片预览 */}
      {images.length > 0 && (
        <div className="px-3 pt-2 flex gap-1.5 flex-wrap">
          {images.map((url, i) => (
            <div key={i} className="relative">
              <img src={url} className="w-14 h-14 object-cover rounded-md border border-[color:var(--line)]" alt="" />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center"
                title="移除"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* @ 提及 picker */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="px-3 pt-2">
          <div ref={mentionListRef} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)] py-1 max-h-48 overflow-y-auto shadow-md">
            <div className="text-[10px] text-[color:var(--text-faint)] px-2 pb-1">↑↓ 选择 · Enter 确认 · Esc 取消</div>
            {filteredMembers.map((m, idx) => (
              <button
                key={m.id || m.agent_name}
                ref={(el) => { if (idx === mentionIndex && el) el.scrollIntoView({ block: 'nearest' }); }}
                onClick={() => insertMention(m.agent_name)}
                onMouseEnter={() => setMentionIndex(idx)}
                className={cn(
                  'w-full text-left px-2 py-1.5 inline-flex items-center gap-2 text-sm transition-colors',
                  idx === mentionIndex
                    ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'hover:bg-[color:var(--bg-soft)]'
                )}
              >
                <GroupMemberAvatar member={m} size={24} />
                <span>{m.display_name || m.agent_name}</span>
                {m.role === 'human' && <span className="text-[10px] text-emerald-600">人类</span>}
                {m.is_local && m.role !== 'human' && <span className="text-[10px] text-[color:var(--accent)] ml-auto">本端</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Emoji picker */}
      {showEmojis && (
        <div className="px-3 pt-2">
          <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)] p-2 flex flex-wrap gap-1 shadow-md">
            {COMMON_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => insertEmoji(e)}
                className="w-7 h-7 rounded hover:bg-[color:var(--bg-soft)] text-lg"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-1 px-2 py-2">
        <button
          onClick={() => { setShowPlus((v) => !v); setShowEmojis(false); }}
          className="p-2 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]"
          title="更多"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => { setShowEmojis((v) => !v); setShowPlus(false); }}
          className="p-2 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]"
          title="表情"
        >
          <Smile size={18} />
        </button>
        <button
          onClick={() => {
            const el = textareaRef.current;
            if (!el) return;
            const cursor = el.selectionStart || text.length;
            const left = text.slice(0, cursor);
            const right = text.slice(cursor);
            setDraft({ text: left + '@' + right });
            setShowMentions(true);
            setMentionQuery('');
            setTimeout(() => {
              el.focus();
              const pos = (left + '@').length;
              el.setSelectionRange(pos, pos);
            }, 0);
          }}
          className="p-2 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]"
          title="@ 提及"
        >
          <AtSign size={16} />
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={replyTo ? `回复 ${replyTo.sender_agent_name}…` : '说点什么…'}
          rows={1}
          disabled={disabled || sending}
          className="flex-1 px-3 py-2 rounded-lg border text-sm bg-[color:var(--bg)] text-[color:var(--text)]
            border-[color:var(--line)] focus:border-[color:var(--accent)]/60 focus:outline-none
            resize-none max-h-32"
          style={{ minHeight: 38 }}
        />
        <button
          onClick={handleSend}
          disabled={sending || disabled || (!text.trim() && images.length === 0)}
          className={cn(
            'h-9 px-3 rounded-lg text-sm font-medium transition inline-flex items-center gap-1',
            (!text.trim() && images.length === 0)
              ? 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] cursor-not-allowed'
              : 'bg-[color:var(--accent)] text-white hover:opacity-90'
          )}
          title="Enter 发送 · Shift+Enter 换行"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          发送
        </button>
      </div>

      {/* + 菜单 */}
      {showPlus && (
        <div className="px-3 pb-2">
          <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)] p-2 grid grid-cols-4 gap-2 shadow-md">
            <label className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-[color:var(--bg-soft)] cursor-pointer">
              <ImageIcon size={20} className="text-[color:var(--accent)]" />
              <span className="text-[10px]">{uploading ? '上传中…' : '相册'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    handlePickFile(f);
                    setShowPlus(false);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
