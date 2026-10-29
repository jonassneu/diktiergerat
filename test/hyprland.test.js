'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point the module at a throwaway config dir before loading it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'murmur-test-'));
process.env.XDG_CONFIG_HOME = tmp;
delete process.env.HYPRLAND_INSTANCE_SIGNATURE;
const hyprland = require('../src/main/hyprland');

test('adds, rewrites and removes only our block', async () => {
  const dir = path.join(tmp, 'hypr', 'config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'hypr', 'hyprland.lua'), 'require("config.binds")\n');
  const file = path.join(dir, 'binds.lua');
  const original = 'local mainMod = "SUPER"\nhl.bind("F12", hl.dsp.exec_cmd("x"))\n';
  fs.writeFileSync(file, original);

  assert.equal(hyprland.detectFormat(), 'lua');
  assert.equal(hyprland.bindsFile('lua'), file);
  assert.equal(hyprland.isAdded('lua'), false);

  await hyprland.addBinds('lua', ['Super', 'Ctrl', 'Space'], 'hold');
  let text = fs.readFileSync(file, 'utf8');
  assert.ok(text.startsWith(original));
  assert.equal(hyprland.isAdded('lua'), true);
  assert.match(text, /murmur start/);
  assert.match(text, /name = "murmur-overlay".*no_focus = true/);

  await hyprland.addBinds('lua', ['Super', 'Alt', 'D'], 'tap');
  text = fs.readFileSync(file, 'utf8');
  assert.equal(text.split(hyprland.BEGIN.lua).length, 2, 'one block only');
  assert.match(text, /"SUPER \+ ALT \+ D".*murmur toggle/);
  assert.doesNotMatch(text, /murmur start/);

  await hyprland.removeBinds('lua');
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('window names', () => {
  assert.equal(hyprland.windowName({ class: 'code', title: 'notes.md - diktiergerat - Visual Studio Code' }), 'notes.md');
  assert.equal(hyprland.windowName(null), 'the focused app');
});
