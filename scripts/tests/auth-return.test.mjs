// Rückkehr vom Anmeldedienst: nur Tickets aus einem selbst begonnenen, frischen Vorgang zählen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_MAX_AGE_MS, readAuthReturn } from '../../src/auth/authReturn.ts';

const now = 1_800_000_000_000;
const url = 'taleward://auth?ticket=abc123';

test('unaufgeforderte Tickets werden verworfen', () => {
  assert.deepEqual(readAuthReturn(url, null, now), { kind: 'discard' });
  assert.deepEqual(readAuthReturn(url, {}, now), { kind: 'discard' });
  assert.deepEqual(readAuthReturn(url, { at: 'gestern' }, now), { kind: 'discard' });
});

test('zu alte Vorgänge werden verworfen', () => {
  assert.deepEqual(readAuthReturn(url, { at: now - PENDING_MAX_AGE_MS - 1 }, now), { kind: 'discard' });
  assert.deepEqual(readAuthReturn(url, { at: now + 60_000 }, now), { kind: 'discard' });
});

test('eigener, frischer Vorgang', () => {
  assert.deepEqual(readAuthReturn(url, { at: now - 1000 }, now), { kind: 'ticket', ticket: 'abc123' });
  assert.deepEqual(readAuthReturn('https://app.taleward.org/auth/app?ticket=t9', { at: now }, now), { kind: 'ticket', ticket: 't9' });
});

test('Fehler vom Dienst', () => {
  assert.deepEqual(readAuthReturn('taleward://auth?error=access_denied', { at: now }, now), { kind: 'error', code: 'access_denied' });
  assert.deepEqual(readAuthReturn('taleward://auth', { at: now }, now), { kind: 'error', code: 'oidc_failed' });
});
