import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Upload, Trash2, Eye, Loader2, CheckCircle2, AlertCircle,
  FileText, MessageCircle, BarChart3, X, FolderUp, Pencil, CheckSquare, Square, Plus, Settings2,
  Search, Database, FolderSync, RefreshCw, Zap, Globe,
} from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, SkeletonCard } from './ui/primitives';
import { cn } from './ui/cn';

const DEFAULT_CATEGORY_MAP = {
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
  const [filterCat, setFilterCat] = useState('all');

  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const [dragging, setDragging] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('docs');
  const [uploadTags, setUploadTags] = useState('');
  const [queue, setQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const fileInputRef = useRef(null);
  const queueIdRef = useRef(0);

  const [categories, setCategories] = useState([]);
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Web 导入状态
  const [showWebImport, setShowWebImport] = useState(false);
  const [webUrls, setWebUrls] = useState('');
  const [webCategory, setWebCategory] = useState('docs');
  const [webTags, setWebTags] = useState('');
  const [webImporting, setWebImporting] = useState(false);
  const [webResult, setWebResult] = useState(null);
  const CATEGORY_MAP = {
    ...DEFAULT_CATEGORY_MAP,
    ...Object.fromEntries(categories.map(c => [c.name, { label: c.name, icon: FileText }])),
  };
  const ALL_CATEGORIES = ['all', ...Object.keys(CATEGORY_MAP)];

  const fetchCategories = () => {
    fetch('/api/knowledge/categories', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCategories(data); })
      .catch(() => {});
  };

  const fetchItems = () => {
    setLoading(true);
    fetch('/api/knowledge', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); fetchCategories(); }, []);

  const handleWebImport = async () => {
    const urls = webUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setWebImporting(true);
    setWebResult(null);
    try {
      if (urls.length === 1) {
        const res = await fetch('/api/knowledge/from-url', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urls[0], category: webCategory, tags: webTags || '[]' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '导入失败');
        setWebResult({ success: 1, total: 1, results: [{ url: urls[0], title: data.title }] });
      } else {
        const res = await fetch('/api/knowledge/from-urls', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls, category: webCategory, tags: webTags || '[]' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '导入失败');
        setWebResult(data);
      }
      fetchItems();
    } catch (e) {
      setWebResult({ error: e.message });
    }
    setWebImporting(false);
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    await fetch('/api/knowledge/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim(), icon: '📁' }),
    });
    setNewCatName('');
    fetchCategories();
  };

  const deleteCategory = async (id) => {
    if (!confirm('删除此分类？（已有文档不会被删除，只是分类标签消失）')) return;
    await fetch(`/api/knowledge/categories/${id}`, { method: 'DELETE' });
    fetchCategories();
  };

  const updateItemCategory = async (itemId, category) => {
    await fetch(`/api/knowledge/${itemId}/category`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
    fetchItems();
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`确定删除「${item.title}」？`)) return;
    await fetch(`/api/knowledge/${item.id}`, { method: 'DELETE', credentials: 'include' });
    fetchItems();
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visible = filteredItems.map(i => i.id);
    const allSelected = visible.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) visible.forEach(id => next.delete(id));
      else visible.forEach(id => next.add(id));
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${selected.size} 个知识库条目？`)) return;
    setBatchDeleting(true);
    try {
      await fetch('/api/knowledge/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: [...selected] }),
      });
      setSelected(new Set());
      setBatchMode(false);
      fetchItems();
    } finally { setBatchDeleting(false); }
  };

  const exitBatchMode = () => { setBatchMode(false); setSelected(new Set()); };

  const filteredItems = filterCat === 'all' ? items : items.filter(i => (i.category || 'docs') === filterCat);

  const catCounts = { all: items.length };
  ALL_CATEGORIES.forEach(c => { if (c !== 'all') catCounts[c] = 0; });
  items.forEach(i => { const c = i.category || 'docs'; catCounts[c] = (catCounts[c] || 0) + 1; });

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
          { id: 'web', label: '网页导入', icon: Globe },
          { id: 'search', label: '语义搜索', icon: Search },
          { id: 'index', label: '索引与监控', icon: Database },
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
          {/* 分类筛选 + 批量操作栏 */}
          {items.length > 0 && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex gap-1 p-0.5 bg-[color:var(--bg-soft)] rounded-md flex-1">
                {ALL_CATEGORIES.map(cat => {
                  const label = cat === 'all' ? '全部' : (CATEGORY_MAP[cat]?.label || cat);
                  return (
                    <button key={cat} onClick={() => setFilterCat(cat)} className={cn(
                      'px-3 py-1.5 text-xs rounded transition',
                      filterCat === cat
                        ? 'bg-[color:var(--bg-elev)] shadow-soft text-[color:var(--accent)] font-medium'
                        : 'text-[color:var(--text-soft)] hover:text-[color:var(--text)]'
                    )}>
                      {label} ({catCounts[cat] || 0})
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setShowCatMgr(true)}>
                  <Settings2 size={14} /> 管理分类
                </Button>
                {batchMode ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={toggleSelectAll}>
                      {filteredItems.every(i => selected.has(i.id)) ? <CheckSquare size={14} /> : <Square size={14} />}
                      {filteredItems.every(i => selected.has(i.id)) ? '取消全选' : '全选'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={exitBatchMode}>取消</Button>
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
            </div>
          )}

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
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="该分类暂无条目"
              description="切换分类查看其他知识库文件"
            />
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {filteredItems.map(item => (
                  <motion.div key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                    <KnowledgeCard
                      item={item}
                      onDelete={handleDelete}
                      onPreview={setPreviewItem}
                      onEdit={setEditItem}
                      batchMode={batchMode}
                      isSelected={selected.has(item.id)}
                      onToggle={() => toggleSelect(item.id)}
                      categoryMap={CATEGORY_MAP}
                      onChangeCategory={(cat) => updateItemCategory(item.id, cat)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
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
                {Object.entries(CATEGORY_MAP).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
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

      {activeTab === 'search' && <SemanticSearchPanel />}
      {activeTab === 'index' && <IndexManagementPanel />}

      {activeTab === 'web' && (
        <div className="max-w-xl">
          <Card className="p-5 space-y-4">
            <div>
              <div className="font-medium mb-1 text-[color:var(--text)]">从网页导入知识</div>
              <p className="text-xs text-[color:var(--text-soft)]">输入网页 URL，灵犀会自动抓取正文并导入知识库。每行一个 URL，最多 20 个。</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">网页 URL</label>
              <Textarea
                value={webUrls}
                onChange={(e) => setWebUrls(e.target.value)}
                placeholder={"https://example.com/article\nhttps://blog.example.com/post"}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">分类</label>
                <Select value={webCategory} onChange={(e) => setWebCategory(e.target.value)}>
                  <option value="docs">文档</option>
                  <option value="qa">问答</option>
                  <option value="data">数据</option>
                  {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">标签（可选）</label>
                <Input value={webTags} onChange={(e) => setWebTags(e.target.value)} placeholder="用逗号分隔" />
              </div>
            </div>
            <Button onClick={handleWebImport} disabled={webImporting || !webUrls.trim()}>
              {webImporting ? <><Loader2 size={14} className="animate-spin mr-1" />导入中...</> : <><Globe size={14} className="mr-1" />开始导入</>}
            </Button>

            {webResult && (
              <div className="mt-3 p-3 rounded-lg bg-[color:var(--bg-soft)] text-sm">
                {webResult.error ? (
                  <div className="text-red-500 flex items-center gap-1"><AlertCircle size={14} />{webResult.error}</div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[color:var(--accent)]">
                      <CheckCircle2 size={14} />成功导入 {webResult.success}/{webResult.total} 篇
                    </div>
                    {webResult.results?.map((r, i) => (
                      <div key={i} className="text-xs text-[color:var(--text-soft)] truncate">
                        {r.error ? <span className="text-red-400">{r.url}: {r.error}</span> : <span>{r.title || r.url}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      <EditKnowledgeModal item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); fetchItems(); }} categories={categories} onChangeCategory={updateItemCategory} />

      {/* 分类管理弹窗 */}
      <Modal open={showCatMgr} onClose={() => setShowCatMgr(false)} title="管理知识库分类" width={420}>
        <div className="space-y-3">
          {categories.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[color:var(--bg-soft)]">
              <span className="text-lg">{c.icon}</span>
              <span className="flex-1 text-sm font-medium">{c.name}</span>
              <Button size="sm" variant="ghost" onClick={() => deleteCategory(c.id)}><Trash2 size={14} /></Button>
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <Input placeholder="新分类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="flex-1" />
            <Button onClick={addCategory} disabled={!newCatName.trim()}><Plus size={14} /> 添加</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function KnowledgeCard({ item, onDelete, onPreview, onEdit, batchMode, isSelected, onToggle, categoryMap, onChangeCategory }) {
  const tags = parseTags(item.tags);
  const catMap = categoryMap || DEFAULT_CATEGORY_MAP;
  const cfg = catMap[item.category] || catMap[Object.keys(catMap)[0]] || { label: item.category, icon: FileText };
  return (
    <Card className={cn(
      'transition-all hover:-translate-y-0.5 hover:shadow-glow group',
      batchMode && isSelected && 'ring-2 ring-[color:var(--accent)] bg-[color:var(--accent-soft)]'
    )} onClick={batchMode ? onToggle : undefined}>
      <div className="flex items-start gap-3">
        {batchMode && (
          <button className="mt-0.5 shrink-0 text-[color:var(--text-soft)]" onClick={e => { e.stopPropagation(); onToggle(); }}>
            {isSelected ? <CheckSquare size={18} className="text-[color:var(--accent)]" /> : <Square size={18} />}
          </button>
        )}
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
        {!batchMode && (
          <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
            <Button size="sm" variant="ghost" onClick={() => onPreview(item)}><Eye size={14} /></Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit?.(item)}><Pencil size={14} /></Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(item)}><Trash2 size={14} /></Button>
          </div>
        )}
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

// ─── 语义搜索面板 ───────────────────────────────────────────────
function SemanticSearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      setResults(data.results || []);
    } catch { setResults([]); }
    finally { setSearching(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search size={16} className="text-[color:var(--accent)]" />
          <span className="text-sm font-medium">向量语义搜索</span>
          <Badge variant="outline" className="text-xs">深度 RAG</Badge>
        </div>
        <p className="text-xs text-[color:var(--text-soft)] mb-3">
          语义搜索能理解问题意图，而非仅匹配关键词。输入自然语言问题即可搜索知识库。
        </p>
        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="输入问题，如：如何部署服务到生产环境"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            搜索
          </Button>
        </div>
      </Card>

      {searched && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <div className="text-center py-8 text-[color:var(--text-faint)] text-sm">
              {searching ? '搜索中...' : '未找到相关结果，请尝试换一种表述'}
            </div>
          ) : (
            results.map((r, i) => (
              <Card key={r.chunk_id || i} className="p-3 hover:shadow-soft transition">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant={r.source === 'hybrid' ? 'default' : 'outline'} className="text-xs">
                    {r.source === 'vector' ? '语义匹配' : r.source === 'keyword' ? '关键词' : '混合匹配'}
                  </Badge>
                  <span className="text-xs text-[color:var(--text-faint)] truncate flex-1">{r.file_path}</span>
                  <span className="text-xs text-[color:var(--accent)]">
                    {(r.score * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-sm text-[color:var(--text)] leading-relaxed line-clamp-4">{r.chunk_text}</p>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── 索引管理面板 ───────────────────────────────────────────────
function IndexManagementPanel() {
  const [indexStatus, setIndexStatus] = useState(null);
  const [watchedDirs, setWatchedDirs] = useState([]);
  const [embeddingConfig, setEmbeddingCfg] = useState(null);
  const [newDir, setNewDir] = useState('');
  const [reindexing, setReindexing] = useState(false);

  const fetchAll = useCallback(() => {
    fetch('/api/knowledge/index-status').then(r => r.json()).then(setIndexStatus).catch(() => {});
    fetch('/api/knowledge/watched-dirs').then(r => r.json()).then(d => setWatchedDirs(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/knowledge/embedding-config').then(r => r.json()).then(setEmbeddingCfg).catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 5000); return () => clearInterval(t); }, [fetchAll]);

  const handleReindex = async () => {
    setReindexing(true);
    await fetch('/api/knowledge/reindex', { method: 'POST' }).catch(() => {});
    setTimeout(fetchAll, 1000);
    setTimeout(() => setReindexing(false), 2000);
  };

  const handleAddDir = async () => {
    if (!newDir.trim()) return;
    await fetch('/api/knowledge/watched-dirs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir_path: newDir.trim() }),
    });
    setNewDir('');
    fetchAll();
  };

  const handleRemoveDir = async (id) => {
    await fetch(`/api/knowledge/watched-dirs/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  const handleSaveEmbedding = async (cfg) => {
    await fetch('/api/knowledge/embedding-config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    fetchAll();
  };

  return (
    <div className="space-y-4">
      {/* 索引状态 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database size={16} className="text-[color:var(--accent)]" />
          <span className="text-sm font-medium">向量索引状态</span>
          <Button size="sm" variant="ghost" onClick={handleReindex} disabled={reindexing || indexStatus?.is_indexing}>
            <RefreshCw size={12} className={reindexing || indexStatus?.is_indexing ? 'animate-spin' : ''} />
            重建索引
          </Button>
        </div>
        {indexStatus && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-[color:var(--bg-soft)] text-center">
              <div className="text-lg font-bold text-[color:var(--accent)]">{indexStatus.total_docs}</div>
              <div className="text-xs text-[color:var(--text-soft)]">已索引文档</div>
            </div>
            <div className="p-3 rounded-lg bg-[color:var(--bg-soft)] text-center">
              <div className="text-lg font-bold text-[color:var(--accent)]">{indexStatus.total_chunks}</div>
              <div className="text-xs text-[color:var(--text-soft)]">文本分块</div>
            </div>
            <div className="p-3 rounded-lg bg-[color:var(--bg-soft)] text-center">
              <div className="text-xs font-medium text-[color:var(--text)]">{indexStatus.last_updated || '—'}</div>
              <div className="text-xs text-[color:var(--text-soft)]">最后更新</div>
            </div>
          </div>
        )}
        {indexStatus?.is_indexing && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-xs text-[color:var(--accent)] mb-1">
              <Loader2 size={12} className="animate-spin" /> 正在索引...
            </div>
            <div className="h-1.5 rounded-full bg-[color:var(--bg-soft)] overflow-hidden">
              <div className="h-full bg-[color:var(--accent)] rounded-full transition-all" style={{ width: `${(indexStatus.progress || 0) * 100}%` }} />
            </div>
          </div>
        )}
      </Card>

      {/* 监控目录 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <FolderSync size={16} className="text-[color:var(--accent)]" />
          <span className="text-sm font-medium">文件夹监控</span>
          <span className="text-xs text-[color:var(--text-faint)]">文件变化时自动更新索引</span>
        </div>

        {watchedDirs.length > 0 && (
          <div className="space-y-2 mb-3">
            {watchedDirs.map(d => (
              <div key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color:var(--bg-soft)]">
                <FolderSync size={14} className="text-[color:var(--accent)] shrink-0" />
                <span className="text-xs text-[color:var(--text)] truncate flex-1">{d.dir_path}</span>
                <Button size="sm" variant="ghost" onClick={() => handleRemoveDir(d.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="输入文件夹绝对路径，如 /Users/you/Documents/项目文档"
            value={newDir}
            onChange={e => setNewDir(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddDir()}
          />
          <Button onClick={handleAddDir} disabled={!newDir.trim()}>
            <Plus size={14} /> 添加
          </Button>
        </div>
      </Card>

      {/* 嵌入模型配置 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-[color:var(--accent)]" />
          <span className="text-sm font-medium">嵌入模型配置</span>
        </div>
        {embeddingConfig && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[color:var(--text-soft)] mb-1">嵌入 API 地址（留空则使用当前模型供应商）</label>
              <Input
                value={embeddingConfig.api_url}
                onChange={e => setEmbeddingCfg({ ...embeddingConfig, api_url: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div>
              <label className="block text-xs text-[color:var(--text-soft)] mb-1">嵌入模型名称</label>
              <Input
                value={embeddingConfig.model}
                onChange={e => setEmbeddingCfg({ ...embeddingConfig, model: e.target.value })}
                placeholder="text-embedding-3-small"
              />
            </div>
            <Button size="sm" onClick={() => handleSaveEmbedding(embeddingConfig)}>
              <CheckCircle2 size={14} /> 保存配置
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function EditKnowledgeModal({ item, onClose, onSaved, categories }) {
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
            {(categories && categories.length > 0 ? categories : [{ name: 'docs', icon: '📄' }, { name: 'qa', icon: '💬' }, { name: 'data', icon: '📊' }]).map(c => (
              <option key={c.name || c.id} value={c.name}>{c.icon} {c.name}</option>
            ))}
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
