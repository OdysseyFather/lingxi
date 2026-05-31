import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Crown, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle,
  Circle, Clock, Wrench, GitBranch, Eye, BarChart3, MessageSquare,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { ThemedProgressBar } from './themed-containers';

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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="my-4 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface-raised)] overflow-hidden"
    >
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--accent-soft)] transition"
      >
        <GitBranch size={15} className="text-[var(--accent)]" />
        <span className="text-[14px] font-bold text-[var(--text)]">Agents</span>
        {subAgents.length > 0 && (
          <span className="text-[12px] text-[var(--text-faint)]">
            {subAgents.length} agent{subAgents.length > 1 ? 's' : ''}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {workingCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[var(--accent)]">
              <Loader2 size={11} className="animate-spin" /> {workingCount}
            </span>
          )}
          {doneCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-green-500">
              <CheckCircle2 size={11} /> {doneCount}
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-red-400">
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
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-[var(--coding-border)]"
          >
            <MainAgentCard agentState={agentState} isStreaming={isStreaming} tasks={codingTasks} />

            {agentTree.map((agent, i) => (
              <SubAgentCard key={agent.id || i} agent={agent} depth={0} />
            ))}

            {subAgents.length > 0 && (
              <div className="px-5 py-2 bg-[var(--coding-surface)] border-t border-[var(--coding-border)] flex items-center gap-4 text-[11px] text-[var(--text-faint)]">
                <BarChart3 size={11} />
                <span>{doneCount}/{subAgents.length} completed</span>
                {workingCount > 0 && <span>· {workingCount} in progress</span>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
    <div className="px-5 py-3 bg-[var(--coding-surface)] border-b border-[var(--coding-border)]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white shadow-sm">
          <Crown size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-[var(--text)]">Main Agent</div>
          <div className="text-[11px] text-[var(--text-faint)]">
            {total > 0 ? `${completed}/${total} tasks completed` : 'Orchestrating tasks'}
          </div>
        </div>
        <AgentStatusBadge status={isStreaming ? agentState : 'IDLE'} />
      </div>
      {total > 0 && (
        <ThemedProgressBar progress={total > 0 ? (completed / total) * 100 : 0} className="mt-2" />
      )}
    </div>
  );
}

function SubAgentCard({ agent, depth }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = agent.children && agent.children.length > 0;

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.05 }}
        className="border-b border-[var(--coding-border)] last:border-0"
        style={{ marginLeft: depth * 24 }}
      >
        {/* Connector line for nested agents */}
        {depth > 0 && (
          <div className="absolute left-0 top-0 bottom-0 w-px bg-[var(--coding-border)]" style={{ marginLeft: depth * 24 - 12 }} />
        )}

        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-[var(--accent-soft)] transition"
        >
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            agent.status === 'working' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' :
            agent.status === 'done' ? 'bg-green-500/10 text-green-500' :
            agent.status === 'error' ? 'bg-red-500/10 text-red-400' :
            'bg-[var(--coding-surface)] text-[var(--text-faint)]'
          )}>
            <Bot size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[var(--text)] truncate">
              {agent.description || `Sub-agent ${agent.id}`}
            </div>
            {agent.tools && agent.tools.length > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <Wrench size={10} className="text-[var(--text-faint)]" />
                <span className="text-[11px] text-[var(--text-faint)]">{agent.tools.join(', ')}</span>
              </div>
            )}
          </div>
          <AgentStatusBadge status={agent.status} />
          {(agent.output || hasChildren) && (
            expanded
              ? <ChevronUp size={12} className="text-[var(--text-faint)]" />
              : <ChevronDown size={12} className="text-[var(--text-faint)]" />
          )}
        </button>

        {expanded && agent.output && (
          <div className="px-5 pb-3">
            <div className="bg-[var(--coding-surface)] rounded-lg p-3 text-[12px] text-[var(--text-soft)] font-mono leading-relaxed max-h-40 overflow-auto border border-[var(--coding-border)]">
              {agent.output}
            </div>
          </div>
        )}

        {/* Completion notification inline */}
        {agent.status === 'done' && agent.output && !expanded && (
          <div className="px-5 pb-2">
            <div className="flex items-center gap-1.5 text-[11px] text-green-600">
              <MessageSquare size={10} />
              <span className="truncate max-w-[300px]">{agent.output.slice(0, 80)}</span>
            </div>
          </div>
        )}
      </motion.div>

      {/* Nested children */}
      {hasChildren && expanded && (
        agent.children.map((child, ci) => (
          <SubAgentCard key={child.id || ci} agent={child} depth={depth + 1} />
        ))
      )}
    </>
  );
}

function AgentStatusBadge({ status }) {
  const configs = {
    working: { icon: Loader2, label: 'Working', className: 'text-[var(--accent)]', spin: true },
    THINKING: { icon: Loader2, label: 'Thinking', className: 'text-[var(--accent)]', spin: true },
    CHECKING: { icon: Eye, label: 'Reading', className: 'text-blue-500', spin: false },
    EXECUTING: { icon: Wrench, label: 'Executing', className: 'text-orange-500', spin: false },
    WAITING_FOR_USER: { icon: Clock, label: 'Waiting', className: 'text-yellow-600', spin: false },
    WAITING_FOR_BATCH_ANSWER: { icon: Clock, label: 'Awaiting answers', className: 'text-yellow-600', spin: false },
    done: { icon: CheckCircle2, label: 'Done', className: 'text-green-500', spin: false },
    error: { icon: AlertCircle, label: 'Error', className: 'text-red-400', spin: false },
    IDLE: { icon: Circle, label: 'Idle', className: 'text-[var(--text-faint)]', spin: false },
  };
  const config = configs[status] || configs.IDLE;
  const Icon = config.icon;

  return (
    <span className={cn('flex items-center gap-1 text-[11px] font-medium shrink-0', config.className)}>
      <Icon size={12} className={config.spin ? 'animate-spin' : ''} />
      {config.label}
    </span>
  );
}
