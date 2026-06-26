import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Star, Download, MessageSquare, Search, TrendingUp, Sparkles,
  Plus, Send, Trash2, Edit3, ExternalLink, Copy, Gift, Activity,
  LogOut, User as UserIcon, Eye, EyeOff, Loader2, CheckCircle2,
} from 'lucide-react';
import { Button, Modal, Badge, Input } from './ui/primitives';
import { cn } from './ui/cn';
import { community, api } from './api/client';

const CATEGORIES = [
  { id: '', label: '全部' },
  { id: 'programming', label: '编程' },
  { id: 'writing', label: '写作' },
  { id: 'translation', label: '翻译' },
  { id: 'business', label: '商业' },
  { id: 'life', label: '生活' },
  { id: 'education', label: '教育' },
];

const SORTS = [
  { id: 'newest', label: '最新' },
  { id: 'hot', label: '热门' },
  { id: 'rating', label: '高分' },
];

function formatTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前';
  return d.toLocaleDateString();
}

function formatBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

export default function CommunityPage() {
  const [tab, setTab] = useState('discover'); // discover | leaderboard | following | mine | settings
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!community.isLoggedIn()) {
      setLoading(false);
      return;
    }
    community.getMe().then(d => {
      setUser(d.user);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const d = await community.registerAnon();
      localStorage.lingxi_community_token = d.token;
      setUser(d.user);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      alert('注册失败: ' + e.message);
    }
  };

  const handleLogout = () => {
    delete localStorage.lingxi_community_token;
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[color:var(--accent)]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[color:var(--accent-soft)] flex items-center justify-center">
            <Users className="w-8 h-8 text-[color:var(--accent)]" />
          </div>
          <h2 className="text-xl font-bold">灵犀社区平台</h2>
          <p className="text-sm text-[color:var(--text-soft)]">
            浏览其他灵犀用户分享的智能体。发布你的 Agent、邀请码调用、关注创作者。
          </p>
          <p className="text-xs text-[color:var(--text-faint)]">
            点击下方按钮将生成本地匿名身份并自动保存。后续可绑定 OAuth（规划中）。
          </p>
          <Button onClick={handleLogin} variant="primary" className="w-full">
            <Sparkles className="w-4 h-4 mr-2" />进入社区
          </Button>
          <div className="text-xs text-[color:var(--text-faint)] pt-2">
            未登录也可<a className="text-[color:var(--accent)] underline cursor-pointer" onClick={() => setTab('discover')}>浏览社区</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* 左侧 Tab */}
      <div className="w-44 flex-shrink-0 border-r border-[color:var(--line)] bg-[color:var(--bg-soft)] flex flex-col">
        <div className="p-3 border-b border-[color:var(--line)]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[color:var(--accent)]" />
            <span className="font-bold text-sm">社区</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          <TabItem id="discover" icon={Search} label="发现" active={tab === 'discover'} onClick={() => setTab('discover')} />
          <TabItem id="leaderboard" icon={TrendingUp} label="排行榜" active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')} />
          <TabItem id="following" icon={Star} label="关注" active={tab === 'following'} onClick={() => setTab('following')} />
          <TabItem id="mine" icon={Sparkles} label="我的 Agent" active={tab === 'mine'} onClick={() => setTab('mine')} />
          <TabItem id="invocations" icon={Gift} label="邀请码" active={tab === 'invocations'} onClick={() => setTab('invocations')} />
          <TabItem id="settings" icon={UserIcon} label="个人资料" active={tab === 'settings'} onClick={() => setTab('settings')} />
        </div>
        <div className="p-3 border-t border-[color:var(--line)] text-xs">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[color:var(--accent-soft)] flex items-center justify-center">
              {user.avatar ? (
                <span className="text-base">{user.avatar.startsWith('/api/') ? '✦' : user.avatar}</span>
              ) : '✦'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{user.display_name || user.username}</div>
              <button onClick={handleLogout} className="text-[color:var(--text-faint)] hover:text-[color:var(--accent)] flex items-center gap-1 mt-0.5">
                <LogOut className="w-3 h-3" />退出
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧主区 */}
      <div className="flex-1 overflow-auto scrollable">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="p-6"
          >
            {tab === 'discover' && <DiscoverTab user={user} />}
            {tab === 'leaderboard' && <LeaderboardTab />}
            {tab === 'following' && <FollowingTab user={user} />}
            {tab === 'mine' && <MyAgentsTab user={user} />}
            {tab === 'invocations' && <InvocationsTab user={user} />}
            {tab === 'settings' && <SettingsTab user={user} onUpdate={setUser} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function TabItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
        active
          ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] font-semibold'
          : 'text-[color:var(--text-soft)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--text)]'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ── 发现 ──────────────────────────────────────────────────────
function DiscoverTab({ user }) {
  const [agents, setAgents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [selectedAgent, setSelectedAgent] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await community.listAgents({ page, page_size: 24, search, category, sort });
      setAgents(r.agents || []);
      setTotal(r.total || 0);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [page, search, category, sort]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">发现 Agent</h2>
          <p className="text-xs text-[color:var(--text-faint)] mt-1">浏览社区中所有公开发布的 Agent</p>
        </div>
        <Button onClick={load} variant="ghost" size="sm">
          <TrendingUp className="w-4 h-4 mr-1" />刷新
        </Button>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          placeholder="搜索 Agent 名称或描述..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px]"
        />
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg bg-[color:var(--bg-elev)] border border-[color:var(--line)] text-sm"
        >
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg bg-[color:var(--bg-elev)] border border-[color:var(--line)] text-sm"
        >
          {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12 text-[color:var(--text-faint)]">
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />加载中...
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 text-[color:var(--text-faint)]">
          暂无 Agent，<a className="text-[color:var(--accent)] underline" onClick={() => setPage(1)}>刷新</a>看看
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map(a => (
            <AgentCard key={a.id} agent={a} onClick={() => setSelectedAgent(a)} />
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > 24 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >上一页</Button>
          <span className="text-sm text-[color:var(--text-soft)]">
            第 {page} 页 / 共 {Math.ceil(total / 24)} 页（{total} 个）
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page * 24 >= total}
            onClick={() => setPage(p => p + 1)}
          >下一页</Button>
        </div>
      )}

      {/* 详情弹窗 */}
      {selectedAgent && (
        <AgentDetailModal
          agentId={selectedAgent.id}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}

function AgentCard({ agent, onClick }) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elev)] hover:border-[color:var(--accent)] hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-[color:var(--accent-soft)] flex items-center justify-center text-2xl flex-shrink-0">
          {agent.avatar && !agent.avatar.startsWith('/api/') ? agent.avatar : '✦'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{agent.name}</div>
          <div className="text-xs text-[color:var(--text-faint)] mt-0.5">
            by {agent.author?.display_name || agent.author?.username || '匿名'}
          </div>
          <div className="text-xs text-[color:var(--text-soft)] mt-2 line-clamp-2">
            {agent.description || '（无描述）'}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-[color:var(--text-faint)]">
            <span className="flex items-center gap-1">
              <Download className="w-3 h-3" />{agent.downloads_count}
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" />{agent.rating_avg ? agent.rating_avg.toFixed(1) : '-'}({agent.rating_count})
            </span>
            <span>{formatBytes(agent.bundle_size)}</span>
          </div>
        </div>
      </div>
      {agent.tags && agent.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {agent.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Agent 详情弹窗 ────────────────────────────────────────────
function AgentDetailModal({ agentId, onClose }) {
  const [agent, setAgent] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [comments, setComments] = useState([]);
  const [myRating, setMyRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview | ratings | comments
  const [newComment, setNewComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r, c] = await Promise.all([
        community.getAgent(agentId),
        community.listRatings(agentId),
        community.listComments(agentId),
      ]);
      setAgent(a.agent);
      setMyRating(a.my_rating || 0);
      setRatings(r.ratings || []);
      setComments(c.comments || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = () => {
    if (!agent) return;
    // 通过 URL 下载（直接访问会触发浏览器下载）
    window.open(community.downloadBundleUrl(agent.id), '_blank');
  };

  const handleRate = async (score) => {
    try {
      const r = await community.rateAgent(agentId, score);
      setRatings(r.ratings || []);
      setMyRating(score);
      load();
    } catch (e) {
      alert('评分失败: ' + e.message);
    }
  };

  const handleComment = async () => {
    if (!newComment.trim()) return;
    try {
      await community.createComment(agentId, newComment);
      setNewComment('');
      load();
    } catch (e) {
      alert('评论失败: ' + e.message);
    }
  };

  if (loading) {
    return (
      <Modal open={true} onClose={onClose} title="Agent 详情" size="lg">
        <div className="p-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />加载中...
        </div>
      </Modal>
    );
  }

  if (!agent) {
    return (
      <Modal open={true} onClose={onClose} title="错误">
        <div className="p-8 text-center text-[color:var(--text-faint)]">Agent 不存在</div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} title={agent.name} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-auto">
        {/* 概要 */}
        <div className="flex items-start gap-4 p-4 bg-[color:var(--bg-soft)] rounded-lg">
          <div className="w-16 h-16 rounded-xl bg-[color:var(--accent-soft)] flex items-center justify-center text-3xl">
            {agent.avatar && !agent.avatar.startsWith('/api/') ? agent.avatar : '✦'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg">{agent.name}</div>
            <div className="text-sm text-[color:var(--text-soft)] mt-1">{agent.description}</div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[color:var(--text-faint)]">
              <span>作者: {agent.author?.display_name || agent.author?.username}</span>
              <span className="flex items-center gap-1"><Download className="w-3 h-3" />{agent.downloads_count}</span>
              <span className="flex items-center gap-1"><Star className="w-3 h-3" />{agent.rating_avg ? agent.rating_avg.toFixed(1) : '-'} ({agent.rating_count})</span>
              <span>v{agent.version}</span>
              <span>{formatBytes(agent.bundle_size)}</span>
              <span>{formatTime(agent.created_at)}</span>
            </div>
            {agent.tags && agent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {agent.tags.map(t => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button onClick={handleDownload} variant="primary" className="flex-1">
            <Download className="w-4 h-4 mr-2" />下载安装（.lxbundle）
          </Button>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 border-b border-[color:var(--line)]">
          {['overview', 'ratings', 'comments'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === t
                  ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
                  : 'border-transparent text-[color:var(--text-soft)] hover:text-[color:var(--text)]'
              )}
            >
              {t === 'overview' ? '详情' : t === 'ratings' ? `评分 (${ratings.length})` : `评论 (${comments.length})`}
            </button>
          ))}
        </div>

        {/* 内容 */}
        {activeTab === 'overview' && (
          <div className="text-sm text-[color:var(--text-soft)] space-y-2">
            <p>Bundle 大小: {formatBytes(agent.bundle_size)}</p>
            <p>发布时间: {new Date(agent.created_at).toLocaleString()}</p>
            <p>最后更新: {new Date(agent.updated_at).toLocaleString()}</p>
            <p>作者 ID: <code className="text-xs px-1 bg-[color:var(--bg-elev)] rounded">{agent.author_id}</code></p>
          </div>
        )}

        {activeTab === 'ratings' && (
          <div className="space-y-3">
            {/* 评分输入 */}
            <div className="p-3 bg-[color:var(--bg-soft)] rounded-lg">
              <div className="text-sm mb-2">我的评分: {myRating > 0 ? `${myRating} 星` : '未评分'}</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => handleRate(n)}
                    className={cn(
                      'p-1 rounded transition-colors',
                      myRating >= n ? 'text-yellow-500' : 'text-[color:var(--text-faint)] hover:text-yellow-400'
                    )}
                  >
                    <Star className="w-5 h-5" fill={myRating >= n ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
            {/* 评分列表 */}
            {ratings.length === 0 ? (
              <div className="text-center py-8 text-[color:var(--text-faint)] text-sm">暂无评分</div>
            ) : (
              ratings.map(r => (
                <div key={r.id} className="p-3 border border-[color:var(--line)] rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[color:var(--accent-soft)] flex items-center justify-center text-sm">
                        {r.user?.avatar || '✦'}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{r.user?.display_name || r.user?.username}</div>
                        <div className="text-xs text-[color:var(--text-faint)]">{formatTime(r.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map(n => (
                        <Star
                          key={n}
                          className={cn('w-3.5 h-3.5', r.score >= n ? 'text-yellow-500 fill-current' : 'text-[color:var(--text-faint)]')}
                        />
                      ))}
                    </div>
                  </div>
                  {r.review && <div className="text-sm mt-2 text-[color:var(--text-soft)]">{r.review}</div>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="写下你的评论..."
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleComment())}
                className="flex-1"
              />
              <Button onClick={handleComment} variant="primary" size="sm">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            {comments.length === 0 ? (
              <div className="text-center py-8 text-[color:var(--text-faint)] text-sm">暂无评论</div>
            ) : (
              comments.map(c => (
                <div key={c.id} className="p-3 border border-[color:var(--line)] rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-[color:var(--accent-soft)] flex items-center justify-center text-xs">
                      {c.user?.avatar || '✦'}
                    </div>
                    <span className="text-sm font-semibold">{c.user?.display_name || c.user?.username}</span>
                    <span className="text-xs text-[color:var(--text-faint)]">{formatTime(c.created_at)}</span>
                  </div>
                  <div className="text-sm text-[color:var(--text-soft)] pl-8">{c.content}</div>
                  {c.replies && c.replies.length > 0 && (
                    <div className="pl-8 mt-2 space-y-2 border-l-2 border-[color:var(--line)] ml-1">
                      {c.replies.map(r => (
                        <div key={r.id} className="pt-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold">{r.user?.display_name || r.user?.username}</span>
                            <span className="text-xs text-[color:var(--text-faint)]">{formatTime(r.created_at)}</span>
                          </div>
                          <div className="text-sm text-[color:var(--text-soft)]">{r.content}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── 排行榜 ────────────────────────────────────────────────────
function LeaderboardTab() {
  const [kind, setKind] = useState('hot');
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    community.getLeaderboard(kind, 20).then(d => {
      setAgents(d.agents || []);
      setLoading(false);
    });
  }, [kind]);

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-xl font-bold mb-4">排行榜</h2>
      <div className="flex gap-2 mb-4">
        {[
          { id: 'hot', label: '热门下载', icon: TrendingUp },
          { id: 'newest', label: '最新发布', icon: Sparkles },
          { id: 'top_rated', label: '高分好评', icon: Star },
        ].map(k => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
              kind === k.id
                ? 'bg-[color:var(--accent)] text-white'
                : 'bg-[color:var(--bg-elev)] text-[color:var(--text-soft)] hover:bg-[color:var(--accent-soft)]'
            )}
          >
            <k.icon className="w-4 h-4" />{k.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-center py-12 text-[color:var(--text-faint)]">加载中...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 text-[color:var(--text-faint)]">暂无数据</div>
      ) : (
        <div className="space-y-2">
          {agents.map((a, idx) => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)]">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                idx === 0 ? 'bg-yellow-400 text-white' :
                idx === 1 ? 'bg-gray-400 text-white' :
                idx === 2 ? 'bg-amber-600 text-white' :
                'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              )}>
                {idx + 1}
              </div>
              <div className="w-10 h-10 rounded-lg bg-[color:var(--accent-soft)] flex items-center justify-center text-xl">
                {a.avatar && !a.avatar.startsWith('/api/') ? a.avatar : '✦'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{a.name}</div>
                <div className="text-xs text-[color:var(--text-faint)]">by {a.author?.display_name || a.author?.username}</div>
              </div>
              <div className="flex items-center gap-4 text-xs text-[color:var(--text-soft)]">
                <span className="flex items-center gap-1"><Download className="w-3 h-3" />{a.downloads_count}</span>
                <span className="flex items-center gap-1"><Star className="w-3 h-3" />{a.rating_avg ? a.rating_avg.toFixed(1) : '-'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 关注 ──────────────────────────────────────────────────────
function FollowingTab({ user }) {
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    community.listFollowing(user.id).then(d => {
      setFollowing(d.users || []);
      setLoading(false);
    });
  }, [user]);

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-xl font-bold mb-4">我关注的人</h2>
      {loading ? (
        <div className="text-center py-12 text-[color:var(--text-faint)]">加载中...</div>
      ) : following.length === 0 ? (
        <div className="text-center py-12 text-[color:var(--text-faint)]">
          还没有关注任何人。浏览社区时点击作者头像关注即可。
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {following.map(u => (
            <div key={u.id} className="p-4 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)] flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[color:var(--accent-soft)] flex items-center justify-center text-lg">
                {u.avatar || '✦'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{u.display_name || u.username}</div>
                {u.bio && <div className="text-xs text-[color:var(--text-faint)] truncate mt-0.5">{u.bio}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 我的 Agent ────────────────────────────────────────────────
function MyAgentsTab({ user }) {
  const [agents, setAgents] = useState([]);
  const [localAgents, setLocalAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPublish, setShowPublish] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, local] = await Promise.all([
        community.listMyAgents(),
        api.listAgents(),
      ]);
      setAgents(mine.agents || []);
      setLocalAgents(Array.isArray(local) ? local : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">我的 Agent</h2>
          <p className="text-xs text-[color:var(--text-faint)] mt-1">把本地 Agent 发布到社区</p>
        </div>
        <Button onClick={() => setShowPublish(true)} variant="primary" size="sm">
          <Plus className="w-4 h-4 mr-1" />发布 Agent
        </Button>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2 text-[color:var(--text-soft)]">已发布（{agents.length}）</h3>
        {loading ? (
          <div className="text-center py-6 text-[color:var(--text-faint)]">加载中...</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-6 text-[color:var(--text-faint)] text-sm border border-dashed border-[color:var(--line)] rounded-lg">
            还没有发布任何 Agent
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map(a => (
              <PublishedAgentRow key={a.id} agent={a} onRefresh={load} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-[color:var(--text-soft)]">本地 Agent（{localAgents.length}）</h3>
        <div className="space-y-2">
          {localAgents.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)]">
              <div className="w-9 h-9 rounded-lg bg-[color:var(--accent-soft)] flex items-center justify-center text-lg">
                {a.avatar || '✦'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{a.name}</div>
                <div className="text-xs text-[color:var(--text-faint)] truncate">{a.description || '（无描述）'}</div>
              </div>
              <Button
                onClick={() => setShowPublish({ localAgent: a })}
                variant="ghost"
                size="sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />发布
              </Button>
            </div>
          ))}
        </div>
      </div>

      {showPublish && (
        <PublishAgentModal
          prefill={typeof showPublish === 'object' ? showPublish.localAgent : null}
          onClose={() => setShowPublish(false)}
          onPublished={() => { setShowPublish(false); load(); }}
        />
      )}
    </div>
  );
}

function PublishedAgentRow({ agent, onRefresh }) {
  const [showInvocations, setShowInvocations] = useState(false);
  return (
    <div className="p-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[color:var(--accent-soft)] flex items-center justify-center text-xl">
          {agent.avatar || '✦'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{agent.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]">v{agent.version}</span>
            {!agent.is_published && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-600">已下架</span>
            )}
          </div>
          <div className="text-xs text-[color:var(--text-faint)] mt-0.5">
            下载 {agent.downloads_count} · 评分 {agent.rating_avg ? agent.rating_avg.toFixed(1) : '-'} ({agent.rating_count})
          </div>
        </div>
        <div className="flex gap-1">
          <Button onClick={() => setShowInvocations(true)} variant="ghost" size="sm">
            <Gift className="w-3.5 h-3.5 mr-1" />邀请码
          </Button>
          <DeleteAgentButton agentId={agent.id} agentName={agent.name} onDeleted={onRefresh} />
        </div>
      </div>
      {showInvocations && (
        <InvocationsManager agentId={agent.id} onClose={() => setShowInvocations(false)} />
      )}
    </div>
  );
}

function DeleteAgentButton({ agentId, agentName, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!confirming) {
    return (
      <Button onClick={() => setConfirming(true)} variant="ghost" size="sm">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    );
  }
  return (
    <div className="flex gap-1 items-center">
      <span className="text-xs text-red-500">确认删除？</span>
      <Button
        onClick={async () => {
          setDeleting(true);
          await community.deleteAgent(agentId);
          setDeleting(false);
          onDeleted();
        }}
        variant="primary"
        size="sm"
        disabled={deleting}
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '确认'}
      </Button>
      <Button onClick={() => setConfirming(false)} variant="ghost" size="sm">取消</Button>
    </div>
  );
}

// ── 发布 Agent 弹窗 ───────────────────────────────────────────
function PublishAgentModal({ prefill, onClose, onPublished }) {
  const [name, setName] = useState(prefill?.name || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [avatar, setAvatar] = useState(prefill?.avatar || '✦');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    if (!prefill) {
      alert('请从「本地 Agent」列表中选择要发布的 Agent');
      return;
    }
    setLoading(true);
    try {
      // 1. 从 backend-desktop 下载 bundle
      const bundleUrl = api.exportAgentBundleUrl(prefill.id);
      const resp = await fetch(bundleUrl, { credentials: 'include' });
      if (!resp.ok) throw new Error('打包 Bundle 失败: ' + resp.status);
      const blob = await resp.blob();

      // 2. 上传到社区服务器
      const form = new FormData();
      form.append('name', name);
      form.append('description', description);
      form.append('avatar', avatar);
      form.append('category', category);
      form.append('tags', tags);
      form.append('version', version);
      form.append('bundle', blob, `${name}.lxbundle`);

      await community.publishAgent(form);
      onPublished();
    } catch (e) {
      alert('发布失败: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="发布 Agent 到社区" size="md">
      <div className="space-y-3">
        <div className="p-3 bg-[color:var(--bg-soft)] rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-[color:var(--accent-soft)] flex items-center justify-center">
              {prefill?.avatar || '✦'}
            </div>
            <div>
              <div className="font-semibold">{prefill?.name}</div>
              <div className="text-xs text-[color:var(--text-faint)]">从本地 Agent 打包为 .lxbundle 上传</div>
            </div>
          </div>
        </div>

        <Field label="名称">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Agent 名称" />
        </Field>
        <Field label="描述">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="一句话介绍这个 Agent..."
            className="w-full px-3 py-2 rounded-lg bg-[color:var(--bg-elev)] border border-[color:var(--line)] text-sm min-h-[60px]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="头像 (emoji 或字符)">
            <Input value={avatar} onChange={e => setAvatar(e.target.value)} maxLength={4} />
          </Field>
          <Field label="版本号">
            <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.0" />
          </Field>
        </div>
        <Field label="分类">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[color:var(--bg-elev)] border border-[color:var(--line)] text-sm"
          >
            {CATEGORIES.filter(c => c.id).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="标签 (逗号分隔)">
          <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="编程,代码审查,Go" />
        </Field>

        <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-700 dark:text-yellow-400">
          发布后 Agent 的 system_prompt 会公开。请确保不包含敏感信息（API Key、密码、私人数据）。
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={onClose} variant="ghost" className="flex-1">取消</Button>
          <Button onClick={handlePublish} variant="primary" className="flex-1" disabled={loading || !name}>
            {loading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />发布中...</> : '发布'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-[color:var(--text-soft)] mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── 邀请码管理 ────────────────────────────────────────────────
function InvocationsTab({ user }) {
  const [invocations, setInvocations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      community.listMyInvocations(),
      community.listInvocationLogs(),
    ]).then(([inv, log]) => {
      setInvocations(inv.invocations || []);
      setLogs(log.logs || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">邀请码管理</h2>
        <p className="text-xs text-[color:var(--text-faint)] mb-4">
          生成邀请码让别人可以在线调用你的 Agent（通过 h5_tunnel 转发到你本地实例）
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-[color:var(--text-soft)]">活跃邀请码（{invocations.length}）</h3>
        {loading ? (
          <div className="text-center py-6 text-[color:var(--text-faint)]">加载中...</div>
        ) : invocations.length === 0 ? (
          <div className="text-center py-6 text-[color:var(--text-faint)] text-sm border border-dashed border-[color:var(--line)] rounded-lg">
            还没有邀请码。在「我的 Agent」中点击「邀请码」按钮创建。
          </div>
        ) : (
          <div className="space-y-2">
            {invocations.map(inv => (
              <InvocationRow key={inv.code} inv={inv} onRefresh={load} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-[color:var(--text-soft)]">最近调用日志（{logs.length}）</h3>
        {logs.length === 0 ? (
          <div className="text-center py-6 text-[color:var(--text-faint)] text-sm border border-dashed border-[color:var(--line)] rounded-lg">
            还没有调用记录
          </div>
        ) : (
          <div className="space-y-1">
            {logs.slice(0, 20).map(l => (
              <div key={l.id} className="flex items-center gap-3 p-2 rounded text-xs bg-[color:var(--bg-elev)]">
                {l.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-red-500 flex-shrink-0" />
                )}
                <code className="px-1.5 py-0.5 bg-[color:var(--bg-soft)] rounded">{l.code}</code>
                <span className="text-[color:var(--text-faint)]">{formatTime(l.created_at)}</span>
                <span className="text-[color:var(--text-faint)]">{l.latency_ms}ms</span>
                {l.caller_ip && <span className="text-[color:var(--text-faint)]">{l.caller_ip}</span>}
                {!l.success && l.error_msg && (
                  <span className="text-red-500 truncate">{l.error_msg}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InvocationRow({ inv, onRefresh }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(inv.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="p-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elev)]">
      <div className="flex items-center gap-3">
        <code className="px-3 py-1.5 bg-[color:var(--bg-soft)] rounded font-mono text-base font-bold tracking-wider">
          {inv.code}
        </code>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[color:var(--text-faint)]">每日上限: {inv.daily_limit}</div>
          {inv.expires_at && (
            <div className="text-xs text-[color:var(--text-faint)]">过期: {new Date(inv.expires_at).toLocaleString()}</div>
          )}
        </div>
        <div className="flex gap-1">
          <Button onClick={handleCopy} variant="ghost" size="sm">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button
            onClick={async () => {
              await community.toggleInvocation(inv.code, !inv.is_active);
              onRefresh();
            }}
            variant="ghost"
            size="sm"
          >
            {inv.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>
          <Button
            onClick={async () => {
              if (confirm('确认删除邀请码 ' + inv.code + '?')) {
                await community.deleteInvocation(inv.code);
                onRefresh();
              }
            }}
            variant="ghost"
            size="sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// 邀请码管理弹窗（在「我的 Agent」中点击「邀请码」时打开）
function InvocationsManager({ agentId, onClose }) {
  const [invocations, setInvocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyLimit, setDailyLimit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await community.listAgentInvocations(agentId);
      setInvocations(d.invocations || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    try {
      await community.createInvocation(agentId, dailyLimit, null);
      load();
    } catch (e) {
      alert('创建失败: ' + e.message);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="邀请码管理" size="md">
      <div className="space-y-3">
        <div className="flex gap-2 items-end">
          <Field label="每日调用上限">
            <Input
              type="number"
              value={dailyLimit}
              onChange={e => setDailyLimit(parseInt(e.target.value) || 0)}
              className="w-24"
            />
          </Field>
          <Button onClick={handleCreate} variant="primary" size="sm">
            <Plus className="w-3.5 h-3.5 mr-1" />生成邀请码
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-6 text-[color:var(--text-faint)]">加载中...</div>
        ) : invocations.length === 0 ? (
          <div className="text-center py-6 text-[color:var(--text-faint)] text-sm border border-dashed border-[color:var(--line)] rounded-lg">
            还没有邀请码
          </div>
        ) : (
          <div className="space-y-2">
            {invocations.map(inv => (
              <InvocationRow key={inv.code} inv={inv} onRefresh={load} />
            ))}
          </div>
        )}
        <div className="text-xs text-[color:var(--text-faint)] p-2 bg-[color:var(--bg-soft)] rounded">
          调用方使用：POST /community/invocations/<strong>{'{code}'}</strong>/invoke，body 为消息内容。
          调用经社区服务器转发到信令服务器，再通过 h5_tunnel 转发到你本地实例的 /api/chat/quick。
          <strong>需要先在 H5 远程访问中开启云端隧道，并在「个人资料」中标记 tunnel token。</strong>
        </div>
      </div>
    </Modal>
  );
}

// ── 个人资料 ──────────────────────────────────────────────────
function SettingsTab({ user, onUpdate }) {
  const [displayName, setDisplayName] = useState(user.display_name || user.username);
  const [avatar, setAvatar] = useState(user.avatar || '✦');
  const [bio, setBio] = useState(user.bio || '');
  const [tunnelToken, setTunnelToken] = useState(extractTunnelToken(user.bio));
  const [saving, setSaving] = useState(false);

  function extractTunnelToken(bio) {
    if (!bio) return '';
    const m = bio.match(/\[tunnel:([^\]]+)\]/);
    return m ? m[1] : '';
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalBio = bio;
      // 合并 tunnel token 到 bio
      const oldTunnel = extractTunnelToken(bio);
      if (oldTunnel) {
        finalBio = bio.replace(/\[tunnel:[^\]]+\]/g, '').trim();
      }
      if (tunnelToken) {
        finalBio = (finalBio + ' [tunnel:' + tunnelToken + ']').trim();
      }
      const d = await community.updateMe({
        display_name: displayName,
        avatar,
        bio: finalBio,
      });
      onUpdate(d.user);
      alert('已保存');
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold">个人资料</h2>
        <p className="text-xs text-[color:var(--text-faint)] mt-1">这些信息会展示在你的主页和发布的 Agent 上</p>
      </div>

      <Field label="用户名（不可修改）">
        <Input value={user.username} disabled />
      </Field>

      <Field label="昵称">
        <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
      </Field>

      <Field label="头像（emoji 或字符）">
        <Input value={avatar} onChange={e => setAvatar(e.target.value)} maxLength={4} />
      </Field>

      <Field label="个人简介">
        <textarea
          value={bio.replace(/\[tunnel:[^\]]+\]/g, '').trim()}
          onChange={e => setBio(e.target.value)}
          placeholder="一句话介绍自己..."
          className="w-full px-3 py-2 rounded-lg bg-[color:var(--bg-elev)] border border-[color:var(--line)] text-sm min-h-[60px]"
        />
      </Field>

      <div className="p-3 bg-[color:var(--bg-soft)] rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Gift className="w-4 h-4 text-[color:var(--accent)]" />
          <span className="text-sm font-semibold">h5_tunnel Token</span>
        </div>
        <p className="text-xs text-[color:var(--text-faint)] mb-2">
          把你灵犀客户端的 H5 远程访问云端隧道 token 填在这里，别人才能通过邀请码调用你的 Agent。
          在「设置 → H5 远程访问」中查看你的 token。
        </p>
        <Input
          value={tunnelToken}
          onChange={e => setTunnelToken(e.target.value)}
          placeholder="如 lx_xxxxxxxxxxxx"
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} variant="primary" disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />保存中...</> : '保存'}
        </Button>
      </div>

      <div className="p-3 bg-[color:var(--bg-elev)] rounded-lg text-xs text-[color:var(--text-faint)]">
        <div className="font-semibold mb-1 text-[color:var(--text-soft)]">统计</div>
        <div>已发布 Agent: {user.agents_count || 0}</div>
        <div>粉丝: {user.followers_count || 0}</div>
        <div>关注: {user.following_count || 0}</div>
        <div className="mt-2">注册时间: {new Date(user.created_at).toLocaleString()}</div>
      </div>
    </div>
  );
}
