import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { loadTableConsent, saveTableConsent, clearTableConsent } = await import('../../src/recorder/tableConsent.ts');

test('Zustimmung am Tisch übersteht den Seitenwechsel, verfällt nach 12 Stunden', () => {
  const now = Date.parse('2026-11-03T19:00:00Z');
  saveTableConsent('verein', 'c1', { onSite: { m1: '2026-11-03T18:55:00Z' }, guests: [{ name: 'Kim', consentAt: '2026-11-03T18:56:00Z' }] }, now);
  assert.deepEqual(loadTableConsent('verein', 'c1', now + 60_000).onSite, { m1: '2026-11-03T18:55:00Z' });
  assert.equal(loadTableConsent('verein', 'c1', now).guests[0].name, 'Kim');
  assert.deepEqual(loadTableConsent('verein', 'c2', now).onSite, {}, 'andere Kampagne');
  assert.deepEqual(loadTableConsent('verein', 'c1', now + 13 * 3600_000).onSite, {}, 'nach 12 h vergessen');
  clearTableConsent('verein', 'c1');
  assert.deepEqual(loadTableConsent('verein', 'c1', now).guests, []);
});
