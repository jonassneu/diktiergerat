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

module.exports = { type, pressEnter, backspace, copy, play, openPath };
