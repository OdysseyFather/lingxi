import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { X, Plus, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../ui/cn';

function createTerminalInstance(cwd) {
  const port = window.location.port || '3001';
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname || 'localhost';
  const url = `${protocol}://${host}:${port}/api/terminal/ws?cwd=${encodeURIComponent(cwd || '')}`;

  return {
    id: Date.now(),
    title: cwd ? cwd.split('/').pop() : 'Terminal',
    ws: null,
    xterm: null,
    fitAddon: null,
    url,
    cwd,
  };
}

export function TerminalPanel({ projectPath, onClose }) {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [maximized, setMaximized] = useState(false);
  const containerRef = useRef(null);
  const termRefs = useRef({});

  const addTab = useCallback(() => {
    const inst = createTerminalInstance(projectPath);
    setTabs(prev => [...prev, inst]);
    setActiveTab(inst.id);
  }, [projectPath]);

  useEffect(() => {
    if (tabs.length === 0) {
      addTab();
    }
  }, []);

  const removeTab = useCallback((id) => {
    const ref = termRefs.current[id];
    if (ref) {
      ref.ws?.close();
      ref.xterm?.dispose();
      delete termRefs.current[id];
    }
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTab === id && next.length > 0) {
        setActiveTab(next[next.length - 1].id);
      }
      if (next.length === 0 && onClose) {
        onClose();
      }
      return next;
    });
  }, [activeTab, onClose]);

  return (
    <div className={cn(
      'flex flex-col bg-[#1e1e1e] border-t border-[var(--coding-border)]',
      maximized ? 'fixed inset-0 z-50' : 'h-[280px]'
    )}>
      {/* Tab 栏 */}
      <div className="h-8 flex items-center bg-[#252526] border-b border-[#3c3c3c] shrink-0 select-none">
        <div className="flex-1 flex items-center overflow-x-auto gap-0">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={cn(
                'flex items-center gap-1.5 px-3 h-full text-[12px] cursor-pointer border-r border-[#3c3c3c] shrink-0 group',
                tab.id === activeTab
                  ? 'bg-[#1e1e1e] text-[#cccccc]'
                  : 'text-[#969696] hover:text-[#cccccc]'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="truncate max-w-[120px]">{tab.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#3c3c3c] transition"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button onClick={addTab} className="p-1 rounded hover:bg-[#3c3c3c] text-[#969696] hover:text-[#cccccc] transition" title="New Terminal">
            <Plus size={13} />
          </button>
          <button onClick={() => setMaximized(v => !v)} className="p-1 rounded hover:bg-[#3c3c3c] text-[#969696] hover:text-[#cccccc] transition" title={maximized ? '还原' : '最大化'}>
            {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-[#3c3c3c] text-[#969696] hover:text-[#cccccc] transition" title="关闭终端">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 终端内容 */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
          <TerminalInstance
            key={tab.id}
            tab={tab}
            active={tab.id === activeTab}
            containerRef={containerRef}
            termRefs={termRefs}
          />
        ))}
      </div>
    </div>
  );
}

function TerminalInstance({ tab, active, containerRef, termRefs }) {
  const termElRef = useRef(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current || !termElRef.current) return;
    initRef.current = true;

    const xterm = new XTerminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.3,
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#d7ba7d',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#d7ba7d',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());

    xterm.open(termElRef.current);

    setTimeout(() => {
      try { fitAddon.fit(); } catch {}
    }, 50);

    const ws = new WebSocket(tab.url);

    ws.onopen = () => {
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'output' && msg.data) {
          xterm.write(msg.data);
        } else if (msg.error) {
          xterm.write(`\r\n\x1b[31m${msg.error}\x1b[0m\r\n`);
        }
      } catch {}
    };

    ws.onclose = () => {
      xterm.write('\r\n\x1b[90m[Terminal disconnected]\x1b[0m\r\n');
    };

    xterm.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      } catch {}
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    termRefs.current[tab.id] = { ws, xterm, fitAddon };

    return () => {
      resizeObserver.disconnect();
      ws.close();
      xterm.dispose();
      delete termRefs.current[tab.id];
    };
  }, [tab.id, tab.url]);

  useEffect(() => {
    if (active) {
      const ref = termRefs.current[tab.id];
      if (ref?.xterm) {
        ref.xterm.focus();
        try { ref.fitAddon?.fit(); } catch {}
      }
    }
  }, [active, tab.id]);

  return (
    <div
      ref={termElRef}
      className={cn(
        'absolute inset-0 p-1',
        active ? 'visible' : 'invisible'
      )}
    />
  );
}
