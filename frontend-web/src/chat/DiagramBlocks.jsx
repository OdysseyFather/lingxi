import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, Code2, Eye, ZoomIn, X } from 'lucide-react';
import pako from 'pako';
import { cn } from '../ui/cn';

let _mermaidPromise = null;
let _mermaidIdCounter = 0;

// 懒加载 mermaid，避免首屏 bundle 增大
function getMermaid() {
  if (_mermaidPromise) return _mermaidPromise;
  _mermaidPromise = import('mermaid').then((mod) => {
    const mermaid = mod.default || mod;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'inherit',
      flowchart: { htmlLabels: true, curve: 'basis' },
      sequence: { useMaxWidth: true },
    });
    return mermaid;
  });
  return _mermaidPromise;
}

export function MermaidBlock({ code }) {
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState('');
  const [showSrc, setShowSrc] = useState(false);
  const [zoom, setZoom] = useState(false);
  const idRef = useRef(`mmd-${++_mermaidIdCounter}-${Date.now()}`);

  useEffect(() => {
    let cancelled = false;
    setErr('');
    setSvg('');
    if (!code || !code.trim()) return;
    getMermaid()
      .then((mermaid) => mermaid.render(idRef.current, code))
      .then((res) => {
        if (cancelled) return;
        setSvg(res.svg || '');
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e?.message || String(e));
      });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="my-3 not-prose">
      <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-soft)] overflow-hidden">
        <div className="px-3 py-1.5 border-b border-[color:var(--line)] flex items-center gap-2 text-xs">
          <span className="font-mono text-[color:var(--text-faint)]">mermaid</span>
          {err && <AlertCircle size={12} className="text-red-500" />}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShowSrc((v) => !v)}
              className="px-2 py-0.5 rounded hover:bg-[color:var(--bg-elev)] text-[color:var(--text-faint)] inline-flex items-center gap-1"
              title="切换源码/图形"
            >
              {showSrc ? <Eye size={11} /> : <Code2 size={11} />}
              {showSrc ? '看图' : '源码'}
            </button>
            {svg && (
              <button
                onClick={() => setZoom(true)}
                className="px-2 py-0.5 rounded hover:bg-[color:var(--bg-elev)] text-[color:var(--text-faint)] inline-flex items-center gap-1"
                title="放大查看"
              >
                <ZoomIn size={11} /> 放大
              </button>
            )}
          </div>
        </div>
        <div className={cn('p-4 flex items-center justify-center min-h-[80px] overflow-auto')}>
          {showSrc ? (
            <pre className="text-xs font-mono text-[color:var(--text-soft)] whitespace-pre-wrap w-full">{code}</pre>
          ) : err ? (
            <div className="text-xs text-red-500 flex items-center gap-2">
              <AlertCircle size={14} />
              <div>
                <div className="font-medium">Mermaid 渲染失败</div>
                <div className="text-[color:var(--text-faint)] mt-0.5">{err}</div>
              </div>
            </div>
          ) : !svg ? (
            <div className="text-xs text-[color:var(--text-faint)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> 渲染中…
            </div>
          ) : (
            <div className="mermaid-svg-wrap w-full text-center [&_svg]:max-w-full [&_svg]:inline-block" dangerouslySetInnerHTML={{ __html: svg }} />
          )}
        </div>
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-6"
          onClick={() => setZoom(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => setZoom(false)}
          >
            <X size={18} />
          </button>
          <div
            className="bg-white rounded-xl p-6 max-w-[95vw] max-h-[90vh] overflow-auto [&_svg]:max-w-none"
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </div>
  );
}

// PlantUML 编码：deflate + 自定义 base64 字母表（kroki / plantuml.com 通用）
function plantumlEncode(text) {
  const data = new TextEncoder().encode(text);
  const compressed = pako.deflateRaw(data, { level: 9 });
  return encode64(compressed);
}

const PLANTUML_B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
function encode64(bytes) {
  let r = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i] || 0;
    const b2 = bytes[i + 1] || 0;
    const b3 = bytes[i + 2] || 0;
    r += PLANTUML_B64[(b1 >> 2) & 0x3f];
    r += PLANTUML_B64[((b1 << 4) | (b2 >> 4)) & 0x3f];
    r += PLANTUML_B64[((b2 << 2) | (b3 >> 6)) & 0x3f];
    r += PLANTUML_B64[b3 & 0x3f];
  }
  return r;
}

export function PlantUMLBlock({ code }) {
  const [showSrc, setShowSrc] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [zoom, setZoom] = useState(false);

  const url = useMemo(() => {
    try {
      const encoded = plantumlEncode(code);
      return `https://kroki.io/plantuml/svg/${encoded}`;
    } catch {
      return '';
    }
  }, [code]);

  return (
    <div className="my-3 not-prose">
      <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-soft)] overflow-hidden">
        <div className="px-3 py-1.5 border-b border-[color:var(--line)] flex items-center gap-2 text-xs">
          <span className="font-mono text-[color:var(--text-faint)]">plantuml</span>
          {imgErr && <AlertCircle size={12} className="text-red-500" />}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShowSrc((v) => !v)}
              className="px-2 py-0.5 rounded hover:bg-[color:var(--bg-elev)] text-[color:var(--text-faint)] inline-flex items-center gap-1"
            >
              {showSrc ? <Eye size={11} /> : <Code2 size={11} />}
              {showSrc ? '看图' : '源码'}
            </button>
            {!imgErr && url && (
              <button
                onClick={() => setZoom(true)}
                className="px-2 py-0.5 rounded hover:bg-[color:var(--bg-elev)] text-[color:var(--text-faint)] inline-flex items-center gap-1"
              >
                <ZoomIn size={11} /> 放大
              </button>
            )}
          </div>
        </div>
        <div className="p-4 flex items-center justify-center min-h-[80px] overflow-auto bg-white dark:bg-white/95">
          {showSrc ? (
            <pre className="text-xs font-mono text-[color:var(--text-soft)] whitespace-pre-wrap w-full bg-[color:var(--bg-soft)] p-3 rounded">{code}</pre>
          ) : imgErr || !url ? (
            <div className="text-xs text-red-500 flex items-center gap-2">
              <AlertCircle size={14} />
              <div>
                <div className="font-medium">PlantUML 渲染失败</div>
                <div className="text-[color:var(--text-faint)] mt-0.5">无法连接 kroki.io，已切换为源码</div>
              </div>
            </div>
          ) : (
            <img
              src={url}
              alt="PlantUML diagram"
              className="max-w-full"
              onError={() => setImgErr(true)}
            />
          )}
        </div>
      </div>
      {zoom && url && !imgErr && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-6"
          onClick={() => setZoom(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => setZoom(false)}
          >
            <X size={18} />
          </button>
          <img src={url} alt="PlantUML diagram" className="max-w-[95vw] max-h-[90vh] bg-white p-3 rounded-xl" />
        </div>
      )}
    </div>
  );
}
