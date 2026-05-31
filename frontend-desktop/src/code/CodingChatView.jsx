import { useEffect, useRef, useState, useCallback, useMemo, useTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import {
  Brain, Loader2, FolderOpen, ChevronDown, ChevronRight, ChevronUp,
  Copy, Check, CheckCircle2, Clock, Zap, Pencil, RotateCcw, FilePlus, FileEdit, X,
  History,
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
import { StickyTaskBar, TaskTodoList } from './TaskTodoList';
import { ThemedBox, ThemedButton } from './themed-containers';

export function CodingChatView({ projectPath, onChangeProject }) {
  const messages = useStore((s) => s.codingMessages);
  const liveBlocks = useStore((s) => s.codingLiveBlocks);
  const isStreaming = useStore((s) => s.codingIsStreaming);
  const agentState = useStore((s) => s.codingAgentState);
  const codingSendMessage = useStore((s) => s.codingSendMessage);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const codingTasks = useStore((s) => s.codingTasks);
  const liveDiffs = useStore((s) => s.liveDiffs) || [];
  const pendingQuestions = useStore((s) => s.codingPendingQuestions);
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

  const handleSend = useCallback((text, attachedFiles) => {
    let msg = text;
    if (attachedFiles?.length > 0) {
      const refs = attachedFiles.map(f => {
        if (f.isDir) return `[目录: ${f.path}]`;
        return `@${f.path}`;
      }).join(' ');
      msg = `${refs}\n\n${text}`;
    }
    codingSendMessage({ message: msg, workingDir: projectPath || '' });
  }, [codingSendMessage, projectPath]);

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
      {codingTasks.length > 0 && (
        <StickyTaskBar tasks={codingTasks} />
      )}

      {liveDiffs.length > 0 && (
        <LiveDiffPanel diffs={liveDiffs} />
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollable"
      >
        <div className="max-w-3xl mx-auto px-6 pb-6">
          <SessionHeader projectPath={projectPath} />

          {messages.length === 0 && !isStreaming && (
            <WelcomeScreen projectPath={projectPath} onChangeProject={onChangeProject} />
          )}

          {messages.map((msg) => (
            <MessageBlock key={msg.id} msg={msg} checkpoints={checkpoints} />
          ))}

          {liveBlocks.length > 0 && (
            <div className="space-y-1 mt-2">
              {liveBlocks.map((block, i) => (
                <LiveBlock key={i} block={block} />
              ))}
            </div>
          )}

          {codingTasks.length > 0 && (
            <TaskTodoList tasks={codingTasks} title="任务列表" collapsed={false} />
          )}

          {subAgents.length > 0 && (
            <AgentsWindow />
          )}

          {isStreaming && agentState === 'THINKING' && liveBlocks.length === 0 && (
            <ThinkingIndicator />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* AskQuestion wizard: non-blocking, above composer */}
      {pendingQuestions.length > 0 && (
        <div className="shrink-0 border-t border-[var(--coding-border)] bg-[var(--coding-surface)] backdrop-blur-md">
          <AskQuestionWizard />
        </div>
      )}

      <CodingComposer ref={composerRef} onSend={handleSend} disabled={isStreaming} projectPath={projectPath} />
    </div>
  );
}

function MessageBlock({ msg, checkpoints }) {
  if (msg.role === 'user') return <UserMessage msg={msg} />;
  if (msg.role === 'assistant') return <AssistantMessage msg={msg} checkpoints={checkpoints} />;
  if (msg.role === 'system') return <SystemMessage msg={msg} />;
  return null;
}

function SystemMessage({ msg }) {
  return (
    <div className="my-4 flex justify-center">
      <div className="px-4 py-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-[12px] font-medium flex items-center gap-2">
        <History size={12} />
        {msg.content}
      </div>
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
      {hover && (
        <div className="absolute right-0 -top-7 flex items-center gap-0.5 bg-[var(--coding-surface-raised)] rounded-lg border border-[var(--coding-border)] shadow-sm px-1 py-0.5 backdrop-blur-sm">
          <button onClick={handleCopy} className="p-1.5 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="复制">
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
          </button>
          <button onClick={handleEdit} className="p-1.5 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="编辑">
            <Pencil size={12} />
          </button>
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="p-1.5 rounded text-[var(--text-faint)] hover:text-orange-500 transition"
            title="回滚到此消息之前"
          >
            {restoring ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
          </button>
        </div>
      )}
      <div className="max-w-[85%]">
        {fileRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 justify-end">
            {fileRefs.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-soft)] border border-[var(--coding-border)] text-[11px] text-[var(--accent)]" title={f.path}>
                {f.isDir ? <FolderOpen size={10} /> : <FileIcon size={10} />}
                <span className="truncate max-w-[120px]">{f.name}{f.isDir ? '/' : ''}</span>
              </span>
            ))}
          </div>
        )}
        <div className="px-4 py-3 rounded-2xl bg-[var(--coding-user-bubble)] text-[14px] text-[var(--text)] leading-relaxed whitespace-pre-wrap">
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

function AssistantMessage({ msg, checkpoints }) {
  const blocks = useMemo(() => parseAssistantContent(msg.content), [msg.content]);
  const sendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);
  const [hover, setHover] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const activeSessionId = useStore((s) => s.activeSessionId);

  const checkpoint = checkpoints.find(cp => cp.message_id === msg.id);

  const HIDDEN_TOOLS = ['TodoWrite', 'TodoRead', 'todo_write', 'todo_read'];
  const toolBlocks = blocks.filter(b => b.type === 'tool' && !HIDDEN_TOOLS.includes(b.name));
  const todoToolBlocks = blocks.filter(b => b.type === 'tool' && HIDDEN_TOOLS.includes(b.name));
  const inlineTasks = useMemo(() => {
    for (const b of todoToolBlocks) {
      try {
        const inp = typeof b.input === 'string' ? JSON.parse(b.input) : b.input;
        if (Array.isArray(inp?.todos) && inp.todos.length > 0) return inp.todos;
      } catch {}
    }
    return null;
  }, [todoToolBlocks]);
  const otherBlocks = blocks.filter(b => b.type !== 'tool');

  const plainText = useMemo(() => {
    return otherBlocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  }, [otherBlocks]);

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
      {hover && (
        <div className="absolute right-0 -top-3 flex items-center gap-0.5 bg-[var(--coding-surface-raised)] rounded-lg border border-[var(--coding-border)] shadow-sm px-1 py-0.5 z-10 backdrop-blur-sm">
          {plainText && (
            <button onClick={handleCopy} className="p-1.5 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition" title="复制">
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            </button>
          )}
          {checkpoint && (
            <button
              onClick={() => setRollbackOpen(true)}
              className="p-1.5 rounded text-[var(--text-faint)] hover:text-orange-500 transition"
              title="回滚到此步"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      )}

      {/* Rollback confirmation modal */}
      {rollbackOpen && checkpoint && (
        <RollbackModal
          checkpoint={checkpoint}
          onConfirm={handleRollback}
          onCancel={() => setRollbackOpen(false)}
        />
      )}

      {toolBlocks.length > 0 && (
        <ToolGroupCard tools={toolBlocks} />
      )}
      {inlineTasks && inlineTasks.length > 0 && (
        <TaskTodoList tasks={inlineTasks} title="任务列表" collapsed={false} />
      )}
      {otherBlocks.map((block, i) => {
        if (block.type === 'thinking') return <ThinkingBlock key={i} text={block.text} />;
        if (block.type === 'text' && block.text) return <TextBlock key={i} text={block.text} />;
        if (block.type === 'task_list') {
          const tasks = block.tasks || block.todos || [];
          if (tasks.length > 0) return <TaskTodoList key={i} tasks={tasks} title={block.title || '任务列表'} collapsed={false} />;
          return null;
        }
        if (block.type === 'ask_question') {
          return (
            <AskQuestionBlock
              key={i}
              question={block.question}
              options={block.options}
              allowCustom={block.allowCustom}
              submitted={block.submitted}
              onSubmit={(answer) => sendMessage({ message: answer, workingDir: codingProjectPath || '' })}
            />
          );
        }
        if (block.type === 'permission') {
          return <PermissionBlock key={i} toolName={block.toolName} input={block.input} resolved={block.resolved} />;
        }
        return null;
      })}
      {msg.usage && <UsageInfo usage={msg.usage} />}
    </div>
  );
}

function RollbackModal({ checkpoint, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-[400px] rounded-2xl bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] shadow-2xl p-6 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <RotateCcw size={18} className="text-orange-500" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-[var(--text)]">回滚到此检查点</h3>
            <p className="text-[12px] text-[var(--text-faint)]">
              {new Date(checkpoint.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="space-y-2 mb-5 text-[13px] text-[var(--text-soft)]">
          <p>此操作将：</p>
          <ul className="list-disc list-inside space-y-1 text-[12px]">
            <li>恢复 {checkpoint.files_count || '?'} 个文件到检查点状态</li>
            <li>移除此消息之后的所有对话</li>
            <li>重置任务列表到检查点快照</li>
          </ul>
          <p className="text-[12px] text-orange-500 font-medium">此操作不可撤销。</p>
        </div>
        <div className="flex justify-end gap-2">
          <ThemedButton variant="ghost" onClick={onCancel}>取消</ThemedButton>
          <ThemedButton variant="danger" onClick={onConfirm}>
            <RotateCcw size={12} className="mr-1.5" />
            确认回滚
          </ThemedButton>
        </div>
      </div>
    </div>
  );
}

function ToolGroupCard({ tools }) {
  const [open, setOpen] = useState(false);
  const allDone = tools.every(t => t.done !== false);
  const allSuccess = tools.every(t => t.status !== 'failed');
  const totalMs = tools.reduce((sum, t) => sum + (t.ms || 0), 0);
  const label = tools.length === 1
    ? tools[0].label || tools[0].name || '执行工具'
    : `执行了 ${tools.length} 条命令`;

  const toolNames = tools.length > 1
    ? [...new Set(tools.map(t => t.name).filter(Boolean))].slice(0, 4).join(', ')
    : '';

  return (
    <div className="my-3 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface)] overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-[13px] hover:bg-[var(--accent-soft)] transition"
      >
        {open ? <ChevronUp size={14} className="text-[var(--text-faint)]" /> : <ChevronDown size={14} className="text-[var(--text-faint)]" />}
        <Zap size={13} className="text-[var(--accent)] shrink-0" />
        <span className="font-medium text-[var(--text-soft)]">{label}</span>
        {toolNames && !open && (
          <span className="text-[11px] text-[var(--text-faint)] truncate max-w-[200px]">{toolNames}</span>
        )}
        <span className="flex-1" />
        {allDone && totalMs > 0 && (
          <span className="text-[11px] text-[var(--text-faint)] flex items-center gap-1 mr-2">
            <Clock size={10} />
            {totalMs > 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`}
          </span>
        )}
        {allDone && allSuccess && <CheckCircle2 size={16} className="text-green-500" />}
        {allDone && !allSuccess && <span className="text-red-400 text-[12px]">有失败</span>}
        {!allDone && <Loader2 size={14} className="text-[var(--accent)] animate-spin" />}
      </button>
      {open && (
        <div className="border-t border-[var(--coding-border)]">
          {tools.map((tool, i) => (
            <CodingToolCard key={i} name={tool.name} label={tool.label} done={tool.done !== false} input={tool.input} status={tool.status} ms={tool.ms} />
          ))}
        </div>
      )}
    </div>
  );
}

function TextBlock({ text, isLive }) {
  const sendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);
  const parts = useMemo(() => splitInteractiveBlocks(text, isLive), [text, isLive]);

  return (
    <div className="prose-coding text-[14px] leading-relaxed text-[var(--text)] my-2">
      {parts.map((part, i) => {
        if (part.type === 'md') {
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {part.content}
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
            <div key={i} className="my-3 flex items-center gap-2 text-[13px] text-[var(--accent)]">
              <Loader2 size={14} className="animate-spin" />
              <span>Generating interactive options...</span>
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
              <button
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                disabled={submitted}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl border-2 transition-all',
                  isSelected ? 'border-[var(--coding-border-active)] bg-[var(--accent-soft)]' : 'border-[var(--coding-border)] hover:border-[var(--text-faint)] bg-[var(--coding-surface-raised)]',
                  submitted && 'opacity-70 cursor-default'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">
                    {isSelected ? <CheckCircle2 size={18} className="text-[var(--accent)]" /> : <Circle size={18} className="text-[var(--text-faint)]" />}
                  </span>
                  <div>
                    <div className="text-[14px] font-medium text-[var(--text)]">{opt.label}</div>
                    {opt.desc && <div className="text-[12px] text-[var(--text-faint)] mt-0.5">{opt.desc}</div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {!submitted && (
        <div className="px-5 pb-4">
          <ThemedButton variant="primary" disabled={!selected} onClick={handleSubmit}>
            <ArrowRightIcon size={13} className="mr-1.5" />
            Submit
          </ThemedButton>
        </div>
      )}
      {submitted && (
        <div className="px-5 pb-4 text-[12px] text-green-600 flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          <span>Submitted</span>
        </div>
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
            <label className="text-[12px] text-[var(--text-faint)] mb-1 block">{field.label}</label>
            {field.multiline ? (
              <textarea
                value={values[field.id] || ''}
                onChange={(e) => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                placeholder={field.placeholder || ''}
                disabled={submitted}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface)] text-[14px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition disabled:opacity-70 resize-none min-h-[80px]"
              />
            ) : (
              <input
                type="text"
                value={values[field.id] || ''}
                onChange={(e) => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                placeholder={field.placeholder || ''}
                disabled={submitted}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface)] text-[14px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition disabled:opacity-70"
              />
            )}
          </div>
        ))}
      </div>
      {!submitted && (
        <div className="px-5 pb-4">
          <ThemedButton variant="primary" onClick={handleSubmit}>
            <ArrowRightIcon size={13} className="mr-1.5" />
            Submit
          </ThemedButton>
        </div>
      )}
      {submitted && (
        <div className="px-5 pb-4 text-[12px] text-green-600 flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          <span>Submitted</span>
        </div>
      )}
    </ThemedBox>
  );
}

function ArrowRightIcon({ size = 14, className }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>;
}

function Circle({ size = 14, className }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/></svg>;
}

function ThinkingBlock({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const preview = (text || '').split('\n').slice(-1)[0]?.slice(-100) || '';
  return (
    <div className="my-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-[12px] text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="italic">Thinking</span>
        {!open && <span className="text-[var(--text-faint)] truncate max-w-[400px]">{preview}</span>}
      </button>
      {open && (
        <div className="mt-1 pl-5 text-[12px] text-[var(--text-faint)] whitespace-pre-wrap font-mono max-h-60 overflow-y-auto scrollable border-l-2 border-[var(--coding-border)]">
          {text}
        </div>
      )}
    </div>
  );
}

function UsageInfo({ usage }) {
  let data = usage;
  if (typeof usage === 'string') {
    try { data = JSON.parse(usage); } catch { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  const input = data.input_tokens || 0;
  const output = data.output_tokens || 0;
  if (!input && !output) return null;
  return (
    <div className="text-[11px] text-[var(--text-faint)] mt-1 flex items-center gap-2">
      <span>{(input + output).toLocaleString()} tokens</span>
    </div>
  );
}

function LiveBlock({ block }) {
  const sendMessage = useStore((s) => s.codingSendMessage);
  const codingProjectPath = useStore((s) => s.codingProjectPath);

  if (block.type === 'thinking') {
    return (
      <div className="my-2 flex items-center gap-2 text-[12px] text-[var(--accent)]">
        <Brain size={13} className="animate-pulse" />
        <span className="italic">Thinking...</span>
        {block.text && (
          <span className="text-[var(--text-faint)] truncate max-w-[300px] text-[11px]">
            {block.text.slice(-80)}
          </span>
        )}
      </div>
    );
  }
  if (block.type === 'tool') {
    const HIDDEN_TOOLS = ['TodoWrite', 'TodoRead', 'todo_write', 'todo_read'];
    if (HIDDEN_TOOLS.includes(block.name)) return null;
    return <CodingToolCard name={block.name} label={block.label} done={block.done} input={block.input} status={block.status} ms={block.ms} />;
  }
  if (block.type === 'text' && block.text) {
    return <TextBlock text={block.text} isLive />;
  }
  if (block.type === 'task_list') {
    const tasks = block.tasks || block.todos || [];
    if (tasks.length > 0) return <TaskTodoList tasks={tasks} title={block.title || '任务列表'} collapsed={false} />;
    return null;
  }
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
    return <PermissionBlock toolName={block.toolName} input={block.input} />;
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
    DONE: 'Done',
  }[agentState] || 'Thinking';

  return (
    <div className="flex items-center gap-2.5 text-[13px] text-[var(--accent)] py-4">
      <Loader2 size={14} className="animate-spin" />
      <span className="font-medium">{stateLabel}...</span>
      {elapsed > 0 && (
        <span className="text-[11px] text-[var(--text-faint)] flex items-center gap-1">
          <Clock size={10} />
          {elapsed}s
        </span>
      )}
    </div>
  );
}

function LiveDiffPanel({ diffs }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  if (!diffs || diffs.length === 0) return null;

  const active = diffs[Math.min(activeIdx, diffs.length - 1)];
  const filePath = active?.file || '';

  const diffLines = useMemo(() => {
    if (!active?.diff) return [];
    return active.diff.split('\n').filter(l => {
      if (l.startsWith('diff --git') || l.startsWith('index ') || l.startsWith('---') || l.startsWith('+++')) return false;
      return true;
    });
  }, [active?.diff]);

  return (
    <div className="border-b border-[var(--coding-border)] bg-[var(--coding-surface-raised)]">
      <div className="flex items-center border-b border-[var(--coding-border)] bg-[var(--coding-surface)]">
        <div className="flex-1 flex items-center gap-0.5 px-2 overflow-x-auto scrollable">
          {diffs.map((d, i) => {
            const name = d.file?.split('/').pop() || '';
            const isActive = i === Math.min(activeIdx, diffs.length - 1);
            return (
              <button
                key={d.file}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-t-lg transition shrink-0',
                  isActive
                    ? 'bg-[var(--coding-surface-raised)] border border-b-0 border-[var(--coding-border)] text-[var(--text)] font-medium -mb-px'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
                )}
              >
                {d.isNew ? <FilePlus size={12} className="text-green-500" /> : <FileEdit size={12} className="text-blue-500" />}
                <span>{name}</span>
                <span className="text-[10px] ml-1">
                  {d.added > 0 && <span className="text-green-600">+{d.added}</span>}
                  {d.removed > 0 && <span className="text-red-500 ml-0.5">-{d.removed}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="p-1.5 mr-1 text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
        >
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-[240px] overflow-y-auto scrollable">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-[var(--coding-surface)] text-[12px] text-[var(--text-faint)] border-b border-[var(--coding-border)]">
            {active?.isNew ? (
              <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 text-[10px] font-medium">NEW</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 text-[10px] font-medium">MODIFIED</span>
            )}
            <span className="font-mono truncate">{filePath}</span>
          </div>

          <div className="font-mono text-[12px] leading-[1.6]">
            {diffLines.map((line, i) => {
              let bg = '';
              let color = 'var(--text-soft)';
              if (line.startsWith('@@')) { bg = 'bg-blue-500/5'; color = '#3b82f6'; }
              else if (line.startsWith('+')) { bg = 'bg-green-500/10'; color = '#16a34a'; }
              else if (line.startsWith('-')) { bg = 'bg-red-500/10'; color = '#dc2626'; }

              return (
                <div key={i} className={cn('px-4 whitespace-pre', bg)} style={{ color }}>
                  {line}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WelcomeScreen({ projectPath, onChangeProject }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-6">
        <span className="text-3xl text-[var(--accent)] font-mono font-bold">&gt;<span className="opacity-60">;</span>]</span>
      </div>
      <h2 className="text-xl font-bold text-[var(--text)] mb-2">New session</h2>
      <p className="text-sm text-[var(--text-faint)] max-w-md leading-relaxed mb-4">
        Start a fresh coding session. AI is ready to help you build, debug, and architect your project.
      </p>
      {!projectPath && onChangeProject && (
        <button
          onClick={onChangeProject}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-soft)] border border-[var(--coding-border)] text-[13px] text-[var(--accent)] font-medium hover:bg-[var(--accent-soft)] transition"
        >
          <FolderOpen size={15} />
          选择工作目录
        </button>
      )}
      {projectPath && (
        <div className="text-[12px] text-[var(--text-faint)] flex items-center gap-1.5">
          <FolderOpen size={12} />
          <span>{projectPath.split('/').pop()}</span>
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
    <div className="relative group my-3 rounded-xl border border-[var(--coding-border)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--coding-surface)] border-b border-[var(--coding-border)]">
        <span className="text-[11px] text-[var(--text-faint)] font-mono">{language}</span>
        <button onClick={handleCopy} className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition">
          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
        </button>
      </div>
      <Highlight theme={themes.github} code={code} language={language || 'text'}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="p-3 text-[13px] leading-5 font-mono overflow-x-auto bg-[var(--coding-surface-raised)]">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
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
    return <code className="px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] text-[13px] font-mono" {...props}>{children}</code>;
  },
  p({ children }) { return <p className="my-2 text-[var(--text)]">{children}</p>; },
  h1({ children }) { return <h1 className="text-lg font-bold text-[var(--text)] mt-5 mb-2">{children}</h1>; },
  h2({ children }) { return <h2 className="text-base font-bold text-[var(--text)] mt-4 mb-2">{children}</h2>; },
  h3({ children }) { return <h3 className="text-sm font-bold text-[var(--text)] mt-3 mb-1.5">{children}</h3>; },
  ul({ children }) { return <ul className="list-disc list-inside my-2 text-[var(--text-soft)] space-y-1">{children}</ul>; },
  ol({ children }) { return <ol className="list-decimal list-inside my-2 text-[var(--text-soft)] space-y-1">{children}</ol>; },
  li({ children }) { return <li className="text-[var(--text-soft)]">{children}</li>; },
  a({ href, children }) { return <a href={href} className="text-[var(--accent)] underline hover:opacity-80" target="_blank" rel="noopener noreferrer">{children}</a>; },
  blockquote({ children }) { return <blockquote className="border-l-3 border-[var(--coding-border)] pl-4 my-3 text-[var(--text-faint)] italic">{children}</blockquote>; },
  table({ children }) { return <table className="my-3 border-collapse w-full text-[13px] rounded-lg overflow-hidden border border-[var(--coding-border)]">{children}</table>; },
  th({ children }) { return <th className="border border-[var(--coding-border)] px-3 py-2 text-left text-[var(--text-soft)] bg-[var(--coding-surface)] font-medium text-[12px]">{children}</th>; },
  td({ children }) { return <td className="border border-[var(--coding-border)] px-3 py-2 text-[var(--text-soft)]">{children}</td>; },
};
