// Schriftgröße des Handys: Faktor bleibt in vernünftigen Grenzen, Unsinn ergibt normale Größe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampScale } from '../../src/display/scale.ts';

test('Schriftgröße des Handys begrenzen', () => {
  assert.equal(clampScale(1), 1);
  assert.equal(clampScale(1.3), 1.3);
  assert.equal(clampScale(1.15), 1.15);
  assert.equal(clampScale(2), 1.6);
  assert.equal(clampScale(0.5), 0.85);
  assert.equal(clampScale(1.299999), 1.3);
  assert.equal(clampScale(NaN), 1);
  assert.equal(clampScale(0), 1);
  assert.equal(clampScale('1.3'), 1.3);
  assert.equal(clampScale(undefined), 1);
});
