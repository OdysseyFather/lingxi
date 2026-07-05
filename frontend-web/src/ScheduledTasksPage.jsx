import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Clock, Plus, Trash2, Play, Pause, Settings2, ChevronRight,
  ToggleLeft, ToggleRight, Bell, BellOff, RefreshCw, History,
  Zap, CalendarClock, CheckCircle2, XCircle, Loader2, ExternalLink,
  Timer, Activity, TrendingUp,
} from 'lucide-react';
import { api } from './api/client';
import { useStore } from './state/useStore';
import { Button, Card, Modal, Input, Badge, Select } from './ui/primitives';
import { cn } from './ui/cn';
import AgentAvatar from './ui/AgentAvatar';

const SCHEDULE_PRESETS = [
  { value: 'every_1m', label: '每分钟' },
  { value: 'every_5m', label: '每 5 分钟' },
  { value: 'every_10m', label: '每 10 分钟' },
  { value: 'every_15m', label: '每 15 分钟' },
  { value: 'every_30m', label: '每 30 分钟' },
  { value: 'every_1h', label: '每小时' },
  { value: 'every_2h', label: '每 2 小时' },
  { value: 'every_6h', label: '每 6 小时' },
  { value: 'every_12h', label: '每 12 小时' },
  { value: 'daily_09:00', label: '每天 09:00' },
  { value: 'daily_18:00', label: '每天 18:00' },
  { value: 'weekly_1_09:00', label: '每周一 09:00' },
  { value: 'monthly_1_09:00', label: '每月 1 日 09:00' },
  { value: 'custom', label: '自定义 Cron' },
];

function formatCron(expr) {
  const preset = SCHEDULE_PRESETS.find(p => p.value === expr);
  if (preset) return preset.label;
  if (expr.startsWith('every_')) {
    const val = expr.slice(6);
    if (val.endsWith('m')) return `每 ${val.replace('m', '')} 分钟`;
    if (val.endsWith('h')) return `每 ${val.replace('h', '')} 小时`;
  }
  if (expr.startsWith('daily_')) return `每天 ${expr.slice(6)}`;
  if (expr.startsWith('weekly_')) {
    const parts = expr.slice(7).split('_');
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `每周${days[parseInt(parts[0])] || parts[0]} ${parts[1] || ''}`;
  }
  if (expr.startsWith('monthly_')) {
    const parts = expr.slice(8).split('_');
    return `每月 ${parts[0]} 日 ${parts[1] || ''}`;
  }
  return expr;
}

function formatTime(t) {
  if (!t) return '--';
  const d = new Date(t);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (today) return `今天 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function relativeCountdown(t) {
  if (!t) return '';
  const diff = new Date(t) - Date.now();
  if (diff <= 0) return '即将执行';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分钟后`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时${mins % 60 > 0 ? (mins % 60) + '分' : ''}后`;
  return `${Math.floor(hrs / 24)}天后`;
}

export default function ScheduledTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [runsOpen, setRunsOpen] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const agents = useStore(s => s.agents);
  const setView = useStore(s => s.setView);
  const setActiveSession = useStore(s => s.setActiveSession);
  const runningTasks = useStore(s => s.runningScheduledTasks || {});
  const taskHistory = useStore(s => s.scheduledTaskHistory || []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const list = await api.listScheduledTasks().catch(() => []);
    setTasks(list);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (taskHistory.length > 0) loadTasks();
  }, [taskHistory.length]);

  const stats = useMemo(() => {
    const active = tasks.filter(t => t.enabled).length;
    const running = Object.keys(runningTasks).length;
    const totalRuns = tasks.reduce((s, t) => s + (t.run_count || 0), 0);
    return { total: tasks.length, active, running, totalRuns };
  }, [tasks, runningTasks]);

  const handleToggle = async (task) => {
    await api.toggleScheduledTask(task.id, !task.enabled).catch(() => {});
    loadTasks();
  };

  const handleTrigger = async (task) => {
    await api.triggerScheduledTask(task.id).catch(() => {});
    useStore.getState().pushNotification({ title: '已触发', body: `定时任务「${task.name}」将在下次调度时执行` });
  };

  const handleDelete = async (id) => {
    await api.deleteScheduledTask(id).catch(() => {});
    setDeleteConfirm(null);
    loadTasks();
  };

  const handleViewRuns = async (task) => {
    setRunsOpen(task);
    setRunsLoading(true);
    const r = await api.listScheduledTaskRuns(task.id).catch(() => []);
    setRuns(r);
    setRunsLoading(false);
  };

  const handleViewSession = (sessionId) => {
    setActiveSession(sessionId);
    setView('chat');
  };

  const openEdit = (task) => {
    setEditTask(task || {
      name: '', prompt: '', agent_id: 0, cron_expr: 'every_1h',
      stateful: false, notify_desktop: true, enabled: true,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editTask.name || !editTask.cron_expr) return;
    if (editTask.id) {
      await api.updateScheduledTask(editTask.id, editTask).catch(() => {});
    } else {
      await api.createScheduledTask(editTask).catch(() => {});
    }
    setEditOpen(false);
    setEditTask(null);
    loadTasks();
  };

  const presetMatch = SCHEDULE_PRESETS.find(p => p.value === editTask?.cron_expr);
  const isCustomCron = editTask && !presetMatch;

  return (
    <div className="max-w-5xl mx-auto">
      {/* 渐变 Hero 卡片 */}
      <div className="relative overflow-hidden rounded-2xl mb-6 p-6 surface-grad">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-gradient-to-br from-[color:var(--accent)]/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow">
            <Clock size={26} />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold tracking-tight text-gradient">定时任务</div>
            <div className="text-sm text-[color:var(--text-soft)]">设置周期性自动执行的 Agent 任务，让 AI 持续为你工作</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadTasks}><RefreshCw size={14} /> 刷新</Button>
            <Button onClick={() => openEdit(null)}><Plus size={14} /> 新建任务</Button>
          </div>
        </div>
      </div>

      {/* 统计卡片行 */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <MiniStat icon={<CalendarClock size={16} />} label="全部任务" value={stats.total} />
          <MiniStat icon={<Activity size={16} />} label="已启用" value={stats.active} color="emerald" />
          <MiniStat icon={<Zap size={16} />} label="运行中" value={stats.running} color="amber" pulse={stats.running > 0} />
          <MiniStat icon={<TrendingUp size={16} />} label="累计执行" value={stats.totalRuns} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-[color:var(--text-faint)]">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" /> 加载中…
        </div>
      ) : tasks.length === 0 ? (
        <Card className="text-center py-16">
          <CalendarClock size={48} className="mx-auto mb-4 text-[color:var(--text-faint)]" />
          <p className="text-lg font-medium text-[color:var(--text-soft)]">暂无定时任务</p>
          <p className="text-sm text-[color:var(--text-faint)] mt-1">创建一个定时任务，让 Agent 自动为你工作</p>
          <Button className="mt-4" onClick={() => openEdit(null)}><Plus size={14} /> 创建第一个任务</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => {
            const agent = agents.find(a => a.id === task.agent_id);
            const runningInfo = runningTasks[task.id];
            const countdown = task.enabled && task.next_run_at ? relativeCountdown(task.next_run_at) : null;
            return (
              <Card key={task.id} className={cn(
                'p-0 transition-all hover:-translate-y-0.5 hover:shadow-glow group overflow-hidden',
                !task.enabled && 'opacity-60',
                runningInfo && 'border-[color:var(--accent)]/40 shadow-[0_0_24px_var(--accent-glow)]',
              )}>
                {runningInfo && (
                  <div className="flex items-center gap-2 text-xs px-4 py-2 bg-[color:var(--accent-soft)] text-[color:var(--accent)] border-b border-[color:var(--accent)]/20">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="font-medium">正在执行…</span>
                    <button
                      onClick={() => handleViewSession(runningInfo.session_id)}
                      className="ml-auto hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink size={11} /> 查看实时输出
                    </button>
                  </div>
                )}
                <div className="flex items-start gap-4 p-4">
                  <div className="shrink-0 mt-0.5">
                    {agent ? (
                      <AgentAvatar avatar={agent.avatar} name={agent.name} size={40} className="rounded-xl" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-soft)] flex items-center justify-center">
                        <Timer size={20} className="text-[color:var(--accent)]" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold truncate">{task.name}</span>
                      {runningInfo ? (
                        <Badge tone="accent">执行中</Badge>
                      ) : task.enabled ? (
                        <Badge tone="success">已启用</Badge>
                      ) : (
                        <Badge tone="warn">已暂停</Badge>
                      )}
                      {task.stateful && <Badge tone="info">有状态</Badge>}
                      {task.notify_desktop && <Bell size={12} className="text-[color:var(--text-faint)]" />}
                    </div>
                    <p className="text-sm text-[color:var(--text-soft)] mt-1 line-clamp-2">{task.prompt || '(未设置提示词)'}</p>
                    <div className="flex items-center gap-3 mt-2.5 text-[11px] text-[color:var(--text-faint)] flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[color:var(--bg-soft)]">
                        <Clock size={11} /> {formatCron(task.cron_expr)}
                      </span>
                      {agent && (
                        <span className="inline-flex items-center gap-1">
                          {agent.name}
                        </span>
                      )}
                      <span>已执行 {task.run_count} 次</span>
                      {task.last_run_at && <span>上次: {formatTime(task.last_run_at)}</span>}
                      {countdown && (
                        <span className="inline-flex items-center gap-1 text-[color:var(--accent)] font-medium">
                          <Timer size={11} /> {countdown}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => handleToggle(task)}
                      className="p-2 rounded-lg hover:bg-[color:var(--bg-soft)] transition"
                      title={task.enabled ? '暂停' : '启用'}
                    >
                      {task.enabled
                        ? <ToggleRight size={20} className="text-emerald-500" />
                        : <ToggleLeft size={20} className="text-[color:var(--text-faint)]" />}
                    </button>
                    <button
                      onClick={() => handleTrigger(task)}
                      className="p-2 rounded-lg hover:bg-amber-500/10 transition text-[color:var(--text-soft)] hover:text-amber-500"
                      title="立即执行"
                    >
                      <Zap size={16} />
                    </button>
                    <button
                      onClick={() => handleViewRuns(task)}
                      className="p-2 rounded-lg hover:bg-[color:var(--bg-soft)] transition text-[color:var(--text-soft)]"
                      title="执行记录"
                    >
                      <History size={16} />
                    </button>
                    <button
                      onClick={() => openEdit(task)}
                      className="p-2 rounded-lg hover:bg-[color:var(--bg-soft)] transition text-[color:var(--text-soft)]"
                      title="编辑"
                    >
                      <Settings2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(task)}
                      className="p-2 rounded-lg hover:bg-red-500/10 transition text-[color:var(--text-faint)] hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      <Modal open={editOpen} onClose={() => { setEditOpen(false); setEditTask(null); }} title={editTask?.id ? '编辑定时任务' : '新建定时任务'} width={540} footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setEditOpen(false); setEditTask(null); }}>取消</Button>
          <Button onClick={handleSave} disabled={!editTask?.name || !editTask?.cron_expr}>保存</Button>
        </div>
      }>
        {editTask && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[color:var(--text-soft)] mb-1">任务名称</label>
                <Input
                  value={editTask.name}
                  onChange={e => setEditTask({ ...editTask, name: e.target.value })}
                  placeholder="例如：每日工作汇总"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--text-soft)] mb-1">使用智能体</label>
                <Select
                  value={editTask.agent_id || 0}
                  onChange={e => setEditTask({ ...editTask, agent_id: parseInt(e.target.value) })}
                >
                  {agents.map(a => {
                    const isEmoji = a.avatar && a.avatar.length <= 8 && !a.avatar.startsWith('/api/uploads/') && !a.avatar.startsWith('http');
                    return <option key={a.id} value={a.id}>{isEmoji ? a.avatar : '✦'} {a.name}</option>;
                  })}
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--text-soft)] mb-1">任务提示词</label>
              <textarea
                value={editTask.prompt}
                onChange={e => setEditTask({ ...editTask, prompt: e.target.value })}
                placeholder="告诉 Agent 需要做什么…"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-[color:var(--bg-elev)] text-[color:var(--text)] border-[color:var(--line)] focus:border-[color:var(--accent)]/60 focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--text-soft)] mb-1">执行频率</label>
              <Select
                value={isCustomCron ? 'custom' : editTask.cron_expr}
                onChange={e => {
                  if (e.target.value === 'custom') {
                    setEditTask({ ...editTask, cron_expr: '' });
                  } else {
                    setEditTask({ ...editTask, cron_expr: e.target.value });
                  }
                }}
              >
                {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
              {(isCustomCron || editTask.cron_expr === '') && (
                <Input
                  value={editTask.cron_expr}
                  onChange={e => setEditTask({ ...editTask, cron_expr: e.target.value })}
                  placeholder="Cron 表达式：分 时 日 月 周（如 0 9 * * 1）"
                  className="mt-2"
                />
              )}
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editTask.stateful}
                  onChange={e => setEditTask({ ...editTask, stateful: e.target.checked })}
                  className="accent-[var(--accent)] w-3.5 h-3.5"
                />
                <span className="text-sm">有状态（保持同一会话）</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editTask.notify_desktop !== false}
                  onChange={e => setEditTask({ ...editTask, notify_desktop: e.target.checked })}
                  className="accent-[var(--accent)] w-3.5 h-3.5"
                />
                <span className="text-sm">完成后通知</span>
              </label>
            </div>
            {editTask.stateful && (
              <p className="text-xs text-[color:var(--text-faint)] bg-[color:var(--bg-soft)] p-2.5 rounded-lg">
                有状态模式下，每次执行会复用同一会话，Agent 可以记住上一次执行的内容。
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* 执行记录弹窗（时间线风格） */}
      <Modal open={!!runsOpen} onClose={() => { setRunsOpen(null); setRuns([]); }} title={`执行记录 — ${runsOpen?.name || ''}`} width={600}>
        {runsLoading ? (
          <div className="text-center py-10 text-[color:var(--text-faint)]">
            <Loader2 size={20} className="animate-spin mx-auto mb-2" /> 加载中…
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-10 text-[color:var(--text-faint)]">
            <History size={32} className="mx-auto mb-2 opacity-40" />
            暂无执行记录
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-2.5 top-0 bottom-0 w-px bg-[color:var(--line)]" />
            <div className="space-y-0">
              {runs.map((run, i) => (
                <div key={run.id} className="relative pb-4 last:pb-0">
                  <div className={cn(
                    'absolute -left-[15px] top-1 w-3 h-3 rounded-full border-2 bg-[color:var(--bg)]',
                    run.status === 'completed' ? 'border-emerald-500' : run.status === 'failed' ? 'border-red-500' : 'border-[color:var(--accent)]',
                  )} />
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-[color:var(--bg-soft)] hover:bg-[color:var(--bg-elev)] transition ml-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{formatTime(run.started_at)}</span>
                        <Badge tone={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'info'}>
                          {run.status === 'completed' ? '完成' : run.status === 'failed' ? '失败' : '运行中'}
                        </Badge>
                        {run.finished_at && (
                          <span className="text-[11px] text-[color:var(--text-faint)]">
                            耗时 {((new Date(run.finished_at) - new Date(run.started_at)) / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {run.summary && (
                        <p className="text-xs text-[color:var(--text-soft)] mt-1 line-clamp-2">{run.summary}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleViewSession(run.session_id)}
                      className="p-1.5 rounded-lg hover:bg-[color:var(--accent-soft)] transition text-[color:var(--text-faint)] hover:text-[color:var(--accent)] shrink-0"
                      title="查看会话"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* 删除确认 */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="删除定时任务" width={400}>
        <p className="text-sm text-[color:var(--text-soft)] mb-4">
          确定要删除定时任务「{deleteConfirm?.name}」吗？关联的执行记录也会被删除。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteConfirm(null)}>取消</Button>
          <Button className="bg-red-600 hover:bg-red-500 text-white" onClick={() => handleDelete(deleteConfirm.id)}>删除</Button>
        </div>
      </Modal>
    </div>
  );
}

function MiniStat({ icon, label, value, color, pulse }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elev)]">
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
        color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500' :
        color === 'amber' ? 'bg-amber-500/10 text-amber-500' :
        'bg-[color:var(--accent-soft)] text-[color:var(--accent)]',
        pulse && 'animate-pulse',
      )}>
        {icon}
      </div>
      <div>
        <div className="text-lg font-bold leading-tight">{value}</div>
        <div className="text-[10px] text-[color:var(--text-faint)] uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}
