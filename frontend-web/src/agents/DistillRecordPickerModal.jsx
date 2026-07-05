import { useEffect, useState } from 'react';
import { Check, FlaskConical, Loader2 } from 'lucide-react';
import { Button, Modal, Badge } from '../ui/primitives';
import { cn } from '../ui/cn';
import { api } from '../api/client';

export default function DistillRecordPickerModal({ open, onClose, onSelect }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    setDetail(null);
    api.listDistillRecords()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api.getDistillRecord(selectedId).then(setDetail).catch(() => setDetail(null));
  }, [selectedId]);

  const handleConfirm = async () => {
    if (!selectedId) return;
    const data = await api.applyDistillRecord(selectedId);
    onSelect?.(data);
    onClose();
  };

  const parseFiles = (json) => {
    try { return JSON.parse(json || '[]'); } catch { return []; }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="从蒸馏记录导入"
      width={720}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleConfirm} disabled={!selectedId}>
            <Check size={14} /> 导入到智能体
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[color:var(--accent)]" /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-[color:var(--text-soft)] py-8 text-center">
          暂无蒸馏记录。请先在「人格蒸馏」中完成蒸馏，系统会自动保存。
        </p>
      ) : (
        <div className="grid grid-cols-[220px_1fr] gap-4 min-h-[320px]">
          <div className="space-y-1 overflow-y-auto max-h-[400px] pr-1">
            {list.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2 border transition text-sm',
                  selectedId === r.id
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                    : 'border-[color:var(--line)] hover:bg-[color:var(--bg-soft)]'
                )}
              >
                <div className="font-medium truncate">{r.alias || r.name}</div>
                <div className="text-[10px] text-[color:var(--text-faint)]">
                  v{r.version} · {r.updated_at?.slice(0, 16)}
                </div>
              </button>
            ))}
          </div>
          {detail ? (
            <div className="space-y-3 text-sm overflow-y-auto max-h-[400px]">
              <div>
                <Badge tone="accent">{detail.family}</Badge>
                <span className="ml-2 font-semibold">{detail.name || detail.alias}</span>
                <span className="text-[color:var(--text-faint)] ml-2">slug: {detail.slug}</span>
              </div>
              {detail.description && (
                <p className="text-[color:var(--text-soft)]">{detail.description}</p>
              )}
              <div>
                <div className="text-xs font-medium text-[color:var(--text-soft)] mb-1">原材料</div>
                <ul className="text-xs space-y-0.5">
                  {parseFiles(detail.source_files_json).map((f, i) => (
                    <li key={i}>· {f.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--text-soft)] mb-1">产出文件</div>
                <ul className="text-xs space-y-0.5">
                  {parseFiles(detail.output_files_json).map((f, i) => (
                    <li key={i}>· {f.name}</li>
                  ))}
                </ul>
              </div>
              <pre className="text-xs bg-[color:var(--bg-soft)] p-3 rounded-lg whitespace-pre-wrap max-h-40 overflow-y-auto">
                {(detail.system_prompt || '').slice(0, 800)}
                {(detail.system_prompt || '').length > 800 ? '…' : ''}
              </pre>
            </div>
          ) : (
            <div className="flex items-center justify-center text-[color:var(--text-faint)] text-sm">
              选择左侧记录查看详情
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
