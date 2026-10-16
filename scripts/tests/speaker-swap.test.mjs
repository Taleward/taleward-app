// „Tauschen“ bei Stimmen: zwei Zuordnungen wechseln, alles andere bleibt
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swapAssignment } from '../../src/voice/swap.ts';

test('Zwei Stimmen tauschen', () => {
  const m = { sp1: 'm-gm', sp2: 'm-jemma', sp3: 'm-litha' };
  assert.deepEqual(swapAssignment(m, 'sp2', 'm-litha'), { sp1: 'm-gm', sp2: 'm-litha', sp3: 'm-jemma' });
});

test('Bisher offen oder Gast: die andere Stimme übernimmt das', () => {
  assert.deepEqual(swapAssignment({ a: '', b: 'm-x' }, 'a', 'm-x'), { a: 'm-x', b: '' });
  assert.deepEqual(swapAssignment({ a: 'guest:Mira', b: 'm-x' }, 'a', 'm-x'), { a: 'm-x', b: 'guest:Mira' });
});

test('Schon richtig: nichts ändert sich', () => {
  const m = { a: 'm-x', b: 'm-y' };
  assert.equal(swapAssignment(m, 'a', 'm-x'), m);
});
