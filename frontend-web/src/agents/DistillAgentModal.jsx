import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Upload, Wand2, Users, Heart, Star, Check, AlertCircle,
  Plus, Trash2, ListOrdered,
} from 'lucide-react';
import { Button, Input, Textarea, Modal, Badge } from '../ui/primitives';
import { cn } from '../ui/cn';
import { api, authFetch } from '../api/client';

const FAMILIES = [
  { id: 'colleague', label: '同事/职场', desc: '同事、导师、队友', icon: Users },
  { id: 'relationship', label: '亲密关系', desc: '家人、朋友、伴侣', icon: Heart },
  { id: 'celebrity', label: '公众人物', desc: '偶像、思想家、虚构角色', icon: Star },
];

/** 同时进行的蒸馏任务数（后端为独立 SSE 请求，可按机器性能调整） */
const MAX_PARALLEL = 5;

function newJob(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    alias: '',
    profile: '',
    personality: '',
    recordId: 0,
    files: [],
    status: 'pending',
    progress: 0,
    preview: null,
    error: '',
    ...overrides,
  };
}

async function streamDistillOne({
  family, alias, profile, personality, researchProfile, files, recordId, onProgress, onLog,
}) {
  const form = new FormData();
  form.append('family', family);
  form.append('alias', alias.trim());
  form.append('profile', profile || '');
  form.append('personality', personality || '');
  if (family === 'celebrity') form.append('research_profile', researchProfile);
  if (recordId > 0) form.append('record_id', String(recordId));
  files.forEach((f) => form.append('files', f));

  const resp = await authFetch('/api/agents/distill/stream', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || '蒸馏失败');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let currentEvent = 'text';
  let preview = null;
  let tick = 5;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('event: ')) currentEvent = line.slice(7).trim();
      else if (line.startsWith('data: ')) {
        const raw = line.slice(6);
        if (raw === '[DONE]') continue;
        let chunk = raw;
        try { chunk = JSON.parse(raw); } catch { /* keep */ }
        if (currentEvent === 'text' && chunk) {
          tick = Math.min(88, tick + 0.4);
          onProgress?.(tick);
          onLog?.('text', chunk);
        } else if (currentEvent === 'thinking' && chunk) {
          onLog?.('thinking', chunk);
        } else if (currentEvent === 'tool_start') {
          tick = Math.min(88, tick + 2);
          onProgress?.(tick);
          onLog?.('tool', chunk?.name || '');
        } else if (currentEvent === 'preview') {
          preview = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
          onProgress?.(100);
        } else if (currentEvent === 'error') {
          throw new Error(typeof chunk === 'string' ? chunk : chunk?.error || '蒸馏失败');
        }
        currentEvent = 'text';
      }
    }
  }
  if (!preview?.slug) throw new Error('未收到蒸馏预览结果');
  return preview;
}

function ProgressBar({ value, active }) {
  return (
    <div className="h-1.5 rounded-full bg-[color:var(--bg-soft)] overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300',
          active ? 'bg-[color:var(--accent)]' : 'bg-emerald-500'
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export default function DistillAgentModal({
  open, onClose, onApply, initialRedistill = null, onRecordsChanged,
}) {
  const [family, setFamily] = useState('colleague');
  const [researchProfile, setResearchProfile] = useState('budget-friendly');
  const [importKb, setImportKb] = useState(false);
  const [installSkill, setInstallSkill] = useState(false);

  const [status, setStatus] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [jobs, setJobs] = useState([newJob()]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const pickJobIdRef = useRef(null);

  const updateJob = useCallback((id, patch) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  useEffect(() => {
    if (!open) return;
    api.getDistillStatus().then(setStatus).catch(() => setStatus(null));
    setError('');
    setBatchRunning(false);
    setSelectedId(null);
    if (initialRedistill) {
      setFamily(initialRedistill.family || 'colleague');
      setJobs([newJob({
        alias: initialRedistill.alias || '',
        profile: initialRedistill.profile || '',
        personality: initialRedistill.personality_hint || '',
        recordId: initialRedistill.id || 0,
      })]);
    } else {
      setJobs([newJob()]);
    }
  }, [open, initialRedistill]);

  const ensureDotSkill = async () => {
    if (status?.dot_skill_installed) return true;
    setInstalling(true);
    try {
      await api.installDotSkill();
      const s = await api.getDistillStatus();
      setStatus(s);
      return s?.dot_skill_installed;
    } catch (e) {
      setError(e.message || '安装 dot-skill 失败');
      return false;
    } finally {
      setInstalling(false);
    }
  };

  const runOneJob = async (job) => {
    updateJob(job.id, { status: 'running', progress: 5, error: '', preview: null });
    try {
      const preview = await streamDistillOne({
        family,
        alias: job.alias,
        profile: job.profile,
        personality: job.personality,
        researchProfile,
        files: job.files,
        recordId: job.recordId || 0,
        onProgress: (p) => updateJob(job.id, { progress: p }),
      });
      updateJob(job.id, {
        status: 'done',
        progress: 100,
        recordId: preview.record_id || job.recordId,
        preview: { ...preview, _importKbFiles: job.files },
      });
      setSelectedId((sid) => sid || job.id);
      onRecordsChanged?.();
    } catch (e) {
      updateJob(job.id, { status: 'error', error: e.message, progress: 0 });
    }
  };

  const handleBatchDistill = async () => {
    const queue = jobs.filter((j) => j.alias.trim() && j.status !== 'running');
    if (!queue.length || batchRunning) return;
    setError('');
    const ok = await ensureDotSkill();
    if (!ok) return;

    setBatchRunning(true);
    queue.forEach((j) => {
      if (j.status === 'done') return;
      updateJob(j.id, { status: 'pending', progress: 0, error: '', preview: null });
    });

    const pending = queue.filter((j) => j.status !== 'done');
    const parallel = Math.min(MAX_PARALLEL, Math.max(1, pending.length));
    let idx = 0;
    const worker = async () => {
      while (idx < pending.length) {
        const i = idx++;
        await runOneJob(pending[i]);
      }
    };
    await Promise.all(Array.from({ length: parallel }, () => worker()));
    setBatchRunning(false);
  };

  const handleApplyJob = async (job) => {
    if (!job?.preview) return;
    setBatchRunning(true);
    try {
      const result = job.preview.record_id
        ? await api.applyDistillRecord(job.preview.record_id)
        : await api.applyDistillResult({
          family: job.preview.family || family,
          slug: job.preview.slug,
          alias: job.alias,
          profile: job.profile,
          personality: job.personality,
          install_skill: installSkill,
        });
      const merged = {
        ...job.preview,
        ...result,
        name: result.name || job.alias,
        _importKbFiles: importKb ? job.files : undefined,
      };
      onApply?.(merged);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBatchRunning(false);
    }
  };

  const onFilePick = (list, jobId) => {
    const arr = Array.from(list || []);
    if (jobId) {
      updateJob(jobId, { files: [...(jobs.find((j) => j.id === jobId)?.files || []), ...arr] });
    }
  };

  const selected = jobs.find((j) => j.id === selectedId) || jobs.find((j) => j.status === 'done' && j.preview);
  const runnable = jobs.filter((j) => j.alias.trim()).length;
  const doneCount = jobs.filter((j) => j.status === 'done').length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="人格蒸馏（dot-skill）"
      width={760}
      footer={
        <div className="flex items-center justify-between w-full gap-2 flex-wrap">
          <div className="text-xs text-[color:var(--text-faint)]">
            {status?.dot_skill_installed ? (
              <span className="text-emerald-600">dot-skill 已就绪</span>
            ) : (
              <span>需安装 dot-skill</span>
            )}
            {batchRunning && (
              <span className="ml-2 text-[color:var(--accent)]">
                并行蒸馏中（最多 {MAX_PARALLEL} 人同时进行）…
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>关闭</Button>
            {selected?.preview ? (
              <Button onClick={() => handleApplyJob(selected)} disabled={batchRunning}>
                <Check size={14} /> 填入向导（{selected.alias}）
              </Button>
            ) : (
              <Button
                onClick={handleBatchDistill}
                disabled={batchRunning || installing || runnable === 0}
              >
                {batchRunning || installing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Wand2 size={14} />
                )}
                开始蒸馏{runnable > 1 ? `（${runnable} 人）` : ''}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {FAMILIES.map((f) => {
            const Icon = f.icon;
            const active = family === f.id;
            return (
              <button
                key={f.id}
                type="button"
                disabled={batchRunning}
                onClick={() => setFamily(f.id)}
                className={cn(
                  'p-2 rounded-xl border text-left transition',
                  active
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                    : 'border-[color:var(--line)] hover:bg-[color:var(--bg-soft)]'
                )}
              >
                <Icon size={16} className={active ? 'text-[color:var(--accent)]' : ''} />
                <div className="font-medium text-xs mt-1">{f.label}</div>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-soft)] px-3 py-2 text-xs text-[color:var(--text-soft)]">
          支持<strong className="text-[color:var(--text)]">多人并行</strong>蒸馏（同时最多 {MAX_PARALLEL} 个）。
          完成后<strong className="text-[color:var(--text)]">自动保存</strong>到蒸馏记录（独立存储，默认不装技能/知识库）。
          重新蒸馏已有人物会更新同一条记录并递增版本号。
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-1">
            <ListOrdered size={14} />
            蒸馏队列
            {doneCount > 0 && (
              <Badge tone="success">{doneCount} 已完成</Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={batchRunning}
            onClick={() => setJobs((prev) => [...prev, newJob()])}
          >
            <Plus size={14} /> 添加一人
          </Button>
        </div>

        <div className="space-y-3">
          {jobs.map((job, index) => (
            <div
              key={job.id}
              className={cn(
                'rounded-xl border p-3 space-y-2 transition',
                selectedId === job.id && job.preview
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]/20'
                  : 'border-[color:var(--line)]'
              )}
            >
              <div className="flex items-start gap-2">
                <span className="text-xs text-[color:var(--text-faint)] w-5 pt-2">{index + 1}</span>
                <div className="flex-1 space-y-2 min-w-0">
                  <Input
                    value={job.alias}
                    disabled={batchRunning}
                    onChange={(e) => updateJob(job.id, { alias: e.target.value })}
                    placeholder="花名/代号 *（如 张三、李四）"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={job.profile}
                      disabled={batchRunning}
                      onChange={(e) => updateJob(job.id, { profile: e.target.value })}
                      placeholder="基本信息（可选）"
                    />
                    <Input
                      value={job.personality}
                      disabled={batchRunning}
                      onChange={(e) => updateJob(job.id, { personality: e.target.value })}
                      placeholder="性格标签（可选）"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={batchRunning}
                      onClick={() => {
                        pickJobIdRef.current = job.id;
                        fileRef.current?.click();
                      }}
                    >
                      <Upload size={12} /> 上传材料
                    </Button>
                    {job.files.map((f, i) => (
                      <Badge key={i} tone="neutral">{f.name}</Badge>
                    ))}
                    {job.files.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => updateJob(job.id, { files: [] })}>
                        清空文件
                      </Button>
                    )}
                  </div>
                  {(job.status === 'running' || job.progress > 0) && (
                    <div className="space-y-1">
                      <ProgressBar value={job.progress} active={job.status === 'running'} />
                      <div className="text-[10px] text-[color:var(--text-faint)] flex justify-between">
                        <span>
                          {job.status === 'pending' && '等待中'}
                          {job.status === 'running' && '蒸馏中…'}
                          {job.status === 'done' && '已完成'}
                          {job.status === 'error' && '失败'}
                        </span>
                        <span>{Math.round(job.progress)}%</span>
                      </div>
                    </div>
                  )}
                  {job.error && (
                    <p className="text-xs text-red-500">{job.error}</p>
                  )}
                  {job.recordId > 0 && job.status !== 'done' && (
                    <Badge tone="info">更新记录 #{job.recordId}</Badge>
                  )}
                  {job.preview && (
                    <button
                      type="button"
                      className="text-left w-full text-xs rounded-lg bg-[color:var(--bg-soft)] p-2 hover:ring-1 ring-[color:var(--accent)]"
                      onClick={() => setSelectedId(job.id)}
                    >
                      <span className="font-medium">{job.preview.name || job.alias}</span>
                      <span className="text-[color:var(--text-faint)] ml-2">
                        {job.preview.record_id ? `#${job.preview.record_id}` : ''} · {job.preview.slug}
                      </span>
                      <p className="text-[color:var(--text-soft)] mt-1 line-clamp-2">
                        {(job.preview.system_prompt || '').slice(0, 120)}…
                      </p>
                    </button>
                  )}
                </div>
                {jobs.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={batchRunning}
                    onClick={() => {
                      setJobs((prev) => prev.filter((j) => j.id !== job.id));
                      if (selectedId === job.id) setSelectedId(null);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onFilePick(e.target.files, pickJobIdRef.current);
            pickJobIdRef.current = null;
            e.target.value = '';
          }}
        />

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={installSkill} onChange={(e) => setInstallSkill(e.target.checked)} />
          同时安装为 Claude Skill
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={importKb} onChange={(e) => setImportKb(e.target.checked)} />
          填入向导后导入材料到知识库
        </label>
      </div>
    </Modal>
  );
}
