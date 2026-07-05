import { useState, useEffect, useCallback } from 'react';
import { Settings2, Globe, MessageSquare, Brain, Bell, Keyboard, ZoomIn, Wifi, Clock } from 'lucide-react';
import { Card, Button } from '../ui/primitives';
import { cn } from '../ui/cn';

const LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

const REPLY_LANGUAGES = [
  { value: 'zh', label: '中文 (Chinese)' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: '自动（跟随用户语言）' },
];

const SEND_MODES = [
  { value: 'enter', label: 'Enter 发送', desc: 'Shift+Enter 换行。' },
  { value: 'ctrl_enter', label: 'Ctrl/Cmd+Enter 发送', desc: 'Enter 和 Shift+Enter 都会换行。' },
];

const PROXY_MODES = [
  { value: 'system', label: '系统代理', desc: '使用应用进程继承到的代理设置。' },
  { value: 'manual', label: '手动代理', desc: '使用下方填写的 HTTP 或 HTTPS 代理地址。' },
];

const ZOOM_OPTIONS = [50, 75, 80, 90, 100, 104, 110, 125, 150, 175, 200];

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });

  const set = useCallback((v) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);

  return [value, set];
}

function SectionTitle({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className="p-2 rounded-lg bg-[color:var(--accent-soft)]">
        <Icon size={16} className="text-[color:var(--accent)]" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[color:var(--text)]">{title}</h3>
        {desc && <p className="text-xs text-[color:var(--text-soft)] mt-0.5">{desc}</p>}
      </div>
    </div>
  );
}

function SelectField({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-10 h-5 rounded-full transition-colors duration-200',
          checked ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--line)]'
        )}
      >
        <span className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
          checked && 'translate-x-5'
        )} />
      </button>
      <span className="text-sm text-[color:var(--text)]">{label}</span>
    </label>
  );
}

export function GeneralPage() {
  const [locale, setLocale] = useLocalStorage('lingxi_locale', 'zh');
  const [replyLang, setReplyLang] = useLocalStorage('lingxi_reply_lang', 'zh');
  const [thinkingEnabled, setThinkingEnabled] = useLocalStorage('lingxi_thinking_enabled', true);
  const [notifications, setNotifications] = useLocalStorage('lingxi_notifications', true);
  const [sendMode, setSendMode] = useLocalStorage('lingxi_send_mode', 'enter');
  const [zoom, setZoom] = useLocalStorage('lingxi_zoom', 100);
  const [proxyMode, setProxyMode] = useLocalStorage('lingxi_proxy_mode', 'system');
  const [proxyUrl, setProxyUrl] = useLocalStorage('lingxi_proxy_url', '');
  const [timeout, setTimeout_] = useLocalStorage('lingxi_request_timeout', 120);

  useEffect(() => {
    document.documentElement.style.zoom = `${zoom}%`;
  }, [zoom]);

  useEffect(() => {
    if (notifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [notifications]);

  const notifPermission = typeof Notification !== 'undefined' ? Notification.permission : 'unavailable';

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[color:var(--text)]">通用设置</h2>
        <p className="text-sm text-[color:var(--text-soft)] mt-1">配置应用程序的全局行为和偏好</p>
      </div>

      {/* 语言 */}
      <Card className="p-5 space-y-4">
        <SectionTitle icon={Globe} title="语言" desc="选择应用程序的显示语言。" />
        <SelectField value={locale} onChange={setLocale} options={LANGUAGES} />
      </Card>

      {/* 回复语言 */}
      <Card className="p-5 space-y-4">
        <SectionTitle icon={MessageSquare} title="回复语言" desc="指定 AI 始终以某种语言回复。" />
        <SelectField value={replyLang} onChange={setReplyLang} options={REPLY_LANGUAGES} />
      </Card>

      {/* 思考模式 */}
      <Card className="p-5 space-y-4">
        <SectionTitle icon={Brain} title="思考模式" desc="控制新会话是否启用模型思考。关闭后，DeepSeek 等兼容供应商会收到显式非思考模式参数。" />
        <Toggle checked={thinkingEnabled} onChange={setThinkingEnabled} label="启用思考模式" />
        <p className="text-xs text-[color:var(--text-faint)] ml-[52px]">
          关闭后会以非思考模式启动新会话；适合 DeepSeek V4 Flash/Pro 等需要非思考模式的模型。
        </p>
      </Card>

      {/* 系统通知 */}
      <Card className="p-5 space-y-4">
        <SectionTitle icon={Bell} title="系统通知" desc="使用操作系统原生通知提醒授权确认、Agent 回复完成和定时任务结果。" />
        <Toggle checked={notifications} onChange={setNotifications} label="启用系统通知" />
        <p className="text-xs text-[color:var(--text-faint)] ml-[52px]">
          开启后会请求系统通知权限，并通过系统通知中心提醒。
          {notifPermission !== 'unavailable' && (
            <span className="ml-2">
              权限: <span className={cn(
                'font-medium',
                notifPermission === 'granted' ? 'text-green-600' : notifPermission === 'denied' ? 'text-red-500' : 'text-amber-500'
              )}>{notifPermission === 'granted' ? '已授权' : notifPermission === 'denied' ? '已拒绝' : '未请求'}</span>
            </span>
          )}
        </p>
      </Card>

      {/* 消息发送方式 */}
      <Card className="p-5 space-y-4">
        <SectionTitle icon={Keyboard} title="消息发送方式" desc="选择桌面端对话输入框如何发送消息。" />
        <div className="space-y-2">
          {SEND_MODES.map((mode) => (
            <label key={mode.value} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="sendMode"
                value={mode.value}
                checked={sendMode === mode.value}
                onChange={() => setSendMode(mode.value)}
                className="mt-1 accent-[color:var(--accent)]"
              />
              <div>
                <span className="text-sm font-medium text-[color:var(--text)]">{mode.label}</span>
                <p className="text-xs text-[color:var(--text-faint)]">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </Card>

      {/* 界面缩放 */}
      <Card className="p-5 space-y-4">
        <SectionTitle icon={ZoomIn} title="界面缩放" desc="调整整个界面的显示大小。" />
        <div className="text-xs text-[color:var(--text-faint)] mb-2">
          快捷键：macOS <kbd className="px-1 py-0.5 rounded bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-[10px]">⌘+</kbd> / <kbd className="px-1 py-0.5 rounded bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-[10px]">⌘-</kbd> / <kbd className="px-1 py-0.5 rounded bg-[color:var(--bg-soft)] border border-[color:var(--line)] text-[10px]">⌘0</kbd>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[color:var(--text)] w-12">{zoom}%</span>
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
          >
            {ZOOM_OPTIONS.map((z) => (
              <option key={z} value={z}>{z}%</option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={() => setZoom(100)}>重置</Button>
        </div>
      </Card>

      {/* 网络 */}
      <Card className="p-5 space-y-4">
        <SectionTitle icon={Wifi} title="网络" desc="控制桌面会话发起的服务商 API 请求。" />
        <div className="space-y-2">
          {PROXY_MODES.map((mode) => (
            <label key={mode.value} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="proxyMode"
                value={mode.value}
                checked={proxyMode === mode.value}
                onChange={() => setProxyMode(mode.value)}
                className="mt-1 accent-[color:var(--accent)]"
              />
              <div>
                <span className="text-sm font-medium text-[color:var(--text)]">{mode.label}</span>
                <p className="text-xs text-[color:var(--text-faint)]">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>
        {proxyMode === 'manual' && (
          <input
            type="text"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            placeholder="http://127.0.0.1:7890"
            className="w-full px-3 py-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
          />
        )}
      </Card>

      {/* AI 请求超时 */}
      <Card className="p-5 space-y-4">
        <SectionTitle icon={Clock} title="AI 请求超时" desc="用于服务商请求、流式首个响应，以及服务商连接测试。支持 5-600 秒。" />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setTimeout_(Math.max(5, timeout - 30))}>-30</Button>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={600}
              value={timeout}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 5 && v <= 600) setTimeout_(v);
              }}
              className="w-20 px-3 py-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] text-sm text-[color:var(--text)] text-center focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
            />
            <span className="text-sm text-[color:var(--text-soft)]">秒</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setTimeout_(Math.min(600, timeout + 30))}>+30</Button>
        </div>
        <p className="text-xs text-[color:var(--text-faint)]">
          不会影响单独的应用更新代理。
        </p>
      </Card>
    </div>
  );
}
