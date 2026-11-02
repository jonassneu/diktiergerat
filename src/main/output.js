'use strict';
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const paths = require('./paths');

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { timeout: 20000 }, (err) => (err ? reject(err) : resolve()));
    if (input != null) {
      p.stdin.end(input);
    }
  });
}

// Types text into the focused window through the virtual keyboard protocol.
function type(text) {
  return run('wtype', ['--', text]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function read(args) {
  return new Promise((resolve) => {
    execFile('wl-paste', args, { encoding: 'buffer', timeout: 2000, maxBuffer: 64 * 1024 * 1024 }, (err, out) => resolve(err ? null : out));
  });
}

// Current clipboard as { type, data }, or null when empty.
async function saveClipboard() {
  const list = await read(['--list-types']);
  if (!list) return null;
  const types = list.toString().split('\n').map((t) => t.trim()).filter(Boolean);
  if (!types.length) return null;
  const type = types.find((t) => /^text\/plain;charset=utf-8$/i.test(t)) || types[0];
  const data = await read(['--no-newline', '--type', type]);
  return data ? { type, data } : null;
}

function restoreClipboard(saved) {
  if (!saved) return run('wl-copy', ['--clear']).catch(() => {});
  return new Promise((resolve) => {
    const p = spawn('wl-copy', ['--type', saved.type], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    p.on('error', () => resolve());
    p.stdin.end(saved.data, () => resolve());
    p.unref();
  });
}

// Terminals paste with Ctrl+Shift+V, everything else with Ctrl+V.
const TERMINALS = /^(kitty|alacritty|foot|footclient|org\.wezfurlong\.wezterm|wezterm|com\.mitchellh\.ghostty|ghostty|org\.kde\.konsole|konsole|gnome-terminal-server|org\.gnome\.terminal|org\.gnome\.console|kgx|xterm|uxterm|tilix|com\.gexperts\.tilix|terminator|xfce4-terminal|st|st-256color|urxvt|rio|warp)$/i;

// Drops the whole text in at once: put it on the clipboard, press paste,
// then put back whatever was on the clipboard before.
async function paste(text, windowClass) {
  const saved = await saveClipboard();
  await copy(text);
  // wl-copy takes a moment to own the selection; wait until it does.
  for (let i = 0; i < 25; i++) {
    const now = await read(['--no-newline', '--type', 'text/plain;charset=utf-8']);
    if (now && now.toString() === text) break;
    await sleep(20);
  }
  const term = TERMINALS.test(windowClass || '');
  await run('wtype', term ? ['-M', 'ctrl', '-M', 'shift', '-k', 'v', '-m', 'shift', '-m', 'ctrl'] : ['-M', 'ctrl', '-k', 'v', '-m', 'ctrl']);
  // Give the app time to fetch the text before the old clipboard returns.
  setTimeout(() => restoreClipboard(saved), 400);
}

function pressEnter() {
  return run('wtype', ['-k', 'Return']);
}

function backspace(count) {
  if (count <= 0) return Promise.resolve();
  const args = [];
  for (let i = 0; i < count; i++) args.push('-k', 'BackSpace');
  return run('wtype', args);
}

function copy(text) {
  return new Promise((resolve, reject) => {
    // wl-copy forks to serve the clipboard, so do not wait for it to exit.
    const p = spawn('wl-copy', [], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    p.on('error', reject);
    p.stdin.end(text, () => resolve());
    p.unref();
  });
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
