'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const paths = require('./paths');

const CATALOG = [
  { id: 'tiny', name: 'tiny', file: 'ggml-tiny.bin', mb: 75, size: '75 MB', desc: 'Instant, rough drafts', speed: 5, acc: 1 },
  { id: 'base', name: 'base', file: 'ggml-base.bin', mb: 142, size: '142 MB', desc: 'Quick notes on older machines', speed: 5, acc: 2 },
  { id: 'small', name: 'small', file: 'ggml-small.bin', mb: 466, size: '466 MB', desc: 'Good balance on a CPU', speed: 4, acc: 3, tag: 'Best on CPU' },
  { id: 'medium', name: 'medium', file: 'ggml-medium.bin', mb: 1500, size: '1.5 GB', desc: 'More accurate, slow on a CPU', speed: 2, acc: 4 },
  { id: 'turbo', name: 'large-v3-turbo', file: 'ggml-large-v3-turbo.bin', mb: 1500, size: '1.5 GB', desc: 'Near-best accuracy, fast on a GPU', speed: 4, acc: 4, tag: 'Best with a GPU' },
  { id: 'large', name: 'large-v3', file: 'ggml-large-v3.bin', mb: 2900, size: '2.9 GB', desc: 'Most accurate, and the slowest', speed: 1, acc: 5 }
];

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

// Other local Whisper apps keep the same ggml files. Reusing them saves a download.
const FOREIGN_DIRS = [
  path.join(paths.home, '.local/share/com.pais.handy/models'),
  path.join(paths.home, '.local/share/quickwhisper/models'),
  path.join(paths.home, '.local/share/pywhispercpp/models'),
  path.join(paths.home, '.cache/whisper')
];

function byId(id) {
  return CATALOG.find((m) => m.id === id) || null;
}

function modelPath(id) {
  const m = byId(id);
  return m ? path.join(paths.models, m.file) : null;
}

function isInstalled(id) {
  const p = modelPath(id);
  try {
    return !!p && fs.statSync(p).size > 1e6;
  } catch {
    return false;
  }
}

function findForeign(m) {
  for (const dir of FOREIGN_DIRS) {
    const p = path.join(dir, m.file);
    try {
      if (fs.statSync(p).size > m.mb * 0.9e6) return p;
    } catch {}
  }
  return null;
}

class Models extends EventEmitter {
  constructor() {
    super();
    this.downloads = new Map(); // id -> { pct, abort }
  }

  list() {
    return CATALOG.map((m) => ({
      ...m,
      installed: isInstalled(m.id),
      local: !isInstalled(m.id) && !!findForeign(m),
      pct: this.downloads.has(m.id) ? this.downloads.get(m.id).pct : null
    }));
  }

  usedBytes() {
    return CATALOG.filter((m) => isInstalled(m.id)).reduce((t, m) => {
      try { return t + fs.statSync(modelPath(m.id)).size; } catch { return t; }
    }, 0);
  }

  async download(id) {
    const m = byId(id);
    if (!m) throw new Error('Unknown model ' + id);
    if (isInstalled(id)) return modelPath(id);
    if (this.downloads.has(id)) return this.downloads.get(id).promise;

    const entry = { pct: 0, abort: new AbortController() };
    entry.promise = this._download(m, entry).then((dest) => {
      this.emit('installed', id);
      return dest;
    }).finally(() => {
      this.downloads.delete(id);
      this.emit('change');
    });
    this.downloads.set(id, entry);
    this.emit('change');
    return entry.promise;
  }

  async _download(m, entry) {
    fs.mkdirSync(paths.models, { recursive: true });
    const dest = path.join(paths.models, m.file);

    const foreign = findForeign(m);
    if (foreign) {
      try {
        fs.linkSync(foreign, dest);
      } catch {
        fs.symlinkSync(foreign, dest);
      }
      entry.pct = 100;
      return dest;
    }

    const tmp = dest + '.part';
    const res = await fetch(BASE_URL + m.file, { signal: entry.abort.signal, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error('Download failed: HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || m.mb * 1e6;
    let got = 0;
    let lastEmit = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', (chunk) => {
      got += chunk.length;
      entry.pct = Math.min(99, Math.floor((got / total) * 100));
      const now = Date.now();
      if (now - lastEmit > 150) {
        lastEmit = now;
        this.emit('progress', m.id, entry.pct);
      }
    });
    try {
      await pipeline(body, fs.createWriteStream(tmp));
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
    fs.renameSync(tmp, dest);
    entry.pct = 100;
    return dest;
  }

  cancel(id) {
    const d = this.downloads.get(id);
    if (d) d.abort.abort();
  }
}

module.exports = { Models, CATALOG, byId, modelPath, isInstalled };
