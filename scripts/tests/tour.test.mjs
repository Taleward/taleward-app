import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_STEPS, availableSteps } from '../../src/tour/steps.ts';

test('Tour: Schritte ohne Ziel auf der Seite fallen weg, der Willkommensschritt bleibt', () => {
  const only = new Set(['nav-chronik', 'members']);
  const steps = availableSteps(TOUR_STEPS.player, (t) => only.has(t));
  assert.deepEqual(steps.map((s) => s.target), [null, 'nav-chronik', 'members']);
});

test('Tour: Spielerinnen sehen keine Schritte der Spielleitung', () => {
  const targets = TOUR_STEPS.player.map((s) => s.target);
  for (const gmOnly of ['nav-aufnahme', 'schirm', 'invite']) assert.ok(!targets.includes(gmOnly));
});
