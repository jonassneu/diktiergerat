'use strict';
// Global shortcut through the XDG desktop portal (KDE Plasma, GNOME 48+,
// COSMIC, ...). The desktop shows its own dialog to confirm or pick the keys
// once, and reports both press and release, so "hold to talk" works.
const { EventEmitter } = require('events');

const DEST = 'org.freedesktop.portal.Desktop';
const OBJ = '/org/freedesktop/portal/desktop';
const IFACE = 'org.freedesktop.portal.GlobalShortcuts';
const ID = 'dictate';

// Our key labels -> the trigger format of the shortcuts spec.
function trigger(keys) {
  const mods = { Super: 'LOGO', Ctrl: 'CTRL', Alt: 'ALT', Shift: 'SHIFT' };
  const names = { Space: 'space', Return: 'Return', Escape: 'Escape', Tab: 'Tab', Backspace: 'BackSpace', Left: 'Left', Right: 'Right', Up: 'Up', Down: 'Down', '`': 'grave', '.': 'period', ',': 'comma', '-': 'minus', '=': 'equal', '/': 'slash', '\\': 'backslash', ';': 'semicolon', "'": 'apostrophe', '[': 'bracketleft', ']': 'bracketright' };
  const key = keys[keys.length - 1];
  const k = names[key] || (key.length === 1 ? key.toLowerCase() : key);
  return keys.slice(0, -1).map((m) => mods[m] || m.toUpperCase()).concat([k]).join('+');
}

class Portal extends EventEmitter {
  constructor() {
    super();
    this.bus = null;
    this.session = null;
    this.available = false;
    this.version = 0;
    this.bound = null; // trigger description from the desktop, once bound
    this.count = 0;
  }

  async connect() {
    if (this.bus) return this.available;
    let dbus;
    try {
      dbus = require('dbus-next');
    } catch {
      return false;
    }
    this.dbus = dbus;
    try {
      this.bus = dbus.sessionBus();
      this.bus.on('error', () => {});
      // Host apps tell the portal who they are first, so the desktop can
      // show "Murmur" (from murmur.desktop) in its shortcut dialog.
      await this.call(OBJ, 'org.freedesktop.host.portal.Registry', 'Register', 'sa{sv}', ['murmur', {}]).catch(() => {});
      const v = await this.call(OBJ, 'org.freedesktop.DBus.Properties', 'Get', 'ss', [IFACE, 'version']);
      this.version = Number(v[0].value) || 0;
      this.available = this.version > 0;
    } catch {
      this.available = false;
    }
    if (this.available) {
      await this.call('/org/freedesktop/DBus', 'org.freedesktop.DBus', 'AddMatch', 's', [`type='signal',interface='${IFACE}'`], 'org.freedesktop.DBus').catch(() => {});
      await this.call('/org/freedesktop/DBus', 'org.freedesktop.DBus', 'AddMatch', 's', [`type='signal',interface='org.freedesktop.portal.Request',member='Response'`], 'org.freedesktop.DBus').catch(() => {});
      this.bus.on('message', (m) => this.onMessage(m));
    }
    return this.available;
  }

  async call(path, iface, member, signature, body, destination = DEST) {
    const d = this.dbus;
    const reply = await this.bus.call(new d.Message({ destination, path, interface: iface, member, signature, body: this.wrap(signature, body) }));
    return reply.body;
  }

  // Plain objects for a{sv} become Variants.
  wrap(signature, body) {
    const d = this.dbus;
    const toDict = (o) => {
      const out = {};
      for (const [k, v] of Object.entries(o)) {
        if (v instanceof d.Variant) out[k] = v;
        else if (typeof v === 'string') out[k] = new d.Variant('s', v);
        else if (typeof v === 'boolean') out[k] = new d.Variant('b', v);
        else out[k] = new d.Variant('u', v);
      }
      return out;
    };
    return body.map((b) => (b && typeof b === 'object' && !Array.isArray(b) && !(b instanceof d.Variant) ? toDict(b) : b));
  }

  onMessage(m) {
    if (m.type !== this.dbus.MessageType.SIGNAL || m.interface !== IFACE) return;
    const [session, id] = m.body;
    if (session !== this.session || id !== ID) return;
    if (m.member === 'Activated') this.emit('down');
    else if (m.member === 'Deactivated') this.emit('up');
    else if (m.member === 'ShortcutsChanged') this.readShortcuts(m.body[1]);
  }

  readShortcuts(list) {
    const s = (list || []).find((x) => x[0] === ID);
    const desc = s && s[1] && s[1].trigger_description;
    this.bound = desc ? String(desc.value || '').trim() || 'set' : s ? 'set' : null;
    this.emit('change');
  }

  // Calls a portal method that answers through a Request object.
  async request(member, signature, body, optsIndex) {
    const token = 'murmur' + process.pid + '_' + (++this.count);
    body[optsIndex] = { ...body[optsIndex], handle_token: token };
    const sender = this.bus.name.slice(1).replace(/\./g, '_');
    const path = `${OBJ}/request/${sender}/${token}`;
    const done = new Promise((resolve, reject) => {
      const onMsg = (m) => {
        if (m.type !== this.dbus.MessageType.SIGNAL || m.path !== path || m.member !== 'Response') return;
        this.bus.removeListener('message', onMsg);
        const [code, results] = m.body;
        if (code === 0) resolve(results);
        else reject(new Error(code === 1 ? 'cancelled' : 'the desktop refused the shortcut'));
      };
      this.bus.on('message', onMsg);
    });
    await this.call(OBJ, IFACE, member, signature, body);
    return done;
  }

  async ensureSession() {
    if (this.session) return this.session;
    const r = await this.request('CreateSession', 'a{sv}', [{ session_handle_token: 'murmur' + process.pid }], 0);
    this.session = r.session_handle.value;
    return this.session;
  }

  // Asks the desktop for the shortcut. The first time it shows a dialog;
  // later it just confirms what the user picked before.
  async bind(keys) {
    if (!(await this.connect())) throw new Error('no shortcut portal');
    const session = await this.ensureSession();
    const d = this.dbus;
    const shortcuts = [[ID, { description: new d.Variant('s', 'Dictate with Murmur'), preferred_trigger: new d.Variant('s', trigger(keys)) }]];
    const r = await this.request('BindShortcuts', 'oa(sa{sv})sa{sv}', [session, shortcuts, '', {}], 3);
    this.readShortcuts(r.shortcuts ? r.shortcuts.value : []);
    return this.bound;
  }

  // Opens the desktop's own shortcut settings (portal version 2).
  async configure() {
    if (!this.session || this.version < 2) return false;
    await this.call(OBJ, IFACE, 'ConfigureShortcuts', 'osa{sv}', [this.session, '', {}]);
    return true;
  }
}

module.exports = { Portal, trigger };
