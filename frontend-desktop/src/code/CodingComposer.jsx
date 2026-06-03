import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Send, Square, Plus, ChevronDown, ChevronUp, FileText, X, Folder, ArrowRight, Bot, Clock, MessageSquare, Search, Trash2, ImagePlus, Brain, Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '../ui/cn';
import { useStore } from '../state/useStore';
import { api } from '../api/client';
import { ModeSwitcher } from './ModeSwitcher';

export const CodingComposer = forwardRef(function CodingComposer({ onSend, disabled, projectPath }, ref) {
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [images, setImages] = useState([]);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [fileBrowserPath, setFileBrowserPath] = useState('');
  const [fileBrowserEntries, setFileBrowserEntries] = useState([]);
  const [fileBrowserLoading, setFileBrowserLoading] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const textareaRef = useRef(null);
  const composingRef = useRef(false);
  const composingEndTsRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const isStreaming = useStore((s) => s.codingIsStreaming);
  const abort = useStore((s) => s.codingAbort);
  const profiles = useStore((s) => s.profiles);
  const activeProfile = useStore((s) => s.activeProfile);
  const activateProfile = useStore((s) => s.activateProfile);
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const createSession = useStore((s) => s.createSession);
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);
  const codingThinkingEnabled = useStore((s) => s.codingThinkingEnabled);
  const setCodingThinkingEnabled = useStore((s) => s.setCodingThinkingEnabled);
  const codingMode = useStore((s) => s.codingMode);
  const setCodingMode = useStore((s) => s.setCodingMode);
  const pushNotification = useStore((s) => s.pushNotification);

  useImperativeHandle(ref, () => ({
    insertText: (str) => {
      setText((prev) => prev + str);
      setTimeout(() => { textareaRef.current?.focus(); autoResize(textareaRef.current); }, 0);
    },
    focus: () => textareaRef.current?.focus(),
  }), []);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) textareaRef.current.focus();
  }, [isStreaming]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0 && attachedFiles.length === 0) return;
    if (disabled) return;
    onSend(trimmed || '请分析以下内容', attachedFiles, images);
    setText('');
    setAttachedFiles([]);
    setImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, onSend, disabled, attachedFiles, images]);

  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (
      e.isComposing ||
      e.nativeEvent?.isComposing ||
      e.keyCode === 229 ||
      composingRef.current ||
      Date.now() - composingEndTsRef.current < 50
    ) return;
    e.preventDefault();
    handleSend();
  }, [handleSend]);

  const handleChange = useCallback((e) => {
    const val = e.target.value;
    setText(val);
    if (val === '/') setShowSlashMenu(true);
    else if (!val.startsWith('/')) setShowSlashMenu(false);
  }, []);

  const removeFile = useCallback((idx) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const arrayBufferToBase64 = useCallback((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, []);

  const pickImageFiles = useCallback(async (files) => {
    const arr = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const buf = await f.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      const mediaType = f.type || 'image/png';
      arr.push({ mediaType, data: b64, preview: URL.createObjectURL(f) });
    }
    if (arr.length > 0) setImages(prev => [...prev, ...arr]);
  }, [arrayBufferToBase64]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const filePath = e.dataTransfer.getData('text/plain');
    const isDir = e.dataTransfer.getData('application/x-is-dir') === 'true';
    if (filePath) {
      const name = filePath.split('/').pop();
      setAttachedFiles(prev => [...prev, { path: filePath, name, isDir }]);
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      const imgFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      const nonImgFiles = droppedFiles.filter(f => !f.type.startsWith('image/'));
      if (imgFiles.length > 0) pickImageFiles(imgFiles);
      for (const f of nonImgFiles) {
        const absPath = f.path || f.name;
        const name = absPath.split('/').pop() || f.name;
        setAttachedFiles(prev => [...prev, { path: absPath, name, isDir: false }]);
      }
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [pickImageFiles]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || [];
    const pastedFiles = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) pastedFiles.push(f);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      pickImageFiles(pastedFiles);
    }
  }, [pickImageFiles]);

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
              const el = textareaRef.current;
              if (el) { el.focus(); autoResize(el); }
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

  const openFilePicker = useCallback(async () => {
    if (window.electronAPI?.selectFiles) {
      const paths = await window.electronAPI.selectFiles();
      if (paths && paths.length > 0) {
        for (const p of paths) {
          const name = p.split('/').pop() || p;
          const isDir = !name.includes('.') || p.endsWith('/');
          setAttachedFiles(prev => [...prev, { path: p, name, isDir }]);
        }
      }
      return;
    }
    const dir = projectPath || '';
    setFileBrowserPath(dir);
    setShowFileBrowser(true);
    setFileBrowserLoading(true);
    try {
      const res = await api.listDirectory(dir);
      setFileBrowserEntries(res.entries || []);
    } catch { setFileBrowserEntries([]); }
    setFileBrowserLoading(false);
  }, [projectPath]);

  const navigateFileBrowser = useCallback(async (dirPath) => {
    setFileBrowserPath(dirPath);
    setFileBrowserLoading(true);
    try {
      const res = await api.listDirectory(dirPath);
      setFileBrowserEntries(res.entries || []);
    } catch { setFileBrowserEntries([]); }
    setFileBrowserLoading(false);
  }, []);

  const selectFile = useCallback((entry, attachDir) => {
    if (entry.is_dir && !attachDir) {
      navigateFileBrowser(entry.path);
    } else {
      setAttachedFiles(prev => [...prev, { path: entry.path, name: entry.name, isDir: entry.is_dir }]);
      setShowFileBrowser(false);
    }
  }, [navigateFileBrowser]);

  const SLASH_COMMANDS = [
    { cmd: '/compact', desc: 'Compact conversation context' },
    { cmd: '/clear', desc: 'Clear conversation history' },
    { cmd: '/help', desc: 'Show available commands' },
    { cmd: '/review', desc: 'Review code changes' },
    { cmd: '/commit', desc: 'Create a git commit' },
    { cmd: '/pr', desc: 'Create a pull request' },
    { cmd: '/init', desc: 'Initialize project' },
  ];

  const modelName = activeProfile?.name || activeProfile?.model || 'Select model';

  return (
    <div className="border-t border-[var(--coding-border)]/40 bg-[var(--coding-surface-raised)] relative backdrop-blur-md coding-mobile-composer">
      {/* 会话历史下拉菜单 */}
      {showSessionMenu && (
        <SessionHistoryDropdown
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={(id) => { setActiveSession(id); setShowSessionMenu(false); }}
          onDelete={deleteSession}
          onCreate={() => { createSession('编程会话'); setShowSessionMenu(false); }}
          onClose={() => setShowSessionMenu(false)}
        />
      )}

      {/* 附件文件 chips */}
      {attachedFiles.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 pt-3 flex flex-wrap gap-2">
          {attachedFiles.map((f, i) => (
            <FileChip key={i} name={f.name} path={f.path} isDir={f.isDir} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}

      {/* 斜杠命令菜单 */}
      {showSlashMenu && (
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-2 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface-raised)] shadow-lg overflow-hidden backdrop-blur-md">
            {SLASH_COMMANDS.filter(c => c.cmd.startsWith(text)).map((c) => (
              <button
                key={c.cmd}
                onClick={() => { setText(c.cmd + ' '); setShowSlashMenu(false); textareaRef.current?.focus(); }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] hover:bg-[var(--accent-soft)] transition text-left"
              >
                <span className="font-mono font-medium text-[var(--text)]">{c.cmd}</span>
                <span className="text-[var(--text-faint)] text-[12px]">{c.desc}</span>
              </button>
            ))}
            <div className="px-4 py-1.5 text-[10px] text-[var(--text-faint)] bg-[var(--coding-surface)] border-t border-[var(--coding-border)] flex items-center gap-3">
              <span><kbd className="px-1 py-0.5 rounded bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] text-[9px]">Up/Down</kbd> navigate</span>
              <span><kbd className="px-1 py-0.5 rounded bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] text-[9px]">Enter</kbd> select</span>
              <span><kbd className="px-1 py-0.5 rounded bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] text-[9px]">Esc</kbd> dismiss</span>
            </div>
          </div>
        </div>
      )}

      {/* 文件浏览器弹窗 */}
      {showFileBrowser && (
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-2 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface-raised)] shadow-lg overflow-hidden max-h-[300px] flex flex-col backdrop-blur-md">
            <div className="px-4 py-2 border-b border-[var(--coding-border)] flex items-center gap-2 text-[12px] text-[var(--text-soft)] bg-[var(--coding-surface)]">
              <Folder size={13} className="text-[var(--accent)]" />
              <span className="font-mono truncate">{fileBrowserPath ? fileBrowserPath.replace(/^\/Users\/[^/]+/, '~') : '~'}</span>
              <button onClick={() => setShowFileBrowser(false)} className="ml-auto p-0.5 rounded hover:bg-[var(--accent-soft)] text-[var(--text-faint)] hover:text-[var(--text-soft)]">
                <X size={12} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {fileBrowserLoading && <div className="p-4 text-center text-[12px] text-[var(--text-faint)]">加载中...</div>}
              {!fileBrowserLoading && fileBrowserEntries.map((entry) => (
                <div key={entry.path} className="flex items-center hover:bg-[var(--accent-soft)] transition">
                  <button
                    onClick={() => selectFile(entry)}
                    className="flex-1 flex items-center gap-2 px-4 py-2 text-[13px] text-left min-w-0"
                  >
                    {entry.is_dir ? (
                      <Folder size={14} className="text-[var(--accent)] shrink-0" />
                    ) : (
                      <FileText size={14} className="text-[var(--text-faint)] shrink-0" />
                    )}
                    <span className="truncate text-[var(--text)]">{entry.name}</span>
                  </button>
                  {entry.is_dir && (
                    <button
                      onClick={() => selectFile(entry, true)}
                      className="px-2 py-1 mr-2 rounded text-[10px] text-[var(--text-faint)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition shrink-0"
                      title="附加此目录"
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-1.5 text-[10px] text-[var(--text-faint)] bg-[var(--coding-surface)] border-t border-[var(--coding-border)] flex items-center gap-3">
              <span>navigate</span>
              <span><kbd className="px-1 py-0.5 rounded bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] text-[9px]">Enter</kbd> attach</span>
              <span><kbd className="px-1 py-0.5 rounded bg-[var(--coding-surface-raised)] border border-[var(--coding-border)] text-[9px]">Esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}

      {/* 主输入区 */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3">
        <div
          className={cn(
            'rounded-2xl border bg-[var(--coding-surface-raised)] transition-all backdrop-blur-sm',
            'border-[var(--coding-border)]/40 focus-within:border-[var(--accent)]/60 focus-within:shadow-[0_0_0_2px_var(--accent-soft)]',
          )}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* 录音状态指示条 */}
          {(recording || transcribing) && (
            <div className="flex items-center gap-2 mx-4 mt-3 mb-1 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              {recording ? (
                <>
                  <span className="voice-pulse w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-xs text-red-600 font-medium">录音中 {recordDuration}s</span>
                  <button onClick={stopRecording} className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium transition">
                    点击停止并识别
                  </button>
                </>
              ) : (
                <>
                  <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                  <span className="text-xs text-[var(--accent)] font-medium">语音识别中...</span>
                </>
              )}
            </div>
          )}

          {/* 粘贴的图片预览 */}
          {images.length > 0 && (
            <div className="flex gap-2 flex-wrap px-4 pt-3">
              {images.map((img, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[var(--coding-border)] group">
                  <img src={img.preview} className="w-full h-full object-cover" alt="" />
                  <button
                    onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-bl"
                  ><X size={10} /></button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; composingEndTsRef.current = Date.now(); }}
            placeholder={isStreaming ? 'Agent is working...' : 'Ask Claude to edit, debug or explain... (Cmd+V paste images)'}
            disabled={isStreaming}
            rows={1}
            className={cn(
              'w-full px-4 pt-3 pb-2 bg-transparent text-[14px] text-[var(--text)] placeholder-[var(--text-faint)]',
              'resize-none outline-none min-h-[40px] max-h-[200px] leading-relaxed',
            )}
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => autoResize(e.target)}
          />

          {/* 工具栏 */}
          <div className="flex items-center gap-1.5 px-3 pb-2.5 flex-wrap">
            <button
              onClick={openFilePicker}
              className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition shrink-0"
              title="附加文件/目录"
            >
              <Plus size={16} />
            </button>

            {/* 图片上传 */}
            <label className="cursor-pointer shrink-0">
              <input
                type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => pickImageFiles(Array.from(e.target.files || []))}
              />
              <span className="inline-flex items-center justify-center p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition">
                <ImagePlus size={16} />
              </span>
            </label>

            {/* 语音输入 */}
            <button
              onClick={(e) => {
                e.preventDefault();
                if (transcribing) return;
                if (recording) stopRecording();
                else startRecording();
              }}
              disabled={transcribing}
              className={cn(
                'p-1.5 rounded-lg transition shrink-0',
                recording
                  ? 'text-red-500 bg-red-50 hover:bg-red-100 animate-pulse'
                  : transcribing
                    ? 'text-[var(--text-faint)] cursor-wait'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
              )}
              title={recording ? '点击停止' : transcribing ? '识别中...' : '语音输入'}
            >
              {transcribing ? <Loader2 size={16} className="animate-spin" /> :
               recording ? <MicOff size={16} /> : <Mic size={16} />}
            </button>

            {/* 模式切换器 */}
            <ModeSwitcher value={codingMode} onChange={setCodingMode} />

            {/* 会话选择器 */}
            <button
              onClick={() => setShowSessionMenu(v => !v)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] transition shrink-0',
                showSessionMenu
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
              )}
              title="会话历史"
            >
              <MessageSquare size={13} />
              <span className="truncate max-w-[80px] font-medium hidden sm:inline">
                {activeSession?.title ? activeSession.title.slice(0, 12) : 'Sessions'}
              </span>
              {showSessionMenu ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
            </button>

            <div className="flex-1 min-w-[8px]" />

            {/* 智能体选择器 */}
            <AgentPicker
              agents={agents}
              activeAgentId={activeAgentId}
              onSelect={(id) => { setActiveAgent(id); setShowAgentMenu(false); }}
              open={showAgentMenu}
              onToggle={() => setShowAgentMenu(v => !v)}
            />

            {/* 模型选择器 */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowModelMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--accent-soft)] transition"
              >
                <span className="font-medium truncate max-w-[120px]">{modelName}</span>
                <ChevronDown size={11} />
              </button>
              {showModelMenu && (
                <div className="absolute bottom-full right-0 mb-1 w-72 rounded-xl border border-[var(--coding-border)]/60 bg-[var(--coding-surface-raised)] shadow-xl z-50 max-h-[300px] overflow-y-auto backdrop-blur-md">
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { activateProfile(p.id); setShowModelMenu(false); }}
                      className={cn(
                        'w-full text-left px-4 py-2.5 text-[13px] hover:bg-[var(--accent-soft)] transition flex items-center gap-2',
                        p.is_active && 'bg-[var(--accent-soft)]'
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full shrink-0', p.is_active ? 'bg-green-500' : 'bg-[var(--coding-border)]')} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[var(--text)] truncate">{p.name}</div>
                        <div className="text-[11px] text-[var(--text-faint)] truncate">{p.model}</div>
                      </div>
                      {p.is_active && <span className="text-[10px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">ACTIVE</span>}
                    </button>
                  ))}
                  {profiles.length === 0 && <div className="px-4 py-3 text-[12px] text-[var(--text-faint)]">暂无接入点</div>}
                </div>
              )}
            </div>

            {/* 发送/停止按钮 */}
            {isStreaming ? (
              <button
                onClick={abort}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-[13px] font-medium transition shrink-0"
              >
                <Square size={13} />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!text.trim() && attachedFiles.length === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-medium transition-all duration-200 shrink-0',
                  text.trim() || attachedFiles.length > 0
                    ? 'bg-gradient-to-r from-[var(--accent)] to-[#b8956e] text-white hover:scale-105 hover:shadow-lg hover:shadow-[var(--accent)]/20 active:scale-95 shadow-md'
                    : 'bg-[var(--coding-surface)] text-[var(--text-faint)] cursor-default'
                )}
              >
                <ArrowRight size={14} />
                <span>Run</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function FileChip({ name, path, isDir, onRemove }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] hover:border-[var(--accent)] transition cursor-default',
        isDir ? 'bg-[var(--accent-soft)] border-[var(--coding-border)] text-[var(--accent)]' : 'bg-[var(--accent-soft)] border-[var(--coding-border)] text-[var(--text-soft)]'
      )}
      title={path}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {isDir ? (
        <Folder size={12} className="text-[var(--accent)] shrink-0" />
      ) : (
        <FileText size={12} className="text-[var(--accent)] shrink-0" />
      )}
      <span className="truncate max-w-[150px]">{name}{isDir ? '/' : ''}</span>
      <button
        onClick={onRemove}
        className={cn(
          'p-0.5 rounded transition',
          hover ? 'text-[var(--text-faint)] hover:text-red-400' : 'text-transparent'
        )}
      >
        <X size={10} />
      </button>
    </div>
  );
}

function AgentPicker({ agents, activeAgentId, onSelect, open, onToggle }) {
  const active = agents.find(a => a.id === activeAgentId);
  const agentName = active?.name || 'Agent';

  const AgentAvatar = ({ agent, size = 20 }) => {
    if (agent?.avatar?.startsWith('/api/')) {
      return <img src={agent.avatar} className="rounded-md object-cover shrink-0" style={{ width: size, height: size }} alt="" />;
    }
    return <Bot size={size - 4} className="text-[var(--accent)]" />;
  };

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--accent-soft)] transition"
      >
        <AgentAvatar agent={active} size={18} />
        <span className="font-medium truncate max-w-[100px]">{agentName}</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-64 rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface-raised)] shadow-xl z-50 max-h-[300px] overflow-y-auto backdrop-blur-md">
          <div className="px-3 py-2 text-[11px] text-[var(--text-faint)] border-b border-[var(--coding-border)]">Choose Agent</div>
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 text-[13px] hover:bg-[var(--accent-soft)] transition flex items-center gap-2.5',
                a.id === activeAgentId && 'bg-[var(--accent-soft)]'
              )}
            >
              <span className="w-7 h-7 rounded-lg bg-[var(--coding-surface)] flex items-center justify-center shrink-0">
                <AgentAvatar agent={a} size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[var(--text)] truncate">{a.name}</div>
                {a.description && (
                  <div className="text-[11px] text-[var(--text-faint)] truncate">{a.description}</div>
                )}
              </div>
              {a.id === activeAgentId && (
                <span className="text-[10px] text-[var(--accent)] font-medium bg-[var(--accent-soft)] px-1.5 py-0.5 rounded shrink-0">Active</span>
              )}
            </button>
          ))}
          {agents.length === 0 && <div className="px-3 py-3 text-[12px] text-[var(--text-faint)] text-center">暂无智能体</div>}
        </div>
      )}
    </div>
  );
}

function SessionHistoryDropdown({ sessions, activeSessionId, onSelect, onDelete, onCreate, onClose }) {
  const [search, setSearch] = useState('');
  const [hoverId, setHoverId] = useState(null);
  const inputRef = useCallback((el) => el?.focus(), []);

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s => (s.title || '').toLowerCase().includes(q));
  }, [sessions, search]);

  const grouped = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const result = { today: [], yesterday: [], older: [] };
    for (const s of filtered) {
      const t = new Date(s.updated_at || s.created_at).getTime();
      if (t >= today) result.today.push(s);
      else if (t >= yesterday) result.yesterday.push(s);
      else result.older.push(s);
    }
    return result;
  }, [filtered]);

  const renderGroup = (label, items) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <div className="px-3 py-1.5 text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wider">{label}</div>
        {items.map(s => (
          <div
            key={s.id}
            className="relative"
            onMouseEnter={() => setHoverId(s.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            <button
              onClick={() => onSelect(s.id)}
              className={cn(
                'w-full text-left px-3 py-2 text-[13px] transition-all flex items-center gap-2',
                s.id === activeSessionId
                  ? 'bg-[var(--accent-soft)] text-[var(--text)] font-medium'
                  : 'text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
              )}
            >
              <span className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                s.id === activeSessionId ? 'bg-[var(--accent)]' : 'bg-transparent'
              )} />
              <span className="truncate flex-1">{s.title || '未命名会话'}</span>
              {hoverId === s.id && s.id !== activeSessionId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  className="p-1 rounded text-[var(--coding-border)] hover:text-red-400 transition shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 max-w-4xl mx-auto px-6">
      <div className="rounded-xl border border-[var(--coding-border)] bg-[var(--coding-surface-raised)] shadow-xl max-h-[340px] flex flex-col overflow-hidden mb-1 backdrop-blur-md">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--coding-border)]">
          <Search size={13} className="text-[var(--text-faint)] shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
            placeholder="搜索会话..."
            className="flex-1 text-[13px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none bg-transparent"
          />
          <button
            onClick={onCreate}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] transition shrink-0"
          >
            <Plus size={12} />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollable">
          {renderGroup('Today', grouped.today)}
          {renderGroup('Yesterday', grouped.yesterday)}
          {renderGroup('Earlier', grouped.older)}
          {filtered.length === 0 && (
            <div className="text-center text-[12px] text-[var(--text-faint)] py-6">暂无会话</div>
          )}
        </div>
      </div>
    </div>
  );
}

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}
