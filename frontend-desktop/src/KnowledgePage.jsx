import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Upload, Trash2, Eye, Loader2, CheckCircle2, AlertCircle,
  FileText, MessageCircle, BarChart3, X, FolderUp, Pencil,
} from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, SkeletonCard } from './ui/primitives';
import { cn } from './ui/cn';

const CATEGORY_MAP = {
  docs: { label: '文档', icon: FileText },
  qa:   { label: '问答', icon: MessageCircle },
  data: { label: '数据', icon: BarChart3 },
};
const ALLOWED_EXTS = ['.md', '.txt', '.csv', '.tsv', '.json', '.pdf', '.docx'];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function parseTags(tags) {
  if (!tags || tags === '[]') return [];
  try { return JSON.parse(tags); } catch { return []; }
}

function getExt(name) {
  const m = name.match(/\.[^.]+$/);
  return m ? m[0].toLowerCase() : '';
}

export default function KnowledgePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');
  const [previewItem, setPreviewItem] = useState(null);
  const [editItem, setEditItem] = useState(null);

  const [dragging, setDragging] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('docs');
  const [uploadTags, setUploadTags] = useState('');
  const [queue, setQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const fileInputRef = useRef(null);
  const queueIdRef = useRef(0);

  const fetchItems = () => {
    setLoading(true);
    fetch('/api/knowledge', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);

  const handleDelete = async (item) => {
    if (!window.confirm(`确定删除「${item.title}」？`)) return;
    await fetch(`/api/knowledge/${item.id}`, { method: 'DELETE', credentials: 'include' });
    fetchItems();
  };

  const addFilesToQueue = (files) => {
    const newItems = [];
    for (const file of files) {
      const ext = getExt(file.name);
      if (!ALLOWED_EXTS.includes(ext)) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      queueIdRef.current += 1;
      newItems.push({ id: queueIdRef.current, file, status: 'pending', error: '' });
    }
    setQueue(prev => [...prev, ...newItems]);
    setUploadDone(false);
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); addFilesToQueue(Array.from(e.dataTransfer.files)); };
  const handleFileInput = (e) => { addFilesToQueue(Array.from(e.target.files)); e.target.value = ''; };
  const removeFromQueue = (id) => setQueue(prev => prev.filter(item => item.id !== id));
  const clearQueue = () => { setQueue([]); setUploadDone(false); };

  const handleUploadAll = async () => {
    const pending = queue.filter(item => item.status === 'pending');
    if (pending.length === 0) return;
    setUploading(true);
    const tagsArr = uploadTags.split(',').map(t => t.trim()).filter(Boolean);
    for (const item of pending) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading' } : q));
      const form = new FormData();
      form.append('file', item.file);
      form.append('title', item.file.name.replace(/\.[^.]+$/, ''));
      form.append('category', uploadCategory);
      form.append('tags', JSON.stringify(tagsArr));
      try {
        const res = await fetch('/api/knowledge', { method: 'POST', credentials: 'include', body: form });
        const data = await res.json();
        if (!res.ok) setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: data.error || '上传失败' } : q));
        else setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done' } : q));
      } catch (err) { setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: err.message } : q)); }
    }
    setUploading(false);
    setUploadDone(true);
    fetchItems();
  };

  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const doneCount = queue.filter(q => q.status === 'done').length;
  const errorCount = queue.filter(q => q.status === 'error').length;

  const grouped = { docs: [], qa: [], data: [] };
  items.forEach(item => {
    const cat = item.category || 'docs';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl mb-6 p-6 surface-grad">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-gradient-to-br from-[color:var(--accent)]/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[#5e8bff] text-white flex items-center justify-center shadow-glow">
            <BookOpen size={26} />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold tracking-tight text-gradient">知识库</div>
            <div className="text-sm text-[color:var(--text-soft)]">上传文档，灵犀会在回答时自动检索参考</div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-[color:var(--bg-soft)] rounded-lg mb-6">
        {[
          { id: 'list', label: `文件列表${items.length ? ` (${items.length})` : ''}`, icon: BookOpen },
          { id: 'upload', label: '上传文件', icon: Upload },
        ].map(t => {
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
          {loading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="知识库为空"
              description="上传 .md .txt .csv .pdf .docx 等文件，灵犀会在回答时自动参考"
              action={<Button onClick={() => setActiveTab('upload')}><Upload size={14} /> 上传文件</Button>}
            />
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([cat, catItems]) => {
                if (catItems.length === 0) return null;
                const cfg = CATEGORY_MAP[cat] || CATEGORY_MAP.docs;
                const Icon = cfg.icon;
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 text-xs font-medium text-[color:var(--text-faint)] uppercase tracking-wide pb-2 mb-3 border-b border-[color:var(--line)]">
                      <Icon size={12} /> {cfg.label}
                      <Badge tone="default" className="ml-auto">{catItems.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      <AnimatePresence>
                        {catItems.map(item => (
                          <motion.div key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                            <KnowledgeCard item={item} onDelete={handleDelete} onPreview={setPreviewItem} onEdit={setEditItem} />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="max-w-xl">
          <Card className="mb-5">
            <div className="font-medium mb-1">批量上传知识库文件</div>
            <p className="text-sm text-[color:var(--text-soft)]">
              支持 <code className="text-[color:var(--accent)]">.md</code> <code className="text-[color:var(--accent)]">.txt</code> <code className="text-[color:var(--accent)]">.csv</code> <code className="text-[color:var(--accent)]">.tsv</code> <code className="text-[color:var(--accent)]">.json</code> <code className="text-[color:var(--accent)]">.pdf</code> <code className="text-[color:var(--accent)]">.docx</code>，单文件不超过 10MB
            </p>
          </Card>

          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all',
              dragging ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] shadow-[0_0_20px_var(--accent-glow)]' : 'border-[color:var(--line)] bg-[color:var(--bg-elev)] hover:border-[color:var(--accent)]'
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".md,.txt,.csv,.tsv,.json,.pdf,.docx" multiple style={{ display: 'none' }} onChange={handleFileInput} />
            <FolderUp size={32} className="mx-auto mb-3 text-[color:var(--text-faint)]" />
            <div className="text-sm text-[color:var(--text-soft)]">拖拽文件到此处，或点击选择文件</div>
            <div className="text-xs text-[color:var(--text-faint)] mt-1">支持多选，每个文件最大 10MB</div>
          </div>

          <div className="flex gap-3 mt-4">
            <div className="flex-1">
              <div className="text-xs text-[color:var(--text-faint)] mb-1">分类</div>
              <Select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}>
                <option value="docs">文档</option>
                <option value="qa">问答</option>
                <option value="data">数据</option>
              </Select>
            </div>
            <div className="flex-1">
              <div className="text-xs text-[color:var(--text-faint)] mb-1">标签</div>
              <Input placeholder="多个标签用逗号分隔" value={uploadTags} onChange={e => setUploadTags(e.target.value)} />
            </div>
          </div>

          {queue.length > 0 && (
            <Card className="mt-4 !p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[color:var(--bg-soft)] border-b border-[color:var(--line)]">
                <span className="text-sm font-medium">
                  待上传 {pendingCount} 个
                  {doneCount > 0 && <span className="text-emerald-500"> · 已完成 {doneCount}</span>}
                  {errorCount > 0 && <span className="text-red-500"> · 失败 {errorCount}</span>}
                </span>
                {!uploading && <button className="text-xs text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)]" onClick={clearQueue}>清空</button>}
              </div>
              <div className="max-h-[280px] overflow-y-auto scrollable">
                {queue.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-4 py-2 border-b border-[color:var(--line)] last:border-0 text-sm">
                    {item.status === 'done' ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> :
                     item.status === 'error' ? <AlertCircle size={14} className="text-red-500 shrink-0" /> :
                     item.status === 'uploading' ? <Loader2 size={14} className="text-[color:var(--accent)] animate-spin shrink-0" /> :
                     <span className="w-3.5 h-3.5 rounded-full bg-[color:var(--bg-soft)] shrink-0" />}
                    <span className="flex-1 truncate">{item.file.name}</span>
                    <span className="text-xs text-[color:var(--text-faint)] shrink-0">{formatSize(item.file.size)}</span>
                    {item.status === 'error' && <span className="text-xs text-red-500 shrink-0 truncate max-w-[120px]">{item.error}</span>}
                    {item.status === 'pending' && <button className="text-[color:var(--text-faint)] hover:text-red-500" onClick={() => removeFromQueue(item.id)}><X size={12} /></button>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {uploadDone && errorCount === 0 && (
            <div className="mt-3 flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">
              <CheckCircle2 size={16} /> 全部 {doneCount} 个文件上传成功！
              <button className="ml-auto text-xs border border-emerald-500/40 px-2.5 py-1 rounded hover:bg-emerald-500/10 transition" onClick={() => setActiveTab('list')}>查看知识库</button>
            </div>
          )}

          <div className="mt-4">
            <Button className="w-full" onClick={handleUploadAll} disabled={uploading || pendingCount === 0}>
              {uploading ? <><Loader2 size={14} className="animate-spin" />上传中... ({doneCount + errorCount}/{queue.length})</> : <><Upload size={14} />上传 {pendingCount} 个文件</>}
            </Button>
          </div>
        </div>
      )}

      <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      <EditKnowledgeModal item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); fetchItems(); }} />
    </div>
  );
}

function KnowledgeCard({ item, onDelete, onPreview, onEdit }) {
  const tags = parseTags(item.tags);
  const cfg = CATEGORY_MAP[item.category] || CATEGORY_MAP.docs;
  return (
    <Card className="transition-all hover:-translate-y-0.5 hover:shadow-glow group">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent)] flex items-center justify-center shrink-0">
          <cfg.icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{item.title}</div>
          <div className="flex items-center gap-2 text-xs text-[color:var(--text-faint)] mt-0.5">
            <Badge tone="accent">{cfg.label}</Badge>
            <span>{formatSize(item.size)}</span>
            <span>{new Date(item.created_at).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
          <Button size="sm" variant="ghost" onClick={() => onPreview(item)}><Eye size={14} /></Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit?.(item)}><Pencil size={14} /></Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(item)}><Trash2 size={14} /></Button>
        </div>
      </div>
      {item.summary && <div className="mt-2 text-sm text-[color:var(--text-soft)] line-clamp-2">{item.summary}</div>}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((t, i) => <Badge key={i} tone="default">{t}</Badge>)}
        </div>
      )}
    </Card>
  );
}

function PreviewModal({ item, onClose }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    fetch(`/api/knowledge/${item.id}/preview`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setContent(data.content || ''); setLoading(false); })
      .catch(() => { setContent('加载失败'); setLoading(false); });
  }, [item?.id]);

  return (
    <Modal open={!!item} onClose={onClose} title={item?.title || '预览'} width={720}>
      {loading ? (
        <div className="py-10 text-center text-[color:var(--text-faint)]"><Loader2 size={20} className="animate-spin mx-auto mb-2" />加载中...</div>
      ) : (
        <div className="md-block text-sm leading-relaxed max-h-[60vh] overflow-y-auto scrollable">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </Modal>
  );
}

function EditKnowledgeModal({ item, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('docs');
  const [tags, setTags] = useState('');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title || '');
    setCategory(item.category || 'docs');
    setSummary(item.summary || '');
    try {
      const arr = JSON.parse(item.tags || '[]');
      setTags(Array.isArray(arr) ? arr.join(', ') : '');
    } catch { setTags(''); }
  }, [item]);

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    const tagsArr = tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, category, tags: JSON.stringify(tagsArr), summary }),
      });
      if (res.ok) onSaved?.();
    } finally { setSaving(false); }
  };

  return (
    <Modal open={!!item} onClose={onClose} title="编辑知识条目" width={500}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[color:var(--text-soft)] mb-1">标题</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="知识条目标题" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--text-soft)] mb-1">分类</label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="docs">文档</option>
            <option value="qa">问答</option>
            <option value="data">数据</option>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--text-soft)] mb-1">标签（逗号分隔）</label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签1, 标签2" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--text-soft)] mb-1">摘要</label>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="知识条目摘要" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
}
