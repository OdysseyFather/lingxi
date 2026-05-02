import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend,
} from 'recharts';
import { Coins, Cpu, Clock, BarChart3, Wallet, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Badge, Select } from '../ui/primitives';
import { formatNum } from '../chat/blocks';
import { useStore } from '../state/useStore';

const RANGES = [
  { v: 'today', label: '今日' },
  { v: '7d', label: '近 7 天' },
  { v: '30d', label: '近 30 天' },
  { v: '90d', label: '近 90 天' },
];

export function UsagePage() {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loadingQuota, setLoadingQuota] = useState(false);
  const profiles = useStore((s) => s.profiles);
  const active = useStore((s) => s.activeProfile);

  const load = async () => {
    const u = await api.getUsage(range).catch(() => null);
    setData(u);
  };

  useEffect(() => { load(); }, [range]);

  const loadQuota = async () => {
    if (!active) return;
    setLoadingQuota(true);
    try {
      const q = await api.getQuota(active.id);
      setQuota(q);
    } catch (e) {
      setQuota({ available: false, reason: e.message });
    } finally {
      setLoadingQuota(false);
    }
  };

  useEffect(() => { if (active) loadQuota(); }, [active?.id]);

  const summary = data?.summary || {};
  const today = data?.today || {};

  return (
    <div className="max-w-6xl mx-auto py-6 px-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">用量与计费</h1>
          <p className="text-sm text-[color:var(--text-soft)] mt-0.5">本地累计每条对话的 token 与费用，并可查询上游账户余额</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </Select>
          <Button variant="outline" size="md" onClick={load}><RefreshCw size={14} /> 刷新</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Coins size={18} />} label="本期费用" value={`$${(summary.cost_usd || 0).toFixed(4)}`} sub={`今日 $${(today.cost_usd || 0).toFixed(4)}`} />
        <StatCard icon={<Cpu size={18} />} label="输入 token" value={formatNum(summary.input_tokens || 0)} sub={`今日 ${formatNum(today.input_tokens || 0)}`} />
        <StatCard icon={<Cpu size={18} />} label="输出 token" value={formatNum(summary.output_tokens || 0)} sub={`今日 ${formatNum(today.output_tokens || 0)}`} />
        <StatCard icon={<BarChart3 size={18} />} label="请求数" value={summary.requests || 0} sub={`今日 ${today.requests || 0}`} />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">每日趋势</div>
          <Badge tone="default">USD</Badge>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={data?.by_day || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.15)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--line)' }} />
              <Legend />
              <Bar dataKey="input_tokens" name="输入" fill="#7c5cff" />
              <Bar dataKey="output_tokens" name="输出" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <div className="font-medium mb-2">按模型聚合</div>
          {(data?.by_model || []).length === 0 ? (
            <div className="py-6 text-center text-sm text-[color:var(--text-faint)]">暂无数据</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-[color:var(--text-faint)]">
                <tr><th className="text-left font-normal py-1.5">模型</th><th className="text-right font-normal">输入</th><th className="text-right font-normal">输出</th><th className="text-right font-normal">费用</th><th className="text-right font-normal">次数</th></tr>
              </thead>
              <tbody>
                {data.by_model.map((row) => (
                  <tr key={row.model} className="border-t border-[color:var(--line)]">
                    <td className="py-1.5 font-mono text-xs">{row.model || '—'}</td>
                    <td className="text-right">{formatNum(row.input_tokens)}</td>
                    <td className="text-right">{formatNum(row.output_tokens)}</td>
                    <td className="text-right">${(row.cost_usd || 0).toFixed(4)}</td>
                    <td className="text-right">{row.requests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium flex items-center gap-2"><Wallet size={16} /> 上游账户额度</div>
            <Button variant="ghost" size="sm" onClick={loadQuota} disabled={loadingQuota}>
              <RefreshCw size={12} className={loadingQuota ? 'animate-spin' : ''} /> 刷新
            </Button>
          </div>
          {!active ? (
            <div className="py-6 text-center text-sm text-[color:var(--text-faint)]">请先激活一个接入点</div>
          ) : !quota ? (
            <div className="py-6 text-center text-sm text-[color:var(--text-faint)]">加载中…</div>
          ) : !quota.available ? (
            <div className="py-6 text-center text-sm text-[color:var(--text-faint)]">
              <div>当前供应商未开放账户额度查询</div>
              {quota.reason && (
                <div className="mt-1 text-[11px] opacity-70 break-all px-3">{friendlyQuotaReason(quota.reason)}</div>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {quota.balance && <Row label="可用余额" value={`${quota.balance} ${quota.currency || ''}`} />}
              {quota.granted && <Row label="授信额度" value={`${quota.granted} ${quota.currency || ''}`} />}
              {quota.used && <Row label="已使用" value={`${quota.used} ${quota.currency || ''}`} />}
              <div className="text-[11px] text-[color:var(--text-faint)] mt-2">
                数据来源：{quota.provider} · 已缓存 60s
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="font-medium mb-2">最近请求</div>
        {(data?.recent || []).length === 0 ? (
          <div className="py-6 text-center text-sm text-[color:var(--text-faint)]">暂无记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[color:var(--text-faint)]">
                <tr>
                  <th className="text-left font-normal py-1.5">会话</th>
                  <th className="text-left font-normal">模型</th>
                  <th className="text-right font-normal">输入</th>
                  <th className="text-right font-normal">输出</th>
                  <th className="text-right font-normal">费用</th>
                  <th className="text-right font-normal">耗时</th>
                  <th className="text-right font-normal">时间</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id} className="border-t border-[color:var(--line)]">
                    <td className="py-1.5 max-w-[220px] truncate">{r.session_title || '会话 #' + r.session_id}</td>
                    <td className="font-mono text-xs">{r.model || '—'}</td>
                    <td className="text-right">{formatNum(r.input_tokens)}</td>
                    <td className="text-right">{formatNum(r.output_tokens)}</td>
                    <td className="text-right">${(r.cost_usd || 0).toFixed(4)}</td>
                    <td className="text-right">{((r.duration_ms || 0) / 1000).toFixed(1)}s</td>
                    <td className="text-right text-xs text-[color:var(--text-faint)]">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <Card className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-[color:var(--text-faint)]">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate">{value}</div>
        {sub && <div className="text-xs text-[color:var(--text-faint)]">{sub}</div>}
      </div>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--line)] py-1.5 last:border-0">
      <span className="text-[color:var(--text-soft)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// DashScope 等供应商的余额接口对个人账户常返回 HTTP 404；这里转成更友好的提示。
function friendlyQuotaReason(raw) {
  const s = String(raw || '');
  if (/HTTP\s*404/i.test(s)) return '该账号或密钥未开通余额查询权限（可正常调用模型）';
  if (/HTTP\s*401|invalid.*key|unauthorized/i.test(s)) return '密钥无效或权限不足';
  if (/HTTP\s*403/i.test(s)) return '密钥被拒绝（403），请检查权限范围';
  if (/timeout|timed out/i.test(s)) return '上游接口响应超时';
  return s;
}
