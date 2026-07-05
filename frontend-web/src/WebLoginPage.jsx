import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useStore, initAppData } from './state/useStore';
import { Button, Input } from './ui/primitives';
import { cn } from './ui/cn';
import { LogIn, UserPlus, Loader2, Shield } from 'lucide-react';

export default function WebLoginPage() {
  const webLogin = useStore((s) => s.webLogin);
  const webRegister = useStore((s) => s.webRegister);
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const user = mode === 'login'
        ? await webLogin(username, password)
        : await webRegister(username, password, inviteCode);
      if (user) initAppData();
    } catch (e) {
      setError(e?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  }, [mode, username, password, inviteCode, webLogin, webRegister]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg)] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elev)] p-8 shadow-xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-soft)] flex items-center justify-center">
            <Shield size={20} className="text-[color:var(--accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[color:var(--text)]">灵犀 Web</h1>
            <p className="text-sm text-[color:var(--text-soft)]">多用户云端工作台</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 p-1 rounded-lg bg-[color:var(--bg-soft)]">
          {['login', 'register'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 py-2 text-sm rounded-md transition-colors',
                mode === m ? 'bg-[color:var(--bg-elev)] text-[color:var(--text)] shadow-sm' : 'text-[color:var(--text-soft)]'
              )}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          <Input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'register' && (
            <Input placeholder="邀请码（可选，开放注册时留空）" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="w-full" onClick={submit} disabled={loading || !username || !password}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : mode === 'login' ? <><LogIn size={16} /> 登录</> : <><UserPlus size={16} /> 注册</>}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
