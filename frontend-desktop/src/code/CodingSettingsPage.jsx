import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, Zap, ShieldCheck, Loader2,
  CheckCircle2, AlertCircle, Eye, EyeOff, Search, ChevronDown, ChevronRight,
  ArrowLeft, Sparkles, Telescope, Cloud, Globe, Server, Brain, Cpu, Bot,
  MessageSquare, CircuitBoard, Layers, Star, Flame, Box, Settings2,
  Smartphone, Copy, PowerOff, ExternalLink, Clock, QrCode, Check,
  Coins, BarChart3, RefreshCw, AlertTriangle, Bell, TrendingUp, ArrowUpRight,
  ArrowDownRight, Users, FileText, Puzzle, BookOpen, Webhook, RotateCcw,
  FolderOpen, X, Shield, FileCode, Lock,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../state/useStore';
import { api, electron } from '../api/client';
import { cn } from '../ui/cn';

// ─── 供应商主题（与主界面 ProfilesPage 保持同一份数据，但不共用组件）
const PROVIDER_THEME = {
  anthropic_official:  { icon: Sparkles,     gradient: 'from-amber-500 to-orange-600',       label: 'Claude',      direct: false },
  dashscope_anthropic: { icon: Cloud,        gradient: 'from-orange-400 to-amber-600',       label: 'DashScope',   direct: false },
  deepseek_anthropic:  { icon: Telescope,    gradient: 'from-blue-500 to-indigo-600',        label: 'DeepSeek',    direct: true },
  glm_anthropic:       { icon: Brain,        gradient: 'from-cyan-500 to-blue-600',          label: 'GLM / 智谱',  direct: true },
  kimi_anthropic:      { icon: Star,         gradient: 'from-violet-500 to-purple-600',      label: 'Kimi',        direct: true },
  minimax_anthropic:   { icon: MessageSquare,gradient: 'from-pink-500 to-rose-600',          label: 'MiniMax',     direct: true },
  ollama_anthropic:    { icon: Server,       gradient: 'from-slate-500 to-slate-700',        label: 'Ollama',      direct: true },
  lmstudio_anthropic:  { icon: Box,          gradient: 'from-indigo-500 to-violet-600',      label: 'LM Studio',   direct: true },
  deepseek_openai:     { icon: Telescope,    gradient: 'from-blue-500 to-indigo-600',        label: 'DeepSeek',    direct: false },
  qwen_openai:         { icon: Cloud,        gradient: 'from-orange-500 to-red-500',         label: 'Qwen',        direct: false },
  doubao_openai:       { icon: Flame,        gradient: 'from-rose-500 to-pink-600',          label: 'Doubao',      direct: false },
  glm_openai:          { icon: Brain,        gradient: 'from-cyan-500 to-blue-600',          label: 'GLM',         direct: false },
  moonshot_openai:     { icon: Star,         gradient: 'from-violet-500 to-purple-600',      label: 'Kimi',        direct: false },
  gemini_openai:       { icon: Globe,        gradient: 'from-blue-400 via-emerald-400 to-amber-400', label: 'Gemini', direct: false },
  openrouter_openai:   { icon: Layers,       gradient: 'from-emerald-500 to-teal-600',       label: 'OpenRouter',  direct: false },
  groq_openai:         { icon: Zap,          gradient: 'from-amber-400 to-orange-500',       label: 'Groq',        direct: false },
  siliconflow_openai:  { icon: CircuitBoard, gradient: 'from-sky-500 to-blue-600',           label: 'SiliconFlow', direct: false },
  openai_official:     { icon: Bot,          gradient: 'from-emerald-500 to-green-600',      label: 'OpenAI',      direct: false },
  custom_anthropic:    { icon: Settings2,    gradient: 'from-gray-500 to-gray-600',          label: '自定义',      direct: false },
  custom_openai:       { icon: Settings2,    gradient: 'from-gray-500 to-gray-600',          label: '自定义',      direct: false },
};
const DEFAULT_THEME = { icon: Cpu, gradient: 'from-gray-400 to-gray-600', label: '', direct: false };
function getTheme(code) { return PROVIDER_THEME[code] || DEFAULT_THEME; }

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
  deepseek_anthropic: [{ group: '推荐', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] }, { group: '经典', models: ['deepseek-chat', 'deepseek-reasoner'] }],
  deepseek_openai: [{ group: '推荐', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] }, { group: '经典', models: ['deepseek-chat', 'deepseek-reasoner'] }],
  glm_anthropic: [{ group: '旗舰', models: ['glm-5.1', 'glm-5-turbo'] }, { group: '快速', models: ['glm-4.5-air'] }],
  kimi_anthropic: [{ group: '推荐', models: ['kimi-k2.6', 'kimi-k2.5'] }],
  minimax_anthropic: [{ group: '推荐', models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] }],
  ollama_anthropic: [{ group: '推荐', models: ['qwen3.6:27b', 'qwen3.6:8b', 'llama3.3:70b'] }],
  lmstudio_anthropic: [{ group: '推荐', models: ['qwen/qwen3.6-27b', 'qwen/qwen3.6-8b'] }],
  qwen_openai: [{ group: '旗舰', models: ['qwen-max', 'qwen-max-latest', 'qwen3-coder-plus'] }, { group: '快速', models: ['qwen-turbo', 'qwen-turbo-latest'] }],
  doubao_openai: [{ group: '通用', models: ['doubao-1.5-pro-32k', 'doubao-1.5-pro-256k'] }],
  glm_openai: [{ group: '通用', models: ['glm-4-plus', 'glm-4-flash', 'glm-4-flashx'] }],
  moonshot_openai: [{ group: '通用', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] }],
  gemini_openai: [{ group: '旗舰', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] }],
  groq_openai: [{ group: '快速', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] }],
  siliconflow_openai: [{ group: '通用', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'] }],
  openrouter_openai: [{ group: '热门', models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-pro'] }],
};

// ─── 导航 Tab 定义
const TABS = [
  { id: 'profiles',    label: '模型与接入点', icon: Cpu },
  { id: 'permissions', label: '权限管控',     icon: ShieldCheck },
  { id: 'agents',      label: '子代理配置',   icon: Users },
  { id: 'prompt',      label: '系统提示词',   icon: FileText },
  { id: 'plugins',     label: 'Plugins',      icon: Puzzle },
  { id: 'hooks',       label: 'Hooks 配置',   icon: Webhook },
  { id: 'checkpoint',  label: 'Checkpoint',   icon: RotateCcw },
  { id: 'usage',       label: '用量统计',     icon: BarChart3 },
  { id: 'remote',      label: '远程访问',     icon: Smartphone },
];

export function CodingSettingsPage() {
  const [tab, setTab] = useState('profiles');

  return (
    <div className="flex-1 flex min-h-0 bg-white">
      {/* 左侧 tab 导航 */}
      <nav className="w-44 border-r border-[#e8e4e0] bg-[#faf8f6] shrink-0 py-3 px-2 overflow-y-auto">
        <h3 className="text-[10px] font-bold text-[#bbb] uppercase tracking-wider px-2 mb-2">Coding 设置</h3>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] transition mb-0.5',
                active
                  ? 'bg-[#ede5dc] text-[#7a5c3a] font-medium'
                  : 'text-[#888] hover:text-[#555] hover:bg-[#f0ebe6]',
              )}
            >
              <Icon size={15} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 右侧内容 */}
      <div className="flex-1 overflow-y-auto scrollable">
        {tab === 'profiles'    && <CodingProfilesPanel />}
        {tab === 'permissions' && <CodingPermissionsPanel />}
        {tab === 'agents'      && <CodingAgentsPanel />}
        {tab === 'prompt'      && <CodingPromptPanel />}
        {tab === 'plugins'     && <CodingPluginsPanel />}
        {tab === 'hooks'       && <CodingHooksPanel />}
        {tab === 'checkpoint'  && <CodingCheckpointPanel />}
        {tab === 'usage'       && <CodingUsagePanel />}
        {tab === 'remote'      && <CodingRemotePanel />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  权限管控
// ══════════════════════════════════════════════════════════════════

function CodingPermissionsPanel() {
  const permMode = useStore((s) => s.codingPermissionMode);
  const setPermMode = useStore((s) => s.setCodingPermissionMode);
  const [permConfig, setPermConfig] = useState({ allowedTools: [], disallowedTools: [] });
  const [newAllowed, setNewAllowed] = useState('');
  const [newDisallowed, setNewDisallowed] = useState('');

  useEffect(() => {
    api.getCodingPermConfig().then(c => {
      if (c) setPermConfig({ allowedTools: c.allowedTools || [], disallowedTools: c.disallowedTools || [] });
    }).catch(() => {});
  }, []);

  const savePermConfig = (updated) => {
    setPermConfig(updated);
    api.saveCodingPermConfig({ ...updated, mode: permMode }).catch(() => {});
  };

  const addTool = (list, value) => {
    if (!value.trim()) return;
    const updated = { ...permConfig, [list]: [...(permConfig[list] || []), value.trim()] };
    savePermConfig(updated);
    if (list === 'allowedTools') setNewAllowed(''); else setNewDisallowed('');
  };

  const removeTool = (list, idx) => {
    const arr = [...(permConfig[list] || [])];
    arr.splice(idx, 1);
    savePermConfig({ ...permConfig, [list]: arr });
  };

  const modes = [
    { id: 'trust', title: '自动放行 (bypass)', desc: 'Agent 自动执行所有工具调用，无需确认。适合信任的项目和快速开发。', icon: Zap, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { id: 'managed', title: '交互式确认 (default)', desc: 'Agent 在执行写入/命令等操作前，需要你确认。适合敏感项目。', icon: ShieldCheck, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    { id: 'acceptEdits', title: '允许编辑 (acceptEdits)', desc: '自动放行文件编辑操作（Write/Edit），但命令执行和其他工具仍需确认。', icon: FileCode, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { id: 'plan', title: '规划模式 (plan)', desc: 'Agent 只能规划和分析，不允许执行任何修改操作。适合代码审查场景。', icon: BookOpen, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  ];

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <h2 className="text-[18px] font-bold text-[#333] mb-1">权限管控</h2>
      <p className="text-[13px] text-[#999] mb-6">控制 Agent 执行工具调用时的权限模式和工具白名单/黑名单。</p>

      <div className="space-y-3 mb-8">
        {modes.map((m) => {
          const Icon = m.icon;
          const active = permMode === m.id;
          return (
            <button key={m.id} onClick={() => setPermMode(m.id)} className={cn('w-full flex items-start gap-4 p-5 rounded-xl border-2 text-left transition-all', active ? `${m.border} ${m.bg}` : 'border-[#e8e4e0] bg-white hover:bg-[#faf8f6]')}>
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', active ? m.bg : 'bg-gray-50')}>
                <Icon size={20} className={active ? m.color : 'text-gray-400'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-[14px] font-medium', active ? 'text-[#333]' : 'text-[#666]')}>{m.title}</span>
                  {active && <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', m.color, m.bg)}>当前模式</span>}
                </div>
                <p className="text-[12px] text-[#999] leading-relaxed">{m.desc}</p>
              </div>
              <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5', active ? `${m.border} ${m.bg}` : 'border-gray-300')}>
                {active && <div className={cn('w-2.5 h-2.5 rounded-full', m.color.replace('text-', 'bg-'))} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Allowed/Disallowed Tools */}
      <div className="space-y-5">
        <ToolListEditor title="Allowed Tools（白名单）" desc="只有列表中的工具会被放行，为空则不限制" items={permConfig.allowedTools || []} inputValue={newAllowed} onInputChange={setNewAllowed} onAdd={() => addTool('allowedTools', newAllowed)} onRemove={(i) => removeTool('allowedTools', i)} color="emerald" />
        <ToolListEditor title="Disallowed Tools（黑名单）" desc="列表中的工具将被禁止调用" items={permConfig.disallowedTools || []} inputValue={newDisallowed} onInputChange={setNewDisallowed} onAdd={() => addTool('disallowedTools', newDisallowed)} onRemove={(i) => removeTool('disallowedTools', i)} color="red" />
      </div>

      <div className="mt-6 p-4 rounded-xl bg-[#faf8f6] border border-[#e8e4e0]">
        <p className="text-[12px] text-[#999] leading-relaxed">
          <strong className="text-[#777]">注意：</strong>
          权限模式在创建新会话时生效。常用工具名称：Bash, Read, Write, Edit, MultiEdit, Glob, Grep, LS, WebFetch, WebSearch, Agent, AskUserQuestion, Skill。
        </p>
      </div>
    </div>
  );
}

function ToolListEditor({ title, desc, items, inputValue, onInputChange, onAdd, onRemove, color }) {
  return (
    <div className="rounded-xl border border-[#e8e4e0] bg-white p-4">
      <div className="text-[13px] font-semibold text-[#333] mb-0.5">{title}</div>
      <p className="text-[11px] text-[#bbb] mb-3">{desc}</p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {items.map((t, i) => (
            <span key={i} className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-mono', `bg-${color}-50 text-${color}-700`)}>
              {t}
              <button onClick={() => onRemove(i)} className={`text-${color}-400 hover:text-${color}-600`}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={inputValue} onChange={(e) => onInputChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdd()} placeholder="工具名称，如 Bash" className="flex-1 px-3 py-2 rounded-lg border border-[#e8e4e0] text-[12px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition" />
        <button onClick={onAdd} className="px-3 py-2 rounded-lg bg-[#f5f0eb] text-[#8b5e3c] text-[12px] font-medium hover:bg-[#ede5dc] transition"><Plus size={13} /></button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  子代理配置
// ══════════════════════════════════════════════════════════════════

function CodingAgentsPanel() {
  const [agents, setAgents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.listCodingAgents();
      setAgents(r?.agents || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('删除此子代理模板？')) return;
    await api.deleteCodingAgent(id);
    load();
  };

  const handleSave = async (agent) => {
    if (agent.id) {
      await api.updateCodingAgent(agent.id, agent);
    } else {
      await api.saveCodingAgent(agent);
    }
    setEditing(null);
    load();
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[18px] font-bold text-[#333] mb-1">子代理配置</h2>
          <p className="text-[13px] text-[#999]">自定义子代理模板，Agent 可使用 Agent 工具调度这些子代理并行处理任务。</p>
        </div>
        <button onClick={() => setEditing({ name: '', description: '', prompt: '', model: '', maxTurns: 0 })} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#c4a882] text-white text-[13px] font-medium hover:bg-[#b09670] transition">
          <Plus size={14} /> 新建
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center"><Loader2 size={20} className="animate-spin text-[#c4a882] mx-auto" /></div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#f5f0eb] flex items-center justify-center mb-4"><Users size={26} className="text-[#c4a882]" /></div>
          <div className="text-[15px] font-bold text-[#333] mb-1">尚无自定义子代理</div>
          <p className="text-[13px] text-[#999] mb-4">SDK 内置通用 Agent 可直接使用，这里可添加专用子代理模板。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map(a => (
            <div key={a.id} className="group p-4 rounded-xl border border-[#e8e4e0] bg-white hover:shadow-sm transition-all">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#f5f0eb] flex items-center justify-center text-[#c4a882] shrink-0"><Bot size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-[#333]">{a.name}</div>
                  <div className="text-[12px] text-[#999] mt-0.5 line-clamp-2">{a.description || '无描述'}</div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-[#bbb]">
                    {a.model && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-mono">{a.model}</span>}
                    {a.maxTurns > 0 && <span>最大轮次: {a.maxTurns}</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button onClick={() => setEditing(a)} className="p-1.5 rounded-lg text-[#bbb] hover:text-[#666] hover:bg-[#f5f0eb]"><Pencil size={13} /></button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg text-red-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CModal title={editing.id ? '编辑子代理' : '新建子代理'} onClose={() => setEditing(null)} width={520} footer={
          <div className="flex gap-2">
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-[13px] text-[#888] hover:bg-[#f0ebe6] transition">取消</button>
            <button onClick={() => handleSave(editing)} className="px-4 py-2 rounded-lg bg-[#c4a882] text-white text-[13px] font-medium hover:bg-[#b09670] transition">保存</button>
          </div>
        }>
          <div className="space-y-4">
            <CField label="名称"><CInput value={editing.name} onChange={(e) => setEditing(v => ({ ...v, name: e.target.value }))} placeholder="如：code-reviewer" /></CField>
            <CField label="描述"><CInput value={editing.description} onChange={(e) => setEditing(v => ({ ...v, description: e.target.value }))} placeholder="负责代码审查和安全扫描" /></CField>
            <CField label="System Prompt">
              <textarea value={editing.prompt} onChange={(e) => setEditing(v => ({ ...v, prompt: e.target.value }))} placeholder="你是一个专业的代码审查员..." rows={6} className="w-full px-4 py-2.5 rounded-xl border border-[#e8e4e0] text-[13px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition resize-none font-mono" />
            </CField>
            <div className="grid grid-cols-2 gap-3">
              <CField label="模型（留空使用默认）"><CInput value={editing.model || ''} onChange={(e) => setEditing(v => ({ ...v, model: e.target.value }))} placeholder="claude-sonnet-4-..." /></CField>
              <CField label="最大轮次（0=不限）"><CInput type="number" value={editing.maxTurns || 0} onChange={(e) => setEditing(v => ({ ...v, maxTurns: parseInt(e.target.value) || 0 }))} /></CField>
            </div>
          </div>
        </CModal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  系统提示词
// ══════════════════════════════════════════════════════════════════

function CodingPromptPanel() {
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [appendText, setAppendText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDefault, setShowDefault] = useState(false);
  const [claudeMd, setClaudeMd] = useState('');
  const [claudeMdPath, setClaudeMdPath] = useState('');
  const codingProjectPath = useStore((s) => s.codingProjectPath);

  useEffect(() => {
    api.getCodingPromptConfig().then(r => {
      if (r) {
        setDefaultPrompt(r.default || '');
        setAppendText(r.append || '');
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!codingProjectPath) return;
    const path = codingProjectPath + '/CLAUDE.md';
    setClaudeMdPath(path);
    api.readFile(path).then(r => {
      if (r?.content != null) setClaudeMd(r.content);
      else setClaudeMd('');
    }).catch(() => setClaudeMd(''));
  }, [codingProjectPath]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveCodingPromptConfig({ append: appendText });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  };

  const handleSaveClaudeMd = async () => {
    if (!claudeMdPath) return;
    try {
      await api.writeFile(claudeMdPath, claudeMd);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <div>
        <h2 className="text-[18px] font-bold text-[#333] mb-1">系统提示词</h2>
        <p className="text-[13px] text-[#999]">使用 <code className="text-[11px] px-1 py-0.5 rounded bg-[#f5f0eb] text-[#8b5e3c]">claude_code</code> 预设 + append 模式。下方可编辑追加到默认 prompt 之后的自定义指令。</p>
      </div>

      {/* Default prompt (readonly) */}
      <div className="rounded-xl border border-[#e8e4e0] bg-white overflow-hidden">
        <button onClick={() => setShowDefault(!showDefault)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#faf8f6] transition">
          <span className="text-[13px] font-medium text-[#555]">默认 System Prompt（只读）</span>
          {showDefault ? <ChevronDown size={14} className="text-[#bbb]" /> : <ChevronRight size={14} className="text-[#bbb]" />}
        </button>
        {showDefault && (
          <div className="px-4 pb-4 border-t border-[#f0ebe6]">
            <pre className="text-[11px] text-[#888] font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto scrollable mt-3">{defaultPrompt}</pre>
          </div>
        )}
      </div>

      {/* Append editor */}
      <div className="rounded-xl border border-[#e8e4e0] bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold text-[#333]">自定义追加指令</div>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#c4a882] text-white text-[12px] font-medium hover:bg-[#b09670] disabled:opacity-60 transition">
            {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <CheckCircle2 size={12} /> : null}
            {saved ? '已保存' : '保存'}
          </button>
        </div>
        <textarea value={appendText} onChange={(e) => setAppendText(e.target.value)} rows={10} placeholder="在此输入追加到 system prompt 之后的自定义指令..." className="w-full px-4 py-3 rounded-xl border border-[#e8e4e0] text-[13px] text-[#333] font-mono placeholder-[#ccc] outline-none focus:border-[#c4a882] transition resize-none leading-relaxed" />
        <p className="text-[11px] text-[#bbb] mt-2">追加的指令会在每次对话中附加到默认 prompt 之后，新建会话时生效。</p>
      </div>

      {/* CLAUDE.md viewer/editor */}
      {codingProjectPath && (
        <div className="rounded-xl border border-[#e8e4e0] bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[13px] font-semibold text-[#333] flex items-center gap-1.5"><FileCode size={14} className="text-[#c4a882]" /> CLAUDE.md</div>
              <div className="text-[11px] text-[#bbb] mt-0.5 font-mono">{claudeMdPath}</div>
            </div>
            <button onClick={handleSaveClaudeMd} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#f5f0eb] text-[#8b5e3c] text-[12px] font-medium hover:bg-[#ede5dc] transition">保存 CLAUDE.md</button>
          </div>
          <textarea value={claudeMd} onChange={(e) => setClaudeMd(e.target.value)} rows={8} placeholder="SDK 会自动加载此文件作为项目级指令..." className="w-full px-4 py-3 rounded-xl border border-[#e8e4e0] text-[13px] text-[#333] font-mono placeholder-[#ccc] outline-none focus:border-[#c4a882] transition resize-none leading-relaxed" />
          <p className="text-[11px] text-[#bbb] mt-2">CLAUDE.md 是 SDK 自动加载的项目级指令文件。位于项目根目录。</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Plugins 管理
// ══════════════════════════════════════════════════════════════════

function CodingPluginsPanel() {
  const [paths, setPaths] = useState([]);
  const [newPath, setNewPath] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.getCodingPlugins();
      setPaths(r?.paths || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newPath.trim()) return;
    const updated = [...paths, newPath.trim()];
    await api.saveCodingPlugins(updated);
    setPaths(updated);
    setNewPath('');
  };

  const handleRemove = async (idx) => {
    const updated = paths.filter((_, i) => i !== idx);
    await api.saveCodingPlugins(updated);
    setPaths(updated);
  };

  const handleBrowse = async () => {
    if (!electron?.selectFiles) return;
    try {
      const selected = await electron.selectFiles({ directory: true });
      if (selected?.length > 0) {
        const updated = [...paths, ...selected];
        await api.saveCodingPlugins(updated);
        setPaths(updated);
      }
    } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <div>
        <h2 className="text-[18px] font-bold text-[#333] mb-1">Plugins 管理</h2>
        <p className="text-[13px] text-[#999]">加载本地 Plugin 目录，每个 Plugin 可包含 skills、agents、hooks 和 MCP servers。</p>
      </div>

      <div className="rounded-xl border border-[#e8e4e0] bg-white p-4">
        <div className="text-[13px] font-semibold text-[#333] mb-3">已加载的 Plugin 路径</div>
        {loading ? (
          <div className="py-8 text-center"><Loader2 size={18} className="animate-spin text-[#c4a882] mx-auto" /></div>
        ) : paths.length === 0 ? (
          <div className="py-8 text-center">
            <Puzzle size={24} className="text-[#ddd] mx-auto mb-2" />
            <p className="text-[12px] text-[#bbb]">暂无 Plugin，添加本地 Plugin 目录路径即可加载</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {paths.map((p, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-[#faf8f6] border border-[#e8e4e0] group">
                <FolderOpen size={14} className="text-[#c4a882] shrink-0" />
                <span className="flex-1 text-[12px] font-mono text-[#555] truncate">{p}</span>
                <button onClick={() => handleRemove(i)} className="p-1 rounded text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={newPath} onChange={(e) => setNewPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} placeholder="/path/to/plugin-directory" className="flex-1 px-3 py-2 rounded-lg border border-[#e8e4e0] text-[12px] text-[#333] font-mono placeholder-[#ccc] outline-none focus:border-[#c4a882] transition" />
          {electron?.selectFiles && (
            <button onClick={handleBrowse} className="px-3 py-2 rounded-lg bg-[#f5f0eb] text-[#8b5e3c] text-[12px] font-medium hover:bg-[#ede5dc] transition">浏览</button>
          )}
          <button onClick={handleAdd} className="px-3 py-2 rounded-lg bg-[#c4a882] text-white text-[12px] font-medium hover:bg-[#b09670] transition"><Plus size={13} /></button>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#faf8f6] border border-[#e8e4e0] text-[12px] text-[#999] space-y-1.5">
        <p><strong className="text-[#777]">Plugin 目录结构：</strong></p>
        <pre className="text-[11px] font-mono text-[#888] leading-relaxed">{`my-plugin/
├── .claude-plugin/plugin.json
├── skills/
│   └── my-skill/SKILL.md
├── agents/
│   └── my-agent.md
├── hooks/
│   └── pre-tool.js
└── .mcp.json`}</pre>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Hooks 配置
// ══════════════════════════════════════════════════════════════════

function CodingHooksPanel() {
  const [config, setConfig] = useState({ blockedPaths: [] });
  const [newPattern, setNewPattern] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getCodingHooksConfig().then(c => {
      if (c) setConfig({ blockedPaths: c.blockedPaths || [] });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async (updated) => {
    setConfig(updated);
    try {
      await api.saveCodingHooksConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const addPattern = () => {
    if (!newPattern.trim()) return;
    save({ ...config, blockedPaths: [...config.blockedPaths, newPattern.trim()] });
    setNewPattern('');
  };

  const removePattern = (idx) => {
    save({ ...config, blockedPaths: config.blockedPaths.filter((_, i) => i !== idx) });
  };

  const builtinPatterns = [
    '.env(.|$)', 'credentials.json$', '.pem$', '.key$', 'id_rsa', '.ssh/config$',
  ];

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <div>
        <h2 className="text-[18px] font-bold text-[#333] mb-1">Hooks 配置</h2>
        <p className="text-[13px] text-[#999]">配置 PreToolUse / PostToolUse hooks，管理敏感文件保护规则。</p>
      </div>

      {/* Built-in hooks */}
      <div className="rounded-xl border border-[#e8e4e0] bg-white p-4">
        <div className="text-[13px] font-semibold text-[#333] mb-1 flex items-center gap-1.5"><Shield size={14} className="text-emerald-500" /> 内置 Hooks（始终启用）</div>
        <p className="text-[11px] text-[#bbb] mb-3">以下 hooks 由系统内置，无法禁用。</p>
        <div className="space-y-2">
          <div className="p-3 rounded-lg bg-[#faf8f6]">
            <div className="text-[12px] font-medium text-[#555]">PreToolUse: 敏感文件保护</div>
            <p className="text-[11px] text-[#999] mt-0.5">拦截 Write/Edit/MultiEdit 对敏感文件路径的写入操作</p>
          </div>
          <div className="p-3 rounded-lg bg-[#faf8f6]">
            <div className="text-[12px] font-medium text-[#555]">PostToolUse: 审计日志</div>
            <p className="text-[11px] text-[#999] mt-0.5">记录所有工具调用的完成事件</p>
          </div>
        </div>
      </div>

      {/* Built-in blocked patterns */}
      <div className="rounded-xl border border-[#e8e4e0] bg-white p-4">
        <div className="text-[13px] font-semibold text-[#333] mb-3">内置保护路径模式</div>
        <div className="flex flex-wrap gap-1.5">
          {builtinPatterns.map((p, i) => (
            <span key={i} className="px-2 py-1 rounded-lg bg-gray-100 text-[11px] font-mono text-[#888]"><Lock size={9} className="inline mr-1" />{p}</span>
          ))}
        </div>
      </div>

      {/* Custom blocked patterns */}
      <div className="rounded-xl border border-[#e8e4e0] bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[13px] font-semibold text-[#333]">自定义保护路径</div>
            <p className="text-[11px] text-[#bbb]">添加额外的正则表达式，匹配的文件路径将被阻止写入</p>
          </div>
          {saved && <span className="text-[11px] text-emerald-500 flex items-center gap-1"><CheckCircle2 size={11} /> 已保存</span>}
        </div>
        {loading ? (
          <div className="py-6 text-center"><Loader2 size={16} className="animate-spin text-[#c4a882] mx-auto" /></div>
        ) : (
          <>
            {config.blockedPaths.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {config.blockedPaths.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-100 group">
                    <span className="flex-1 text-[12px] font-mono text-red-700">{p}</span>
                    <button onClick={() => removePattern(i)} className="p-1 rounded text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={newPattern} onChange={(e) => setNewPattern(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPattern()} placeholder="正则表达式，如 secret\\.yaml$" className="flex-1 px-3 py-2 rounded-lg border border-[#e8e4e0] text-[12px] text-[#333] font-mono placeholder-[#ccc] outline-none focus:border-[#c4a882] transition" />
              <button onClick={addPattern} className="px-3 py-2 rounded-lg bg-[#c4a882] text-white text-[12px] font-medium hover:bg-[#b09670] transition"><Plus size={13} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Checkpoint 回滚
// ══════════════════════════════════════════════════════════════════

function CodingCheckpointPanel() {
  const checkpoints = useStore((s) => s.codingCheckpoints);
  const rewindToCheckpoint = useStore((s) => s.rewindToCheckpoint);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const loadCheckpoints = useStore((s) => s.loadCheckpoints);
  const [rewinding, setRewinding] = useState(null);

  useEffect(() => {
    if (activeSessionId) loadCheckpoints(activeSessionId);
  }, [activeSessionId]);

  const handleRewind = async (cp) => {
    if (!confirm(`回滚到此检查点？文件将恢复到该时间点的状态。`)) return;
    setRewinding(cp.id);
    try {
      await rewindToCheckpoint(cp.id);
    } finally { setRewinding(null); }
  };

  const sorted = [...(checkpoints || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <div>
        <h2 className="text-[18px] font-bold text-[#333] mb-1">Checkpoint 回滚</h2>
        <p className="text-[13px] text-[#999]">SDK 在每次文件修改后自动创建检查点，你可以将文件回滚到任意检查点。</p>
      </div>

      {!activeSessionId ? (
        <div className="rounded-xl border border-[#e8e4e0] bg-white p-8 text-center">
          <RotateCcw size={24} className="text-[#ddd] mx-auto mb-2" />
          <p className="text-[12px] text-[#bbb]">请先选择一个会话以查看该会话的检查点</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-[#e8e4e0] bg-white p-8 text-center">
          <RotateCcw size={24} className="text-[#ddd] mx-auto mb-2" />
          <p className="text-[12px] text-[#bbb]">当前会话暂无检查点。Agent 修改文件后会自动创建检查点。</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-[#e8e4e0]" />
          <div className="space-y-3">
            {sorted.map((cp, i) => (
              <div key={cp.id || i} className="relative pl-12">
                {/* Timeline dot */}
                <div className={cn('absolute left-3.5 top-4 w-3 h-3 rounded-full border-2 bg-white z-10', i === 0 ? 'border-emerald-500' : 'border-[#c4a882]')} />
                <div className="group rounded-xl border border-[#e8e4e0] bg-white p-4 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[13px] font-medium text-[#333] flex items-center gap-2">
                        {cp.sdk_checkpoint ? 'SDK Checkpoint' : `Checkpoint #${cp.id}`}
                        {i === 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600">最新</span>}
                      </div>
                      <div className="text-[11px] text-[#bbb] mt-1 flex items-center gap-2">
                        <Clock size={10} />
                        {new Date(cp.created_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <button onClick={() => handleRewind(cp)} disabled={rewinding === cp.id || i === 0} className={cn('flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition opacity-0 group-hover:opacity-100', i === 0 ? 'text-[#bbb] cursor-not-allowed' : 'bg-amber-50 text-amber-700 hover:bg-amber-100')}>
                      {rewinding === cp.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      回滚到此
                    </button>
                  </div>
                  {cp.files_count > 0 && <div className="text-[11px] text-[#999] mt-2">{cp.files_count} 个文件快照</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl bg-[#faf8f6] border border-[#e8e4e0]">
        <p className="text-[12px] text-[#999] leading-relaxed">
          <strong className="text-[#777]">注意：</strong>
          回滚操作会将工作目录中的文件恢复到选定检查点的状态。只影响 Agent 修改过的文件（Write/Edit 工具），不会影响你手动修改的文件。
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  模型与接入点（暖色调版，不使用 CSS 变量主题系统）
// ══════════════════════════════════════════════════════════════════

function CodingProfilesPanel() {
  const providers = useStore((s) => s.providers);
  const profiles  = useStore((s) => s.profiles);
  const refreshProfiles = useStore((s) => s.refreshProfiles);
  const activate  = useStore((s) => s.activateProfile);

  const [editing, setEditing]     = useState(null);
  const [testStates, setTestStates] = useState({});
  const [notification, setNotification] = useState(null);

  const notify = (title, body) => {
    setNotification({ title, body });
    setTimeout(() => setNotification(null), 3000);
  };

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
      if (p.auth_token_cipher) token = await electron.decryptSecret(p.auth_token_cipher);
      const r = await api.testProfile(p.id, { token });
      if (r.ok) {
        const latency = r.connectivity?.latency || r.latency || '';
        const proxyLatency = r.proxy?.latency || '';
        setTestStates((s) => ({ ...s, [p.id]: { phase: 'done', status: 'success', latency, proxyLatency, hasProxy: !!r.proxy } }));
      } else {
        const failPhase = r.connectivity && !r.connectivity.success ? 'connectivity' : 'proxy';
        setTestStates((s) => ({ ...s, [p.id]: { phase: failPhase, status: 'fail' } }));
        notify('连接失败', r.error || '请检查配置');
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
    <div className="py-5 px-6 max-w-3xl">
      {/* Toast 通知 */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 flex items-start gap-2 px-4 py-3 rounded-xl bg-[#3a2a1a] text-white text-[13px] shadow-xl">
          <span className="font-medium">{notification.title}</span>
          {notification.body && <span className="text-[#e8d5be]">{notification.body}</span>}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[16px] font-bold text-[#1a1a1a]">模型与接入点</h2>
          <p className="text-[12px] text-[#999] mt-0.5">选择供应商，填入密钥即可在 Coding 模式使用</p>
        </div>
        <button
          onClick={() => setEditing({ __new: true })}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#c4a882] text-white text-[13px] font-medium hover:bg-[#b09670] transition"
        >
          <Plus size={14} /> 新建接入点
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#f5f0eb] flex items-center justify-center mb-4">
            <Cpu size={26} className="text-[#c4a882]" />
          </div>
          <div className="text-[15px] font-bold text-[#333] mb-1">还没有接入点</div>
          <p className="text-[13px] text-[#999] mb-4">点击「新建接入点」选择供应商并填入密钥</p>
          <button
            onClick={() => setEditing({ __new: true })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#c4a882] text-white text-[13px] font-medium hover:bg-[#b09670] transition"
          >
            <Plus size={14} /> 新建接入点
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {profiles.map((p) => (
            <CodingProfileCard
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
        <CodingProfileEditor
          providers={providers}
          profile={editing.__new ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refreshProfiles(); }}
          notify={notify}
        />
      )}
    </div>
  );
}

function CodingProfileCard({ profile: p, provider, testState, onActivate, onTest, onEdit, onDelete }) {
  const theme = getTheme(provider?.code);
  const isDirect = theme.direct;
  const ts = testState || {};
  const isTesting = ts.status === 'testing';
  const isSuccess = ts.status === 'success';
  const isFail    = ts.status === 'fail';

  const testLabel = isTesting
    ? (ts.phase === 'proxy' ? '管道验证…' : '连通测试…')
    : isSuccess
      ? (ts.hasProxy ? `直连 ${ts.latency} · 管道 ${ts.proxyLatency}` : `成功 ${ts.latency}`)
      : isFail
        ? (ts.phase === 'proxy' ? '代理管道失败' : '连接失败')
        : '测试连接';

  const Icon = theme.icon;

  return (
    <div className={cn(
      'group relative flex flex-col gap-3 p-4 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md overflow-hidden bg-white',
      p.is_active ? 'border-[#c4a882] shadow-sm' : 'border-[#e8e4e0]'
    )}>
      <div className={cn('absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r', theme.gradient)} />

      <div className="flex items-start gap-3 pt-1">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-white shadow-sm shrink-0', theme.gradient)}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[14px] text-[#1a1a1a] truncate flex items-center gap-2">
            {p.name}
            {p.is_active && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                使用中
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#999] mt-0.5 flex items-center gap-1.5">
            {isDirect
              ? <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-medium">直连</span>
              : <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-medium">{p.provider_protocol === 'openai' ? '代理' : 'Anthropic'}</span>
            }
            <span className="truncate">{p.model || provider?.default_model || '默认模型'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-[#bbb]">
        <ShieldCheck size={11} />
        <span>{p.auth_token_mask || '未设置密钥'}</span>
      </div>

      <div className="flex items-center gap-1.5 pt-2 border-t border-[#f0ebe6]">
        {!p.is_active && (
          <button onClick={onActivate} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#f5f0eb] text-[#8b5e3c] text-[12px] font-medium hover:bg-[#ede5dc] transition">
            <Zap size={12} /> 激活
          </button>
        )}
        <button
          onClick={onTest}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] transition',
            isSuccess ? 'text-emerald-600' : isFail ? 'text-red-500' : 'text-[#999] hover:text-[#666] hover:bg-[#f5f0eb]'
          )}
        >
          {isTesting && <Loader2 size={12} className="animate-spin" />}
          {isSuccess && <CheckCircle2 size={12} />}
          {isFail    && <AlertCircle size={12} />}
          {testLabel}
        </button>
        <div className="flex-1" />
        <button onClick={onEdit} className="p-1.5 rounded-lg text-[#bbb] hover:text-[#666] hover:bg-[#f5f0eb] opacity-0 group-hover:opacity-100 transition">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-red-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function CodingProfileEditor({ providers, profile, onClose, onSaved, notify }) {
  const isEdit = !!profile;
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [selectedProvider, setSelectedProvider] = useState(
    isEdit ? providers.find((p) => p.id === profile.provider_id) : null
  );
  const [name, setName]   = useState(profile?.name || '');
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
    if (!effectiveToken) { notify('请先填写密钥', ''); return; }
    const url = baseUrl || selectedProvider?.default_base_url || '';
    if (!url) { notify('缺少 Base URL', ''); return; }
    setFetchingModels(true);
    try {
      const r = await api.fetchModels({ base_url: url, token: effectiveToken, protocol: selectedProvider?.protocol || 'openai' });
      if (r.ok && r.models?.length > 0) {
        setRemoteModels(r.models);
        notify(`发现 ${r.models.length} 个模型`, '部分模型可能需要开通后才可使用，请从列表中选择');
      } else {
        notify('获取模型列表失败', r.error || '供应商可能不支持 /models 端点，请手动选择');
      }
    } catch (e) {
      notify('获取模型失败', e.message);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { notify('请填写名称', ''); return; }
    if (!selectedProvider) { notify('请选择供应商', ''); return; }
    if (!isEdit && !token.trim()) { notify('请填写密钥', ''); return; }
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
      if (profile?.is_active && token) await electron.pushActiveSecret(profile.id);
      notify(isEdit ? '已保存修改' : '已添加接入点', name);
      onSaved();
    } catch (e) {
      notify('保存失败', e.message);
    } finally {
      setSaving(false);
    }
  };

  const theme = selectedProvider ? getTheme(selectedProvider.code) : null;

  // 遮罩层 + 弹窗
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e4e0]">
          <h3 className="text-[15px] font-bold text-[#1a1a1a]">
            {step === 1 ? '选择供应商' : (isEdit ? '编辑接入点' : '配置接入点')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#bbb] hover:text-[#555] hover:bg-[#f5f0eb] transition">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollable px-6 py-5">
          {step === 1 ? (
            <ProviderPickerPanel
              providers={providers}
              selectedId={selectedProvider?.id}
              onSelect={handlePickProvider}
            />
          ) : (
            <div className="space-y-5">
              {/* 供应商摘要 */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#faf8f6] border border-[#e8e4e0]">
                {theme && (
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br text-white shrink-0', theme.gradient)}>
                    {(() => { const Icon = theme.icon; return <Icon size={18} />; })()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[13px] text-[#1a1a1a]">{selectedProvider?.name}</div>
                  <div className="text-[11px] text-[#999] flex items-center gap-1.5 mt-0.5">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', isOpenAI ? 'bg-blue-50 text-blue-600' : 'bg-[#f5f0eb] text-[#8b5e3c]')}>
                      {isOpenAI ? 'OpenAI 兼容' : 'Anthropic'}
                    </span>
                    {selectedProvider?.default_model && <span className="truncate">{selectedProvider.default_model}</span>}
                  </div>
                </div>
                {!isEdit && (
                  <button onClick={() => setStep(1)} className="text-[12px] text-[#c4a882] hover:underline shrink-0">更换</button>
                )}
              </div>

              {/* API Key */}
              <div>
                <label className="text-[12px] font-medium text-[#666] mb-1.5 block">API Key</label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={tokenLoading ? '正在加载已保存的密钥…' : 'sk-...'}
                    autoComplete="off"
                    autoFocus={!isEdit}
                    disabled={tokenLoading}
                    className="w-full px-4 py-2.5 pr-10 rounded-xl border border-[#e8e4e0] text-[14px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#bbb] hover:text-[#666] transition"
                  >
                    {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#bbb]">
                  <span className="flex items-center gap-1"><ShieldCheck size={10} /> Keychain 加密存储</span>
                  <div className="flex items-center gap-3">
                    {isEdit && profile?.auth_token_mask && (
                      <span className="text-[#999]">已保存: {profile.auth_token_mask}</span>
                    )}
                    {selectedProvider?.doc_url && (
                      <button onClick={() => electron.openExternal(selectedProvider.doc_url)} className="flex items-center gap-1 text-[#c4a882] hover:underline">
                        <ExternalLink size={10} /> 获取密钥
                      </button>
                    )}
                  </div>
                </div>
                {isEdit && (
                  <div className="mt-1 text-[11px] text-[#bbb]">清空后保存将保留原密钥不变</div>
                )}
              </div>

              {/* 模型 */}
              <div>
                <label className="text-[12px] font-medium text-[#666] mb-1.5 block">模型</label>
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
                  <button
                    onClick={handleFetchModels}
                    disabled={fetchingModels || tokenLoading || (!token.trim() && !profile?.auth_token_cipher)}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl border border-[#e8e4e0] text-[12px] text-[#888] hover:bg-[#f5f0eb] hover:text-[#555] disabled:opacity-40 transition"
                  >
                    {fetchingModels ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                    {fetchingModels ? '获取中' : '获取模型'}
                  </button>
                </div>
                {!model && selectedProvider?.default_model && (
                  <div className="mt-1 text-[11px] text-[#bbb]">留空将使用默认: {selectedProvider.default_model}</div>
                )}
              </div>

              {/* 高级设置 */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1 text-[12px] text-[#999] hover:text-[#555] transition"
                >
                  {showAdvanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  高级设置
                  <span className="text-[#bbb]">（名称、URL{isOpenAI ? '、Transformer' : ''}）</span>
                </button>
                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    <CField label="名称">
                      <CInput value={name} onChange={(e) => setName(e.target.value)} placeholder={selectedProvider?.name || ''} />
                    </CField>
                    <CField label={isCustom ? 'Base URL' : 'Base URL（供应商已预设）'}>
                      <CInput value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={selectedProvider?.default_base_url || 'https://...'} />
                    </CField>
                    {isOpenAI && (
                      <CField label="Transformer">
                        <CInput value={transformer} onChange={(e) => setTransformer(e.target.value)} placeholder="留空 = 自动" />
                      </CField>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-[#e8e4e0] bg-[#faf8f6]">
          {step === 2 && !isEdit && (
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[13px] text-[#999] hover:text-[#555] transition mr-auto">
              <ArrowLeft size={13} /> 重选供应商
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-[#888] hover:bg-[#f0ebe6] transition">取消</button>
          {step === 2 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#c4a882] text-white text-[13px] font-medium hover:bg-[#b09670] disabled:opacity-60 transition"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              {isEdit ? '保存' : '添加'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderPickerPanel({ providers, selectedId, onSelect }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return providers;
    const q = search.toLowerCase();
    return providers.filter(p =>
      p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) ||
      (getTheme(p.code).label || '').toLowerCase().includes(q)
    );
  }, [providers, search]);

  const anthropicProviders = filtered.filter(p => p.protocol === 'anthropic');
  const openaiProviders    = filtered.filter(p => p.protocol === 'openai');

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索供应商…"
          autoFocus
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#e8e4e0] text-[13px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition"
        />
      </div>
      {anthropicProviders.length > 0 && <ProviderSection title="Anthropic 协议（直连）" providers={anthropicProviders} selectedId={selectedId} onSelect={onSelect} />}
      {openaiProviders.length > 0 && <ProviderSection title="OpenAI 兼容协议（经本地路由层翻译）" providers={openaiProviders} selectedId={selectedId} onSelect={onSelect} />}
      {filtered.length === 0 && <div className="text-center py-8 text-[13px] text-[#bbb]">未找到匹配的供应商</div>}
    </div>
  );
}

function ProviderSection({ title, providers, selectedId, onSelect }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-[#bbb] mb-2 uppercase tracking-wider">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        {providers.map((p) => {
          const theme = getTheme(p.code);
          const Icon = theme.icon;
          const selected = selectedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={cn(
                'p-3 text-left rounded-xl border transition-all hover:-translate-y-0.5',
                selected ? 'border-[#c4a882] bg-[#fdf8f3] ring-1 ring-[#c4a882]' : 'border-[#e8e4e0] hover:border-[#d4cec6] hover:shadow-sm bg-white'
              )}
            >
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br text-white mb-2', theme.gradient)}>
                <Icon size={16} />
              </div>
              <div className="text-[12px] font-medium text-[#333] truncate">{theme.label || p.name}</div>
              <div className="text-[10px] text-[#bbb] truncate mt-0.5">{p.default_model || '—'}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModelComboBox({ value, onChange, providerCode, remoteModels, placeholder }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const presetGroups = PROVIDER_MODELS[providerCode] || [];
  const hasRemote = remoteModels && remoteModels.length > 0;
  const allGroups = hasRemote
    ? [{ group: '可用模型（来自 API）', models: remoteModels }, ...presetGroups.map(g => ({ ...g, group: `预设 · ${g.group}` }))]
    : presetGroups;
  const filtered = allGroups
    .map(g => ({ ...g, models: g.models.filter(m => m.toLowerCase().includes(filter.toLowerCase())) }))
    .filter(g => g.models.length > 0);

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setFilter(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-[#e8e4e0] text-[13px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition"
      />
      {open && allGroups.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[#e8e4e0] bg-white shadow-xl scrollable">
          {filtered.length === 0 && <div className="px-3 py-2 text-[12px] text-[#bbb]">无匹配模型（可手动输入）</div>}
          {filtered.map(g => (
            <div key={g.group}>
              <div className={cn('px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-[#faf8f6]', g.group.includes('API') ? 'text-emerald-600' : 'text-[#bbb]')}>{g.group}</div>
              {g.models.map(m => (
                <button
                  key={m}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(m); setOpen(false); }}
                  className={cn('w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#f5f0eb] transition', m === value && 'text-[#c4a882] font-medium')}
                >
                  {m}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CField({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-[#999] mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function CInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl border border-[#e8e4e0] text-[13px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition"
    />
  );
}

function maskToken(t) {
  if (!t) return '';
  if (t.length <= 8) return '****';
  return t.slice(0, 4) + '••••' + t.slice(-4);
}

// ══════════════════════════════════════════════════════════════════
//  用量统计（暖色调版）
// ══════════════════════════════════════════════════════════════════

const RANGES = [
  { v: 'today', label: '今日' },
  { v: '7d', label: '近 7 天' },
  { v: '30d', label: '近 30 天' },
  { v: '90d', label: '近 90 天' },
];

function loadBudget() {
  try {
    const raw = localStorage.getItem('lingxi-budget');
    return raw ? JSON.parse(raw) : { dailyLimit: 0, monthlyLimit: 0, alertThreshold: 80 };
  } catch { return { dailyLimit: 0, monthlyLimit: 0, alertThreshold: 80 }; }
}
function saveBudget(b) { localStorage.setItem('lingxi-budget', JSON.stringify(b)); }

function formatNum(n) {
  if (n === undefined || n === null) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function CodingUsagePanel() {
  const [range, setRange] = useState('7d');
  const [data, setData]   = useState(null);
  const [budget, setBudget] = useState(loadBudget);
  const activeProfile = useStore((s) => s.activeProfile);

  const load = useCallback(async () => {
    const u = await api.getUsage(range).catch(() => null);
    setData(u);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const handleBudgetChange = (field, value) => {
    const next = { ...budget, [field]: Number(value) || 0 };
    setBudget(next);
    saveBudget(next);
  };

  const summary   = data?.summary   || {};
  const today     = data?.today     || {};
  const costTrend = data?.cost_trend || [];
  const byAgent   = data?.by_agent   || [];

  const dailyPct   = budget.dailyLimit   > 0 ? Math.min(100, ((today.cost_usd   || 0) / budget.dailyLimit)   * 100) : 0;
  const monthlyPct = budget.monthlyLimit > 0 ? Math.min(100, ((summary.cost_usd || 0) / budget.monthlyLimit) * 100) : 0;

  const costChange = costTrend.length >= 2
    ? (costTrend[costTrend.length - 1].cost_usd - costTrend[costTrend.length - 2].cost_usd)
    : 0;

  return (
    <div className="py-5 px-6 max-w-3xl space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-bold text-[#1a1a1a]">用量统计</h2>
          <p className="text-[12px] text-[#999] mt-0.5">追踪 Token 消耗与费用趋势</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#e8e4e0] text-[12px] text-[#555] bg-white outline-none focus:border-[#c4a882] transition"
          >
            {RANGES.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#e8e4e0] text-[12px] text-[#888] hover:bg-[#f5f0eb] transition">
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
      </div>

      {/* 四格概览 */}
      <div className="grid grid-cols-2 gap-3">
        <UStatCard icon={<Coins size={16} />} label="本期费用" value={`$${(summary.cost_usd || 0).toFixed(4)}`} sub={`今日 $${(today.cost_usd || 0).toFixed(4)}`} hint={summary.has_estimated ? '含估算' : null} />
        <UStatCard icon={<BarChart3 size={16} />} label="请求数" value={summary.requests || 0} sub={`今日 ${today.requests || 0}`} />
        <UStatCard icon={<Cpu size={16} />} label="输入 Token" value={formatNum(summary.input_tokens || 0)} sub={`今日 ${formatNum(today.input_tokens || 0)}`} />
        <UStatCard icon={<Cpu size={16} />} label="输出 Token" value={formatNum(summary.output_tokens || 0)} sub={`今日 ${formatNum(today.output_tokens || 0)}`} />
      </div>

      {/* 费用趋势 */}
      <div className="rounded-2xl border border-[#e8e4e0] bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold text-[#333] flex items-center gap-1.5">
            <TrendingUp size={13} className="text-[#c4a882]" /> 费用趋势
          </div>
          {costChange !== 0 && (
            <div className={cn('text-[11px] font-medium flex items-center gap-0.5', costChange > 0 ? 'text-red-500' : 'text-emerald-500')}>
              {costChange > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              ${Math.abs(costChange).toFixed(4)}
            </div>
          )}
        </div>
        <div style={{ width: '100%', height: 160 }}>
          <ResponsiveContainer>
            <AreaChart data={costTrend}>
              <defs>
                <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c4a882" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#c4a882" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.1)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toFixed(2)}`} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e8e4e0', fontSize: 12, borderRadius: 8 }}
                formatter={v => [`$${v.toFixed(4)}`, '费用']}
              />
              <Area type="monotone" dataKey="cost_usd" stroke="#c4a882" fill="url(#cg2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Token 日柱图 */}
      <div className="rounded-2xl border border-[#e8e4e0] bg-white p-4">
        <div className="text-[13px] font-semibold text-[#333] mb-3">Token 日用量</div>
        <div style={{ width: '100%', height: 160 }}>
          <ResponsiveContainer>
            <BarChart data={data?.by_day || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.1)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8e4e0', fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="input_tokens" name="输入" fill="#c4a882" radius={[3, 3, 0, 0]} />
              <Bar dataKey="output_tokens" name="输出" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 按智能体聚合 */}
      {byAgent.length > 0 && (
        <div className="rounded-2xl border border-[#e8e4e0] bg-white p-4">
          <div className="text-[13px] font-semibold text-[#333] mb-3 flex items-center gap-1.5">
            <Bot size={13} className="text-[#c4a882]" /> 按智能体聚合
          </div>
          <div className="space-y-2.5">
            {byAgent.map(row => {
              const totalCost = summary.cost_usd || 1;
              const pct = totalCost > 0 ? Math.round((row.cost_usd / totalCost) * 100) : 0;
              return (
                <div key={row.agent_id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#f5f0eb] flex items-center justify-center text-[11px] font-bold text-[#c4a882] shrink-0">
                    {(row.agent_name || '?').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[#333] truncate">{row.agent_name}</span>
                      <span className="text-[12px] font-semibold text-[#333] ml-2">${(row.cost_usd || 0).toFixed(4)}</span>
                    </div>
                    <div className="h-1.5 bg-[#f0ebe6] rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-gradient-to-r from-[#c4a882] to-[#d4b896] rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-[11px] text-[#bbb] w-8 text-right">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 预算预警 */}
      <div className="rounded-2xl border border-[#e8e4e0] bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={14} className="text-[#c4a882]" />
          <div className="text-[13px] font-semibold text-[#333]">预算预警</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-[#999] mb-1 block">每日预算 ($)</label>
            <input
              type="number" min="0" step="0.5"
              value={budget.dailyLimit || ''}
              placeholder="0=不限"
              onChange={(e) => handleBudgetChange('dailyLimit', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#e8e4e0] text-[12px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition"
            />
            {budget.dailyLimit > 0 && <ProgressMini2 value={dailyPct} label={`$${(today.cost_usd || 0).toFixed(4)}`} />}
          </div>
          <div>
            <label className="text-[11px] text-[#999] mb-1 block">本期预算 ($)</label>
            <input
              type="number" min="0" step="1"
              value={budget.monthlyLimit || ''}
              placeholder="0=不限"
              onChange={(e) => handleBudgetChange('monthlyLimit', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#e8e4e0] text-[12px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition"
            />
            {budget.monthlyLimit > 0 && <ProgressMini2 value={monthlyPct} label={`$${(summary.cost_usd || 0).toFixed(4)}`} />}
          </div>
          <div>
            <label className="text-[11px] text-[#999] mb-1 block">预警阈值 (%)</label>
            <input
              type="number" min="10" max="100" step="5"
              value={budget.alertThreshold}
              onChange={(e) => handleBudgetChange('alertThreshold', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#e8e4e0] text-[12px] text-[#333] outline-none focus:border-[#c4a882] transition"
            />
            <div className="text-[10px] text-[#bbb] mt-1">达到此%时弹出提醒</div>
          </div>
        </div>
        {(dailyPct >= (budget.alertThreshold || 80) || monthlyPct >= (budget.alertThreshold || 80)) && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 text-[12px] text-amber-600">
            <AlertTriangle size={14} /> 费用已接近或超过预算阈值
          </div>
        )}
      </div>

      {/* 最近请求 */}
      <div className="rounded-2xl border border-[#e8e4e0] bg-white p-4">
        <div className="text-[13px] font-semibold text-[#333] mb-3">最近请求</div>
        {(data?.recent || []).length === 0 ? (
          <div className="py-6 text-center text-[12px] text-[#bbb]">暂无记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-[#bbb]">
                  <th className="text-left font-normal py-1.5">会话</th>
                  <th className="text-left font-normal">模型</th>
                  <th className="text-right font-normal">费用</th>
                  <th className="text-right font-normal">耗时</th>
                  <th className="text-right font-normal">时间</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map(r => (
                  <tr key={r.id} className="border-t border-[#f0ebe6]">
                    <td className="py-1.5 max-w-[160px] truncate text-[#555]">{r.session_title || '会话 #' + r.session_id}</td>
                    <td className="font-mono text-[10px] text-[#888]">{r.model || '—'}</td>
                    <td className="text-right text-[#555]">
                      ${(r.cost_usd || 0).toFixed(4)}
                      {r.estimated && <span className="text-[9px] text-amber-500 ml-0.5">~</span>}
                    </td>
                    <td className="text-right text-[#888]">{((r.duration_ms || 0) / 1000).toFixed(1)}s</td>
                    <td className="text-right text-[10px] text-[#bbb]">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function UStatCard({ icon, label, value, sub, hint }) {
  return (
    <div className="rounded-2xl border border-[#e8e4e0] bg-white p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-[#f5f0eb] text-[#c4a882] flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-[#bbb]">{label}</div>
        <div className="text-[16px] font-semibold text-[#1a1a1a] leading-tight flex items-center gap-1.5">
          {value}
          {hint && <span className="text-[10px] font-normal text-amber-500">{hint}</span>}
        </div>
        {sub && <div className="text-[11px] text-[#bbb]">{sub}</div>}
      </div>
    </div>
  );
}

function ProgressMini2({ value, label }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] text-[#bbb] mb-0.5">
        <span>{label}</span>
        <span>{value.toFixed(0)}%</span>
      </div>
      <div className="h-1 bg-[#f0ebe6] rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', value >= 80 ? 'bg-red-400' : value >= 50 ? 'bg-amber-400' : 'bg-emerald-400')}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  远程访问（暖色调版）
// ══════════════════════════════════════════════════════════════════

function CodingRemotePanel() {
  const [settings, setSettings] = useState({ enabled: false, permission_mode: 'readonly', allowed_origins: '' });
  const [tokens, setTokens]     = useState([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [qrToken, setQrToken]   = useState(null);
  const [saving, setSaving]     = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.getH5Settings(), api.listH5Tokens()]);
      setSettings(s || { enabled: false, permission_mode: 'readonly', allowed_origins: '' });
      setTokens(Array.isArray(t) ? t : (t?.tokens || []));
    } catch {}
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async () => {
    const next = { ...settings, enabled: !settings.enabled };
    setSaving(true);
    try { await api.updateH5Settings(next); setSettings(next); } catch {} finally { setSaving(false); }
  };

  const handleRevoke = async (id) => { try { await api.revokeH5Token(id); loadData(); } catch {} };
  const handleDelete = async (id) => { try { await api.deleteH5Token(id); loadData(); } catch {} };

  const activeTokens = tokens.filter(t => t.enabled);

  return (
    <div className="py-5 px-6 max-w-2xl space-y-5">
      <div>
        <h2 className="text-[16px] font-bold text-[#1a1a1a] flex items-center gap-2">
          <Smartphone size={18} className="text-[#c4a882]" /> 远程访问
        </h2>
        <p className="text-[12px] text-[#999] mt-0.5">生成令牌后扫描二维码，在手机上查看桌面端的会话</p>
      </div>

      {/* 总开关 */}
      <div className="rounded-2xl border border-[#e8e4e0] bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-[#333]">远程访问总开关</div>
            <div className="text-[11px] text-[#bbb] mt-0.5">
              {settings.enabled ? '已启用 — 可通过令牌从其他设备访问会话' : '已关闭 — 不接受任何远程访问'}
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0',
              settings.enabled ? 'bg-[#c4a882]' : 'bg-[#ddd]'
            )}
          >
            <span className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            )} />
          </button>
        </div>
      </div>

      {settings.enabled && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-[#333]">
              访问令牌
              {activeTokens.length > 0 && (
                <span className="ml-2 text-[11px] text-[#bbb]">{activeTokens.length} 个有效</span>
              )}
            </div>
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#c4a882] text-white text-[12px] font-medium hover:bg-[#b09670] transition"
            >
              <Plus size={13} /> 生成令牌
            </button>
          </div>

          {tokens.length === 0 ? (
            <div className="rounded-2xl border border-[#e8e4e0] bg-white p-8 flex flex-col items-center gap-2 text-center">
              <QrCode size={28} className="text-[#ddd]" />
              <p className="text-[12px] text-[#bbb]">暂无令牌，点击"生成令牌"创建一个</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tokens.map(t => (
                <div key={t.id} className={cn('rounded-xl border border-[#e8e4e0] bg-white p-3 flex items-center gap-3', !t.enabled && 'opacity-50')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[#333]">{t.label || '未命名'}</span>
                      {t.enabled
                        ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">有效</span>
                        : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f5f0eb] text-[#999]">已禁用</span>
                      }
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-[#bbb]">
                      <span className="font-mono">{t.token_preview}</span>
                      <span className="flex items-center gap-0.5">
                        <Clock size={10} />
                        {t.expires_at ? new Date(t.expires_at).toLocaleString('zh-CN') : '永不过期'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.enabled && t.access_url && (
                      <button onClick={() => setQrToken(t)} className="p-1.5 rounded-lg text-[#bbb] hover:text-[#c4a882] hover:bg-[#f5f0eb] transition" title="查看二维码">
                        <QrCode size={14} />
                      </button>
                    )}
                    {t.enabled && (
                      <button onClick={() => handleRevoke(t.id)} className="p-1.5 rounded-lg text-[#bbb] hover:text-amber-500 hover:bg-amber-50 transition" title="禁用">
                        <PowerOff size={14} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg text-[#bbb] hover:text-red-500 hover:bg-red-50 transition" title="删除">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl bg-[#faf8f6] border border-[#e8e4e0] p-4 text-[11px] text-[#bbb] space-y-1">
            <p>• 生成令牌后可扫描二维码直接在手机上访问</p>
            <p>• 手机和电脑需在同一局域网（Wi-Fi）</p>
            <p>• 有效令牌的二维码可随时点击 <QrCode size={10} className="inline" /> 图标重新查看</p>
          </div>
        </>
      )}

      {showGenerate && <GenerateTokenModal2 onClose={() => setShowGenerate(false)} onCreated={loadData} />}
      {qrToken && <QRViewModal2 token={qrToken} onClose={() => setQrToken(null)} />}
    </div>
  );
}

function QRViewModal2({ token, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(token.access_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <CModal title="扫码访问" onClose={onClose} width={340}>
      <div className="flex flex-col items-center space-y-4">
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <QRCodeSVG value={token.access_url} size={180} level="M" />
        </div>
        <div className="text-center">
          <div className="text-[13px] font-medium text-[#333]">{token.label || '远程访问'}</div>
          <div className="text-[11px] text-[#bbb] mt-1">用手机相机或浏览器扫描上方二维码</div>
        </div>
        <div className="w-full flex items-center gap-2 p-2 rounded-lg bg-[#faf8f6] border border-[#e8e4e0]">
          <code className="flex-1 text-[10px] font-mono text-[#888] break-all select-all">{token.access_url}</code>
          <button onClick={handleCopy} className="p-1.5 rounded-md text-[#bbb] hover:text-[#c4a882] hover:bg-[#f5f0eb] transition shrink-0">
            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          </button>
        </div>
        {token.expires_at && (
          <div className="text-[10px] text-[#bbb] flex items-center gap-1">
            <Clock size={10} /> 有效期至 {new Date(token.expires_at).toLocaleString('zh-CN')}
          </div>
        )}
      </div>
    </CModal>
  );
}

function GenerateTokenModal2({ onClose, onCreated }) {
  const [label, setLabel]         = useState('');
  const [expiresHours, setExpires] = useState(24);
  const [token, setToken]          = useState('');
  const [accessUrl, setAccessUrl]  = useState('');
  const [creating, setCreating]    = useState(false);
  const [copied, setCopied]        = useState('');

  const handleGenerate = async () => {
    setCreating(true);
    try {
      const result = await api.generateH5Token({ label: label || '远程访问', ttl_hours: expiresHours });
      setToken(result.token || result.full_token || '');
      setAccessUrl(result.access_url || '');
      onCreated();
    } catch {} finally { setCreating(false); }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); });
  };

  return (
    <CModal
      title="生成访问令牌"
      onClose={onClose}
      width={400}
      footer={token ? (
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[#c4a882] text-white text-[13px] font-medium hover:bg-[#b09670] transition">完成</button>
      ) : (
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-[#888] hover:bg-[#f0ebe6] transition">取消</button>
          <button onClick={handleGenerate} disabled={creating} className="px-4 py-2 rounded-lg bg-[#c4a882] text-white text-[13px] font-medium hover:bg-[#b09670] disabled:opacity-60 transition">
            {creating ? '生成中…' : '生成'}
          </button>
        </div>
      )}
    >
      {token ? (
        <div className="flex flex-col items-center space-y-4">
          {accessUrl && (
            <>
              <div className="p-4 bg-white rounded-2xl shadow-sm">
                <QRCodeSVG value={accessUrl} size={180} level="M" />
              </div>
              <div className="text-center">
                <div className="text-[13px] font-medium text-[#333]">扫码即可在手机上访问</div>
                <div className="text-[11px] text-[#bbb] mt-1">确保手机和电脑在同一 Wi-Fi 网络</div>
              </div>
              <div className="w-full flex items-center gap-2 p-2 rounded-lg bg-[#faf8f6] border border-[#e8e4e0]">
                <code className="flex-1 text-[10px] font-mono text-[#888] break-all select-all">{accessUrl}</code>
                <button onClick={() => handleCopy(accessUrl, 'url')} className="p-1.5 rounded-md text-[#bbb] hover:text-[#c4a882] hover:bg-[#f5f0eb] transition shrink-0">
                  {copied === 'url' ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
              </div>
            </>
          )}
          <div className="text-[11px] text-[#bbb] text-center">
            关闭后可在令牌列表点击 <QrCode size={10} className="inline" /> 图标重新查看二维码
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-[#555] mb-1 block">令牌标签</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例如：iPhone 远程查看"
              className="w-full px-4 py-2.5 rounded-xl border border-[#e8e4e0] text-[13px] text-[#333] placeholder-[#ccc] outline-none focus:border-[#c4a882] transition"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-[#555] mb-1 block">有效期（小时）</label>
            <input type="number" value={expiresHours} onChange={(e) => setExpires(Number(e.target.value))} min={1} max={720}
              className="w-full px-4 py-2.5 rounded-xl border border-[#e8e4e0] text-[13px] text-[#333] outline-none focus:border-[#c4a882] transition"
            />
            <p className="text-[11px] text-[#bbb] mt-1">建议 24 小时内，最长 30 天</p>
          </div>
          <div className="p-3 rounded-xl bg-[#faf8f6] border border-[#e8e4e0] text-[11px] text-[#bbb] space-y-1">
            <p>生成后会显示二维码，用手机扫码即可访问会话。</p>
            <p>需要手机和电脑在同一 Wi-Fi 网络。</p>
          </div>
        </div>
      )}
    </CModal>
  );
}

// 暖色调弹窗容器
function CModal({ title, onClose, width = 480, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ width: `min(${width}px, calc(100vw - 32px))`, maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e4e0]">
          <h3 className="text-[14px] font-bold text-[#1a1a1a]">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#bbb] hover:text-[#555] hover:bg-[#f5f0eb] transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollable px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#e8e4e0] bg-[#faf8f6]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
