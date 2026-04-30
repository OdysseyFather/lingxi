import { useEffect, useState } from 'react';
import { Plus, Cpu, Pencil, Trash2, Zap, ExternalLink, ShieldCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStore } from '../state/useStore';
import { api, electron } from '../api/client';
import { Button, Input, Modal, Select, Badge, Card } from '../ui/primitives';

export function ProfilesPage() {
  const providers = useStore((s) => s.providers);
  const profiles = useStore((s) => s.profiles);
  const refreshProfiles = useStore((s) => s.refreshProfiles);
  const activate = useStore((s) => s.activateProfile);
  const pushNotification = useStore((s) => s.pushNotification);

  const [editing, setEditing] = useState(null); // null | profile object | { __new: true }

  useEffect(() => { refreshProfiles(); }, []);

  const handleDelete = async (p) => {
    if (!confirm(`删除接入点「${p.name}」？`)) return;
    await api.deleteProfile(p.id);
    await refreshProfiles();
  };

  const handleTest = async (p) => {
    pushNotification({ title: '测试中…', body: `${p.name}` });
    const r = await api.testProfile(p.id);
    if (r.ok) pushNotification({ title: '连接成功', body: `${p.name}` });
    else pushNotification({ title: '连接失败', body: r.error || '请检查 base_url 与密钥' });
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">模型与接入点</h1>
          <p className="text-sm text-[color:var(--text-soft)] mt-0.5">
            原生 Anthropic 协议直连，或经本地路由层（llm-bridge）接入 DeepSeek / Qwen / Doubao / GLM / Gemini / OpenRouter / Ollama 等 OpenAI 协议供应商
          </p>
        </div>
        <Button onClick={() => setEditing({ __new: true })}>
          <Plus size={14} /> 新建接入点
        </Button>
      </div>

      {profiles.length === 0 ? (
        <Card className="text-center py-10">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center mb-3">
            <Cpu size={22} />
          </div>
          <div className="font-medium">还没有接入点</div>
          <p className="text-sm text-[color:var(--text-soft)] mt-1">点击右上角「新建接入点」快速接入 DeepSeek 或其他供应商</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {profiles.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center shrink-0">
                    <Cpu size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2 flex-wrap">
                      {p.name}
                      {p.is_active && <Badge tone="accent">激活</Badge>}
                      {p.provider_protocol === 'openai' ? (
                        <Badge tone="info">OpenAI · 路由层</Badge>
                      ) : (
                        <Badge tone="default">Anthropic · 直连</Badge>
                      )}
                    </div>
                    <div className="text-xs text-[color:var(--text-faint)] truncate">
                      {p.provider_name || p.provider_code} · {p.model || '默认模型'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-xs text-[color:var(--text-soft)] space-y-1 font-mono">
                <div className="truncate">URL: {p.base_url || '使用 provider 默认'}</div>
                <div className="flex items-center gap-1">
                  <ShieldCheck size={12} /> 密钥: {p.auth_token_mask || '未设置'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!p.is_active && (
                  <Button size="sm" onClick={() => activate(p.id)}>
                    <Zap size={12} /> 设为激活
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => handleTest(p)}>测试连接</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  <Pencil size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(p)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
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

function ProfileEditor({ providers, profile, onClose, onSaved }) {
  const isEdit = !!profile;
  const [name, setName] = useState(profile?.name || '');
  const [providerId, setProviderId] = useState(profile?.provider_id || providers[0]?.id || 0);
  const [baseUrl, setBaseUrl] = useState(profile?.base_url || '');
  const [model, setModel] = useState(profile?.model || '');
  const [token, setToken] = useState('');
  const [transformer, setTransformer] = useState(profile?.transformer || '');
  const [showAdvanced, setShowAdvanced] = useState(!!profile?.transformer);
  const [saving, setSaving] = useState(false);
  const pushNotification = useStore((s) => s.pushNotification);

  const provider = providers.find((p) => p.id === providerId);
  const isOpenAI = provider?.protocol === 'openai';

  // 选 provider 时自动填默认值（包括 transformer 推断）
  const onPickProvider = (id) => {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    if (p) {
      if (!baseUrl) setBaseUrl(p.default_base_url || '');
      if (!model) setModel(p.default_model || '');
      if (!name) setName(p.name);
      // 从 provider.usage_api_meta 中读取建议 transformer
      try {
        const meta = JSON.parse(p.usage_api_meta || '{}');
        if (meta.transformer && !transformer) setTransformer(meta.transformer);
      } catch {}
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return pushNotification({ title: '请填写名称', body: '' });
    if (!providerId) return pushNotification({ title: '请选择供应商', body: '' });
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
        name, provider_id: providerId,
        base_url: baseUrl,
        model,
        auth_token_cipher: cipher,
        auth_token_mask: mask,
        extra: '{}',
        transformer: isOpenAI ? transformer : '',
      });
      // 若是当前激活档案且改了密钥，让 Electron 重推
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

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? '编辑接入点' : '新建接入点'}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="名称">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：My DeepSeek Profile" />
        </Field>
        <Field label="供应商">
          <Select value={providerId} onChange={(e) => onPickProvider(Number(e.target.value))}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.protocol === 'openai' ? '· OpenAI' : '· Anthropic'}
              </option>
            ))}
          </Select>
          {provider?.doc_url && (
            <button
              onClick={() => electron.openExternal(provider.doc_url)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-[color:var(--accent)] hover:underline"
            >
              <ExternalLink size={11} /> 如何获取密钥
            </button>
          )}
        </Field>
        {isOpenAI && (
          <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-soft)] p-3 text-xs text-[color:var(--text-soft)] leading-relaxed">
            该供应商为 <b>OpenAI 兼容协议</b>。激活后，本应用将自动启动本地路由层（基于
            llm-bridge）把 Anthropic 请求实时翻译为 OpenAI 格式后转发至 {provider?.name}，
            整个流程发生在你的电脑上，不经过任何中间服务器。
          </div>
        )}
        <Field label="Base URL">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={provider?.default_base_url || 'https://...'} />
          {isOpenAI && (
            <div className="mt-1 text-[11px] text-[color:var(--text-faint)]">
              OpenAI 协议端点应包含 <code>/chat/completions</code> 路径
            </div>
          )}
        </Field>
        <Field label="模型">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider?.default_model || ''} />
        </Field>
        <Field label={isEdit ? '密钥（留空则保留旧值）' : 'API Key / AKSK Token'}>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={isEdit ? '••••••••' : 'sk-...'}
            autoComplete="off"
          />
          <div className="mt-1 text-[11px] text-[color:var(--text-faint)] flex items-center gap-1">
            <ShieldCheck size={12} /> 通过系统 Keychain 加密存储，仅本机可解
          </div>
        </Field>
        {isOpenAI && (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-[color:var(--accent)] hover:underline"
            >
              {showAdvanced ? '收起' : '展开'} 高级选项
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <Field label="Transformer">
                  <Input
                    value={transformer}
                    onChange={(e) => setTransformer(e.target.value)}
                    placeholder="留空 = 自动；保留字段，未来用于 per-provider 偏差修正"
                  />
                  <div className="mt-1 text-[11px] text-[color:var(--text-faint)]">
                    保留配置项；当前路由层（llm-bridge）会自动处理多数协议差异，留空即可。
                  </div>
                </Field>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

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
