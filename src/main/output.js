'use strict';
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const paths = require('./paths');
const desktop = require('./desktop');
const keys = require('./keys');

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { timeout: 20000 }, (err) => (err ? reject(err) : resolve()));
    if (input != null) {
      p.stdin.end(input);
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- clipboard ----------
// wl-clipboard on Wayland. Under GNOME (no data-control protocol) and on X11,
// Electron's own clipboard, which the compositor shares with Wayland apps.

function electronClipboard() {
  try {
    return require('electron').clipboard;
  } catch {
    return null;
  }
}

function useWl() {
  return desktop.session === 'wayland' && desktop.desktop !== 'gnome' && !!process.env.WAYLAND_DISPLAY;
}

function read(args) {
  return new Promise((resolve) => {
    execFile('wl-paste', args, { encoding: 'buffer', timeout: 2000, maxBuffer: 64 * 1024 * 1024 }, (err, out) => resolve(err ? null : out));
  });
}

function wlCopy(data, type) {
  return new Promise((resolve, reject) => {
    // wl-copy forks to serve the clipboard, so do not wait for it to exit.
    const p = spawn('wl-copy', type ? ['--type', type] : [], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    p.on('error', reject);
    p.stdin.end(data, () => resolve());
    p.unref();
  });
}

async function copy(text) {
  const cb = electronClipboard();
  if (useWl()) {
    try {
      await wlCopy(text);
      return;
    } catch (e) {
      if (!cb) throw e;
    }
  }
  if (!cb) throw new Error('no clipboard available');
  cb.writeText(text);
}

async function clipboardText() {
  if (useWl()) {
    const out = await read(['--no-newline', '--type', 'text/plain;charset=utf-8']);
    return out ? out.toString() : null;
  }
  const cb = electronClipboard();
  return cb ? cb.readText() : null;
}

// Current clipboard, so it can be put back after pasting. null when empty.
async function saveClipboard() {
  if (useWl()) {
    const list = await read(['--list-types']);
    if (!list) return null;
    const types = list.toString().split('\n').map((t) => t.trim()).filter(Boolean);
    if (!types.length) return null;
    const type = types.find((t) => /^text\/plain;charset=utf-8$/i.test(t)) || types[0];
    const data = await read(['--no-newline', '--type', type]);
    return data ? { wl: true, type, data } : null;
  }
  const cb = electronClipboard();
  if (!cb) return null;
  const formats = cb.availableFormats();
  if (!formats.length) return null;
  if (formats.some((f) => f.startsWith('image/'))) return { image: cb.readImage() };
  if (formats.includes('text/html')) return { text: cb.readText(), html: cb.readHTML() };
  return { text: cb.readText() };
}

function restoreClipboard(saved) {
  if (useWl()) {
    if (!saved) return run('wl-copy', ['--clear']).catch(() => {});
    return wlCopy(saved.data, saved.type).catch(() => {});
  }
  const cb = electronClipboard();
  if (!cb) return;
  if (!saved) cb.clear();
  else if (saved.image) cb.writeImage(saved.image);
  else cb.write({ text: saved.text, html: saved.html });
}

// ---------- typing ----------

// Terminals paste with Ctrl+Shift+V, everything else with Ctrl+V.
const TERMINALS = /^(kitty|alacritty|foot|footclient|org\.wezfurlong\.wezterm|wezterm|com\.mitchellh\.ghostty|ghostty|org\.kde\.konsole|konsole|gnome-terminal-server|org\.gnome\.terminal|org\.gnome\.console|org\.gnome\.ptyxis|ptyxis|kgx|xterm|uxterm|tilix|com\.gexperts\.tilix|terminator|xfce4-terminal|st|st-256color|urxvt|rio|warp|blackbox|com\.raggesilver\.blackbox|lxterminal|mate-terminal|qterminal|deepin-terminal|io\.elementary\.terminal|cosmic-term|com\.system76\.cosmicterm)$/i;

// Drops the whole text in at once: put it on the clipboard, press paste.
// With restore, whatever was on the clipboard before comes back afterwards.
async function paste(text, windowClass, { restore = true } = {}) {
  const saved = restore ? await saveClipboard() : null;
  await copy(text);
  // wl-copy takes a moment to own the selection; wait until it does.
  for (let i = 0; i < 25; i++) {
    if ((await clipboardText()) === text) break;
    await sleep(20);
  }
  const term = TERMINALS.test(windowClass || '');
  await keys.press(term ? ['ctrl', 'shift', 'v'] : ['ctrl', 'v']);
  // Give the app time to fetch the text before the old clipboard returns.
  if (restore) setTimeout(() => restoreClipboard(saved), 400);
}

function type(text) {
  return keys.type(text);
}

function pressEnter() {
  return keys.press(['Return']);
}

function backspace(count) {
  return keys.repeat('BackSpace', count);
}

// Short, soft ticks for start and stop, written once as WAV files.
function tone(freq, ms, gain) {
  const rate = 48000;
  const n = Math.floor((rate * ms) / 1000);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, i / (rate * 0.004)) * Math.exp(-t * 38);
    const v = Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.18;
    pcm.writeInt16LE(Math.round(v * env * gain * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const SOUNDS = { start: [1320, 110, 0.22], stop: [880, 120, 0.22], error: [330, 180, 0.2] };

function soundFile(name) {
  const file = path.join(paths.sounds, name + '.wav');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(paths.sounds, { recursive: true });
    fs.writeFileSync(file, tone(...SOUNDS[name]));
  }
  return file;
}

function play(name) {
  try {
    const p = spawn('pw-play', [soundFile(name)], { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch {}
}

function openPath(p) {
  const c = spawn('xdg-open', [p], { stdio: 'ignore', detached: true });
  c.on('error', () => {});
  c.unref();
}

module.exports = { type, paste, pressEnter, backspace, copy, play, openPath };
