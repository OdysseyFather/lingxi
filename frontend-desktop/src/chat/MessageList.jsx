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
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollable px-4 pb-2" onScroll={handleScroll}>
      <div className="max-w-4xl mx-auto py-6">
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
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollable px-4 pb-2" onScroll={onScroll}>
      <div className="max-w-4xl mx-auto py-6 relative" style={{ height: virtualizer.getTotalSize() }}>
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
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] flex items-center justify-center shrink-0 shadow-sm self-start mt-0.5 animate-pulse">
          <Sparkles size={14} className="text-white" />
        </div>
        <div className="assistant-bubble thinking-shimmer flex items-center gap-3 text-[color:var(--text-soft)]">
          <div className="flex items-center gap-[5px] h-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-bounce" style={{ animationDelay: '0s', animationDuration: '1.2s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-bounce" style={{ animationDelay: '0.2s', animationDuration: '1.2s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-bounce" style={{ animationDelay: '0.4s', animationDuration: '1.2s' }} />
          </div>
          <span className="text-sm text-[color:var(--text-faint)]">思考中…</span>
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
  const SCENES = [
    { title: '写作', prompt: '帮我润色这段文字，让它更生动', icon: '✍️', from: 'from-orange-400', to: 'to-amber-500' },
    { title: '编程', prompt: '帮我写一段 Python 代码实现快速排序', icon: '💻', from: 'from-blue-400', to: 'to-cyan-500' },
    { title: '翻译', prompt: '把下面这段话翻译成英文', icon: '🌐', from: 'from-purple-400', to: 'to-pink-500' },
    { title: '总结', prompt: '帮我总结一下下面这段内容的要点', icon: '📋', from: 'from-emerald-400', to: 'to-teal-500' },
    { title: '分析', prompt: '帮我分析这个问题的可行解决方案', icon: '🔍', from: 'from-rose-400', to: 'to-red-500' },
    { title: '创意', prompt: '给我一些有趣的创意点子', icon: '💡', from: 'from-yellow-400', to: 'to-orange-500' },
  ];

  const EXAMPLE_GROUPS = [
    { title: '创作写作', icon: Sparkles, color: 'from-violet-500 to-purple-600', items: [
      '帮我把这周的会议纪要整理成行动项',
      '写一封给客户的项目进展更新邮件',
    ]},
    { title: '代码开发', icon: Sparkles, color: 'from-cyan-500 to-blue-600', items: [
      '写一个 Python 脚本批量重命名图片',
      '解释一下 React useEffect 的依赖数组',
    ]},
    { title: '分析研究', icon: Sparkles, color: 'from-amber-500 to-orange-600', items: [
      '对比分析 PostgreSQL 和 MySQL 的优劣',
      '解释一下 transformer 的注意力机制',
    ]},
    { title: '翻译润色', icon: Sparkles, color: 'from-emerald-500 to-teal-600', items: [
      '把这段中文翻译成地道的英文',
      '润色一下这段产品介绍文案',
    ]},
  ];

  const sendMessage = useStore((s) => s.sendMessage);
  const title = '你好，我是灵犀';

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-10 text-center">
      <motion.div
        className="relative mb-6 sm:mb-8"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [.22,1,.36,1] }}
      >
        <div className="ai-core-ring rounded-3xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow" style={{ width: 72, height: 72 }}>
          <Sparkles size={28} />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[color:var(--bg)] flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-white" style={{ animation: 'breathe 1.6s ease-in-out infinite' }} />
        </div>
      </motion.div>

      <motion.h2
        className="text-2xl sm:text-3xl font-bold tracking-tight"
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
        className="mt-3 text-[color:var(--text-soft)] text-sm sm:text-base max-w-md"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4, ease: [.22,1,.36,1] }}
      >
        {profileName ? `当前接入：${profileName}` : '你的智能 AI 桌面助理，随时为你查信息、写内容、整理思路'}
      </motion.p>

      {/* 移动端：场景入口网格（豆包风格） */}
      <motion.div
        className="mt-6 grid grid-cols-3 gap-2.5 w-full max-w-md sm:hidden"
        variants={cardStagger}
        initial="initial"
        animate="animate"
      >
        {SCENES.map((s) => (
          <motion.button
            key={s.title}
            variants={cardItem}
            onClick={() => sendMessage({ message: s.prompt })}
            className={cn(
              'aspect-square rounded-2xl bg-gradient-to-br text-white p-3 flex flex-col items-start justify-between shadow-md active:scale-95 transition-transform',
              s.from, s.to
            )}
          >
            <span className="text-2xl">{s.icon}</span>
            <span className="text-sm font-bold tracking-tight">{s.title}</span>
          </motion.button>
        ))}
      </motion.div>

      {/* 桌面端：分组示例卡片 */}
      <motion.div
        className="mt-8 hidden sm:grid sm:grid-cols-2 gap-3 w-full max-w-2xl"
        variants={cardStagger}
        initial="initial"
        animate="animate"
      >
        {EXAMPLE_GROUPS.map((group) => (
          <motion.div
            key={group.title}
            variants={cardItem}
            className="surface text-left overflow-hidden"
          >
            <div className={cn('px-3 py-2 flex items-center gap-2 bg-gradient-to-r opacity-90', group.color)}>
              <group.icon size={12} className="text-white" />
              <span className="text-[11px] font-semibold text-white tracking-wide">{group.title}</span>
            </div>
            <div className="p-1">
              {group.items.map((text) => (
                <button
                  key={text}
                  onClick={() => sendMessage({ message: text })}
                  className="group/item w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left hover:bg-[color:var(--bg-soft)] transition-all"
                >
                  <span className="text-[13px] text-[color:var(--text)] flex-1 min-w-0 truncate">{text}</span>
                  <ArrowRight size={12} className="shrink-0 text-[color:var(--text-faint)] opacity-0 group-hover/item:opacity-100 group-hover/item:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        className="mt-6 hidden sm:flex items-center gap-4 text-[11px] text-[color:var(--text-faint)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-[10px] font-mono">/</kbd>
          快捷命令
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-[10px] font-mono">⌘K</kbd>
          搜索消息
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-[10px] font-mono">⌘N</kbd>
          新对话
        </span>
      </motion.div>
    </div>
  );
}
