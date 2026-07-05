import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plug, Plus, Trash2, Edit3, Globe, Terminal, Shield, ArrowLeft } from 'lucide-react';
import { api } from './api/client';
import { Button, Input, Textarea, Select, Badge, Card, Modal, EmptyState, SkeletonCard } from './ui/primitives';

const TRANSPORTS = [
  { value: 'stdio', label: 'STDIO（本地子进程）', icon: Terminal },
  { value: 'sse', label: 'SSE（远程流式）', icon: Globe },
  { value: 'http', label: 'HTTP（远程）', icon: Globe },
];

const EMPTY = {
  id: 0,
  name: '',
  transport: 'stdio',
  command: '',
  args: '[]',
  env: '{}',
  url: '',
  headers: '{}',
  enabled: true,
  description: '',
};

export default function MCPPage({ onBack }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await api.listMCP();
      setList(data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const onToggle = async (m) => {
    await api.toggleMCP(m.id, !m.enabled);
    refresh();
  };
  const onDelete = async (m) => {
    if (!confirm(`删除 MCP 服务器 ${m.name}？`)) return;
    await api.deleteMCP(m.id);
    refresh();
  };
  const onSave = async (form) => {
    await api.saveMCP(form);
    setEditing(null);
    refresh();
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl mb-6 p-6 surface-grad">
        <div className="absolute inset-0 bg-gradient-to-br from-[color:var(--accent-soft)] via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft size={16} /></Button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow">
            <Plug size={22} />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold tracking-tight text-gradient">MCP 服务器</div>
            <div className="text-sm text-[color:var(--text-soft)]">
              管理 Model Context Protocol 服务器，扩展 AI 的工具与外部能力。
            </div>
          </div>
          <Button onClick={() => setEditing({ ...EMPTY })}><Plus size={16} />新增</Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {[1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="暂无 MCP 服务器"
          description="点击右上角「新增」创建 MCP 服务器"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {list.map((m) => {
              const Tr = TRANSPORTS.find((t) => t.value === m.transport) || TRANSPORTS[0];
              const Icon = Tr.icon;
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="surface p-4 hover:shadow-glow transition-all hover:-translate-y-0.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center shrink-0">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-semibold truncate">{m.name}</div>
                        {m.builtin && <Badge tone="info"><Shield size={10} />内置</Badge>}
                        <Badge tone={m.enabled ? 'success' : 'default'}>
                          {m.enabled ? '已启用' : '已禁用'}
                        </Badge>
                      </div>
                      <div className="text-xs text-[color:var(--text-faint)] truncate font-mono">
                        {m.transport === 'stdio'
                          ? `${m.command}`
                          : `${m.transport.toUpperCase()} · ${m.url}`}
                      </div>
                      {m.description && (
                        <div className="text-sm text-[color:var(--text-soft)] mt-2 line-clamp-2">
                          {m.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={m.enabled ? 'soft' : 'outline'}
                      onClick={() => onToggle(m)}
                    >
                      {m.enabled ? '禁用' : '启用'}
                    </Button>
                    {!m.builtin && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ ...m })}>
                          <Edit3 size={14} />编辑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onDelete(m)}>
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <MCPEditor
        open={!!editing}
        value={editing}
        onClose={() => setEditing(null)}
        onSave={onSave}
      />

      <div className="text-xs text-[color:var(--text-faint)] mt-6 text-center">
        修改后需在「下次新对话」生效（AI 引擎会在新会话启动时加载 MCP 配置）。
      </div>
    </div>
  );
}

function MCPEditor({ open, value, onClose, onSave }) {
  const [form, setForm] = useState(value || EMPTY);
  useEffect(() => { if (value) setForm(value); }, [value]);
  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.id ? `编辑 MCP - ${form.name}` : '新增 MCP 服务器'}
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name}>保存</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="名称（必填，唯一）">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例如 playwright / github / filesystem" />
        </Field>
        <Field label="传输协议">
          <Select value={form.transport} onChange={(e) => set('transport', e.target.value)}>
            {TRANSPORTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        {form.transport === 'stdio' ? (
          <>
            <Field label="命令">
              <Input value={form.command} onChange={(e) => set('command', e.target.value)} placeholder="例如 npx / python / node" />
            </Field>
            <Field label="参数（JSON 数组）">
              <Textarea value={form.args} onChange={(e) => set('args', e.target.value)} placeholder='["-y", "@modelcontextprotocol/server-filesystem", "/Users"]' />
            </Field>
            <Field label="环境变量（JSON 对象，可选）">
              <Textarea value={form.env} onChange={(e) => set('env', e.target.value)} placeholder='{"API_KEY": "xxx"}' />
            </Field>
          </>
        ) : (
          <>
            <Field label="URL">
              <Input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://example.com/mcp" />
            </Field>
            <Field label="请求头（JSON 对象，可选）">
              <Textarea value={form.headers} onChange={(e) => set('headers', e.target.value)} placeholder='{"Authorization": "Bearer xxx"}' />
            </Field>
          </>
        )}
        <Field label="描述（可选）">
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="说明这个 MCP 提供哪些工具或能力，便于以后查阅。" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          创建后立即启用
        </label>
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

