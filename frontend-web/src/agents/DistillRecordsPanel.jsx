import { useCallback, useEffect, useState } from 'react';
import {
  FlaskConical, Trash2, RefreshCw, Loader2, ChevronRight,
  FileText, FolderOpen, Wand2,
} from 'lucide-react';
import { Button, Modal, Badge } from '../ui/primitives';
import { cn } from '../ui/cn';
import { api } from '../api/client';

function parseFiles(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}

export default function DistillRecordsPanel({ open, onClose, onRedistill, onApplyToAgent }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    api.listDistillRecords()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api.getDistillRecord(selectedId).then(setDetail).catch(() => setDetail(null));
  }, [selectedId]);

  const handleDelete = async (id, alias) => {
    if (!confirm(`删除「${alias}」的蒸馏记录？本地存档将一并删除。`)) return;
    await api.deleteDistillRecord(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const handleApply = async () => {
    if (!detail) return;
    const data = await api.applyDistillRecord(detail.id);
    onApplyToAgent?.(data);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="蒸馏记录管理"
      width={800}
      footer={
        <div className="flex justify-between w-full">
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 刷新
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>关闭</Button>
            {detail && (
              <>
                <Button variant="outline" onClick={() => onRedistill?.(detail)}>
                  <Wand2 size={14} /> 重新蒸馏
                </Button>
                <Button onClick={handleApply}>
                  创建智能体
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      {loading && !list.length ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-[color:var(--text-soft)] text-sm">
          <FlaskConical size={32} className="mx-auto mb-2 opacity-40" />
          暂无记录。完成人格蒸馏后会自动保存在此，不写入技能库/知识库。
        </div>
      ) : (
        <div className="grid grid-cols-[240px_1fr] gap-4 min-h-[360px]">
          <div className="space-y-1 overflow-y-auto max-h-[420px]">
            {list.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'rounded-lg border p-2 cursor-pointer transition flex items-center gap-1',
                  selectedId === r.id
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]/30'
                    : 'border-[color:var(--line)] hover:bg-[color:var(--bg-soft)]'
                )}
                onClick={() => setSelectedId(r.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{r.alias || r.name}</div>
                  <div className="text-[10px] text-[color:var(--text-faint)]">
                    {r.family} · v{r.version}
                  </div>
                </div>
                <ChevronRight size={14} className="text-[color:var(--text-faint)] shrink-0" />
              </div>
            ))}
          </div>

          {detail ? (
            <div className="space-y-4 overflow-y-auto max-h-[420px] pr-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-lg">{detail.alias || detail.name}</h3>
                  <div className="text-xs text-[color:var(--text-faint)] mt-0.5">
                    ID {detail.id} · slug <code>{detail.slug}</code> · 更新 {detail.updated_at}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(detail.id, detail.alias)}>
                  <Trash2 size={14} />
                </Button>
              </div>

              {detail.profile && (
                <div className="text-sm"><span className="text-[color:var(--text-faint)]">基本信息：</span>{detail.profile}</div>
              )}
              {detail.personality_hint && (
                <div className="text-sm"><span className="text-[color:var(--text-faint)]">性格：</span>{detail.personality_hint}</div>
              )}
              {detail.description && (
                <div className="text-sm text-[color:var(--text-soft)]">{detail.description}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[color:var(--line)] p-3">
                  <div className="text-xs font-medium flex items-center gap-1 mb-2">
                    <FolderOpen size={12} /> 原材料 ({parseFiles(detail.source_files_json).length})
                  </div>
                  <ul className="text-xs space-y-1 max-h-24 overflow-y-auto">
                    {parseFiles(detail.source_files_json).map((f, i) => (
                      <li key={i} className="truncate" title={f.name}>{f.name}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-[color:var(--line)] p-3">
                  <div className="text-xs font-medium flex items-center gap-1 mb-2">
                    <FileText size={12} /> 产出 ({parseFiles(detail.output_files_json).length})
                  </div>
                  <ul className="text-xs space-y-1">
                    {parseFiles(detail.output_files_json).map((f, i) => (
                      <li key={i}>
                        <a
                          href={api.distillRecordFileUrl(detail.id, f.path)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[color:var(--accent)] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {f.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-[color:var(--text-soft)] mb-1">人物特征（system prompt）</div>
                <pre className="text-xs bg-[color:var(--bg-soft)] p-3 rounded-lg whitespace-pre-wrap max-h-48 overflow-y-auto border border-[color:var(--line)]">
                  {detail.system_prompt || '（空）'}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center text-[color:var(--text-faint)] text-sm">
              选择左侧记录
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
