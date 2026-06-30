import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2, Plus, Pencil, Trash2, Power, PowerOff, Loader2, Info, Radio, Send, TestTube, Zap,
  Eye, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, X, Clock, AlertCircle,
  CheckCircle, XCircle, Filter, MessageSquare,
} from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from './ui/primitives';
import { cn } from './ui/cn';
import { api } from './api/client';

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
      const { session_mode, session_ttl_hours, reply_to_mention_all, streaming_enabled, streaming_card_title, streaming_flush_ms, monitor_enabled, ...rest } = initial.parsedConfig;
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
  const [monitorEnabled, setMonitorEnabled] = useState(initial?.parsedConfig?.monitor_enabled ?? false);
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
        config.monitor_enabled = monitorEnabled;
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

            <div className="flex items-center justify-between pt-2 border-t border-[color:var(--line)]">
              <div className="flex items-center gap-1.5">
                <Eye size={13} className="text-violet-500" />
                <span className="text-[11px] font-medium text-[color:var(--text-soft)]">群消息监听模式</span>
              </div>
              <button
                type="button"
                onClick={() => setMonitorEnabled(!monitorEnabled)}
                className={cn(
                  'relative w-9 h-5 rounded-full transition-colors duration-200',
                  monitorEnabled ? 'bg-violet-500' : 'bg-[color:var(--line)]'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                  monitorEnabled && 'translate-x-4'
                )} />
              </button>
            </div>
            {monitorEnabled && (
              <div className="ml-5 space-y-1">
                <div className="text-[10px] text-[color:var(--text-faint)] leading-relaxed">
                  开启后机器人将接收群内所有消息（非仅 @机器人），按规则过滤后 AI 处理
                </div>
                <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-600 dark:text-violet-400 leading-relaxed">
                  <AlertCircle size={11} className="shrink-0 mt-0.5" />
                  <span>需要在飞书开发者后台添加 <code className="bg-violet-500/10 px-1 py-0.5 rounded font-mono">im:message.group_msg</code> 权限（敏感权限）</span>
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
            {connector.platform === 'feishu' && connector.parsedConfig?.monitor_enabled && (
              <span className="flex items-center gap-1 text-violet-500"><Eye size={10} /> 监听模式</span>
            )}
          </div>
        )}
        {connector.platform === 'feishu' && connector.enabled && connector.parsedConfig?.monitor_enabled && (
          <FeishuMonitorPanel connectorId={connector.id} />
        )}
      </Card>
      {showSend && <SendWebhookModal connectorId={connector.id} onClose={() => setShowSend(false)} />}
    </>
  );
}

// ─── 飞书监听模式面板 ────────────────────────────────────────────────

const ACTION_TYPES = [
  { value: 'reply_original', label: '回复原消息' },
  { value: 'silent', label: '静默处理（不回复）' },
  { value: 'send_to_chat', label: '发到指定群' },
  { value: 'send_to_user', label: '发给指定用户' },
];

const MSG_TYPES = [
  { value: 'text', label: '文本' },
  { value: 'post', label: '富文本' },
  { value: 'image', label: '图片' },
  { value: 'interactive', label: '卡片' },
  { value: 'file', label: '文件' },
];

function FeishuMonitorPanel({ connectorId }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('rules');
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const loadRules = useCallback(async () => {
    try {
      const data = await api.listMonitorRules(connectorId);
      setRules(Array.isArray(data) ? data : []);
    } catch {}
  }, [connectorId]);

  const loadLogs = useCallback(async () => {
    try {
      const data = await api.listMonitorLogs(connectorId, 50);
      setLogs(Array.isArray(data) ? data : []);
    } catch {}
  }, [connectorId]);

  useEffect(() => {
    if (expanded) {
      setLoading(true);
      Promise.all([loadRules(), loadLogs()]).finally(() => setLoading(false));
    }
  }, [expanded, loadRules, loadLogs]);

  const handleToggleRule = async (id) => {
    await api.toggleMonitorRule(id);
    loadRules();
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('确认删除此监听规则？')) return;
    await api.deleteMonitorRule(id);
    loadRules();
  };

  return (
    <div className="mt-3 pt-3 border-t border-[color:var(--line)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-violet-500 hover:text-violet-600 transition w-full"
      >
        <Eye size={13} />
        <span>监听模式配置</span>
        {expanded ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              <div className="flex items-center gap-1">
                <button onClick={() => setTab('rules')} className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] transition',
                  tab === 'rules' ? 'bg-violet-500/15 text-violet-600 font-medium' : 'text-[color:var(--text-soft)] hover:bg-[color:var(--bg-soft)]'
                )}>
                  <Filter size={11} className="inline mr-1" />规则管理
                </button>
                <button onClick={() => { setTab('logs'); loadLogs(); }} className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] transition',
                  tab === 'logs' ? 'bg-violet-500/15 text-violet-600 font-medium' : 'text-[color:var(--text-soft)] hover:bg-[color:var(--bg-soft)]'
                )}>
                  <Clock size={11} className="inline mr-1" />监听日志
                </button>
              </div>

              {loading ? (
                <div className="py-4 text-center text-[color:var(--text-faint)] text-xs">
                  <Loader2 size={16} className="animate-spin mx-auto mb-1" />加载中...
                </div>
              ) : tab === 'rules' ? (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => { setEditingRule(null); setShowRuleModal(true); }}>
                      <Plus size={12} /> 添加规则
                    </Button>
                  </div>
                  {rules.length === 0 ? (
                    <div className="py-4 text-center text-xs text-[color:var(--text-faint)]">
                      <Filter size={20} className="mx-auto mb-1.5 opacity-40" />
                      还没有监听规则，点击上方添加
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {rules.map(rule => (
                        <div key={rule.id} className={cn(
                          'flex items-center gap-2 p-2 rounded-lg border text-xs transition',
                          rule.enabled ? 'border-violet-500/30 bg-violet-500/5' : 'border-[color:var(--line)] bg-[color:var(--bg-soft)] opacity-60'
                        )}>
                          <button onClick={() => handleToggleRule(rule.id)} title={rule.enabled ? '禁用' : '启用'}>
                            {rule.enabled ? <ToggleRight size={16} className="text-violet-500" /> : <ToggleLeft size={16} className="text-[color:var(--text-faint)]" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-[color:var(--text)]">{rule.name}</div>
                            <div className="flex gap-1.5 mt-0.5 flex-wrap">
                              <Badge tone="default">{ACTION_TYPES.find(a => a.value === rule.action_type)?.label || rule.action_type}</Badge>
                              {rule.priority > 0 && <Badge tone="accent">P{rule.priority}</Badge>}
                              {rule.keywords && rule.keywords !== '[]' && (
                                <Badge tone="default"><MessageSquare size={9} className="mr-0.5" />关键词</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingRule(rule); setShowRuleModal(true); }}>
                              <Pencil size={12} />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteRule(rule.id)}>
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.length === 0 ? (
                    <div className="py-4 text-center text-xs text-[color:var(--text-faint)]">
                      <Clock size={20} className="mx-auto mb-1.5 opacity-40" />
                      暂无监听日志
                    </div>
                  ) : logs.map(log => (
                    <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-[color:var(--bg-soft)] text-[11px]">
                      {log.result === 'success' ? <CheckCircle size={12} className="text-green-500 mt-0.5 shrink-0" /> :
                       log.result === 'error' ? <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" /> :
                       <AlertCircle size={12} className="text-[color:var(--text-faint)] mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-[color:var(--text)]">{log.rule_name}</span>
                          <Badge tone={log.result === 'success' ? 'success' : log.result === 'error' ? 'destructive' : 'default'}>
                            {ACTION_TYPES.find(a => a.value === log.action_type)?.label || log.action_type}
                          </Badge>
                        </div>
                        <div className="text-[color:var(--text-faint)] mt-0.5 truncate">
                          {log.sender_name || log.sender_id}: {log.message_text}
                        </div>
                        {log.error_msg && <div className="text-red-500 mt-0.5">{log.error_msg}</div>}
                        <div className="text-[color:var(--text-faint)] mt-0.5 text-[10px]">{log.created_at}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showRuleModal && (
        <MonitorRuleModal
          connectorId={connectorId}
          initial={editingRule}
          onSave={() => { setShowRuleModal(false); setEditingRule(null); loadRules(); }}
          onCancel={() => { setShowRuleModal(false); setEditingRule(null); }}
        />
      )}
    </div>
  );
}

function MonitorRuleModal({ connectorId, initial, onSave, onCancel }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [priority, setPriority] = useState(initial?.priority ?? 0);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [chatIDs, setChatIDs] = useState(() => {
    try { return JSON.parse(initial?.chat_ids || '[]').join(', '); } catch { return ''; }
  });
  const [senderIDs, setSenderIDs] = useState(() => {
    try { return JSON.parse(initial?.sender_ids || '[]').join(', '); } catch { return ''; }
  });
  const [excludeBotMsg, setExcludeBotMsg] = useState(initial?.exclude_bot_msg ?? true);
  const [msgTypes, setMsgTypes] = useState(() => {
    try { return JSON.parse(initial?.msg_types || '[]'); } catch { return []; }
  });
  const [keywords, setKeywords] = useState(() => {
    try { return JSON.parse(initial?.keywords || '[]').join(', '); } catch { return ''; }
  });
  const [keywordMode, setKeywordMode] = useState(initial?.keyword_mode || 'any');
  const [actionType, setActionType] = useState(initial?.action_type || 'reply_original');
  const [actionTarget, setActionTarget] = useState(initial?.action_target || '');
  const [customPrompt, setCustomPrompt] = useState(initial?.custom_prompt || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 飞书群列表
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  useEffect(() => {
    setLoadingChats(true);
    api.listFeishuChats(connectorId).then(data => {
      setChats(Array.isArray(data) ? data : []);
    }).catch(() => {}).finally(() => setLoadingChats(false));
  }, [connectorId]);

  const toArr = (s) => s.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('请填写规则名'); return; }
    setSaving(true);
    try {
      const data = {
        connector_id: connectorId,
        name: name.trim(),
        enabled,
        chat_ids: JSON.stringify(toArr(chatIDs)),
        sender_ids: JSON.stringify(toArr(senderIDs)),
        exclude_bot_msg: excludeBotMsg,
        msg_types: JSON.stringify(msgTypes),
        keywords: JSON.stringify(toArr(keywords)),
        keyword_mode: keywordMode,
        action_type: actionType,
        action_target: actionTarget.trim(),
        custom_prompt: customPrompt.trim(),
        priority: Number(priority) || 0,
      };
      if (isEdit) {
        await api.updateMonitorRule(initial.id, data);
      } else {
        await api.createMonitorRule(data);
      }
      onSave();
    } catch (e) { setError('保存失败：' + e.message); }
    finally { setSaving(false); }
  };

  const needsTarget = actionType === 'send_to_chat' || actionType === 'send_to_user';

  return (
    <Modal open onClose={onCancel} title={isEdit ? '编辑监听规则' : '新建监听规则'} width={480} footer={
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 size={14} className="animate-spin" />保存中...</> : '保存'}
        </Button>
      </div>
    }>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-[11px] font-medium text-[color:var(--text-soft)] mb-0.5 block">规则名称</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如：监听产品反馈" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[color:var(--text-soft)] mb-0.5 block">优先级</label>
            <Input type="number" min="0" max="100" value={priority} onChange={e => setPriority(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-[color:var(--line)]">
          <div className="text-[11px] font-medium text-violet-500 flex items-center gap-1">
            <Filter size={11} /> 来源过滤
          </div>
          <div>
            <label className="text-[10px] text-[color:var(--text-faint)] mb-0.5 block">指定群（留空=监听所有群）</label>
            {loadingChats ? (
              <div className="text-[10px] text-[color:var(--text-faint)]"><Loader2 size={10} className="inline animate-spin mr-1" />加载群列表...</div>
            ) : chats.length > 0 ? (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {chats.map(ch => {
                  const selected = toArr(chatIDs).includes(ch.chat_id);
                  return (
                    <button
                      key={ch.chat_id}
                      onClick={() => {
                        const arr = toArr(chatIDs);
                        if (selected) setChatIDs(arr.filter(x => x !== ch.chat_id).join(', '));
                        else setChatIDs([...arr, ch.chat_id].join(', '));
                      }}
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] border transition',
                        selected ? 'bg-violet-500/15 border-violet-500/40 text-violet-600' : 'border-[color:var(--line)] text-[color:var(--text-faint)] hover:bg-[color:var(--bg-soft)]'
                      )}
                    >
                      {ch.name || ch.chat_id}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <Input className="text-xs" value={chatIDs} onChange={e => setChatIDs(e.target.value)} placeholder="oc_xxx, oc_yyy（逗号分隔）" />
          </div>
          <div>
            <label className="text-[10px] text-[color:var(--text-faint)] mb-0.5 block">指定发送者 Open ID（留空=所有人）</label>
            <Input className="text-xs" value={senderIDs} onChange={e => setSenderIDs(e.target.value)} placeholder="ou_xxx, ou_yyy（逗号分隔）" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[color:var(--text-soft)]">排除机器人自身消息</span>
            <button type="button" onClick={() => setExcludeBotMsg(!excludeBotMsg)} className={cn(
              'relative w-8 h-4.5 rounded-full transition-colors duration-200',
              excludeBotMsg ? 'bg-violet-500' : 'bg-[color:var(--line)]'
            )}>
              <span className={cn(
                'absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200',
                excludeBotMsg && 'translate-x-3.5'
              )} />
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-[color:var(--line)]">
          <div className="text-[11px] font-medium text-violet-500 flex items-center gap-1">
            <MessageSquare size={11} /> 内容过滤
          </div>
          <div>
            <label className="text-[10px] text-[color:var(--text-faint)] mb-0.5 block">消息类型（留空=所有类型）</label>
            <div className="flex flex-wrap gap-1">
              {MSG_TYPES.map(mt => {
                const sel = msgTypes.includes(mt.value);
                return (
                  <button
                    key={mt.value}
                    onClick={() => setMsgTypes(prev => sel ? prev.filter(x => x !== mt.value) : [...prev, mt.value])}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] border transition',
                      sel ? 'bg-violet-500/15 border-violet-500/40 text-violet-600' : 'border-[color:var(--line)] text-[color:var(--text-faint)] hover:bg-[color:var(--bg-soft)]'
                    )}
                  >
                    {mt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[color:var(--text-faint)] mb-0.5 block">关键词过滤（留空=不按关键词过滤）</label>
            <Input className="text-xs" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="关键词1, 关键词2（逗号分隔）" />
            <div className="flex gap-2 mt-1">
              <button onClick={() => setKeywordMode('any')} className={cn(
                'px-2 py-0.5 rounded text-[10px] transition',
                keywordMode === 'any' ? 'bg-violet-500/15 text-violet-600' : 'text-[color:var(--text-faint)]'
              )}>任一匹配</button>
              <button onClick={() => setKeywordMode('all')} className={cn(
                'px-2 py-0.5 rounded text-[10px] transition',
                keywordMode === 'all' ? 'bg-violet-500/15 text-violet-600' : 'text-[color:var(--text-faint)]'
              )}>全部匹配</button>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-[color:var(--line)]">
          <div className="text-[11px] font-medium text-violet-500">处理动作</div>
          <div>
            <Select value={actionType} onChange={e => setActionType(e.target.value)}>
              {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </div>
          {needsTarget && (
            <div>
              <label className="text-[10px] text-[color:var(--text-faint)] mb-0.5 block">
                {actionType === 'send_to_chat' ? '目标群 Chat ID' : '目标用户 Open ID'}
              </label>
              <Input className="text-xs" value={actionTarget} onChange={e => setActionTarget(e.target.value)}
                placeholder={actionType === 'send_to_chat' ? 'oc_xxx' : 'ou_xxx'} />
            </div>
          )}
        </div>

        <div className="space-y-1.5 pt-2 border-t border-[color:var(--line)]">
          <div className="text-[11px] font-medium text-violet-500">自定义提示词（可选）</div>
          <textarea
            className="w-full h-16 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-soft)] p-2 text-xs text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            placeholder="不填则使用绑定智能体的默认提示词。填写后会以 [监控指令] {提示词}\n[原始消息] {消息内容} 的格式发给 AI"
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
          />
        </div>

        {error && <div className="px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{error}</div>}
      </div>
    </Modal>
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
