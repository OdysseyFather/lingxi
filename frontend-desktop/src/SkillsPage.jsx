import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Upload, Wand2, Download, Trash2, ChevronDown, ChevronRight,
  Loader2, CheckCircle2, AlertCircle, FileText, FolderOpen, Code2,
  Eye, Edit3, Save, X, Store, Search, Star, Users, ExternalLink, ShieldCheck,
  CheckSquare, Square,
} from 'lucide-react';
import { Button, Card, Badge, Modal, EmptyState, SkeletonCard } from './ui/primitives';
import { cn } from './ui/cn';
import { api } from './api/client';

function getFileIcon(path) {
  if (path.endsWith('.md')) return FileText;
  if (path.endsWith('.py') || path.endsWith('.sh')) return Code2;
  if (path.endsWith('.js') || path.endsWith('.ts')) return Code2;
  return FolderOpen;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');

  const [genDesc, setGenDesc] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genLogs, setGenLogs] = useState([]);
  const [genPreview, setGenPreview] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [editedFiles, setEditedFiles] = useState({});

  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResults, setUploadResults] = useState([]);
  const [viewSkill, setViewSkill] = useState(null);
  const [viewEditable, setViewEditable] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);
  const fileInputRef = useRef(null);
  const logRef = useRef(null);

  const [mpQuery, setMpQuery] = useState('');
  const [mpResults, setMpResults] = useState([]);
  const [mpPagination, setMpPagination] = useState(null);
  const [mpPage, setMpPage] = useState(1);
  const mpLoaded = useRef(false);

  useEffect(() => { fetchSkills(); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [genLogs]);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/skills', { credentials: 'include' });
      const data = await r.json();
      setSkills(data || []);
    } finally { setLoading(false); }
  };

  const handleInstall = async (skill) => {
    setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, _loading: true } : s));
    try {
      await fetch(`/api/skills/${skill.id}/install`, { method: 'POST', credentials: 'include' });
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, installed: true, _loading: false } : s));
    } catch { setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, _loading: false } : s)); }
  };

  const handleUninstall = async (skill) => {
    setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, _loading: true } : s));
    try {
      await fetch(`/api/skills/${skill.id}/uninstall`, { method: 'POST', credentials: 'include' });
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, installed: false, _loading: false } : s));
    } catch { setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, _loading: false } : s)); }
  };

  const handleDelete = async (skill) => {
    if (!confirm(`确认删除 skill "${skill.name}"？此操作不可恢复。`)) return;
    await fetch(`/api/skills/${skill.id}`, { method: 'DELETE', credentials: 'include' });
    setSkills(prev => prev.filter(s => s.id !== skill.id));
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = skills.every(s => selected.has(s.id));
    setSelected(() => {
      const next = new Set();
      if (!allSelected) skills.forEach(s => next.add(s.id));
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 个技能？此操作不可恢复。`)) return;
    setBatchDeleting(true);
    try {
      await fetch('/api/skills/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: [...selected] }),
      });
      setSelected(new Set());
      setBatchMode(false);
      fetchSkills();
    } finally { setBatchDeleting(false); }
  };

  const handleBatchExport = async () => {
    if (selected.size === 0) return;
    setBatchExporting(true);
    try {
      const res = await fetch('/api/skills/batch-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skills-export-${selected.size}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally { setBatchExporting(false); }
  };

  const exitBatchMode = () => { setBatchMode(false); setSelected(new Set()); };

  const handleUploadFiles = async (files) => {
    const zipFiles = Array.from(files).filter(f => f.name.endsWith('.zip'));
    if (zipFiles.length === 0) { setUploadError('请上传 .zip 格式的文件'); return; }
    setUploadError('');
    setUploadResults([]);
    setUploadLoading(true);
    try {
      if (zipFiles.length === 1) {
        const form = new FormData();
        form.append('file', zipFiles[0]);
        const r = await fetch('/api/skills/upload', { method: 'POST', credentials: 'include', body: form });
        const data = await r.json();
        if (!r.ok) { setUploadError(data.error || '上传失败'); return; }
        setSkills(prev => { const exists = prev.find(s => s.id === data.id); return exists ? prev.map(s => s.id === data.id ? data : s) : [data, ...prev]; });
        setUploadResults([{ filename: zipFiles[0].name, success: true }]);
      } else {
        const form = new FormData();
        zipFiles.forEach(f => form.append('files', f));
        const r = await fetch('/api/skills/batch-upload', { method: 'POST', credentials: 'include', body: form });
        const data = await r.json();
        if (!r.ok) { setUploadError(data.error || '批量上传失败'); return; }
        const results = data.results || [];
        setUploadResults(results);
        results.forEach(res => {
          if (res.success && res.skill) {
            setSkills(prev => { const exists = prev.find(s => s.id === res.skill.id); return exists ? prev.map(s => s.id === res.skill.id ? res.skill : s) : [res.skill, ...prev]; });
          }
        });
      }
    } catch (e) { setUploadError('上传失败: ' + e.message); }
    finally { setUploadLoading(false); }
  };

  const handleDrop = (e) => { e.preventDefault(); setUploadDragging(false); handleUploadFiles(e.dataTransfer.files); };

  const handleGenerate = useCallback(async () => {
    if (!genDesc.trim() || genLoading) return;
    setGenLoading(true); setGenLogs([]); setGenPreview(null); setEditedFiles({});
    try {
      const resp = await fetch('/api/skills/generate/stream', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: genDesc }) });
      if (!resp.ok) { const err = await resp.json(); setGenLogs(prev => [...prev, { type: 'error', text: err.error || '生成失败' }]); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', currentEvent = 'text';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { currentEvent = line.slice(7).trim(); }
          else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            if (raw === '[DONE]') continue;
            let chunk = raw;
            try { chunk = JSON.parse(raw); } catch { /* keep raw */ }
            if (currentEvent === 'text' && chunk) {
              setGenLogs(prev => { const last = prev[prev.length - 1]; return last?.type === 'text' ? [...prev.slice(0, -1), { type: 'text', text: last.text + chunk }] : [...prev, { type: 'text', text: chunk }]; });
            } else if (currentEvent === 'tool_start') { setGenLogs(prev => [...prev, { type: 'tool', text: `调用工具: ${chunk.name || ''}`, done: false }]); }
            else if (currentEvent === 'tool_end') { setGenLogs(prev => { const last = prev[prev.length - 1]; return last?.type === 'tool' ? [...prev.slice(0, -1), { ...last, done: true }] : prev; }); }
            else if (currentEvent === 'preview') { setGenPreview(chunk); const initFiles = {}; (chunk.files || []).forEach(f => { initFiles[f.path] = f.content; }); setEditedFiles(initFiles); if (chunk.files?.length > 0) setEditingFile(chunk.files[0].path); }
            else if (currentEvent === 'error') { setGenLogs(prev => [...prev, { type: 'error', text: chunk }]); }
            currentEvent = 'text';
          }
        }
      }
    } catch (e) { setGenLogs(prev => [...prev, { type: 'error', text: e.message }]); }
    finally { setGenLoading(false); }
  }, [genDesc, genLoading]);

  const handleConfirm = async () => {
    if (!genPreview) return;
    setGenLoading(true);
    try {
      const r = await fetch('/api/skills/generate/confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmpDir: genPreview.tmpDir, skillName: genPreview.skillName, files: editedFiles }) });
      const data = await r.json();
      if (!r.ok) { alert(data.error || '提交失败'); return; }
      setSkills(prev => { const exists = prev.find(s => s.id === data.id); return exists ? prev.map(s => s.id === data.id ? data : s) : [data, ...prev]; });
      setGenPreview(null); setGenLogs([]); setGenDesc(''); setEditedFiles({}); setActiveTab('list');
    } catch (e) { alert('提交失败: ' + e.message); }
    finally { setGenLoading(false); }
  };

  const TABS = [
    { id: 'list', label: '已有技能', icon: Sparkles },
    { id: 'marketplace', label: '技能市场', icon: Store },
    { id: 'generate', label: 'AI 生成', icon: Wand2 },
    { id: 'upload', label: '上传压缩包', icon: Upload },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl mb-6 p-6 surface-grad">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-gradient-to-br from-[color:var(--accent)]/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow">
            <Sparkles size={26} />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold tracking-tight text-gradient">技能管理</div>
            <div className="text-sm text-[color:var(--text-soft)]">导入、生成、安装和管理本地技能</div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-[color:var(--bg-soft)] rounded-lg mb-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition',
              activeTab === t.id ? 'bg-[color:var(--bg-elev)] shadow-soft text-[color:var(--accent)] font-medium' : 'text-[color:var(--text-soft)] hover:text-[color:var(--text)]'
            )}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'list' && (
        <div>
          {skills.length > 0 && (
            <div className="flex items-center justify-end gap-1.5 mb-4">
              {batchMode ? (
                <>
                  <Button size="sm" variant="ghost" onClick={toggleSelectAll}>
                    {skills.every(s => selected.has(s.id)) ? <CheckSquare size={14} /> : <Square size={14} />}
                    {skills.every(s => selected.has(s.id)) ? '取消全选' : '全选'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={exitBatchMode}>取消</Button>
                  <Button size="sm" variant="outline" onClick={handleBatchExport} disabled={selected.size === 0 || batchExporting}>
                    {batchExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    导出 ({selected.size})
                  </Button>
                  <Button size="sm" variant="danger" onClick={handleBatchDelete} disabled={selected.size === 0 || batchDeleting}>
                    {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    删除 ({selected.size})
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setBatchMode(true)}>
                  <CheckSquare size={14} /> 批量操作
                </Button>
              )}
            </div>
          )}
          {loading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : skills.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="还没有技能"
              description="去 AI 生成或上传一个技能吧"
            />
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {skills.map(skill => (
                  <motion.div key={skill.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                    <SkillCard
                      skill={skill}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      onDelete={handleDelete}
                      onView={(s, ed) => { setViewSkill(s); setViewEditable(ed); }}
                      batchMode={batchMode}
                      isSelected={selected.has(skill.id)}
                      onToggle={() => toggleSelect(skill.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {activeTab === 'generate' && (
        <div className="max-w-3xl">
          {!genPreview ? (
            <>
              <div className="mb-5">
                <div className="text-sm font-medium mb-2">描述你想要的技能功能</div>
                <textarea
                  className="w-full min-h-[140px] rounded-lg px-4 py-3 bg-[color:var(--bg-elev)] border border-[color:var(--line)] text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30 focus:border-[color:var(--accent)] resize-y text-sm"
                  value={genDesc} onChange={e => setGenDesc(e.target.value)} disabled={genLoading}
                  placeholder={`例如：\n• 帮我创建一个 MySQL 数据库运维 skill\n• 创建一个 Git 工作流 skill\n• 我需要一个 Python 代码质量检查 skill`}
                />
                <Button className="mt-3" onClick={handleGenerate} disabled={genLoading || !genDesc.trim()}>
                  {genLoading ? <><Loader2 size={14} className="animate-spin" />生成中...</> : <><Wand2 size={14} />开始生成</>}
                </Button>
              </div>
              {genLogs.length > 0 && (
                <Card className="max-h-[300px] overflow-y-auto scrollable" ref={logRef}>
                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)] mb-2 font-medium">生成过程</div>
                  {genLogs.map((log, i) => (
                    <div key={i} className={cn('text-sm leading-relaxed', log.type === 'error' && 'text-red-500', log.type === 'tool' && 'flex items-center gap-2 text-xs text-[color:var(--text-faint)]')}>
                      {log.type === 'tool' && <span className={cn('w-1.5 h-1.5 rounded-full', log.done ? 'bg-emerald-500' : 'bg-[color:var(--accent)] animate-pulse')} />}
                      {log.text}
                    </div>
                  ))}
                  {genLoading && <span className="text-[color:var(--accent)] animate-pulse">▋</span>}
                </Card>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">预览生成的技能: <code className="text-[color:var(--accent)] bg-[color:var(--accent-soft)] px-1.5 py-0.5 rounded text-sm">{genPreview.skillName}</code></div>
                  <div className="text-sm text-[color:var(--text-soft)] mt-1">你可以编辑文件内容，确认无误后点击「保存并发布」</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setGenPreview(null); setGenLogs([]); setEditedFiles({}); }} disabled={genLoading}>重新生成</Button>
                  <Button onClick={handleConfirm} disabled={genLoading}>
                    {genLoading ? <><Loader2 size={14} className="animate-spin" />保存中...</> : <><CheckCircle2 size={14} />保存并发布</>}
                  </Button>
                </div>
              </div>
              <div className="flex gap-0 h-[calc(100vh-340px)] min-h-[400px] surface overflow-hidden">
                <div className="w-[220px] shrink-0 border-r border-[color:var(--line)] py-3 overflow-y-auto scrollable">
                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)] px-3 pb-2 font-medium">文件结构</div>
                  {genPreview.files.map(f => {
                    const Icon = getFileIcon(f.path);
                    return (
                      <button key={f.path} onClick={() => setEditingFile(f.path)} className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition text-left',
                        editingFile === f.path ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'text-[color:var(--text-soft)] hover:bg-[color:var(--bg-soft)]'
                      )}>
                        <Icon size={12} /> <span className="truncate">{f.path}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                  {editingFile && (
                    <>
                      <div className="px-3 py-2 text-xs text-[color:var(--text-faint)] border-b border-[color:var(--line)] bg-[color:var(--bg-soft)] font-mono">{editingFile}</div>
                      {editingFile.endsWith('.md') ? (
                        <div className="flex-1 flex overflow-hidden">
                          <textarea className="flex-1 border-r border-[color:var(--line)] bg-transparent text-sm font-mono p-3 resize-none outline-none text-[color:var(--text)]" value={editedFiles[editingFile] || ''} onChange={e => setEditedFiles(prev => ({ ...prev, [editingFile]: e.target.value }))} />
                          <div className="flex-1 p-4 overflow-y-auto scrollable text-sm text-[color:var(--text-soft)] md-block">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{editedFiles[editingFile] || ''}</ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <textarea className="flex-1 bg-transparent text-sm font-mono p-3 resize-none outline-none text-[color:var(--text)]" value={editedFiles[editingFile] || ''} onChange={e => setEditedFiles(prev => ({ ...prev, [editingFile]: e.target.value }))} />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'marketplace' && (
        <MarketplaceTab
          skills={skills}
          onInstalled={() => fetchSkills()}
          query={mpQuery} setQuery={setMpQuery}
          results={mpResults} setResults={setMpResults}
          pagination={mpPagination} setPagination={setMpPagination}
          page={mpPage} setPage={setMpPage}
          mpLoaded={mpLoaded}
        />
      )}

      <SkillDetailModal
        open={!!viewSkill}
        skill={viewSkill}
        editable={viewEditable}
        onClose={(refresh) => { setViewSkill(null); if (refresh) fetchSkills(); }}
      />

      {activeTab === 'upload' && (
        <div className="max-w-xl">
          <Card className="mb-5">
            <div className="font-medium mb-2">Skill 压缩包结构要求</div>
            <pre className="bg-[color:var(--bg-soft)] rounded-lg p-3 text-xs font-mono text-[color:var(--text-soft)] leading-relaxed">{`<skill-name>/
├── SKILL.md          # 【必需】包含 frontmatter 和指令
├── scripts/          # 【可选】辅助脚本
├── references/       # 【可选】参考文档
└── assets/           # 【可选】资源文件`}</pre>
            <div className="text-xs text-[color:var(--text-faint)] mt-2">SKILL.md 必须包含 <code className="text-[color:var(--accent)]">name</code> 和 <code className="text-[color:var(--accent)]">description</code> frontmatter</div>
          </Card>

          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all',
              uploadDragging ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] shadow-[0_0_20px_var(--accent-glow)]' : 'border-[color:var(--line)] bg-[color:var(--bg-elev)] hover:border-[color:var(--accent)]',
              uploadLoading && 'cursor-default'
            )}
            onDragOver={e => { e.preventDefault(); setUploadDragging(true); }}
            onDragLeave={() => setUploadDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploadLoading && fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".zip" multiple style={{ display: 'none' }} onChange={e => handleUploadFiles(e.target.files)} />
            {uploadLoading ? (
              <div className="flex items-center justify-center gap-3 text-[color:var(--text-soft)]">
                <Loader2 size={24} className="animate-spin" /> 上传中...
              </div>
            ) : (
              <>
                <Upload size={32} className="mx-auto mb-3 text-[color:var(--text-faint)]" />
                <div className="text-sm text-[color:var(--text-soft)]">拖拽一个或多个 .zip 文件到此处，或点击选择</div>
                <div className="text-xs text-[color:var(--text-faint)] mt-1">支持批量上传 · 仅支持 .zip 格式</div>
              </>
            )}
          </div>

          {uploadError && (
            <div className="mt-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">{uploadError}</div>
          )}

          {uploadResults.length > 0 && (
            <Card className="mt-4 !p-0 overflow-hidden">
              <div className="px-4 py-2.5 bg-[color:var(--bg-soft)] border-b border-[color:var(--line)] text-xs font-medium text-[color:var(--text-soft)]">
                上传结果（{uploadResults.filter(r => r.success).length}/{uploadResults.length} 成功）
              </div>
              {uploadResults.map((r, i) => (
                <div key={i} className={cn('flex items-center gap-2 px-4 py-2.5 text-sm border-b border-[color:var(--line)] last:border-0', r.success ? 'bg-emerald-500/5' : 'bg-red-500/5')}>
                  {r.success ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertCircle size={14} className="text-red-500" />}
                  <span className="font-mono text-xs flex-1 truncate">{r.filename}</span>
                  {r.error && <Badge tone="danger">{r.error}</Badge>}
                  {r.success && r.skill && <Badge tone="success">{r.skill.name}</Badge>}
                </div>
              ))}
              {uploadResults.every(r => r.success) && (
                <button onClick={() => { setUploadResults([]); setActiveTab('list'); }} className="w-full px-4 py-2.5 text-sm text-[color:var(--accent)] hover:bg-[color:var(--accent-soft)] transition">
                  查看已上传的技能 →
                </button>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill, onInstall, onUninstall, onDelete, onView, batchMode, isSelected, onToggle }) {
  return (
    <Card className={cn(
      'transition-all hover:shadow-glow hover:-translate-y-0.5 group',
      skill.installed && 'border-emerald-500/30',
      batchMode && isSelected && 'ring-2 ring-[color:var(--accent)] bg-[color:var(--accent-soft)]'
    )} onClick={batchMode ? onToggle : undefined}>
      <div className="flex items-start gap-3">
        {batchMode && (
          <button className="mt-0.5 shrink-0 text-[color:var(--text-soft)]" onClick={e => { e.stopPropagation(); onToggle(); }}>
            {isSelected ? <CheckSquare size={18} className="text-[color:var(--accent)]" /> : <Square size={18} />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-sm font-semibold text-[color:var(--accent)]">{skill.name}</code>
            {skill.installed && <Badge tone="success">已安装</Badge>}
            {skill.source === 'marketplace' && <Badge tone="info">市场</Badge>}
          </div>
          <div className="text-sm text-[color:var(--text-soft)] line-clamp-2">{skill.description || '暂无描述'}</div>
        </div>
        {!batchMode && (
          <div className="flex gap-1.5 shrink-0">
            {skill.installed ? (
              <Button size="sm" variant="outline" onClick={() => onUninstall(skill)} disabled={skill._loading}>
                {skill._loading ? '...' : '卸载'}
              </Button>
            ) : (
              <Button size="sm" onClick={() => onInstall(skill)} disabled={skill._loading}>
                {skill._loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {skill._loading ? '...' : '安装'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onDelete(skill)}><Trash2 size={14} /></Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-[color:var(--text-faint)]">
        <span>{new Date(skill.created_at).toLocaleDateString('zh-CN')}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => onView(skill, false)} className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)] transition">
            <Eye size={12} /> 查看
          </button>
          <button onClick={() => onView(skill, true)} className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)] transition">
            <Edit3 size={12} /> 编辑
          </button>
          <a href={api.exportSkillUrl(skill.id)} download className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)] transition">
            <Download size={12} /> 导出
          </a>
        </div>
      </div>
    </Card>
  );
}

function SkillDetailModal({ open, onClose, skill, editable: initialEditable }) {
  const [files, setFiles] = useState({});
  const [fileList, setFileList] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editable, setEditable] = useState(initialEditable);

  useEffect(() => {
    if (!open || !skill) return;
    setEditable(initialEditable);
    setLoading(true);
    api.getSkillContent(skill.id).then(data => {
      const fl = data.files || [];
      setFileList(fl);
      const map = {};
      fl.forEach(f => { map[f.path] = f.content; });
      setFiles(map);
      if (fl.length > 0) setActiveFile(fl[0].path);
    }).catch(() => {
      setFileList([]);
      setFiles({});
    }).finally(() => setLoading(false));
  }, [open, skill?.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSkillContent(skill.id, files);
      onClose(true);
    } catch (e) {
      alert('保存失败: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !skill) return null;

  return (
    <Modal open={open} onClose={() => onClose(false)} title={editable ? `编辑技能: ${skill.name}` : `查看技能: ${skill.name}`} width={860}
      footer={editable ? <>
        <Button variant="ghost" onClick={() => onClose(false)}><X size={14} /> 取消</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存</Button>
      </> : <Button variant="ghost" onClick={() => onClose(false)}>关闭</Button>}
    >
      {loading ? (
        <div className="py-12 text-center text-sm text-[color:var(--text-faint)]"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> 加载中…</div>
      ) : fileList.length === 0 ? (
        <div className="py-12 text-center text-sm text-[color:var(--text-faint)]">暂无文件内容。请先安装该技能后再查看。</div>
      ) : (
        <div className="flex gap-0 h-[calc(100vh-300px)] min-h-[400px] border border-[color:var(--line)] rounded-lg overflow-hidden">
          <div className="w-[200px] shrink-0 border-r border-[color:var(--line)] py-3 overflow-y-auto scrollable bg-[color:var(--bg-soft)]">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)] px-3 pb-2 font-medium">文件</div>
            {fileList.map(f => {
              const Icon = getFileIcon(f.path);
              return (
                <button key={f.path} onClick={() => setActiveFile(f.path)} className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition text-left',
                  activeFile === f.path ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'text-[color:var(--text-soft)] hover:bg-[color:var(--bg-elev)]'
                )}>
                  <Icon size={12} /> <span className="truncate">{f.path}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeFile && (
              <>
                <div className="px-3 py-2 text-xs text-[color:var(--text-faint)] border-b border-[color:var(--line)] bg-[color:var(--bg-soft)] font-mono flex items-center justify-between">
                  <span>{activeFile}</span>
                  {!editable && <button onClick={() => setEditable(true)} className="text-[color:var(--accent)] hover:underline">切换编辑</button>}
                </div>
                {activeFile.endsWith('.md') && !editable ? (
                  <div className="flex-1 p-4 overflow-y-auto scrollable text-sm text-[color:var(--text-soft)] md-block">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{files[activeFile] || ''}</ReactMarkdown>
                  </div>
                ) : (
                  <textarea
                    className="flex-1 bg-transparent text-sm font-mono p-3 resize-none outline-none text-[color:var(--text)]"
                    value={files[activeFile] || ''}
                    readOnly={!editable}
                    onChange={e => editable && setFiles(prev => ({ ...prev, [activeFile]: e.target.value }))}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function MarketplaceTab({ skills, onInstalled, query, setQuery, results, setResults, pagination, setPagination, page, setPage, mpLoaded }) {
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState({});
  const [detail, setDetail] = useState(null);

  const installedNames = new Set((skills || []).map(s => s.name));

  const doSearch = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const data = await api.searchMarketplace({ q: query, page: p, pageSize: 20 });
      setResults(data.skills || []);
      setPagination(data.pagination || null);
      setPage(p);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => {
    if (!mpLoaded.current) {
      mpLoaded.current = true;
      doSearch(1);
    }
  }, []);

  const handleInstall = async (skill) => {
    setInstalling(prev => ({ ...prev, [skill.id]: true }));
    try {
      await api.installMarketplaceSkill({
        namespace: skill.namespace,
        slug: skill.slug,
        displayName: skill.displayName,
        description: skill.description,
        prompt: skill.prompt || '',
        gitUrl: skill.gitUrl || '',
        author: skill.namespace,
        skillId: skill.id,
      });
      onInstalled?.();
    } catch (e) { alert('安装失败: ' + e.message); }
    finally { setInstalling(prev => ({ ...prev, [skill.id]: false })); }
  };

  const localName = (skill) => {
    let n = skill.slug;
    if (skill.namespace) n = skill.namespace + '-' + skill.slug;
    return n.replace(/\//g, '-');
  };

  return (
    <div className="max-w-4xl">
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)]" />
          <input
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[color:var(--bg-elev)] border border-[color:var(--line)] text-sm text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
            placeholder="搜索 Smithery 技能市场..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch(1)}
          />
        </div>
        <Button onClick={() => doSearch(1)} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} 搜索
        </Button>
      </div>

      {loading && results.length === 0 ? (
        <div className="space-y-3 py-4">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>
      ) : results.length === 0 ? (
        <EmptyState icon={Store} title="未找到技能" description="试试其他关键词搜索 Smithery 市场" />
      ) : (
        <div className="space-y-3">
          {results.map(skill => {
            const isInstalled = installedNames.has(localName(skill));
            return (
              <Card key={skill.id} className="hover:shadow-glow hover:-translate-y-0.5 transition-all">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-[color:var(--accent)]">{skill.displayName || skill.slug}</span>
                      {skill.verified && <Badge tone="info"><ShieldCheck size={10} /> 已验证</Badge>}
                      {isInstalled && <Badge tone="success">已安装</Badge>}
                    </div>
                    <div className="text-sm text-[color:var(--text-soft)] line-clamp-2">{skill.description || '暂无描述'}</div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-[color:var(--text-faint)]">
                      <span className="flex items-center gap-1"><Users size={11} /> {skill.namespace}</span>
                      {skill.externalStars > 0 && <span className="flex items-center gap-1"><Star size={11} /> {skill.externalStars}</span>}
                      {skill.totalActivations > 0 && <span>{skill.totalActivations} 次安装</span>}
                      {skill.categories?.length > 0 && skill.categories.map(c => <Badge key={c} tone="default">{c}</Badge>)}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(skill)}>
                      <Eye size={12} /> 详情
                    </Button>
                    {isInstalled ? (
                      <Button size="sm" variant="outline" disabled>已安装</Button>
                    ) : (
                      <Button size="sm" onClick={() => handleInstall(skill)} disabled={installing[skill.id]}>
                        {installing[skill.id] ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        安装
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => doSearch(page - 1)}>上一页</Button>
              <span className="text-sm text-[color:var(--text-soft)]">{page} / {pagination.totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => doSearch(page + 1)}>下一页</Button>
            </div>
          )}
        </div>
      )}

      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title={detail.displayName || detail.slug} width={680}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="text-[color:var(--text-faint)]">作者: <strong className="text-[color:var(--text)]">{detail.namespace}</strong></span>
              {detail.externalStars > 0 && <span className="flex items-center gap-1 text-[color:var(--text-faint)]"><Star size={12} className="text-amber-500" /> {detail.externalStars}</span>}
              {detail.verified && <Badge tone="info"><ShieldCheck size={10} /> 已验证</Badge>}
              {detail.gitUrl && (
                <a href={detail.gitUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[color:var(--accent)] hover:underline text-xs">
                  <ExternalLink size={11} /> GitHub
                </a>
              )}
            </div>
            <div className="text-sm text-[color:var(--text-soft)]">{detail.description}</div>
            {detail.prompt && (
              <Card className="!p-0">
                <div className="px-3 py-2 text-xs font-medium text-[color:var(--text-faint)] bg-[color:var(--bg-soft)] border-b border-[color:var(--line)]">技能提示词</div>
                <div className="p-3 text-sm text-[color:var(--text-soft)] max-h-[300px] overflow-y-auto scrollable md-block">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.prompt}</ReactMarkdown>
                </div>
              </Card>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDetail(null)}>关闭</Button>
              {!installedNames.has(localName(detail)) && (
                <Button onClick={() => { handleInstall(detail); setDetail(null); }}>
                  <Download size={14} /> 安装到本地
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
