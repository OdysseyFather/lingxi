import { useState, useEffect } from 'react';
import { Bell, Clock, Play, Sparkles, Bot } from 'lucide-react';
import { Button, Input, Select, Card } from '../ui/primitives';
import { cn } from '../ui/cn';
import { api } from '../api/client';
import { useStore } from '../state/useStore';

export default function ProactiveAgentPage() {
  const agents = useStore((s) => s.agents);
  const [config, setConfig] = useState({
    digest_enabled: false,
    digest_time: '09:00',
    digest_agent_id: '1',
  });
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [digestResult, setDigestResult] = useState(null);

  useEffect(() => {
    api.getProactiveConfig().then(setConfig).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProactiveConfig(config);
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    setDigestResult(null);
    try {
      const res = await api.triggerDigest();
      setDigestResult(res.digest || res.summary || '暂无数据');
    } catch (err) {
      setDigestResult('生成失败：' + (err.message || '未知错误'));
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold [color:var(--text)] flex items-center gap-2">
          <Sparkles size={20} className="text-amber-500" />
          主动式 Agent
        </h2>
        <p className="text-sm [color:var(--text-soft)] mt-1">
          让 Agent 主动为你生成每日工作摘要，追踪未完成的任务。
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-blue-500" />
            <span className="text-sm font-medium [color:var(--text)]">每日工作摘要</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.digest_enabled}
              onChange={(e) => setConfig({ ...config, digest_enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:bg-blue-500 transition-colors">
              <div className={cn(
                'w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5',
                config.digest_enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
              )} />
            </div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium [color:var(--text-soft)] mb-1 block">
              <Clock size={12} className="inline mr-1" /> 推送时间
            </label>
            <Input
              type="time"
              value={config.digest_time}
              onChange={(e) => setConfig({ ...config, digest_time: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium [color:var(--text-soft)] mb-1 block">
              <Bot size={12} className="inline mr-1" /> 执行 Agent
            </label>
            <Select
              value={config.digest_agent_id}
              onChange={(e) => setConfig({ ...config, digest_agent_id: e.target.value })}
            >
              {agents.map((a) => (
                <option key={a.id} value={String(a.id)}>{a.avatar} {a.name}</option>
              ))}
            </Select>
          </div>
        </div>

        <p className="text-xs [color:var(--text-faint)]">
          每天在指定时间，Agent 会自动汇总你当天的工作活动（对话数、消息量、token 用量、进化记录等），生成一份简洁的工作日报。
        </p>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? '保存中...' : '保存设置'}
          </Button>
          <Button variant="ghost" onClick={handleTrigger} disabled={triggering} size="sm">
            <Play size={14} className="mr-1" />
            {triggering ? '生成中...' : '立即生成日报'}
          </Button>
        </div>
      </Card>

      {digestResult && (
        <Card className="p-4 border-l-4 border-l-amber-400">
          <div className="text-xs font-medium text-amber-600 mb-2">今日工作摘要</div>
          <div className="text-sm [color:var(--text)] whitespace-pre-wrap">{digestResult}</div>
        </Card>
      )}
    </div>
  );
}
