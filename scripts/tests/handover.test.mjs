import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHandover } from '../../src/recorder/handover.ts';

const empty = { onSite: {}, guests: [] };
const at = '2026-11-07T20:00:00Z';

test('Mitglied am Tisch wird nicht zusätzlich Gast', () => {
  const r = applyHandover(empty, { memberId: 'm1', name: 'Lea' }, at);
  assert.deepEqual(r.onSite, { m1: at });
  assert.deepEqual(r.guests, []);
  assert.equal(r.consentSelf, false);
});

test('Eigene Zustimmung: vor Ort und für die Kampagne', () => {
  const r = applyHandover(empty, { memberId: 'me', name: 'Anja', self: true }, at);
  assert.deepEqual(r.onSite, { me: at });
  assert.deepEqual(r.guests, []);
  assert.equal(r.consentSelf, true);
});

test('Person ohne Konto wird Gast', () => {
  const r = applyHandover({ onSite: { m1: at }, guests: [] }, { name: 'Sina' }, at);
  assert.deepEqual(r.onSite, { m1: at });
  assert.deepEqual(r.guests, [{ name: 'Sina', consentAt: at }]);
  assert.equal(r.consentSelf, false);
});
