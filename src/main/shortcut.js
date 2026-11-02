'use strict';
// Catches the dictation shortcut, whichever way this desktop allows:
//   hyprland  binds in the Hyprland config (press + release)
//   portal    XDG GlobalShortcuts portal: KDE, GNOME 48+, COSMIC (press + release)
//   gnome     GNOME custom keyboard shortcut via gsettings (press only)
//   x11       Electron's global shortcut on X11 desktops (press only)
//   manual    the user binds `murmur toggle` in their own settings
const { EventEmitter } = require('events');
const { execFile } = require('child_process');
const desktop = require('./desktop');
const { Portal } = require('./portal');

const GNOME_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
const GNOME_PATH = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/murmur/';

function gsettings(args) {
  return new Promise((resolve) => {
    execFile('gsettings', args, { timeout: 3000 }, (err, out) => resolve(err ? null : String(out).trim()));
  });
}

function gnomeAccel(keys) {
  const mods = { Super: '<Super>', Ctrl: '<Control>', Alt: '<Alt>', Shift: '<Shift>' };
  const key = keys[keys.length - 1];
  const k = key === 'Space' ? 'space' : key.length === 1 ? key.toLowerCase() : key;
  return keys.slice(0, -1).map((m) => mods[m] || '').join('') + k;
}

function electronAccel(keys) {
  const mods = { Super: 'Super', Ctrl: 'Control', Alt: 'Alt', Shift: 'Shift' };
  return keys.slice(0, -1).map((m) => mods[m]).concat([keys[keys.length - 1]]).join('+');
}

class Shortcut extends EventEmitter {
  constructor({ config, controller, murmurCmd }) {
    super();
    this.config = config;
    this.controller = controller;
    this.cmd = murmurCmd || 'murmur';
    this.method = 'manual';
    this.portal = new Portal();
    this.state = { bound: false, detail: null, error: null };
    this.held = false;
  }

  // Hold works where the desktop reports the release of the keys.
  get canHold() {
    return this.method === 'hyprland' || this.method === 'portal';
  }

  mode() {
    return this.canHold ? this.config.get('mode') : 'tap';
  }

  async init() {
    if (desktop.desktop === 'hyprland') {
      this.method = 'hyprland';
    } else if (desktop.session === 'wayland' && await this.portal.connect()) {
      this.method = 'portal';
      this.portal.on('down', () => this.onDown());
      this.portal.on('up', () => this.onUp());
      this.portal.on('change', () => this.setState({ bound: !!this.portal.bound, detail: this.portal.bound }));
      // Re-binding after the first time is silent, so do it on every start.
      if (this.config.get('portalBound')) this.bind().catch(() => {});
    } else if (desktop.desktop === 'gnome' && await desktop.has('gsettings')) {
      this.method = 'gnome';
      this.setState({ bound: await this.gnomeAdded() });
    } else if (desktop.session === 'x11') {
      this.method = 'x11';
      this.registerX11();
    }
    this.emit('change');
  }

  setState(patch) {
    Object.assign(this.state, patch);
    this.emit('change');
  }

  onDown() {
    if (this.mode() === 'hold') {
      this.held = true;
      this.controller.start({ mode: 'hold' });
    } else {
      this.controller.toggle();
    }
  }

  onUp() {
    if (this.mode() === 'hold' && this.held) {
      this.held = false;
      this.controller.stop();
    }
  }

  // Called by the UI's "Set up shortcut" button.
  async bind() {
    try {
      if (this.method === 'portal') {
        const got = await this.portal.bind(this.config.get('combo'));
        this.config.set({ portalBound: true });
        this.setState({ bound: !!got, detail: got, error: null });
      } else if (this.method === 'gnome') {
        await this.gnomeAdd();
        this.setState({ bound: await this.gnomeAdded(), error: null });
      } else if (this.method === 'x11') {
        this.registerX11();
      }
    } catch (e) {
      this.setState({ error: e.message === 'cancelled' ? null : e.message });
    }
    return this.state;
  }

  async unbind() {
    if (this.method === 'gnome') {
      await this.gnomeRemove();
      this.setState({ bound: false });
    }
    return this.state;
  }

  async configure() {
    if (this.method === 'portal') return this.portal.configure();
    return false;
  }

  // The combo changed in settings.
  async update() {
    if (this.method === 'x11') this.registerX11();
    else if (this.method === 'gnome' && this.state.bound) await this.gnomeAdd();
    this.emit('change');
  }

  registerX11() {
    const { globalShortcut } = require('electron');
    globalShortcut.unregisterAll();
    let ok = false;
    try {
      ok = globalShortcut.register(electronAccel(this.config.get('combo')), () => this.controller.toggle());
    } catch {}
    this.setState({ bound: ok, error: ok ? null : 'Another app already uses this shortcut' });
  }

  // ---------- GNOME custom shortcut ----------

  async gnomeList() {
    const raw = await gsettings(['get', GNOME_SCHEMA, 'custom-keybindings']);
    if (!raw) return [];
    return (raw.match(/'[^']*'/g) || []).map((s) => s.slice(1, -1));
  }

  async gnomeAdded() {
    return (await this.gnomeList()).includes(GNOME_PATH);
  }

  async gnomeAdd() {
    const rel = `${GNOME_SCHEMA}.custom-keybinding:${GNOME_PATH}`;
    await gsettings(['set', rel, 'name', 'Murmur dictation']);
    await gsettings(['set', rel, 'command', this.cmd + ' toggle']);
    await gsettings(['set', rel, 'binding', gnomeAccel(this.config.get('combo'))]);
    const list = await this.gnomeList();
    if (!list.includes(GNOME_PATH)) list.push(GNOME_PATH);
    await gsettings(['set', GNOME_SCHEMA, 'custom-keybindings', '[' + list.map((p) => `'${p}'`).join(', ') + ']']);
  }

  async gnomeRemove() {
    const list = (await this.gnomeList()).filter((p) => p !== GNOME_PATH);
    await gsettings(['set', GNOME_SCHEMA, 'custom-keybindings', '[' + list.map((p) => `'${p}'`).join(', ') + ']']);
  }

  snapshot() {
    return {
      method: this.method,
      canHold: this.canHold,
      mode: this.mode(),
      canConfigure: this.method === 'portal' && this.portal.version >= 2,
      command: this.cmd,
      ...this.state
    };
  }
}

module.exports = { Shortcut, gnomeAccel, electronAccel };
