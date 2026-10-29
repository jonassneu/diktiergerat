// Shortcut checks and Hyprland bind snippets. Loaded by the main process
// (require) and by the renderer (<script>), so it stays dependency free.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MurmurBinds = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MOD_ORDER = ['Super', 'Ctrl', 'Alt', 'Shift'];
  const MOD_BITS = { Shift: 1, Ctrl: 4, Alt: 8, Super: 64 };

  const CACHY = {
    'Super+Space': 'opens the app launcher', 'Super+Alt+Space': 'toggles floating', 'Super+Q': 'closes the focused window',
    'Super+D': 'maximizes the window', 'Super+F': 'makes a window fullscreen', 'Super+J': 'toggles the split direction',
    'Super+Return': 'opens the terminal', 'Super+E': 'opens the file manager', 'Super+T': 'opens the editor',
    'Super+C': 'opens the calculator', 'Super+W': 'opens the browser', 'Super+Z': 'opens the shell settings',
    'Super+X': 'opens the control center', 'Super+.': 'opens the emoji picker', 'Super+L': 'locks the screen',
    'Super+Alt+C': 'opens the session menu', 'Super+P': 'opens the color picker', 'Super+R': 'toggles the screen recorder',
    'Super+V': 'opens clipboard history', 'Super+A': 'opens notification history', 'Super+S': 'opens the scratchpad',
    'Super+Shift+S': 'sends a window to the scratchpad', 'Super+Shift+W': 'opens the wallpaper menu', 'Super+Tab': 'opens the window switcher',
    'Super+Escape': 'force-closes a window', 'Alt+Tab': 'switches windows', 'Ctrl+Shift+Escape': 'opens the system monitor',
    'Super+=': 'zooms in', 'Super+-': 'zooms out', 'Super+Print': 'captures the screen'
  };

  const APPS = {
    'Ctrl+C': 'copy', 'Ctrl+V': 'paste', 'Ctrl+X': 'cut', 'Ctrl+Z': 'undo', 'Ctrl+A': 'select all', 'Ctrl+S': 'save',
    'Ctrl+F': 'find', 'Ctrl+T': 'new tab', 'Ctrl+W': 'close tab', 'Ctrl+Q': 'quit', 'Ctrl+N': 'new window', 'Ctrl+P': 'print',
    'Ctrl+R': 'reload', 'Ctrl+L': 'the address bar', 'Ctrl+Space': 'autocomplete in code editors', 'Alt+F4': 'close window',
    'Ctrl+Shift+T': 'reopen tab', 'Ctrl+Shift+C': 'copy in terminals', 'Ctrl+Shift+V': 'paste in terminals', 'Ctrl+Return': 'send in many chat apps'
  };

  // Our key label -> Hyprland key name.
  const HYPR_KEYS = {
    '`': 'grave', '.': 'period', ',': 'comma', '-': 'minus', '=': 'equal', '/': 'slash', '\\': 'backslash',
    ';': 'semicolon', "'": 'apostrophe', '[': 'bracketleft', ']': 'bracketright',
    Left: 'left', Right: 'right', Up: 'up', Down: 'down'
  };

  function sortMods(mods) {
    return MOD_ORDER.filter((m) => mods.indexOf(m) !== -1);
  }

  function id(keys) {
    return sortMods(keys.slice(0, -1)).concat(keys.slice(-1)).join('+');
  }

  function label(keys) {
    return keys.join(' + ');
  }

  function hyprKey(k) {
    return HYPR_KEYS[k] || k;
  }

  function modmask(mods) {
    return mods.reduce((m, k) => m | (MOD_BITS[k] || 0), 0);
  }

  // `existing` is a list of { modmask, key } from `hyprctl binds -j`.
  function check(keys, existing) {
    const mods = keys.slice(0, -1);
    const key = keys[keys.length - 1];
    const kid = id(keys);
    const lbl = label(keys);
    const lone = /^F\d{1,2}$/.test(key) || ['Pause', 'ScrollLock', 'Insert', 'Menu'].indexOf(key) !== -1;
    const strong = mods.filter((m) => m !== 'Shift').length > 0;
    if (!strong && !lone) return { ok: false, msg: 'Add Super, Ctrl or Alt so normal typing keeps working.' };
    if (CACHY[kid]) return { ok: false, msg: lbl + ' already ' + CACHY[kid] + ' in CachyOS.' };
    const m = sortMods(mods).join('+');
    const digit = /^\d$/.test(key);
    const arrow = ['Left', 'Right', 'Up', 'Down'].indexOf(key) !== -1;
    if (digit && m === 'Super') return { ok: false, msg: lbl + ' already switches monitors in CachyOS.' };
    if (digit && (m === 'Super+Ctrl' || m === 'Super+Alt')) return { ok: false, msg: lbl + ' already switches workspaces in CachyOS.' };
    if (digit && (m === 'Super+Shift' || m === 'Super+Ctrl+Shift')) return { ok: false, msg: lbl + ' already moves windows in CachyOS.' };
    if (arrow && (m === 'Super' || m === 'Super+Shift' || m === 'Super+Ctrl' || m === 'Super+Ctrl+Shift')) return { ok: false, msg: lbl + ' already moves focus or windows in CachyOS.' };
    if (APPS[kid]) return { ok: false, msg: lbl + ' is ' + APPS[kid] + ' in most apps.' };
    if (existing && existing.length) {
      const mask = modmask(mods);
      const hk = hyprKey(key).toLowerCase();
      const hit = existing.find((b) => b.modmask === mask && String(b.key).toLowerCase() === hk);
      if (hit) return { ok: false, msg: lbl + ' is already bound in your Hyprland config.' };
    }
    return { ok: true, msg: 'Free. Nothing in your Hyprland binds or the CachyOS defaults uses it.' };
  }

  // Bind snippet as colored parts. Roles: dim, fg, acc, kw.
  function lines(keys, mode, fmt, cmd) {
    cmd = cmd || 'murmur';
    const mods = sortMods(keys.slice(0, -1));
    const hk = hyprKey(keys[keys.length - 1]);
    if (fmt === 'lua') {
      const lk = '"' + mods.map((m) => (m === 'Ctrl' ? 'CTRL' : m.toUpperCase())).concat([hk]).join(' + ') + '"';
      return mode === 'hold' ? [
        [['-- Murmur: hold to dictate', 'dim']],
        [['hl.bind(', 'fg'], [lk, 'acc'], [', hl.dsp.exec_cmd(', 'fg'], ['"' + cmd + ' start"', 'acc'], ['))', 'fg']],
        [['hl.bind(', 'fg'], [lk, 'acc'], [', hl.dsp.exec_cmd(', 'fg'], ['"' + cmd + ' stop"', 'acc'], ['), { ', 'fg'], ['release', 'kw'], [' = ', 'fg'], ['true', 'kw'], [' })', 'fg']]
      ] : [
        [['-- Murmur: tap to start, tap to stop', 'dim']],
        [['hl.bind(', 'fg'], [lk, 'acc'], [', hl.dsp.exec_cmd(', 'fg'], ['"' + cmd + ' toggle"', 'acc'], ['))', 'fg']]
      ];
    }
    const ck = mods.map((m) => m.toUpperCase()).join(' ') + ', ' + hk;
    return mode === 'hold' ? [
      [['# Murmur: hold to dictate', 'dim']],
      [['bind ', 'kw'], [' = ' + ck + ', exec, ', 'fg'], [cmd + ' start', 'acc']],
      [['bindr', 'kw'], [' = ' + ck + ', exec, ', 'fg'], [cmd + ' stop', 'acc']]
    ] : [
      [['# Murmur: tap to start, tap to stop', 'dim']],
      [['bind', 'kw'], [' = ' + ck + ', exec, ', 'fg'], [cmd + ' toggle', 'acc']]
    ];
  }

  function text(keys, mode, fmt, cmd) {
    return lines(keys, mode, fmt, cmd).map((ln) => ln.map((p) => p[0]).join('')).join('\n');
  }

  // Maps a browser KeyboardEvent to our key label, or null for a lone modifier.
  function keyOf(e) {
    const k = e.key || '';
    if (['Meta', 'OS', 'Super', 'Hyper', 'Control', 'Alt', 'AltGraph', 'Shift', 'CapsLock'].indexOf(k) !== -1) return null;
    const code = e.code || '';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    const map = { Space: 'Space', Backquote: '`', Period: '.', Comma: ',', Minus: '-', Equal: '=', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Enter: 'Return', NumpadEnter: 'Return', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Pause: 'Pause', ScrollLock: 'ScrollLock', PrintScreen: 'Print', ContextMenu: 'Menu' };
    if (map[code]) return map[code];
    const mm = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (mm) return mm[1];
    if (/^F\d{1,2}$/.test(code)) return code;
    if (k === ' ') return 'Space';
    return k.length === 1 ? k.toUpperCase() : (k || null);
  }

  function modsOf(e) {
    const m = [];
    if (e.metaKey) m.push('Super');
    if (e.ctrlKey) m.push('Ctrl');
    if (e.altKey) m.push('Alt');
    if (e.shiftKey) m.push('Shift');
    return m;
  }

  return { check, lines, text, keyOf, modsOf, id, label, sortMods, hyprKey, modmask };
});
