import { useEffect, useMemo, useState } from 'react';
import { Globe, Plus, Wifi, X } from 'lucide-react';
import { api } from '../api/client';
import { Modal, Button, Select, Input } from '../ui/primitives';

/** 群主在群内继续邀请：本端 Agent + 远端实例 Agent（无主题必填） */
export default function GroupInviteMembersModal({ open, onClose, roomId, onDone }) {
  const [agents, setAgents] = useState([]);
  const [lanPeers, setLanPeers] = useState([]);
  const [wanPeers, setWanPeers] = useState([]);
  const [localAgentIds, setLocalAgentIds] = useState([]);
  const [remoteMembers, setRemoteMembers] = useState([]);
  const [pickPeer, setPickPeer] = useState('');
  const [pickAgentName, setPickAgentName] = useState('');
  const [busy, setBusy] = useState(false);

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

  const reset = () => {
    setLocalAgentIds([]);
    setRemoteMembers([]);
    setPickPeer('');
    setPickAgentName('');
  };

  const handleSubmit = async () => {
    if (!roomId || (localAgentIds.length === 0 && remoteMembers.length === 0)) return;
    setBusy(true);
    try {
      await api.inviteGroupMembers(roomId, {
        local_agent_ids: localAgentIds,
        remote_members: remoteMembers,
      });
      reset();
      onDone?.();
      onClose?.();
    } catch (_) {}
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose?.(); }} title="邀请成员" width={560}>
      <div className="space-y-3 max-h-[60vh] overflow-auto scrollable pr-1">
        <div className="text-[11px] text-[color:var(--text-faint)]">
          群主可随时拉人进群；远端会收到与原建群一致的邀请通知。
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-[color:var(--text-soft)]">新增本端 Agent</span>
            <Select value="" onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              if (!id) return;
              if (!localAgentIds.includes(id)) setLocalAgentIds([...localAgentIds, id]);
            }} className="!w-auto !inline-block">
              <option value="">+ 添加</option>
              {agents.filter((a) => !localAgentIds.includes(a.id)).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-1">
            {localAgentIds.map((id) => {
              const a = agents.find((x) => x.id === id);
              if (!a) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[color:var(--accent-soft)] text-[color:var(--accent)] text-xs">
                  {a.name}
                  <button type="button" onClick={() => setLocalAgentIds(localAgentIds.filter((x) => x !== id))}><X size={11} /></button>
                </span>
              );
            })}
          </div>
        </div>
        <div>
          <span className="text-xs font-medium text-[color:var(--text-soft)] mb-2 block">新增远端 Agent</span>
          <div className="flex flex-wrap gap-2 mb-2">
            <Select value={pickPeer} onChange={(e) => { setPickPeer(e.target.value); setPickAgentName(''); }}>
              <option value="">选择 Peer</option>
              {allPeers.map((p) => (
                <option key={p.id} value={p.id}>{p.type === 'wan' ? '🌐' : '📡'} {p.nickname}</option>
              ))}
            </Select>
            {peerAgents.length > 0 ? (
              <Select value={pickAgentName} onChange={(e) => setPickAgentName(e.target.value)}>
                <option value="">Agent</option>
                {peerAgents.map((a, i) => (
                  <option key={i} value={a.name || a.public_name || ''}>{a.name || a.public_name}</option>
                ))}
              </Select>
            ) : (
              <Input
                value={pickAgentName}
                onChange={(e) => setPickAgentName(e.target.value)}
                placeholder={pickPeer ? '对方 Agent 名' : ''}
                disabled={!pickPeer}
              />
            )}
            <Button
              size="sm"
              type="button"
              onClick={() => {
                const peer = allPeers.find((p) => p.id === pickPeer);
                if (!peer || !pickAgentName.trim()) return;
                if (remoteMembers.some((m) => m.peer_id === pickPeer && m.agent_name === pickAgentName.trim())) return;
                setRemoteMembers([...remoteMembers, {
                  peer_id: pickPeer,
                  peer_nickname: peer.nickname,
                  agent_name: pickAgentName.trim(),
                }]);
                setPickAgentName('');
              }}
              disabled={!pickPeer || !pickAgentName.trim()}
            >
              <Plus size={12} /> 添加
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {remoteMembers.map((m, i) => {
              const peer = allPeers.find((p) => p.id === m.peer_id);
              return (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs">
                  {peer?.type === 'wan' ? <Globe size={10} /> : <Wifi size={10} />}
                  {m.peer_nickname} / {m.agent_name}
                  <button type="button" onClick={() => setRemoteMembers(remoteMembers.filter((_, j) => j !== i))}><X size={11} /></button>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t border-[color:var(--line)] mt-3">
        <Button variant="ghost" type="button" onClick={() => { reset(); onClose?.(); }}>取消</Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={busy || localAgentIds.length + remoteMembers.length === 0}
        >
          {busy ? '提交中…' : '发送邀请'}
        </Button>
      </div>
    </Modal>
  );
}
