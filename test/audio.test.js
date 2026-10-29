'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toWav, speechLevel, RATE } = require('../src/main/audio');
const { clean } = require('../src/main/whisper');

test('wav header', () => {
  const wav = toWav(Buffer.alloc(RATE * 2));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.length, 44 + RATE * 2);
});

test('silence vs. sound', () => {
  const quiet = Buffer.alloc(RATE * 2);
  const loud = Buffer.alloc(RATE * 2);
  for (let i = 0; i < RATE; i++) loud.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2);
  assert.ok(speechLevel(quiet) < 0.006);
  assert.ok(speechLevel(loud) > 0.1);
});

test('drops whisper filler', () => {
  assert.equal(clean(' [BLANK_AUDIO]\n'), '');
  assert.equal(clean('(music)'), '');
  assert.equal(clean(' Hello there.\n How are you?\n'), 'Hello there. How are you?');
});
