import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Loader2, FolderOpen, ChevronDown, ChevronRight,
  Copy, Check, CheckCircle2, Clock, Zap, Pencil, RotateCcw, X,
  History, Sparkles,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { api } from '../api/client';
import { parseAssistantContent } from '../chat/blockUtils';
import { CodingComposer } from './CodingComposer';
import { CodingToolCard } from './CodingToolCard';
import { SessionHeader } from './SessionHeader';
import { AskQuestionBlock } from './AskQuestionBlock';
import { PermissionBlock } from './PermissionBlock';
import { AskQuestionWizard } from './AskQuestionWizard';
import { AgentsWindow } from './AgentsWindow';
import { AgentMessageCard } from './AgentMessageCard';
import { StickyTaskBar } from './TaskTodoList';
import { ThemedBox, ThemedButton, SkeletonLoader } from './themed-containers';

export function CodingChatView({ projectPath, onChangeProject }) {
  const messages = useStore((s) => s.codingMessages);
  const liveBlocks = useStore((s) => s.codingLiveBlocks);
  const isStreaming = useStore((s) => s.codingIsStreaming);
  const agentState = useStore((s) => s.codingAgentState);
  const codingSendMessage = useStore((s) => s.codingSendMessage);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const codingTasks = useStore((s) => s.codingTasks);
  const pendingQuestions = useStore((s) => s.codingPendingQuestions);
  const questionsSubmitted = useStore((s) => s.codingQuestionsSubmitted);
  const subAgents = useStore((s) => s.subAgents);
  const loadCodingMessages = useStore((s) => s.loadCodingMessages);
  const checkpoints = useStore((s) => s.codingCheckpoints) || [];

  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const composerRef = useRef(null);

  useEffect(() => {
    if (activeSessionId) {
      loadCodingMessages(activeSessionId);
    }
  }, [activeSessionId, loadCodingMessages]);

  useEffect(() => {
    if (stickToBottom && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, liveBlocks, stickToBottom, pendingQuestions]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setStickToBottom(atBottom);
  }, []);

  const codingThinkingEnabled = useStore((s) => s.codingThinkingEnabled);

  const handleSend = useCallback((text, attachedFiles, images) => {
    let msg = text;
    if (attachedFiles?.length > 0) {
      const refs = attachedFiles.map(f => {
        if (f.isDir) return `[目录: ${f.path}]`;
        return `@${f.path}`;
      }).join(' ');
      msg = `${refs}\n\n${text}`;
    }
    const imgs = images?.map(({ mediaType, data }) => ({ mediaType, data })) || [];
    const files = attachedFiles?.filter(f => f.content).map(f => ({ name: f.name, ext: f.ext, content: f.content })) || [];
    codingSendMessage({ message: msg, workingDir: projectPath || '', images: imgs, files, thinking: codingThinkingEnabled });
  }, [codingSendMessage, projectPath, codingThinkingEnabled]);

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <WelcomeScreen projectPath={projectPath} onChangeProject={onChangeProject} />
        <CodingComposer ref={composerRef} onSend={handleSend} disabled={false} projectPath={projectPath} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <AnimatePresence>
        {codingTasks.length > 0 && (
          <StickyTaskBar tasks={codingTasks} />
        )}
      </AnimatePresence>

      {/* Agent Tree: fixed above chat scroll area */}
      <AnimatePresence>
        {subAgents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 border-b border-[var(--coding-border)]/50 bg-[var(--coding-surface)]/95 backdrop-blur-md max-w-4xl mx-auto w-full px-3 sm:px-6"
          >
            <AgentsWindow />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollable"
      >
        <div className="max-w-4xl mx-auto px-3 sm:px-6 pb-6">
          <SessionHeader projectPath={projectPath} />

          {messages.length === 0 && !isStreaming && (
            <WelcomeScreen projectPath={projectPath} onChangeProject={onChangeProject} />
          )}

          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <MessageBlock key={msg.id} msg={msg} checkpoints={checkpoints} />
            ))}
          </AnimatePresence>

          {/* Live streaming blocks */}
          {liveBlocks.length > 0 && (
            <div className="space-y-1 mt-2">
              <AggregatedLiveBlocks blocks={liveBlocks} />
            </div>
          )}

          {isStreaming && agentState === 'THINKING' && liveBlocks.length === 0 && (
            <ThinkingIndicator />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* AskQuestion wizard: non-blocking, above composer */}
      <AnimatePresence>
        {(pendingQuestions.length > 0 || questionsSubmitted) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="shrink-0 border-t border-[var(--coding-border)]/50 bg-[var(--coding-surface)]/95 backdrop-blur-xl"
          >
            <AskQuestionWizard />
          </motion.div>
        )}
      </AnimatePresence>

      <CodingComposer ref={composerRef} onSend={handleSend} disabled={isStreaming} projectPath={projectPath} />
    </div>
  );
}

/**
 * Aggregates consecutive same-type live blocks (e.g. multiple Reads in a row).
 */
function AggregatedLiveBlocks({ blocks }) {
  const groups = useMemo(() => {
    const result = [];
    let currentToolGroup = [];

    for (const block of blocks) {
      if (block.type === 'tool') {
        const HIDDEN_TOOLS = ['TodoWrite', 'TodoRead', 'todo_write', 'todo_read', 'TaskCreate', 'TaskUpdate', 'task_create', 'task_update'];
        if (HIDDEN_TOOLS.includes(block.name)) continue;
        currentToolGroup.push(block);
      } else {
        if (currentToolGroup.length > 0) {
          result.push({ type: 'tool_group', tools: [...currentToolGroup] });
          currentToolGroup = [];
        }
        result.push(block);
      }
    }
    if (currentToolGroup.length > 0) {
      result.push({ type: 'tool_group', tools: currentToolGroup });
    }
    return result;
  }, [blocks]);

  return groups.map((item, i) => {
    if (item.type === 'tool_group') {
      return <ToolGroup key={`tg-${i}`} tools={item.tools} />;
    }
    return <LiveBlock key={`lb-${i}`} block={item} />;
  });
}

/**
 * Aggregated tool group with summary header and collapsible detail.
 */
function ToolGroup({ tools }) {
  const [collapsed, setCollapsed] = useState(false);
  const allDone = tools.every(t => t.done !== false);
  const totalMs = tools.reduce((sum, t) => sum + (t.ms || 0), 0);

  // Aggregate by tool type for summary
  const typeCount = {};
  tools.forEach(t => { typeCount[t.name] = (typeCount[t.name] || 0) + 1; });
  const summary = Object.entries(typeCount).map(([name, count]) =>
    count > 1 ? `${name} ×${count}` : name
  ).join(', ');

  if (tools.length === 1) {
    return <CodingToolCard block={tools[0]} defaultExpanded={false} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-2 rounded-xl border border-[var(--coding-border)]/50 bg-[var(--coding-surface-raised)]/50 backdrop-blur-sm overflow-hidden"
    >
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-[var(--accent-soft)]/20 transition-colors"
      >
        {collapsed ? <ChevronRight size={13} className="text-[var(--text-faint)]" /> : <ChevronDown size={13} className="text-[var(--text-faint)]" />}
        <Zap size={12} className="text-[var(--accent)] shrink-0" />
        <span className="text-[12px] font-medium text-[var(--text-soft)]">{summary}</span>
        <span className="flex-1" />
        {allDone && totalMs > 0 && (
          <span className="text-[10px] text-[var(--text-faint)] flex items-center gap-1 mr-2 font-mono">
            <Clock size={9} />
            {totalMs > 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`}
          </span>
        )}
        {allDone
          ? <CheckCircle2 size={14} className="text-emerald-500" />
          : <Loader2 size={13} className="text-[var(--accent)] animate-spin" />
        }
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-[var(--coding-border)]/30"
          >
            <div className="p-1">
              {tools.map((tool, i) => (
                <CodingToolCard key={i} block={tool} defaultExpanded={tools.length <= 2} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MessageBlock({ msg, checkpoints }) {
  const content = (() => {
    if (msg.role === 'user') return <UserMessage msg={msg} />;
    if (msg.role === 'assistant') return <AgentMessageCard msg={msg} checkpoints={checkpoints} />;
    if (msg.role === 'system') return <SystemMessage msg={msg} />;
    return null;
  })();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {content}
    </motion.div>
  );
}

function SystemMessage({ msg }) {
  return (
    <div className="my-4 flex justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="px-4 py-2 rounded-full bg-[var(--accent-soft)]/60 text-[var(--accent)] text-[11px] font-medium flex items-center gap-2 backdrop-blur-sm border border-[var(--coding-border)]/30"
      >
        <History size={11} />
        {msg.content}
      </motion.div>
    </div>
  );
}

function UserMessage({ msg }) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const sendMessage = useStore((s) => s.codingSendMessage);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const codingProjectPath = useStore((s) => s.codingProjectPath);
  const [copied, setCopied] = useState(false);

  let text = msg.content;
  let fileRefs = [];
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.text) text = parsed.text;
  } catch {}

  const refPattern = /(@\S+|\[目录:\s*\S+\])/g;
  const matches = text.match(refPattern);
  if (matches) {
    fileRefs = matches.map(m => {
      if (m.startsWith('[目录:')) {
        const p = m.replace(/\[目录:\s*/, '').replace(/\]$/, '').trim();
        return { path: p, name: p.split('/').pop(), isDir: true };
      }
      const p = m.slice(1);
      return { path: p, name: p.split('/').pop(), isDir: false };
    });
    text = text.replace(refPattern, '').trim();
  }

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const handleEdit = useCallback(() => {
    setEditText(text);
    setEditing(true);
  }, [text]);

  const handleSaveEdit = useCallback(() => {
    if (editText.trim()) {
      api.updateMessage(msg.id, editText.trim()).then(() => {
        sendMessage({ message: editText.trim() });
      }).catch(() => {
        sendMessage({ message: editText.trim() });
      });
    }
    setEditing(false);
  }, [editText, msg.id, sendMessage]);

  const handleRestore = useCallback(async () => {
    if (!activeSessionId || restoring) return;
    setRestoring(true);
    try {
      await api.restoreSession(activeSessionId, msg.id, codingProjectPath || '', true);
      const remaining = await api.listMessages(activeSessionId);
      useStore.setState({
        codingMessages: remaining || [],
        codingLiveBlocks: [],
        codingTasks: [],
        liveDiffs: [],
        codingIsStreaming: false,
        codingAgentState: 'IDLE',
      });
    } catch (e) {
      console.error('restore failed', e);
    }
    setRestoring(false);
  }, [activeSessionId, msg.id, codingProjectPath, restoring]);

  if (editing) {
    return (
      <div className="mt-6 mb-4 flex justify-end">
        <div className="max-w-[85%] w-full">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl bg-[var(--coding-user-bubble)] border-2 border-[var(--accent)] text-[14px] text-[var(--text)] leading-relaxed outline-none resize-none min-h-[60px]"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <ThemedButton variant="ghost" onClick={() => setEditing(false)}>Cancel</ThemedButton>
            <ThemedButton variant="primary" onClick={handleSaveEdit}>Save & Resend</ThemedButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-6 mb-4 flex justify-end group relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 -top-8 flex items-center gap-0.5 bg-[var(--coding-surface-raised)]/90 rounded-lg border border-[var(--coding-border)]/50 shadow-md px-1 py-0.5 backdrop-blur-xl z-10"
          >
            <button onClick={handleCopy} className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition-all" title="Copy">
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
            <button onClick={handleEdit} className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition-all" title="Edit">
              <Pencil size={12} />
            </button>
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-orange-500 hover:bg-orange-50 transition-all"
              title="Rollback"
            >
              {restoring ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="max-w-[85%]">
        {fileRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 justify-end">
            {fileRefs.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-soft)] border border-[var(--coding-border)]/50 text-[11px] text-[var(--accent)] font-medium" title={f.path}>
                {f.isDir ? <FolderOpen size={10} /> : <FileIcon size={10} />}
                <span className="truncate max-w-[120px]">{f.name}{f.isDir ? '/' : ''}</span>
              </span>
            ))}
          </div>
        )}
        <div className="px-4 py-3 rounded-2xl bg-[var(--coding-user-bubble)] text-[14px] text-[var(--text)] leading-relaxed whitespace-pre-wrap shadow-sm">
          {text}
        </div>
      </div>
    </div>
  );
}

function FileIcon({ size = 14, className }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14,2 14,8 20,8" />
  </svg>;
}

function TextBlock({ text, isLive }) {
  const sendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);
  const parts = useMemo(() => splitInteractiveBlocks(text, isLive), [text, isLive]);

  return (
    <div className="prose-coding text-[14px] leading-relaxed text-[var(--text)] my-2">
      {parts.map((part, i) => {
        if (part.type === 'md') {
          const cleaned = stripHiddenJSON(part.content);
          if (!cleaned) return null;
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {cleaned}
            </ReactMarkdown>
          );
        }
        if (part.type === 'choice') {
          return (
            <InteractiveChoiceBlock
              key={i}
              data={part.data}
              onSubmit={(answer) => sendMessage({ message: answer, workingDir: codingProjectPath || '' })}
            />
          );
        }
        if (part.type === 'input') {
          return (
            <InteractiveInputBlock
              key={i}
              data={part.data}
              onSubmit={(answer) => sendMessage({ message: answer, workingDir: codingProjectPath || '' })}
            />
          );
        }
        if (part.type === 'task_plan' || part.type === 'questions_batch') return null;
        if (part.type === 'pending') {
          return (
            <div key={i} className="my-3">
              <SkeletonLoader lines={2} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

const INTERACTIVE_TYPES = ['choice', 'input', 'task_plan', 'questions_batch'];

function tryParseInteractiveJSON(str) {
  try {
    const obj = JSON.parse(str.trim());
    if (obj && typeof obj === 'object') {
      if (INTERACTIVE_TYPES.includes(obj.type)) return obj;
      if (Array.isArray(obj.questions)) return { ...obj, type: 'questions_batch' };
    }
  } catch {}
  return null;
}

// Strip task_plan / questions_batch JSON that slipped through as raw text
// (e.g. during streaming before splitInteractiveBlocks can detect it).
const TASK_PLAN_RE = /\{[^{}]*"type"\s*:\s*"task_plan"[^{}]*"tasks"\s*:\s*\[[\s\S]*?\]\s*\}/g;
function stripHiddenJSON(text) {
  if (!text) return text;
  return text.replace(TASK_PLAN_RE, '').trim();
}

function splitInteractiveBlocks(text, live = false) {
  if (!text) return [{ type: 'md', content: text }];

  const parts = [];
  let last = 0;

  const fencedRe = /```json\s*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = fencedRe.exec(text)) !== null) {
    const obj = tryParseInteractiveJSON(m[1]);
    if (obj) {
      if (m.index > last) parts.push({ type: 'md', content: text.slice(last, m.index) });
      parts.push({ type: obj.type, data: obj });
      last = m.index + m[0].length;
    }
  }

  if (parts.length === 0) {
    last = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '{') continue;
      let depth = 0;
      for (let j = i; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(i, j + 1);
            const obj = tryParseInteractiveJSON(candidate);
            if (obj) {
              if (i > last) {
                const before = text.slice(last, i).trim();
                if (before) parts.push({ type: 'md', content: before });
              }
              parts.push({ type: obj.type, data: obj });
              last = j + 1;
              i = j;
            }
            break;
          }
        }
      }
    }
  }

  if (last < text.length) {
    const tail = text.slice(last);
    if (live) {
      const pendingRe = /(?:```json\s*\n)?[\s\S]*(?:"type"\s*:\s*"(?:choice|input|task_plan|questions_batch)"|"questions"\s*:\s*\[)[\s\S]*$/;
      if (pendingRe.test(tail) && !tail.includes('```\n')) {
        const fenceStart = tail.search(/(?:```json\s*\n|\{[\s\S]*?"type")/);
        if (fenceStart > 0) parts.push({ type: 'md', content: tail.slice(0, fenceStart) });
        parts.push({ type: 'pending', content: '' });
      } else {
        parts.push({ type: 'md', content: tail });
      }
    } else {
      parts.push({ type: 'md', content: tail });
    }
  }
  if (parts.length === 0) return [{ type: 'md', content: text }];
  return parts;
}

function InteractiveChoiceBlock({ data, onSubmit }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = useCallback((optId) => {
    if (submitted) return;
    setSelected(optId);
  }, [submitted]);

  const handleSubmit = useCallback(() => {
    if (submitted || !selected) return;
    setSubmitted(true);
    const opt = (data.options || []).find(o => o.id === selected);
    onSubmit?.(opt?.label || selected);
  }, [submitted, selected, data, onSubmit]);

  return (
    <ThemedBox variant="raised" className="my-4 overflow-hidden">
      <div className="px-5 py-4">
        <h3 className="text-[15px] font-bold text-[var(--text)] mb-4">{data.title}</h3>
        <div className="space-y-2">
          {(data.options || []).map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <motion.button
                key={opt.id}
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(opt.id)}
                disabled={submitted}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-200',
                  isSelected ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm' : 'border-[var(--coding-border)] hover:border-[var(--text-faint)]/50 bg-[var(--coding-surface-raised)]',
                  submitted && 'opacity-70 cursor-default'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">
                    {isSelected
                      ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckCircle2 size={18} className="text-[var(--accent)]" /></motion.div>
                      : <Circle size={18} className="text-[var(--text-faint)]" />
                    }
                  </span>
                  <div>
                    <div className="text-[14px] font-medium text-[var(--text)]">{opt.label}</div>
                    {opt.desc && <div className="text-[12px] text-[var(--text-faint)] mt-0.5">{opt.desc}</div>}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
      {!submitted && (
        <div className="px-5 pb-4">
          <ThemedButton variant="primary" disabled={!selected} onClick={handleSubmit}>
            Submit
          </ThemedButton>
        </div>
      )}
      {submitted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-5 pb-4 text-[12px] text-emerald-600 flex items-center gap-1.5"
        >
          <CheckCircle2 size={14} />
          <span>Submitted</span>
        </motion.div>
      )}
    </ThemedBox>
  );
}

function InteractiveInputBlock({ data, onSubmit }) {
  const [values, setValues] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    const parts = (data.fields || []).map(f => `${f.label}: ${values[f.id] || ''}`).join('\n');
    setSubmitted(true);
    onSubmit?.(parts || values.answer || '');
  }, [submitted, data, values, onSubmit]);

  return (
    <ThemedBox variant="raised" className="my-4 overflow-hidden">
      <div className="px-5 py-4">
        <h3 className="text-[15px] font-bold text-[var(--text)] mb-4">{data.title}</h3>
        {(data.fields || []).map((field) => (
          <div key={field.id} className="mb-3">
            <label className="text-[12px] text-[var(--text-faint)] mb-1.5 block font-medium">{field.label}</label>
            {field.multiline ? (
              <textarea
                value={values[field.id] || ''}
                onChange={(e) => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                placeholder={field.placeholder || ''}
                disabled={submitted}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface)] text-[14px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all disabled:opacity-70 resize-none min-h-[80px]"
              />
            ) : (
              <input
                type="text"
                value={values[field.id] || ''}
                onChange={(e) => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                placeholder={field.placeholder || ''}
                disabled={submitted}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface)] text-[14px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all disabled:opacity-70"
              />
            )}
          </div>
        ))}
      </div>
      {!submitted && (
        <div className="px-5 pb-4">
          <ThemedButton variant="primary" onClick={handleSubmit}>Submit</ThemedButton>
        </div>
      )}
      {submitted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-5 pb-4 text-[12px] text-emerald-600 flex items-center gap-1.5"
        >
          <CheckCircle2 size={14} />
          <span>Submitted</span>
        </motion.div>
      )}
    </ThemedBox>
  );
}

function Circle({ size = 14, className }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/></svg>;
}

function LiveBlock({ block }) {
  const sendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);
  const activeSessionId = useStore((s) => s.activeSessionId);

  if (block.type === 'thinking') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="my-2 flex items-center gap-2 text-[12px] text-[var(--text-soft)]"
      >
        <Brain size={13} className="text-[var(--accent)] animate-pulse" />
        <span className="italic font-medium">Thinking...</span>
        {block.text && (
          <span className="text-[var(--text-faint)] truncate max-w-[300px] text-[11px] font-mono">
            {block.text.slice(-80)}
          </span>
        )}
      </motion.div>
    );
  }
  if (block.type === 'text' && block.text) {
    return <TextBlock text={block.text} isLive />;
  }
  if (block.type === 'task_list') return null;
  if (block.type === 'ask_question') {
    return (
      <AskQuestionBlock
        question={block.question}
        options={block.options}
        allowCustom={block.allowCustom}
        onSubmit={(answer) => sendMessage({ message: answer, workingDir: codingProjectPath || '' })}
      />
    );
  }
  if (block.type === 'permission') {
    const sessionId = activeSessionId;
    const permId = block.id;
    return (
      <PermissionBlock
        toolName={block.toolName}
        input={block.input}
        resolved={block.resolved}
        onAllow={() => sessionId && permId && api.submitCodingPermissionResponse({
          sessionId: String(sessionId), permissionId: String(permId), behavior: 'allow',
        })}
        onAllowSession={() => sessionId && permId && api.submitCodingPermissionResponse({
          sessionId: String(sessionId), permissionId: String(permId), behavior: 'allow',
        })}
        onDeny={() => sessionId && permId && api.submitCodingPermissionResponse({
          sessionId: String(sessionId), permissionId: String(permId), behavior: 'deny', message: 'User denied this action',
        })}
      />
    );
  }
  return null;
}

function ThinkingIndicator() {
  const agentState = useStore((s) => s.codingAgentState);
  const startedAt = useStore((s) => s.codingStartedAt);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const stateLabel = {
    THINKING: 'Thinking',
    CHECKING: 'Reading',
    EXECUTING: 'Executing',
    WAITING_FOR_USER: 'Waiting for input',
    WAITING_FOR_INPUT: 'Waiting for input',
    AWAITING_PERMISSION: 'Awaiting approval',
    WAITING_FOR_BATCH_ANSWER: 'Waiting for answers',
    DONE: 'Done',
  }[agentState] || 'Thinking';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 py-5"
    >
      <div className="relative">
        <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
          <Loader2 size={15} className="text-[var(--accent)] animate-spin" />
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse border-2 border-[var(--coding-surface)]" />
      </div>
      <div>
        <span className="text-[13px] font-semibold text-[var(--text)]">{stateLabel}</span>
        {elapsed > 0 && (
          <span className="ml-2 text-[11px] text-[var(--text-faint)] font-mono">
            {elapsed}s
          </span>
        )}
      </div>
    </motion.div>
  );
}

function WelcomeScreen({ projectPath, onChangeProject }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 flex items-center justify-center mb-6 border border-[var(--accent)]/20"
      >
        <Sparkles size={28} className="text-[var(--accent)]" />
      </motion.div>
      <h2 className="text-xl font-bold text-[var(--text)] mb-2">New session</h2>
      <p className="text-sm text-[var(--text-faint)] max-w-md leading-relaxed mb-4">
        Start a fresh coding session. AI is ready to help you build, debug, and architect your project.
      </p>
      {!projectPath && onChangeProject && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onChangeProject}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--coding-border)]/50 text-[13px] text-[var(--accent)] font-medium hover:shadow-sm transition-all"
        >
          <FolderOpen size={15} />
          Choose working directory
        </motion.button>
      )}
      {projectPath && (
        <div className="text-[12px] text-[var(--text-faint)] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--coding-surface-raised)] border border-[var(--coding-border)]/50">
          <FolderOpen size={12} />
          <span className="font-mono">{projectPath.split('/').pop()}</span>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group my-3 rounded-xl border border-[var(--coding-border)]/60 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--coding-surface-raised)]/80 border-b border-[var(--coding-border)]/50">
        <span className="text-[11px] text-[var(--text-faint)] font-mono">{language}</span>
        <button onClick={handleCopy} className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition-all">
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
      </div>
      <Highlight theme={themes.github} code={code} language={language || 'text'}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="p-3 text-[13px] leading-5 font-mono overflow-x-auto bg-[var(--coding-surface-raised)]">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="hover:bg-[var(--accent-soft)]/20 transition-colors">
                <span className="inline-block w-8 text-right mr-3 text-[var(--text-faint)] select-none text-[11px]">{i + 1}</span>
                {line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

const MD_COMPONENTS = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    if (!inline && match) {
      return <CodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />;
    }
    return <code className="px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)]/60 text-[var(--accent)] text-[13px] font-mono" {...props}>{children}</code>;
  },
  p({ children }) { return <p className="my-2 text-[var(--text)]">{children}</p>; },
  h1({ children }) { return <h1 className="text-lg font-bold text-[var(--text)] mt-5 mb-2">{children}</h1>; },
  h2({ children }) { return <h2 className="text-base font-bold text-[var(--text)] mt-4 mb-2">{children}</h2>; },
  h3({ children }) { return <h3 className="text-sm font-bold text-[var(--text)] mt-3 mb-1.5">{children}</h3>; },
  ul({ children }) { return <ul className="list-disc list-inside my-2 text-[var(--text)] space-y-1">{children}</ul>; },
  ol({ children }) { return <ol className="list-decimal list-inside my-2 text-[var(--text)] space-y-1">{children}</ol>; },
  li({ children }) { return <li className="text-[var(--text)]">{children}</li>; },
  a({ href, children }) { return <a href={href} className="text-[var(--accent)] underline hover:opacity-80 transition" target="_blank" rel="noopener noreferrer">{children}</a>; },
  blockquote({ children }) { return <blockquote className="border-l-3 border-[var(--accent)]/40 pl-4 my-3 text-[var(--text-soft)] italic">{children}</blockquote>; },
  table({ children }) { return <table className="my-3 border-collapse w-full text-[13px] rounded-lg overflow-hidden border border-[var(--coding-border)]/60">{children}</table>; },
  th({ children }) { return <th className="border border-[var(--coding-border)]/60 px-3 py-2 text-left text-[var(--text)] bg-[var(--coding-surface)] font-medium text-[12px]">{children}</th>; },
  td({ children }) { return <td className="border border-[var(--coding-border)]/60 px-3 py-2 text-[var(--text)]">{children}</td>; },
};
