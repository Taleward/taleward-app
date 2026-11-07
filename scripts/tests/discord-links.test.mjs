import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiBaseOf, botLinkFromAppUrl, cleanCode, parseBotLink } from '../../src/discord/links.ts';

const tok = 'a'.repeat(30);

test('Links des Bots erkennen', () => {
  assert.deepEqual(parseBotLink(`https://taleward.example.org/discord/${tok}`), { kind: 'discord', origin: 'https://taleward.example.org', token: tok });
  assert.deepEqual(parseBotLink(`https://x.org/verein/zustimmen/${tok}`), { kind: 'zustimmen', origin: 'https://x.org/verein', token: tok });
  assert.equal(apiBaseOf(parseBotLink(`https://x.org/verein/zustimmen/${tok}`)), 'https://x.org/verein/api/v1');
  assert.ok(parseBotLink(`http://192.168.1.20:8000/discord/${tok}`));
});

test('fremde Formen ablehnen', () => {
  assert.equal(parseBotLink(`http://example.org/discord/${tok}`), null, 'http nur im Heimnetz');
  assert.equal(parseBotLink(`https://u:p@x.org/discord/${tok}`), null);
  assert.equal(parseBotLink('https://x.org/discord/kurz'), null);
  assert.equal(parseBotLink(`https://x.org/discord/${tok}?a=1`), null);
  assert.equal(parseBotLink(`https://x.org/einladung/${tok}`), null);
  assert.equal(parseBotLink('javascript:alert(1)'), null);
});

test('App-Adresse', () => {
  const url = encodeURIComponent(`https://x.org/discord/${tok}`);
  assert.equal(botLinkFromAppUrl(`taleward://discord?url=${url}`)?.token, tok);
  assert.equal(botLinkFromAppUrl(`taleward://zustimmen?url=${url}`), null, 'Art muss passen');
  assert.equal(botLinkFromAppUrl('taleward://einladung?url=x'), null);
});

test('Code säubern', () => {
  assert.equal(cleanCode(' Laterne Moor_Krug '), 'laterne-moor-krug');
  assert.equal(cleanCode('LATERNE–MOOR–KRUG'), 'laterne-moor-krug');
});
