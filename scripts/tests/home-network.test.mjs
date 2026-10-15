// Unverschlüsselt nur im Heimnetz und Einladungscodes in beiden Formaten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHomeNetworkHost, normalizeBaseUrl, parseInvite, sameServerHost, secureUrl } from '../../src/api/addresses.ts';

test('Heimnetz wird erkannt', () => {
  for (const h of ['192.168.1.5', '10.0.0.2', '172.16.0.1', '172.31.255.255', '127.0.0.1', 'localhost', 'nas.local',
    'taleward.fritz.box', '[fe80::1]', 'fd12:3456::1', '::1']) {
    assert.equal(isHomeNetworkHost(h), true, h);
  }
});

test('öffentliche Adressen zählen nicht als Heimnetz', () => {
  for (const h of ['verein.de', '8.8.8.8', '172.32.0.1', '192.169.0.1', '2001:db8::1', 'local.verein.de', '999.1.1.1', '']) {
    assert.equal(isHomeNetworkHost(h), false, h);
  }
});

test('http mit öffentlicher Adresse wird zu https', () => {
  assert.equal(secureUrl('http://verein.de/einladung/X'), 'https://verein.de/einladung/X');
  assert.equal(secureUrl('HTTP://verein.de'), 'https://verein.de');
  assert.equal(secureUrl('http://192.168.1.5:8000'), 'http://192.168.1.5:8000');
  assert.equal(secureUrl('https://verein.de'), 'https://verein.de');
});

test('Serveradresse: Heimnetz mit http, sonst https', () => {
  assert.equal(normalizeBaseUrl('verein.de'), 'https://verein.de/api/v1');
  assert.equal(normalizeBaseUrl('http://verein.de'), 'https://verein.de/api/v1');
  assert.equal(normalizeBaseUrl('8.8.8.8:8000'), 'https://8.8.8.8:8000/api/v1');
  assert.equal(normalizeBaseUrl('192.168.178.20:8000'), 'http://192.168.178.20:8000/api/v1');
  assert.equal(normalizeBaseUrl('http://192.168.178.20:8000/'), 'http://192.168.178.20:8000/api/v1');
});

test('Einladungslinks: http nur im Heimnetz', () => {
  assert.deepEqual(parseInvite('http://verein.de/einladung/RABE-48213759'), { baseUrl: 'https://verein.de/api/v1', code: 'RABE-48213759' });
  assert.deepEqual(parseInvite('http://192.168.1.5:8000/einladung/RABE-4821'), { baseUrl: 'http://192.168.1.5:8000/api/v1', code: 'RABE-4821' });
});

test('Einladungscodes im alten und neuen Format', () => {
  assert.deepEqual(parseInvite('RABE-4821'), { baseUrl: null, code: 'RABE-4821' });
  assert.deepEqual(parseInvite('rabe-48213759'), { baseUrl: null, code: 'RABE-48213759' });
  assert.deepEqual(parseInvite('https://taleward.verein.de/einladung/rabe-48213759'), { baseUrl: 'https://taleward.verein.de/api/v1', code: 'RABE-48213759' });
  assert.equal(parseInvite('kein code'), null);
});

test('Einladungslink und Verbindung: gleicher Hostname gilt als derselbe Server', () => {
  assert.equal(sameServerHost('https://verein.example/api/v1', 'https://verein.example/api/v1'), true);
  assert.equal(sameServerHost('http://verein.example/app/api/v1', 'https://verein.example/api/v1'), true);
  assert.equal(sameServerHost('https://verein.example:8443/api/v1', 'https://verein.example/api/v1'), false);
  assert.equal(sameServerHost('https://andere.example/api/v1', 'https://verein.example/api/v1'), false);
  assert.equal(sameServerHost('kaputt', 'https://verein.example/api/v1'), false);
});
