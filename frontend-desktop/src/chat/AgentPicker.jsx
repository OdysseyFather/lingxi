import { Lock } from 'lucide-react';
import { useStore } from '../state/useStore';

// 会话级智能体显示（只读）
// 设计：会话创建时绑定一个智能体，全程不允许更改。
// 如需切换智能体，请到左侧栏切换并新建对话。
export function AgentBadge() {
  const agents = useStore((s) => s.agents);
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);

  const session = sessions.find((s) => s.id === activeSessionId);
  if (!session) return null;
  const agentId = session.agent_id || 0;
  const agent = agents.find((a) => a.id === agentId)
    || agents.find((a) => a.builtin)
    || agents[0];
  if (!agent) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[color:var(--bg-elev)] border border-[color:var(--line)] text-sm select-none">
      <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-[color:var(--accent-soft)] to-transparent text-[color:var(--accent)] flex items-center justify-center text-sm">
        {agent.avatar || '✦'}
      </span>
      <span className="font-medium">{agent.name}</span>
      <Lock size={11} className="text-[color:var(--text-faint)]" />
      <span className="text-[11px] text-[color:var(--text-faint)]">本会话锁定</span>
    </div>
  );
}

// 兼容旧引用
export const AgentPicker = AgentBadge;

