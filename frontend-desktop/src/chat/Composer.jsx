import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Send, ImagePlus, BookOpen, Square, Cpu, Coins, Slash, Languages, FileText, Lightbulb, Code2, SearchCheck, RefreshCw, Wrench, Mail, Sparkles, GitCompare, Database, TestTube, Mic, MicOff, Loader2, Paperclip, X, Camera, Monitor } from 'lucide-react';
import { useStore } from '../state/useStore';
import { Button, Tooltip } from '../ui/primitives';
import { cn, isH5Mobile } from '../ui/cn';
import { formatNum } from './blockUtils';
import { api } from '../api/client';

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

const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'json', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log',
  'py', 'js', 'jsx', 'ts', 'tsx', 'go', 'rs', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs',
  'rb', 'php', 'swift', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'sql', 'r', 'lua', 'pl', 'pm', 'dart', 'scala', 'clj', 'ex', 'exs', 'erl', 'hs',
  'html', 'css', 'scss', 'less', 'vue', 'svelte',
  'dockerfile', 'makefile', 'gitignore', 'env',
]);

function getFileExt(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function Composer({ useKB: controlledUseKB, setUseKB: setControlledUseKB } = {}) {
  const sendMessage = useStore((s) => s.sendMessage);
  const abort = useStore((s) => s.abort);
  const isStreaming = useStore((s) => s.isStreaming);
  const messages = useStore((s) => s.messages);
  const pushNotification = useStore((s) => s.pushNotification);
  const screenAgentMode = useStore((s) => s.screenAgentMode);
  const toggleScreenAgentMode = useStore((s) => s.toggleScreenAgentMode);

  const [text, setText] = useState('');
  const [localUseKB, setLocalUseKB] = useState(false);
  const [images, setImages] = useState([]); // [{ mediaType, data, preview }]
  const [files, setFiles] = useState([]); // [{ name, ext, content, size }]
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef(null);
  const slashRef = useRef(null);
  const composingRef = useRef(false);
  const composingEndTsRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const useKB = controlledUseKB ?? localUseKB;
  const setUseKB = setControlledUseKB ?? setLocalUseKB;

  // 监听全局截屏快捷键推送
  useEffect(() => {
    if (!window.electronAPI?.onScreenshotCaptured) return;
    const unsub = window.electronAPI.onScreenshotCaptured((img) => {
      const preview = `data:${img.mediaType};base64,${img.data}`;
      setImages((prev) => [...prev, { mediaType: img.mediaType, data: img.data, preview }].slice(0, 6));
      pushNotification({ title: '截屏完成', body: '已添加到输入框' });
    });
    return unsub;
  }, [pushNotification]);

  // ─── 录音控制（录完整段再转写，用户手动停止）──────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm',
      });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recordTimerRef.current);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 1000) { setRecording(false); return; }
        setTranscribing(true);
        try {
          const result = await api.transcribeAudio(blob);
          if (result) {
            setText((prev) => prev + (prev && !prev.endsWith('\n') ? ' ' : '') + result);
            requestAnimationFrame(() => {
              const el = taRef.current;
              if (el) { el.focus(); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px'; }
            });
          }
        } catch (err) {
          pushNotification({ title: '语音识别失败', body: err.message || '请重试' });
        } finally {
          setTranscribing(false);
          setRecording(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);
    } catch (err) {
      pushNotification({ title: '无法录音', body: err.message || '请检查麦克风权限' });
    }
  }, [pushNotification]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordTimerRef.current);
  }, []);

  // ─── 文件拖拽处理 ───────────────────────────────────────────────
  const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);
  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (!droppedFiles.length) return;
    const newImages = [];
    const newFiles = [];
    for (const f of droppedFiles) {
      if (f.type.startsWith('image/')) {
        const buf = await f.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        newImages.push({ mediaType: f.type || 'image/png', data: b64, preview: URL.createObjectURL(f) });
      } else {
        const ext = getFileExt(f.name);
        if (TEXT_EXTENSIONS.has(ext) || f.type.startsWith('text/')) {
          const content = await f.text();
          newFiles.push({ name: f.name, ext, content, size: f.size });
        }
      }
    }
    if (newImages.length) setImages((prev) => [...prev, ...newImages].slice(0, 6));
    if (newFiles.length) setFiles((prev) => [...prev, ...newFiles].slice(0, 5));
  }, []);

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
    let finalText = text.trim();
    if (!finalText && images.length === 0 && files.length === 0) return;
    if (isStreaming) return;
    const imgs = images.map(({ mediaType, data }) => ({ mediaType, data }));
    const attachedFiles = files.map((f) => ({ name: f.name, ext: f.ext, content: f.content, size: f.size }));
    if (!finalText && attachedFiles.length > 0) finalText = '请分析以下文件';
    setText('');
    setImages([]);
    setFiles([]);
    await sendMessage({ message: finalText, images: imgs, useKB, files: attachedFiles });
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
    const pastedFiles = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) pastedFiles.push(f);
      }
    }
    if (pastedFiles.length) {
      e.preventDefault();
      onPickFiles(pastedFiles);
    }
  };

  const handleScreenshot = useCallback(async () => {
    if (!window.electronAPI?.captureScreen) return;
    try {
      const img = await window.electronAPI.captureScreen();
      const preview = `data:${img.mediaType};base64,${img.data}`;
      setImages((prev) => [...prev, { mediaType: img.mediaType, data: img.data, preview }].slice(0, 6));
    } catch (err) {
      pushNotification({ title: '截屏失败', body: err.message || '请重试' });
    }
  }, [pushNotification]);

  const hasContent = text.trim() || images.length > 0 || files.length > 0;
  const [isMobileComposer, setIsMobileComposer] = useState(() => isH5Mobile() || (typeof window !== 'undefined' && window.innerWidth < 768));
  useEffect(() => {
    const h5 = isH5Mobile();
    const check = () => setIsMobileComposer(h5 || window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className={cn('pb-6 safe-area-bottom', isMobileComposer ? 'px-2 pb-3' : 'px-4')}>
      <div className="max-w-4xl mx-auto">
        {(sessionUsage.in + sessionUsage.out) > 0 && (
          <div className="mb-2 flex items-center justify-end gap-3 text-xs text-[color:var(--text-faint)]">
            <span className="inline-flex items-center gap-1"><Cpu size={12} />本会话 ↑{formatNum(sessionUsage.in)} ↓{formatNum(sessionUsage.out)}</span>
            {sessionUsage.cost > 0 && (
              <span className="inline-flex items-center gap-1"><Coins size={12} />${sessionUsage.cost.toFixed(4)}</span>
            )}
          </div>
        )}

        <div
          className={cn('composer p-3 relative transition-all', dragOver && 'ring-2 ring-[color:var(--accent)] bg-[color:var(--accent-soft)]/30')}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {dragOver && (
            <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl pointer-events-none">
              <div className="text-sm font-medium text-[color:var(--accent)] flex items-center gap-2">
                <Paperclip size={18} /> 拖放文件到此处
              </div>
            </div>
          )}

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

          {files.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-xs">
                  <FileText size={12} className="text-[color:var(--accent)] shrink-0" />
                  <span className="truncate max-w-[120px] text-[color:var(--text-soft)]">{f.name}</span>
                  <span className="text-[color:var(--text-faint)]">({(f.size / 1024).toFixed(1)}KB)</span>
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="ml-0.5 text-[color:var(--text-faint)] hover:text-red-500 transition">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 录音状态指示条 */}
          {(recording || transcribing) && (
            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              {recording ? (
                <>
                  <span className="voice-pulse w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">录音中 {recordDuration}s</span>
                  <button onClick={stopRecording} className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium transition">
                    点击停止并识别
                  </button>
                </>
              ) : (
                <>
                  <Loader2 size={14} className="animate-spin text-[color:var(--accent)]" />
                  <span className="text-xs text-[color:var(--accent)] font-medium">语音识别中...</span>
                </>
              )}
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
            placeholder="输入消息… / 快捷命令 · 拖入文件 · Shift+Enter 换行"
            rows={1}
            className="text-[15px] leading-6"
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-0.5">
              <Tooltip label="添加图片">
                <label className="cursor-pointer">
                  <input
                    type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => onPickFiles(Array.from(e.target.files || []))}
                  />
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)] transition">
                    <ImagePlus size={16} />
                  </span>
                </label>
              </Tooltip>
              {!isMobileComposer && (
                <Tooltip label="添加文件">
                  <label className="cursor-pointer">
                    <input
                      type="file" multiple className="hidden"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        const imgFiles = picked.filter(f => f.type.startsWith('image/'));
                        const txtFiles = picked.filter(f => !f.type.startsWith('image/'));
                        if (imgFiles.length) onPickFiles(imgFiles);
                        if (txtFiles.length) {
                          Promise.all(txtFiles.map(async f => {
                            const ext = getFileExt(f.name);
                            const content = await f.text();
                            return { name: f.name, ext, content, size: f.size };
                          })).then(newFiles => setFiles(prev => [...prev, ...newFiles].slice(0, 5)));
                        }
                        e.target.value = '';
                      }}
                    />
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)] transition">
                      <Paperclip size={16} />
                    </span>
                  </label>
                </Tooltip>
              )}
              <span className="w-px h-4 bg-[color:var(--line)] mx-0.5" />
              <Tooltip label={recording ? '点击停止' : transcribing ? '识别中...' : '语音输入'}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (transcribing) return;
                    if (recording) { stopRecording(); } else { startRecording(); }
                  }}
                  disabled={transcribing}
                  className={cn(
                    'inline-flex items-center justify-center w-8 h-8 rounded-lg transition',
                    recording ? 'bg-red-500/20 text-red-500 voice-pulse-bg' :
                    transcribing ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]' :
                    'hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)]'
                  )}
                >
                  {transcribing ? <Loader2 size={16} className="animate-spin" /> :
                   recording ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              </Tooltip>
              {!isMobileComposer && window.electronAPI?.captureScreen && (
                <Tooltip label="截屏 (⌘⇧S)">
                  <button
                    onClick={handleScreenshot}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)] transition"
                  >
                    <Camera size={16} />
                  </button>
                </Tooltip>
              )}
              {!isMobileComposer && (
                <Tooltip label={screenAgentMode ? '关闭 Screen Agent' : 'Screen Agent'}>
                  <button
                    onClick={toggleScreenAgentMode}
                    className={cn(
                      'inline-flex items-center justify-center w-8 h-8 rounded-lg transition',
                      screenAgentMode
                        ? 'bg-blue-500/20 text-blue-500'
                        : 'hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)]'
                    )}
                  >
                    <Monitor size={16} />
                  </button>
                </Tooltip>
              )}
              <Tooltip label={useKB ? '已启用知识库' : '启用知识库检索'}>
                <button
                  onClick={() => setUseKB((v) => !v)}
                  aria-pressed={useKB}
                  aria-label={useKB ? '关闭知识库检索' : '启用知识库检索'}
                  className={cn(
                    'inline-flex items-center justify-center w-8 h-8 rounded-lg transition',
                    useKB ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'hover:bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] hover:text-[color:var(--text-soft)]'
                  )}
                >
                  <BookOpen size={16} />
                </button>
              </Tooltip>
            </div>
            {isStreaming ? (
              <button
                onClick={abort}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg text-sm font-medium border border-red-500/30 text-red-500 bg-red-500/5 hover:bg-red-500/10 transition-all active:scale-95',
                  isMobileComposer ? 'px-3 py-2 min-w-[60px] justify-center' : 'px-3.5 py-1.5'
                )}
              >
                <Square size={12} /> 停止
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={!hasContent}
                className={cn(
                  'inline-flex items-center justify-center rounded-xl transition-all duration-200',
                  isMobileComposer ? 'w-10 h-10' : 'w-9 h-9',
                  hasContent
                    ? 'bg-[color:var(--accent)] text-white shadow-[0_2px_12px_var(--accent-glow)] hover:shadow-[0_4px_20px_var(--accent-glow)] hover:-translate-y-px active:translate-y-0 active:scale-95'
                    : 'bg-[color:var(--bg-soft)] text-[color:var(--text-faint)] cursor-not-allowed'
                )}
              >
                <Send size={isMobileComposer ? 18 : 16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

