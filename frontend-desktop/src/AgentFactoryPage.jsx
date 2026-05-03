import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Plus, Trash2, Edit3, Bot, Brain, BookOpen, Plug,
  ArrowLeft, Wand2, Check, X, Shield, LayoutGrid, Download, Upload,
} from 'lucide-react';
import { cn } from './ui/cn';
import { api } from './api/client';
import { Button, Input, Textarea, Select, Badge, Card, Modal } from './ui/primitives';

const PROMPT_TEMPLATES = [
  { name: '销售助理', prompt: '你是经验丰富的销售助理，擅长撰写产品话术、客户跟进策略、商务邮件。语气专业、温暖、富有亲和力。' },
  { name: '代码审查员', prompt: '你是资深工程师，擅长代码审查、性能优化、最佳实践。指出问题时简洁、精确，并给出可执行的修改建议。' },
  { name: '产品经理', prompt: '你是产品经理，擅长用户研究、需求拆解、PRD 撰写。回答简洁有条理，关注用户价值与可行性。' },
  { name: '内容创作者', prompt: '你是内容创作者，擅长撰写公众号、小红书、视频脚本。语言生动、有感染力，关注流量与用户共鸣。' },
];

const TEMPLATE_MARKET = [
  {
    category: '商业办公',
    icon: '💼',
    items: [
      { name: '销售助理', avatar: '🎯', desc: '产品话术、客户跟进、商务邮件', prompt: '你是经验丰富的销售助理，擅长撰写产品话术、客户跟进策略、商务邮件。语气专业、温暖、富有亲和力。' },
      { name: '商业分析师', avatar: '📊', desc: '数据分析、市场研究、竞品对比', prompt: '你是资深商业分析师，擅长数据分析、市场趋势研究、竞品对比、战略建议。回答要有数据支撑、逻辑清晰、可操作性强。' },
      { name: '人力资源', avatar: '🤝', desc: 'JD 撰写、面试问题、员工管理', prompt: '你是人力资源专家，擅长撰写岗位描述、设计面试问题、提供员工管理建议。语气专业、注重合规、关注团队文化。' },
      { name: '法务顾问', avatar: '⚖️', desc: '合同审阅、法律风险、条款建议', prompt: '你是企业法务顾问，擅长合同条款审阅、法律风险分析、合规建议。回答严谨专业、注意免责声明。' },
    ],
  },
  {
    category: '技术开发',
    icon: '💻',
    items: [
      { name: '代码审查员', avatar: '🔍', desc: '代码审查、性能优化、最佳实践', prompt: '你是资深工程师，擅长代码审查、性能优化、最佳实践。指出问题时简洁、精确，并给出可执行的修改建议。' },
      { name: '架构师', avatar: '🏗️', desc: '系统设计、技术选型、可扩展方案', prompt: '你是高级系统架构师，擅长分布式系统设计、技术选型评估、性能瓶颈分析。回答要兼顾当下可行性与长远演进。' },
      { name: 'DevOps 专家', avatar: '🔧', desc: 'CI/CD、Docker、K8s、监控', prompt: '你是 DevOps 专家，精通 Docker、Kubernetes、CI/CD 流水线、监控告警。提供可直接执行的命令和配置。' },
      { name: '安全工程师', avatar: '🛡️', desc: '漏洞分析、安全审计、加固方案', prompt: '你是信息安全工程师，擅长漏洞分析、渗透测试方法论、安全加固方案。回答注重实操、提供修复优先级建议。' },
      { name: 'DBA', avatar: '🗃️', desc: 'SQL 优化、数据库设计、故障排查', prompt: '你是资深 DBA，精通 MySQL、PostgreSQL、Redis。擅长慢查询优化、索引设计、数据库架构设计与故障排查。' },
    ],
  },
  {
    category: '内容创意',
    icon: '🎨',
    items: [
      { name: '内容创作者', avatar: '✍️', desc: '公众号、小红书、视频脚本', prompt: '你是内容创作者，擅长撰写公众号、小红书、视频脚本。语言生动、有感染力，关注流量与用户共鸣。' },
      { name: '文案策划', avatar: '📝', desc: '品牌文案、广告语、营销策划', prompt: '你是创意文案策划，擅长品牌命名、广告语创作、营销活动策划。文风灵活多变，能根据品牌调性切换风格。' },
      { name: '翻译专家', avatar: '🌐', desc: '中英互译、本地化、技术文档', prompt: '你是专业翻译，擅长中英互译。翻译时注重信达雅，保留原文语气与风格。技术术语要准确，商业文案要地道。' },
      { name: '学术论文助手', avatar: '🎓', desc: '论文润色、文献综述、方法论', prompt: '你是学术写作助手，擅长论文润色、文献综述撰写、研究方法论建议。遵循学术规范、引用格式正确、逻辑严密。' },
    ],
  },
  {
    category: '生活效率',
    icon: '🚀',
    items: [
      { name: '产品经理', avatar: '📋', desc: '需求拆解、PRD 撰写、用户研究', prompt: '你是产品经理，擅长用户研究、需求拆解、PRD 撰写。回答简洁有条理，关注用户价值与可行性。' },
      { name: '健身教练', avatar: '💪', desc: '训练计划、饮食建议、运动科学', prompt: '你是专业健身教练，擅长制定个性化训练计划、营养饮食建议。回答基于运动科学，安全第一。' },
      { name: '理财顾问', avatar: '💰', desc: '投资分析、理财规划、风险评估', prompt: '你是理财规划师，擅长个人财务规划、投资组合建议、风险评估。回答客观中立，强调风险提示，不提供具体投资标的建议。' },
      { name: '旅行规划师', avatar: '✈️', desc: '行程规划、签证攻略、当地推荐', prompt: '你是旅行规划师，擅长制定旅行行程、预算规划、当地美食与景点推荐。根据用户偏好和预算给出个性化方案。' },
    ],
  },
];

const EMOJIS = ['✦', '🤖', '🎯', '🧠', '💼', '🚀', '🎨', '📊', '🔬', '⚡', '🌟', '🦾', '🔥', '💡', '🎓', '🛡️', '🗃️', '🌐', '✍️', '📋', '💪', '💰', '✈️', '⚖️', '🤝', '📝'];

const EMPTY = {
  id: 0,
  name: '',
  avatar: '✦',
  description: '',
  system_prompt: '',
  profile_id: 0,
  skill_ids: '[]',
  mcp_server_ids: '[]',
  knowledge_ids: '[]',
  allow_all: true,
  temperature: 0,
  max_tokens: 0,
};

export default function AgentFactoryPage({ onBack }) {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const refresh = async () => {
    const data = await api.listAgents();
    setList(data || []);
  };
  useEffect(() => { refresh(); }, []);

  const onDelete = async (a) => {
    if (a.builtin) return;
    if (!confirm(`删除智能体「${a.name}」？`)) return;
    await api.deleteAgent(a.id);
    refresh();
  };

  const onSave = async (form) => {
    await api.saveAgent(form);
    setEditing(null);
    refresh();
  };

  const createFromTemplate = (tpl) => {
    setShowTemplates(false);
    setEditing({
      ...EMPTY,
      name: tpl.name,
      avatar: tpl.avatar || '✦',
      description: tpl.desc || '',
      system_prompt: tpl.prompt,
    });
  };

  const exportAgent = (agent) => {
    const exportData = {
      _type: 'lingxi-agent-export',
      _version: 1,
      name: agent.name,
      avatar: agent.avatar,
      description: agent.description,
      system_prompt: agent.system_prompt,
      allow_all: agent.allow_all,
      skill_ids: agent.skill_ids,
      mcp_server_ids: agent.mcp_server_ids,
      knowledge_ids: agent.knowledge_ids,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent.name.replace(/[/\\?%*:|"<>]/g, '-')}.agent.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAgent = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data._type !== 'lingxi-agent-export') { alert('文件格式不正确'); return; }
        setEditing({
          ...EMPTY,
          name: data.name || '',
          avatar: data.avatar || '✦',
          description: data.description || '',
          system_prompt: data.system_prompt || '',
          allow_all: data.allow_all ?? true,
          skill_ids: data.skill_ids || '[]',
          mcp_server_ids: data.mcp_server_ids || '[]',
          knowledge_ids: data.knowledge_ids || '[]',
        });
      } catch { alert('文件解析失败'); }
    };
    input.click();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl mb-6 p-6 surface-grad">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-gradient-to-br from-[color:var(--accent)]/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft size={16} /></Button>
          )}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow">
            <Sparkles size={26} />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold tracking-tight text-gradient">智能体工厂</div>
            <div className="text-sm text-[color:var(--text-soft)]">
              定制专属智能体：角色 · 技能 · MCP · 知识库 · 模型，一站配置，精准落地。
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowTemplates(true)}><LayoutGrid size={14} /> 模板市场</Button>
          <Button variant="outline" onClick={importAgent}><Upload size={14} /> 导入</Button>
          <Button onClick={() => setEditing({ ...EMPTY })}><Plus size={16} />新建智能体</Button>
        </div>
      </div>

      <TemplateMarket open={showTemplates} onClose={() => setShowTemplates(false)} onCreate={createFromTemplate} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {list.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="surface p-5 hover:shadow-glow transition-all hover:-translate-y-0.5 group"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent text-[color:var(--accent)] flex items-center justify-center text-xl shrink-0 ring-1 ring-[color:var(--accent-soft)]">
                  {a.avatar || '✦'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="font-semibold truncate">{a.name}</div>
                    {a.builtin && <Badge tone="info"><Shield size={10} />内置</Badge>}
                  </div>
                  <div className="text-xs text-[color:var(--text-faint)] line-clamp-2">
                    {a.description || '（无简介）'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3 text-[11px]">
                <Badge tone="accent"><Brain size={10} />技能 {a.allow_all ? '全部' : (parseList(a.skill_ids).length)}</Badge>
                <Badge tone="success"><Plug size={10} />MCP {a.allow_all ? '全部' : (parseList(a.mcp_server_ids).length)}</Badge>
                <Badge tone="warn"><BookOpen size={10} />知识 {a.allow_all ? '全部' : (parseList(a.knowledge_ids).length)}</Badge>
              </div>
              <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ ...a })}>
                  <Edit3 size={14} />编辑
                </Button>
                <Button size="sm" variant="ghost" onClick={() => exportAgent(a)} title="导出配置">
                  <Download size={14} />
                </Button>
                {!a.builtin && (
                  <Button size="sm" variant="ghost" onClick={() => onDelete(a)}>
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AgentEditor
        open={!!editing}
        value={editing}
        onClose={() => setEditing(null)}
        onSave={onSave}
      />
    </div>
  );
}

function parseList(s) {
  try { return JSON.parse(s || '[]'); } catch { return []; }
}

function AgentEditor({ open, value, onClose, onSave }) {
  const [form, setForm] = useState(value || EMPTY);
  const [step, setStep] = useState(0);
  const [profiles, setProfiles] = useState([]);
  const [skills, setSkills] = useState([]);
  const [mcps, setMcps] = useState([]);
  const [knowledge, setKnowledge] = useState([]);

  useEffect(() => {
    if (value) {
      setForm({ ...EMPTY, ...value });
      setStep(0);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.listProfiles().catch(() => []),
      api.listSkills().catch(() => []),
      api.listMCP().catch(() => []),
      api.listKnowledge().catch(() => []),
    ]).then(([p, s, m, k]) => {
      setProfiles(p || []);
      setSkills(s || []);
      setMcps(m || []);
      setKnowledge(k || []);
    });
  }, [open]);

  const skillIds = useMemo(() => parseList(form.skill_ids), [form.skill_ids]);
  const mcpIds = useMemo(() => parseList(form.mcp_server_ids), [form.mcp_server_ids]);
  const kbIds = useMemo(() => parseList(form.knowledge_ids), [form.knowledge_ids]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleId = (key, list, id) => {
    const arr = parseList(list);
    const idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(id);
    set(key, JSON.stringify(arr));
  };

  const STEPS = [
    { label: '身份', icon: Bot },
    { label: '角色', icon: Brain },
    { label: '能力', icon: Plug },
    { label: '预览', icon: Check },
  ];

  const canNext = step === 0 ? form.name.trim() : true;
  const isLast = step === STEPS.length - 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.id ? `编辑智能体` : '创建智能体'}
      width={820}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" onClick={onClose}><X size={14} /> 取消</Button>
          <div className="flex gap-2">
            {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> 上一步</Button>}
            {isLast ? (
              <Button onClick={() => onSave(form)} disabled={!form.name}><Check size={14} /> 保存</Button>
            ) : (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>下一步</Button>
            )}
          </div>
        </div>
      }
    >
      {/* 步骤条 */}
      <div className="flex items-center gap-1 mb-6 px-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <div key={i} className="flex items-center flex-1">
              <button onClick={() => setStep(i)} className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all w-full',
                active ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] font-medium shadow-soft' :
                done ? 'text-[color:var(--accent)] opacity-70' : 'text-[color:var(--text-faint)]'
              )}>
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs transition',
                  active ? 'bg-[color:var(--accent)] text-white' :
                  done ? 'bg-[color:var(--accent)]/20 text-[color:var(--accent)]' : 'bg-[color:var(--bg-soft)]'
                )}>
                  {done ? <Check size={12} /> : <Icon size={14} />}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={cn('h-px flex-1 mx-1', done ? 'bg-[color:var(--accent)]/40' : 'bg-[color:var(--line)]')} />}
            </div>
          );
        })}
      </div>

      <div className="min-h-[380px]">
        {/* Step 0: 身份 */}
        {step === 0 && (
          <div className="grid grid-cols-[1fr_220px] gap-6">
            <div className="space-y-4">
              <Field label="头像">
                <div className="flex flex-wrap gap-1.5">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => set('avatar', e)} className={cn(
                      'w-9 h-9 rounded-xl text-base flex items-center justify-center transition',
                      form.avatar === e ? 'bg-[color:var(--accent-soft)] ring-2 ring-[color:var(--accent)] scale-110' : 'bg-[color:var(--bg-soft)] hover:bg-[color:var(--bg-elev)]'
                    )}>{e}</button>
                  ))}
                </div>
              </Field>
              <Field label="名称 *">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例如：产品经理小灵" />
                <div className="text-[11px] text-[color:var(--text-faint)] mt-1 text-right">{form.name.length}/30</div>
              </Field>
              <Field label="简介">
                <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="一句话介绍能力与定位" className="min-h-[80px]" />
              </Field>
            </div>
            {/* 实时预览卡片 */}
            <div>
              <div className="text-xs text-[color:var(--text-faint)] mb-2">预览</div>
              <div className="surface p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent text-[color:var(--accent)] flex items-center justify-center text-xl ring-1 ring-[color:var(--accent-soft)]">
                    {form.avatar || '✦'}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{form.name || '未命名'}</div>
                    <div className="text-xs text-[color:var(--text-faint)] line-clamp-2">{form.description || '暂无简介'}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <Badge tone="accent"><Brain size={9} /> 技能 {form.allow_all ? '全部' : skillIds.length}</Badge>
                  <Badge tone="success"><Plug size={9} /> MCP {form.allow_all ? '全部' : mcpIds.length}</Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: 角色 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 mb-1">
              <span className="text-xs text-[color:var(--text-soft)] mr-2 mt-1">快速填入模板：</span>
              {PROMPT_TEMPLATES.map((t) => (
                <Button key={t.name} size="sm" variant="outline" onClick={() => set('system_prompt', t.prompt)}>
                  <Wand2 size={12} />{t.name}
                </Button>
              ))}
            </div>
            <Textarea
              className="min-h-[200px] font-mono text-[13px]"
              value={form.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
              placeholder="详细描述角色、性格、专业领域、回答风格、约束规则…"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label={`温度 (Temperature): ${form.temperature || '默认'}`}>
                <input type="range" min="0" max="1" step="0.05" value={form.temperature || 0}
                  onChange={(e) => set('temperature', parseFloat(e.target.value))}
                  className="w-full accent-[color:var(--accent)]" />
                <div className="flex justify-between text-[10px] text-[color:var(--text-faint)]">
                  <span>精确</span><span>创意</span>
                </div>
              </Field>
              <Field label={`最大输出 Token: ${form.max_tokens || '默认'}`}>
                <input type="range" min="0" max="128000" step="1000" value={form.max_tokens || 0}
                  onChange={(e) => set('max_tokens', parseInt(e.target.value))}
                  className="w-full accent-[color:var(--accent)]" />
                <div className="flex justify-between text-[10px] text-[color:var(--text-faint)]">
                  <span>默认</span><span>128K</span>
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* Step 2: 能力 */}
        {step === 2 && (
          <div className="space-y-4">
            <Field label="接入点（不选则跟随全局）">
              <Select value={form.profile_id} onChange={(e) => set('profile_id', Number(e.target.value))}>
                <option value={0}>跟随全局激活档案</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.model} ({p.provider_protocol})</option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm p-3 rounded-lg bg-[color:var(--bg-soft)]">
              <input type="checkbox" checked={!!form.allow_all} onChange={(e) => set('allow_all', e.target.checked)} />
              <span>允许使用全部技能 / MCP / 知识库</span>
            </label>
            {!form.allow_all && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs font-medium text-[color:var(--text-soft)] mb-2">技能 ({skillIds.length})</div>
                  <div className="space-y-1 max-h-[200px] overflow-auto pr-1">
                    {skills.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--bg-soft)] text-sm cursor-pointer">
                        <input type="checkbox" checked={skillIds.includes(s.id)} onChange={() => toggleId('skill_ids', form.skill_ids, s.id)} />
                        <span className="truncate">{s.name}</span>
                      </label>
                    ))}
                    {skills.length === 0 && <div className="text-xs text-[color:var(--text-faint)] py-4 text-center">暂无</div>}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-[color:var(--text-soft)] mb-2">MCP ({mcpIds.length})</div>
                  <div className="space-y-1 max-h-[200px] overflow-auto pr-1">
                    {mcps.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--bg-soft)] text-sm cursor-pointer">
                        <input type="checkbox" checked={mcpIds.includes(m.id)} onChange={() => toggleId('mcp_server_ids', form.mcp_server_ids, m.id)} />
                        <span className="truncate">{m.name}</span>
                      </label>
                    ))}
                    {mcps.length === 0 && <div className="text-xs text-[color:var(--text-faint)] py-4 text-center">暂无</div>}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-[color:var(--text-soft)] mb-2">知识库 ({kbIds.length})</div>
                  <div className="space-y-1 max-h-[200px] overflow-auto pr-1">
                    {knowledge.map((k) => (
                      <label key={k.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--bg-soft)] text-sm cursor-pointer">
                        <input type="checkbox" checked={kbIds.includes(k.id)} onChange={() => toggleId('knowledge_ids', form.knowledge_ids, k.id)} />
                        <span className="truncate">{k.title || k.file_path?.split('/').pop()}</span>
                      </label>
                    ))}
                    {knowledge.length === 0 && <div className="text-xs text-[color:var(--text-faint)] py-4 text-center">暂无</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: 预览 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="surface p-5 flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent text-[color:var(--accent)] flex items-center justify-center text-2xl ring-1 ring-[color:var(--accent-soft)] shrink-0">
                {form.avatar || '✦'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold">{form.name || '未命名'}</div>
                <div className="text-sm text-[color:var(--text-soft)] mt-1">{form.description || '暂无简介'}</div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Badge tone="accent"><Brain size={10} /> 技能 {form.allow_all ? '全部' : skillIds.length}</Badge>
                  <Badge tone="success"><Plug size={10} /> MCP {form.allow_all ? '全部' : mcpIds.length}</Badge>
                  <Badge tone="warn"><BookOpen size={10} /> 知识 {form.allow_all ? '全部' : kbIds.length}</Badge>
                  {form.temperature > 0 && <Badge tone="default">温度 {form.temperature}</Badge>}
                  {form.max_tokens > 0 && <Badge tone="default">最大 {(form.max_tokens / 1000).toFixed(0)}K</Badge>}
                </div>
              </div>
            </div>
            {form.system_prompt && (
              <div>
                <div className="text-xs font-medium text-[color:var(--text-soft)] mb-2">角色设定预览</div>
                <div className="surface p-4 text-sm text-[color:var(--text-soft)] max-h-[200px] overflow-y-auto scrollable whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {form.system_prompt}
                </div>
              </div>
            )}
            <div className="text-center text-xs text-[color:var(--text-faint)] py-2">
              确认无误后点击「保存」完成{form.id ? '编辑' : '创建'}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs text-[color:var(--text-soft)] mb-1">{label}</div>
      {children}
    </div>
  );
}

function TemplateMarket({ open, onClose, onCreate }) {
  const [activeCategory, setActiveCategory] = useState(null);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="智能体模板市场" width={720}>
      <div className="space-y-5">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm transition border',
              !activeCategory ? 'bg-[color:var(--accent-soft)] border-[color:var(--accent)] text-[color:var(--accent)] font-medium' : 'border-[color:var(--line)] text-[color:var(--text-soft)] hover:bg-[color:var(--bg-soft)]'
            )}
          >全部</button>
          {TEMPLATE_MARKET.map(cat => (
            <button
              key={cat.category}
              onClick={() => setActiveCategory(cat.category)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition border',
                activeCategory === cat.category ? 'bg-[color:var(--accent-soft)] border-[color:var(--accent)] text-[color:var(--accent)] font-medium' : 'border-[color:var(--line)] text-[color:var(--text-soft)] hover:bg-[color:var(--bg-soft)]'
              )}
            >{cat.icon} {cat.category}</button>
          ))}
        </div>

        <div className="max-h-[420px] overflow-y-auto scrollable space-y-4">
          {TEMPLATE_MARKET
            .filter(cat => !activeCategory || cat.category === activeCategory)
            .map(cat => (
              <div key={cat.category}>
                <div className="text-xs font-medium text-[color:var(--text-faint)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <span>{cat.icon}</span> {cat.category}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cat.items.map(tpl => (
                    <button
                      key={tpl.name}
                      onClick={() => onCreate(tpl)}
                      className="surface p-3 text-left hover:shadow-glow hover:-translate-y-0.5 transition-all group"
                    >
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent flex items-center justify-center text-lg">
                          {tpl.avatar}
                        </span>
                        <div>
                          <div className="text-sm font-medium">{tpl.name}</div>
                          <div className="text-xs text-[color:var(--text-faint)]">{tpl.desc}</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-[color:var(--text-faint)] line-clamp-2 group-hover:text-[color:var(--text-soft)] transition">
                        {tpl.prompt.slice(0, 80)}…
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </Modal>
  );
}

