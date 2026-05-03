import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { useStore } from '../state/useStore';
import { UserBubble, AssistantBubble } from './Bubble';
import { Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '../ui/cn';

const VIRTUALIZE_THRESHOLD = 60;

export function MessageList() {
  const messages = useStore((s) => s.messages);
  const liveBlocks = useStore((s) => s.liveBlocks);
  const isStreaming = useStore((s) => s.isStreaming);
  const activeProfile = useStore((s) => s.activeProfile);
  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const userScrolledRef = useRef(false);

  const items = useMemo(() => {
    const list = messages.map(m => ({ type: 'message', message: m }));
    if (isStreaming && liveBlocks.length > 0) {
      list.push({ type: 'live', liveBlocks });
    } else if (isStreaming && liveBlocks.length === 0) {
      list.push({ type: 'connecting' });
    }
    return list;
  }, [messages, liveBlocks, isStreaming]);

  const shouldVirtualize = items.length > VIRTUALIZE_THRESHOLD;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = atBottom;
    userScrolledRef.current = !atBottom;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el || userScrolledRef.current) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom();
  }, [messages, liveBlocks, isStreaming, scrollToBottom]);

  if (items.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollable">
        <Empty profileName={activeProfile?.name || activeProfile?.model} />
      </div>
    );
  }

  if (shouldVirtualize) {
    return <VirtualizedList items={items} scrollRef={scrollRef} onScroll={handleScroll} />;
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollable px-6 pb-2" onScroll={handleScroll}>
      <div className="max-w-3xl mx-auto py-6">
        {items.map((item, i) => (
          <MessageItem key={item.message?.id || `special-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}

function VirtualizedList({ items, scrollRef, onScroll }) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 8,
  });

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollable px-6 pb-2" onScroll={onScroll}>
      <div className="max-w-3xl mx-auto py-6 relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(row => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 right-0"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            <MessageItem item={items[row.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageItem({ item }) {
  if (item.type === 'live') {
    return <div className="enter-up"><AssistantBubble live liveBlocks={item.liveBlocks} /></div>;
  }
  if (item.type === 'connecting') {
    return (
      <div className="flex justify-start gap-2.5 my-3 enter-up">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] flex items-center justify-center shrink-0 shadow-sm self-start mt-0.5">
          <Sparkles size={14} className="text-white" />
        </div>
        <div className="assistant-bubble thinking-shimmer flex items-center gap-3 text-[color:var(--text-soft)]">
          <div className="flex items-end gap-[3px] h-5">
            <span className="neural-bar" style={{ animationDelay: '0s' }} />
            <span className="neural-bar" style={{ animationDelay: '0.15s' }} />
            <span className="neural-bar" style={{ animationDelay: '0.3s' }} />
          </div>
          <span className="text-sm">灵犀正在思考…</span>
        </div>
      </div>
    );
  }
  const m = item.message;
  return (
    <div className="enter-up">
      {m.role === 'user' ? <UserBubble message={m} /> : <AssistantBubble message={m} />}
    </div>
  );
}

const heroContainer = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.3 } },
};
const heroChar = {
  initial: { opacity: 0, y: 14, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [.22,1,.36,1] } },
};
const cardStagger = {
  animate: { transition: { staggerChildren: 0.1, delayChildren: 0.8 } },
};
const cardItem = {
  initial: { opacity: 0, y: 20, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [.22,1,.36,1] } },
};

function Empty({ profileName }) {
  const examples = [
    { text: '帮我把这周的会议纪要整理成行动项', icon: '📋' },
    { text: '解释一下 transformer 的注意力机制', icon: '🧠' },
    { text: '写一个 Python 脚本批量重命名图片', icon: '💻' },
    { text: '把这段中文翻译成地道的英文', icon: '🌍' },
  ];
  const sendMessage = useStore((s) => s.sendMessage);
  const title = '你好，我是灵犀';
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-10 text-center">
      {/* AI 核心光环 */}
      <motion.div
        className="relative mb-8"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [.22,1,.36,1] }}
      >
        <div className="ai-core-ring w-22 h-22 rounded-3xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow" style={{ width: 88, height: 88 }}>
          <Sparkles size={36} />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-[color:var(--bg)] flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white" style={{ animation: 'breathe 1.6s ease-in-out infinite' }} />
        </div>
      </motion.div>

      {/* 逐字浮入标题 */}
      <motion.h2
        className="text-3xl font-bold tracking-tight"
        variants={heroContainer}
        initial="initial"
        animate="animate"
      >
        {title.split('').map((ch, i) => (
          <motion.span
            key={i}
            variants={heroChar}
            className={i >= 5 ? 'text-gradient' : ''}
          >{ch}</motion.span>
        ))}
      </motion.h2>

      <motion.p
        className="mt-3 text-[color:var(--text-soft)] text-base max-w-md"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4, ease: [.22,1,.36,1] }}
      >
        {profileName ? `当前接入：${profileName}` : '你的智能 AI 桌面助理，随时为你查信息、写内容、整理思路'}
      </motion.p>

      {/* 示例卡片 stagger 入场 */}
      <motion.div
        className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl"
        variants={cardStagger}
        initial="initial"
        animate="animate"
      >
        {examples.map((q) => (
          <motion.button
            key={q.text}
            variants={cardItem}
            whileHover={{ y: -2, boxShadow: '0 0 0 1px var(--accent-soft), 0 8px 30px -4px var(--accent-glow)' }}
            className="group/card surface surface-hover text-left px-4 py-3.5"
            onClick={() => sendMessage({ message: q.text })}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0">{q.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[color:var(--text)]">{q.text}</div>
              </div>
              <ArrowRight size={14} className="shrink-0 mt-0.5 text-[color:var(--text-faint)] opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0.5 transition-all" />
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
