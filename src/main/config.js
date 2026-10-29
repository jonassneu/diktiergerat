'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const paths = require('./paths');

const DEFAULTS = {
  firstRunDone: false,
  model: 'turbo',
  backend: 'auto',
  lang: 'auto',
  input: 'default',
  combo: ['Super', 'Ctrl', 'Space'],
  mode: 'hold',
  after: 'type',
  enter: false,
  sound: true,
  fmt: null,
  accent: '#346BF1'
};

class Config extends EventEmitter {
  constructor(file = paths.config) {
    super();
    this.file = file;
    this.values = { ...DEFAULTS };
    try {
      Object.assign(this.values, JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('[config] could not read', file, e.message);
    }
  }

  get(key) { return this.values[key]; }

  all() { return { ...this.values }; }

  set(patch) {
    const changed = Object.keys(patch).filter((k) => JSON.stringify(this.values[k]) !== JSON.stringify(patch[k]));
    if (!changed.length) return;
    Object.assign(this.values, patch);
    this.save();
    this.emit('change', changed, this.all());
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2) + '\n');
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Config, DEFAULTS };
