import { ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';

// "X 条新消息" 蓝色气泡，固定在底部
export default function GroupNewMsgPill({ count, onClick }) {
  if (!count || count <= 0) return null;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute left-1/2 -translate-x-1/2 bottom-3 z-10 px-3 py-1.5 rounded-full
        bg-[color:var(--accent)] text-white text-xs shadow-md inline-flex items-center gap-1
        hover:opacity-90"
    >
      <ChevronDown size={14} />
      {count} 条新消息
    </motion.button>
  );
}
