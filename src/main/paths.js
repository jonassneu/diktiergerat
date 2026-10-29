'use strict';
const os = require('os');
const path = require('path');

const home = os.homedir();
const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
const runtimeDir = process.env.XDG_RUNTIME_DIR || os.tmpdir();

const data = path.join(dataHome, 'murmur');

module.exports = {
  home,
  data,
  bin: path.join(data, 'bin'),
  models: path.join(data, 'models'),
  history: path.join(data, 'history.json'),
  config: path.join(configHome, 'murmur', 'config.json'),
  hyprDir: path.join(configHome, 'hypr'),
  socket: path.join(runtimeDir, 'murmur.sock'),
  sounds: path.join(runtimeDir, 'murmur-sounds'),
  // Shown in the UI with ~ instead of the home path.
  pretty(p) {
    return p.startsWith(home) ? '~' + p.slice(home.length) : p;
  }
};
