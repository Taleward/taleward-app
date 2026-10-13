// Server auf einem PC im Heimnetz (Schnittstelle 0.4.16): eigener Server unter /app/, Einladungslink mit publicUrl
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteOrigin, isLoopbackHost, ownServerBase } from '../../src/api/addresses.ts';

test('nur dieses Gerät', () => {
  for (const h of ['localhost', '127.0.0.1', '127.1.2.3', '[::1]', 'app.localhost']) assert.equal(isLoopbackHost(h), true, h);
  for (const h of ['192.168.178.24', 'taleward.example.org', '10.0.0.1', '1270.0.0.1']) assert.equal(isLoopbackHost(h), false, h);
});

test('Einladung im Programmfenster: Heimnetz-Adresse statt localhost', () => {
  assert.equal(inviteOrigin('http://localhost:8000', 'http://192.168.178.24:8000'), 'http://192.168.178.24:8000');
  assert.equal(inviteOrigin('http://127.0.0.1:8000', 'http://192.168.178.24:8000/'), 'http://192.168.178.24:8000');
});

test('Einladung sonst wie bisher', () => {
  // Eigene Adresse ist schon erreichbar
  assert.equal(inviteOrigin('https://taleward.example.org', 'https://anders.example.org'), 'https://taleward.example.org');
  assert.equal(inviteOrigin('http://192.168.178.24:8000', 'http://192.168.178.30:8000'), 'http://192.168.178.24:8000');
  // Nichts gemeldet, Unsinn, http ins Internet, wieder localhost
  assert.equal(inviteOrigin('http://localhost:8000', null), 'http://localhost:8000');
  assert.equal(inviteOrigin('http://localhost:8000', 'kein link'), 'http://localhost:8000');
  assert.equal(inviteOrigin('http://localhost:8000', 'http://taleward.example.org'), 'http://localhost:8000');
  assert.equal(inviteOrigin('http://localhost:8000', 'http://127.0.0.1:8000'), 'http://localhost:8000');
  assert.equal(inviteOrigin('http://localhost:8000', 'javascript:alert(1)'), 'http://localhost:8000');
  // https ins Internet ist erlaubt
  assert.equal(inviteOrigin('http://localhost:8000', 'https://taleward.example.org'), 'https://taleward.example.org');
});

test('eigener Server nur unter /app/ eines Servers', () => {
  assert.equal(ownServerBase({ origin: 'http://localhost:8000', hostname: 'localhost', pathname: '/app/' }), 'http://localhost:8000/api/v1');
  assert.equal(ownServerBase({ origin: 'https://taleward.example.org', hostname: 'taleward.example.org', pathname: '/app/index.html' }),
    'https://taleward.example.org/api/v1');
  assert.equal(ownServerBase({ origin: 'https://app.taleward.org', hostname: 'app.taleward.org', pathname: '/' }), null);
  assert.equal(ownServerBase({ origin: 'https://taleward.org', hostname: 'taleward.org', pathname: '/app/' }), null);
  assert.equal(ownServerBase({ origin: 'http://localhost:5173', hostname: 'localhost', pathname: '/' }), null);
  assert.equal(ownServerBase({ origin: 'capacitor://localhost', hostname: 'localhost', pathname: '/app/' }), null);
  assert.equal(ownServerBase({ origin: 'https://x.example', hostname: 'x.example', pathname: '/apps/' }), null);
});
