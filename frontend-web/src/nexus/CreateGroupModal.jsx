import { useEffect, useMemo, useState } from 'react';
import { Users, Plus, X, Globe, Wifi, MessageCircle, Briefcase } from 'lucide-react';
import { api } from '../api/client';
import { Modal, Button, Input, Textarea, Select } from '../ui/primitives';
import { cn } from '../ui/cn';

export default function CreateGroupModal({ open, onClose, onCreated }) {
  const [agents, setAgents] = useState([]);
  const [lanPeers, setLanPeers] = useState([]);
  const [wanPeers, setWanPeers] = useState([]);

  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [localAgentIds, setLocalAgentIds] = useState([]);
  const [remoteMembers, setRemoteMembers] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // 群聊模式：casual=闲聊 | meeting=工作会议
  const [chatMode, setChatMode] = useState('casual');
  const [moderatorAgentId, setModeratorAgentId] = useState(0);
  const [maxRounds, setMaxRounds] = useState(12);

  const [pickPeer, setPickPeer] = useState('');
  const [pickAgentName, setPickAgentName] = useState('');

  useEffect(() => {
    if (!open) return;
    api.listAgents().then(setAgents).catch(() => {});
    api.listPeers().then((p) => setLanPeers(p || [])).catch(() => {});
    api.listWANPeers().then((p) => setWanPeers(p || [])).catch(() => {});
  }, [open]);

  const allPeers = useMemo(() => {
    const map = new Map();
    for (const p of lanPeers) {
      map.set(p.id, { id: p.id, nickname: p.nickname || p.id, agents_json: p.agents_json, type: 'lan' });
    }
    for (const p of wanPeers) {
      const id = p.instance_id || p.id;
      if (!map.has(id)) {
        map.set(id, { id, nickname: p.nickname || id, agents_json: JSON.stringify(p.agents || []), type: 'wan' });
      }
    }
    return Array.from(map.values());
  }, [lanPeers, wanPeers]);

  const peerAgents = useMemo(() => {
    const peer = allPeers.find((p) => p.id === pickPeer);
    if (!peer || !peer.agents_json) return [];
    try {
      const arr = typeof peer.agents_json === 'string' ? JSON.parse(peer.agents_json) : peer.agents_json;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [pickPeer, allPeers]);

  // 会议主持人：优先用户选择的；否则退化为第一个本端 Agent（主持人必须是本端 Agent）
  const effectiveModerator = useMemo(
    () => (moderatorAgentId && localAgentIds.includes(moderatorAgentId) ? moderatorAgentId : (localAgentIds[0] || 0)),
    [moderatorAgentId, localAgentIds]
  );

  const canSubmit =
    topic.trim() &&
    (localAgentIds.length > 0 || remoteMembers.length > 0) &&
    (chatMode !== 'meeting' || (localAgentIds.length > 0 && effectiveModerator > 0));

  const reset = () => {
    setTopic('');
    setGoal('');
    setLocalAgentIds([]);
    setRemoteMembers([]);
    setPickPeer('');
    setPickAgentName('');
    setChatMode('casual');
    setModeratorAgentId(0);
    setMaxRounds(12);
  };

  const handleAddLocalAgent = (id) => {
    if (!id) return;
    if (localAgentIds.includes(id)) return;
    setLocalAgentIds([...localAgentIds, id]);
  };

  const handleRemoveLocalAgent = (id) => {
    setLocalAgentIds(localAgentIds.filter((x) => x !== id));
  };

  const handleAddRemoteMember = () => {
    if (!pickPeer || !pickAgentName.trim()) return;
    const peer = allPeers.find((p) => p.id === pickPeer);
    if (!peer) return;
    const exists = remoteMembers.some((m) => m.peer_id === pickPeer && m.agent_name === pickAgentName);
    if (exists) return;
    setRemoteMembers([...remoteMembers, {
      peer_id: pickPeer,
      peer_nickname: peer.nickname,
      agent_name: pickAgentName.trim(),
    }]);
    setPickAgentName('');
  };

  const handleRemoveRemoteMember = (peerId, agentName) => {
    setRemoteMembers(remoteMembers.filter((m) => !(m.peer_id === peerId && m.agent_name === agentName)));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api.createGroupChat({
        topic,
        goal,
        chat_mode: chatMode,
        moderator_agent_id: chatMode === 'meeting' ? effectiveModerator : 0,
        max_rounds: chatMode === 'meeting' ? (parseInt(maxRounds) || 12) : 0,
        local_agent_ids: localAgentIds,
        remote_members: remoteMembers,
      });
      onCreated?.(res?.id);
      reset();
      onClose();
    } catch {}
    setSubmitting(false);
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title={chatMode === 'meeting' ? '创建工作会议' : '创建群聊'} width={620}>
      <div className="space-y-4 max-h-[70vh] overflow-auto scrollable pr-1">
        <div>
          <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1.5 block">群聊模式</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setChatMode('casual')}
              className={cn(
                'flex items-start gap-2 p-3 rounded-xl border text-left transition',
                chatMode === 'casual'
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                  : 'border-[color:var(--line)] hover:bg-[color:var(--bg-soft)]'
              )}
            >
              <MessageCircle size={16} className="mt-0.5 text-[color:var(--accent)] shrink-0" />
              <div>
                <div className="text-sm font-medium text-[color:var(--text)]">闲聊群</div>
                <div className="text-[11px] text-[color:var(--text-faint)] mt-0.5">自由发言、你一言我一语的群聊氛围</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setChatMode('meeting')}
              className={cn(
                'flex items-start gap-2 p-3 rounded-xl border text-left transition',
                chatMode === 'meeting'
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                  : 'border-[color:var(--line)] hover:bg-[color:var(--bg-soft)]'
              )}
            >
              <Briefcase size={16} className="mt-0.5 text-[color:var(--accent)] shrink-0" />
              <div>
                <div className="text-sm font-medium text-[color:var(--text)]">工作会议</div>
                <div className="text-[11px] text-[color:var(--text-faint)] mt-0.5">主持人牵头、围绕目标讨论得出结论</div>
              </div>
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">{chatMode === 'meeting' ? '会议议题' : '主题'}</label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={chatMode === 'meeting' ? '比如：Q3 增长方案评审' : '比如：技术评审、周末去哪玩'} autoFocus />
        </div>
        <div>
          <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">{chatMode === 'meeting' ? '会议目标（建议填写）' : '目标（可选）'}</label>
          <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={chatMode === 'meeting' ? '希望这场会议得出什么结论 / 产出' : '希望聊出什么结果'} rows={2} />
        </div>

        {chatMode === 'meeting' && (
          <div className="space-y-3 p-3 rounded-xl border border-[color:var(--accent)]/30 bg-[color:var(--accent-soft)]/40">
            <div>
              <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">主持人（必须是本端 Agent）</label>
              <Select value={effectiveModerator || ''} onChange={(e) => setModeratorAgentId(parseInt(e.target.value) || 0)}>
                <option value="">{localAgentIds.length === 0 ? '请先在下方添加本端 Agent' : '选择主持人'}</option>
                {localAgentIds.map((id) => {
                  const a = agents.find((x) => x.id === id);
                  return a ? <option key={id} value={id}>{a.name}</option> : null;
                })}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">最多发言轮数</label>
              <Input type="number" min={2} max={50} value={maxRounds} onChange={(e) => setMaxRounds(e.target.value)} />
              <div className="text-[11px] text-[color:var(--text-faint)] mt-1">到达上限会让主持人强制总结结论并结束会议。</div>
            </div>
          </div>
        )}

        <div className="text-[11px] text-[color:var(--text-faint)] p-2 rounded-lg bg-[color:var(--bg-soft)]">
          {chatMode === 'meeting'
            ? '建会后主持人会开场陈述议题与目标、点名参会者依次发言、围绕目标推进，并在达成目标或到达轮数上限时总结结论。'
            : '建群后 Agent 会自动开始聊天，你也可以随时插话、@ 某人或回复消息。'}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-[color:var(--text-soft)]">本端 Agent</label>
            <Select value="" onChange={(e) => handleAddLocalAgent(parseInt(e.target.value))} className="!w-auto !inline-block">
              <option value="">+ 添加 Agent</option>
              {agents.filter((a) => !localAgentIds.includes(a.id)).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {localAgentIds.length === 0 && (
              <span className="text-[11px] text-[color:var(--text-faint)]">建议至少 1 个本端 Agent</span>
            )}
            {localAgentIds.map((id) => {
              const agent = agents.find((a) => a.id === id);
              if (!agent) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[color:var(--accent-soft)] text-[color:var(--accent)] text-xs">
                  {agent.name}
                  <button onClick={() => handleRemoveLocalAgent(id)}><X size={11} /></button>
                </span>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[color:var(--text-soft)] mb-1 block">远端成员（其他实例的 Agent）</label>
          <div className="flex gap-2 mb-2">
            <Select value={pickPeer} onChange={(e) => { setPickPeer(e.target.value); setPickAgentName(''); }}>
              <option value="">选择 Peer</option>
              {allPeers.map((p) => (
                <option key={p.id} value={p.id}>{p.type === 'wan' ? '🌐' : '📡'} {p.nickname}</option>
              ))}
            </Select>
            {peerAgents.length > 0 ? (
              <Select value={pickAgentName} onChange={(e) => setPickAgentName(e.target.value)}>
                <option value="">选择 Agent</option>
                {peerAgents.map((a, i) => (
                  <option key={i} value={a.name || a.public_name || ''}>{a.name || a.public_name}</option>
                ))}
              </Select>
            ) : (
              <Input
                value={pickAgentName}
                onChange={(e) => setPickAgentName(e.target.value)}
                placeholder={pickPeer ? '输入对方 Agent 名' : '先选择 Peer'}
                disabled={!pickPeer}
              />
            )}
            <Button size="sm" onClick={handleAddRemoteMember} disabled={!pickPeer || !pickAgentName.trim()}>
              <Plus size={12} /> 添加
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {remoteMembers.length === 0 && <span className="text-[11px] text-[color:var(--text-faint)]">可选</span>}
            {remoteMembers.map((m, i) => {
              const peer = allPeers.find((p) => p.id === m.peer_id);
              return (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs">
                  {peer?.type === 'wan' ? <Globe size={10} /> : <Wifi size={10} />}
                  {m.peer_nickname} / {m.agent_name}
                  <button onClick={() => handleRemoveRemoteMember(m.peer_id, m.agent_name)}><X size={11} /></button>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-[color:var(--line)] mt-3">
        <Button variant="ghost" onClick={() => { reset(); onClose(); }}>取消</Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !canSubmit}
        >
          <Users size={14} />
          {submitting ? '创建中…' : (chatMode === 'meeting' ? '创建会议' : '创建群聊')}
        </Button>
      </div>
    </Modal>
  );
}
