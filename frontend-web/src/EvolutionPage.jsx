import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dna, Trash2, RefreshCw, Brain, BookOpen, Wrench, Loader2, ChevronDown, ChevronUp, Zap, Clock, BarChart3, TrendingUp, Undo2, Search, Filter, Check, AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from './api/client';
import { useStore } from './state/useStore';
import { Button, Badge, Card, Input } from './ui/primitives';
import { cn } from './ui/cn';

const ACTION_META = {
  create_memory:     { label: '记忆', icon: Brain, tone: 'info', color: 'blue' },
  add_memory:        { label: '记忆', icon: Brain, tone: 'info', color: 'blue' },
  create_knowledge:  { label: '知识', icon: BookOpen, tone: 'success', color: 'emerald' },
  add_knowledge:     { label: '知识', icon: BookOpen, tone: 'success', color: 'emerald' },
  fix_skill:         { label: '技能修复', icon: Wrench, tone: 'warning', color: 'amber' },
  knowledge_extract: { label: '知识提炼', icon: Zap, tone: 'accent', color: 'purple' },
  failed:            { label: '失败', icon: AlertCircle, tone: 'error', color: 'red' },
  no_action:         { label: '无需进化', icon: Check, tone: 'default', color: 'gray' },
};

const TRIGGER_LABELS = {
  auto_tool_fix:     '自动（工具修复）',
  auto_correction:   '自动（用户纠正）',
  auto_valuable:     '自动（有价值对话）',
  auto:              '自动',
  manual:            '手动提取',
  knowledge_extract: '对话知识提炼',
};

function actionMeta(action) {
  return ACTION_META[action] || { label: action, icon: Dna, tone: 'default', color: 'purple' };
}

export default function EvolutionPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [revertingId, setRevertingId] = useState(null);
  const agents = useStore((s) => s.agents);
  const evolutionActivity = useStore((s) => s.evolutionActivity);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const logsData = await api.listAllEvolutionLogs(200);
      setLogs(Array.isArray(logsData) ? logsData : []);
    } catch (e) {
      console.error('[EvolutionPage] load logs failed:', e);
    }
    try {
      const statsData = await api.getEvolutionStats();
      setStats(statsData);
    } catch (e) {
      console.error('[EvolutionPage] load stats failed:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (evolutionActivity?.length > 0) {
      const latest = evolutionActivity[0];
      if (latest.phase === 'done' || latest.phase === 'result' || latest.phase === 'reverted') {
        load();
      }
    }
  }, [evolutionActivity, load]);

  const handleDelete = async (id) => {
    await api.deleteEvolutionLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const handleRevert = async (log) => {
    setRevertingId(log.id);
    try {
      await api.revertEvolutionLog(log.id);
      setLogs((prev) => prev.map((l) => l.id === log.id ? { ...l, status: 'reverted' } : l));
    } catch (e) {
      console.error('revert failed:', e);
    }
    setRevertingId(null);
  };

  const agentName = (id) => {
    const a = agents.find((a) => a.id === id);
    return a?.name || (id ? `Agent #${id}` : '系统');
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts.replace(' ', 'T'));
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (filterStatus !== 'all' && (log.status || 'active') !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSummary = (log.summary || '').toLowerCase().includes(q);
      const matchAgent = agentName(log.agent_id).toLowerCase().includes(q);
      if (!matchSummary && !matchAgent) return false;
    }
    return true;
  });

  const liveStatus = evolutionActivity?.[0];
  const isRunning = liveStatus?.phase === 'analyzing' || liveStatus?.phase === 'executing';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Dna size={20} className="text-purple-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold">自我进化历程</h1>
            <p className="text-xs text-[color:var(--text-faint)]">
              记录 Agent 从对话中学到的记忆、知识和技能修复
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新
        </Button>
      </div>

      {/* Live Status Bar */}
      {isRunning && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 animate-pulse">
          <Loader2 size={16} className="animate-spin text-amber-500" />
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
            {liveStatus.message || '正在分析...'}
          </span>
        </div>
      )}

      {/* 后台进化扫描器配置 */}
      <ScannerConfigCard />

      {/* Stats Cards */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={TrendingUp} label="总进化次数" value={stats.total} color="purple" />
          <StatCard icon={Brain} label="记忆" value={(stats.by_action?.create_memory || 0) + (stats.by_action?.add_memory || 0)} color="blue" />
          <StatCard icon={BookOpen} label="知识" value={(stats.by_action?.create_knowledge || 0) + (stats.by_action?.add_knowledge || 0)} color="emerald" />
          <StatCard icon={Wrench} label="技能修复" value={stats.by_action?.fix_skill || 0} color="amber" />
        </div>
      )}

      {/* Activity Chart */}
      {stats?.recent_days && Object.keys(stats.recent_days).length > 1 && (
        <EvolutionCharts stats={stats} />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索进化记录..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-[color:var(--text)]"
        >
          <option value="all">全部类型</option>
          <option value="create_memory">记忆</option>
          <option value="create_knowledge">知识</option>
          <option value="fix_skill">技能修复</option>
          <option value="no_action">无需进化</option>
          <option value="failed">失败</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-[color:var(--text)]"
        >
          <option value="all">全部状态</option>
          <option value="active">生效中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="reverted">已撤销</option>
        </select>
        {(searchQuery || filterAction !== 'all' || filterStatus !== 'all') && (
          <button
            onClick={() => { setSearchQuery(''); setFilterAction('all'); setFilterStatus('all'); }}
            className="text-[10px] text-[color:var(--accent)] hover:underline"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* Timeline */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-[color:var(--text-faint)]">
          <Loader2 size={20} className="animate-spin mr-2" />
          加载中...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-20">
          <Dna size={40} className="mx-auto mb-3 text-[color:var(--text-faint)] opacity-30" />
          <p className="text-sm text-[color:var(--text-faint)]">
            {logs.length === 0 ? '暂无进化记录' : `无匹配结果（共 ${logs.length} 条被筛选隐藏）`}
          </p>
          <p className="text-xs text-[color:var(--text-faint)] mt-1">
            {logs.length === 0
              ? '开启智能体的自我进化功能后，对话中的学习成果将记录在这里'
              : '尝试修改筛选条件或点击"清除筛选"'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const meta = actionMeta(log.action);
            const Icon = meta.icon;
            const expanded = expandedId === log.id;
            const isReverted = (log.status || 'active') === 'reverted';
            let detail = null;
            try { detail = log.detail ? JSON.parse(log.detail) : null; } catch { /* ignore */ }

            return (
              <div
                key={log.id}
                className={cn(
                  'group rounded-xl border transition-all',
                  isReverted ? 'border-[color:var(--line)] opacity-60 bg-[color:var(--bg-soft)]' : 'border-[color:var(--line)] bg-[color:var(--bg)]',
                  expanded && !isReverted && 'ring-1 ring-[color:var(--accent)] border-[color:var(--accent)]'
                )}
              >
                <button
                  className="w-full flex items-start gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                    `bg-${meta.color}-500/10 text-${meta.color}-500`,
                    meta.color === 'blue' && 'bg-blue-500/10 text-blue-500',
                    meta.color === 'emerald' && 'bg-emerald-500/10 text-emerald-500',
                    meta.color === 'amber' && 'bg-amber-500/10 text-amber-500',
                    meta.color === 'purple' && 'bg-purple-500/10 text-purple-500',
                  )}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {isReverted && (
                        <Badge tone="default" className="line-through opacity-70">已撤销</Badge>
                      )}
                      <span className="text-xs text-[color:var(--text-faint)]">
                        {agentName(log.agent_id)}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]">
                        {TRIGGER_LABELS[log.trigger] || log.trigger}
                      </span>
                      <span className="ml-auto text-[10px] text-[color:var(--text-faint)] flex items-center gap-1 shrink-0">
                        <Clock size={10} />
                        {formatTime(log.created_at)}
                      </span>
                    </div>
                    <p className={cn(
                      'text-sm mt-1 line-clamp-2',
                      isReverted ? 'text-[color:var(--text-faint)] line-through' : 'text-[color:var(--text)]'
                    )}>
                      {log.summary}
                    </p>
                  </div>
                  <div className="shrink-0 mt-1 text-[color:var(--text-faint)]">
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-3 border-t border-[color:var(--line)] pt-3 space-y-3">
                    {/* Readable content */}
                    {detail && (
                      <EvolutionDetailView action={log.action} detail={detail} />
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between text-xs text-[color:var(--text-faint)]">
                      <span>ID: {log.id} · Session: #{log.session_id} · 目标: {log.target_type} #{log.target_id}</span>
                      <div className="flex items-center gap-2">
                        {!isReverted && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRevert(log); }}
                            disabled={revertingId === log.id}
                            className="flex items-center gap-1 text-amber-500 hover:text-amber-600 transition"
                          >
                            {revertingId === log.id ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                            撤销
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }}
                          className="flex items-center gap-1 text-red-400 hover:text-red-500 transition"
                        >
                          <Trash2 size={12} /> 删除
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EvolutionDetailView({ action, detail }) {
  if (action === 'create_memory' || action === 'add_memory') {
    return (
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Brain size={12} className="text-blue-500" />
          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">记忆内容</span>
        </div>
        <p className="text-xs text-[color:var(--text)] leading-relaxed whitespace-pre-wrap">
          {detail.content || detail.Content || JSON.stringify(detail, null, 2)}
        </p>
        {detail.reason && (
          <p className="text-[10px] text-[color:var(--text-faint)] mt-2 pt-2 border-t border-blue-500/10">
            原因: {detail.reason}
          </p>
        )}
      </div>
    );
  }

  if (action === 'create_knowledge' || action === 'add_knowledge') {
    return (
      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <BookOpen size={12} className="text-emerald-500" />
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">知识内容</span>
        </div>
        {detail.title && (
          <div className="text-xs font-medium text-[color:var(--text)] mb-1">{detail.title}</div>
        )}
        <p className="text-xs text-[color:var(--text-soft)] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto scrollable">
          {detail.content || detail.Content || JSON.stringify(detail, null, 2)}
        </p>
        {detail.reason && (
          <p className="text-[10px] text-[color:var(--text-faint)] mt-2 pt-2 border-t border-emerald-500/10">
            原因: {detail.reason}
          </p>
        )}
      </div>
    );
  }

  if (action === 'fix_skill') {
    return (
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Wrench size={12} className="text-amber-500" />
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">技能修复详情</span>
        </div>
        {detail.skill_name && (
          <div className="text-xs font-medium text-[color:var(--text)] mb-1">技能: {detail.skill_name}</div>
        )}
        {detail.reason && (
          <p className="text-xs text-[color:var(--text-soft)] mb-1">原因: {detail.reason}</p>
        )}
        {detail.patch && (
          <pre className="text-[10px] bg-[color:var(--bg-soft)] rounded p-2 overflow-x-auto whitespace-pre-wrap text-[color:var(--text-soft)] max-h-32 overflow-y-auto scrollable mt-2">
            {detail.patch}
          </pre>
        )}
        {detail.backup && (
          <p className="text-[10px] text-[color:var(--text-faint)] mt-1">备份: {detail.backup}</p>
        )}
      </div>
    );
  }

  return (
    <pre className="text-xs bg-[color:var(--bg-soft)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto text-[color:var(--text-soft)]">
      {JSON.stringify(detail, null, 2)}
    </pre>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    purple: 'from-purple-500/10 to-purple-500/5 text-purple-500',
    blue: 'from-blue-500/10 to-blue-500/5 text-blue-500',
    emerald: 'from-emerald-500/10 to-emerald-500/5 text-emerald-500',
    amber: 'from-amber-500/10 to-amber-500/5 text-amber-500',
  };
  return (
    <div className={cn('rounded-xl bg-gradient-to-br p-4 border border-[color:var(--line)]', colors[color])}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} />
        <span className="text-xs font-medium text-[color:var(--text-soft)]">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function MiniChart({ data }) {
  return null;
}

const PIE_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6'];

const ACTION_LABELS = {
  create_memory: '创建记忆',
  add_memory: '添加记忆',
  create_knowledge: '创建知识',
  add_knowledge: '添加知识',
  fix_skill: '技能修复',
  knowledge_extract: '知识提炼',
  no_action: '无需进化',
  failed: '失败',
};

function EvolutionCharts({ stats }) {
  const trendData = useMemo(() => {
    if (!stats.recent_days) return [];
    return Object.entries(stats.recent_days)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date: date.slice(5), count }));
  }, [stats.recent_days]);

  const actionData = useMemo(() => {
    if (!stats.by_action) return [];
    return Object.entries(stats.by_action)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: ACTION_LABELS[name] || name, value }));
  }, [stats.by_action]);

  const triggerData = useMemo(() => {
    if (!stats.by_trigger) return [];
    return Object.entries(stats.by_trigger)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: TRIGGER_LABELS[name] || name, value }));
  }, [stats.by_trigger]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-purple-500" />
          <span className="text-xs font-medium text-[color:var(--text-soft)]">近 30 天进化趋势</span>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="evoGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)' }}
                labelStyle={{ fontSize: 11, color: 'var(--text-soft)' }}
                formatter={(v) => [`${v} 次`, '进化']}
              />
              <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} fill="url(#evoGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {(actionData.length > 0 || triggerData.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {actionData.length > 0 && (
            <Card className="p-4">
              <div className="text-xs font-medium text-[color:var(--text-soft)] mb-2">按进化类型分布</div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={actionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30} paddingAngle={2}>
                      {actionData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [`${v} 次`]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          {triggerData.length > 0 && (
            <Card className="p-4">
              <div className="text-xs font-medium text-[color:var(--text-soft)] mb-2">按触发源分布</div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={triggerData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30} paddingAngle={2}>
                      {triggerData.map((_, i) => <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [`${v} 次`]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// 后台进化扫描器配置面板
function ScannerConfigCard() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const evoActivity = useStore((s) => s.evolutionActivity || []);
  const lastScan = evoActivity.find((a) => a.phase === 'scan_done' || a.phase === 'scan_start');

  useEffect(() => {
    api.getEvolutionScannerConfig().then(setCfg).catch(() => {});
  }, []);

  if (!cfg) return null;

  const save = async (patch) => {
    const merged = { ...cfg, ...patch };
    setCfg(merged);
    setSaving(true);
    try {
      await api.updateEvolutionScannerConfig(merged);
    } catch {}
    setSaving(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-[color:var(--accent)]" />
          <span className="text-sm font-semibold">后台自动进化</span>
          {cfg.enabled ? (
            <Badge tone="success">已启用</Badge>
          ) : (
            <Badge tone="default">已暂停</Badge>
          )}
          {saving && <Loader2 size={12} className="animate-spin text-[color:var(--text-faint)]" />}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-[color:var(--text-soft)]">启用</span>
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => save({ enabled: e.target.checked })}
            className="accent-[var(--accent)]"
          />
        </label>
      </div>
      <p className="text-xs text-[color:var(--text-faint)] mb-3">
        系统会定期巡检所有开启进化的 Agent，自动从有价值的对话中提炼记忆与知识，无需手动点击。
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-[color:var(--text-faint)] mb-1">扫描周期（小时）</div>
          <input
            type="number" min={1} max={48}
            value={cfg.scan_interval_hours}
            onChange={(e) => save({ scan_interval_hours: parseInt(e.target.value) || 6 })}
            className="w-full px-2 py-1 rounded border border-[color:var(--line)] bg-[color:var(--bg-elev)]"
          />
        </div>
        <div>
          <div className="text-[color:var(--text-faint)] mb-1">最少消息数</div>
          <input
            type="number" min={2} max={50}
            value={cfg.min_session_messages}
            onChange={(e) => save({ min_session_messages: parseInt(e.target.value) || 10 })}
            className="w-full px-2 py-1 rounded border border-[color:var(--line)] bg-[color:var(--bg-elev)]"
          />
        </div>
        <div>
          <div className="text-[color:var(--text-faint)] mb-1">冷却时间（小时）</div>
          <input
            type="number" min={1} max={168}
            value={cfg.cooldown_hours}
            onChange={(e) => save({ cooldown_hours: parseInt(e.target.value) || 24 })}
            className="w-full px-2 py-1 rounded border border-[color:var(--line)] bg-[color:var(--bg-elev)]"
          />
        </div>
        <div>
          <div className="text-[color:var(--text-faint)] mb-1">安静时段（开始-结束）</div>
          <div className="flex gap-1 items-center">
            <input
              type="number" min={-1} max={23}
              value={cfg.quiet_start}
              onChange={(e) => save({ quiet_start: parseInt(e.target.value) })}
              className="w-1/2 px-2 py-1 rounded border border-[color:var(--line)] bg-[color:var(--bg-elev)]"
            />
            <span>-</span>
            <input
              type="number" min={-1} max={23}
              value={cfg.quiet_end}
              onChange={(e) => save({ quiet_end: parseInt(e.target.value) })}
              className="w-1/2 px-2 py-1 rounded border border-[color:var(--line)] bg-[color:var(--bg-elev)]"
            />
          </div>
        </div>
      </div>
      {lastScan && (
        <div className="mt-3 text-[11px] text-[color:var(--text-faint)] pt-2 border-t border-[color:var(--line)]">
          最近一次巡检：{lastScan.message || lastScan.phase}
          {typeof lastScan.dispatched === 'number' && ` · 触发 ${lastScan.dispatched} 次进化`}
        </div>
      )}
    </Card>
  );
}
