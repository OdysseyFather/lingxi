import { useState, useEffect } from 'react';
import { Wifi, Globe, Save } from 'lucide-react';
import { api } from '../api/client';
import { Button, Input, Card } from '../ui/primitives';

export default function NexusSettingsPage() {
  const [settings, setSettings] = useState({ visible: true, nickname: '', listen_port: 3001, wan_enabled: true, signaling_url: 'wss://lingxi-singaling-server.onrender.com/ws' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getNexusSettings().then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateNexusSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wifi size={16} className="text-[color:var(--accent)]" />
        <h3 className="text-sm font-semibold text-[color:var(--text)]">网络与协作</h3>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-[color:var(--text)]">对外可见</div>
            <div className="text-xs text-[color:var(--text-faint)]">开启后其他局域网内的灵犀实例可发现你</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.visible}
              onChange={(e) => setSettings({ ...settings, visible: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[color:var(--bg-soft)] peer-checked:bg-[color:var(--accent)] rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4" />
          </label>
        </div>

        <div>
          <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">昵称</label>
          <Input
            value={settings.nickname}
            onChange={(e) => setSettings({ ...settings, nickname: e.target.value })}
            placeholder="对外显示的名称（留空使用主机名）"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">监听端口</label>
          <Input
            type="number"
            value={settings.listen_port}
            onChange={(e) => setSettings({ ...settings, listen_port: Number(e.target.value) })}
            min={1024}
            max={65535}
          />
          <p className="text-[10px] text-[color:var(--text-faint)] mt-1">默认 3001，修改后需重启生效</p>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            <Save size={14} />
            {saved ? '已保存' : '保存'}
          </Button>
        </div>
      </Card>

      {/* 广域网设置 */}
      <div className="flex items-center gap-2 mt-6">
        <Globe size={16} className="text-purple-500" />
        <h3 className="text-sm font-semibold text-[color:var(--text)]">广域网 (WAN)</h3>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-[color:var(--text)]">启用广域网</div>
            <div className="text-xs text-[color:var(--text-faint)]">连接信令服务器，支持跨公网发现和建联</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.wan_enabled}
              onChange={(e) => setSettings({ ...settings, wan_enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[color:var(--bg-soft)] peer-checked:bg-purple-500 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4" />
          </label>
        </div>

        <div>
          <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">信令服务器地址</label>
          <Input
            value={settings.signaling_url}
            onChange={(e) => setSettings({ ...settings, signaling_url: e.target.value })}
            placeholder="默认：wss://lingxi-singaling-server.onrender.com/ws"
            disabled={!settings.wan_enabled}
          />
          <p className="text-[10px] text-[color:var(--text-faint)] mt-1">推荐使用 https (WSS) 以保证通信安全</p>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            <Save size={14} />
            {saved ? '已保存' : '保存'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
