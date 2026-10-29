#!/usr/bin/env node
'use strict';
// Murmur command line. Hyprland binds call `murmur start` / `murmur stop`;
// this forwards the command to the running app over a Unix socket and
// launches the app first if it is not running.
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const paths = require('../src/main/paths');

const USAGE = `usage: murmur <command>

  start      start listening (hold mode: bind to key press)
  stop       stop listening and type the text (bind to key release)
  toggle     start or stop (tap mode)
  cancel     stop listening without typing
  status     show what Murmur is doing
  open [page]  open the window: transcripts, shortcut, models, setup
  set <key> <value>  change a setting: mode hold|tap, after type|copy, enter on|off, sound on|off
  daemon     run the app in the foreground
  quit       stop the background app`;

const cmd = process.argv[2];
const arg = process.argv[3];

function send(msg, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(paths.socket);
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('timeout')); }, timeout);
    sock.on('connect', () => sock.write(JSON.stringify(msg) + '\n'));
    sock.on('data', (d) => { buf += d; });
    sock.on('end', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(buf || '{}')); } catch (e) { reject(e); }
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function electronBin() {
  try {
    return require('electron');
  } catch {
    return 'electron';
  }
}

function launch(foreground) {
  const appDir = path.resolve(__dirname, '..');
  // Set when launched from inside another Electron app; it would turn ours into plain Node.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronBin(), [appDir, '--hidden'], {
    stdio: foreground ? 'inherit' : 'ignore',
    detached: !foreground,
    env
  });
  if (!foreground) child.unref();
  return child;
}

async function sendOrLaunch(msg) {
  try {
    return await send(msg);
  } catch (e) {
    if (e.code !== 'ENOENT' && e.code !== 'ECONNREFUSED') throw e;
  }
  launch(false);
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      return await send(msg);
    } catch {}
  }
  throw new Error('Murmur did not start. Try `murmur daemon` to see why.');
}

function printStatus(s) {
  const green = process.stdout.isTTY ? '\x1b[32m●\x1b[0m' : '●';
  console.log(`${green} murmur · ${s.running ? 'active (running)' : 'inactive'}`);
  const rows = [
    ['state', s.state],
    ['model', s.model + (s.whisper === 'ready' ? '' : ` (${s.whisper})`)],
    ['backend', s.backend],
    ['shortcut', s.shortcut],
    ['input', s.input]
  ];
  for (const [k, v] of rows) console.log('  ' + k.padEnd(10) + v);
  if (s.error) console.log('  ' + 'error'.padEnd(10) + s.error);
}

async function main() {
  switch (cmd) {
    case 'start':
    case 'stop':
    case 'toggle':
    case 'cancel':
      await sendOrLaunch({ cmd });
      return;
    case 'open':
      await sendOrLaunch({ cmd: 'open', page: arg || 'transcripts' });
      return;
    case 'set': {
      const raw = process.argv[4];
      const value = raw === 'on' ? true : raw === 'off' ? false : raw;
      const r = await send({ cmd: 'set', key: arg, value });
      if (!r.ok) { console.error('murmur:', r.error); process.exitCode = 2; }
      return;
    }
    case 'status':
      try {
        printStatus(await send({ cmd: 'status' }));
      } catch {
        console.log('○ murmur · inactive (not running)');
        process.exitCode = 3;
      }
      return;
    case 'quit':
      try { await send({ cmd: 'quit' }); } catch {}
      return;
    case 'daemon':
      launch(true).on('exit', (code) => process.exit(code || 0));
      return;
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      console.log(USAGE);
      return;
    default:
      console.error(USAGE);
      process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('murmur:', e.message);
  process.exitCode = 1;
});
