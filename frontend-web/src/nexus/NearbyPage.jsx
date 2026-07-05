import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radar, RefreshCw, UserPlus, Sparkles, Wifi } from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Badge } from '../ui/primitives';
import { cn } from '../ui/cn';

export default function NearbyPage() {
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await api.listPeers();
      setPeers(data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleConnect = async (peer) => {
    try {
      await api.sendConnectRequest({
        peer_id: peer.id,
        nickname: peer.nickname,
        host: peer.host,
        port: peer.port,
      });
    } catch {}
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-soft)] flex items-center justify-center">
            <Radar size={20} className="text-[color:var(--accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[color:var(--text)]">附近</h1>
            <p className="text-sm text-[color:var(--text-soft)]">局域网内发现的灵犀实例</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          刷新
        </Button>
      </div>

      {peers.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[color:var(--bg-soft)] flex items-center justify-center">
            <Wifi size={28} className="text-[color:var(--text-faint)]" />
          </div>
          <p className="text-[color:var(--text-soft)]">未发现局域网内的其他灵犀实例</p>
          <p className="text-xs text-[color:var(--text-faint)]">确保其他设备上的灵犀已开启"对外可见"模式</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {peers.map((peer) => {
              let agents = [];
              try { agents = JSON.parse(peer.agents_json || '[]'); } catch {}
              return (
                <motion.div
                  key={peer.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[color:var(--accent-soft)] flex items-center justify-center text-sm font-bold text-[color:var(--accent)]">
                          {(peer.nickname || '?')[0]}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[color:var(--text)]">
                            {peer.nickname || '未命名实例'}
                          </div>
                          <div className="text-xs text-[color:var(--text-faint)]">
                            {peer.host}:{peer.port}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleConnect(peer)}>
                        <UserPlus size={14} />
                        建联
                      </Button>
                    </div>

                    {agents.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs text-[color:var(--text-soft)] font-medium">公开 Agent</div>
                        {agents.map((agent, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-[color:var(--bg-soft)]">
                            <Sparkles size={12} className="text-[color:var(--accent)] shrink-0" />
                            <span className="text-xs font-medium text-[color:var(--text)]">{agent.name}</span>
                            <div className="flex gap-1 flex-wrap ml-auto">
                              {(agent.capability_tags || []).map((tag, ti) => (
                                <Badge key={ti} variant="soft" className="text-[10px] px-1.5 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
