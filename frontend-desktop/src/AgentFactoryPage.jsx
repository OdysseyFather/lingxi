import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Plus, Trash2, Edit3, Bot, Brain, BookOpen, Plug,
  ArrowLeft, Wand2, Check, X, Shield,
} from 'lucide-react';
import { api } from './api/client';
import { Button, Input, Textarea, Select, Badge, Card, Modal } from './ui/primitives';

const PROMPT_TEMPLATES = [
  { name: '销售助理', prompt: '你是经验丰富的销售助理，擅长撰写产品话术、客户跟进策略、商务邮件。语气专业、温暖、富有亲和力。' },
  { name: '代码审查员', prompt: '你是资深工程师，擅长代码审查、性能优化、最佳实践。指出问题时简洁、精确，并给出可执行的修改建议。' },
  { name: '产品经理', prompt: '你是产品经理，擅长用户研究、需求拆解、PRD 撰写。回答简洁有条理，关注用户价值与可行性。' },
  { name: '内容创作者', prompt: '你是内容创作者，擅长撰写公众号、小红书、视频脚本。语言生动、有感染力，关注流量与用户共鸣。' },
];

const EMOJIS = ['✦', '🤖', '🎯', '🧠', '💼', '🚀', '🎨', '📊', '🔬', '⚡', '🌟', '🦾'];

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
};

export default function AgentFactoryPage({ onBack }) {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);

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

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero */}
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
          <Button onClick={() => setEditing({ ...EMPTY })}><Plus size={16} />新建智能体</Button>
        </div>
      </div>

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
  const [tab, setTab] = useState('basic');
  const [profiles, setProfiles] = useState([]);
  const [skills, setSkills] = useState([]);
  const [mcps, setMcps] = useState([]);
  const [knowledge, setKnowledge] = useState([]);

  useEffect(() => {
    if (value) {
      setForm({ ...EMPTY, ...value });
      setTab('basic');
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

  const TABS = [
    { id: 'basic', label: '基本信息' },
    { id: 'role', label: '角色设定' },
    { id: 'model', label: '模型' },
    { id: 'skills', label: `技能 (${skillIds.length})` },
    { id: 'mcp', label: `MCP (${mcpIds.length})` },
    { id: 'knowledge', label: `知识库 (${kbIds.length})` },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.id ? `编辑 - ${form.name || '智能体'}` : '新建智能体'}
      width={780}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}><X size={14} />取消</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name}>
            <Check size={14} />保存
          </Button>
        </>
      }
    >
      <div className="flex gap-1 mb-4 p-1 bg-[color:var(--bg-soft)] rounded-lg overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition ${
              tab === t.id
                ? 'bg-[color:var(--bg-elev)] shadow-soft text-[color:var(--accent)]'
                : 'text-[color:var(--text-soft)] hover:text-[color:var(--text)]'
            }`}
          >{t.label}</button>
        ))}
      </div>

      <div className="min-h-[320px]">
        {tab === 'basic' && (
          <div className="space-y-3">
            <Field label="头像">
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => set('avatar', e)}
                    className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition ${
                      form.avatar === e
                        ? 'bg-[color:var(--accent-soft)] ring-2 ring-[color:var(--accent)]'
                        : 'bg-[color:var(--bg-soft)] hover:bg-[color:var(--bg-elev)]'
                    }`}
                  >{e}</button>
                ))}
              </div>
            </Field>
            <Field label="名称">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例如：产品经理小灵 / 代码审查员" />
            </Field>
            <Field label="简介">
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="一句话介绍这个智能体的能力与定位" />
            </Field>
          </div>
        )}

        {tab === 'role' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-xs text-[color:var(--text-soft)] mr-2 mt-1">模板：</span>
              {PROMPT_TEMPLATES.map((t) => (
                <Button key={t.name} size="sm" variant="outline" onClick={() => set('system_prompt', t.prompt)}>
                  <Wand2 size={12} />{t.name}
                </Button>
              ))}
            </div>
            <Textarea
              className="min-h-[260px] font-mono text-[13px]"
              value={form.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
              placeholder="详细描述这个智能体的角色、性格、专业领域、回答风格、约束规则……"
            />
            <div className="text-xs text-[color:var(--text-faint)]">
              该角色设定会以"附加身份"形式注入对话，不影响"灵犀"基础人格与安全规则。
            </div>
          </div>
        )}

        {tab === 'model' && (
          <Field label="使用的接入点（不选则跟随全局激活档案）">
            <Select value={form.profile_id} onChange={(e) => set('profile_id', Number(e.target.value))}>
              <option value={0}>跟随全局激活档案</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.model} ({p.provider_protocol})
                </option>
              ))}
            </Select>
          </Field>
        )}

        {tab === 'skills' && (
          <ScopeSelector
            allowAll={form.allow_all}
            onAllowAll={(v) => set('allow_all', v)}
            items={skills}
            selectedIds={skillIds}
            onToggle={(id) => toggleId('skill_ids', form.skill_ids, id)}
            renderItem={(s) => <>
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-[color:var(--text-faint)] line-clamp-1">{s.description}</div>
            </>}
            empty="暂无技能。请到「技能」页面安装或导入。"
          />
        )}

        {tab === 'mcp' && (
          <ScopeSelector
            allowAll={form.allow_all}
            onAllowAll={(v) => set('allow_all', v)}
            items={mcps}
            selectedIds={mcpIds}
            onToggle={(id) => toggleId('mcp_server_ids', form.mcp_server_ids, id)}
            renderItem={(m) => <>
              <div className="font-medium">{m.name} <Badge tone="info">{m.transport}</Badge></div>
              <div className="text-xs text-[color:var(--text-faint)] line-clamp-1">{m.description || m.url || m.command}</div>
            </>}
            empty="暂无 MCP 服务器。请到「MCP」页面添加。"
          />
        )}

        {tab === 'knowledge' && (
          <ScopeSelector
            allowAll={form.allow_all}
            onAllowAll={(v) => set('allow_all', v)}
            items={knowledge}
            selectedIds={kbIds}
            onToggle={(id) => toggleId('knowledge_ids', form.knowledge_ids, id)}
            renderItem={(k) => <>
              <div className="font-medium">{k.title || k.file_path?.split('/').pop()}</div>
              <div className="text-xs text-[color:var(--text-faint)] line-clamp-1">{k.summary || k.category}</div>
            </>}
            empty="暂无知识库文档。请到「知识库」页面添加。"
          />
        )}
      </div>
    </Modal>
  );
}

function ScopeSelector({ allowAll, onAllowAll, items, selectedIds, onToggle, renderItem, empty }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm mb-3 p-3 rounded-lg bg-[color:var(--bg-soft)]">
        <input type="checkbox" checked={!!allowAll} onChange={(e) => onAllowAll(e.target.checked)} />
        <span>允许使用全部（推荐：开启时不做白名单限制）</span>
      </label>
      {!allowAll && (
        items.length === 0 ? (
          <div className="text-center text-sm text-[color:var(--text-soft)] py-8">{empty}</div>
        ) : (
          <div className="space-y-1.5 max-h-[280px] overflow-auto pr-1">
            {items.map((it) => {
              const sel = selectedIds.includes(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => onToggle(it.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition flex items-center gap-3 ${
                    sel
                      ? 'bg-[color:var(--accent-soft)] border-[color:var(--accent)]/40'
                      : 'bg-[color:var(--bg-elev)] border-[color:var(--line)] hover:border-[color:var(--accent)]/40'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                    sel ? 'bg-[color:var(--accent)] border-[color:var(--accent)] text-white' : 'border-[color:var(--line)]'
                  }`}>
                    {sel && <Check size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">{renderItem(it)}</div>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
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

