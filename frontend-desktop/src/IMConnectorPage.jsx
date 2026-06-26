import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2, Plus, Pencil, Trash2, Power, PowerOff, Loader2, Info, Radio, Send, TestTube, Zap,
} from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from './ui/primitives';
import { cn } from './ui/cn';

const PLATFORMS = [
  { id: 'dingtalk', label: '钉钉', icon: '📌', fields: [
    { key: 'client_id',     label: 'Client ID',     placeholder: '应用的 Client ID（AppKey）', type: 'text' },
    { key: 'client_secret', label: 'Client Secret', placeholder: '应用的 Client Secret（AppSecret）', type: 'password' },
  ]},
  { id: 'feishu', label: '飞书', icon: '🪶', fields: [
    { key: 'app_id',     label: 'App ID',     placeholder: '飞书应用的 App ID', type: 'text' },
    { key: 'app_secret', label: 'App Secret', placeholder: '飞书应用的 App Secret', type: 'password' },
  ]},
  { id: 'wecom_webhook', label: '企业微信', icon: '💼', desc: '群机器人 Webhook 通知', fields: [
    { key: 'webhook_url', label: 'Webhook URL', placeholder: '群机器人 Webhook 地址', type: 'text' },
  ]},
  { id: 'wecom', label: '企业微信（应用）', icon: '💼', desc: '自建应用双向对话', fields: [
    { key: 'corp_id',          label: 'Corp ID',          placeholder: '企业 ID（corpid）', type: 'text' },
    { key: 'agent_id',         label: 'Agent ID',         placeholder: '应用 AgentId', type: 'text' },
    { key: 'secret',           label: 'Secret',           placeholder: '应用 Secret', type: 'password' },
    { key: 'token',            label: 'Token',            placeholder: '消息接收 Token', type: 'text' },
    { key: 'encoding_aes_key', label: 'EncodingAESKey',   placeholder: '消息加解密 Key（43位）', type: 'password' },
  ]},
];

const SESSION_MODES = [
  { value: 'per_group',      label: '按群共享',   desc: '群内共享上下文（推荐）' },
  { value: 'per_user',       label: '按人独立',   desc: '用户跨群独立' },
  { value: 'per_group_user', label: '按群+人',    desc: '群内每人独立' },
  { value: 'stateless',      label: '无状态',     desc: '不保留上下文' },
];

function ConnectorForm({ initial, onSave, onCancel, agents }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [platform, setPlatform] = useState(initial?.platform || 'dingtalk');
  const [agentId, setAgentId] = useState(initial?.agent_id || 0);
  const [fields, setFields] = useState(() => {
    if (initial?.parsedConfig) {
      const { session_mode, session_ttl_hours, reply_to_mention_all, streaming_enabled, streaming_card_title, streaming_flush_ms, ...rest } = initial.parsedConfig;
      return rest;
    }
    return {};
  });
  const [sessionMode, setSessionMode] = useState(initial?.parsedConfig?.session_mode || 'per_group');
  const [ttlHours, setTtlHours] = useState(initial?.parsedConfig?.session_ttl_hours ?? 24);
  const [replyToMentionAll, setReplyToMentionAll] = useState(initial?.parsedConfig?.reply_to_mention_all ?? false);
  const [streamingEnabled, setStreamingEnabled] = useState(initial?.parsedConfig?.streaming_enabled ?? false);
  const [streamingCardTitle, setStreamingCardTitle] = useState(initial?.parsedConfig?.streaming_card_title || '');
  const [streamingFlushMs, setStreamingFlushMs] = useState(initial?.parsedConfig?.streaming_flush_ms ?? 80);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const platformDef = PLATFORMS.find(p => p.id === platform);

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('请填写连接名称'); return; }
    for (const f of platformDef.fields) {
      if (!fields[f.key]?.trim()) { setError(`请填写 ${f.label}`); return; }
    }
    setSaving(true);
    try {
      let config = isWebhookOnly
        ? { ...fields }
        : { ...fields, session_mode: sessionMode, session_ttl_hours: Number(ttlHours), reply_to_mention_all: replyToMentionAll };
      if (platform === 'feishu') {
        config.streaming_enabled = streamingEnabled;
        if (streamingEnabled) {
          config.streaming_card_title = streamingCardTitle || '灵犀';
          config.streaming_flush_ms = Number(streamingFlushMs) || 80;
        }
      }
      const r = await fetch('/api/im-connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: initial?.id || 0, name: name.trim(), platform, agent_id: agentId, config }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.error || '保存失败'); return; }
      onSave();
    } catch (e) { setError('保存失败：' + e.message); }
    finally { setSaving(false); }
  };

  const isWebhookOnly = platform === 'wecom_webhook';

  const tips = {
    wecom: { icon: Info, text: '企业微信自建应用需要公网 IP 或内网穿透，回调地址填写：', code: 'http://你的IP:3001/api/wecom/callback' },
    wecom_webhook: { icon: Info, text: '在企业微信群设置中添加「群机器人」，复制 Webhook 地址粘贴到上方。仅支持发送通知，不支持接收回复。' },
    dingtalk: { icon: Info, text: '钉钉 Stream 模式无需公网 IP，在开发者后台将消息接收模式设为 Stream 即可。' },
    feishu: { icon: Info, text: '飞书长连接模式无需公网 IP，在开发者后台开启机器人能力并订阅「接收消息」事件即可。' },
  };
  const tip = tips[platform];

  return (
    <Modal open onClose={onCancel} title={isEdit ? '编辑连接器' : '添加 IM 连接器'} width={440} footer={
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 size={14} className="animate-spin" />保存中...</> : '保存'}
        </Button>
      </div>
    }>
      <div className="space-y-3">
        {!isEdit && (
          <div className="flex gap-1.5 flex-wrap">
            {PLATFORMS.map(p => (
              <button key={p.id} onClick={() => { setPlatform(p.id); setFields({}); }} className={cn(
                'px-2.5 py-1 rounded-lg border text-xs transition',
                platform === p.id
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)] font-medium'
                  : 'border-[color:var(--line)] text-[color:var(--text-soft)] hover:bg-[color:var(--bg-soft)]'
              )}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-medium text-[color:var(--text-soft)] mb-0.5 block">连接名称</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={platformDef.desc ? `例如：${platformDef.desc}` : `例如：${platformDef.label}-产品群`} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[color:var(--text-soft)] mb-0.5 block">指定智能体（可选）</label>
            <Select value={agentId} onChange={e => setAgentId(Number(e.target.value))}>
              <option value={0}>默认助理</option>
              {(agents || []).map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          {platformDef.fields.map(f => (
            <div key={f.key}>
              <label className="text-[11px] font-medium text-[color:var(--text-soft)] mb-0.5 block">{f.label}</label>
              <Input type={f.type} placeholder={f.placeholder} value={fields[f.key] || ''} onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))} autoComplete="off" />
            </div>
          ))}
        </div>

        {!isWebhookOnly && (
          <div>
            <label className="text-[11px] font-medium text-[color:var(--text-faint)] mb-1 block">会话粒度</label>
            <Select value={sessionMode} onChange={e => setSessionMode(e.target.value)}>
              {SESSION_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
              ))}
            </Select>
            {sessionMode !== 'stateless' && (
              <div className="mt-1.5 flex items-center gap-2">
                <label className="text-[11px] text-[color:var(--text-soft)] shrink-0">上下文有效期（小时）</label>
                <Input type="number" min="0" max="720" className="w-16 text-xs" value={ttlHours} onChange={e => setTtlHours(e.target.value)} />
                <span className="text-[10px] text-[color:var(--text-faint)]">0 表示永不重置</span>
              </div>
            )}
          </div>
        )}

        {!isWebhookOnly && (
          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="text-[11px] font-medium text-[color:var(--text-soft)]">@所有人 时是否回复</div>
              <div className="text-[10px] text-[color:var(--text-faint)] leading-relaxed mt-0.5">
                关闭时，群内 @所有人 的消息不会触发 AI 回复，仅 @机器人 时才响应
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyToMentionAll(!replyToMentionAll)}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ml-3',
                replyToMentionAll ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--line)]'
              )}
            >
              <span className={cn(
                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                replyToMentionAll && 'translate-x-4'
              )} />
            </button>
          </div>
        )}

        {platform === 'feishu' && (
          <div className="space-y-2 pt-1 border-t border-[color:var(--line)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap size={13} className="text-amber-500" />
                <span className="text-[11px] font-medium text-[color:var(--text-soft)]">流式卡片回复</span>
              </div>
              <button
                type="button"
                onClick={() => setStreamingEnabled(!streamingEnabled)}
                className={cn(
                  'relative w-9 h-5 rounded-full transition-colors duration-200',
                  streamingEnabled ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--line)]'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                  streamingEnabled && 'translate-x-4'
                )} />
              </button>
            </div>
            {streamingEnabled && (
              <div className="ml-5 space-y-1.5">
                <div className="text-[10px] text-[color:var(--text-faint)] leading-relaxed">
                  开启后 AI 回复将以飞书卡片形式逐字流式输出（打字机效果），需要飞书客户端 7.20+
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[color:var(--text-faint)] mb-0.5 block">卡片标题</label>
                    <Input className="text-xs" placeholder="灵犀" value={streamingCardTitle} onChange={e => setStreamingCardTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-[color:var(--text-faint)] mb-0.5 block">推送间隔 (ms)</label>
                    <Input type="number" className="text-xs w-full" min="50" max="500" value={streamingFlushMs} onChange={e => setStreamingFlushMs(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tip && (
          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-[color:var(--text-soft)] leading-relaxed">
            <Info size={11} className="shrink-0 mt-0.5 text-blue-400" />
            <span>{tip.text}{tip.code && <code className="bg-blue-500/10 px-1 py-0.5 rounded font-mono text-[10px] ml-1">{tip.code}</code>}</span>
          </div>
        )}

        {error && <div className="px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{error}</div>}
      </div>
    </Modal>
  );
}

export default function IMConnectorPage() {
  const [connectors, setConnectors] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingConnector, setEditingConnector] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const fetchConnectors = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/im-connectors');
      const data = await r.json();
      const list = (data || []).map(c => {
        let parsedConfig = {};
        try { parsedConfig = JSON.parse(c.config); } catch {}
        return { ...c, parsedConfig };
      });
      setConnectors(list);
    } finally { setLoading(false); }
  };

  const fetchAgents = async () => {
    try {
      const r = await fetch('/api/agents');
      const data = await r.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => { fetchConnectors(); fetchAgents(); }, []);

  const handleToggle = async (connector) => {
    setTogglingId(connector.id);
    try {
      const action = connector.enabled ? 'disable' : 'enable';
      const r = await fetch(`/api/im-connectors/${connector.id}/${action}`, { method: 'PUT' });
      if (r.ok) await fetchConnectors();
    } finally { setTogglingId(null); }
  };

  const handleDelete = async (connector) => {
    const label = connector.name || connector.platform;
    if (!confirm(`确认删除「${label}」连接？配置将被清除。`)) return;
    await fetch(`/api/im-connectors/${connector.id}`, { method: 'DELETE' });
    await fetchConnectors();
  };

  return (
    <div className="max-w-5xl mx-auto">
      {showForm && (
        <ConnectorForm
          initial={editingConnector}
          onSave={async () => { setShowForm(false); setEditingConnector(null); await fetchConnectors(); }}
          onCancel={() => { setShowForm(false); setEditingConnector(null); }}
          agents={agents}
        />
      )}

      <div className="relative overflow-hidden rounded-2xl mb-6 p-6 surface-grad">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-gradient-to-br from-[color:var(--accent)]/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow">
            <Link2 size={26} />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold tracking-tight text-gradient">IM 连接器</div>
            <div className="text-sm text-[color:var(--text-soft)]">连接钉钉、飞书、企业微信，让 AI 助理直接在群聊中响应</div>
          </div>
          <Button onClick={() => { setEditingConnector(null); setShowForm(true); }}>
            <Plus size={14} /> 添加连接器
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-[color:var(--text-faint)]">
          <Loader2 size={24} className="animate-spin mx-auto mb-3" />加载中...
        </div>
      ) : connectors.length === 0 ? (
        <div className="py-20 text-center">
          <Link2 size={40} className="mx-auto mb-3 text-[color:var(--accent)] opacity-50" />
          <p className="text-[color:var(--text-soft)]">还没有配置任何 IM 连接器</p>
          <p className="text-xs text-[color:var(--text-faint)] mt-1">点击上方「添加连接器」开始配置</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus size={14} /> 添加第一个连接器
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {connectors.map(c => (
              <motion.div key={c.id || c.platform} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                <ConnectorCard
                  connector={{ ...c, _toggling: togglingId === c.id }}
                  onToggle={handleToggle}
                  onEdit={conn => { setEditingConnector(conn); setShowForm(true); }}
                  onDelete={handleDelete}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function ConnectorCard({ connector, onToggle, onEdit, onDelete }) {
  const platform = PLATFORMS.find(p => p.id === connector.platform);
  const isWebhook = connector.platform === 'wecom_webhook';
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showSend, setShowSend] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`/api/im-connectors/${connector.id}/test`, { method: 'POST' });
      const d = await r.json();
      setTestResult(r.ok ? 'success' : (d.error || '测试失败'));
    } catch (e) { setTestResult(e.message); }
    finally { setTesting(false); }
  };

  return (
    <>
      <Card className={cn('transition-all hover:-translate-y-0.5 hover:shadow-glow group', connector.enabled && 'border-[color:var(--accent)]/40')}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{platform?.icon || '🔌'}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium">{connector.name || platform?.label || connector.platform}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {connector.decrypt_error && (
                <Badge tone="destructive" title={connector.decrypt_error}>配置密钥失效</Badge>
              )}
              {isWebhook && <Badge tone="default">Webhook</Badge>}
              {!isWebhook && connector.running ? (
                <Badge tone="success"><Radio size={10} className="animate-pulse" /> 运行中</Badge>
              ) : !isWebhook && connector.enabled ? (
                <Badge tone="accent">已启用</Badge>
              ) : !isWebhook ? (
                <Badge tone="default">已停用</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
            {isWebhook && (
              <>
                <Button size="sm" variant="ghost" onClick={handleTest} disabled={testing} title="发送测试消息">
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowSend(true)} title="发送通知">
                  <Send size={14} />
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => onEdit(connector)}><Pencil size={14} /></Button>
            {!isWebhook && (
              <Button size="sm" variant={connector.enabled ? 'outline' : 'default'} onClick={() => onToggle(connector)} disabled={connector._toggling}>
                {connector._toggling ? <Loader2 size={12} className="animate-spin" /> : connector.enabled ? <><PowerOff size={12} /> 停用</> : <><Power size={12} /> 启用</>}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onDelete(connector)}><Trash2 size={14} /></Button>
          </div>
        </div>
        {testResult && (
          <div className={cn('mt-2 text-xs px-2.5 py-1.5 rounded-lg', testResult === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500')}>
            {testResult === 'success' ? '测试消息发送成功' : testResult}
          </div>
        )}
        {connector.enabled && !isWebhook && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-[color:var(--line)] text-xs text-[color:var(--text-faint)]">
            <span>会话模式：{SESSION_MODES.find(m => m.value === (connector.parsedConfig?.session_mode || 'per_group'))?.label || '按群共享'}</span>
            <span>TTL：{connector.parsedConfig?.session_ttl_hours || 24}h</span>
            <span>@所有人：{connector.parsedConfig?.reply_to_mention_all ? '回复' : '忽略'}</span>
            {connector.platform === 'feishu' && connector.parsedConfig?.streaming_enabled && (
              <span className="flex items-center gap-1 text-amber-500"><Zap size={10} /> 流式卡片</span>
            )}
          </div>
        )}
      </Card>
      {showSend && <SendWebhookModal connectorId={connector.id} onClose={() => setShowSend(false)} />}
    </>
  );
}

function SendWebhookModal({ connectorId, onClose }) {
  const [content, setContent] = useState('');
  const [msgType, setMsgType] = useState('text');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const r = await fetch(`/api/im-connectors/${connectorId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: msgType, content: content.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setResult('success');
        setContent('');
      } else {
        setResult(d.error || '发送失败');
      }
    } catch (e) { setResult(e.message); }
    finally { setSending(false); }
  };

  return (
    <Modal open onClose={onClose} title="发送企微通知" width={420}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <button onClick={() => setMsgType('text')} className={cn(
            'px-2.5 py-1 rounded-lg border text-xs transition',
            msgType === 'text' ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'border-[color:var(--line)] text-[color:var(--text-soft)]'
          )}>文本</button>
          <button onClick={() => setMsgType('markdown')} className={cn(
            'px-2.5 py-1 rounded-lg border text-xs transition',
            msgType === 'markdown' ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'border-[color:var(--line)] text-[color:var(--text-soft)]'
          )}>Markdown</button>
        </div>
        <textarea
          className="w-full h-28 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-soft)] p-3 text-sm text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)] resize-none"
          placeholder={msgType === 'markdown' ? '支持 Markdown 格式，如 **加粗** [链接](url)' : '输入要发送的消息内容'}
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        {result && (
          <div className={cn('text-xs px-2.5 py-1.5 rounded-lg', result === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500')}>
            {result === 'success' ? '发送成功' : result}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>关闭</Button>
          <Button onClick={handleSend} disabled={sending || !content.trim()}>
            {sending ? <><Loader2 size={14} className="animate-spin" />发送中...</> : <><Send size={14} /> 发送</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
