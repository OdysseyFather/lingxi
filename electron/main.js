const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu, desktopCapturer, globalShortcut, nativeImage, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync, exec } = require('child_process');
const http = require('http');
const spotlight = require('./spotlight');
const clipboardMonitor = require('./clipboard-monitor');
const screenController = require('./screen-controller');


// Windows GPU 兼容性：部分机器 GPU 驱动有问题导致窗口白屏/不显示
if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

// ─── 配置 ────────────────────────────────────────────────────────
const BACKEND_PORT_START = 3001;
const BACKEND_PORT_END = 3010;
const BACKEND_STARTUP_TIMEOUT = 20000;

let mainWindow = null;
let backendProcess = null;
let backendPort = BACKEND_PORT_START;

// ─── 路径工具 ────────────────────────────────────────────────────

function getFrontendDistPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend-dist');
  }
  return path.join(__dirname, '..', 'frontend-desktop', 'dist');
}

// Go 二进制路径（打包后在 resources/smart-agent[.exe]，开发时在 backend-desktop/smart-agent[.exe]）
function getGoBinPath() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'smart-agent' + ext);
  }
  return path.join(__dirname, '..', 'backend-desktop', 'smart-agent' + ext);
}

// 内置 AI 引擎路径
// macOS 打包后：resources/ai-engine/lingxi（bash 包装脚本）
// Windows 打包后：resources/ai-engine/lingxi.cmd（cmd 包装脚本）
// 开发时：对应脚本或系统 claude
function getClaudeBin() {
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, 'resources');
  const isWin = process.platform === 'win32';
  const bundled = path.join(resourcesDir, 'ai-engine', isWin ? 'lingxi.cmd' : 'lingxi');
  if (fs.existsSync(bundled)) {
    if (!isWin) {
      try { fs.chmodSync(bundled, 0o755); } catch (e) {}
    }
    return bundled;
  }
  // 回退到系统 claude
  if (isWin) {
    try {
      return require('child_process').execSync('where claude', { encoding: 'utf-8' }).trim().split('\n')[0];
    } catch {
      return 'claude';
    }
  }
  try {
    return require('child_process').execSync('which claude').toString().trim();
  } catch {
    return 'claude';
  }
}

// ─── Bridge 二进制 + 隔离目录 ────────────────────────────────────
// 用于非 Anthropic 协议的供应商：bridge 在本地 127.0.0.1:<port> 启一个
// Anthropic 协议端点，把 Claude Code 的请求转发到用户配置的 OpenAI 兼容供应商，
// 并把 OpenAI 流式响应实时翻译回 Anthropic SSE 返回给 Claude Code。
//
// 优先使用 litellm-bridge（Python，工具调用协议兼容性更稳定），
// 不存在时回退到 Node llm-bridge。
function getBridgeBin() {
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, 'resources');
  const isWin = process.platform === 'win32';

  // 优先：LiteLLM Bridge（Python）
  const litellmName = isWin ? 'bridge.cmd' : 'bridge';
  const litellmBridge = path.join(resourcesDir, 'litellm-bridge', litellmName);
  if (fs.existsSync(litellmBridge)) {
    if (!isWin) { try { fs.chmodSync(litellmBridge, 0o755); } catch (e) {} }
    console.log('[electron] bridge: using litellm-bridge (Python)');
    return litellmBridge;
  }

  // 回退：Node llm-bridge
  const bridgeName = isWin ? 'bridge.cmd' : 'bridge';
  const nodeBridge = path.join(resourcesDir, 'bridge', bridgeName);
  if (fs.existsSync(nodeBridge)) {
    if (!isWin) { try { fs.chmodSync(nodeBridge, 0o755); } catch (e) {} }
    console.log('[electron] bridge: using node llm-bridge (fallback)');
    return nodeBridge;
  }

  return '';
}

function getBridgeHome() {
  return path.join(app.getPath('userData'), 'bridge-home');
}

// ─── 获取应用隔离 HOME 目录 ──────────────────────────────────────
// AI 引擎通过 HOME 环境变量定位配置目录
// 给它一个独立目录，完全不碰用户真实的 ~/.claude/
function getAppHome() {
  return path.join(app.getPath('userData'), 'ai-home');
}

// 知识库目录：userData/knowledge
function getKbPath() {
  return path.join(app.getPath('userData'), 'knowledge');
}

// 用户上传图片持久化目录：userData/uploads
function getUploadsPath() {
  return path.join(app.getPath('userData'), 'uploads');
}

// skills 目录：隔离 HOME/.claude/skills（与 initClaudeConfig 同步的位置一致）
function getSkillsPath() {
  return path.join(getAppHome(), '.claude', 'skills');
}

// whisper.cpp 离线语音识别二进制 + 模型
function getWhisperBin() {
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, 'resources');
  const isWin = process.platform === 'win32';
  const bin = path.join(resourcesDir, 'whisper', isWin ? 'whisper-cli.exe' : 'whisper-cli');
  if (fs.existsSync(bin)) {
    if (!isWin) { try { fs.chmodSync(bin, 0o755); } catch (e) {} }
    return bin;
  }
  return '';
}

function getWhisperModel() {
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, 'resources');
  const model = path.join(resourcesDir, 'whisper', 'ggml-base.bin');
  if (fs.existsSync(model)) return model;
  return '';
}

// ─── SDK Runner 路径 ─────────────────────────────────────────
function getSDKRunnerEnv() {
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, 'resources');
  const isWin = process.platform === 'win32';
  const nodeExt = isWin ? 'node.exe' : 'node';
  const nodeBin = path.join(resourcesDir, 'node-bin', nodeExt);
  const runnerScript = path.join(resourcesDir, 'sdk-runner', 'sdk-runner.js');
  const env = {};
  if (fs.existsSync(runnerScript)) {
    env.SDK_RUNNER_SCRIPT = runnerScript;
  }
  if (fs.existsSync(nodeBin)) {
    env.SDK_NODE_BIN = nodeBin;
  }
  return env;
}

// ─── 初始化 claude-code 隔离配置 ────────────────────────────────
function initClaudeConfig() {
  const appHome = getAppHome();
  const claudeDir = path.join(appHome, '.claude');
  const claudeJson = path.join(appHome, '.claude.json');

  const configSrc = app.isPackaged
    ? path.join(process.resourcesPath, 'ai-config')
    : path.join(__dirname, '..', 'ai-config');

  fs.mkdirSync(claudeDir, { recursive: true });

  // 写入 settings.json（每次启动都用内嵌版本）
  const settingsSrc = path.join(configSrc, 'settings.json');
  if (fs.existsSync(settingsSrc)) {
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(settingsSrc, 'utf8'));
    } catch (e) {
      settings = {};
    }
    delete settings.mcpServers;
    delete settings.env; // 密钥不写入 AI 可读的文件，仅通过进程环境变量注入
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');
    console.log('[electron] wrote isolated engine settings.json');
  }

  // 注册 Playwright MCP（如果 Chrome 存在）
  const isWin = process.platform === 'win32';
  const chromeCandidates = isWin
    ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const chromePath = chromeCandidates.find((p) => fs.existsSync(p)) || '';
  if (chromePath) {
    const resourcesDir = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, 'resources');

    const nodeExt = isWin ? 'node.exe' : 'node';
    const nodeBin = path.join(resourcesDir, 'node-bin', nodeExt);
    const mcpCliPath = path.join(resourcesDir, 'node-bin', 'node_modules', '@playwright', 'mcp', 'cli.js');

    if (fs.existsSync(mcpCliPath) && fs.existsSync(nodeBin)) {
      let claudeJsonObj = {};
      try { claudeJsonObj = JSON.parse(fs.readFileSync(claudeJson, 'utf8')); } catch (e) {}
      if (!claudeJsonObj.mcpServers) claudeJsonObj.mcpServers = {};

      const screenshotDir = path.join(app.getPath('userData'), 'playwright-screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });

      claudeJsonObj.mcpServers.playwright = {
        command: nodeBin,
        args: [
          mcpCliPath,
          '--browser', 'chrome',
          '--executable-path', chromePath,
          '--headless',
          '--no-sandbox',
          '--viewport-size', '1280x900',
          '--timeout-action', '10000',
          '--timeout-navigation', '30000',
          '--output-dir', screenshotDir,
        ],
      };
      fs.writeFileSync(claudeJson, JSON.stringify(claudeJsonObj, null, 2), 'utf8');
      console.log('[electron] registered playwright MCP, cli:', mcpCliPath);
    } else {
      console.log('[electron] playwright MCP cli not found:', mcpCliPath);
    }
  } else {
    console.log('[electron] Chrome not found, playwright MCP skipped');
  }

  // 写入 .claude.json（跳过 onboarding，仅首次）
  const claudeJsonSrc = path.join(configSrc, 'claude.json');
  if (!fs.existsSync(claudeJson) && fs.existsSync(claudeJsonSrc)) {
    fs.copyFileSync(claudeJsonSrc, claudeJson);
    console.log('[electron] wrote isolated engine config');
  }

  // 同步内置 skills（递归，支持 dot-skill 等多层目录）
  const skillsSrc = path.join(configSrc, 'skills');
  const skillsDst = path.join(claudeDir, 'skills');
  const copyDirRecursive = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) copyDirRecursive(s, d);
      else fs.copyFileSync(s, d);
    }
  };
  if (fs.existsSync(skillsSrc)) {
    fs.mkdirSync(skillsDst, { recursive: true });
    for (const skillName of fs.readdirSync(skillsSrc)) {
      const srcSkill = path.join(skillsSrc, skillName);
      if (!fs.statSync(srcSkill).isDirectory()) continue;
      const dstSkill = path.join(skillsDst, skillName);
      if (!fs.existsSync(dstSkill)) {
        copyDirRecursive(srcSkill, dstSkill);
        console.log('[electron] installed built-in skill:', skillName);
      }
    }
  }

  // 同步系统提示（每次启动都覆盖）
  const claudeMdSrc = path.join(configSrc, 'CLAUDE.md');
  if (fs.existsSync(claudeMdSrc)) {
    fs.copyFileSync(claudeMdSrc, path.join(claudeDir, 'CLAUDE.md'));
    console.log('[electron] wrote engine system prompt');
  }

  // 同步内置 subagents
  const agentsSrc = path.join(configSrc, '.claude', 'agents');
  const agentsDst = path.join(claudeDir, 'agents');
  if (fs.existsSync(agentsSrc)) {
    fs.mkdirSync(agentsDst, { recursive: true });
    for (const agentFile of fs.readdirSync(agentsSrc)) {
      if (!agentFile.endsWith('.md')) continue;
      fs.copyFileSync(path.join(agentsSrc, agentFile), path.join(agentsDst, agentFile));
      console.log('[electron] installed built-in agent:', agentFile);
    }
  }

  console.log('[electron] engine isolated HOME:', appHome);
}

// ─── 从 auth.json 读取认证环境变量 ──────────────────────────────
// auth.json 仅供 Electron 读取后注入为进程环境变量，不会被写入 AI 隔离 HOME
function getClaudeAuthEnv() {
  const configSrc = app.isPackaged
    ? path.join(process.resourcesPath, 'ai-config')
    : path.join(__dirname, '..', 'ai-config');

  const authPath = path.join(configSrc, 'auth.json');
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    return {
      ANTHROPIC_AUTH_TOKEN: auth.ANTHROPIC_AUTH_TOKEN || '',
      ANTHROPIC_BASE_URL: auth.ANTHROPIC_BASE_URL || '',
      ANTHROPIC_MODEL: auth.ANTHROPIC_MODEL || '',
    };
  } catch (e) {
    console.error('[electron] failed to read auth.json:', e.message);
    return {};
  }
}

// ─── 检测可用端口 ────────────────────────────────────────────────
function findAvailablePort(startPort, endPort) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    let port = startPort;
    function tryPort() {
      if (port > endPort) {
        reject(new Error(`端口 ${startPort}-${endPort} 全部被占用`));
        return;
      }
      const server = net.createServer();
      server.once('error', () => { port++; tryPort(); });
      server.once('listening', () => { server.close(() => resolve(port)); });
      server.listen(port, '127.0.0.1');
    }
    tryPort();
  });
}

// ─── 启动 Go 后端子进程 ──────────────────────────────────────────
function startBackend() {
  const goBin = getGoBinPath();
  const frontendDist = getFrontendDistPath();
  const appHome = getAppHome();
  const dbPath = path.join(app.getPath('userData'), 'smart-agent.db');
  const claudeBin = getClaudeBin();
  const kbPath = getKbPath();
  const skillsPath = getSkillsPath();
  const uploadsPath = getUploadsPath();

  // 确保知识库目录 + 上传目录存在
  fs.mkdirSync(kbPath, { recursive: true });
  fs.mkdirSync(uploadsPath, { recursive: true });

  console.log('[electron] starting Go backend:', goBin);
  console.log('[electron] engine bin:', claudeBin);
  console.log('[electron] frontend dist:', frontendDist);
  console.log('[electron] db path:', dbPath);
  console.log('[electron] engine HOME (isolated):', appHome);
  console.log('[electron] knowledge base path:', kbPath);
  console.log('[electron] skills path:', skillsPath);

  if (!fs.existsSync(goBin)) {
    console.error('[electron] Go binary not found:', goBin);
    console.error('[electron] Please run: cd backend-desktop && go build -o smart-agent .');
    return;
  }

  // 确保 Go 二进制有执行权限（macOS/Linux）
  if (process.platform !== 'win32') {
    try { fs.chmodSync(goBin, 0o755); } catch (e) {}
  }

  const authEnv = getClaudeAuthEnv();
  console.log('[electron] engine auth token present:', !!authEnv.ANTHROPIC_AUTH_TOKEN);
  console.log('[electron] engine base url:', authEnv.ANTHROPIC_BASE_URL || '(default)');

  // 补全 PATH：Electron 启动时可能缺少常用工具路径
  const userHome = require('os').homedir();
  const isWin = process.platform === 'win32';
  const pathSep = isWin ? ';' : ':';
  const extraPaths = isWin
    ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'cmd'),
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'nodejs'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312'),
        path.join(userHome, 'AppData', 'Roaming', 'npm'),
      ]
    : [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        `${userHome}/.brew/Homebrew/bin`,
        `${userHome}/.nvm/versions/node/v22.22.1/bin`,
        `${userHome}/bin`,
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
      ];
  const currentPath = process.env.PATH || '';
  const mergedPath = [...new Set([...extraPaths, ...currentPath.split(pathSep)])].join(pathSep);

  const envObj = {
    ...process.env,
    PATH: mergedPath,
    PORT: String(backendPort),
    FRONTEND_DIST: frontendDist,
    DB_PATH: dbPath,
    CLAUDE_BIN: claudeBin,
    BRIDGE_BIN: getBridgeBin(),
    BRIDGE_HOME: getBridgeHome(),
    KB_PATH: kbPath,
    SKILLS_PATH: skillsPath,
    UPLOADS_PATH: uploadsPath,
    WHISPER_BIN: getWhisperBin(),
    WHISPER_MODEL: getWhisperModel(),
    ...getSDKRunnerEnv(),
    ...authEnv,
  };
  // HOME 隔离：macOS/Linux 用 HOME，Windows 用 USERPROFILE + APPDATA
  if (isWin) {
    envObj.USERPROFILE = appHome;
    envObj.APPDATA = path.join(appHome, 'AppData', 'Roaming');
  } else {
    envObj.HOME = appHome;
  }

  backendProcess = spawn(goBin, [], {
    env: envObj,
    cwd: app.getPath('userData'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const stdoutHandler = (data) => {
    if (backendProcess) {
      try {
        console.log('[backend]', data.toString().trim());
      } catch (e) {
        // Ignore EPIPE errors when process has exited
      }
    }
  };

  const stderrHandler = (data) => {
    if (backendProcess) {
      try {
        console.error('[backend:err]', data.toString().trim());
      } catch (e) {
        // Ignore EPIPE errors when process has exited
      }
    }
  };

  backendProcess.stdout.on('data', stdoutHandler);
  backendProcess.stderr.on('data', stderrHandler);

  backendProcess.on('exit', (code, signal) => {
    console.log(`[electron] backend exited: code=${code} signal=${signal}`);
    // Remove listeners to prevent EPIPE errors
    if (backendProcess) {
      backendProcess.stdout.removeListener('data', stdoutHandler);
      backendProcess.stderr.removeListener('data', stderrHandler);
    }
    backendProcess = null;
  });

  backendProcess.on('error', (err) => {
    console.error('[electron] backend spawn error:', err);
  });
}

// ─── 等待后端 HTTP 服务就绪 ──────────────────────────────────────
function waitForBackend(timeout = BACKEND_STARTUP_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${backendPort}/api/ping`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('backend startup timeout'));
          return;
        }
        setTimeout(check, 300);
      });
      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(check, 300);
      });
    };
    check();
  });
}

// ─── 应用菜单（确保 Cmd+C/V/X/A 等快捷键在 webview 内可用）─────
function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}


function createWindow() {
  const isMac = process.platform === 'darwin';
  const winOptions = {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, 'assets', isMac ? 'icon.png' : 'icon.ico'),
    show: false,
  };
  if (isMac) {
    winOptions.titleBarStyle = 'hiddenInset';
    winOptions.trafficLightPosition = { x: 16, y: 16 };
  } else {
    winOptions.frame = true;
    winOptions.autoHideMenuBar = true;
  }
  mainWindow = new BrowserWindow(winOptions);

  // 立即加载 splash 页面，后端就绪后再切换到主应用
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Windows 兜底：如果 ready-to-show 未触发，3 秒后强制显示
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log('[electron] force showing window (ready-to-show timeout)');
      mainWindow.show();
    }
  }, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function switchToApp() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`http://localhost:${backendPort}`);
  }
}

// ─── safeStorage 工具：AKSK 加解密 ───────────────────────────────
function encryptSecretBase64(plain) {
  if (!plain) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    // 无加密能力时退化为简易混淆（不建议，但保证可用）
    return 'b64:' + Buffer.from(String(plain), 'utf8').toString('base64');
  }
  return 'sf:' + safeStorage.encryptString(String(plain)).toString('base64');
}

function decryptSecretBase64(cipher) {
  if (!cipher) return '';
  if (cipher.startsWith('sf:')) {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[electron] safeStorage 不可用，无法解密 sf: 密文');
      return '';
    }
    try {
      return safeStorage.decryptString(Buffer.from(cipher.slice(3), 'base64'));
    } catch (e) {
      console.error('[electron] decryptString error:', e.message);
      return '';
    }
  }
  if (cipher.startsWith('b64:')) {
    try { return Buffer.from(cipher.slice(4), 'base64').toString('utf8'); } catch { return ''; }
  }
  return '';
}

// ─── 与后端通信：查激活档案 / 推送明文 token ─────────────────────
function backendRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      host: 'localhost', port: backendPort, method, path,
      headers: data
        ? { 'Content-Type': 'application/json', 'Content-Length': data.length }
        : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${txt}`));
          return;
        }
        try { resolve(JSON.parse(txt)); } catch { resolve(txt); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// pushActiveSecretToBackend 拉取激活档案的密文 → 解密 → 一次性下发到后端进程内存
async function pushActiveSecretToBackend(profileIdHint) {
  try {
    const profiles = await backendRequest('GET', '/api/api-profiles?include_cipher=1', null);
    let active = profiles.find((p) => p.is_active);
    if (profileIdHint && !active) active = profiles.find((p) => p.id === profileIdHint);
    if (!active) {
      console.log('[electron] no active profile yet');
      return;
    }
    const token = decryptSecretBase64(active.auth_token_cipher);
    if (!token) {
      console.warn('[electron] active profile has empty/undecryptable token, skip push');
      return;
    }
    await backendRequest('POST', '/api/runtime/active-secret', {
      id: active.id,
      name: active.name,
      model: active.model,
      base_url: active.base_url,
      token,
      protocol: active.provider_protocol || 'anthropic',
      transformer: active.transformer || '',
    });
    console.log('[electron] pushed active secret: id=', active.id, 'proto=', active.provider_protocol, 'model=', active.model);
  } catch (e) {
    console.error('[electron] pushActiveSecretToBackend error:', e.message);
  }
}

// ─── IPC 处理 ────────────────────────────────────────────────────
ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择项目目录',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    title: '选择文件或目录',
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
});

ipcMain.handle('encrypt-secret', (_e, plain) => encryptSecretBase64(plain));
ipcMain.handle('decrypt-secret', (_e, cipher) => decryptSecretBase64(cipher));
ipcMain.handle('is-encryption-available', () => {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
});
ipcMain.handle('push-active-secret', async (_e, profileId) => {
  await pushActiveSecretToBackend(profileId);
  return { ok: true };
});

// ─── OAuth Loopback 登录 ─────────────────────────────────────────
ipcMain.handle('start-oauth', async (_event, provider) => {
  const net = require('net');

  // 获取 OAuth 配置
  let oauthCfg;
  try {
    oauthCfg = await backendRequest('GET', '/api/auth/oauth-configs', null);
  } catch (e) {
    throw new Error('无法获取 OAuth 配置: ' + e.message);
  }
  const cfg = (oauthCfg || []).find(c => c.provider === provider);
  if (!cfg || !cfg.app_id) {
    throw new Error(`未配置 ${provider} 的 OAuth 应用信息，请先在设置中配置 AppID 和 AppSecret`);
  }

  return new Promise((resolve, reject) => {
    const httpModule = require('http');
    const server = httpModule.createServer();
    let resolved = false;

    // 随机端口
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const state = require('crypto').randomBytes(16).toString('hex');

      // 构建各平台授权 URL
      let authURL = '';
      switch (provider) {
        case 'google':
          authURL = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(cfg.app_id)}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `response_type=code&` +
            `scope=${encodeURIComponent('openid email profile')}&` +
            `state=${state}&access_type=offline`;
          break;
        case 'wechat':
          authURL = `https://open.weixin.qq.com/connect/qrconnect?` +
            `appid=${cfg.app_id}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `response_type=code&scope=snsapi_login&state=${state}`;
          break;
        case 'qq':
          authURL = `https://graph.qq.com/oauth2.0/authorize?` +
            `client_id=${cfg.app_id}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `response_type=code&scope=get_user_info&state=${state}`;
          break;
        case 'dingtalk':
          authURL = `https://login.dingtalk.com/oauth2/auth?` +
            `client_id=${cfg.app_id}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `response_type=code&scope=openid&state=${state}&prompt=consent`;
          break;
        case 'douyin':
          authURL = `https://open.douyin.com/platform/oauth/connect/?` +
            `client_key=${cfg.app_id}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `response_type=code&scope=user_info&state=${state}`;
          break;
        default:
          server.close();
          reject(new Error('不支持的登录方式: ' + provider));
          return;
      }

      // 监听回调
      server.on('request', async (req, res) => {
        if (resolved) return;
        const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        // 钉钉回调用 authCode 而非 code
        const code = reqUrl.searchParams.get('authCode') || reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        if (returnedState !== state) {
          res.writeHead(400);
          res.end('State mismatch');
          return;
        }
        if (!code) {
          res.writeHead(400);
          res.end('No code');
          return;
        }

        // 回应浏览器一个友好页面
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><title>灵犀 - 登录成功</title></head>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;background:linear-gradient(135deg,#f8fafc,#e8f0fe);margin:0">
          <div style="text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
            <div style="width:48px;height:48px;margin:0 auto 16px;background:#3370FF;border-radius:50%;display:flex;align-items:center;justify-content:center">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:600">登录成功</h2>
            <p style="margin:0;color:#666;font-size:14px">正在跳转到灵犀，你可以关闭此页面</p>
          </div>
        </body></html>`);

        resolved = true;
        server.close();

        // 将 code 发送给 Go 后端换取用户信息
        try {
          const result = await backendRequest('POST', '/api/auth/oauth/callback', {
            provider,
            code,
            redirect_uri: redirectUri,
          });
          resolve(result);
        } catch (e) {
          reject(new Error('OAuth 登录失败: ' + e.message));
        }
      });

      // 超时清理（2 分钟）
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          server.close();
          reject(new Error('登录超时，请重试'));
        }
      }, 120000);

      // 打开系统浏览器
      shell.openExternal(authURL);
    });

    server.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error('启动登录服务失败: ' + err.message));
      }
    });
  });
});

// ─── 可靠截屏（macOS 使用 screencapture 命令，回退 desktopCapturer）────
async function reliableScreenCapture(region) {
  const display = screen.getPrimaryDisplay();
  const isMac = process.platform === 'darwin';

  if (isMac) {
    const tmpFile = path.join(app.getPath('temp'), `lingxi-sc-${Date.now()}.png`);
    try {
      if (region && region.x != null) {
        const r = `${Math.round(region.x)},${Math.round(region.y)},${Math.round(region.x + region.w)},${Math.round(region.y + region.h)}`;
        execSync(`screencapture -x -t png -R${r} "${tmpFile}"`, { timeout: 5000 });
      } else {
        execSync(`screencapture -x -t png "${tmpFile}"`, { timeout: 5000 });
      }
      const png = fs.readFileSync(tmpFile);
      const img = nativeImage.createFromBuffer(png);
      const size = img.getSize();
      return {
        data: png.toString('base64'),
        mediaType: 'image/png',
        width: size.width,
        height: size.height,
        screenWidth: display.size.width,
        screenHeight: display.size.height,
        scaleFactor: display.scaleFactor,
      };
    } catch (err) {
      throw new Error(`截屏失败: ${err.message}`);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }

  // Windows / Linux 回退到 desktopCapturer
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (!sources || !sources.length) {
      throw new Error('截屏失败：未获取到屏幕源');
    }
    let img = sources[0].thumbnail;
    if (region && region.x != null) {
      img = img.crop({
        x: Math.round(region.x), y: Math.round(region.y),
        width: Math.round(region.w), height: Math.round(region.h),
      });
    }
    const png = img.toPNG();
    return {
      data: png.toString('base64'),
      mediaType: 'image/png',
      width: img.getSize().width,
      height: img.getSize().height,
      screenWidth: display.size.width,
      screenHeight: display.size.height,
      scaleFactor: display.scaleFactor,
    };
  } catch (err) {
    throw new Error(`截屏失败: ${err.message}`);
  }
}

// ─── 屏幕截图 IPC ──────────────────────────────────────────────────
ipcMain.handle('capture-screen', async () => {
  const result = await reliableScreenCapture();
  return { data: result.data, mediaType: result.mediaType };
});

// ─── Screen Agent ─────────────────────────────────────────────────
screenController.setCaptureScreenFn(reliableScreenCapture);

ipcMain.handle('screen-agent-capture', async (_e, region) => {
  return screenController.captureScreen(region);
});

ipcMain.handle('screen-agent-context', () => {
  return screenController.getEnhancedContext();
});

ipcMain.handle('screen-agent-execute', async (_e, action) => {
  return screenController.executeAction(action);
});

ipcMain.handle('screen-agent-execute-batch', async (_e, actions, stepDelay) => {
  return screenController.executeActions(actions, stepDelay);
});

ipcMain.handle('screen-agent-abort', () => {
  screenController.setAborted(true);
  return { ok: true };
});

ipcMain.handle('screen-agent-reset', () => {
  screenController.setAborted(false);
  return { ok: true };
});

// ─── 剪贴板监控设置 ──────────────────────────────────────────────
ipcMain.handle('clipboard-monitor-toggle', (_e, enabled) => {
  clipboardMonitor.setEnabled(enabled);
  return clipboardMonitor.isEnabled();
});
ipcMain.handle('clipboard-monitor-status', () => {
  return clipboardMonitor.isEnabled();
});

// ─── 桌面通知 ─────────────────────────────────────────────────────
const { Notification: ElectronNotification } = require('electron');
ipcMain.handle('show-notification', (_e, title, body) => {
  if (ElectronNotification.isSupported()) {
    const n = new ElectronNotification({ title: title || '灵犀', body: body || '' });
    n.show();
  }
});

// ─── 应用生命周期 ────────────────────────────────────────────────

app.whenReady().then(async () => {
  buildAppMenu();

  // 立即创建窗口并显示 splash 页，让用户第一时间看到内容
  createWindow();

  // 并行执行初始化（不阻塞窗口显示）
  try {
    initClaudeConfig();
  } catch (err) {
    console.error('[electron] initClaudeConfig error:', err);
  }

  try {
    backendPort = await findAvailablePort(BACKEND_PORT_START, BACKEND_PORT_END);
    console.log(`[electron] using port ${backendPort}`);
  } catch (err) {
    console.error('[electron] no available port:', err);
    dialog.showErrorBox('灵犀启动失败', `端口 ${BACKEND_PORT_START}-${BACKEND_PORT_END} 全部被占用，请关闭占用端口的程序后重试。`);
    app.quit();
    return;
  }

  startBackend();

  try {
    await waitForBackend();
    console.log('[electron] backend is ready on port', backendPort);
    await pushActiveSecretToBackend();
    switchToApp();
  } catch (err) {
    console.error('[electron] backend failed to start:', err);
    dialog.showErrorBox('灵犀启动失败',
      `后端服务未能在 ${BACKEND_STARTUP_TIMEOUT / 1000} 秒内启动。\n\n` +
      `可能原因：\n` +
      `• 端口 ${backendPort} 被其他程序占用\n` +
      `• macOS 安全策略阻止了应用运行\n` +
      `• 请尝试右键 → 打开 或执行: xattr -cr "/Applications/灵犀.app"\n\n` +
      `错误: ${err.message}`);
    switchToApp();
  }

  // 初始化 Spotlight
  spotlight.setBackendPort(backendPort);
  spotlight.registerIPC();
  spotlight.registerShortcut();

  // 启动剪贴板智能监控
  clipboardMonitor.start(mainWindow);

  // Screen Agent 紧急中止快捷键：Cmd+Shift+Esc → 立即中止所有操作
  try {
    globalShortcut.register('CommandOrControl+Shift+Escape', () => {
      screenController.setAborted(true);
      if (mainWindow) {
        mainWindow.webContents.send('screen-agent-emergency-abort');
      }
      console.log('[electron] Screen Agent emergency abort triggered');
    });
  } catch (err) {
    console.error('[electron] failed to register screen-agent abort shortcut:', err.message);
  }

  // 注册全局截屏快捷键 Cmd+Shift+S → 截屏并推送到前端
  try {
    globalShortcut.register('CommandOrControl+Shift+S', async () => {
      if (!mainWindow) return;
      try {
        const result = await reliableScreenCapture();
        mainWindow.webContents.send('screenshot-captured', {
          data: result.data,
          mediaType: result.mediaType,
        });
      } catch (err) {
        console.error('[electron] screenshot error:', err.message);
      }
    });
  } catch (err) {
    console.error('[electron] failed to register screenshot shortcut:', err.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS 惯例：关闭所有窗口后应用仍驻留，但灵犀带后端子进程，统一退出
  app.quit();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (backendProcess) {
    console.log('[electron] killing backend process...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
  }
});
