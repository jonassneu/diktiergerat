'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFile } = require('child_process');
const { EventEmitter } = require('events');
const paths = require('./paths');
const binds = require('../shared/binds');

const BEGIN = { lua: '-- >>> murmur (managed by Murmur, remove from Settings)', conf: '# >>> murmur (managed by Murmur, remove from Settings)' };
const END = { lua: '-- <<< murmur', conf: '# <<< murmur' };

function hyprctl(args, timeout = 3000) {
  return new Promise((resolve, reject) => {
    execFile('hyprctl', args, { timeout }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

async function hyprJson(cmd) {
  try {
    return JSON.parse(await hyprctl(['-j', cmd]));
  } catch {
    return null;
  }
}

function running() {
  return !!process.env.HYPRLAND_INSTANCE_SIGNATURE;
}

function detectFormat() {
  return fs.existsSync(path.join(paths.hyprDir, 'hyprland.lua')) ? 'lua' : 'conf';
}

function bindsFile(fmt) {
  if (fmt === 'lua') {
    const split = path.join(paths.hyprDir, 'config', 'binds.lua');
    return fs.existsSync(split) ? split : path.join(paths.hyprDir, 'hyprland.lua');
  }
  return path.join(paths.hyprDir, 'hyprland.conf');
}

function fileName(fmt) {
  return path.basename(bindsFile(fmt));
}

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function blockRange(text, fmt) {
  const a = text.indexOf(BEGIN[fmt]);
  if (a === -1) return null;
  const b = text.indexOf(END[fmt], a);
  if (b === -1) return null;
  return [a, b + END[fmt].length];
}

function isAdded(fmt) {
  return !!blockRange(readFile(bindsFile(fmt)), fmt);
}

function stripBlock(text, fmt) {
  const r = blockRange(text, fmt);
  if (!r) return text;
  return (text.slice(0, r[0]).replace(/\n+$/, '\n') + text.slice(r[1]).replace(/^\n+/, '')).replace(/\n*$/, '\n');
}

// Writes (or rewrites) our block at the end of the binds file.
function addBinds(fmt, keys, mode, cmd) {
  const file = bindsFile(fmt);
  let body = binds.text(keys, mode, fmt, cmd);
  if (fmt === 'lua') body += '\n-- Murmur: keep the overlay floating, pinned and out of focus\n' + RULES.join('\n');
  const block = BEGIN[fmt] + '\n' + body + '\n' + END[fmt] + '\n';
  const text = stripBlock(readFile(file), fmt);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/\n*$/, '\n\n') + block);
  return reload();
}

function removeBinds(fmt) {
  const file = bindsFile(fmt);
  const text = readFile(file);
  if (!blockRange(text, fmt)) return Promise.resolve();
  fs.writeFileSync(file, stripBlock(text, fmt));
  return reload();
}

function reload() {
  if (!running()) return Promise.resolve();
  return hyprctl(['reload', 'config-only']).catch(() => {});
}

// Binds Hyprland currently knows about, minus our own.
async function existingBinds(own) {
  const list = (await hyprJson('binds')) || [];
  const ownMask = own ? binds.modmask(own.slice(0, -1)) : -1;
  const ownKey = own ? binds.hyprKey(own[own.length - 1]).toLowerCase() : null;
  return list
    .filter((b) => !b.mouse && !b.submap)
    .filter((b) => !(b.modmask === ownMask && String(b.key).toLowerCase() === ownKey))
    .map((b) => ({ modmask: b.modmask, key: b.key }));
}

async function activeWindow() {
  const w = await hyprJson('activewindow');
  if (!w || !w.address || w.address === '0x0' || !w.mapped) return null;
  return w;
}

// "Firefox", "kitty", "notes.md": what the overlay says it typed into.
function windowName(w) {
  if (!w) return 'the focused app';
  const cls = w.class || w.initialClass || '';
  const title = w.title || '';
  const editors = /^(code|code-oss|codium|vscodium|cursor|zed|dev\.zed\.zed|org\.gnome\.texteditor|org\.kde\.kate|gedit|sublime_text|obsidian)$/i;
  if (editors.test(cls)) {
    const file = title.split(/\s+[-—–•]\s+/)[0].replace(/^[●•*]\s*/, '').trim();
    if (file && file.length < 48) return file;
  }
  const desktop = desktopName(cls);
  return desktop || cls || title || 'the focused app';
}

const nameCache = new Map();
function desktopName(cls) {
  if (!cls) return null;
  if (nameCache.has(cls)) return nameCache.get(cls);
  let name = null;
  const dirs = [path.join(paths.home, '.local/share/applications'), '/usr/share/applications', '/var/lib/flatpak/exports/share/applications'];
  for (const dir of dirs) {
    const f = path.join(dir, cls + '.desktop');
    const alt = path.join(dir, cls.toLowerCase() + '.desktop');
    const text = readFile(f) || readFile(alt);
    const m = /^Name=(.+)$/m.exec(text);
    if (m) { name = m[1].trim(); break; }
  }
  nameCache.set(cls, name);
  return name;
}

// Window rules for our own windows. They live in the same managed block as
// the binds, so Murmur never has to change the running compositor itself.
const OVERLAY = { w: 760, h: 300 };
const RULES = [
  `hl.window_rule({ name = "murmur-overlay", match = { class = "^murmur$", title = "^Murmur overlay$" }, float = true, pin = true, no_initial_focus = true, no_focus = true, border_size = 0, no_shadow = true, no_blur = true, no_anim = true, rounding = 0, decorate = false, size = { ${OVERLAY.w}, ${OVERLAY.h} }, move = { "(monitor_w-${OVERLAY.w})/2", "monitor_h-${OVERLAY.h}" } })`,
  `hl.window_rule({ name = "murmur-window", match = { class = "^murmur$", title = "^Murmur$" }, float = true, center = true, size = { 1040, 780 }, border_size = 0, rounding = 20 })`,
  `hl.window_rule({ name = "murmur-setup", match = { class = "^murmur$", title = "^Murmur setup$" }, float = true, center = true, size = { 760, 640 }, border_size = 0, rounding = 20 })`
];

// Hyprland's event socket, for re-applying rules after a reload.
class Events extends EventEmitter {
  start() {
    const sig = process.env.HYPRLAND_INSTANCE_SIGNATURE;
    if (!sig) return;
    const sock = path.join(process.env.XDG_RUNTIME_DIR || '/tmp', 'hypr', sig, '.socket2.sock');
    const conn = net.createConnection(sock);
    let buf = '';
    conn.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        const [ev, data] = line.split('>>');
        this.emit(ev, data);
      }
    });
    conn.on('error', () => {});
    conn.on('close', () => setTimeout(() => this.start(), 3000));
  }
}

module.exports = {
  running, detectFormat, bindsFile, fileName, isAdded, addBinds, removeBinds, reload,
  existingBinds, activeWindow, windowName, Events, RULES, OVERLAY, stripBlock, BEGIN, END
};
