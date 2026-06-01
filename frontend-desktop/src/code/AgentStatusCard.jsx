import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Zap, Bot, Activity } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';

export function AgentStatusCard() {
  const [expanded, setExpanded] = useState(false);
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const profiles = useStore((s) => s.profiles);
  const activeProfile = useStore((s) => s.activeProfile);
  const codingAgentState = useStore((s) => s.codingAgentState);
  const codingMessages = useStore((s) => s.codingMessages);

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === activeAgentId),
    [agents, activeAgentId]
  );
  const currentProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfile),
    [profiles, activeProfile]
  );

  const isWorking = codingAgentState !== 'IDLE' && codingAgentState !== 'WAITING_FOR_USER' && codingAgentState !== 'WAITING_FOR_BATCH_ANSWER';

  const sessionTokens = useMemo(() => {
    let input = 0, output = 0;
    codingMessages?.forEach(m => {
      if (m.usage) {
        input += m.usage.input_tokens || 0;
        output += m.usage.output_tokens || 0;
      }
    });
    return { input, output, total: input + output };
  }, [codingMessages]);

  const tokenPercent = Math.min((sessionTokens.total / 200000) * 100, 100);

  return (
    <div className="border-b border-[var(--coding-border,#e8e0d8)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-3 hover:bg-[var(--accent-soft,#f5f0eb)] transition-colors"
      >
        <div className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all',
          isWorking ? 'bg-blue-100 ring-2 ring-blue-200 ring-offset-1' : 'bg-[var(--accent-soft,#f5f0eb)]'
        )}>
          {currentAgent?.avatar ? (
            <img src={currentAgent.avatar} alt="" className="w-8 h-8 rounded-xl object-cover" />
          ) : (
            <Bot size={16} className={isWorking ? 'text-blue-600' : 'text-[var(--accent,#c4a882)]'} />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[13px] font-medium text-[var(--text,#1a1a1a)] truncate">
            {currentAgent?.name || '默认助手'}
          </div>
          <div className="text-[10px] text-[var(--text-faint,#999)] truncate">
            {isWorking ? (
              <span className="text-blue-500 flex items-center gap-1">
                <Activity size={9} className="animate-pulse" />
                工作中...
              </span>
            ) : (
              currentProfile?.model || '就绪'
            )}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-[var(--text-faint)]" /> : <ChevronDown size={14} className="text-[var(--text-faint)]" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Token 消耗进度 */}
          {sessionTokens.total > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-faint)]">Token 消耗</span>
                <span className="font-mono text-[var(--text-soft)]">{(sessionTokens.total / 1000).toFixed(1)}k</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-300 to-orange-400 rounded-full transition-all duration-500"
                  style={{ width: `${tokenPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] text-[var(--text-faint)]">
                <span>输入 {(sessionTokens.input / 1000).toFixed(1)}k</span>
                <span>输出 {(sessionTokens.output / 1000).toFixed(1)}k</span>
              </div>
            </div>
          )}

          {/* 接入点信息 */}
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft,#666)]">
            <Zap size={12} className="text-amber-500" />
            <span className="truncate">{currentProfile?.name || '未配置接入点'}</span>
          </div>

          {/* 切换智能体 */}
          {agents.length > 1 && (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {agents.filter(a => a.id !== activeAgentId).slice(0, 5).map(a => (
                <button
                  key={a.id}
                  onClick={() => setActiveAgent(a.id)}
                  className="w-full text-left text-[12px] px-2.5 py-1.5 rounded-lg hover:bg-[var(--accent-soft,#f5f0eb)] text-[var(--text-soft,#666)] truncate transition-colors flex items-center gap-2"
                >
                  <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                    <Bot size={10} className="text-gray-400" />
                  </div>
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
