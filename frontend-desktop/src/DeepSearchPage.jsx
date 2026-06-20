import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search, X, Globe, ExternalLink, Loader2, CheckCircle2,
  Sparkles, FileText, AlertCircle, BookOpen,
} from 'lucide-react';
import { Button, Card, Input, Modal } from './ui/primitives';
import { cn } from './ui/cn';

const SOURCE_META = {
  duckduckgo: { label: 'DuckDuckGo', icon: '🦆', color: 'text-orange-500' },
  wikipedia: { label: '维基百科', icon: '📖', color: 'text-blue-500' },
};

/**
 * 深度联网搜索页面
 *
 * 流程：
 * 1. 用户输入查询
 * 2. 后端 SSE 推送进度（source_start/done, fetch_start/done, synthesizing, delta, sources, done）
 * 3. 前端实时显示搜索源、抓取进度、综合答案 + 引用
 */
export default function DeepSearchPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [sources, setSources] = useState([]);
  const [progress, setProgress] = useState([]);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;

    setSearching(true);
    setSources([]);
    setProgress([]);
    setAnswer('');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/search/deep', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, max_sources: 5 }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error('搜索请求失败');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 协议: event: <name>\ndata: <json>\n\n
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let event = '';
          let dataStr = '';
          for (const l of lines) {
            if (l.startsWith('event: ')) event = l.slice(7).trim();
            else if (l.startsWith('data: ')) dataStr += l.slice(6);
          }
          if (!event || !dataStr) continue;

          let data;
          try { data = JSON.parse(dataStr); } catch { continue; }

          handleEvent(event, data);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message || '搜索失败');
      }
    } finally {
      setSearching(false);
      abortRef.current = null;
    }
  };

  const handleEvent = (event, data) => {
    switch (event) {
      case 'source_start':
        setProgress((p) => [...p, { type: 'source_start', ...data }]);
        break;
      case 'source_done':
        setProgress((p) => [...p, { type: 'source_done', ...data }]);
        break;
      case 'fetch_start':
        setProgress((p) => [...p, { type: 'fetch_start', ...data }]);
        break;
      case 'fetch_done':
        setProgress((p) => [...p, { type: 'fetch_done', ...data }]);
        break;
      case 'sources':
        setSources(data || []);
        break;
      case 'synthesizing':
        setProgress((p) => [...p, { type: 'synthesizing' }]);
        break;
      case 'delta':
        if (data.text) setAnswer((a) => a + data.text);
        break;
      case 'error':
        setError(data.message || '未知错误');
        break;
      case 'done':
        setProgress((p) => [...p, { type: 'done', ...data }]);
        break;
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setSearching(false);
  };

  return (
    <div className="h-full flex flex-col bg-[color:var(--bg)]">
      <Header />
      <SearchBar query={query} setQuery={setQuery} searching={searching} onSearch={handleSearch} onAbort={handleAbort} />
      <div className="flex-1 overflow-y-auto scrollable">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {!searching && !answer && progress.length === 0 && !error && <EmptyHint onPick={(q) => { setQuery(q); }} />}
          {error && <ErrorCard message={error} />}
          {progress.length > 0 && <ProgressTimeline progress={progress} sources={sources} />}
          {sources.length > 0 && <SourcesCard sources={sources} />}
          {answer && <AnswerCard answer={answer} sources={sources} />}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="px-6 pt-6 pb-3">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <Globe size={22} className="text-[color:var(--accent)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">深度联网搜索</h1>
            <p className="text-xs text-[color:var(--text-faint)] mt-0.5">
              多源并行检索 · 内容深度提取 · LLM 综合推理 · 引用可追溯
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchBar({ query, setQuery, searching, onSearch, onAbort }) {
  return (
    <div className="px-6 py-3 border-b border-[color:var(--line)]">
      <div className="max-w-3xl mx-auto flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)] pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder="输入要研究的问题，例如：量子计算的最新进展？"
            className="w-full pl-11 pr-4 py-3 rounded-full bg-[color:var(--bg-soft)] border border-[color:var(--line)]
              text-[color:var(--text)] placeholder:text-[color:var(--text-faint)]
              focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30 focus:border-[color:var(--accent)]"
            disabled={searching}
          />
        </div>
        {searching ? (
          <Button variant="outline" onClick={onAbort} className="shrink-0">
            <X size={14} className="mr-1" />停止
          </Button>
        ) : (
          <Button onClick={onSearch} disabled={!query.trim()} className="shrink-0">
            <Sparkles size={14} className="mr-1" />深度搜索
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyHint({ onPick }) {
  const EXAMPLES = [
    '量子计算的最新进展',
    '2026 年 AI 大模型领域有哪些突破？',
    '什么是 RAG 检索增强生成？',
    '介绍一下 React 19 的并发渲染',
  ];
  return (
    <div className="py-10 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center">
        <Globe size={32} className="text-[color:var(--accent)]/60" />
      </div>
      <h2 className="text-xl font-semibold text-[color:var(--text)] mb-2">让灵犀帮你查清楚</h2>
      <p className="text-sm text-[color:var(--text-soft)] mb-6">
        灵犀会同时查询多个搜索源，提取每个网页的正文，再综合推理得出可信答案
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-xl mx-auto">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="px-4 py-2 rounded-full border border-[color:var(--line)] bg-[color:var(--bg-soft)]
              text-sm text-[color:var(--text-soft)] hover:text-[color:var(--accent)] hover:border-[color:var(--accent)]
              hover:bg-[color:var(--accent-soft)] transition"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ message }) {
  return (
    <Card className="p-4 bg-red-500/5 border-red-500/20">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium text-red-600 dark:text-red-400">搜索失败</div>
          <p className="text-xs text-[color:var(--text-soft)] mt-1">{message}</p>
        </div>
      </div>
    </Card>
  );
}

function ProgressTimeline({ progress, sources }) {
  // 聚合同源进度
  const sourceProgress = {};
  for (const p of progress) {
    if (p.type === 'source_start') {
      sourceProgress[p.source] = { state: 'searching', count: 0 };
    } else if (p.type === 'source_done') {
      sourceProgress[p.source] = { state: 'done', count: p.count };
    }
  }

  const fetchByID = {};
  for (const p of progress) {
    if (p.type === 'fetch_start') {
      fetchByID[p.id] = { state: 'fetching', title: p.title, url: p.url };
    } else if (p.type === 'fetch_done') {
      if (fetchByID[p.id]) fetchByID[p.id].state = 'done';
      if (fetchByID[p.id]) fetchByID[p.id].chars = p.chars;
    }
  }

  const isSynthesizing = progress.some((p) => p.type === 'synthesizing');
  const isDone = progress.some((p) => p.type === 'done');

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 size={14} className={cn('text-[color:var(--accent)]', !isDone && 'animate-spin')} />
        <span className="text-sm font-medium">{isDone ? '搜索完成' : '正在研究...'}</span>
      </div>

      <div className="space-y-2.5">
        {Object.entries(sourceProgress).map(([source, info]) => {
          const meta = SOURCE_META[source] || { label: source, icon: '🌐' };
          return (
            <div key={source} className="flex items-center gap-3 text-xs">
              <span className="text-base">{meta.icon}</span>
              <span className="font-medium text-[color:var(--text)]">{meta.label}</span>
              <div className="flex-1 h-px bg-[color:var(--line)]" />
              {info.state === 'searching' ? (
                <Loader2 size={12} className="animate-spin text-[color:var(--accent)]" />
              ) : (
                <span className="text-[color:var(--text-faint)] flex items-center gap-1">
                  <CheckCircle2 size={11} className="text-emerald-500" />
                  {info.count} 条结果
                </span>
              )}
            </div>
          );
        })}

        {Object.values(fetchByID).length > 0 && (
          <div className="pt-2 border-t border-[color:var(--line)] mt-2 space-y-1.5">
            {Object.values(fetchByID).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                {f.state === 'fetching' ? (
                  <Loader2 size={10} className="animate-spin text-[color:var(--accent)]" />
                ) : (
                  <CheckCircle2 size={10} className="text-emerald-500" />
                )}
                <span className="truncate flex-1 text-[color:var(--text-soft)]">{f.title}</span>
                {f.chars != null && (
                  <span className="text-[color:var(--text-faint)] tabular-nums shrink-0">{f.chars} 字</span>
                )}
              </div>
            ))}
          </div>
        )}

        {isSynthesizing && !isDone && (
          <div className="pt-2 border-t border-[color:var(--line)] mt-2 flex items-center gap-2 text-xs text-[color:var(--accent)]">
            <Sparkles size={12} className="animate-pulse" />
            正在综合多源信息生成答案...
          </div>
        )}
      </div>
    </Card>
  );
}

function SourcesCard({ sources }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={14} className="text-[color:var(--text-faint)]" />
        <span className="text-sm font-medium">参考来源 ({sources.length})</span>
      </div>
      <div className="space-y-2">
        {sources.map((s) => {
          const meta = SOURCE_META[s.source] || { label: s.source, icon: '🌐' };
          return (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-xl bg-[color:var(--bg-soft)]/40 hover:bg-[color:var(--bg-soft)] transition group"
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[color:var(--accent)] text-white text-[11px] font-bold shrink-0">
                {s.id}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-[color:var(--text)] line-clamp-1 group-hover:text-[color:var(--accent)] transition">
                    {s.title}
                  </span>
                  <ExternalLink size={11} className="text-[color:var(--text-faint)] opacity-0 group-hover:opacity-100 transition shrink-0" />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[color:var(--text-faint)]">
                  <span>{meta.icon} {meta.label}</span>
                  <span>·</span>
                  <span className="truncate">{new URL(s.url).hostname}</span>
                </div>
                {s.snippet && (
                  <p className="text-xs text-[color:var(--text-soft)] mt-1.5 line-clamp-2">{s.snippet}</p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </Card>
  );
}

function AnswerCard({ answer, sources }) {
  // 解析引用 [1] [2] 高亮
  const sourceMap = Object.fromEntries(sources.map((s) => [String(s.id), s]));

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-[color:var(--accent)]" />
        <span className="text-sm font-medium">综合答案</span>
      </div>
      <div className="prose-chat text-[15px] text-[color:var(--text)] leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-3 last:mb-0">{renderWithCitations(children, sourceMap)}</p>,
            li: ({ children }) => <li>{renderWithCitations(children, sourceMap)}</li>,
            h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-bold mt-4 mb-2">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-2">{children}</h3>,
            code: ({ inline, children }) => inline ? (
              <code className="px-1 py-0.5 rounded bg-[color:var(--bg-soft)] text-[13px] font-mono">{children}</code>
            ) : (
              <pre className="bg-[color:var(--bg-soft)] rounded-lg p-3 overflow-x-auto text-[13px]"><code>{children}</code></pre>
            ),
          }}
        >
          {answer}
        </ReactMarkdown>
      </div>
    </Card>
  );
}

function renderWithCitations(children, sourceMap) {
  if (typeof children === 'string') {
    return splitCitations(children, sourceMap);
  }
  if (Array.isArray(children)) {
    return children.map((c, i) => typeof c === 'string'
      ? <span key={i}>{splitCitations(c, sourceMap)}</span>
      : <span key={i}>{c}</span>
    );
  }
  return children;
}

function splitCitations(text, sourceMap) {
  const re = /\[(\d+)\]/g;
  const parts = [];
  let lastIdx = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const id = match[1];
    const source = sourceMap[id];
    if (source) {
      parts.push(
        <a
          key={`${id}-${match.index}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.title}
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 mx-0.5 rounded text-[10px] font-bold align-super
            bg-[color:var(--accent-soft)] text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-white transition"
        >
          {id}
        </a>
      );
    } else {
      parts.push(<sup key={`${id}-${match.index}`}>[{id}]</sup>);
    }
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}
