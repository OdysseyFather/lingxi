import { useEffect, useState, useCallback } from 'react';
import { BrainCircuit, Trash2, Plus, AlertTriangle, Moon, Sparkles, Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../state/useStore';
import { Button, Input, Card, Modal, Badge } from '../ui/primitives';
import { cn } from '../ui/cn';

export function MemoryPage() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [dreamHistory, setDreamHistory] = useState([]);
  const [dreamExpanded, setDreamExpanded] = useState(false);
  const [dreamTriggered, setDreamTriggered] = useState(false);
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const pushNotification = useStore((s) => s.pushNotification);
  const dreamProgress = useStore((s) => s.dreamProgress);
  const dreamRunning = dreamTriggered || (dreamProgress && dreamProgress.phase !== 'done' && dreamProgress.phase !== 'error');

  const loadMemories = async () => {
    setLoading(true);
    try {
      const list = await api.listMemories(activeAgentId || 0);
      setMemories(list || []);
    } catch {
      setMemories([]);
    }
    setLoading(false);
  };

  const loadDreamHistory = useCallback(async () => {
    if (!activeAgentId) return;
    try {
      const list = await api.getAgentDreamHistory(activeAgentId);
      setDreamHistory(list || []);
    } catch { setDreamHistory([]); }
  }, [activeAgentId]);

  useEffect(() => { loadMemories(); loadDreamHistory(); }, [activeAgentId]);

  // Dream 完成/失败后刷新数据
  useEffect(() => {
    if (dreamProgress?.phase === 'done') {
      loadMemories();
      loadDreamHistory();
      setDreamTriggered(false);
    } else if (dreamProgress?.phase === 'error') {
      setDreamTriggered(false);
    }
  }, [dreamProgress?.phase]);

  // 安全措施：dreamProgress 停留超过 3 分钟自动清除（防止卡住）
  useEffect(() => {
    if (!dreamProgress || dreamProgress.phase === 'done' || dreamProgress.phase === 'error') return;
    const timer = setTimeout(() => {
      const cur = useStore.getState().dreamProgress;
      if (cur && cur.ts === dreamProgress.ts) {
        useStore.setState({ dreamProgress: null });
        setDreamTriggered(false);
      }
    }, 3 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [dreamProgress?.ts]);

  const handleTriggerDream = async () => {
    if (!activeAgentId || dreamRunning) return;
    try {
      setDreamTriggered(true);
      await api.triggerDream(activeAgentId);
      pushNotification({ title: '记忆巩固', body: '已开始后台整理记忆...' });
    } catch (e) {
      setDreamTriggered(false);
      pushNotification({ title: '触发失败', body: e.message });
    }
  };

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    try {
      await api.createMemory({ agent_id: activeAgentId || 0, content: newContent.trim(), category: newCategory });
      setNewContent('');
      setShowAdd(false);
      loadMemories();
      pushNotification({ title: '已添加记忆', body: newContent.trim().slice(0, 40) });
    } catch (e) {
      pushNotification({ title: '添加失败', body: e.message });
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      pushNotification({ title: '删除失败', body: e.message });
    }
  };

  const handleClear = async () => {
    try {
      await api.clearMemories(activeAgentId || 0);
      setMemories([]);
      setClearConfirm(false);
      pushNotification({ title: '已清空记忆', body: '所有记忆已删除' });
    } catch (e) {
      pushNotification({ title: '清空失败', body: e.message });
    }
  };

  const agent = agents.find((a) => a.id === activeAgentId);
  const CATEGORIES = [
    { id: 'general', label: '通用' },
    { id: 'preference', label: '偏好' },
    { id: 'fact', label: '事实' },
    { id: 'context', label: '上下文' },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BrainCircuit size={20} className="text-[color:var(--accent)]" />
            长期记忆
          </h2>
          <p className="text-sm text-[color:var(--text-soft)] mt-1">
            智能体可跨会话记住的关键信息。当前智能体：{agent?.name || '通用助理'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> 手动添加
          </Button>
          {memories.length > 0 && (
            <Button variant="outline" onClick={() => setClearConfirm(true)} className="text-red-500 hover:text-red-600">
              <Trash2 size={14} /> 全部清空
            </Button>
          )}
        </div>
      </div>

      {/* Dream 记忆巩固面板 */}
      {activeAgentId > 0 && (
        <Card className="mb-5 overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center',
                dreamRunning
                  ? 'bg-purple-500/15 text-purple-500'
                  : 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              )}>
                <Moon size={18} className={dreamRunning ? 'animate-pulse' : ''} />
              </div>
              <div>
                <div className="text-sm font-medium text-[color:var(--text)] flex items-center gap-2">
                  记忆巩固 (Dream)
                  {dreamRunning && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-500">
                      <RefreshCw size={10} className="animate-spin" /> 运行中
                    </span>
                  )}
                </div>
                <p className="text-xs text-[color:var(--text-faint)] mt-0.5">
                  自动整理、合并和精炼记忆，保持记忆库简洁高效
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleTriggerDream}
                disabled={dreamRunning || memories.length < 3}
                className="text-xs"
              >
                <Sparkles size={13} />
                {dreamRunning ? '巩固中...' : '立即巩固'}
              </Button>
              {dreamHistory.length > 0 && (
                <button
                  onClick={() => setDreamExpanded(!dreamExpanded)}
                  className="p-1.5 rounded-md hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] transition"
                >
                  {dreamExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>
          </div>

          {/* Dream 历史 */}
          {dreamExpanded && dreamHistory.length > 0 && (
            <div className="border-t border-[color:var(--line)] px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
              <div className="text-xs text-[color:var(--text-faint)] font-medium mb-2">巩固历史</div>
              {dreamHistory.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs">
                  <div className={cn(
                    'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                    log.action === 'create_memory' ? 'bg-green-500' :
                    log.action === 'update_memory' ? 'bg-blue-500' :
                    log.action === 'delete_memory' ? 'bg-red-400' :
                    log.action === 'failed' ? 'bg-red-500' :
                    'bg-[color:var(--text-faint)]'
                  )} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[color:var(--text-soft)]">{log.summary}</span>
                  </div>
                  <span className="text-[color:var(--text-faint)] whitespace-nowrap shrink-0">
                    {formatRelative(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-[color:var(--text-faint)]">加载中...</div>
      ) : memories.length === 0 ? (
        <Card className="text-center py-12">
          <BrainCircuit size={32} className="mx-auto mb-3 text-[color:var(--text-faint)]" />
          <div className="text-sm text-[color:var(--text-soft)]">暂无记忆</div>
          <div className="text-xs text-[color:var(--text-faint)] mt-1">智能体会在对话中自动提取关键信息，你也可以手动添加</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <div key={m.id} className="group flex items-start gap-3 p-3 rounded-xl bg-[color:var(--bg-soft)] border border-[color:var(--line)] hover:border-[color:var(--accent-soft)] transition">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[color:var(--text)]">{m.content}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge tone="info">{CATEGORIES.find(c => c.id === m.category)?.label || m.category}</Badge>
                  <span className="text-[11px] text-[color:var(--text-faint)]">
                    {new Date(m.created_at).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/10 text-[color:var(--text-faint)] hover:text-red-500 transition shrink-0"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 添加记忆对话框 */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="添加记忆" width={480}>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[color:var(--text-soft)] mb-1.5 block">记忆内容</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="例如：用户偏好使用 Go 语言编程，喜欢简洁的代码风格"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-[color:var(--text)] text-sm resize-none outline-none focus:border-[color:var(--accent)]"
            />
          </div>
          <div>
            <label className="text-sm text-[color:var(--text-soft)] mb-1.5 block">分类</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setNewCategory(cat.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition',
                    newCategory === cat.id
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                      : 'border-[color:var(--line)] hover:border-[color:var(--accent-soft)] text-[color:var(--text-soft)]'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={!newContent.trim()}>添加</Button>
          </div>
        </div>
      </Modal>

      {/* 清空确认 */}
      <Modal open={clearConfirm} onClose={() => setClearConfirm(false)} title="确认清空" width={400}>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-[color:var(--text-soft)]">
            确定要清空 <span className="font-medium text-[color:var(--text)]">{agent?.name || '通用助理'}</span> 的所有记忆吗？此操作不可撤销。
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setClearConfirm(false)}>取消</Button>
          <Button onClick={handleClear} className="bg-red-500 hover:bg-red-600 text-white">确认清空</Button>
        </div>
      </Modal>
    </div>
  );
}

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN');
}
