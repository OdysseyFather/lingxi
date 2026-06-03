import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Code2, ArrowRight, Sparkles, Zap, Brain, Layers, Terminal, Globe } from 'lucide-react';
import { useStore } from './state/useStore';

const FEATURES_MAIN = [
  { icon: Brain, label: '多模型对话' },
  { icon: Layers, label: '智能体工厂' },
  { icon: Globe, label: 'Agent 协作' },
];

const FEATURES_CODING = [
  { icon: Terminal, label: '终端执行' },
  { icon: Code2, label: '代码审查' },
  { icon: Zap, label: 'Agent 团队' },
];

export default function ModeSelector() {
  const setAppMode = useStore((s) => s.setAppMode);
  const [hovered, setHovered] = useState(null);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center overflow-hidden relative"
      style={{ background: 'linear-gradient(145deg, #f8f6f3 0%, #efe9e1 30%, #e8e0d8 60%, #f0ece8 100%)' }}
    >
      {/* 装饰性背景元素 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, #c4a882 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #a08060 0%, transparent 70%)' }} />
        <div className="absolute top-1/4 left-1/3 w-64 h-64 rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #d4c4a8 0%, transparent 70%)' }} />
      </div>

      {/* Logo + 标题 */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        className="text-center mb-16 relative z-10"
      >
        <motion.div
          className="relative mx-auto mb-6 w-20 h-20"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-[#c4a882] to-[#a08060] opacity-20 blur-xl" />
          <img src="/logo.png" alt="灵犀"
            className="relative w-20 h-20 rounded-[22px] shadow-lg"
            style={{ boxShadow: '0 8px 32px rgba(160, 128, 96, 0.25)' }}
          />
          <motion.div
            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-[#c4a882] to-[#a08060] flex items-center justify-center shadow-md"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 400, damping: 15 }}
          >
            <Sparkles size={12} className="text-white" />
          </motion.div>
        </motion.div>

        <h1 className="text-3xl font-bold mb-3"
          style={{ color: '#3a3530', letterSpacing: '-0.02em' }}>
          欢迎使用灵犀
        </h1>
        <p className="text-[15px] leading-relaxed max-w-sm mx-auto" style={{ color: '#8a7e72' }}>
          选择你的工作模式，随时可以在应用内切换
        </p>
      </motion.div>

      {/* 双卡片 */}
      <div className="flex gap-5 px-6 max-w-2xl w-full relative z-10">
        {/* 灵犀智能体 */}
        <motion.button
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          whileTap={{ scale: 0.98 }}
          onHoverStart={() => setHovered('main')}
          onHoverEnd={() => setHovered(null)}
          onClick={() => setAppMode('main')}
          className="flex-1 group relative p-7 rounded-[20px] text-left overflow-hidden transition-shadow duration-300"
          style={{
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(20px)',
            boxShadow: hovered === 'main'
              ? '0 20px 60px rgba(160, 128, 96, 0.18), 0 0 0 1.5px rgba(196, 168, 130, 0.4)'
              : '0 4px 24px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[20px] overflow-hidden">
            <motion.div
              className="h-full"
              style={{ background: 'linear-gradient(90deg, #c4a882, #d4b896, #c4a882)' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: hovered === 'main' ? 1 : 0 }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'linear-gradient(135deg, #f5efe8 0%, #ebe3d8 100%)' }}>
            <MessageSquare size={22} style={{ color: '#c4a882' }} />
          </div>

          <h2 className="text-[17px] font-bold mb-1.5" style={{ color: '#3a3530' }}>灵犀智能体</h2>
          <p className="text-[13px] leading-relaxed mb-5" style={{ color: '#8a7e72' }}>
            通用桌面 AI 助手，多模型对话、智能体工厂、知识库与 Agent 协作
          </p>

          <div className="flex items-center gap-3 mb-4">
            {FEATURES_MAIN.map((f, i) => (
              <div key={i} className="flex items-center gap-1">
                <f.icon size={11} style={{ color: '#b09878' }} />
                <span className="text-[10px] font-medium" style={{ color: '#a09080' }}>{f.label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-[13px] font-semibold group-hover:gap-2.5 transition-all"
            style={{ color: '#c4a882' }}>
            <span>进入</span>
            <ArrowRight size={14} />
          </div>
        </motion.button>

        {/* Coding Agent */}
        <motion.button
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          whileTap={{ scale: 0.98 }}
          onHoverStart={() => setHovered('coding')}
          onHoverEnd={() => setHovered(null)}
          onClick={() => setAppMode('coding')}
          className="flex-1 group relative p-7 rounded-[20px] text-left overflow-hidden transition-shadow duration-300"
          style={{
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(20px)',
            boxShadow: hovered === 'coding'
              ? '0 20px 60px rgba(60, 80, 120, 0.15), 0 0 0 1.5px rgba(80, 100, 140, 0.35)'
              : '0 4px 24px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[20px] overflow-hidden">
            <motion.div
              className="h-full"
              style={{ background: 'linear-gradient(90deg, #5a7aa0, #7094b8, #5a7aa0)' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: hovered === 'coding' ? 1 : 0 }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'linear-gradient(135deg, #e8edf5 0%, #d8e0ed 100%)' }}>
            <Code2 size={22} style={{ color: '#5a7aa0' }} />
          </div>

          <h2 className="text-[17px] font-bold mb-1.5" style={{ color: '#3a3530' }}>Coding Agent</h2>
          <p className="text-[13px] leading-relaxed mb-5" style={{ color: '#8a7e72' }}>
            专业编程助手，帮你构建、调试和架构项目，支持 Agent 团队协作
          </p>

          <div className="flex items-center gap-3 mb-4">
            {FEATURES_CODING.map((f, i) => (
              <div key={i} className="flex items-center gap-1">
                <f.icon size={11} style={{ color: '#7090b0' }} />
                <span className="text-[10px] font-medium" style={{ color: '#8098b0' }}>{f.label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-[13px] font-semibold group-hover:gap-2.5 transition-all"
            style={{ color: '#5a7aa0' }}>
            <span>进入</span>
            <ArrowRight size={14} />
          </div>
        </motion.button>
      </div>

      {/* 版本信息 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-10 text-[11px] relative z-10"
        style={{ color: '#b0a898' }}
      >
        Lingxi AI Agent
      </motion.div>
    </div>
  );
}
