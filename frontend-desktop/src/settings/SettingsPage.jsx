import { useState, useEffect, lazy, Suspense } from 'react';
import { useStore } from '../state/useStore';
import { Cpu, BarChart3, Palette, BrainCircuit, Wifi, Info, UserCircle, LogOut, Shield, Calendar, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { ProfilesPage } from './ProfilesPage';
import { UsagePage } from './UsagePage';
import { AppearancePage } from './AppearancePage';
import { MemoryPage } from './MemoryPage';
import NexusSettingsPage from './NexusSettingsPage';
const PermissionsPage = lazy(() => import('./PermissionsPage'));
const RemoteAccessPage = lazy(() => import('./RemoteAccessPage'));
const ProactiveAgentPage = lazy(() => import('./ProactiveAgentPage'));
import { cn } from '../ui/cn';
import { Button, Card } from '../ui/primitives';

const TABS = [
  { id: 'account',    label: '账号',         icon: UserCircle },
  { id: 'profiles',   label: '模型与接入点', icon: Cpu },
  { id: 'memory',     label: '长期记忆',     icon: BrainCircuit },
  { id: 'permissions',label: '权限与审批',   icon: ShieldCheck },
  { id: 'remote',     label: '远程访问',     icon: Smartphone },
  { id: 'nexus',      label: '网络与协作',   icon: Wifi },
  { id: 'usage',      label: '用量',         icon: BarChart3 },
  { id: 'proactive',  label: '主动式 Agent', icon: Sparkles },
  { id: 'appearance', label: '外观',         icon: Palette },
  { id: 'about',      label: '关于',         icon: Info },
];

function AccountPage() {
  const currentUser = useStore((s) => s.currentUser);
  const logout = useStore((s) => s.logout);

  if (!currentUser) return null;

  const providerMap = { dingtalk: '钉钉', guest: '游客', google: 'Google', wechat: '微信', qq: 'QQ', douyin: '抖音' };
  const providerLabel = providerMap[currentUser.provider] || currentUser.provider;
  const initial = (currentUser.nickname || '?')[0].toUpperCase();
  const createdAt = currentUser.created_at ? new Date(currentUser.created_at).toLocaleString('zh-CN') : '—';

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[color:var(--text)]">账号信息</h2>
        <p className="text-sm text-[color:var(--text-soft)] mt-1">查看当前登录的账号详情</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-4 mb-5">
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-[color:var(--line)]" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[color:var(--accent)] flex items-center justify-center text-white text-xl font-bold ring-2 ring-[color:var(--accent)]">
              {initial}
            </div>
          )}
          <div>
            <div className="text-lg font-semibold text-[color:var(--text)]">{currentUser.nickname || '未设置昵称'}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                currentUser.provider === 'dingtalk' ? 'bg-[#3370FF]/10 text-[#3370FF]' :
                currentUser.provider === 'guest' ? 'bg-gray-100 text-gray-600' :
                'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              )}>
                <Shield size={10} />
                {providerLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-[color:var(--line)] pt-4">
          {currentUser.email && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[color:var(--text-soft)]">邮箱</span>
              <span className="text-sm text-[color:var(--text)]">{currentUser.email}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[color:var(--text-soft)]">登录方式</span>
            <span className="text-sm text-[color:var(--text)]">{providerLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[color:var(--text-soft)]">用户 ID</span>
            <span className="text-xs text-[color:var(--text-faint)] font-mono">{currentUser.provider_id || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[color:var(--text-soft)]">注册时间</span>
            <span className="text-sm text-[color:var(--text)] flex items-center gap-1">
              <Calendar size={12} className="text-[color:var(--text-faint)]" />
              {createdAt}
            </span>
          </div>
        </div>
      </Card>

      <Button
        variant="outline"
        className="text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300"
        onClick={logout}
      >
        <LogOut size={14} />
        退出登录
      </Button>
    </div>
  );
}

function AboutPage() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.electronAPI?.getVersion?.().then(v => setVersion(v || ''));
  }, []);

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[color:var(--text)]">关于灵犀</h2>
        <p className="text-sm text-[color:var(--text-soft)] mt-1">本地优先的桌面 AI Agent 工作台</p>
      </div>
      <Card className="p-4">
        <div className="text-sm font-medium text-[color:var(--text)]">当前版本</div>
        <div className="text-xs text-[color:var(--text-faint)] mt-0.5">v{version || '—'}</div>
      </Card>
      <div className="text-xs text-[color:var(--text-faint)] space-y-1">
        <p>Electron + React + Go</p>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const tab = useStore((s) => s.settingsTab);
  const setTab = useStore((s) => s.setSettingsTab);

  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-56 border-r border-[color:var(--line)] py-4 px-2 shrink-0">
        <div className="px-3 pb-2 text-xs text-[color:var(--text-faint)]">设置</div>
        <nav className="space-y-0.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition',
                  active
                    ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] font-medium'
                    : 'hover:bg-[color:var(--bg-soft)] text-[color:var(--text)]'
                )}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 overflow-y-auto scrollable">
        {tab === 'account' && <AccountPage />}
        {tab === 'profiles' && <ProfilesPage />}
        {tab === 'memory' && <MemoryPage />}
        {tab === 'permissions' && <Suspense fallback={<div className="p-6 text-sm text-[color:var(--text-faint)]">加载中…</div>}><PermissionsPage /></Suspense>}
        {tab === 'remote' && <Suspense fallback={<div className="p-6 text-sm text-[color:var(--text-faint)]">加载中…</div>}><RemoteAccessPage /></Suspense>}
        {tab === 'nexus' && <div className="p-6"><NexusSettingsPage /></div>}
        {tab === 'usage' && <UsagePage />}
        {tab === 'proactive' && <Suspense fallback={<div className="p-6 text-sm text-[color:var(--text-faint)]">加载中…</div>}><ProactiveAgentPage /></Suspense>}
        {tab === 'appearance' && <AppearancePage />}
        {tab === 'about' && <AboutPage />}
      </div>
    </div>
  );
}
