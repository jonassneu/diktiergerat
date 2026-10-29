'use strict';
const { EventEmitter } = require('events');
const { Recorder, speechLevel, defaultInput, BYTES_PER_SEC } = require('./audio');
const output = require('./output');
const hyprland = require('./hyprland');
const models = require('./models');

const MIN_SECONDS = 0.35; // shorter presses are treated as accidental
const SILENCE_LEVEL = 0.015; // 90th percentile RMS below this counts as silence (room noise here is ~0.007)
const MAX_SECONDS = 600;
const LINGER = { typed: 4200, copied: 4200, nothing: 2600, nomic: 6000, error: 6000 };

function words(text) {
  return text.split(/\s+/).filter(Boolean);
}

// The dictation flow: listen -> transcribe -> type (or copy), and the overlay
// state that goes with each step. Emits 'view' with the overlay state.
class Controller extends EventEmitter {
  constructor({ config, whisper, history }) {
    super();
    this.config = config;
    this.whisper = whisper;
    this.history = history;
    this.recorder = new Recorder();
    this.view = { kind: 'hidden' };
    this.session = null;
    this.last = null; // last delivery, for Undo
    this.hideTimer = null;
    this.tickTimer = null;
    this.levels = [];

    this.recorder.on('level', (lv) => {
      this.levels.push(lv);
      if (this.levels.length > 64) this.levels.shift();
    });
    this.recorder.on('failed', (msg) => {
      if (!this.session) return;
      console.error('[audio]', msg);
      this.finish();
      this.show({ kind: 'nomic' });
    });
  }

  get busy() {
    return !!this.session;
  }

  show(view) {
    clearTimeout(this.hideTimer);
    this.view = view;
    this.emit('view', view);
    const ms = LINGER[view.kind];
    if (ms) this.hideTimer = setTimeout(() => this.show({ kind: 'hidden' }), ms);
  }

  async start({ mode, sink } = {}) {
    if (this.session) return;
    mode = mode || this.config.get('mode');
    const input = this.config.get('input');
    if (input === 'default' && !(await defaultInput())) {
      this.show({ kind: 'nomic' });
      return;
    }
    const target = sink === 'practice' ? null : await hyprland.activeWindow();
    this.session = {
      mode,
      sink: sink || 'focused',
      target,
      startedAt: Date.now(),
      partial: '',
      partialAt: 0,
      partialBusy: false,
      partialCost: 0,
      stopping: false
    };
    this.levels = [];
    this.recorder.start(input);
    if (this.config.get('sound')) output.play('start');

    // Make sure the model is (being) loaded. Audio is captured meanwhile.
    if (this.whisper.state !== 'ready' && this.whisper.state !== 'loading') this.emit('need-model');
    this.tick();
    this.tickTimer = setInterval(() => this.tick(), 100);
  }

  tick() {
    const s = this.session;
    if (!s || s.stopping) return;
    const secs = this.recorder.seconds;
    if (secs > MAX_SECONDS) return this.stop();
    if (Date.now() - s.startedAt > 1500 && this.recorder.bytes === 0) {
      this.finish();
      this.show({ kind: 'nomic' });
      return;
    }
    if (this.whisper.state === 'loading') {
      const m = models.CATALOG.find((x) => models.modelPath(x.id) === this.whisper.model);
      this.show({ kind: 'warming', model: m ? m.name : 'model', progress: this.whisper.loadProgress() });
      return;
    }
    if (this.whisper.state === 'ready') this.partial();
    const all = words(s.partial);
    const cut = Math.max(0, all.length - 2);
    this.show({
      kind: 'listening',
      mode: s.mode,
      settled: all.slice(0, cut).join(' '),
      live: all.slice(cut).join(' '),
      secs: Math.floor(secs),
      levels: this.levels.slice(-30)
    });
  }

  // Live preview: re-transcribe what we have so far, at most one at a time.
  partial() {
    const s = this.session;
    const secs = this.recorder.seconds;
    const gap = Math.max(0.6, s.partialCost * 1.5);
    if (s.partialBusy || secs < 0.8 || secs - s.partialAt < gap) return;
    s.partialAt = secs;
    const pcm = this.recorder.snapshot();
    if (speechLevel(pcm) < SILENCE_LEVEL) return; // whisper invents words on silence
    s.partialBusy = true;
    const t0 = Date.now();
    // The gap grows with how long a preview takes, so long takes or a slow
    // CPU model refresh less often instead of piling up.
    this.whisper.transcribe(pcm, { language: this.config.get('lang') }).then((text) => {
      if (this.session !== s || s.stopping) return;
      s.partial = text;
    }).catch(() => {}).finally(() => {
      s.partialBusy = false;
      s.partialCost = (Date.now() - t0) / 1000;
    });
  }

  toggle() {
    if (this.session) return this.stop();
    return this.start({ mode: 'tap' });
  }

  cancel() {
    if (!this.session) {
      if (this.view.kind !== 'hidden') this.show({ kind: 'hidden' });
      return;
    }
    this.finish();
    this.show({ kind: 'hidden' });
  }

  finish() {
    clearInterval(this.tickTimer);
    this.tickTimer = null;
    const pcm = this.recorder.stop();
    const s = this.session;
    this.session = null;
    return { pcm, s };
  }

  async stop() {
    const s = this.session;
    if (!s || s.stopping) return;
    s.stopping = true;
    const { pcm } = this.finish();
    this.session = s; // still busy until delivered
    if (this.config.get('sound')) output.play('stop');
    const secs = pcm.length / BYTES_PER_SEC;

    try {
      if (secs < MIN_SECONDS) {
        this.show({ kind: 'hidden' });
        return;
      }
      if (speechLevel(pcm) < SILENCE_LEVEL) {
        this.show({ kind: 'nothing' });
        return;
      }
      this.show({ kind: 'transcribing', text: s.partial });
      if (this.whisper.state !== 'ready') {
        if (this.whisper.state !== 'loading') this.emit('need-model');
        await this.whisper.ready();
      }
      const text = await this.whisper.transcribe(pcm, { language: this.config.get('lang') });
      if (!text) {
        this.show({ kind: 'nothing' });
        return;
      }
      await this.deliver(text, s, secs);
    } catch (e) {
      console.error('[dictation]', e);
      this.show({ kind: 'error', msg: String(e.message || e) });
    } finally {
      if (this.session === s) this.session = null;
    }
  }

  async deliver(text, s, secs) {
    const dur = Math.floor(secs / 60) + ':' + String(Math.round(secs % 60)).padStart(2, '0');
    if (s.sink === 'practice') {
      this.emit('practice-text', text);
      this.show({ kind: 'hidden' });
      this.history.add({ text, target: 'Murmur setup', dur });
      this.emit('history');
      return;
    }
    const now = await hyprland.activeWindow();
    const own = now && now.class === 'murmur' && /overlay/i.test(now.title);
    const window = own ? s.target : now;
    const enter = this.config.get('enter');

    if (this.config.get('after') === 'copy' || !window || !window.acceptsInput) {
      await output.copy(text);
      this.last = null;
      this.history.add({ text, target: 'Copied to clipboard', dur });
      this.emit('history');
      this.show({ kind: 'copied' });
      return;
    }

    const typed = text + (enter ? '' : ' ');
    await output.type(typed);
    if (enter) await output.pressEnter();
    const name = hyprland.windowName(window);
    this.last = enter ? null : { chars: Array.from(typed).length, address: window.address };
    this.history.add({ text, target: name, dur });
    this.emit('history');
    this.show({ kind: 'typed', words: words(text).length, target: name, canUndo: !enter });
  }

  async undo() {
    const last = this.last;
    this.last = null;
    if (!last) return;
    const now = await hyprland.activeWindow();
    if (now && now.address === last.address) await output.backspace(last.chars);
    this.show({ kind: 'hidden' });
  }
}

module.exports = { Controller };
