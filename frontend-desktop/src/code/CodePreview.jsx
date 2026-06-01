import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import {
  X, FileCode2, Copy, Check, ArrowUpRight, Save, Loader2,
  Search, ChevronDown,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { api } from '../api/client';

const EXT_LANG = {
  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
  go: 'go', py: 'python', rs: 'rust', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'json',
  md: 'markdown', html: 'html', css: 'css', scss: 'css',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql', xml: 'markup', svg: 'markup',
  rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
};

function detectLang(filePath) {
  const ext = filePath?.split('.').pop()?.toLowerCase();
  return EXT_LANG[ext] || 'plain';
}

export function CodePreview({
  filePath, content, loading, onClose, onInsertToChat, onContentChange,
  openFiles = [], activeFile, onSelectFile, onCloseFile, embedded
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState(-1);
  const textareaRef = useRef(null);
  const searchInputRef = useRef(null);
  const codeContainerRef = useRef(null);

  const lang = useMemo(() => detectLang(filePath), [filePath]);
  const fileName = filePath?.split('/').pop() || '';
  const shortPath = filePath?.replace(/^\/Users\/[^/]+/, '~') || '';
  const currentContent = editing ? editContent : (content || '');
  const lines = currentContent.split('\n');
  const hasMultipleFiles = openFiles.length > 1;

  useEffect(() => {
    setEditing(false);
    setSaved(false);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [filePath]);

  // Cmd+F search handler
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch]);

  // Search logic
  useEffect(() => {
    if (!searchQuery) { setSearchResults([]); setActiveSearchIdx(-1); return; }
    const results = [];
    const searchLower = searchQuery.toLowerCase();
    lines.forEach((line, idx) => {
      let pos = 0;
      const lower = line.toLowerCase();
      while ((pos = lower.indexOf(searchLower, pos)) !== -1) {
        results.push({ line: idx, col: pos });
        pos += searchLower.length;
      }
    });
    setSearchResults(results);
    setActiveSearchIdx(results.length > 0 ? 0 : -1);
  }, [searchQuery, currentContent]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentContent]);

  const handleInsert = useCallback(() => {
    if (onInsertToChat) {
      onInsertToChat(`\`${filePath}\`:\n\`\`\`${lang}\n${currentContent.slice(0, 2000)}\n\`\`\`\n`);
    }
  }, [currentContent, filePath, lang, onInsertToChat]);

  const handleStartEdit = useCallback(() => {
    setEditContent(content || '');
    setEditing(true);
    setSaved(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [content]);

  const handleSave = useCallback(async () => {
    if (!filePath || saving) return;
    setSaving(true);
    try {
      await api.writeFile(filePath, editContent);
      setSaved(true);
      if (onContentChange) onContentChange(editContent);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSaving(false);
  }, [filePath, editContent, saving, onContentChange]);

  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
      return;
    }
    // Tab indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      if (e.shiftKey) {
        // Outdent: remove leading spaces/tab on current line
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const lineText = val.substring(lineStart, end);
        if (lineText.startsWith('  ')) {
          const newVal = val.substring(0, lineStart) + lineText.substring(2);
          setEditContent(newVal);
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = Math.max(start - 2, lineStart); }, 0);
        }
      } else {
        const newVal = val.substring(0, start) + '  ' + val.substring(end);
        setEditContent(newVal);
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
      }
    }
  }, [handleSave]);

  return (
    <div className="flex flex-col bg-[var(--coding-surface-raised)] h-full">
      {/* Multi-file tabs */}
      {hasMultipleFiles && (
        <div className="flex items-center gap-0 border-b border-[var(--coding-border)] bg-[var(--coding-surface)] overflow-x-auto scrollable shrink-0">
          {openFiles.map((f) => {
            const fName = f.split('/').pop();
            const isActive = f === (activeFile || filePath);
            return (
              <div
                key={f}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[12px] border-r border-[var(--coding-border)] cursor-pointer transition-all group shrink-0',
                  isActive ? 'bg-[var(--coding-surface-raised)] text-[var(--text)] font-medium' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)]'
                )}
                onClick={() => onSelectFile?.(f)}
              >
                <FileCode2 size={11} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'} />
                <span className="truncate max-w-[120px]">{fName}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onCloseFile?.(f); }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--coding-border)] transition"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="h-10 flex items-center gap-2 px-4 border-b border-[var(--coding-border)] bg-[var(--coding-surface)] shrink-0">
        <FileCode2 size={14} className="text-[var(--accent)] shrink-0" />
        <span className="text-[13px] font-medium text-[var(--text)] truncate">{fileName}</span>
        <span className="text-[11px] text-[var(--text-faint)] font-mono truncate" title={filePath}>{shortPath}</span>
        <div className="flex-1" />
        <span className="text-[10px] text-[var(--text-faint)] font-mono">{lines.length} lines</span>

        <button
          onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
          className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition"
          title="Search (⌘F)"
        >
          <Search size={13} />
        </button>

        {!editing ? (
          <button
            onClick={handleStartEdit}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--accent-soft)] transition"
          >
            Edit
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition',
              saved ? 'text-green-600 bg-green-50' : 'text-[var(--accent)] hover:bg-[var(--accent-soft)]'
            )}
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} /> : <Save size={11} />}
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
        )}

        <button
          onClick={handleInsert}
          className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition"
          title="Insert to chat"
        >
          <ArrowUpRight size={13} />
        </button>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition"
          title="Copy"
        >
          {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-soft)] transition"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="h-9 flex items-center gap-2 px-4 border-b border-[var(--coding-border)] bg-[var(--coding-surface)] shrink-0">
          <Search size={12} className="text-[var(--text-faint)] shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in file..."
            className="flex-1 bg-transparent text-[13px] text-[var(--text)] placeholder-[var(--text-faint)] outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults.length > 0) {
                const next = (activeSearchIdx + (e.shiftKey ? -1 : 1) + searchResults.length) % searchResults.length;
                setActiveSearchIdx(next);
              }
              if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); }
            }}
          />
          {searchResults.length > 0 && (
            <span className="text-[11px] text-[var(--text-faint)]">
              {activeSearchIdx + 1}/{searchResults.length}
            </span>
          )}
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
            className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-soft)] transition"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Code area */}
      <div ref={codeContainerRef} className="flex-1 overflow-auto scrollable min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-[var(--coding-border)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : editing ? (
          <div className="flex h-full">
            <div className="py-4 pr-2 select-none shrink-0">
              {editContent.split('\n').map((_, i) => (
                <div key={i} className="text-right text-[11px] text-[var(--text-faint)] font-mono leading-5 px-3" style={{ minWidth: 48 }}>
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 py-4 text-[13px] leading-5 font-mono text-[var(--text)] bg-transparent outline-none resize-none"
              spellCheck={false}
            />
          </div>
        ) : lang !== 'plain' ? (
          <Highlight theme={themes.github} code={content || ''} language={lang}>
            {({ tokens, getLineProps, getTokenProps }) => (
              <pre className="p-4 text-[13px] leading-5 font-mono">
                {tokens.map((line, i) => {
                  const isHighlighted = searchResults.some(r => r.line === i);
                  const isActive = searchResults[activeSearchIdx]?.line === i;
                  return (
                    <div
                      key={i}
                      {...getLineProps({ line })}
                      className={cn(
                        'flex transition-colors',
                        isActive ? 'bg-amber-100/50' : isHighlighted ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]'
                      )}
                    >
                      <span className="inline-block w-10 text-right mr-4 text-[var(--text-faint)] select-none text-[11px] shrink-0 leading-5">
                        {i + 1}
                      </span>
                      <span className="flex-1">
                        {line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}
                      </span>
                    </div>
                  );
                })}
              </pre>
            )}
          </Highlight>
        ) : (
          <pre className="p-4 text-[13px] leading-5 font-mono text-[var(--text)]">
            {lines.map((line, i) => {
              const isHighlighted = searchResults.some(r => r.line === i);
              const isActive = searchResults[activeSearchIdx]?.line === i;
              return (
                <div
                  key={i}
                  className={cn(
                    'flex transition-colors',
                    isActive ? 'bg-amber-100/50' : isHighlighted ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]'
                  )}
                >
                  <span className="inline-block w-10 text-right mr-4 text-[var(--text-faint)] select-none text-[11px] shrink-0 leading-5">
                    {i + 1}
                  </span>
                  <span className="flex-1">{line}</span>
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}
