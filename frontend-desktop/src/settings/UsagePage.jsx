import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  Coins, Cpu, Clock, BarChart3, Wallet, RefreshCw, AlertTriangle, Bell,
  TrendingUp, Bot, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Badge, Select, Input } from '../ui/primitives';
import { formatNum } from '../chat/blockUtils';
import { useStore } from '../state/useStore';
import { cn } from '../ui/cn';
import AgentAvatar from '../ui/AgentAvatar';

const RANGES = [
  { v: 'today', label: '今日' },
  { v: '7d', label: '近 7 天' },
  { v: '30d', label: '近 30 天' },
  { v: '90d', label: '近 90 天' },
];

function loadBudget() {
  try {
    const raw = localStorage.getItem('lingxi-budget');
    return raw ? JSON.parse(raw) : { dailyLimit: 0, monthlyLimit: 0, alertThreshold: 80 };
  } catch { return { dailyLimit: 0, monthlyLimit: 0, alertThreshold: 80 }; }
}

function saveBudget(b) {
  localStorage.setItem('lingxi-budget', JSON.stringify(b));
}

export function UsagePage() {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loadingQuota, setLoadingQuota] = useState(false);
  const active = useStore((s) => s.activeProfile);
  const addNotification = useStore((s) => s.addNotification);
  const [budget, setBudget] = useState(loadBudget);

  const load = useCallback(async () => {
    const u = await api.getUsage(range).catch(() => null);
    setData(u);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const loadQuota = useCallback(async () => {
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
  }, [active]);

  useEffect(() => { if (active) loadQuota(); }, [active, loadQuota]);

  useEffect(() => {
    if (!data?.today) return;
    const todayCost = data.today.cost_usd || 0;
    const threshold = (budget.alertThreshold || 80) / 100;
    if (budget.dailyLimit > 0 && todayCost >= budget.dailyLimit * threshold) {
      const pct = Math.round((todayCost / budget.dailyLimit) * 100);
      addNotification?.({ title: '费用预警', body: `今日费用已达预算的 ${pct}%（$${todayCost.toFixed(4)} / $${budget.dailyLimit}）` });
    }
  }, [data?.today?.cost_usd, budget.dailyLimit, budget.alertThreshold]);

  const handleBudgetChange = (field, value) => {
    const next = { ...budget, [field]: Number(value) || 0 };
    setBudget(next);
    saveBudget(next);
  };

  const summary = data?.summary || {};
  const today = data?.today || {};
  const costTrend = data?.cost_trend || [];
  const byAgent = data?.by_agent || [];

  const dailyPct = budget.dailyLimit > 0 ? Math.min(100, ((today.cost_usd || 0) / budget.dailyLimit) * 100) : 0;
  const monthlyPct = budget.monthlyLimit > 0 ? Math.min(100, ((summary.cost_usd || 0) / budget.monthlyLimit) * 100) : 0;

  const costChange = costTrend.length >= 2
    ? (costTrend[costTrend.length - 1].cost_usd - costTrend[costTrend.length - 2].cost_usd)
    : 0;

  return (
    <div className="max-w-6xl mx-auto py-6 px-6 space-y-4">
      {/* Hero 渐变卡片 */}
      <div className="relative overflow-hidden rounded-2xl p-6 surface-grad">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-gradient-to-br from-[color:var(--accent)]/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow">
              <TrendingUp size={26} />
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-tight text-gradient">用量与计费</div>
              <p className="text-sm text-[color:var(--text-soft)] mt-0.5">实时追踪 Token 消耗与费用趋势</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
            </Select>
            <Button variant="outline" onClick={load}><RefreshCw size={14} /> 刷新</Button>
          </div>
        </div>
      </div>

      {/* 四格概览 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Coins size={18} />} label="本期费用" value={`$${(summary.cost_usd || 0).toFixed(4)}`} sub={`今日 $${(today.cost_usd || 0).toFixed(4)}`} hint={summary.has_estimated ? '含估算' : null} />
        <StatCard icon={<Cpu size={18} />} label="输入 token" value={formatNum(summary.input_tokens || 0)} sub={`缓存命中 ${formatNum(summary.cache_read_tokens || 0)}`} />
        <StatCard icon={<Cpu size={18} />} label="输出 token" value={formatNum(summary.output_tokens || 0)} sub={`今日 ${formatNum(today.output_tokens || 0)}`} />
        <StatCard icon={<BarChart3 size={18} />} label="请求数" value={summary.requests || 0} sub={`今日 ${today.requests || 0}`} />
      </div>

      {/* 费用趋势折线图 + Token 日柱图 并排 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium flex items-center gap-2">
              <TrendingUp size={14} className="text-[color:var(--accent)]" />
              费用趋势
            </div>
            {costChange !== 0 && (
              <div className={cn('text-xs font-medium flex items-center gap-0.5', costChange > 0 ? 'text-red-500' : 'text-emerald-500')}>
                {costChange > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                ${Math.abs(costChange).toFixed(4)}
              </div>
            )}
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={costTrend}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', fontSize: 12 }} formatter={v => [`$${v.toFixed(4)}`, '费用']} />
                <Area type="monotone" dataKey="cost_usd" stroke="var(--accent)" fill="url(#costGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Token 日用量</div>
            <Badge tone="default">USD</Badge>
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={data?.by_day || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="input_tokens" name="输入" fill="#7c5cff" radius={[3,3,0,0]} />
                <Bar dataKey="output_tokens" name="输出" fill="#10b981" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* 按模型 + 按智能体 并排 */}
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
          <div className="font-medium mb-2 flex items-center gap-2">
            <Bot size={14} className="text-[color:var(--accent)]" />
            按智能体聚合
          </div>
          {byAgent.length === 0 ? (
            <div className="py-6 text-center text-sm text-[color:var(--text-faint)]">暂无数据</div>
          ) : (
            <div className="space-y-2">
              {byAgent.map((row) => {
                const totalCost = (data?.summary?.cost_usd || 1);
                const pct = totalCost > 0 ? Math.round((row.cost_usd / totalCost) * 100) : 0;
                return (
                  <div key={row.agent_id} className="flex items-center gap-3">
                    <AgentAvatar avatar={row.agent_avatar} name={row.agent_name} size={28} className="rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{row.agent_name}</span>
                        <span className="text-sm font-semibold">${(row.cost_usd || 0).toFixed(4)}</span>
                      </div>
                      <div className="h-1.5 bg-[color:var(--bg-soft)] rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-gradient-to-r from-[color:var(--accent)] to-[#5e8bff] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-[color:var(--text-faint)] w-10 text-right">{pct}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 额度 + 预算 并排 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-[color:var(--accent)]" />
            <div className="font-medium">预算预警</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-[color:var(--text-faint)] mb-1 block">每日预算</label>
              <Input type="number" min="0" step="0.5" value={budget.dailyLimit || ''} placeholder="0=不限" onChange={(e) => handleBudgetChange('dailyLimit', e.target.value)} />
              {budget.dailyLimit > 0 && (
                <ProgressMini value={dailyPct} label={`$${(today.cost_usd || 0).toFixed(4)}`} />
              )}
            </div>
            <div>
              <label className="text-xs text-[color:var(--text-faint)] mb-1 block">本期预算</label>
              <Input type="number" min="0" step="1" value={budget.monthlyLimit || ''} placeholder="0=不限" onChange={(e) => handleBudgetChange('monthlyLimit', e.target.value)} />
              {budget.monthlyLimit > 0 && (
                <ProgressMini value={monthlyPct} label={`$${(summary.cost_usd || 0).toFixed(4)}`} />
              )}
            </div>
            <div>
              <label className="text-xs text-[color:var(--text-faint)] mb-1 block">预警阈值</label>
              <Input type="number" min="10" max="100" step="5" value={budget.alertThreshold} onChange={(e) => handleBudgetChange('alertThreshold', e.target.value)} />
              <div className="text-[10px] text-[color:var(--text-faint)] mt-1">达到此%时弹出提醒</div>
            </div>
          </div>
          {(dailyPct >= (budget.alertThreshold || 80) || monthlyPct >= (budget.alertThreshold || 80)) && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle size={16} /> 费用已接近或超过预算阈值
            </div>
          )}
        </Card>
      </div>

      {/* 最近请求 */}
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
                    <td className="text-right">${(r.cost_usd || 0).toFixed(4)}{r.estimated && <span className="text-[10px] text-amber-500 ml-0.5">~</span>}</td>
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

function StatCard({ icon, label, value, sub, hint }) {
  return (
    <Card className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-[color:var(--text-faint)]">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate flex items-center gap-1.5">
          {value}
          {hint && <span className="text-[10px] font-normal text-amber-500/80">{hint}</span>}
        </div>
        {sub && <div className="text-xs text-[color:var(--text-faint)]">{sub}</div>}
      </div>
    </Card>
  );
}

function ProgressMini({ value, label }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-[color:var(--text-faint)] mb-0.5">
        <span>{label}</span>
        <span>{value.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-[color:var(--bg-soft)] rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', value >= 80 ? 'bg-red-500' : value >= 50 ? 'bg-amber-500' : 'bg-emerald-500')}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
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

function friendlyQuotaReason(raw) {
  const s = String(raw || '');
  if (/HTTP\s*404/i.test(s)) return '该账号或密钥未开通余额查询权限（可正常调用模型）';
  if (/HTTP\s*401|invalid.*key|unauthorized/i.test(s)) return '密钥无效或权限不足';
  if (/HTTP\s*403/i.test(s)) return '密钥被拒绝（403），请检查权限范围';
  if (/timeout|timed out/i.test(s)) return '上游接口响应超时';
  return s;
}
