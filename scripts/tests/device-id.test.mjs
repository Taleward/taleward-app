import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('taleward.deviceId', '0123456789abcdef0123456789abcdef');
const { deviceId, forgetDeviceId } = await import('../../src/api/deviceId.ts');

test('Gerätekennung je Server getrennt und stabil', () => {
  const a = deviceId('https://verein.test/api/v1');
  const b = deviceId('https://anderer.test/api/v1');
  assert.notEqual(a, b);
  assert.equal(deviceId('https://verein.test/api/v1/'), a);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(store.has('taleward.deviceId'), false, 'alte gemeinsame Kennung entfernt');
  assert.notEqual(a, '0123456789abcdef0123456789abcdef');
});

test('Entfernen vergisst die Kennung', () => {
  const a = deviceId('https://weg.test/api/v1');
  forgetDeviceId('https://weg.test/api/v1');
  assert.notEqual(deviceId('https://weg.test/api/v1'), a);
});
