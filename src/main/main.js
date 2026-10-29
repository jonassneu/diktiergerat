'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { app, BrowserWindow, ipcMain, clipboard, screen } = require('electron');

const paths = require('./paths');
const { Config } = require('./config');
const { History } = require('./history');
const { Models, byId, modelPath, isInstalled } = require('./models');
const { Whisper } = require('./whisper');
const { Controller } = require('./controller');
const { listInputs, defaultInput } = require('./audio');
const hyprland = require('./hyprland');
const output = require('./output');
const autostart = require('./autostart');
const binds = require('../shared/binds');

// Wayland app_id, used by our Hyprland window rules.
app.setName('murmur');
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, 'preload.js');

const config = new Config();
const history = new History();
const models = new Models();
const whisper = new Whisper();
const controller = new Controller({ config, whisper, history });

let overlay = null;
let mainWin = null;
let setupWin = null;
let hideOverlayTimer = null;

// ---------- state shared with the windows ----------

function fmt() {
  return config.get('fmt') || hyprland.detectFormat();
}

function backendLabel(b) {
  const built = whisper.backend();
  const map = { vulkan: 'Vulkan · GPU', cuda: 'CUDA · GPU', rocm: 'ROCm · GPU', cpu: 'CPU' };
  if (b === 'cpu' || !built) return 'CPU';
  return map[built] || 'GPU';
}

let autostartOn = false;
autostart.enabled().then((on) => { autostartOn = on; broadcast(); });

let inputs = [];
async function refreshInputs() {
  inputs = await listInputs();
  const def = await defaultInput();
  inputs = inputs.map((i) => ({ ...i, isDefault: i.name === def }));
  broadcast();
}

function inputLabel() {
  const name = config.get('input');
  if (name === 'default') return 'Default';
  const i = inputs.find((x) => x.name === name);
  return i ? i.label : name;
}

function snapshot() {
  const cfg = config.all();
  const f = fmt();
  const sel = byId(cfg.model) || byId('turbo');
  return {
    config: { ...cfg, fmt: f },
    status: whisper.state === 'ready' ? 'Ready' : whisper.state === 'loading' ? 'Loading model' : whisper.state === 'error' ? 'Needs attention' : 'Idle',
    whisperState: whisper.state,
    whisperError: whisper.error,
    whisperBuilt: whisper.available(),
    builtBackend: whisper.backend(),
    modelName: sel.name,
    runsOn: backendLabel(cfg.backend),
    inputLabel: inputLabel(),
    inputs,
    models: models.list(),
    usedBytes: models.usedBytes(),
    modelsDir: paths.pretty(paths.models),
    hypr: {
      running: hyprland.running(),
      fileName: hyprland.fileName(f),
      added: hyprland.isAdded(f),
      lua: hyprland.fileName('lua'),
      conf: hyprland.fileName('conf')
    },
    gpu: !!whisper.backend() && whisper.backend() !== 'cpu',
    autostart: { available: autostart.available(), on: autostartOn }
  };
}

let broadcastTimer = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const s = snapshot();
    for (const w of [mainWin, setupWin]) if (w && !w.isDestroyed()) w.webContents.send('state', s);
  }, 30);
}

// ---------- whisper model ----------

async function loadModel() {
  const id = config.get('model');
  if (!isInstalled(id)) {
    whisper.stop();
    whisper.setState('error', `${(byId(id) || {}).name || id} is not downloaded yet`);
    return;
  }
  try {
    await whisper.load(modelPath(id), { useGpu: config.get('backend') !== 'cpu' });
  } catch (e) {
    console.error('[whisper]', e.message);
  }
}

whisper.on('state', broadcast);
models.on('change', broadcast);
models.on('progress', broadcast);
models.on('installed', (id) => {
  if (id === config.get('model') && !controller.busy) loadModel();
});
controller.on('history', () => {
  for (const w of [mainWin]) if (w && !w.isDestroyed()) w.webContents.send('history', history.list());
});
controller.on('need-model', () => {
  if (!isInstalled(config.get('model'))) openMain('models');
  loadModel();
});
controller.on('practice-text', (text) => {
  if (setupWin && !setupWin.isDestroyed()) setupWin.webContents.send('practice-text', text);
});

config.on('change', (keys) => {
  if (keys.includes('model') || keys.includes('backend')) {
    if (!controller.busy) loadModel();
  }
  if (keys.some((k) => ['combo', 'mode'].includes(k))) {
    const f = fmt();
    if (hyprland.isAdded(f)) hyprland.addBinds(f, config.get('combo'), config.get('mode')).then(broadcast);
  }
  broadcast();
});

// ---------- overlay ----------

function createOverlay() {
  overlay = new BrowserWindow({
    title: 'Murmur overlay',
    width: hyprland.OVERLAY.w,
    height: hyprland.OVERLAY.h,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: PRELOAD, backgroundThrottling: false }
  });
  overlay.on('page-title-updated', (e) => e.preventDefault());
  overlay.loadFile(path.join(RENDERER, 'overlay.html'));
  if (process.env.HYPRLAND_INSTANCE_SIGNATURE == null) {
    const d = screen.getPrimaryDisplay().workArea;
    overlay.setPosition(Math.round(d.x + (d.width - hyprland.OVERLAY.w) / 2), d.y + d.height - hyprland.OVERLAY.h);
  }
}

controller.on('view', (view) => {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.webContents.send('view', { ...view, accent: config.get('accent'), combo: config.get('combo') });
  clearTimeout(hideOverlayTimer);
  if (view.kind === 'hidden') {
    // Let the pill fade out before unmapping the window.
    hideOverlayTimer = setTimeout(() => overlay && !overlay.isDestroyed() && overlay.hide(), 260);
  } else if (!overlay.isVisible()) {
    overlay.showInactive();
  }
});

// The overlay only takes clicks where its pills are.
ipcMain.on('overlay:shape', (_e, rects) => {
  if (!overlay || overlay.isDestroyed() || !overlay.setShape) return;
  try {
    overlay.setShape(rects.map((r) => ({ x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) })));
  } catch {}
});

ipcMain.on('overlay:action', (_e, action) => {
  if (action === 'stop') controller.stop();
  else if (action === 'cancel') controller.cancel();
  else if (action === 'undo') controller.undo();
  else if (action === 'choose-input') {
    controller.cancel();
    openMain('models');
  }
});

// ---------- app windows ----------

function appWindow(title, width, height, page) {
  const win = new BrowserWindow({
    title,
    width,
    height,
    minWidth: 600,
    minHeight: 480,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: { preload: PRELOAD }
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.loadFile(path.join(RENDERER, page.file), { hash: page.hash || '' });
  win.once('ready-to-show', () => win.show());
  return win;
}

function openMain(page = 'transcripts') {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('navigate', page);
    mainWin.show();
    mainWin.focus();
    return;
  }
  mainWin = appWindow('Murmur', 1040, 780, { file: 'app.html', hash: page });
  mainWin.on('closed', () => { mainWin = null; });
}

function openSetup() {
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.show();
    setupWin.focus();
    return;
  }
  setupWin = appWindow('Murmur setup', 760, 640, { file: 'setup.html' });
  setupWin.on('closed', () => { setupWin = null; });
}

function open(page) {
  if (page === 'setup' || !config.get('firstRunDone')) openSetup();
  else openMain(page);
}

// ---------- IPC from the windows ----------

const handlers = {
  'state': () => snapshot(),
  'history': () => history.list(),
  'history:copy': (_e, id) => {
    const r = history.list().find((x) => x.id === id);
    if (r) clipboard.writeText(r.text);
  },
  'history:clear': () => { history.clear(); return history.list(); },
  'config:set': (_e, patch) => { config.set(patch); return snapshot(); },
  'model:download': (_e, id) => models.download(id).then(() => null, (e) => e.message),
  // Choose a model right away and let it load once the download is done.
  'model:choose': (_e, id) => {
    config.set({ model: id });
    return models.download(id).then(() => null, (e) => e.message);
  },
  'model:pick': async (_e, id) => {
    if (isInstalled(id)) {
      config.set({ model: id });
      return null;
    }
    try {
      await models.download(id);
      config.set({ model: id });
      return null;
    } catch (e) {
      return e.message;
    }
  },
  'models:show': () => { fs.mkdirSync(paths.models, { recursive: true }); output.openPath(paths.models); },
  'inputs:refresh': () => refreshInputs().then(snapshot),
  'shortcut:check': async (_e, keys) => {
    const own = hyprland.isAdded(fmt()) ? config.get('combo') : null;
    return binds.check(keys, await hyprland.existingBinds(own));
  },
  'hypr:add': async (_e, f) => {
    f = f || fmt();
    await hyprland.addBinds(f, config.get('combo'), config.get('mode'));
    return snapshot();
  },
  'hypr:remove': async (_e, f) => {
    await hyprland.removeBinds(f || fmt());
    return snapshot();
  },
  'practice:start': () => controller.start({ mode: 'hold', sink: 'practice' }),
  'practice:stop': () => controller.stop(),
  'setup:finish': () => { config.set({ firstRunDone: true }); },
  'open': (_e, page) => {
    if (setupWin && !setupWin.isDestroyed()) setupWin.close();
    openMain(page);
  },
  'window:close': (e) => BrowserWindow.fromWebContents(e.sender)?.close(),
  'autostart:set': async (_e, on) => {
    autostartOn = await autostart.set(on);
    broadcast();
    return autostartOn;
  },
  'window:minimize': (e) => BrowserWindow.fromWebContents(e.sender)?.minimize()
};
for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);

// ---------- CLI socket ----------

function status() {
  const c = config.all();
  const sel = byId(c.model) || byId('turbo');
  return {
    running: true,
    state: controller.busy ? 'listening' : controller.view.kind === 'hidden' ? 'idle' : controller.view.kind,
    model: sel.name,
    whisper: whisper.state,
    error: whisper.error,
    backend: backendLabel(c.backend),
    shortcut: binds.id(c.combo) + ' · ' + c.mode,
    input: c.input === 'default' ? 'default (PipeWire)' : inputLabel()
  };
}

function serveSocket() {
  try { fs.unlinkSync(paths.socket); } catch {}
  const server = net.createServer((sock) => {
    let buf = '';
    sock.on('data', (d) => {
      buf += d;
      const i = buf.indexOf('\n');
      if (i === -1) return;
      let msg = {};
      try { msg = JSON.parse(buf.slice(0, i)); } catch {}
      let reply = { ok: true };
      switch (msg.cmd) {
        case 'start': controller.start(); break;
        case 'stop': controller.stop(); break;
        case 'toggle': controller.toggle(); break;
        case 'cancel': controller.cancel(); break;
        case 'status': reply = status(); break;
        case 'open': open(msg.page); break;
        case 'set': {
          const allowed = { mode: ['hold', 'tap'], after: ['type', 'copy'], enter: [true, false], sound: [true, false] };
          if (allowed[msg.key] && allowed[msg.key].includes(msg.value)) config.set({ [msg.key]: msg.value });
          else reply = { ok: false, error: 'cannot set ' + msg.key };
          break;
        }
        case 'quit': setImmediate(() => app.quit()); break;
        default: reply = { ok: false, error: 'unknown command' };
      }
      sock.end(JSON.stringify(reply) + '\n');
    });
    sock.on('error', () => {});
  });
  server.listen(paths.socket);
  return server;
}

// ---------- lifecycle ----------

app.on('second-instance', (_e, argv) => {
  const i = argv.indexOf('--open');
  open(i !== -1 ? argv[i + 1] : 'transcripts');
});

app.on('window-all-closed', () => {
  // Keep running in the background; the overlay window is always there.
});

app.whenReady().then(async () => {
  serveSocket();
  const events = new hyprland.Events();
  events.on('configreloaded', broadcast);
  events.start();

  createOverlay();
  refreshInputs();
  loadModel();

  const argv = process.argv;
  const i = argv.indexOf('--open');
  if (i !== -1) open(argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : 'transcripts');
  else if (!config.get('firstRunDone')) openSetup();
  else if (!argv.includes('--hidden')) openMain();
});

app.on('before-quit', () => {
  whisper.stop();
  controller.cancel();
  try { fs.unlinkSync(paths.socket); } catch {}
});

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => app.quit());
