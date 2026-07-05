import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, BarChart3, Users, Clock, Filter, Trash2, ChevronLeft,
  Loader2, RefreshCw, Radio, ArrowDown, Search, Brain, Plug,
} from 'lucide-react';
import { Button, Card, Badge, Modal, Input } from './ui/primitives';
import { cn } from './ui/cn';
import { api } from './api/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PLATFORMS = {
  dingtalk: { label: '钉钉', color: 'blue' },
  feishu: { label: '飞书', color: 'purple' },
  wecom: { label: '企微', color: 'green' },
  wecom_webhook: { label: '企微Webhook', color: 'emerald' },
};

function PlatformBadge({ platform }) {
  const p = PLATFORMS[platform] || { label: platform, color: 'gray' };
  const colorMap = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', colorMap[p.color])}>
      {p.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color = 'accent' }) {
  const colorClass = {
    accent: 'from-[var(--accent)]/10 to-transparent border-[var(--accent)]/20',
    blue: 'from-blue-500/10 to-transparent border-blue-500/20',
    green: 'from-green-500/10 to-transparent border-green-500/20',
    purple: 'from-purple-500/10 to-transparent border-purple-500/20',
  };
  return (
    <div className={cn(
      'rounded-xl border bg-gradient-to-br p-4 flex items-center gap-3',
      colorClass[color] || colorClass.accent
    )}>
      <div className="p-2 rounded-lg bg-[var(--bg-elev)]">
        <Icon size={20} className="text-[var(--accent)]" />
      </div>
      <div>
        <div className="text-2xl font-bold text-[var(--text)]">{value}</div>
        <div className="text-xs text-[var(--text-soft)]">{label}</div>
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString('zh-CN');
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ThinkingToggle({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5 rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-900/20 overflow-hidden">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-100/50 dark:hover:bg-purple-800/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <Brain size={12} />
        <span className="font-medium">思考过程</span>
        <span className="ml-auto text-[10px] opacity-60">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-purple-200/50 dark:border-purple-800/30 text-xs text-purple-700 dark:text-purple-300 whitespace-pre-wrap leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}

function ParsedMessageContent({ content }) {
  if (!content) return null;
  const trimmed = content.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const blocks = JSON.parse(trimmed);
      if (Array.isArray(blocks)) {
        const elements = [];
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (b.type === 'text' && b.text) {
            elements.push(
              <div key={`text-${i}`} className="prose prose-sm dark:prose-invert max-w-none break-words [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{b.text}</ReactMarkdown>
              </div>
            );
          }
          if (b.type === 'thinking' && b.text) {
            elements.push(<ThinkingToggle key={`think-${i}`} text={b.text} />);
          }
          if (b.type === 'tool_use' && b.name) {
            elements.push(
              <div key={`tool-${i}`} className="my-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <Plug size={12} />
                <span className="font-medium">调用工具:</span> <code className="bg-blue-100 dark:bg-blue-800/30 px-1 rounded">{b.name}</code>
              </div>
            );
          }
          if (b.type === 'tool_result') {
            const txt = typeof b.content === 'string' ? b.content : JSON.stringify(b.content, null, 2);
            elements.push(
              <div key={`result-${i}`} className="my-1 text-xs">
                <pre className="bg-[var(--bg-soft)] border border-[var(--line)] rounded-lg p-2 overflow-x-auto max-h-32 text-[var(--text-soft)]">
                  {txt.length > 500 ? txt.slice(0, 500) + '...' : txt}
                </pre>
              </div>
            );
          }
        }
        if (elements.length > 0) return <>{elements}</>;
      }
    } catch { /* not JSON, fall through */ }
  }
  const cleaned = content.replace(/@_user_\d+/g, '@用户');
  const display = cleaned.length > 3000 ? cleaned.slice(0, 3000) + '\n\n...(内容过长已截断)' : cleaned;
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{display}</ReactMarkdown>
    </div>
  );
}

export default function IMDashboardPage() {
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sess] = await Promise.all([
        api.getIMDashboardStats(),
        api.listIMSessions(platformFilter),
      ]);
      setStats(s);
      setSessions(sess || []);
    } catch (e) {
      console.error('load IM dashboard error:', e);
    } finally {
      setLoading(false);
    }
  }, [platformFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadMessages = useCallback(async (session) => {
    setSelectedSession(session);
    setMsgsLoading(true);
    try {
      const msgs = await api.getIMSessionMessages(session.id, { limit: 100 });
      setMessages(msgs || []);
    } catch (e) {
      console.error('load messages error:', e);
    } finally {
      setMsgsLoading(false);
    }
  }, []);

  const handleDelete = async (id) => {
    try {
      await api.deleteIMSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (selectedSession?.id === id) {
        setSelectedSession(null);
        setMessages([]);
      }
    } catch (e) {
      console.error('delete error:', e);
    }
    setDeleteModal(null);
  };

  const filteredSessions = sessions.filter(s => {
    if (!searchText) return true;
    const lower = searchText.toLowerCase();
    return (
      s.session_title?.toLowerCase().includes(lower) ||
      s.scope_key?.toLowerCase().includes(lower) ||
      s.agent_name?.toLowerCase().includes(lower) ||
      s.platform?.toLowerCase().includes(lower)
    );
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 顶部统计 */}
      <div className="px-6 pt-5 pb-3 border-b border-[var(--line)] shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={22} className="text-[var(--accent)]" />
            <h1 className="text-lg font-semibold text-[var(--text)]">IM 看板</h1>
          </div>
          <Button size="sm" variant="ghost" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <StatCard icon={MessageSquare} label="总会话数" value={stats.total_sessions} color="accent" />
            <StatCard icon={Radio} label="总消息数" value={stats.total_messages} color="blue" />
            <StatCard icon={Clock} label="今日活跃" value={stats.active_today} color="green" />
            <StatCard icon={Users} label="接入平台" value={Object.keys(stats.platform_counts || {}).length} color="purple" />
          </div>
        )}

        {/* 平台分布小标签 */}
        {stats?.platform_counts && Object.keys(stats.platform_counts).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-faint)]">平台分布:</span>
            {Object.entries(stats.platform_counts).map(([p, c]) => (
              <span key={p} className="text-xs text-[var(--text-soft)]">
                <PlatformBadge platform={p} /> ×{c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 主体：左侧会话列表 + 右侧消息 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧会话列表 */}
        <div className={cn(
          'flex flex-col border-r border-[var(--line)] shrink-0 overflow-hidden',
          selectedSession ? 'w-[320px] hidden md:flex' : 'flex-1'
        )}>
          {/* 筛选栏 */}
          <div className="p-3 border-b border-[var(--line)] space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
                <input
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                  placeholder="搜索会话..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                />
              </div>
              <select
                className="text-xs px-2 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)]"
                value={platformFilter}
                onChange={e => setPlatformFilter(e.target.value)}
              >
                <option value="">全部平台</option>
                {Object.entries(PLATFORMS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-[var(--text-faint)]">
                <Loader2 size={20} className="animate-spin mr-2" /> 加载中...
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-[var(--text-faint)]">
                <MessageSquare size={32} className="mb-2 opacity-30" />
                <span className="text-sm">暂无 IM 会话</span>
              </div>
            ) : (
              <AnimatePresence>
                {filteredSessions.map(s => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      'px-3 py-2.5 border-b border-[var(--line)] cursor-pointer transition-colors group',
                      selectedSession?.id === s.id
                        ? 'bg-[var(--accent-soft)]'
                        : 'hover:bg-[var(--bg-soft)]'
                    )}
                    onClick={() => loadMessages(s)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <PlatformBadge platform={s.platform} />
                          {s.agent_name && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-elev)] text-[var(--text-soft)]">
                              {s.agent_name}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-medium text-[var(--text)] truncate">
                          {s.session_title || s.scope_key || '未命名会话'}
                        </div>
                        <div className="text-xs text-[var(--text-faint)] mt-0.5">
                          {s.message_count} 条消息 · {timeAgo(s.last_active)}
                        </div>
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                        onClick={e => { e.stopPropagation(); setDeleteModal(s); }}
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* 右侧消息详情 */}
        <div className={cn(
          'flex-1 flex flex-col overflow-hidden',
          !selectedSession && 'hidden md:flex'
        )}>
          {selectedSession ? (
            <>
              {/* 会话头部 */}
              <div className="px-4 py-3 border-b border-[var(--line)] shrink-0 flex items-center gap-3">
                <button
                  className="md:hidden p-1 rounded hover:bg-[var(--bg-soft)]"
                  onClick={() => setSelectedSession(null)}
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={selectedSession.platform} />
                    <span className="text-sm font-medium text-[var(--text)] truncate">
                      {selectedSession.session_title || selectedSession.scope_key}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-faint)] mt-0.5">
                    {selectedSession.agent_name && `智能体: ${selectedSession.agent_name} · `}
                    会话 #{selectedSession.session_id} · {selectedSession.message_count} 条消息
                  </div>
                </div>
              </div>

              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {msgsLoading ? (
                  <div className="flex items-center justify-center py-10 text-[var(--text-faint)]">
                    <Loader2 size={20} className="animate-spin mr-2" /> 加载中...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 text-[var(--text-faint)] text-sm">
                    暂无消息记录
                  </div>
                ) : (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm',
                          msg.role === 'user'
                            ? 'bg-[var(--accent)] text-white rounded-br-md'
                            : 'bg-[var(--bg-elev)] text-[var(--text)] border border-[var(--line)] rounded-bl-md'
                        )}
                      >
                        <div className="text-xs opacity-60 mb-1">
                          {msg.role === 'user' ? '用户' : '智能体'} · {formatTime(msg.created_at)}
                        </div>
                        <ParsedMessageContent content={msg.content} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-faint)]">
              <MessageSquare size={48} className="opacity-20 mb-3" />
              <span className="text-sm">选择一个会话查看消息记录</span>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认 */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)}>
        <div className="p-5">
          <h3 className="text-base font-semibold text-[var(--text)] mb-2">删除 IM 会话映射</h3>
          <p className="text-sm text-[var(--text-soft)] mb-4">
            确定删除这个 IM 会话映射？底层的会话和消息记录不会被删除。
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDeleteModal(null)}>取消</Button>
            <Button size="sm" variant="danger" onClick={() => handleDelete(deleteModal.id)}>删除</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
