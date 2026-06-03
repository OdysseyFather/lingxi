const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程暴露安全的 API
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getVersion: () => ipcRenderer.invoke('get-version'),

  // ─── AKSK 加密 / 解密（safeStorage，macOS 走 Keychain）──────
  encryptSecret: (plain) => ipcRenderer.invoke('encrypt-secret', plain),
  decryptSecret: (cipher) => ipcRenderer.invoke('decrypt-secret', cipher),
  isEncryptionAvailable: () => ipcRenderer.invoke('is-encryption-available'),

  // 让前端在切换激活档案后请求主进程把新档案明文同步给后端进程
  pushActiveSecret: (profileId) => ipcRenderer.invoke('push-active-secret', profileId),

  // ─── OAuth 登录 ─────────────────────────────────────────────
  startOAuth: (provider) => ipcRenderer.invoke('start-oauth', provider),

  // ─── 屏幕截图 ────────────────────────────────────────────────
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  onScreenshotCaptured: (callback) => {
    ipcRenderer.on('screenshot-captured', (_e, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('screenshot-captured');
  },

  // ─── 桌面通知 ──────────────────────────────────────────────
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),

  // ─── 剪贴板智能监控 ──────────────────────────────────────
  onClipboardSuggestion: (callback) => {
    ipcRenderer.on('clipboard-suggestion', (_e, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('clipboard-suggestion');
  },
  clipboardMonitorToggle: (enabled) => ipcRenderer.invoke('clipboard-monitor-toggle', enabled),
  clipboardMonitorStatus: () => ipcRenderer.invoke('clipboard-monitor-status'),

  // ─── Screen Agent ─────────────────────────────────────────
  screenAgent: {
    capture: (region) => ipcRenderer.invoke('screen-agent-capture', region),
    getContext: () => ipcRenderer.invoke('screen-agent-context'),
    executeAction: (action) => ipcRenderer.invoke('screen-agent-execute', action),
    executeBatch: (actions, stepDelay) => ipcRenderer.invoke('screen-agent-execute-batch', actions, stepDelay),
    abort: () => ipcRenderer.invoke('screen-agent-abort'),
    reset: () => ipcRenderer.invoke('screen-agent-reset'),
    onEmergencyAbort: (callback) => {
      ipcRenderer.on('screen-agent-emergency-abort', () => callback());
      return () => ipcRenderer.removeAllListeners('screen-agent-emergency-abort');
    },
  },

  // ─── 目录选择（Coding View）──────────────────────────────────
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFiles: () => ipcRenderer.invoke('select-files'),

  // ─── Spotlight 悬浮窗 ──────────────────────────────────────
  showSpotlight: () => ipcRenderer.invoke('show-spotlight'),
  hideSpotlight: () => ipcRenderer.invoke('hide-spotlight'),
  resizeSpotlight: (height) => ipcRenderer.invoke('resize-spotlight', height),
  getActiveContext: () => ipcRenderer.invoke('get-active-context'),
  spotlightGetPort: () => ipcRenderer.invoke('spotlight-get-port'),
  onSpotlightContext: (callback) => {
    ipcRenderer.on('spotlight-context', (_e, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('spotlight-context');
  },

});
