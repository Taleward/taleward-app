// Zähler je Spielsystem: Vorlagen und eindeutige Kennungen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterId, counterPreset } from '../../src/characters/counterPresets.ts';

test('DSA auf Deutsch und Englisch mit gleichen Kennungen', () => {
  const de = counterPreset('dsa', 'de');
  const en = counterPreset('dsa', 'en');
  assert.deepEqual(de.map((k) => k.id), en.map((k) => k.id));
  assert.equal(de[0].label, 'LeP');
  assert.equal(en[0].label, 'LP');
});

test('ohne System die allgemeine Vorlage', () => {
  assert.equal(counterPreset(null, 'de')[0].label, 'Leben');
});

test('Kennungen passen zum Muster der Schnittstelle und sind eindeutig', () => {
  const id = counterId('Glück & Ärger', []);
  assert.match(id, /^[a-z0-9_-]{1,24}$/);
  assert.equal(counterId('LeP', ['lep']), 'lep-2');
  for (const k of counterPreset('cthulhu', 'de')) assert.match(k.id, /^[a-z0-9_-]{1,24}$/);
});
