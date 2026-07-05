import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Plus, Trash2, Edit3, Bot, Brain, BookOpen, Plug,
  ArrowLeft, Wand2, Check, X, Shield, LayoutGrid, Download, Upload, Globe,
  Zap, History, ChevronDown, ChevronUp, ImagePlus, FlaskConical, KeyRound,
} from 'lucide-react';
import { cn } from './ui/cn';
import { api } from './api/client';
import { Button, Input, Textarea, Select, Badge, Card, Modal } from './ui/primitives';
import AgentAvatar from './ui/AgentAvatar';
import DistillAgentModal from './agents/DistillAgentModal';
import DistillRecordsPanel from './agents/DistillRecordsPanel';
import DistillRecordPickerModal from './agents/DistillRecordPickerModal';

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
  post_actions: '[]',
  env_vars: '{}',
};

export default function AgentFactoryPage({ onBack }) {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDistill, setShowDistill] = useState(false);
  const [showDistillRecords, setShowDistillRecords] = useState(false);
  const [showDistillPick, setShowDistillPick] = useState(false);
  const [redistillRecord, setRedistillRecord] = useState(null);

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
    const { _pendingPersonality, _importKbFiles, _distillSkillName, ...agentPayload } = form;
    const result = await api.saveAgent(agentPayload);
    const agentId = result?.id ?? agentPayload.id;
    if (agentId && _pendingPersonality) {
      try {
        await api.saveAgentPersonality(agentId, _pendingPersonality);
      } catch { /* 人格可选 */ }
    }
    if (agentId && _importKbFiles?.length) {
      const kbIds = parseList(agentPayload.knowledge_ids);
      for (const file of _importKbFiles) {
        try {
          const item = await api.uploadKnowledgeFile(file);
          if (item?.id) kbIds.push(item.id);
        } catch { /* 单文件失败不阻断 */ }
      }
      if (kbIds.length) {
        await api.saveAgent({ ...agentPayload, id: agentId, knowledge_ids: JSON.stringify([...new Set(kbIds)]) });
      }
    }
    if (agentId && _distillSkillName && !parseList(agentPayload.skill_ids).length) {
      try {
        const skills = await api.listSkills();
        const sk = (skills || []).find((s) => s.name === _distillSkillName);
        if (sk?.id) {
          await api.saveAgent({
            ...agentPayload,
            id: agentId,
            skill_ids: JSON.stringify([sk.id]),
          });
        }
      } catch { /* optional */ }
    }
    setEditing(null);
    refresh();
  };

  const handleDistillApply = (result) => {
    setShowDistill(false);
    setRedistillRecord(null);
    setEditing({
      ...EMPTY,
      name: result.name || '',
      avatar: result.avatar || '✦',
      description: result.description || '',
      system_prompt: result.system_prompt || '',
      _pendingPersonality: result.personality,
      _importKbFiles: result._importKbFiles,
      _distillSkillName: result.skill_name,
    });
  };

  const handleImportFromRecord = (result) => {
    setShowDistillPick(false);
    setEditing({
      ...EMPTY,
      name: result.name || '',
      avatar: result.avatar || '✦',
      description: result.description || '',
      system_prompt: result.system_prompt || '',
      _pendingPersonality: result.personality,
    });
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
          <Button variant="outline" onClick={() => setShowDistillRecords(true)}><History size={14} /> 蒸馏记录</Button>
          <Button variant="outline" onClick={() => { setRedistillRecord(null); setShowDistill(true); }}><FlaskConical size={14} /> 人格蒸馏</Button>
          <Button variant="outline" onClick={importAgent}><Upload size={14} /> 导入</Button>
          <Button onClick={() => setEditing({ ...EMPTY })}><Plus size={16} />新建智能体</Button>
        </div>
      </div>

      <TemplateMarket open={showTemplates} onClose={() => setShowTemplates(false)} onCreate={createFromTemplate} />
      <DistillAgentModal
        open={showDistill}
        onClose={() => { setShowDistill(false); setRedistillRecord(null); }}
        onApply={handleDistillApply}
        initialRedistill={redistillRecord}
      />
      <DistillRecordsPanel
        open={showDistillRecords}
        onClose={() => setShowDistillRecords(false)}
        onRedistill={(rec) => {
          setShowDistillRecords(false);
          setRedistillRecord(rec);
          setShowDistill(true);
        }}
        onApplyToAgent={(data) => {
          setShowDistillRecords(false);
          handleImportFromRecord(data);
        }}
      />
      <DistillRecordPickerModal
        open={showDistillPick}
        onClose={() => setShowDistillPick(false)}
        onSelect={handleImportFromRecord}
      />

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
                <AgentAvatar avatar={a.avatar} name={a.name} size={48} />
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
        onPickDistillRecord={() => setShowDistillPick(true)}
      />
    </div>
  );
}

function parseList(s) {
  try { return JSON.parse(s || '[]'); } catch { return []; }
}

function AgentEditor({ open, value, onClose, onSave, onPickDistillRecord }) {
  const [form, setForm] = useState(value || EMPTY);
  const [step, setStep] = useState(0);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);
  const [profiles, setProfiles] = useState([]);
  const [skills, setSkills] = useState([]);
  const [mcps, setMcps] = useState([]);
  const [knowledge, setKnowledge] = useState([]);

  useEffect(() => {
    if (value) {
      setForm({
        ...EMPTY,
        ...value,
        system_prompt: value.system_prompt ?? '',
        description: value.description ?? '',
        avatar: value.avatar || '✦',
        skill_ids: value.skill_ids || '[]',
        mcp_server_ids: value.mcp_server_ids || '[]',
        knowledge_ids: value.knowledge_ids || '[]',
        temperature: value.temperature ?? 0,
        max_tokens: value.max_tokens ?? 0,
        post_actions: value.post_actions || '[]',
        env_vars: value.env_vars || '{}',
      });
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
    { label: '对外', icon: Globe },
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
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => onPickDistillRecord?.()}
              >
                <FlaskConical size={14} /> 从蒸馏记录导入人物特征
              </Button>
              <Field label="头像">
                <div className="flex items-center gap-3 mb-2">
                  <AgentAvatar avatar={form.avatar} name={form.name} size={56} />
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {avatarUploading ? '上传中…' : <><ImagePlus size={14} /> 上传图片</>}
                    </Button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setAvatarUploading(true);
                        try {
                          const { url } = await api.uploadAgentAvatar(file);
                          set('avatar', url);
                        } catch (err) {
                          alert(err.message || '上传失败');
                        } finally {
                          setAvatarUploading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    <span className="text-[10px] text-[color:var(--text-faint)]">或选择 emoji</span>
                  </div>
                </div>
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
                  <AgentAvatar avatar={form.avatar} name={form.name} size={48} />
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
              {form.id > 0 && (
                <div className="mt-4">
                  <EvolutionToggle agentId={form.id} />
                </div>
              )}
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
            {/* 运行时环境变量 */}
            <EnvVarsEditor envVars={form.env_vars} onChange={(v) => set('env_vars', v)} />

            {form.id > 0 && <PersonalityEditor agentId={form.id} />}
            {!form.id && (
              <div className="text-[11px] text-[color:var(--text-faint)] p-2 rounded bg-[color:var(--bg-soft)]">
                提示：保存智能体后可在编辑界面配置"群聊人格"（发言概率、兴趣、安静时段等）。
              </div>
            )}
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

        {/* Step 3: 对外设置（Nexus） */}
        {step === 3 && (
          <NexusConfigStep agentId={form.id} />
        )}

        {/* Step 4: 预览 */}
        {step === 4 && (
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

function ChipInput({ value, onChange, placeholder }) {
  const arr = (() => { try { const a = JSON.parse(value || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } })();
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (arr.includes(v)) { setInput(''); return; }
    onChange(JSON.stringify([...arr, v]));
    setInput('');
  };
  const remove = (i) => {
    const next = [...arr];
    next.splice(i, 1);
    onChange(JSON.stringify(next));
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {arr.map((tag, i) => (
          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)] inline-flex items-center gap-1">
            {tag}
            <button onClick={() => remove(i)} className="hover:opacity-70">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <Input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder} />
        <Button size="sm" variant="outline" onClick={add}><Plus size={12} /> 添加</Button>
      </div>
    </div>
  );
}

function EnvVarsEditor({ envVars, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(() => {
    try { return JSON.parse(envVars || '{}'); } catch { return {}; }
  }, [envVars]);
  const entries = Object.entries(parsed);

  const update = (newMap) => onChange(JSON.stringify(newMap));

  const addEntry = () => {
    const newMap = { ...parsed, '': '' };
    update(newMap);
    setExpanded(true);
  };

  const removeEntry = (key) => {
    const newMap = { ...parsed };
    delete newMap[key];
    update(newMap);
  };

  const changeKey = (oldKey, newKey) => {
    const newMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      newMap[k === oldKey ? newKey : k] = v;
    }
    update(newMap);
  };

  const changeValue = (key, newVal) => {
    update({ ...parsed, [key]: newVal });
  };

  return (
    <div className="border border-[color:var(--line)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-[color:var(--text)] hover:bg-[color:var(--bg-soft)] transition-colors"
      >
        <KeyRound size={14} className="text-[color:var(--accent)]" />
        <span>运行时环境变量</span>
        {entries.length > 0 && <Badge tone="default" className="ml-1">{entries.length}</Badge>}
        <span className="flex-1" />
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-[color:var(--text-faint)]">
            Agent 执行技能/工具时自动注入这些环境变量（如 API Token、密钥等）
          </p>
          {entries.map(([key, value], i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                className="flex-1 font-mono text-xs"
                placeholder="变量名 (如 OMNIBUS_ACCESS_TOKEN)"
                value={key}
                onChange={(e) => changeKey(key, e.target.value)}
              />
              <Input
                className="flex-[2] font-mono text-xs"
                placeholder="值"
                value={value}
                type="password"
                onChange={(e) => changeValue(key, e.target.value)}
              />
              <button type="button" onClick={() => removeEntry(key)}
                className="p-1 text-[color:var(--text-faint)] hover:text-red-500">
                <X size={14} />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={addEntry}>
            <Plus size={12} /> 添加环境变量
          </Button>
        </div>
      )}
    </div>
  );
}

function PersonalityEditor({ agentId }) {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [p, setP] = useState({
    tags: '[]', interests: '[]',
    speak_probability: 35, min_delay_ms: 1500, max_delay_ms: 5000,
    emoji_freq: 'medium', quiet_start: '', quiet_end: '',
    typo_rate: 1, echo_rate: 2, ghost_minutes: 0,
    cold_start_eligible: true, style_hint: '',
  });

  useEffect(() => {
    if (!agentId || loaded) return;
    api.getAgentPersonality(agentId).then((d) => {
      if (d) setP({ ...p, ...d });
      setLoaded(true);
    }).catch(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const set = (k, v) => setP((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.saveAgentPersonality(agentId, p);
    } catch (e) {
      alert(e?.message || '保存失败');
    }
    setSaving(false);
  };

  return (
    <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-soft)]/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium"
      >
        <span className="inline-flex items-center gap-1.5">
          <Brain size={13} className="text-[color:var(--accent)]" />
          群聊人格（决定 Agent 在群里的发言行为）
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="性格标签">
              <ChipInput value={p.tags} onChange={(v) => set('tags', v)} placeholder="例：佛系、捧场王" />
            </Field>
            <Field label="兴趣领域（命中关键词会更想发言）">
              <ChipInput value={p.interests} onChange={(v) => set('interests', v)} placeholder="例：前端、咖啡" />
            </Field>
          </div>
          <Field label={`基础发言概率：${p.speak_probability}%（被 @ 或感兴趣时会自动加分）`}>
            <input
              type="range" min={0} max={100} step={5}
              value={p.speak_probability}
              onChange={(e) => set('speak_probability', parseInt(e.target.value))}
              className="w-full accent-[color:var(--accent)]"
            />
            <div className="flex justify-between text-[10px] text-[color:var(--text-faint)]">
              <span>潜水党</span><span>话痨</span>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`最小思考延迟: ${p.min_delay_ms} ms`}>
              <Input type="number" min={0} step={100} value={p.min_delay_ms}
                onChange={(e) => set('min_delay_ms', Math.max(0, parseInt(e.target.value) || 0))} />
            </Field>
            <Field label={`最大思考延迟: ${p.max_delay_ms} ms`}>
              <Input type="number" min={0} step={100} value={p.max_delay_ms}
                onChange={(e) => set('max_delay_ms', Math.max(0, parseInt(e.target.value) || 0))} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="安静时段开始（HH:MM）">
              <Input value={p.quiet_start || ''} onChange={(e) => set('quiet_start', e.target.value)} placeholder="23:00" />
            </Field>
            <Field label="安静时段结束（HH:MM）">
              <Input value={p.quiet_end || ''} onChange={(e) => set('quiet_end', e.target.value)} placeholder="07:00" />
            </Field>
            <Field label="表情使用频率">
              <Select value={p.emoji_freq} onChange={(e) => set('emoji_freq', e.target.value)}>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={`错别字率 ${p.typo_rate}%`}>
              <Input type="number" min={0} max={20} value={p.typo_rate}
                onChange={(e) => set('typo_rate', Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))} />
            </Field>
            <Field label={`复读率 ${p.echo_rate}%`}>
              <Input type="number" min={0} max={20} value={p.echo_rate}
                onChange={(e) => set('echo_rate', Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))} />
            </Field>
            <Field label="被怼后冷静（分钟）">
              <Input type="number" min={0} max={120} value={p.ghost_minutes}
                onChange={(e) => set('ghost_minutes', Math.max(0, parseInt(e.target.value) || 0))} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm p-2 rounded-md bg-[color:var(--bg-soft)]">
            <input type="checkbox" checked={!!p.cold_start_eligible}
              onChange={(e) => set('cold_start_eligible', e.target.checked)} />
            <span>允许"冷场救场"（5 分钟无人说话时自动冒泡）</span>
          </label>
          <Field label="额外说话风格提示（可选）">
            <Textarea
              className="min-h-[60px]"
              value={p.style_hint || ''}
              maxLength={300}
              onChange={(e) => set('style_hint', e.target.value)}
              placeholder="例：经常用东北话；说话喜欢带「老铁」；对加班话题有强烈共鸣…"
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? '保存中…' : '保存人格'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NexusConfigStep({ agentId }) {
  const [config, setConfig] = useState({
    public: false,
    public_name: '',
    capability_tags: '[]',
    auth_level: 'readonly',
    forbidden_info: '',
    public_knowledge_ids: '[]',
  });
  const [tagInput, setTagInput] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (agentId > 0 && !loaded) {
      api.getAgentNexusConfig(agentId).then((d) => {
        setConfig(d);
        setLoaded(true);
      }).catch(() => setLoaded(true));
    }
  }, [agentId, loaded]);

  const tags = (() => { try { return JSON.parse(config.capability_tags); } catch { return []; } })();

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      const newTags = [...tags, t];
      setConfig({ ...config, capability_tags: JSON.stringify(newTags) });
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    const newTags = tags.filter(t => t !== tag);
    setConfig({ ...config, capability_tags: JSON.stringify(newTags) });
  };

  const save = () => {
    if (agentId > 0) {
      api.updateAgentNexusConfig(agentId, config).catch(() => {});
    }
  };

  useEffect(() => {
    if (loaded && agentId > 0) save();
  }, [config]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[color:var(--text-faint)]">
        配置此 Agent 在局域网内的对外可见性和权限。{!agentId && '保存智能体后即可生效。'}
      </p>

      <label className="flex items-center gap-3 p-3 rounded-lg bg-[color:var(--bg-soft)]">
        <input
          type="checkbox"
          checked={config.public}
          onChange={(e) => setConfig({ ...config, public: e.target.checked })}
        />
        <div>
          <span className="text-sm text-[color:var(--text)]">对外公开</span>
          <div className="text-[10px] text-[color:var(--text-faint)]">开启后，已建联的其他灵犀实例可发现并与此 Agent 对话</div>
        </div>
      </label>

      {config.public && (
        <>
          <Field label="对外名称（可与内部名称不同）">
            <Input
              value={config.public_name}
              onChange={(e) => setConfig({ ...config, public_name: e.target.value })}
              placeholder="留空则使用 Agent 名称"
            />
          </Field>

          <Field label="能力标签">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} tone="accent" className="cursor-pointer" onClick={() => removeTag(tag)}>
                  {tag} <X size={10} />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="输入标签后回车"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                className="flex-1"
              />
              <Button variant="ghost" size="sm" onClick={addTag}>添加</Button>
            </div>
          </Field>

          <Field label="授权级别">
            <Select
              value={config.auth_level}
              onChange={(e) => setConfig({ ...config, auth_level: e.target.value })}
            >
              <option value="readonly">只读（仅提供咨询）</option>
              <option value="suggest">可建议</option>
              <option value="commit">可承诺（限预设规则内）</option>
              <option value="full">完全授权</option>
            </Select>
          </Field>

          <Field label="禁止透露的信息">
            <Textarea
              value={config.forbidden_info}
              onChange={(e) => setConfig({ ...config, forbidden_info: e.target.value })}
              placeholder="如：不要透露客户姓名和公司名..."
              rows={2}
            />
          </Field>
        </>
      )}
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

function EvolutionToggle({ agentId }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    api.getEvolutionConfig(agentId).then((r) => {
      setEnabled(r.enabled);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agentId]);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await api.setEvolutionConfig(agentId, next).catch(() => setEnabled(!next));
  };

  if (loading) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[color:var(--text-soft)]">
          <Zap size={13} className="text-[color:var(--accent)]" />
          <span>自我进化</span>
        </div>
        <button
          onClick={toggle}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors',
            enabled ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--line)]'
          )}
        >
          <div className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          )} />
        </button>
      </div>
      <div className="text-[11px] text-[color:var(--text-faint)]">
        开启后，负面反馈或用户纠正会自动分析并写入记忆/知识库
      </div>
      {enabled && (
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1 text-[11px] text-[color:var(--accent)] hover:underline"
        >
          <History size={11} />
          进化日志
          {showLogs ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      )}
      {showLogs && <EvolutionLogViewer agentId={agentId} />}
    </div>
  );
}

function EvolutionLogViewer({ agentId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listEvolutionLogs(agentId, 20).then((r) => {
      setLogs(Array.isArray(r) ? r : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agentId]);

  const clearAll = async () => {
    await api.clearEvolutionLogs(agentId);
    setLogs([]);
  };

  const deleteOne = async (id) => {
    await api.deleteEvolutionLog(id);
    setLogs(logs.filter(l => l.id !== id));
  };

  if (loading) return <div className="text-[11px] text-[color:var(--text-faint)] py-2">加载中…</div>;
  if (logs.length === 0) return <div className="text-[11px] text-[color:var(--text-faint)] py-2">暂无进化记录</div>;

  return (
    <div className="space-y-1.5 max-h-[200px] overflow-y-auto scrollable">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-[color:var(--text-faint)]">{logs.length} 条记录</span>
        <button onClick={clearAll} className="text-[10px] text-danger hover:underline">清空</button>
      </div>
      {logs.map((log) => (
        <div key={log.id} className="surface px-3 py-2 text-[11px] flex justify-between items-start gap-2 group">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Badge tone={log.action === 'create_memory' ? 'accent' : 'success'} className="text-[9px]">
                {log.action === 'create_memory' ? '记忆' : '知识'}
              </Badge>
              <Badge tone="default" className="text-[9px]">{log.trigger}</Badge>
              <span className="text-[color:var(--text-faint)]">{new Date(log.created_at).toLocaleString()}</span>
            </div>
            <div className="text-[color:var(--text-soft)] truncate">{log.summary}</div>
          </div>
          <button onClick={() => deleteOne(log.id)} className="text-[color:var(--text-faint)] hover:text-danger opacity-0 group-hover:opacity-100 transition shrink-0">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
