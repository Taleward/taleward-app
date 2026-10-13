// Kennungen und Pfade nach dem Muster der Schnittstelle 0.4.14
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allSafeIds, isSafeAppPath, isSafeId, isSafePath } from '../../src/api/pathGuard.ts';

test('gültige Kennungen', () => {
  for (const id of ['c-wasser', '3f2a9c1e-0b4d-4a5e-9f00-1234567890ab', 'SPEAKER_00', 'link-c-wasser-karte']) assert.ok(isSafeId(id), id);
});

test('ungültige Kennungen', () => {
  for (const id of ['../sessions/x?', 'a/b', '', 'x'.repeat(65), 'a b', 'a%2F', null, 42]) assert.ok(!isSafeId(id), String(id));
});

test('Pfade', () => {
  assert.ok(isSafePath('/campaigns/c-wasser/members/me/character'));
  assert.ok(isSafePath('/campaigns/c1/entries?type=npc&q=Iria Sehl'));
  assert.ok(isSafePath('/info'));
  assert.ok(!isSafePath('/campaigns/../sessions/x'));
  assert.ok(!isSafePath('/campaigns/x/./y'));
  assert.ok(!isSafePath('/campaigns//members'));
  assert.ok(!isSafePath('/campaigns/a%2Fb'));
  assert.ok(!isSafePath('campaigns/x'));
});

test('Abfrage kann den Pfad nicht abschneiden', () => {
  assert.ok(!isSafePath('/campaigns/abc?/members/x'));
  assert.ok(!isSafePath('/campaigns/abc?x=1?y=2'));
  assert.ok(!isSafePath('/campaigns/abc?x=1#frag'));
  assert.ok(isSafePath('/campaigns/c1/usage?month=2026-10'));
  assert.ok(isSafePath('/campaigns/c1/members/m1/portrait?cropX=0.1&cropY=0.2&cropSize=0.5'));
});

test('Pfade innerhalb der App', () => {
  assert.ok(isSafeAppPath('/v/verein/k/c-grau'));
  assert.ok(isSafeAppPath('/v/verein/s/s-c-grau-13/freigabe'));
  assert.ok(!isSafeAppPath('/v/verein/k/abc?/members'));
  assert.ok(!isSafeAppPath('/v/verein/k/../x'));
  assert.ok(!isSafeAppPath('/konto'));
  assert.ok(!isSafeAppPath('//evil.example/v/x'));
});

test('Routen-Parameter', () => {
  assert.ok(allSafeIds({ conn: 'verein', campaignId: 'c-grau' }));
  assert.ok(!allSafeIds({ conn: 'verein', campaignId: 'abc?' }));
  assert.ok(!allSafeIds({ conn: 'verein', sessionId: 'a/b' }));
});
