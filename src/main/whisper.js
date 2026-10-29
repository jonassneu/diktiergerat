'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const paths = require('./paths');
const { toWav } = require('./audio');

const SERVER = path.join(paths.bin, 'whisper-server');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function builtBackend() {
  try {
    return fs.readFileSync(path.join(paths.bin, 'backend'), 'utf8').trim();
  } catch {
    return null;
  }
}

// Whisper hallucinates these on silence or noise.
const JUNK = /^\s*(\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+|\.+)\s*$/;

function clean(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.replace(/\[(BLANK_AUDIO|MUSIC|NOISE|SILENCE)\]/gi, '').trim())
    .filter((l) => l && !JUNK.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Keeps one whisper-server process alive with the chosen model loaded.
class Whisper extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.port = null;
    this.state = 'stopped'; // stopped | loading | ready | error
    this.error = null;
    this.model = null;
    this.useGpu = true;
    this.loadStarted = 0;
    this.queue = Promise.resolve();
  }

  available() {
    return fs.existsSync(SERVER);
  }

  backend() {
    return builtBackend();
  }

  setState(state, error = null) {
    this.state = state;
    this.error = error;
    this.emit('state', state, error);
  }

  async load(modelFile, { useGpu = true } = {}) {
    if (this.proc && this.model === modelFile && this.useGpu === useGpu && this.state !== 'error') return this.ready();
    this.stop();
    if (!this.available()) {
      this.setState('error', 'whisper-server is not installed. Run scripts/build-whisper.sh.');
      return;
    }
    if (!fs.existsSync(modelFile)) {
      this.setState('error', 'Model file is missing: ' + paths.pretty(modelFile));
      return;
    }
    this.model = modelFile;
    this.useGpu = useGpu;
    this.port = await freePort();
    const args = ['-m', modelFile, '--host', '127.0.0.1', '--port', String(this.port), '-nt', '-t', '4'];
    if (useGpu) args.push('-fa');
    else args.push('-ng');
    this.loadStarted = Date.now();
    this.setState('loading');
    const proc = spawn(SERVER, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    this.proc = proc;
    let log = '';
    proc.stderr.on('data', (d) => {
      log = (log + d).slice(-4000);
    });
    proc.on('exit', (code, sig) => {
      if (this.proc !== proc) return;
      this.proc = null;
      const last = log.trim().split('\n').slice(-3).join(' ');
      this.setState('error', `whisper-server stopped (${sig || code}). ${last}`);
    });
    this._waitReady(proc);
    return this.ready();
  }

  async _waitReady(proc) {
    for (let i = 0; i < 600 && this.proc === proc; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) {
          // A first tiny request builds the GPU pipelines, so the user's
          // first real dictation is not the slow one.
          await this._infer(Buffer.alloc(16000 * 2), { language: 'en' }).catch(() => {});
          if (this.proc === proc) this.setState('ready');
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  ready() {
    if (this.state === 'ready') return Promise.resolve();
    if (this.state !== 'loading') return Promise.reject(new Error(this.error || 'Whisper is not running'));
    return new Promise((resolve, reject) => {
      const on = (state, err) => {
        if (state === 'ready') { this.off('state', on); resolve(); }
        else if (state === 'error' || state === 'stopped') { this.off('state', on); reject(new Error(err || 'Whisper stopped')); }
      };
      this.on('state', on);
    });
  }

  // Rough load progress for the "warming up" pill. whisper-server does not
  // report it, so this grows with time against the model size.
  loadProgress() {
    if (this.state === 'ready') return 1;
    if (this.state !== 'loading') return 0;
    let mb = 500;
    try { mb = fs.statSync(this.model).size / 1e6; } catch {}
    const expected = 1500 + mb * 2.5; // ms
    return Math.min(0.95, (Date.now() - this.loadStarted) / expected);
  }

  transcribe(pcm, opts = {}) {
    // whisper-server handles one request at a time; queue ours so a live
    // preview never overtakes the final pass.
    const run = () => this._infer(pcm, opts).then(clean);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async _infer(pcm, { language = 'auto', prompt = '' } = {}) {
    const form = new FormData();
    form.append('file', new Blob([toWav(pcm)], { type: 'audio/wav' }), 'audio.wav');
    form.append('response_format', 'json');
    form.append('temperature', '0.0');
    form.append('language', language || 'auto');
    form.append('suppress_nst', 'true');
    if (prompt) form.append('prompt', prompt);
    const res = await fetch(`http://127.0.0.1:${this.port}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error('whisper-server: HTTP ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.text || '';
  }

  stop() {
    const proc = this.proc;
    this.proc = null;
    if (proc) proc.kill('SIGTERM');
    if (this.state !== 'stopped') this.setState('stopped');
  }
}

module.exports = { Whisper, clean, builtBackend };
