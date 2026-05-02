import { useEffect, useRef, useState } from 'react';
import { Send, ImagePlus, BookOpen, Square, Cpu, Coins } from 'lucide-react';
import { useStore } from '../state/useStore';
import { Button, Tooltip } from '../ui/primitives';
import { formatNum } from './blocks';

export function Composer() {
  const sendMessage = useStore((s) => s.sendMessage);
  const abort = useStore((s) => s.abort);
  const isStreaming = useStore((s) => s.isStreaming);
  const messages = useStore((s) => s.messages);

  const [text, setText] = useState('');
  const [useKB, setUseKB] = useState(false);
  const [images, setImages] = useState([]); // [{ mediaType, data, preview }]
  const taRef = useRef(null);
  // IME 组合状态：onCompositionStart=true，onCompositionEnd=false
  // 单独 ref 跟踪是为了规避 React isComposing 在某些 IME（搜狗/微软拼音）下不可靠
  const composingRef = useRef(false);
  // composition 刚结束的瞬间一些 IME 仍会把 Enter 当作选词确认而非提交，留 50ms 缓冲
  const composingEndTsRef = useRef(0);

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
    } catch {}
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
    if (e.key !== 'Enter' || e.shiftKey) return;
    // 1. React 合成事件的 isComposing
    // 2. 原生事件的 isComposing（部分 IME 仅在原生事件上设置）
    // 3. keyCode === 229（IME 处理中的标准信号）
    // 4. 组件自跟踪的 composingRef
    // 5. composition 结束后 50ms 内的 Enter 仍视为输入法确认
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

  const onPickFiles = async (files) => {
    const arr = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const buf = await f.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      arr.push({ mediaType: f.type, data: b64, preview: URL.createObjectURL(f) });
    }
    setImages((x) => [...x, ...arr].slice(0, 6));
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f) files.push(f);
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

        <div className="composer p-3">
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
            placeholder="输入消息，Shift+Enter 换行"
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
