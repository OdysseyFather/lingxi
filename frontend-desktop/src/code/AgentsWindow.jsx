import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Crown, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle,
  Circle, Clock, Wrench, GitBranch, Eye, BarChart3, MessageSquare, Cpu,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { ThemedProgressBar, StatusBadge, GlassCard } from './themed-containers';

const SPRING = { type: 'spring', damping: 25, stiffness: 300 };

export function AgentsWindow() {
  const subAgents = useStore((s) => s.subAgents);
  const agentState = useStore((s) => s.codingAgentState);
  const isStreaming = useStore((s) => s.codingIsStreaming);
  const codingTasks = useStore((s) => s.codingTasks);
  const [collapsed, setCollapsed] = useState(false);

  const hasContent = subAgents.length > 0 || isStreaming;
  if (!hasContent) return null;

  const workingCount = subAgents.filter(a => a.status === 'working').length;
  const doneCount = subAgents.filter(a => a.status === 'done').length;
  const errorCount = subAgents.filter(a => a.status === 'error').length;
  const agentTree = useMemo(() => buildAgentTree(subAgents), [subAgents]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="my-2"
    >
      <GlassCard glow={workingCount > 0} className="overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--accent-soft)]/30 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
            <GitBranch size={14} className="text-[var(--accent)]" />
          </div>
          <span className="text-[14px] font-bold text-[var(--text)]">Agent Tree</span>
          {subAgents.length > 0 && (
            <span className="text-[11px] text-[var(--text-faint)] font-mono">
              {subAgents.length} agent{subAgents.length > 1 ? 's' : ''}
            </span>
          )}
          <div className="flex items-center gap-3 ml-auto">
            {workingCount > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 text-[11px] text-[var(--accent)] font-medium"
              >
                <Loader2 size={11} className="animate-spin" /> {workingCount} active
              </motion.span>
            )}
            {doneCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
                <CheckCircle2 size={11} /> {doneCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
                <AlertCircle size={11} /> {errorCount}
              </span>
            )}
            {collapsed
              ? <ChevronDown size={14} className="text-[var(--text-faint)]" />
              : <ChevronUp size={14} className="text-[var(--text-faint)]" />
            }
          </div>
        </button>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="border-t border-[var(--coding-border)]/50"
            >
              {/* Main Agent */}
              <MainAgentCard agentState={agentState} isStreaming={isStreaming} tasks={codingTasks} />

              {/* Sub-agents with tree lines */}
              <div className="relative">
                {agentTree.map((agent, i) => (
                  <SubAgentCard key={agent.id || i} agent={agent} depth={0} isLast={i === agentTree.length - 1} />
                ))}
              </div>

              {/* Footer summary */}
              {subAgents.length > 0 && (
                <div className="px-5 py-2.5 bg-[var(--coding-surface)]/50 border-t border-[var(--coding-border)]/30 flex items-center gap-4 text-[11px] text-[var(--text-faint)]">
                  <BarChart3 size={11} />
                  <span className="font-medium">{doneCount}/{subAgents.length} completed</span>
                  {workingCount > 0 && <span>· {workingCount} in progress</span>}
                  {/* Mini timeline */}
                  <div className="flex-1 flex items-center gap-px justify-end">
                    {subAgents.map((a, i) => (
                      <motion.div
                        key={a.id || i}
                        initial={{ width: 0 }}
                        animate={{ width: 12 }}
                        className={cn(
                          'h-2 rounded-[2px] transition-colors duration-300',
                          a.status === 'done' ? 'bg-emerald-400' :
                          a.status === 'working' ? 'bg-[var(--accent)] animate-pulse' :
                          a.status === 'error' ? 'bg-red-400' : 'bg-[var(--coding-border)]'
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

function buildAgentTree(agents) {
  const map = new Map();
  const roots = [];
  for (const a of agents) {
    map.set(a.id, { ...a, children: [] });
  }
  for (const a of agents) {
    const node = map.get(a.id);
    if (a.parent_id && map.has(a.parent_id)) {
      map.get(a.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function MainAgentCard({ agentState, isStreaming, tasks }) {
  const completed = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;

  return (
    <div className="px-5 py-3.5 bg-[var(--coding-surface)]/50 border-b border-[var(--coding-border)]/30">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)]/70 flex items-center justify-center text-white shadow-sm">
            <Crown size={15} />
          </div>
          {isStreaming && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--accent)] animate-pulse border-2 border-[var(--coding-surface)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-[var(--text)]">Main Agent</div>
          <div className="text-[11px] text-[var(--text-faint)]">
            {total > 0 ? `${completed}/${total} tasks` : 'Orchestrating'}
          </div>
        </div>
        <AgentStatusPill status={isStreaming ? agentState : 'IDLE'} />
      </div>
      {total > 0 && (
        <ThemedProgressBar progress={total > 0 ? (completed / total) * 100 : 0} className="mt-2.5" />
      )}
    </div>
  );
}

function SubAgentCard({ agent, depth, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = agent.children && agent.children.length > 0;
  const hasOutput = Boolean(agent.output);

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.05 }}
        className="relative"
      >
        {/* Tree connector line */}
        <div
          className="absolute top-0 bottom-0 border-l border-dashed border-[var(--coding-border)]/60"
          style={{ left: 20 + depth * 24 }}
        />
        {!isLast && (
          <div
            className="absolute top-[22px] w-3 border-t border-dashed border-[var(--coding-border)]/60"
            style={{ left: 20 + depth * 24 }}
          />
        )}

        <button
          onClick={() => setExpanded(v => !v)}
          className={cn(
            'w-full flex items-center gap-3 text-left transition-colors px-5 py-2.5',
            'hover:bg-[var(--accent-soft)]/20',
            agent.status === 'working' && 'bg-[var(--accent-soft)]/10'
          )}
          style={{ paddingLeft: 32 + depth * 24 }}
        >
          {/* Agent avatar */}
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300',
            agent.status === 'working' ? 'bg-[var(--accent)]/10 text-[var(--accent)]' :
            agent.status === 'done' ? 'bg-emerald-500/10 text-emerald-500' :
            agent.status === 'error' ? 'bg-red-500/10 text-red-400' :
            'bg-[var(--coding-surface)] text-[var(--text-faint)]'
          )}>
            <Bot size={13} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[var(--text)] truncate">
              {agent.description || `Sub-agent ${agent.id}`}
            </div>
            {agent.tools && agent.tools.length > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <Wrench size={9} className="text-[var(--text-faint)]" />
                <span className="text-[10px] text-[var(--text-faint)] truncate">{agent.tools.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Status */}
          <AgentStatusPill status={agent.status} />

          {(hasOutput || hasChildren) && (
            <span className="text-[var(--text-faint)]">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          )}
        </button>

        {/* Expanded output */}
        <AnimatePresence>
          {expanded && hasOutput && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
              style={{ paddingLeft: 52 + depth * 24 }}
            >
              <div className="pr-5 pb-3">
                <div className="bg-[var(--coding-surface)] rounded-lg p-3 text-[11px] text-[var(--text-soft)] font-mono leading-relaxed max-h-40 overflow-auto scrollable border border-[var(--coding-border)]/50">
                  {agent.output}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed output preview */}
        {!expanded && agent.status === 'done' && hasOutput && (
          <div
            className="flex items-center gap-1.5 text-[11px] text-emerald-600/80 pb-2"
            style={{ paddingLeft: 52 + depth * 24 }}
          >
            <MessageSquare size={9} />
            <span className="truncate max-w-[280px]">{agent.output.slice(0, 80)}</span>
          </div>
        )}
      </motion.div>

      {/* Recursive children */}
      {hasChildren && expanded && (
        agent.children.map((child, ci) => (
          <SubAgentCard key={child.id || ci} agent={child} depth={depth + 1} isLast={ci === agent.children.length - 1} />
        ))
      )}
    </>
  );
}

function AgentStatusPill({ status }) {
  const configs = {
    working:  { label: 'Working',  color: 'text-[var(--accent)] bg-[var(--accent)]/10', spin: true },
    THINKING: { label: 'Thinking', color: 'text-[var(--accent)] bg-[var(--accent)]/10', spin: true },
    CHECKING: { label: 'Reading',  color: 'text-blue-500 bg-blue-500/10', icon: Eye },
    EXECUTING:{ label: 'Running',  color: 'text-amber-500 bg-amber-500/10', icon: Cpu },
    WAITING_FOR_USER: { label: 'Waiting', color: 'text-yellow-600 bg-yellow-500/10', icon: Clock },
    WAITING_FOR_BATCH_ANSWER: { label: 'Awaiting', color: 'text-yellow-600 bg-yellow-500/10', icon: Clock },
    done:     { label: 'Done',     color: 'text-emerald-500 bg-emerald-500/10', icon: CheckCircle2 },
    error:    { label: 'Error',    color: 'text-red-400 bg-red-400/10', icon: AlertCircle },
    IDLE:     { label: 'Idle',     color: 'text-[var(--text-faint)] bg-[var(--coding-border)]/30', icon: Circle },
  };
  const config = configs[status] || configs.IDLE;
  const Icon = config.icon || Loader2;

  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
        config.color
      )}
    >
      <Icon size={10} className={config.spin ? 'animate-spin' : ''} />
      {config.label}
    </motion.span>
  );
}
