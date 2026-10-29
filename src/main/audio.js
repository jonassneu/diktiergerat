'use strict';
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');

const RATE = 16000;
const BYTES_PER_SEC = RATE * 2;

// Records 16 kHz mono s16le from PipeWire through pw-record.
class Recorder extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.chunks = [];
    this.bytes = 0;
    this.peak = 0;
  }

  get seconds() { return this.bytes / BYTES_PER_SEC; }

  start(target) {
    this.stop();
    this.chunks = [];
    this.bytes = 0;
    this.peak = 0;
    const args = ['--rate', String(RATE), '--channels', '1', '--format', 's16', '--raw', '--latency', '30ms'];
    if (target && target !== 'default') args.push('--target', target);
    args.push('-');
    const proc = spawn('pw-record', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.stdout.on('data', (buf) => {
      if (this.proc !== proc) return;
      this.chunks.push(buf);
      this.bytes += buf.length;
      const level = rms(buf);
      if (level > this.peak) this.peak = level;
      this.emit('level', level);
    });
    proc.on('error', (e) => this.emit('failed', e.message));
    proc.on('exit', (code) => {
      if (this.proc === proc && code) this.emit('failed', stderr.trim() || 'pw-record exited with ' + code);
    });
  }

  // Everything captured so far, without stopping.
  snapshot() {
    return Buffer.concat(this.chunks, this.bytes);
  }

  stop() {
    const proc = this.proc;
    this.proc = null;
    if (proc) proc.kill('SIGTERM');
    return this.snapshot();
  }
}

function rms(buf) {
  const n = Math.floor(buf.length / 2);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = buf.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

// Overall loudness of a whole take, used to skip transcribing silence.
function speechLevel(pcm) {
  const win = RATE / 50; // 20 ms windows
  const levels = [];
  for (let off = 0; off + win * 2 <= pcm.length; off += win * 2) levels.push(rms(pcm.subarray(off, off + win * 2)));
  if (!levels.length) return 0;
  levels.sort((a, b) => b - a);
  return levels[Math.floor(levels.length * 0.1)]; // 90th percentile
}

function toWav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(BYTES_PER_SEC, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function listInputs() {
  return new Promise((resolve) => {
    execFile('pactl', ['-f', 'json', 'list', 'sources'], { timeout: 3000 }, (err, out) => {
      if (err) return resolve([]);
      try {
        const sources = JSON.parse(out).filter((s) => !s.monitor_source && !/\.monitor$/.test(s.name));
        resolve(sources.map((s) => ({ name: s.name, label: s.description || s.name })));
      } catch {
        resolve([]);
      }
    });
  });
}

function defaultInput() {
  return new Promise((resolve) => {
    execFile('pactl', ['get-default-source'], { timeout: 3000 }, (err, out) => resolve(err ? null : out.trim() || null));
  });
}

module.exports = { Recorder, RATE, BYTES_PER_SEC, toWav, speechLevel, listInputs, defaultInput };
