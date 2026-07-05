import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useStore } from '../state/useStore';
import { Button, Card, Input } from '../ui/primitives';
import { UserPlus, RefreshCw } from 'lucide-react';

export default function AdminPage() {
  const user = useStore((s) => s.currentUser);
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, i] = await Promise.all([api.listAdminUsers(), api.listInvitations()]);
      setUsers(u || []);
      setInvites(i || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user?.role === 'admin') load(); }, [user]);

  if (user?.role !== 'admin') {
    return <div className="p-8 text-[color:var(--text-soft)]">需要管理员权限</div>;
  }

  const createInvite = async () => {
    const res = await api.createInvitation({ code: code || undefined, max_uses: 5 });
    setCode('');
    await load();
    alert(`邀请码：${res.code}`);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[color:var(--text)]">管理后台</h1>
        <Button variant="ghost" onClick={load} disabled={loading}><RefreshCw size={16} /> 刷新</Button>
      </div>
      <Card className="p-4 space-y-3">
        <h2 className="font-medium">创建邀请码</h2>
        <div className="flex gap-2">
          <Input placeholder="自定义码（可选）" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button onClick={createInvite}><UserPlus size={16} /> 生成</Button>
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="font-medium mb-3">用户 ({users.length})</h2>
        <ul className="space-y-2 text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex justify-between border-b border-[color:var(--line)] pb-2">
              <span>{u.username}</span>
              <span className="text-[color:var(--text-soft)]">{u.role} · {u.status}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-4">
        <h2 className="font-medium mb-3">邀请码</h2>
        <ul className="space-y-2 text-sm">
          {invites.map((inv) => (
            <li key={inv.code} className="flex justify-between">
              <code>{inv.code}</code>
              <span>{inv.used_count}/{inv.max_uses}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
