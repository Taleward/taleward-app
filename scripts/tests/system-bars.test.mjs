import { test } from 'node:test';
import assert from 'node:assert/strict';
import { androidMajor, barStyleFor } from '../../src/display/systemBars.ts';

test('Android-Fassung aus dem User-Agent', () => {
  assert.equal(androidMajor('Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36'), 15);
  assert.equal(androidMajor('Mozilla/5.0 (Linux; Android 9; SM-G960F)'), 9);
  assert.equal(androidMajor('Mozilla/5.0 (Windows NT 10.0)'), null);
});

test('Symbole folgen ab Android 15 dem Thema, vorher bleiben sie hell', () => {
  assert.equal(barStyleFor(false, 15), 'light');
  assert.equal(barStyleFor(true, 16), 'dark');
  assert.equal(barStyleFor(false, 14), 'dark');
  assert.equal(barStyleFor(false, null), 'light');
});
