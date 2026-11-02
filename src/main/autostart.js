'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const paths = require('./paths');

// Start-on-login through the systemd user service written by scripts/install.sh,
// or an XDG autostart entry on systems without systemd user sessions.
const UNIT = 'murmur.service';
const configHome = path.dirname(path.dirname(paths.config));
const unitFile = path.join(configHome, 'systemd', 'user', UNIT);
const xdgFile = path.join(configHome, 'autostart', 'murmur.desktop');

function systemctl(args) {
  return new Promise((resolve) => {
    execFile('systemctl', ['--user', ...args], { timeout: 5000 }, (err, out) => resolve({ ok: !err, out: String(out || '').trim() }));
  });
}

function useSystemd() {
  return fs.existsSync(unitFile);
}

function available() {
  return useSystemd() || fs.existsSync(xdgFile);
}

async function enabled() {
  if (useSystemd()) return (await systemctl(['is-enabled', UNIT])).out === 'enabled';
  try {
    return !/^Hidden=true$/m.test(fs.readFileSync(xdgFile, 'utf8'));
  } catch {
    return false;
  }
}

// Enable only; Murmur is already running, so there is nothing to start now.
async function set(on) {
  if (useSystemd()) {
    await systemctl([on ? 'enable' : 'disable', UNIT]);
  } else if (fs.existsSync(xdgFile)) {
    const text = fs.readFileSync(xdgFile, 'utf8').replace(/^Hidden=.*\n?/m, '');
    fs.writeFileSync(xdgFile, on ? text : text.replace(/\n*$/, '\nHidden=true\n'));
  } else {
    return false;
  }
  return enabled();
}

module.exports = { available, enabled, set };
