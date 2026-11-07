import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuietWatch, isTooQuiet, QUIET_AFTER_MS } from '../../src/recorder/quiet.ts';

test('Stille wird gezählt, Ton setzt zurück, Pause zählt nicht', () => {
  const w = new QuietWatch();
  w.sample(0.3, 1000, true);
  w.sample(0, 1000 + QUIET_AFTER_MS, true);
  assert.equal(isTooQuiet(w.quietMs(1000 + QUIET_AFTER_MS)), true);
  w.sample(0.2, 200_000, true);
  assert.equal(w.quietMs(200_000), 0);
  w.sample(0, 300_000, false);
  w.sample(0, 310_000, true);
  assert.equal(w.quietMs(310_000), 10_000);
});

test('ohne Pegel nie ein Hinweis', () => {
  const w = new QuietWatch();
  w.sample(null, 0, true);
  w.sample(null, 500_000, true);
  assert.equal(w.quietMs(500_000), 0);
});
