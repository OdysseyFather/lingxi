import { useState, useEffect, useCallback } from 'react';

import {
  Search, Users, RefreshCw, Sparkles, Wifi,
  Check, X, Globe, Radio, Radar, UsersRound, Plus,
} from 'lucide-react';
import { api, wsClient } from '../api/client';
import { useStore } from '../state/useStore';
import { Button, Card, Badge, Select } from '../ui/primitives';
import { cn } from '../ui/cn';
import GroupChatView from './GroupChatView';

const StatusBadge = ({ status }) => {
  const map = {
    active: { label: '进行中', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    paused: { label: '已暂停', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    completed: { label: '已结束', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
    terminated: { label: '已终止', color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
  };
  const s = map[status] || map.active;
  return <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', s.color)}>{s.label}</span>;
};
import CreateGroupModal from './CreateGroupModal';

/* ─── 左侧边栏列表项组件 ──────────────────────────────────────── */

const Avatar = ({ name, online, avatar_url, size = 'md', color = 'accent' }) => {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const colorMap = {
    accent: 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="relative shrink-0">
      {avatar_url ? (
        <img src={avatar_url} alt="" className={cn(sizeClass, 'rounded-xl object-cover')} />
      ) : (
        <div className={cn(sizeClass, 'rounded-xl flex items-center justify-center font-bold', colorMap[color] || colorMap.accent)}>
          {(name || '?')[0]}
        </div>
      )}
      {online !== undefined && (
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[color:var(--bg-elev)]',
          dotSize,
          online ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-gray-600'
        )} />
      )}
    </div>
  );
};


/* ─── 右侧：发现面板（在线 peers，可直接发起对话）──────────────── */

const DiscoveryPanel = ({ peers, wanPeers, wanStatus, loading, onRefresh, onRefreshWAN }) => (
  <div className="flex-1 flex flex-col min-h-0 overflow-auto scrollable p-6">
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-lg font-bold text-[color:var(--text)]">在线节点</h2>
        <p className="text-xs text-[color:var(--text-faint)] mt-0.5">发现附近和远程的灵犀实例，创建群聊时可邀请这些节点的 Agent</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} /> 扫描
        </Button>
      </div>
    </div>

    {/* LAN 节点 */}
    {peers.length > 0 && (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Radio size={12} className="text-blue-500" />
          <span className="text-xs font-medium text-[color:var(--text-soft)]">局域网 ({peers.length})</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {peers.map((peer) => {
            let agents = [];
            try { agents = JSON.parse(peer.agents_json || '[]'); } catch {}
            return (
              <Card key={peer.id} className="p-4 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={peer.nickname} online={true} />
                  <div>
                    <div className="text-sm font-medium text-[color:var(--text)]">{peer.nickname || '未知'}</div>
                    <div className="text-[10px] text-[color:var(--text-faint)]">{peer.host}:{peer.port}</div>
                  </div>
                </div>
                {agents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {agents.map((a, i) => (
                      <Badge key={i} variant="soft" className="text-[9px] gap-1"><Sparkles size={8} />{a.name}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    )}

    {/* WAN 节点 */}
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe size={12} className="text-purple-500" />
          <span className="text-xs font-medium text-[color:var(--text-soft)]">广域网 ({wanPeers.length})</span>
          <div className={cn('w-1.5 h-1.5 rounded-full', wanStatus?.connected ? 'bg-emerald-400' : 'bg-gray-300')} />
        </div>
        <Button variant="ghost" size="sm" onClick={onRefreshWAN} disabled={!wanStatus?.connected}>
          <RefreshCw size={11} /> 刷新
        </Button>
      </div>

      {!wanStatus?.enabled ? (
        <Card className="p-8 text-center">
          <Globe size={32} className="mx-auto text-[color:var(--text-faint)] mb-3" />
          <p className="text-sm text-[color:var(--text-soft)]">广域网未启用</p>
          <p className="text-xs text-[color:var(--text-faint)] mt-1">前往「设置 → Nexus 网络」启用</p>
        </Card>
      ) : wanPeers.length === 0 ? (
        <Card className="p-8 text-center">
          <Radar size={32} className="mx-auto text-[color:var(--text-faint)] mb-3" />
          <p className="text-sm text-[color:var(--text-soft)]">未发现远程节点</p>
          <p className="text-xs text-[color:var(--text-faint)] mt-1">等待其他用户上线</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {wanPeers.map((peer) => (
            <Card key={peer.instance_id} className="p-4 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={peer.nickname} avatar_url={peer.avatar_url} online={true} color="purple" />
                <div>
                  <div className="text-sm font-medium text-[color:var(--text)]">{peer.nickname || '远程用户'}</div>
                  <div className="flex items-center gap-1 text-[10px] text-[color:var(--text-faint)]">
                    <Globe size={8} /> {peer.platform || '未知'} {peer.device_name ? `· ${peer.device_name}` : ''}
                  </div>
                </div>
              </div>
              {peer.agents && peer.agents.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {peer.agents.map((a, i) => (
                    <Badge key={i} variant="soft" className="text-[9px] gap-1"><Sparkles size={8} />{a.name}</Badge>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>

    {peers.length === 0 && (!wanStatus?.enabled || wanPeers.length === 0) && (
      <Card className="p-12 text-center mt-4">
        <Wifi size={40} className="mx-auto text-[color:var(--text-faint)] mb-4 opacity-40" />
        <p className="text-sm font-medium text-[color:var(--text-soft)]">暂未发现任何节点</p>
        <p className="text-xs text-[color:var(--text-faint)] mt-2">确保其他设备已开启「对外可见」模式</p>
      </Card>
    )}
  </div>
);

/* ─── 右侧：空状态 ────────────────────────────────────────────── */

const EmptyMainPanel = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 opacity-60">
    <div className="w-20 h-20 rounded-3xl bg-[color:var(--bg-soft)] flex items-center justify-center mb-6">
      <Globe size={36} className="text-[color:var(--text-faint)]" />
    </div>
    <h3 className="text-base font-semibold text-[color:var(--text-soft)]">Nexus 网络</h3>
    <p className="text-xs text-[color:var(--text-faint)] mt-2 text-center max-w-[240px]">
      选择左侧的对话或点击「发现」探索在线节点并发起对话
    </p>
  </div>
);

/* ─── 主组件 ──────────────────────────────────────────────────── */

export default function NexusPage() {
  const [peers, setPeers] = useState([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [wanPeers, setWanPeers] = useState([]);
  const [wanStatus, setWanStatus] = useState(null);
  const [agentList, setAgentList] = useState([]);

  const [selected, setSelected] = useState('discovery');
  const [searchQuery, setSearchQuery] = useState('');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const groupChats = useStore((s) => s.groupChats);
  const refreshGroupChats = useStore((s) => s.refreshGroupChats);
  const groupInvites = useStore((s) => s.groupInvites);
  const popGroupInvite = useStore((s) => s.popGroupInvite);
  const [acceptingGroupId, setAcceptingGroupId] = useState(null);
  const [groupAcceptAgentIds, setGroupAcceptAgentIds] = useState([]);

  // ─── 数据加载 ─────────────────────────────────────────────────
  const refreshPeers = useCallback(async () => {
    setPeersLoading(true);
    try { setPeers(await api.listPeers() || []); } catch {}
    setPeersLoading(false);
  }, []);

  const refreshWANPeers = useCallback(async () => {
    try { setWanPeers(await api.listWANPeers() || []); } catch {}
  }, []);

  const refreshWANStatus = useCallback(async () => {
    try { setWanStatus(await api.getWANStatus() || null); } catch {}
  }, []);

  useEffect(() => {
    refreshPeers();
    refreshWANStatus();
    refreshWANPeers();
    refreshGroupChats();
    api.listAgents().then(setAgentList).catch(() => {});
    const t1 = setInterval(refreshPeers, 15000);
    const t3 = setInterval(refreshWANPeers, 20000);
    const t4 = setInterval(refreshGroupChats, 8000);
    return () => { clearInterval(t1); clearInterval(t3); clearInterval(t4); };
  }, [refreshPeers, refreshWANPeers, refreshWANStatus, refreshGroupChats]);

  // ─── WebSocket 事件 ────────────────────────────────────────────
  useEffect(() => {
    const unsub = wsClient.on((msg) => {
      if (msg.event === 'wan_peer_online' || msg.event === 'wan_peer_offline' || msg.event === 'wan_peers_updated') {
        refreshWANPeers();
      }
      if (msg.event === 'wan_connection_status') {
        refreshWANStatus();
      }
    });
    return unsub;
  }, [refreshWANPeers, refreshWANStatus]);

  // ─── 操作 ─────────────────────────────────────────────────────

  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const sidebarHidden = isNarrow && selected?.type === 'group';

  // ─── 主界面 ───────────────────────────────────────────────────
  return (
    <div className="flex-1 flex min-h-0">
      {/* 左侧边栏 */}
      <aside className={cn(
        'shrink-0 flex flex-col border-r border-[color:var(--line)] bg-[color:var(--bg-elev)]/80 backdrop-blur transition-all duration-200',
        sidebarHidden ? 'w-0 overflow-hidden opacity-0' : 'w-[280px]'
      )}>
        {/* 顶部搜索 + 发现按钮 */}
        <div className="p-3 space-y-2 border-b border-[color:var(--line)]">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索对话..."
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-xs text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:border-[color:var(--accent)] transition"
              />
            </div>
            <button
              onClick={() => setSelected('discovery')}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition',
                selected === 'discovery'
                  ? 'bg-[color:var(--accent)] text-white'
                  : 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--accent)] hover:bg-[color:var(--accent-soft)]'
              )}
              title="发现在线节点"
            >
              <Radar size={15} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--text-faint)]">
            <UsersRound size={12} />
            <span>群聊 {groupChats.length > 0 && <span className="text-[color:var(--accent)]">({groupChats.length})</span>}</span>
          </div>
        </div>

        {/* 列表区域 */}
        <div className="flex-1 overflow-auto scrollable py-2">
            <div>
              <div className="px-3 mb-2">
                <Button size="sm" className="w-full" onClick={() => setCreateGroupOpen(true)}>
                  <Plus size={13} /> 创建群聊
                </Button>
              </div>
              {/* 待处理群聊邀请 */}
              {groupInvites.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-1 text-[10px] font-semibold text-red-500 uppercase tracking-wider flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    群聊邀请 ({groupInvites.length})
                  </div>
                  {groupInvites.map((invite) => (
                    <div key={invite.room_id} className="px-3 py-2.5 mx-2 mb-1 rounded-lg bg-purple-50/80 dark:bg-purple-900/20 border border-purple-200/60 dark:border-purple-700/40">
                      <div className="flex items-center gap-2 mb-1.5">
                        <UsersRound size={14} className="text-purple-600 dark:text-purple-400" />
                        <span className="text-xs font-medium truncate flex-1">{invite.topic || '群聊邀请'}</span>
                      </div>
                      <div className="text-[10px] text-[color:var(--text-faint)] mb-2">{invite.host_nickname} 邀请你加入</div>
                      {acceptingGroupId === invite.room_id ? (
                        <div className="space-y-1.5">
                          <Select
                            value=""
                            onChange={(e) => {
                              const id = parseInt(e.target.value);
                              if (id && !groupAcceptAgentIds.includes(id)) {
                                setGroupAcceptAgentIds([...groupAcceptAgentIds, id]);
                              }
                            }}
                            className="!h-7 !text-[10px]"
                          >
                            <option value="">+ 选择本端 Agent</option>
                            {agentList.filter((a) => !groupAcceptAgentIds.includes(a.id)).map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </Select>
                          <div className="flex flex-wrap gap-1">
                            {groupAcceptAgentIds.map((id) => {
                              const a = agentList.find((x) => x.id === id);
                              return (
                                <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-200/50 text-[10px]">
                                  {a?.name} <button onClick={() => setGroupAcceptAgentIds(groupAcceptAgentIds.filter((x) => x !== id))}><X size={9} /></button>
                                </span>
                              );
                            })}
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={async () => {
                                if (groupAcceptAgentIds.length === 0) return;
                                await api.acceptGroupInvite(invite.room_id, groupAcceptAgentIds);
                                popGroupInvite(invite.room_id);
                                setAcceptingGroupId(null);
                                setGroupAcceptAgentIds([]);
                                refreshGroupChats();
                                setSelected({ type: 'group', id: invite.room_id });
                              }}
                              disabled={groupAcceptAgentIds.length === 0}
                              className="flex-1 h-6 rounded bg-emerald-500 text-white text-[10px] disabled:opacity-40"
                            >
                              确认加入
                            </button>
                            <button
                              onClick={() => { setAcceptingGroupId(null); setGroupAcceptAgentIds([]); }}
                              className="flex-1 h-6 rounded bg-gray-200 dark:bg-gray-700 text-[color:var(--text-faint)] text-[10px]"
                            >取消</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setAcceptingGroupId(invite.room_id); setGroupAcceptAgentIds([]); }}
                            className="h-6 px-2 rounded bg-emerald-500 text-white text-[10px] font-medium flex items-center gap-1"
                          >
                            <Check size={10} /> 接受
                          </button>
                          <button
                            onClick={async () => { await api.rejectGroupInvite(invite.room_id); popGroupInvite(invite.room_id); refreshGroupChats(); }}
                            className="h-6 px-2 rounded bg-gray-200 dark:bg-gray-700 text-[color:var(--text-faint)] text-[10px] flex items-center gap-1"
                          >
                            <X size={10} /> 拒绝
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {groupChats.length === 0 && groupInvites.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <UsersRound size={24} className="mx-auto text-[color:var(--text-faint)] mb-2 opacity-40" />
                  <p className="text-xs text-[color:var(--text-faint)]">还没有群聊</p>
                  <p className="text-[10px] text-[color:var(--text-faint)] mt-1">点击「创建群聊」拉本端和远端 Agent 一起聊</p>
                </div>
              ) : (
                <div className="mb-2">
                  <div className="px-4 py-1 text-[10px] font-semibold text-[color:var(--text-faint)] uppercase tracking-wider">
                    群聊 ({groupChats.length})
                  </div>
                  {groupChats.map((g) => (
                    <div
                      key={g.id}
                      onClick={() => setSelected({ type: 'group', id: g.id })}
                      className={cn(
                        'mx-2 mb-1 px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-3 transition',
                        selected?.type === 'group' && selected?.id === g.id
                          ? 'bg-[color:var(--accent-soft)] border-l-2 border-[color:var(--accent)]'
                          : 'hover:bg-[color:var(--bg-soft)] border-l-2 border-transparent'
                      )}
                    >
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        g.status === 'active'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                          : 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)]'
                      )}>
                        <UsersRound size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{g.topic || '群聊'}</span>
                          <StatusBadge status={g.status} />
                        </div>
                        <div className="text-[10px] text-[color:var(--text-faint)] truncate mt-0.5">
                          {g.created_by_local ? '群主' : '成员'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

        </div>

        {/* 底部状态栏 */}
        <div className="px-3 py-2 border-t border-[color:var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] text-[color:var(--text-faint)]">
              <Radio size={9} className="text-blue-400" />
              <span>{peers.length} LAN</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[color:var(--text-faint)]">
              <Globe size={9} className="text-purple-400" />
              <span>{wanPeers.length} WAN</span>
            </div>
          </div>
          <div className={cn('w-1.5 h-1.5 rounded-full', wanStatus?.connected ? 'bg-emerald-400' : 'bg-gray-300')} title={wanStatus?.connected ? 'WAN 已连接' : 'WAN 未连接'} />
        </div>
      </aside>

      {/* 右侧主区 */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0">
        {selected === 'discovery' ? (
          <DiscoveryPanel
            peers={peers} wanPeers={wanPeers} wanStatus={wanStatus}
            loading={peersLoading} onRefresh={refreshPeers} onRefreshWAN={refreshWANPeers}
          />
        ) : selected?.type === 'group' ? (
          <GroupChatView roomId={selected.id} onBack={() => setSelected(null)} />
        ) : (
          <EmptyMainPanel />
        )}
      </main>

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={(roomId) => {
          refreshGroupChats();
          if (roomId) setSelected({ type: 'group', id: roomId });
        }}
      />
    </div>
  );
}
