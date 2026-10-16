// „Auch genannt“: Eingabe bereinigen wie der Server, Schreibweise beim Ergänzen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addsAlias, parseAliases, MAX_ALIASES } from '../../src/bible/aliases.ts';

test('Komma, Semikolon und Zeilen trennen; Name und Doppelte fallen weg', () => {
  assert.deepEqual(parseAliases('Tarvok, der Alte; tarvok\nTharvok ,  ', 'Tharvok'), ['Tarvok', 'der Alte']);
});

test('Grenzen: höchstens zehn, je höchstens 40 Zeichen', () => {
  const many = Array.from({ length: 14 }, (_, i) => `Name${i}`).join(',');
  assert.equal(parseAliases(many, 'X').length, MAX_ALIASES);
  assert.equal(parseAliases('a'.repeat(60), 'X')[0].length, 40);
});

test('Schreibweise kommt nur dazu, wenn sie neu ist', () => {
  assert.equal(addsAlias('Tarvok', 'Tharvok', []), true);
  assert.equal(addsAlias('tharvok', 'Tharvok', []), false);
  assert.equal(addsAlias('Tarvok', 'Tharvok', ['TARVOK']), false);
  assert.equal(addsAlias('  ', 'Tharvok', []), false);
});
