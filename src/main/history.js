'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const KEEP_DAYS = 30;

// Transcript history. Text only: audio is never written anywhere.
class History {
  constructor(file = paths.history) {
    this.file = file;
    this.items = [];
    try {
      this.items = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    this.prune();
  }

  prune() {
    const cutoff = Date.now() - KEEP_DAYS * 864e5;
    this.items = this.items.filter((r) => r.ts >= cutoff);
  }

  add(entry) {
    const item = { id: Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now(), ...entry };
    this.items.unshift(item);
    this.prune();
    this.save();
    return item;
  }

  update(id, patch) {
    const r = this.items.find((x) => x.id === id);
    if (r) {
      Object.assign(r, patch);
      this.save();
    }
  }

  remove(id) {
    this.items = this.items.filter((x) => x.id !== id);
    this.save();
  }

  clear() {
    this.items = [];
    this.save();
  }

  list() {
    this.prune();
    return this.items.slice();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.items));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { History, KEEP_DAYS };
