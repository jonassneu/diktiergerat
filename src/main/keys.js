'use strict';
// Simulated key presses, through whichever tool works on this desktop:
//   wtype    Hyprland, Sway and other wlroots compositors
//   xdotool  X11 sessions
//   ydotool  everything else (GNOME, KDE, COSMIC on Wayland); talks to the
//            kernel through /dev/uinput, so it works on any compositor
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const desktop = require('./desktop');

// Linux input event codes, for ydotool.
const CODES = { ctrl: 29, shift: 42, v: 47, Return: 28, BackSpace: 14 };

function exec(cmd, args, env) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 20000, env: env ? { ...process.env, ...env } : process.env }, (err, _out, stderr) => {
      if (err) {
        err.message = (String(stderr || '').trim() || err.message);
        reject(err);
      } else resolve();
    });
  });
}

function ydotoolSocket() {
  if (process.env.YDOTOOL_SOCKET) return process.env.YDOTOOL_SOCKET;
  const own = path.join(process.env.XDG_RUNTIME_DIR || '/tmp', '.ydotool_socket');
  return fs.existsSync(own) ? own : '/tmp/.ydotool_socket';
}

let chosen; // cached { tool, problem }

async function pick() {
  if (chosen && chosen.tool) return chosen;
  const order = desktop.session === 'x11'
    ? ['xdotool', 'ydotool']
    : desktop.wtypeWorks() ? ['wtype', 'ydotool'] : ['ydotool', 'wtype'];
  let problem = null;
  for (const tool of order) {
    if (!(await desktop.has(tool))) continue;
    if (tool === 'ydotool' && !fs.existsSync(ydotoolSocket())) {
      problem = 'ydotool is installed but its service (ydotoold) is not running';
      continue;
    }
    if (tool === 'wtype' && !desktop.wtypeWorks()) continue;
    chosen = { tool, problem: null };
    return chosen;
  }
  if (!problem) {
    problem = desktop.session === 'x11' ? 'xdotool is not installed'
      : desktop.wtypeWorks() ? 'wtype is not installed' : 'ydotool is not installed';
  }
  chosen = { tool: null, problem };
  return chosen;
}

// combo is a list like ['ctrl', 'shift', 'v'].
async function press(combo) {
  const { tool, problem } = await pick();
  if (!tool) throw new Error(problem);
  const mods = combo.slice(0, -1);
  const key = combo[combo.length - 1];
  if (tool === 'wtype') {
    const args = [];
    for (const m of mods) args.push('-M', m);
    args.push('-k', key);
    for (const m of mods.slice().reverse()) args.push('-m', m);
    return exec('wtype', args);
  }
  if (tool === 'xdotool') {
    const name = { Return: 'Return', BackSpace: 'BackSpace' }[key] || key;
    return exec('xdotool', ['key', '--clearmodifiers', mods.concat([name]).join('+')]);
  }
  const codes = combo.map((k) => CODES[k]);
  const seq = codes.map((c) => c + ':1').concat(codes.slice().reverse().map((c) => c + ':0'));
  const env = { YDOTOOL_SOCKET: ydotoolSocket() };
  try {
    return await exec('ydotool', ['key', ...seq], env);
  } catch (e) {
    // ydotool before 1.0 (Ubuntu 22.04) only knows key names.
    return exec('ydotool', ['key', combo.join('+')], env);
  }
}

async function repeat(key, count) {
  const { tool } = await pick();
  if (count <= 0) return;
  if (tool === 'wtype') {
    const args = [];
    for (let i = 0; i < count; i++) args.push('-k', key);
    return exec('wtype', args);
  }
  if (tool === 'xdotool') return exec('xdotool', ['key', '--clearmodifiers', ...Array(count).fill(key)]);
  for (let i = 0; i < count; i++) await press([key]);
}

// Last resort when pasting is not possible: type character by character.
async function type(text) {
  const { tool, problem } = await pick();
  if (!tool) throw new Error(problem);
  if (tool === 'wtype') return exec('wtype', ['--', text]);
  if (tool === 'xdotool') return exec('xdotool', ['type', '--clearmodifiers', '--', text]);
  return exec('ydotool', ['type', '--', text], { YDOTOOL_SOCKET: ydotoolSocket() });
}

async function status() {
  chosen = null;
  return pick();
}

module.exports = { press, repeat, type, status, pick };
