import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Send, ImagePlus, BookOpen, Square, Cpu, Coins, Slash, Languages, FileText, Lightbulb, Code2, SearchCheck, RefreshCw, Wrench, Mail, Sparkles, GitCompare, Database, TestTube } from 'lucide-react';
import { useStore } from '../state/useStore';
import { Button, Tooltip } from '../ui/primitives';
import { cn } from '../ui/cn';
import { formatNum } from './blockUtils';

const SLASH_COMMANDS = [
  { cmd: '/translate', label: '翻译', desc: '翻译以下内容', prompt: '请将以下内容翻译为{目标语言}：\n\n', icon: Languages },
  { cmd: '/summarize', label: '总结', desc: '总结长文要点', prompt: '请总结以下内容的要点：\n\n', icon: FileText },
  { cmd: '/explain', label: '解释', desc: '通俗易懂地解释', prompt: '请用通俗易懂的语言解释以下内容：\n\n', icon: Lightbulb },
  { cmd: '/code', label: '写代码', desc: '根据描述编写代码', prompt: '请根据以下描述编写代码：\n\n', icon: Code2 },
  { cmd: '/review', label: '代码审查', desc: '审查代码并提出建议', prompt: '请审查以下代码，指出问题并提出改进建议：\n\n```\n\n```', icon: SearchCheck },
  { cmd: '/refactor', label: '重构', desc: '优化和重构代码', prompt: '请重构以下代码，使其更简洁、高效、易读：\n\n```\n\n```', icon: RefreshCw },
  { cmd: '/fix', label: '修复', desc: '分析并修复错误', prompt: '请分析以下错误并提供修复方案：\n\n', icon: Wrench },
  { cmd: '/email', label: '写邮件', desc: '撰写邮件内容', prompt: '请帮我撰写一封{正式/非正式}邮件，主题为：', icon: Mail },
  { cmd: '/brainstorm', label: '头脑风暴', desc: '围绕主题发散创意', prompt: '请围绕以下主题进行头脑风暴，给出 5-10 个创意方向：\n\n', icon: Sparkles },
  { cmd: '/compare', label: '对比分析', desc: '对比两个方案的优劣', prompt: '请对比以下方案，分析各自的优缺点：\n\n方案 A：\n方案 B：', icon: GitCompare },
  { cmd: '/sql', label: 'SQL', desc: '根据描述生成 SQL', prompt: '请根据以下描述生成 SQL 查询语句：\n\n', icon: Database },
  { cmd: '/test', label: '写测试', desc: '生成单元测试', prompt: '请为以下代码编写单元测试：\n\n```\n\n```', icon: TestTube },
];

export function Composer({ useKB: controlledUseKB, setUseKB: setControlledUseKB } = {}) {
  const sendMessage = useStore((s) => s.sendMessage);
  const abort = useStore((s) => s.abort);
  const isStreaming = useStore((s) => s.isStreaming);
  const messages = useStore((s) => s.messages);

  const [text, setText] = useState('');
  const [localUseKB, setLocalUseKB] = useState(false);
  const [images, setImages] = useState([]); // [{ mediaType, data, preview }]
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const taRef = useRef(null);
  const slashRef = useRef(null);
  const composingRef = useRef(false);
  const composingEndTsRef = useRef(0);
  const useKB = controlledUseKB ?? localUseKB;
  const setUseKB = setControlledUseKB ?? setLocalUseKB;

  const slashQuery = useMemo(() => {
    if (!text.startsWith('/')) return null;
    const q = text.split('\n')[0].toLowerCase();
    return q;
  }, [text]);

  const filteredCommands = useMemo(() => {
    if (slashQuery === null) return [];
    return SLASH_COMMANDS.filter(c =>
      c.cmd.includes(slashQuery) || c.label.includes(slashQuery) || c.desc.includes(slashQuery)
    );
  }, [slashQuery]);

  useEffect(() => {
    setSlashOpen(filteredCommands.length > 0 && text.startsWith('/') && !text.includes('\n'));
    setSlashIdx(0);
  }, [filteredCommands, text]);

  const applySlashCommand = useCallback((cmd) => {
    setText(cmd.prompt);
    setSlashOpen(false);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = cmd.prompt.length; }
    });
  }, []);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }, [text]);

  // 会话累计 token
  const sessionUsage = messages.reduce((acc, m) => {
    if (m.role !== 'assistant' || !m.usage) return acc;
    try {
      const u = JSON.parse(m.usage);
      acc.in += (u.input_tokens || 0) + (u.cache_read_tokens || 0);
      acc.out += u.output_tokens || 0;
      acc.cost += u.cost_usd || 0;
    } catch {
      // 忽略旧消息或异常 usage 字段，避免影响输入框渲染。
    }
    return acc;
  }, { in: 0, out: 0, cost: 0 });

  const onSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    if (isStreaming) return;
    const imgs = images.map(({ mediaType, data }) => ({ mediaType, data }));
    setText('');
    setImages([]);
    await sendMessage({ message: trimmed, images: imgs, useKB });
  };

  const onKeyDown = (e) => {
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filteredCommands.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => (i - 1 + filteredCommands.length) % filteredCommands.length); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        if (filteredCommands[slashIdx]) applySlashCommand(filteredCommands[slashIdx]);
        return;
      }
      if (e.key === 'Escape') { setSlashOpen(false); return; }
    }

    if (e.key !== 'Enter' || e.shiftKey) return;
    if (
      e.isComposing ||
      e.nativeEvent?.isComposing ||
      e.keyCode === 229 ||
      composingRef.current ||
      Date.now() - composingEndTsRef.current < 50
    ) {
      return;
    }
    e.preventDefault();
    onSubmit();
  };

  const onCompositionStart = () => {
    composingRef.current = true;
  };
  const onCompositionEnd = () => {
    composingRef.current = false;
    composingEndTsRef.current = Date.now();
  };

  const arrayBufferToBase64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const onPickFiles = async (files) => {
    const arr = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const buf = await f.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      arr.push({ mediaType: f.type || 'image/png', data: b64, preview: URL.createObjectURL(f) });
    }
    if (arr.length > 0) {
      setImages((x) => [...x, ...arr].slice(0, 6));
    }
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      onPickFiles(files);
    }
  };

  return (
    <div className="px-6 pb-6">
      <div className="max-w-3xl mx-auto">
        {(sessionUsage.in + sessionUsage.out) > 0 && (
          <div className="mb-2 flex items-center justify-end gap-3 text-xs text-[color:var(--text-faint)]">
            <span className="inline-flex items-center gap-1"><Cpu size={12} />本会话 ↑{formatNum(sessionUsage.in)} ↓{formatNum(sessionUsage.out)}</span>
            {sessionUsage.cost > 0 && (
              <span className="inline-flex items-center gap-1"><Coins size={12} />${sessionUsage.cost.toFixed(4)}</span>
            )}
          </div>
        )}

        <div className="composer p-3 relative">
          {slashOpen && filteredCommands.length > 0 && (
            <div
              ref={slashRef}
              className="absolute bottom-full left-0 right-0 mb-1 glass rounded-xl shadow-lg border border-[color:var(--line)] overflow-hidden z-50 animate-rise"
            >
              <div className="px-3 py-1.5 border-b border-[color:var(--line)] text-[11px] font-medium text-[color:var(--text-faint)] uppercase tracking-wide flex items-center gap-1.5">
                <Slash size={10} /> 快捷命令
              </div>
              <div className="max-h-[240px] overflow-y-auto scrollable py-1">
                {filteredCommands.map((cmd, i) => {
                  const CmdIcon = cmd.icon || Code2;
                  return (
                    <button
                      key={cmd.cmd}
                      onMouseDown={(e) => { e.preventDefault(); applySlashCommand(cmd); }}
                      onMouseEnter={() => setSlashIdx(i)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 text-left transition-all relative',
                        i === slashIdx ? 'bg-[color:var(--accent-soft)]' : 'hover:bg-[color:var(--bg-soft)]'
                      )}
                    >
                      {i === slashIdx && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-[color:var(--accent)]" />
                      )}
                      <span className="w-8 h-8 rounded-lg bg-[color:var(--bg-soft)] text-[color:var(--accent)] flex items-center justify-center shrink-0">
                        <CmdIcon size={15} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{cmd.cmd} <span className="text-[color:var(--text-faint)] font-normal ml-1">{cmd.label}</span></div>
                        <div className="text-xs text-[color:var(--text-faint)] truncate">{cmd.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {images.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {images.map((img, i) => (
                <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-[color:var(--line)]">
                  <img src={img.preview} className="w-full h-full object-cover" alt="" />
                  <button
                    onClick={() => setImages(images.filter((_, j) => j !== i))}
                    className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center"
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            onPaste={onPaste}
            placeholder="输入消息，/ 唤起快捷命令，Shift+Enter 换行"
            rows={1}
            className="text-[15px] leading-6"
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              <Tooltip label="添加图片">
                <label className="cursor-pointer">
                  <input
                    type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => onPickFiles(Array.from(e.target.files || []))}
                  />
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]">
                    <ImagePlus size={18} />
                  </span>
                </label>
              </Tooltip>
              <Tooltip label={useKB ? '已启用知识库检索' : '启用知识库检索'}>
                <button
                  onClick={() => setUseKB((v) => !v)}
                  aria-pressed={useKB}
                  aria-label={useKB ? '关闭知识库检索' : '启用知识库检索'}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition ${
                    useKB ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'hover:bg-[color:var(--bg-soft)] text-[color:var(--text-soft)]'
                  }`}
                >
                  <BookOpen size={18} />
                </button>
              </Tooltip>
            </div>
            {isStreaming ? (
              <Button variant="outline" onClick={abort}>
                <Square size={14} /> 停止
              </Button>
            ) : (
              <Button onClick={onSubmit} disabled={!text.trim() && images.length === 0}>
                <Send size={14} /> 发送
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
