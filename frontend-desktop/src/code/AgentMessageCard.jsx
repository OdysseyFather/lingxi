import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import {
  Brain, ChevronDown, ChevronRight, Copy, Check,
  RotateCcw, GitCommitHorizontal, FileText, Wrench, MessageSquare,
  Eye, Zap, Clock,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { api } from '../api/client';
import { parseAssistantContent } from '../chat/blockUtils';
import { CodingToolCard } from './CodingToolCard';
import { AskQuestionBlock } from './AskQuestionBlock';
import { PermissionBlock } from './PermissionBlock';
import { GlassCard } from './themed-containers';

const HIDDEN_TOOLS = ['TodoWrite', 'TodoRead', 'todo_write', 'todo_read', 'TaskCreate', 'TaskUpdate', 'task_create', 'task_update'];

export function AgentMessageCard({ msg, checkpoints }) {
  const blocks = useMemo(() => parseAssistantContent(msg.content), [msg.content]);
  const sendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);
  const activeSessionId = useStore((s) => s.activeSessionId);

  const [hover, setHover] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);

  const checkpoint = checkpoints?.find(cp => cp.message_id === msg.id);

  const thinkingBlocks = blocks.filter(b => b.type === 'thinking' && b.text);
  const toolBlocks = blocks.filter(b => b.type === 'tool' && !HIDDEN_TOOLS.includes(b.name));
  const textBlocks = blocks.filter(b => b.type === 'text' && b.text);
  const interactiveBlocks = blocks.filter(b => b.type === 'ask_question' || b.type === 'permission');

  const fileChanges = toolBlocks.filter(b =>
    ['Edit', 'Write', 'StrReplace', 'MultiEdit'].includes(b.name)
  );

  const plainText = useMemo(() =>
    textBlocks.map(b => b.text).join('\n').trim(),
    [textBlocks]
  );

  const handleCopy = useCallback(() => {
    if (plainText) {
      navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [plainText]);

  const handleRollback = useCallback(async () => {
    if (!checkpoint || !activeSessionId) return;
    try {
      await api.rollbackCheckpoint(checkpoint.id);
      const remaining = await api.listMessages(activeSessionId);
      useStore.setState({
        codingMessages: remaining || [],
        codingLiveBlocks: [],
        codingTasks: checkpoint.todo_snapshot ? JSON.parse(checkpoint.todo_snapshot) : [],
        liveDiffs: [],
        codingIsStreaming: false,
        codingAgentState: 'IDLE',
      });
      useStore.getState().pushNotification({ title: '回滚成功', body: `已恢复到 ${new Date(checkpoint.created_at).toLocaleTimeString()} 的状态` });
    } catch (e) {
      useStore.getState().pushNotification({ title: '回滚失败', body: e.message });
    }
    setRollbackOpen(false);
  }, [checkpoint, activeSessionId]);

  return (
    <div
      className="mt-4 mb-2 group relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Hover action bar */}
      <AnimatePresence>
        {hover && (
          <motion.div
            className="absolute right-0 -top-3 flex items-center gap-0.5 bg-[var(--coding-surface-raised)]/90 rounded-lg border border-[var(--coding-border)]/50 shadow-md px-1 py-0.5 z-10 backdrop-blur-xl"
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
          >
            {plainText && (
              <button onClick={handleCopy} className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition-all" title="Copy">
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            )}
            {checkpoint && (
              <button
                onClick={() => setRollbackOpen(true)}
                className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-orange-500 hover:bg-orange-50 transition-all"
                title="Rollback to this step"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer 1: Thinking */}
      {thinkingBlocks.length > 0 && (
        <ThinkingLayer blocks={thinkingBlocks} />
      )}

      {/* Layer 2: Tool calls */}
      {toolBlocks.length > 0 && (
        <ToolLayer tools={toolBlocks} />
      )}

      {/* Layer 3: Text reply */}
      {textBlocks.length > 0 && (
        <TextLayer blocks={textBlocks} />
      )}

      {/* Layer 4: Change summary */}
      {fileChanges.length > 0 && (
        <ChangeSummaryLayer changes={fileChanges} />
      )}

      {/* Interactive blocks */}
      {interactiveBlocks.map((block, i) => {
        if (block.type === 'ask_question') {
          return (
            <AskQuestionBlock
              key={`aq-${i}`}
              question={block.question}
              options={block.options}
              allowCustom={block.allowCustom}
              submitted={block.submitted}
              onSubmit={(answer) => sendMessage({ message: answer, workingDir: codingProjectPath || '' })}
            />
          );
        }
        if (block.type === 'permission') {
          return <PermissionBlock key={`pm-${i}`} toolName={block.toolName} input={block.input} resolved={block.resolved || 'allowed'} />;
        }
        return null;
      })}

      {/* Usage */}
      {msg.usage && <UsagePill usage={msg.usage} />}

      {/* Rollback Modal */}
      {rollbackOpen && checkpoint && (
        <RollbackConfirm
          checkpoint={checkpoint}
          onConfirm={handleRollback}
          onCancel={() => setRollbackOpen(false)}
        />
      )}
    </div>
  );
}

function ThinkingLayer({ blocks }) {
  const [expanded, setExpanded] = useState(false);
  const totalText = blocks.map(b => b.text).join('\n');
  const lines = totalText.split('\n').filter(Boolean);
  const preview = lines[0]?.slice(0, 100) + (lines.length > 1 || (lines[0]?.length || 0) > 100 ? '...' : '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 rounded-xl border border-dashed border-[var(--coding-border)]/60 bg-[var(--coding-surface)]/40 overflow-hidden backdrop-blur-sm"
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 text-[12px] py-2.5 px-3.5 hover:bg-[var(--accent-soft)]/30 transition-colors"
      >
        <div className="w-5 h-5 rounded-md bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
          <Brain size={11} className="text-[var(--accent)]" />
        </div>
        <span className="font-semibold text-[var(--text-soft)]">Thinking</span>
        <span className="text-[10px] text-[var(--text-faint)] font-mono">{lines.length} steps</span>
        <div className="flex-1" />
        {expanded ? <ChevronDown size={12} className="text-[var(--text-faint)]" /> : <ChevronRight size={12} className="text-[var(--text-faint)]" />}
      </button>

      {!expanded && preview && (
        <div className="px-3.5 pb-2.5 -mt-0.5">
          <p className="text-[11px] text-[var(--text-faint)] italic truncate pl-7">{preview}</p>
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mx-3.5 mb-3 p-3 rounded-lg bg-[var(--coding-surface-raised)]/50 border border-[var(--coding-border)]/30 text-[12px] text-[var(--text-soft)] leading-[1.7] whitespace-pre-wrap max-h-72 overflow-y-auto scrollable font-mono">
              {totalText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ToolLayer({ tools }) {
  const [expanded, setExpanded] = useState(true);

  // Aggregate consecutive same-type tools
  const aggregated = useMemo(() => {
    const groups = [];
    let currentGroup = null;

    for (const tool of tools) {
      if (currentGroup && currentGroup.name === tool.name && currentGroup.tools.length < 8) {
        currentGroup.tools.push(tool);
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { name: tool.name, tools: [tool] };
      }
    }
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [tools]);

  const totalMs = tools.reduce((sum, t) => sum + (t.ms || 0), 0);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-[12px] text-[var(--text-faint)] hover:text-[var(--text-soft)] transition-colors py-1 px-2 rounded-lg hover:bg-[var(--accent-soft)]/30"
      >
        <Zap size={12} className="text-[var(--accent)]" />
        <span className="font-semibold">Tools</span>
        <span className="text-[10px] bg-[var(--accent-soft)] text-[var(--accent)] px-1.5 py-0.5 rounded-full font-semibold">{tools.length}</span>
        {totalMs > 0 && (
          <span className="text-[10px] text-[var(--text-faint)] flex items-center gap-0.5 font-mono">
            <Clock size={8} />
            {totalMs > 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`}
          </span>
        )}
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-1 mt-1 space-y-0.5">
              {aggregated.map((group, gi) => {
                if (group.tools.length === 1) {
                  return <CodingToolCard key={gi} block={group.tools[0]} defaultExpanded={tools.length <= 3} />;
                }
                return <AggregatedToolGroup key={gi} group={group} />;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AggregatedToolGroup({ group }) {
  const [open, setOpen] = useState(false);
  const totalMs = group.tools.reduce((sum, t) => sum + (t.ms || 0), 0);

  return (
    <div className="rounded-xl border border-[var(--coding-border)]/40 bg-[var(--coding-surface)]/50 overflow-hidden my-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-[var(--accent-soft)]/20 transition-colors"
      >
        {open ? <ChevronDown size={11} className="text-[var(--text-faint)]" /> : <ChevronRight size={11} className="text-[var(--text-faint)]" />}
        <span className="font-mono font-semibold text-[var(--accent)]">{group.name}</span>
        <span className="text-[var(--text-faint)]">×{group.tools.length}</span>
        <span className="flex-1" />
        {totalMs > 0 && (
          <span className="text-[10px] text-[var(--text-faint)] font-mono">
            {totalMs > 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-[var(--coding-border)]/30"
          >
            <div className="p-1">
              {group.tools.map((tool, i) => (
                <CodingToolCard key={i} block={tool} defaultExpanded={false} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TextLayer({ blocks }) {
  return (
    <div className="mb-2">
      {blocks.map((block, i) => (
        <TextBlock key={i} text={block.text} />
      ))}
    </div>
  );
}

function ChangeSummaryLayer({ changes }) {
  const [expanded, setExpanded] = useState(true);
  const setCodingActiveDiff = useStore((s) => s.setCodingActiveDiff);
  const codingProjectPath = useStore((s) => s.codingProjectPath);

  const filePaths = [...new Set(changes.map(c => {
    if (c.input?.path) return c.input.path;
    if (c.input?.file_path) return c.input.file_path;
    if (typeof c.input === 'string') return c.input;
    return '未知文件';
  }).filter(Boolean))];

  if (filePaths.length === 0) return null;

  const handleViewDiff = async (fp) => {
    try {
      const res = await api.getCodingDiff(codingProjectPath, fp);
      setCodingActiveDiff({ filePath: fp, diffText: res.diff || '' });
    } catch {
      setCodingActiveDiff({ filePath: fp, diffText: '// Failed to load diff' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2 mt-2 rounded-xl border border-[var(--coding-border)]/40 bg-[var(--coding-surface)]/40 overflow-hidden backdrop-blur-sm"
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 text-[12px] text-[var(--text-soft)] py-2 px-3.5 hover:bg-[var(--accent-soft)]/30 transition-colors"
      >
        <GitCommitHorizontal size={13} className="text-[var(--accent)]" />
        <span className="font-semibold">Changes</span>
        <span className="text-[10px] bg-[var(--accent-soft)] text-[var(--accent)] px-1.5 py-0.5 rounded-full font-semibold">{filePaths.length} file{filePaths.length > 1 ? 's' : ''}</span>
        <div className="flex-1" />
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-2.5 space-y-0.5">
              {filePaths.map((fp, i) => {
                const shortName = fp.split('/').pop();
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-2 text-[11px] py-1.5 px-2.5 rounded-lg hover:bg-[var(--accent-soft)]/40 transition-colors group"
                  >
                    <FileText size={11} className="text-[var(--accent)] shrink-0" />
                    <span className="text-[var(--text-soft)] truncate font-medium" title={fp}>{shortName}</span>
                    <span className="text-[var(--text-faint)] truncate text-[10px] hidden sm:block flex-1 font-mono">{fp}</span>
                    <button
                      onClick={() => handleViewDiff(fp)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-[var(--accent)] hover:text-[var(--text)] font-semibold px-2 py-0.5 rounded-md border border-[var(--coding-border)]/60 bg-[var(--coding-surface-raised)]/80 hover:bg-[var(--accent-soft)] transition-all shrink-0"
                    >
                      View Diff
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const TASK_PLAN_RE = /\{[^{}]*"type"\s*:\s*"task_plan"[^{}]*"tasks"\s*:\s*\[[\s\S]*?\]\s*\}/g;

function TextBlock({ text }) {
  const cleaned = text ? text.replace(TASK_PLAN_RE, '').trim() : text;
  if (!cleaned) return null;
  return (
    <div className="coding-markdown text-[13px] leading-relaxed text-[var(--text)] px-1">
      <CodingMarkdown text={cleaned} />
    </div>
  );
}

function UsagePill({ usage }) {
  if (!usage) return null;
  let data = usage;
  if (typeof usage === 'string') {
    try { data = JSON.parse(usage); } catch { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  const tokens = (data.input_tokens || 0) + (data.output_tokens || 0);
  if (!tokens) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--text-faint)] px-1">
      <span className="font-mono">{tokens.toLocaleString()} tokens</span>
      {data.cost != null && <span>~¥{data.cost.toFixed(4)}</span>}
    </div>
  );
}

function RollbackConfirm({ checkpoint, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="relative w-[380px] rounded-2xl bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <RotateCcw size={18} className="text-orange-500" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-[var(--text)]">Confirm Rollback</h3>
            <p className="text-[11px] text-[var(--text-faint)]">
              Restore to {new Date(checkpoint.created_at).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <p className="text-[12px] text-[var(--text-soft)] mb-4 leading-relaxed">
          This will undo all code changes after this step. This action cannot be reversed.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] rounded-lg border border-[var(--coding-border)] text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-[12px] rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-all font-semibold shadow-sm"
          >
            Confirm Rollback
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CodingMarkdown({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          if (!inline && match) {
            return <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />;
          }
          return (
            <code className="px-1 py-0.5 rounded-md bg-[var(--coding-surface-raised)] text-[var(--accent)] text-[12px] font-mono" {...props}>
              {children}
            </code>
          );
        },
        p({ children }) { return <p className="mb-2 last:mb-0 text-[var(--text)]">{children}</p>; },
        ul({ children }) { return <ul className="list-disc list-inside mb-2 space-y-0.5 text-[var(--text)]">{children}</ul>; },
        ol({ children }) { return <ol className="list-decimal list-inside mb-2 space-y-0.5 text-[var(--text)]">{children}</ol>; },
        h1({ children }) { return <h1 className="text-[16px] font-bold mb-2 mt-3 text-[var(--text)]">{children}</h1>; },
        h2({ children }) { return <h2 className="text-[15px] font-bold mb-1.5 mt-2.5 text-[var(--text)]">{children}</h2>; },
        h3({ children }) { return <h3 className="text-[14px] font-semibold mb-1 mt-2 text-[var(--text)]">{children}</h3>; },
        blockquote({ children }) { return <blockquote className="border-l-2 border-[var(--accent)]/40 pl-3 my-2 text-[var(--text-soft)] italic">{children}</blockquote>; },
        table({ children }) { return <div className="overflow-x-auto my-2"><table className="text-[12px] border-collapse w-full">{children}</table></div>; },
        th({ children }) { return <th className="border border-[var(--coding-border)]/60 px-2 py-1 bg-[var(--accent-soft)]/30 font-medium text-left text-[var(--text)]">{children}</th>; },
        td({ children }) { return <td className="border border-[var(--coding-border)]/60 px-2 py-1 text-[var(--text)]">{children}</td>; },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isFilePath = language && (language.includes('/') || language.includes('.'));
  const displayLang = isFilePath ? language.split('/').pop().split('.').pop() : language;

  return (
    <div className="relative my-2.5 rounded-xl overflow-hidden border border-[var(--coding-border)]/50 bg-[#fafaf8] shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[var(--coding-surface-raised)] to-[var(--coding-surface)] border-b border-[var(--coding-border)]/50">
        <span className="text-[10px] text-[var(--text-faint)] font-mono uppercase">{displayLang}</span>
        <span className="text-[10px] text-[var(--text-faint)]">{code.split('\n').length} lines</span>
        <div className="flex-1" />
        <button onClick={handleCopy} className="text-[var(--text-faint)] hover:text-[var(--text-soft)] transition-all p-1 rounded-md hover:bg-[var(--accent-soft)]">
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
      </div>
      <Highlight theme={themes.github} code={code} language={displayLang || 'text'}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre className="overflow-x-auto px-0 py-2 text-[12px] leading-[1.65] font-mono" style={{ ...style, background: 'transparent' }}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="flex hover:bg-[var(--accent-soft)]/30 transition-colors">
                <span className="inline-block w-10 text-right pr-3 text-[var(--text-faint)] select-none text-[10px] leading-[1.65] shrink-0 border-r border-[var(--coding-border)]/30">{i + 1}</span>
                <span className="pl-3">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
