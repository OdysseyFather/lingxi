import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, MessageSquare, User, Bot, Loader2 } from 'lucide-react';
import { useStore } from '../state/useStore';
import { Modal, Badge } from '../ui/primitives';
import { cn } from '../ui/cn';
import { authFetch } from '../api/client';

export function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await authFetch(`/api/messages/search?q=${encodeURIComponent(q.trim())}`);
      const data = await r.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const handleInput = useCallback((val) => {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  }, [doSearch]);

  const handleSelect = useCallback((result) => {
    setActiveSession(result.session_id);
    onClose();
  }, [setActiveSession, onClose]);

  function highlight(text, q) {
    if (!q || !text) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text.slice(0, 200);
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + q.length + 80);
    const before = text.slice(start, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length, end);
    return (
      <>
        {start > 0 && '…'}{before}<mark className="bg-[color:var(--accent-soft)] text-[color:var(--accent)] rounded px-0.5">{match}</mark>{after}{end < text.length && '…'}
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="" width={600}>
      <div className="-mt-3">
        <div className="flex items-center gap-2 border-b border-[color:var(--line)] pb-3 mb-3">
          <Search size={18} className="text-[color:var(--text-faint)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="搜索所有对话中的消息…"
            className="flex-1 bg-transparent text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] outline-none text-sm"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); }} className="text-[color:var(--text-faint)] hover:text-[color:var(--text)]">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto scrollable">
          {loading && (
            <div className="py-8 text-center text-[color:var(--text-faint)]">
              <Loader2 size={18} className="animate-spin mx-auto mb-2" />搜索中...
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <div className="py-8 text-center text-[color:var(--text-faint)] text-sm">未找到相关消息</div>
          )}
          {!loading && results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[color:var(--bg-soft)] transition flex gap-3 items-start"
            >
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                r.role === 'user' ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]' : 'bg-emerald-500/10 text-emerald-500'
              )}>
                {r.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium">{r.session_title || '未命名对话'}</span>
                  <Badge tone={r.role === 'user' ? 'accent' : 'success'}>{r.role === 'user' ? '用户' : '助理'}</Badge>
                  <span className="text-[11px] text-[color:var(--text-faint)] ml-auto shrink-0">
                    {new Date(r.created_at).toLocaleDateString('zh-CN')}
                  </span>
                </div>
                <div className="text-xs text-[color:var(--text-soft)] line-clamp-2 leading-relaxed">
                  {highlight(r.content, query)}
                </div>
              </div>
            </button>
          ))}
          {!loading && !query && (
            <div className="py-8 text-center text-[color:var(--text-faint)] text-sm">
              <Search size={24} className="mx-auto mb-2 opacity-40" />
              输入关键词搜索所有对话
              <div className="text-xs mt-1">⌘K 打开搜索</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
