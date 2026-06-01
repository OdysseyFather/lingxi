import { useEffect, useState, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Zap, ExternalLink, ShieldCheck, Loader2,
  CheckCircle2, AlertCircle, Eye, EyeOff, Search, ChevronDown, ChevronRight,
  ArrowLeft, Sparkles, Telescope, Cloud, Globe, Server, Brain, Cpu, Bot,
  MessageSquare, CircuitBoard, Layers, Star, Flame, Box, Settings2,
} from 'lucide-react';
import { useStore } from '../state/useStore';
import { api, electron } from '../api/client';
import { Button, Input, Modal, Badge, Card, EmptyState } from '../ui/primitives';
import { cn } from '../ui/cn';

// ─── 供应商视觉主题映射 ──────────────────────────────────────────
const PROVIDER_THEME = {
  anthropic_official:  { icon: Sparkles,     gradient: 'from-amber-500 to-orange-600',       label: 'Claude',      color: '#d97706' },
  dashscope_anthropic: { icon: Cloud,        gradient: 'from-orange-400 to-amber-600',       label: 'DashScope',   color: '#f59e0b' },
  deepseek_anthropic:  { icon: Telescope,    gradient: 'from-blue-500 to-indigo-600',        label: 'DeepSeek',    color: '#6366f1', direct: true },
  glm_anthropic:       { icon: Brain,        gradient: 'from-cyan-500 to-blue-600',          label: 'GLM / 智谱',  color: '#06b6d4', direct: true },
  kimi_anthropic:      { icon: Star,         gradient: 'from-violet-500 to-purple-600',      label: 'Kimi',        color: '#8b5cf6', direct: true },
  minimax_anthropic:   { icon: MessageSquare, gradient: 'from-pink-500 to-rose-600',         label: 'MiniMax',     color: '#ec4899', direct: true },
  ollama_anthropic:    { icon: Server,       gradient: 'from-slate-500 to-slate-700',        label: 'Ollama',      color: '#64748b', direct: true },
  lmstudio_anthropic:  { icon: Box,          gradient: 'from-indigo-500 to-violet-600',      label: 'LM Studio',   color: '#6366f1', direct: true },
  deepseek_openai:     { icon: Telescope,    gradient: 'from-blue-500 to-indigo-600',        label: 'DeepSeek',    color: '#6366f1' },
  qwen_openai:         { icon: Cloud,        gradient: 'from-orange-500 to-red-500',         label: 'Qwen',        color: '#f97316' },
  doubao_openai:       { icon: Flame,        gradient: 'from-rose-500 to-pink-600',          label: 'Doubao',      color: '#f43f5e' },
  glm_openai:          { icon: Brain,        gradient: 'from-cyan-500 to-blue-600',          label: 'GLM',         color: '#06b6d4' },
  moonshot_openai:     { icon: Star,         gradient: 'from-violet-500 to-purple-600',      label: 'Kimi',        color: '#8b5cf6' },
  gemini_openai:       { icon: Globe,        gradient: 'from-blue-400 via-emerald-400 to-amber-400', label: 'Gemini', color: '#3b82f6' },
  openrouter_openai:   { icon: Layers,       gradient: 'from-emerald-500 to-teal-600',       label: 'OpenRouter',  color: '#10b981' },
  groq_openai:         { icon: Zap,          gradient: 'from-amber-400 to-orange-500',       label: 'Groq',        color: '#f59e0b' },
  siliconflow_openai:  { icon: CircuitBoard, gradient: 'from-sky-500 to-blue-600',           label: 'SiliconFlow', color: '#0ea5e9' },
  openai_official:     { icon: Bot,          gradient: 'from-emerald-500 to-green-600',      label: 'OpenAI',      color: '#10b981' },
  custom_anthropic:    { icon: Settings2,    gradient: 'from-gray-500 to-gray-600',          label: '自定义',      color: '#6b7280' },
  custom_openai:       { icon: Settings2,    gradient: 'from-gray-500 to-gray-600',          label: '自定义',      color: '#6b7280' },
};

const DEFAULT_THEME = { icon: Cpu, gradient: 'from-gray-400 to-gray-600', label: '', color: '#9ca3af' };

const PROVIDER_MODELS = {
  anthropic_official: [
    { group: '旗舰', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'] },
    { group: '快速', models: ['claude-haiku-4-20250514'] },
    { group: '上一代', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] },
  ],
  openai_official: [
    { group: '旗舰', models: ['gpt-4o', 'gpt-4o-2024-11-20', 'o3-mini'] },
    { group: '快速', models: ['gpt-4o-mini'] },
    { group: '推理', models: ['o1', 'o1-mini', 'o3', 'o4-mini'] },
  ],
  deepseek_anthropic: [
    { group: '推荐', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
    { group: '经典', models: ['deepseek-chat', 'deepseek-reasoner'] },
  ],
  deepseek_openai: [
    { group: '推荐', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
    { group: '经典', models: ['deepseek-chat', 'deepseek-reasoner'] },
  ],
  glm_anthropic: [
    { group: '旗舰', models: ['glm-5.1', 'glm-5-turbo'] },
    { group: '快速', models: ['glm-4.5-air'] },
  ],
  kimi_anthropic: [
    { group: '推荐', models: ['kimi-k2.6', 'kimi-k2.5'] },
    { group: '经典', models: ['kimi-k2-0905-preview', 'kimi-k2-turbo-preview'] },
  ],
  minimax_anthropic: [
    { group: '推荐', models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] },
    { group: '上一代', models: ['MiniMax-M2.5', 'MiniMax-M2.5-highspeed'] },
  ],
  ollama_anthropic: [
    { group: '推荐', models: ['qwen3.6:27b', 'qwen3.6:8b', 'llama3.3:70b'] },
  ],
  lmstudio_anthropic: [
    { group: '推荐', models: ['qwen/qwen3.6-27b', 'qwen/qwen3.6-8b'] },
  ],
  qwen_openai: [
    { group: '旗舰', models: ['qwen-max', 'qwen-max-latest', 'qwen3-coder-plus'] },
    { group: '长上下文', models: ['qwen-long', 'qwen-plus', 'qwen3.6-plus'] },
    { group: '快速', models: ['qwen-turbo', 'qwen-turbo-latest'] },
  ],
  dashscope_anthropic: [
    { group: 'Claude', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'] },
    { group: 'Qwen', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
  ],
  doubao_openai: [
    { group: '通用', models: ['doubao-1.5-pro-32k', 'doubao-1.5-pro-256k', 'doubao-1.5-lite-32k'] },
    { group: '推理', models: ['doubao-1.5-thinking-pro', 'doubao-1.5-thinking-pro-250415'] },
  ],
  glm_openai: [
    { group: '通用', models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long', 'glm-4-flashx'] },
  ],
  moonshot_openai: [
    { group: '通用', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  ],
  gemini_openai: [
    { group: '旗舰', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
    { group: '上一代', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  ],
  groq_openai: [
    { group: '快速', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  ],
  siliconflow_openai: [
    { group: '通用', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct'] },
  ],
  openrouter_openai: [
    { group: '热门', models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat'] },
  ],
};

function getProviderTheme(code) {
  return PROVIDER_THEME[code] || DEFAULT_THEME;
}

// ─── 供应商图标组件 ──────────────────────────────────────────────
function ProviderIcon({ code, size = 'md', className }) {
  const theme = getProviderTheme(code);
  const Icon = theme.icon;
  const sizes = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-12 h-12' };
  const iconSizes = { sm: 14, md: 18, lg: 22 };
  return (
    <div className={cn(
      sizes[size], 'rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br text-white shadow-sm',
      theme.gradient, className
    )}>
      <Icon size={iconSizes[size]} />
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────────
export function ProfilesPage() {
  const providers = useStore((s) => s.providers);
  const profiles = useStore((s) => s.profiles);
  const refreshProfiles = useStore((s) => s.refreshProfiles);
  const activate = useStore((s) => s.activateProfile);
  const pushNotification = useStore((s) => s.pushNotification);

  const [editing, setEditing] = useState(null);
  const [testStates, setTestStates] = useState({});

  useEffect(() => { refreshProfiles(); }, []);

  const handleDelete = async (p) => {
    if (!confirm(`删除接入点「${p.name}」？`)) return;
    await api.deleteProfile(p.id);
    await refreshProfiles();
  };

  const handleTest = async (p) => {
    setTestStates((s) => ({ ...s, [p.id]: { phase: 'connectivity', status: 'testing' } }));
    try {
      let token = '';
      if (p.auth_token_cipher) {
        token = await electron.decryptSecret(p.auth_token_cipher);
      }
      const r = await api.testProfile(p.id, { token });
      if (r.ok) {
        const latency = r.connectivity?.latency || r.latency || '';
        const proxyLatency = r.proxy?.latency || '';
        setTestStates((s) => ({ ...s, [p.id]: { phase: 'done', status: 'success', latency, proxyLatency, hasProxy: !!r.proxy } }));
      } else {
        const failPhase = r.connectivity && !r.connectivity.success ? 'connectivity' : 'proxy';
        setTestStates((s) => ({ ...s, [p.id]: { phase: failPhase, status: 'fail' } }));
        pushNotification({ title: '连接失败', body: r.error || '请检查配置' });
      }
    } catch {
      setTestStates((s) => ({ ...s, [p.id]: { phase: 'connectivity', status: 'fail' } }));
    }
    setTimeout(() => setTestStates((s) => { const n = { ...s }; delete n[p.id]; return n; }), 5000);
  };

  const providerMap = useMemo(() => {
    const m = {};
    providers.forEach((p) => { m[p.id] = p; });
    return m;
  }, [providers]);

  return (
    <div className="max-w-5xl mx-auto py-6 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">模型与接入点</h1>
          <p className="text-sm text-[color:var(--text-soft)] mt-1">
            选择供应商，填入密钥即可开始使用
          </p>
        </div>
        <Button onClick={() => setEditing({ __new: true })}>
          <Plus size={14} /> 新建接入点
        </Button>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="还没有接入点"
          description="点击「新建接入点」选择供应商并填入密钥，即可开始对话"
          action={
            <Button onClick={() => setEditing({ __new: true })}>
              <Plus size={14} /> 新建接入点
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              provider={providerMap[p.provider_id]}
              testState={testStates[p.id]}
              onActivate={() => activate(p.id)}
              onTest={() => handleTest(p)}
              onEdit={() => setEditing(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ProfileEditor
          providers={providers}
          profile={editing.__new ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refreshProfiles();
          }}
        />
      )}
    </div>
  );
}

// ─── 接入点卡片 ──────────────────────────────────────────────────
function ProfileCard({ profile: p, provider, testState, onActivate, onTest, onEdit, onDelete }) {
  const theme = getProviderTheme(provider?.code);
  const isDirect = theme.direct;
  const ts = testState || {};
  const isTesting = ts.status === 'testing';
  const isSuccess = ts.status === 'success';
  const isFail = ts.status === 'fail';

  const testLabel = isTesting
    ? (ts.phase === 'proxy' ? '管道验证…' : '连通测试…')
    : isSuccess
      ? (ts.hasProxy ? `直连 ${ts.latency} · 管道 ${ts.proxyLatency}` : `连接成功 ${ts.latency}`)
      : isFail
        ? (ts.phase === 'proxy' ? '代理管道失败' : '连接失败')
        : '测试连接';

  return (
    <Card className={cn(
      'group relative flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md overflow-hidden',
      p.is_active && 'ring-1 ring-[color:var(--accent)]/40'
    )}>
      <div className={cn('absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r', theme.gradient)} />

      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="flex items-center gap-3 min-w-0">
          <ProviderIcon code={provider?.code} />
          <div className="min-w-0">
            <div className="font-medium truncate flex items-center gap-2">
              {p.name}
              {p.is_active && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  使用中
                </span>
              )}
            </div>
            <div className="text-xs text-[color:var(--text-faint)] truncate mt-0.5 flex items-center gap-1.5">
              {isDirect ? (
                <Badge tone="default" className="!text-[10px] !px-1.5 !py-0 !bg-emerald-500/10 !text-emerald-600">直连</Badge>
              ) : (
                <Badge tone={p.provider_protocol === 'openai' ? 'info' : 'default'} className="!text-[10px] !px-1.5 !py-0">
                  {p.provider_protocol === 'openai' ? '代理' : 'Anthropic'}
                </Badge>
              )}
              <span className="truncate">{p.model || provider?.default_model || '默认模型'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-[color:var(--text-faint)]">
        <ShieldCheck size={11} />
        <span>{p.auth_token_mask || '未设置密钥'}</span>
      </div>

      <div className="flex items-center gap-1.5 pt-0.5 border-t border-[color:var(--line)]/50">
        {!p.is_active && (
          <Button size="sm" variant="soft" onClick={onActivate} className="text-xs">
            <Zap size={12} /> 激活
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onTest} className="text-xs gap-1">
          {isTesting && <span className="animate-spin"><Loader2 size={12} /></span>}
          {isSuccess && <span className="text-emerald-500"><CheckCircle2 size={12} /></span>}
          {isFail && <span className="text-red-500"><AlertCircle size={12} /></span>}
          {testLabel}
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onEdit} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Pencil size={13} />
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500/70 hover:text-red-500">
          <Trash2 size={13} />
        </Button>
      </div>
    </Card>
  );
}

// ─── 供应商选择网格 ──────────────────────────────────────────────
function ProviderGrid({ providers, selectedId, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return providers;
    const q = search.toLowerCase();
    return providers.filter((p) =>
      p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) ||
      (getProviderTheme(p.code).label || '').toLowerCase().includes(q)
    );
  }, [providers, search]);

  const anthropicProviders = filtered.filter((p) => p.protocol === 'anthropic');
  const openaiProviders = filtered.filter((p) => p.protocol === 'openai');

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索供应商…"
          className="pl-9"
          autoFocus
        />
      </div>

      {anthropicProviders.length > 0 && (
        <ProviderSection title="Anthropic 协议（直连）" providers={anthropicProviders} selectedId={selectedId} onSelect={onSelect} />
      )}
      {openaiProviders.length > 0 && (
        <ProviderSection title="OpenAI 兼容协议（经本地路由层翻译）" providers={openaiProviders} selectedId={selectedId} onSelect={onSelect} />
      )}

      {filtered.length === 0 && (
        <div className="text-center py-8 text-sm text-[color:var(--text-faint)]">
          未找到匹配的供应商
        </div>
      )}
    </div>
  );
}

function ProviderSection({ title, providers, selectedId, onSelect }) {
  return (
    <div>
      <div className="text-xs font-medium text-[color:var(--text-faint)] mb-2 uppercase tracking-wider">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        {providers.map((p) => {
          const theme = getProviderTheme(p.code);
          const Icon = theme.icon;
          const selected = selectedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={cn(
                'surface p-3 text-left transition-all duration-200 hover:-translate-y-0.5 cursor-pointer',
                selected
                  ? 'ring-2 ring-[color:var(--accent)] border-[color:var(--accent)] shadow-glow'
                  : 'hover:border-[color:var(--accent)]/50 hover:shadow-md'
              )}
            >
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br text-white mb-2', theme.gradient)}>
                <Icon size={16} />
              </div>
              <div className="text-sm font-medium truncate">{theme.label || p.name}</div>
              <div className="text-[11px] text-[color:var(--text-faint)] truncate mt-0.5">
                {p.default_model || '—'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 两步式编辑器弹窗 ────────────────────────────────────────────
function ProfileEditor({ providers, profile, onClose, onSaved }) {
  const isEdit = !!profile;
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [selectedProvider, setSelectedProvider] = useState(
    isEdit ? providers.find((p) => p.id === profile.provider_id) : null
  );
  const [name, setName] = useState(profile?.name || '');
  const [baseUrl, setBaseUrl] = useState(profile?.base_url || '');
  const [model, setModel] = useState(profile?.model || '');
  const [token, setToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [transformer, setTransformer] = useState(profile?.transformer || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [remoteModels, setRemoteModels] = useState(null);
  const pushNotification = useStore((s) => s.pushNotification);

  useEffect(() => {
    if (!isEdit || !profile?.auth_token_cipher) return;
    let cancelled = false;
    setTokenLoading(true);
    electron.decryptSecret(profile.auth_token_cipher)
      .then((t) => { if (!cancelled && t) setToken(t); })
      .finally(() => { if (!cancelled) setTokenLoading(false); });
    return () => { cancelled = true; };
  }, [isEdit, profile?.id, profile?.auth_token_cipher]);

  const isOpenAI = selectedProvider?.protocol === 'openai';
  const isCustom = selectedProvider?.code === 'custom_openai' || selectedProvider?.code === 'custom_anthropic';

  const handlePickProvider = (p) => {
    setSelectedProvider(p);
    if (!isEdit) {
      setName(p.name);
      setBaseUrl(p.default_base_url || '');
      setModel(p.default_model || '');
      try {
        const meta = JSON.parse(p.usage_api_meta || '{}');
        if (meta.transformer) setTransformer(meta.transformer);
      } catch {}
    }
    setRemoteModels(null);
    setStep(2);
  };

  const resolveToken = async () => {
    if (token.trim()) return token.trim();
    if (profile?.auth_token_cipher) {
      return (await electron.decryptSecret(profile.auth_token_cipher)) || '';
    }
    return '';
  };

  const handleFetchModels = async () => {
    const effectiveToken = await resolveToken();
    if (!effectiveToken) return pushNotification({ title: '请先填写密钥', body: '' });
    const url = baseUrl || selectedProvider?.default_base_url || '';
    if (!url) return pushNotification({ title: '缺少 Base URL', body: '' });
    setFetchingModels(true);
    try {
      const r = await api.fetchModels({
        base_url: url,
        token: effectiveToken,
        protocol: selectedProvider?.protocol || 'openai',
      });
      if (r.ok && r.models?.length > 0) {
        setRemoteModels(r.models);
        pushNotification({ title: `发现 ${r.models.length} 个模型`, body: '部分模型可能需要开通后才可使用，请从列表中选择' });
      } else {
        pushNotification({ title: '获取模型列表失败', body: r.error || '供应商可能不支持 /models 端点，请手动选择' });
      }
    } catch (e) {
      pushNotification({ title: '获取模型失败', body: e.message });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return pushNotification({ title: '请填写名称', body: '' });
    if (!selectedProvider) return pushNotification({ title: '请选择供应商', body: '' });
    if (!isEdit && !token.trim()) return pushNotification({ title: '请填写密钥', body: '' });
    setSaving(true);
    try {
      let cipher = '';
      let mask = profile?.auth_token_mask || '';
      if (token) {
        cipher = await electron.encryptSecret(token);
        mask = maskToken(token);
      }
      await api.saveProfile({
        id: profile?.id || 0,
        name,
        provider_id: selectedProvider.id,
        base_url: baseUrl || selectedProvider?.default_base_url || '',
        model,
        auth_token_cipher: cipher,
        auth_token_mask: mask,
        extra: '{}',
        transformer: isOpenAI ? transformer : '',
      });
      if (profile?.is_active && token) {
        await electron.pushActiveSecret(profile.id);
      }
      pushNotification({ title: isEdit ? '已保存修改' : '已添加接入点', body: name });
      onSaved();
    } catch (e) {
      pushNotification({ title: '保存失败', body: e.message });
    } finally {
      setSaving(false);
    }
  };

  const theme = selectedProvider ? getProviderTheme(selectedProvider.code) : null;

  if (step === 1) {
    return (
      <Modal open onClose={onClose} title="选择供应商" width={680}>
        <ProviderGrid
          providers={providers}
          selectedId={selectedProvider?.id}
          onSelect={handlePickProvider}
        />
      </Modal>
    );
  }

  const SelIcon = theme?.icon || Cpu;
  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? '编辑接入点' : '配置接入点'}
      width={520}
      footer={
        <>
          {!isEdit && (
            <Button variant="ghost" onClick={() => setStep(1)} className="mr-auto">
              <ArrowLeft size={14} /> 重选供应商
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {isEdit ? '保存' : '添加'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 当前供应商摘要 */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[color:var(--bg-soft)] border border-[color:var(--line)]">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br text-white', theme?.gradient)}>
            <SelIcon size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm">{selectedProvider?.name}</div>
            <div className="text-xs text-[color:var(--text-faint)] flex items-center gap-1.5">
              <Badge tone={isOpenAI ? 'info' : 'default'} className="!text-[10px] !px-1.5 !py-0">
                {isOpenAI ? 'OpenAI 兼容' : 'Anthropic'}
              </Badge>
              {selectedProvider?.default_model && (
                <span className="truncate">{selectedProvider.default_model}</span>
              )}
            </div>
          </div>
          {!isEdit && (
            <button
              onClick={() => setStep(1)}
              className="ml-auto text-xs text-[color:var(--accent)] hover:underline shrink-0"
            >
              更换
            </button>
          )}
        </div>

        {/* 密钥 */}
        <Field label="API Key">
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={tokenLoading ? '正在加载已保存的密钥…' : 'sk-...'}
              autoComplete="off"
              className="pr-9 h-11 text-base"
              autoFocus={!isEdit}
              disabled={tokenLoading}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-[color:var(--text-faint)] hover:bg-[color:var(--bg-soft)] hover:text-[color:var(--text)]"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <div className="text-[11px] text-[color:var(--text-faint)] flex items-center gap-1">
              <ShieldCheck size={11} /> Keychain 加密存储
            </div>
            <div className="flex items-center gap-3">
              {isEdit && profile?.auth_token_mask && (
                <span>已保存: {profile.auth_token_mask}</span>
              )}
              {selectedProvider?.doc_url && (
                <button
                  onClick={() => electron.openExternal(selectedProvider.doc_url)}
                  className="inline-flex items-center gap-1 text-[11px] text-[color:var(--accent)] hover:underline"
                >
                  <ExternalLink size={10} /> 获取密钥
                </button>
              )}
            </div>
          </div>
          {isEdit && (
            <div className="mt-1 text-[11px] text-[color:var(--text-faint)]">
              清空后保存将保留原密钥不变
            </div>
          )}
        </Field>

        {/* 模型选择 — 始终可见 */}
        <Field label="模型">
          <div className="flex gap-2">
            <div className="flex-1">
              <ModelComboBox
                value={model}
                onChange={setModel}
                providerCode={selectedProvider?.code}
                remoteModels={remoteModels}
                placeholder={selectedProvider?.default_model || ''}
              />
            </div>
            <Button
              size="sm"
              variant="soft"
              onClick={handleFetchModels}
              disabled={fetchingModels || tokenLoading || (!token.trim() && !profile?.auth_token_cipher)}
              className="shrink-0 h-[38px]"
              title="用密钥获取该供应商可用的模型列表"
            >
              {fetchingModels ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {fetchingModels ? '获取中' : '获取模型'}
            </Button>
          </div>
          {!model && selectedProvider?.default_model && (
            <div className="mt-1 text-[11px] text-[color:var(--text-faint)]">
              留空将使用默认模型: {selectedProvider.default_model}
            </div>
          )}
        </Field>

        {/* 高级设置折叠区 */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-[color:var(--text-soft)] hover:text-[color:var(--text)] transition-colors"
          >
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            高级设置
            <span className="text-[color:var(--text-faint)]">（名称、URL{isOpenAI ? '、Transformer' : ''}）</span>
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3 pl-0.5">
              <Field label="名称">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={selectedProvider?.name || ''} />
              </Field>
              <Field label={isCustom ? 'Base URL' : 'Base URL（供应商已预设，一般无需修改）'}>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={selectedProvider?.default_base_url || 'https://...'}
                  className={!isCustom ? 'opacity-70' : ''}
                />
              </Field>
              {isOpenAI && (
                <Field label="Transformer">
                  <Input value={transformer} onChange={(e) => setTransformer(e.target.value)} placeholder="留空 = 自动" />
                </Field>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── 模型选择 ComboBox ──────────────────────────────────────────
function ModelComboBox({ value, onChange, providerCode, remoteModels, placeholder }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const presetGroups = PROVIDER_MODELS[providerCode] || [];

  const hasRemote = remoteModels && remoteModels.length > 0;
  const allGroups = hasRemote
    ? [{ group: '供应商模型列表', models: remoteModels, hint: '部分模型可能需要单独开通后才可使用' }, ...presetGroups.map(g => ({ ...g, group: `预设 · ${g.group}` }))]
    : presetGroups;

  const filtered = allGroups.map(g => ({
    ...g,
    models: g.models.filter(m => m.toLowerCase().includes(filter.toLowerCase())),
  })).filter(g => g.models.length > 0);

  const hasDropdown = allGroups.length > 0;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setFilter(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
      />
      {open && hasDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[280px] overflow-y-auto rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)] shadow-lg scrollable">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-[color:var(--text-faint)]">无匹配模型（可手动输入）</div>
          )}
          {filtered.map(g => (
            <div key={g.group}>
              <div className={cn(
                'px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-[color:var(--bg-soft)]',
                g.hint ? 'text-emerald-600' : 'text-[color:var(--text-faint)]'
              )}>{g.group}</div>
              {g.hint && (
                <div className="px-3 py-0.5 text-[10px] text-amber-600 bg-amber-50/50">{g.hint}</div>
              )}
              {g.models.map(m => (
                <button key={m} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(m); setOpen(false); }}
                  className={cn('w-full text-left px-3 py-1.5 text-sm hover:bg-[color:var(--accent-soft)] transition',
                    m === value && 'text-[color:var(--accent)] font-medium'
                  )}
                >{m}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 工具组件 ────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-[color:var(--text-soft)] mb-1.5">{label}</div>
      {children}
    </label>
  );
}

function maskToken(t) {
  if (!t) return '';
  if (t.length <= 8) return '****';
  return t.slice(0, 4) + '••••' + t.slice(-4);
}
