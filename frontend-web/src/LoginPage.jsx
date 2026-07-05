import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, initAppData } from './state/useStore';
import { Button, Input } from './ui/primitives';
import { cn } from './ui/cn';
import { User, ArrowRight, Loader2, Shield, Zap, Brain } from 'lucide-react';

const DingTalkIcon = ({ className }) => (
  <svg viewBox="0 0 1024 1024" fill="currentColor" className={className}>
    <path d="M512 0C229.2 0 0 229.2 0 512s229.2 512 512 512 512-229.2 512-512S794.8 0 512 0zm227.3 579.2l-5.2 1.6s-42.4 13.6-58.4 18.8l26-60.4c0.8-2 22.8-52.8 10-78.8-10-20.4-46-22-46-22H481.6l-1.2 6-6.4 32.4-2 10h134.8s18.4 0.8 12 20c-2.8 8.4-33.2 76-33.2 76h-78l-4.4 2.8c-1.2 0.8-2.4 1.6-3.2 2.4-0.4 0.4-0.8 0.8-1.2 1.2-2.4 2.4-4.4 5.2-5.6 8.8l-0.4 1.2-36.4 100.8s-5.6 14.8 6 8.4c8-4.4 94.8-63.2 94.8-63.2l168.8 0.4s19.2 0 24.8-16.4c5.6-16.4-11.6-30-11.6-30l-0.4 0.4z"/>
  </svg>
);

export default function LoginPage() {
  const loginAsGuest = useStore((s) => s.loginAsGuest);
  const loginWithOAuth = useStore((s) => s.loginWithOAuth);
  const [loading, setLoading] = useState(null);
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState('');

  const handleDingTalkLogin = useCallback(async () => {
    console.log('[LoginPage] 钉钉登录按钮点击');
    setError('');
    setLoading('dingtalk');
    try {
      const user = await loginWithOAuth('dingtalk');
      if (user) {
        console.log('[LoginPage] 钉钉登录成功:', user.nickname);
        initAppData();
      } else {
        setError('登录未完成，请重试');
      }
    } catch (e) {
      console.error('[LoginPage] 钉钉登录失败:', e);
      setError(e?.message || '钉钉登录失败，请检查网络连接');
    } finally {
      setLoading(null);
    }
  }, [loginWithOAuth]);

  const handleGuest = useCallback(async () => {
    console.log('[LoginPage] 游客登录按钮点击');
    setError('');
    setLoading('guest');
    try {
      const user = await loginAsGuest(guestName || undefined);
      if (user) {
        console.log('[LoginPage] 游客登录成功:', user.nickname);
        initAppData();
      } else {
        setError('登录失败，后端服务可能未启动');
      }
    } catch (e) {
      console.error('[LoginPage] 游客登录失败:', e);
      setError(e?.message || '游客登录失败，后端服务可能未启动');
    } finally {
      setLoading(null);
    }
  }, [loginAsGuest, guestName]);

  const features = [
    { icon: Brain, text: '多模型 AI 智能体' },
    { icon: Zap, text: '技能与工作流编排' },
    { icon: Shield, text: '本地数据，安全可控' },
  ];

  return (
    <div className="h-screen flex items-center justify-center bg-[color:var(--bg)] relative overflow-hidden" style={{ WebkitAppRegion: 'no-drag' }}>
      {/* 顶部拖拽条（窗口拖动） */}
      <div className="fixed top-0 left-0 right-0 h-9 z-50" style={{ WebkitAppRegion: 'drag' }} />
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#3370FF]/[0.06] rounded-full blur-[140px]" />
        <div className="absolute bottom-0 -right-20 w-[500px] h-[400px] bg-[#3370FF]/[0.04] rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 -left-20 w-[400px] h-[300px] bg-[color:var(--accent)]/[0.03] rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [.22, 1, .36, 1] }}
        className="relative w-full max-w-[420px] px-8"
        style={{ zIndex: 1 }}
      >
        {/* Logo + 标题 */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
            className="inline-block mb-5"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-[22px] bg-[color:var(--accent)]/20 blur-xl scale-110" />
              <img
                src="/logo.png"
                alt="灵犀"
                className="relative w-[72px] h-[72px] rounded-[22px] shadow-lg ring-1 ring-white/10"
              />
            </div>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-[26px] font-bold text-[color:var(--text)] mb-2 tracking-tight"
          >
            欢迎使用灵犀
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="text-sm text-[color:var(--text-soft)]"
          >
            本地优先的 AI Agent 工作台
          </motion.p>
        </div>

        {/* 特性标签 */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs text-[color:var(--text-faint)]"
            >
              <f.icon size={13} className="text-[color:var(--accent)] shrink-0" />
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm text-center">
            {error}
          </div>
        )}

        {/* 钉钉登录卡片 */}
        <div
          className={cn(
            'rounded-2xl p-6 mb-4',
            'bg-[color:var(--bg-elev)] border border-[color:var(--line)]',
            'shadow-sm',
          )}
        >
          <button
            type="button"
            onClick={handleDingTalkLogin}
            disabled={loading !== null}
            className={cn(
              'w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl cursor-pointer',
              'bg-[#3370FF] hover:bg-[#2860E8] active:bg-[#1D50D0]',
              'text-white font-semibold text-[15px]',
              'transition-all duration-200',
              'hover:shadow-lg hover:shadow-[#3370FF]/25 hover:-translate-y-px',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370FF]/50 focus-visible:ring-offset-2',
            )}
          >
            {loading === 'dingtalk' ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <DingTalkIcon className="w-5 h-5" />
            )}
            <span>{loading === 'dingtalk' ? '正在跳转钉钉授权…' : '钉钉账号登录'}</span>
          </button>

          <p className="text-center text-[11px] text-[color:var(--text-faint)] mt-3 leading-relaxed">
            将通过系统浏览器跳转到钉钉授权页面
          </p>
        </div>

        {/* 分隔线 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-[color:var(--line)]" />
          <span className="text-[11px] text-[color:var(--text-faint)]">或</span>
          <div className="flex-1 h-px bg-[color:var(--line)]" />
        </div>

        {/* 游客登录 */}
        <AnimatePresence mode="wait">
          {!showGuestInput ? (
            <motion.div
              key="guest-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                onClick={() => setShowGuestInput(true)}
                disabled={loading !== null}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl cursor-pointer',
                  'border border-dashed border-[color:var(--line)]',
                  'text-[color:var(--text-soft)] text-sm hover:text-[color:var(--text)]',
                  'hover:bg-[color:var(--bg-soft)] hover:border-[color:var(--text-faint)]',
                  'transition-all duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <User size={15} />
                <span>以游客身份体验</span>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="guest-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <Input
                placeholder="输入昵称（可选）"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGuest()}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowGuestInput(false)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleGuest}
                  disabled={loading === 'guest'}
                >
                  {loading === 'guest' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                  进入灵犀
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 底部说明 */}
        <p className="text-center text-[10px] text-[color:var(--text-faint)] mt-8 leading-relaxed">
          数据全部存储在本地设备 · 游客模式无需注册即可使用全部功能
        </p>
      </motion.div>
    </div>
  );
}
