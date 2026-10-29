'use strict';
const test = require('node:test');
const assert = require('node:assert');
const binds = require('../src/shared/binds');

test('default shortcut is free', () => {
  assert.equal(binds.check(['Super', 'Ctrl', 'Space'], []).ok, true);
});

test('rejects CachyOS defaults and plain keys', () => {
  assert.match(binds.check(['Super', 'Space'], []).msg, /launcher/);
  assert.match(binds.check(['A'], []).msg, /Add Super, Ctrl or Alt/);
  assert.match(binds.check(['Super', 'Ctrl', '2'], []).msg, /workspaces/);
  assert.equal(binds.check(['F9'], []).ok, true);
});

test('rejects binds already in the running config', () => {
  const r = binds.check(['Super', 'Alt', 'K'], [{ modmask: 64 | 8, key: 'K' }]);
  assert.equal(r.ok, false);
  assert.match(r.msg, /already bound/);
});

test('modifier order is normalized', () => {
  assert.equal(binds.id(['Ctrl', 'Super', 'Space']), 'Super+Ctrl+Space');
});

test('lua and conf snippets', () => {
  assert.equal(binds.text(['Super', 'Ctrl', 'Space'], 'hold', 'lua'),
    '-- Murmur: hold to dictate\n' +
    'hl.bind("SUPER + CTRL + Space", hl.dsp.exec_cmd("murmur start"))\n' +
    'hl.bind("SUPER + CTRL + Space", hl.dsp.exec_cmd("murmur stop"), { release = true })');
  assert.equal(binds.text(['Super', 'Ctrl', 'Space'], 'hold', 'conf'),
    '# Murmur: hold to dictate\nbind  = SUPER CTRL, Space, exec, murmur start\nbindr = SUPER CTRL, Space, exec, murmur stop');
  assert.match(binds.text(['Super', '.'], 'tap', 'lua'), /"SUPER \+ period".*murmur toggle/);
});
