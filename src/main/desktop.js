'use strict';
// Which desktop we are running on, and what that means for Murmur:
// how the shortcut is caught, how text is typed, and how the focused
// window is looked up.
const { execFile } = require('child_process');

function has(cmd) {
  return new Promise((resolve) => {
    execFile('sh', ['-c', 'command -v "$1"', 'sh', cmd], { timeout: 2000 }, (err) => resolve(!err));
  });
}

function run(cmd, args, timeout = 3000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, out) => resolve(err ? null : String(out)));
  });
}

function detect(env = process.env) {
  const names = String(env.XDG_CURRENT_DESKTOP || env.XDG_SESSION_DESKTOP || env.DESKTOP_SESSION || '').toLowerCase();
  const wayland = env.XDG_SESSION_TYPE === 'wayland' || (!!env.WAYLAND_DISPLAY && env.XDG_SESSION_TYPE !== 'x11');
  let desktop = 'other';
  if (env.HYPRLAND_INSTANCE_SIGNATURE || /hyprland/.test(names)) desktop = 'hyprland';
  else if (/kde|plasma/.test(names)) desktop = 'kde';
  else if (/gnome|ubuntu|pop|unity|budgie/.test(names)) desktop = 'gnome';
  else if (env.SWAYSOCK || /sway/.test(names)) desktop = 'sway';
  else if (/cosmic/.test(names)) desktop = 'cosmic';
  else if (/xfce/.test(names)) desktop = 'xfce';
  else if (/cinnamon|x-cinnamon/.test(names)) desktop = 'cinnamon';
  else if (/mate/.test(names)) desktop = 'mate';
  else if (/niri|river|wayfire|labwc/.test(names)) desktop = 'wlroots';
  return { desktop, session: wayland ? 'wayland' : 'x11' };
}

const LABELS = {
  hyprland: 'Hyprland', kde: 'KDE Plasma', gnome: 'GNOME', sway: 'Sway', cosmic: 'COSMIC', xfce: 'Xfce',
  cinnamon: 'Cinnamon', mate: 'MATE', wlroots: 'Wayland', other: 'your desktop'
};

const env = detect();

// Compositors that implement the virtual keyboard protocol wtype needs.
function wtypeWorks() {
  return env.session === 'wayland' && ['hyprland', 'sway', 'wlroots'].includes(env.desktop);
}

// GNOME and KDE on Wayland position and focus windows on their own terms, so
// the overlay runs through XWayland there, where "on top, never focused" works.
function overlayNeedsX11(e = env, processEnv = process.env) {
  return e.session === 'wayland' && !['hyprland', 'sway', 'wlroots'].includes(e.desktop) && !!processEnv.DISPLAY;
}

// The focused window as { id, class, title }, null when nothing has focus,
// undefined when this desktop does not let us find out.
async function activeWindow() {
  if (env.desktop === 'hyprland') {
    const hyprland = require('./hyprland');
    const w = await hyprland.activeWindow();
    if (!w) return null;
    return { id: w.address, class: w.class || w.initialClass || '', title: w.title || '', acceptsInput: w.acceptsInput !== false, hypr: w };
  }
  if (env.desktop === 'sway' && await has('swaymsg')) {
    const out = await run('swaymsg', ['-t', 'get_tree']);
    try {
      const find = (n) => (n.focused ? n : [...(n.nodes || []), ...(n.floating_nodes || [])].map(find).find(Boolean));
      const n = find(JSON.parse(out));
      if (n) return { id: String(n.id), class: n.app_id || (n.window_properties && n.window_properties.class) || '', title: n.name || '', acceptsInput: true };
    } catch {}
    return null;
  }
  if (env.desktop === 'kde' && env.session === 'wayland' && await has('kdotool')) {
    const id = (await run('kdotool', ['getactivewindow']) || '').trim();
    if (!id) return null;
    const cls = (await run('kdotool', ['getwindowclassname', id]) || '').trim();
    const title = (await run('kdotool', ['getwindowname', id]) || '').trim();
    return { id, class: cls, title, acceptsInput: true };
  }
  if (env.session === 'x11' && await has('xdotool')) {
    const id = (await run('xdotool', ['getactivewindow']) || '').trim();
    if (!id) return null;
    const cls = (await run('xdotool', ['getwindowclassname', id]) || '').trim();
    const title = (await run('xdotool', ['getwindowname', id]) || '').trim();
    return { id, class: cls, title, acceptsInput: true };
  }
  return undefined;
}

module.exports = { ...env, env, label: LABELS[env.desktop], detect, has, run, wtypeWorks, overlayNeedsX11, activeWindow };
