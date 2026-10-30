// Aufnahmezeiten für „Merken“: Spannen und Abgleich mit der gemessenen Länge
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { spanOpen, spanClose, spansFor, clearSpans } = await import('../../src/recorder/spans.ts');
const at = (min) => new Date(Date.UTC(2026, 9, 30, 18, min));

beforeEach(() => store.clear());

test('Pause trennt zwei Spannen', () => {
  spanOpen('s1', at(0)); spanClose('s1', at(30)); spanOpen('s1', at(40)); spanClose('s1', at(70));
  const out = spansFor('s1', 60 * 60_000);
  assert.equal(out.length, 2);
  assert.equal(out[1].startedAt, at(40).toISOString());
});

test('doppeltes Öffnen und Schließen schadet nicht', () => {
  spanOpen('s1', at(0)); spanOpen('s1', at(5)); spanClose('s1', at(10)); spanClose('s1', at(12));
  assert.deepEqual(spansFor('s1'), [{ startedAt: at(0).toISOString(), endedAt: at(10).toISOString() }]);
});

test('passt die Länge nicht (Pause außerhalb der App), lieber nichts schicken', () => {
  spanOpen('s1', at(0)); spanClose('s1', at(60));
  assert.equal(spansFor('s1', 40 * 60_000), undefined);
  assert.ok(spansFor('s1', 59.5 * 60_000));
});

test('aufräumen', () => {
  spanOpen('s1', at(0)); clearSpans('s1');
  assert.equal(spansFor('s1'), undefined);
});
