import { useState, useCallback, useRef, useEffect } from 'react';
import { Copy, Check, RefreshCw, User, Sparkles, Pencil, X, Send, ThumbsUp, ThumbsDown } from 'lucide-react';
import { BlocksRenderer, UsageFooter } from './blocks';
import { parseAssistantContent } from './blockUtils';
import { useStore } from '../state/useStore';
import { cn } from '../ui/cn';

function parseUserContent(content) {
  if (!content) return { text: '', images: [] };
  if (content[0] === '{') {
    try {
      const obj = JSON.parse(content);
      if (obj && (obj.text != null || Array.isArray(obj.images))) {
        return { text: obj.text || '', images: obj.images || [] };
      }
    } catch { /* fallthrough */ }
  }
  return { text: String(content), images: [] };
}

function extractTextFromBlocks(blocks) {
  return blocks
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n\n')
    .trim();
}

function UserAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm self-start mt-0.5">
      <User size={14} className="text-white" />
    </div>
  );
}

function AgentAvatar() {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const agent = agents.find(a => a.id === activeAgentId);
  const avatar = agent?.avatar;

  if (avatar && avatar !== '✦') {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent flex items-center justify-center shrink-0 text-base ring-1 ring-[color:var(--accent-soft)] self-start mt-0.5">
        {avatar}
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] flex items-center justify-center shrink-0 shadow-sm self-start mt-0.5">
      <Sparkles size={14} className="text-white" />
    </div>
  );
}

function ChatImage({ src }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="rounded-lg h-20 w-32 bg-[color:var(--bg-soft)] border border-[color:var(--line)] flex items-center justify-center text-xs text-[color:var(--text-faint)]">
        图片加载失败
      </div>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img
        src={src}
        onError={() => setErrored(true)}
        className="rounded-lg max-h-56 max-w-[240px] object-cover ring-1 ring-white/30 shadow-soft hover:scale-[1.02] transition"
        alt=""
      />
    </a>
  );
}

const actionBtnCls = `p-1.5 rounded-md bg-[color:var(--bg-soft)] border border-[color:var(--line)]
  hover:border-[color:var(--accent)] hover:bg-[color:var(--bg-elev)]
  text-[color:var(--text-faint)] hover:text-[color:var(--accent)] transition`;

export function UserBubble({ message }) {
  const content = message?.content;
  const { text, images } = parseUserContent(content);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const editAndResend = useStore((s) => s.editAndResend);
  const isStreaming = useStore((s) => s.isStreaming);
  const taRef = useRef(null);

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [editing]);

  const handleStartEdit = () => {
    setEditText(text);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleSave = () => {
    const trimmed = editText.trim();
    if (!trimmed || !message?.id) return;
    setEditing(false);
    editAndResend(message.id, trimmed);
  };

  if (editing) {
    return (
      <div className="flex justify-end gap-2.5 my-3">
        <div className="user-bubble !bg-transparent !shadow-none !p-0 w-full max-w-md">
          <div className="surface border border-[color:var(--accent)]/40 rounded-2xl overflow-hidden">
            <textarea
              ref={taRef}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                if (e.key === 'Escape') handleCancel();
              }}
              rows={1}
              className="w-full px-4 py-3 bg-[color:var(--bg-elev)] text-[color:var(--text)] text-[15px] leading-6
                resize-none outline-none border-none"
            />
            <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
                  text-[color:var(--text-faint)] hover:bg-[color:var(--bg-soft)] transition"
              >
                <X size={12} /> 取消
              </button>
              <button
                onClick={handleSave}
                disabled={!editText.trim()}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  editText.trim()
                    ? 'bg-[color:var(--accent)] text-white hover:opacity-90'
                    : 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] cursor-not-allowed'
                )}
              >
                <Send size={12} /> 保存并重发
              </button>
            </div>
          </div>
        </div>
        <UserAvatar />
      </div>
    );
  }

  return (
    <div className="group/msg flex justify-end gap-2.5 my-3">
      <div className="user-bubble relative">
        {images.length > 0 && (
          <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} ${text ? 'mb-2' : ''}`}>
            {images.map((src, i) => (
              <ChatImage key={i} src={src} />
            ))}
          </div>
        )}
        {text && <div>{text}</div>}

        {message?.id && !isStreaming && (
          <div className="absolute -left-1 top-1 flex flex-col gap-1 opacity-0 group-hover/msg:opacity-100 transition">
            <button
              onClick={handleStartEdit}
              className={actionBtnCls}
              title="编辑消息"
            >
              <Pencil size={14} />
            </button>
          </div>
        )}
      </div>
      <UserAvatar />
    </div>
  );
}

export function AssistantBubble({ message, live = false, liveBlocks = null }) {
  const blocks = liveBlocks || parseAssistantContent(message?.content || '');
  const [copied, setCopied] = useState(false);
  const regenerate = useStore((s) => s.regenerate);
  const setFeedback = useStore((s) => s.setFeedback);
  const isStreaming = useStore((s) => s.isStreaming);

  const feedback = message?.feedback || '';

  const handleCopy = useCallback(() => {
    const text = extractTextFromBlocks(blocks);
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [blocks]);

  const handleFeedback = useCallback((val) => {
    if (!message?.id || message.id < 0) return;
    setFeedback(message.id, feedback === val ? '' : val);
  }, [message?.id, feedback, setFeedback]);

  const hasText = blocks.some(b => b.type === 'text' && b.text?.trim());

  return (
    <div className="group/msg flex justify-start gap-2.5 my-3">
      <AgentAvatar />
      <div className={`assistant-bubble relative ${live ? 'streaming-pulse' : ''}`}>
        <BlocksRenderer blocks={blocks} live={live} />
        {!live && message?.usage && <UsageFooter usageJSON={message.usage} />}

        {!live && hasText && (
          <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-[color:var(--line)]/50">
            <button
              onClick={() => handleFeedback('up')}
              className={cn(
                'p-1.5 rounded-md transition',
                feedback === 'up'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'text-[color:var(--text-faint)] hover:text-emerald-600 hover:bg-emerald-500/10'
              )}
              title="有帮助"
            >
              <ThumbsUp size={14} />
            </button>
            <button
              onClick={() => handleFeedback('down')}
              className={cn(
                'p-1.5 rounded-md transition',
                feedback === 'down'
                  ? 'bg-red-500/10 text-red-500'
                  : 'text-[color:var(--text-faint)] hover:text-red-500 hover:bg-red-500/10'
              )}
              title="没有帮助"
            >
              <ThumbsDown size={14} />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition">
              <button
                onClick={handleCopy}
                className={actionBtnCls}
                title="复制内容"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
              {message?.id && !isStreaming && (
                <button
                  onClick={() => regenerate(message.id)}
                  className={actionBtnCls}
                  title="重新生成"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
