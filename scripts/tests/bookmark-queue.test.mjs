import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { loadQueue, saveQueue, dropQueueOf, queueFor } = await import('../../src/components/bookmarkQueue.ts');

test('Merkstellen gehen nur an ihren Server', () => {
  store.set('taleward.bookmarkQueue', JSON.stringify([{ sessionId: 'alt', at: 'x', note: null }]));
  assert.equal(loadQueue().length, 0, 'alte Einträge ohne Verbindung fallen weg');
  saveQueue([
    { connId: 'x', account: 'X|u1', sessionId: 's1', at: '2026-11-03T18:00:00Z', note: 'Kesh' },
    { connId: 'y', account: 'Y|u2', sessionId: 's2', at: '2026-11-03T18:01:00Z', note: null }
  ]);
  const q = loadQueue();
  assert.deepEqual(queueFor(q, 'y', 'Y|u2').map((b) => b.sessionId), ['s2']);
  assert.deepEqual(queueFor(q, 'y', 'Y|anders'), []);
  assert.deepEqual(queueFor(q, 'x', null), []);
  dropQueueOf('x');
  assert.deepEqual(loadQueue().map((b) => b.connId), ['y']);
});
