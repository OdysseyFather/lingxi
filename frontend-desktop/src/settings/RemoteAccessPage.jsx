import { useState, useEffect, useCallback } from 'react';
import { Smartphone, Plus, Copy, Trash2, PowerOff, ExternalLink, Clock, QrCode, Check, Globe, Loader2, Wifi, WifiOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { Button, Card, Input, Modal } from '../ui/primitives';
import { cn } from '../ui/cn';

export default function RemoteAccessPage() {
  const [settings, setSettings] = useState({ enabled: false, permission_mode: 'readonly', allowed_origins: '' });
  const [tokens, setTokens] = useState([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [qrToken, setQrToken] = useState(null);
  const [saving, setSaving] = useState(false);

  // 云端隧道状态
  const [tunnelStatus, setTunnelStatus] = useState({ connected: false, token: '', server_url: '' });
  const [tunnelServerURL, setTunnelServerURL] = useState('');
  const [tunnelLoading, setTunnelLoading] = useState(false);

  const loadTunnelStatus = useCallback(async () => {
    try {
      const s = await api.getH5TunnelStatus();
      setTunnelStatus(s || { connected: false });
    } catch {}
  }, []);

  useEffect(() => { loadTunnelStatus(); }, [loadTunnelStatus]);

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

  const activeTokens = tokens.filter((t) => t.enabled);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[color:var(--text)] flex items-center gap-2">
          <Smartphone size={20} /> 远程访问
        </h2>
        <p className="text-sm text-[color:var(--text-soft)] mt-1">
          生成令牌后扫描二维码，在手机上查看桌面端的会话
        </p>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[color:var(--text)]">远程访问总开关</div>
            <div className="text-xs text-[color:var(--text-faint)] mt-0.5">
              {settings.enabled ? '已启用 — 可通过令牌从其他设备访问会话' : '已关闭 — 不接受任何远程访问'}
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              settings.enabled ? 'bg-[color:var(--accent)]' : 'bg-gray-300'
            )}
          >
            <span className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            )} />
          </button>
        </div>
      </Card>

      {settings.enabled && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-[color:var(--text)]">
              访问令牌
              {activeTokens.length > 0 && (
                <span className="ml-2 text-xs text-[color:var(--text-faint)]">{activeTokens.length} 个有效</span>
              )}
            </div>
            <Button size="sm" onClick={() => setShowGenerate(true)}>
              <Plus size={14} className="mr-1" /> 生成令牌
            </Button>
          </div>

          {tokens.length === 0 ? (
            <Card className="p-6 text-center">
              <QrCode size={32} className="mx-auto text-[color:var(--text-faint)] mb-2" />
              <p className="text-sm text-[color:var(--text-faint)]">暂无令牌，点击"生成令牌"创建一个</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <Card key={t.id} className={cn('p-3', !t.enabled && 'opacity-50')}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[color:var(--text)]">{t.label || '未命名'}</span>
                        {t.enabled ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">有效</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">已禁用</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[color:var(--text-faint)]">
                        <span className="font-mono">{t.token_preview}</span>
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} />
                          {t.expires_at ? new Date(t.expires_at).toLocaleString('zh-CN') : '永不过期'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      {t.enabled && t.access_url && (
                        <button
                          className="p-1.5 rounded-md hover:bg-[color:var(--accent-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--accent)] transition"
                          title="查看二维码"
                          onClick={() => setQrToken(t)}
                        >
                          <QrCode size={14} />
                        </button>
                      )}
                      {t.enabled && (
                        <button
                          className="p-1.5 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 text-[color:var(--text-faint)] hover:text-amber-600 transition"
                          title="禁用"
                          onClick={() => handleRevoke(t.id)}
                        >
                          <PowerOff size={14} />
                        </button>
                      )}
                      <button
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-[color:var(--text-faint)] hover:text-red-500 transition"
                        title="删除"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Card className="p-4 bg-[color:var(--bg-soft)]">
            <div className="text-xs text-[color:var(--text-faint)] space-y-1">
              <p>• 生成令牌后可扫描二维码直接在手机上访问</p>
              <p>• 手机和电脑需在同一局域网（Wi-Fi）</p>
              <p>• 有效令牌的二维码可随时点击 <QrCode size={10} className="inline" /> 图标重新查看</p>
            </div>
          </Card>
        </>
      )}

      {/* ─── 云端隧道（跨网络访问） ─── */}
      <div className="pt-4 border-t border-[color:var(--line)]">
        <h3 className="text-sm font-bold text-[color:var(--text)] flex items-center gap-2 mb-1">
          <Globe size={16} /> 云端隧道（跨网络访问）
        </h3>
        <p className="text-xs text-[color:var(--text-faint)] mb-4">
          通过你的服务器中转，不在同一 Wi-Fi 也可远程访问灵犀
        </p>

        <Card className="p-4 space-y-4">
          {/* 隧道服务器地址 */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--text)] mb-1">隧道服务器地址</label>
            <Input
              value={tunnelServerURL || tunnelStatus.server_url || ''}
              onChange={(e) => setTunnelServerURL(e.target.value)}
              placeholder="ws://你的服务器IP:9090/ws 或 wss://域名/ws"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-[color:var(--text-faint)] mt-1">
              在你的阿里云服务器上部署信令服务后填入 WebSocket 地址
            </p>
          </div>

          {/* 连接状态 + 开关 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {tunnelStatus.connected ? (
                <Wifi size={14} className="text-emerald-500" />
              ) : (
                <WifiOff size={14} className="text-[color:var(--text-faint)]" />
              )}
              <span className={cn('text-sm font-medium', tunnelStatus.connected ? 'text-emerald-600' : 'text-[color:var(--text-soft)]')}>
                {tunnelStatus.connected ? '已连接' : '未连接'}
              </span>
            </div>
            <Button
              size="sm"
              disabled={tunnelLoading}
              onClick={async () => {
                setTunnelLoading(true);
                try {
                  if (tunnelStatus.connected) {
                    await api.enableH5Tunnel({ enabled: false });
                    setTunnelStatus({ connected: false, token: '', server_url: '' });
                  } else {
                    const serverWS = tunnelServerURL || tunnelStatus.server_url;
                    if (!serverWS) { alert('请先填写隧道服务器地址'); setTunnelLoading(false); return; }
                    const result = await api.enableH5Tunnel({ enabled: true, signaling_ws: serverWS, token: tunnelStatus.token || ('lx_tunnel_' + Date.now().toString(36)) });
                    setTunnelStatus({ connected: true, token: result.token, server_url: serverWS });
                  }
                } catch (e) { alert('操作失败: ' + (e?.message || '未知错误')); }
                finally { setTunnelLoading(false); setTimeout(loadTunnelStatus, 2000); }
              }}
            >
              {tunnelLoading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              {tunnelStatus.connected ? '断开' : '连接'}
            </Button>
          </div>

          {/* 连接成功后显示访问 URL */}
          {tunnelStatus.connected && tunnelStatus.token && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">手机访问地址：</div>
              <CloudTunnelURL token={tunnelStatus.token} serverURL={tunnelServerURL || tunnelStatus.server_url} />
            </div>
          )}
        </Card>

        <Card className="p-4 mt-3 bg-[color:var(--bg-soft)]">
          <div className="text-xs text-[color:var(--text-faint)] space-y-1.5">
            <p className="font-medium text-[color:var(--text-soft)]">部署信令服务器：</p>
            <p>1. 在你的阿里云服务器上下载并运行信令服务</p>
            <p className="font-mono bg-[color:var(--bg)] px-2 py-1 rounded text-[11px]">
              git clone https://github.com/OdysseyFather/lingxi-singaling-server.git && cd lingxi-singaling-server && go build -o signaling . && PORT=9090 ./signaling
            </p>
            <p>2. 确保服务器防火墙开放 9090 端口</p>
            <p>3. 在上方填入 <code className="px-1 py-0.5 rounded bg-[color:var(--bg)] text-[11px]">ws://服务器公网IP:9090/ws</code></p>
            <p>4. 点击"连接"后，手机通过访问地址即可跨网络访问灵犀</p>
          </div>
        </Card>
      </div>

      {showGenerate && <GenerateTokenModal onClose={() => setShowGenerate(false)} onCreated={loadData} />}
      {qrToken && <QRViewModal token={qrToken} onClose={() => setQrToken(null)} />}
    </div>
  );
}

function CloudTunnelURL({ token, serverURL }) {
  const [copied, setCopied] = useState(false);
  // 从 ws:// 转换为 http:// URL
  const httpBase = serverURL
    .replace('wss://', 'https://')
    .replace('ws://', 'http://')
    .replace('/ws', '');
  const tunnelURL = `${httpBase}/tunnel/${token}/h5?token=${token}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(tunnelURL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-[color:var(--bg)] border border-[color:var(--line)]">
        <code className="flex-1 text-[11px] font-mono text-[color:var(--text-soft)] break-all select-all">{tunnelURL}</code>
        <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-[color:var(--accent-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--accent)] transition shrink-0">
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>
      <div className="flex justify-center">
        <div className="p-3 bg-white rounded-xl shadow-sm">
          <QRCodeSVG value={tunnelURL} size={160} level="M" />
        </div>
      </div>
      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 text-center">用手机扫描二维码或复制链接在微信/浏览器中打开</p>
    </div>
  );
}

function QRViewModal({ token, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(token.access_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal open title="扫码访问" onClose={onClose} width={360}>
      <div className="flex flex-col items-center space-y-4">
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <QRCodeSVG value={token.access_url} size={200} level="M" />
        </div>
        <div className="text-center">
          <div className="text-sm font-medium text-[color:var(--text)]">{token.label || '远程访问'}</div>
          <div className="text-xs text-[color:var(--text-faint)] mt-1">
            用手机相机或浏览器扫描上方二维码
          </div>
        </div>
        <div className="w-full flex items-center gap-2 p-2 rounded-lg bg-[color:var(--bg-soft)] border border-[color:var(--line)]">
          <code className="flex-1 text-[11px] font-mono text-[color:var(--text-soft)] break-all select-all">{token.access_url}</code>
          <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-[color:var(--accent-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--accent)] transition shrink-0">
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        </div>
        {token.expires_at && (
          <div className="text-[11px] text-[color:var(--text-faint)] flex items-center gap-1">
            <Clock size={10} /> 有效期至 {new Date(token.expires_at).toLocaleString('zh-CN')}
          </div>
        )}
      </div>
    </Modal>
  );
}

function GenerateTokenModal({ onClose, onCreated }) {
  const [label, setLabel] = useState('');
  const [expiresHours, setExpiresHours] = useState(24);
  const [token, setToken] = useState('');
  const [accessUrl, setAccessUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');

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
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  return (
    <Modal open title="生成访问令牌" onClose={onClose} width={420} footer={
      token ? (
        <Button onClick={onClose}>完成</Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleGenerate} disabled={creating}>{creating ? '生成中…' : '生成'}</Button>
        </div>
      )
    }>
      {token ? (
        <div className="flex flex-col items-center space-y-4">
          {accessUrl && (
            <>
              <div className="p-4 bg-white rounded-2xl shadow-sm">
                <QRCodeSVG value={accessUrl} size={200} level="M" />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-[color:var(--text)]">扫码即可在手机上访问</div>
                <div className="text-xs text-[color:var(--text-faint)] mt-1">
                  确保手机和电脑在同一 Wi-Fi 网络
                </div>
              </div>
              <div className="w-full flex items-center gap-2 p-2 rounded-lg bg-[color:var(--bg-soft)] border border-[color:var(--line)]">
                <code className="flex-1 text-[11px] font-mono text-[color:var(--text-soft)] break-all select-all">{accessUrl}</code>
                <button onClick={() => handleCopy(accessUrl, 'url')} className="p-1.5 rounded-md hover:bg-[color:var(--accent-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--accent)] transition shrink-0">
                  {copied === 'url' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </>
          )}
          <div className="w-full text-xs text-[color:var(--text-faint)] text-center">
            关闭后可在令牌列表点击 <QrCode size={10} className="inline" /> 图标重新查看二维码
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--text)] mb-1">令牌标签</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例如：iPhone 远程查看" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--text)] mb-1">有效期（小时）</label>
            <Input type="number" value={expiresHours} onChange={(e) => setExpiresHours(Number(e.target.value))} min={1} max={720} />
            <p className="text-xs text-[color:var(--text-faint)] mt-1">建议 24 小时内，最长 30 天</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[color:var(--bg-soft)] text-xs text-[color:var(--text-faint)] space-y-1">
            <p>生成后会显示二维码，用手机扫码即可访问会话。</p>
            <p>需要手机和电脑在同一 Wi-Fi 网络。</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
