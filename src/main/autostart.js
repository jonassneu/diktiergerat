'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const paths = require('./paths');

// Start-on-login through the systemd user service written by scripts/install.sh.
const UNIT = 'murmur.service';
const unitFile = path.join(path.dirname(path.dirname(paths.config)), 'systemd', 'user', UNIT);

function systemctl(args) {
  return new Promise((resolve) => {
    execFile('systemctl', ['--user', ...args], { timeout: 5000 }, (err, out) => resolve({ ok: !err, out: String(out || '').trim() }));
  });
}

function available() {
  return fs.existsSync(unitFile);
}

async function enabled() {
  if (!available()) return false;
  return (await systemctl(['is-enabled', UNIT])).out === 'enabled';
}

// Enable only; Murmur is already running, so there is nothing to start now.
async function set(on) {
  if (!available()) return false;
  await systemctl([on ? 'enable' : 'disable', UNIT]);
  return enabled();
}

module.exports = { available, enabled, set };
