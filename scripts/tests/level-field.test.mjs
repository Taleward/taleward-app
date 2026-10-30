import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classSuggestions, cleanClasses, guessSystem, levelKind, levelText } from '../../src/characters/levelField.ts';

test('Spielsystem aus freiem Text', () => {
  assert.equal(guessSystem('D&D 5e'), 'dnd');
  assert.equal(guessSystem('dnd'), 'dnd');
  assert.equal(guessSystem('Pathfinder 2'), 'pathfinder');
  assert.equal(guessSystem('DSA 5'), 'dsa');
  assert.equal(guessSystem('Das Schwarze Auge'), 'dsa');
  assert.equal(guessSystem('Splittermond'), 'splittermond');
  assert.equal(guessSystem('Call of Cthulhu'), 'cthulhu');
  assert.equal(guessSystem('Shadowrun 6'), 'shadowrun');
  assert.equal(guessSystem('Dsalon'), 'other');
  assert.equal(guessSystem(''), 'other');
  assert.equal(guessSystem(null), 'other');
});

test('Feld je Spielsystem', () => {
  assert.equal(levelKind('dnd'), 'class');
  assert.equal(levelKind('dsa'), 'experience');
  assert.equal(levelKind('splittermond'), 'herograde');
  assert.equal(levelKind('cthulhu'), null);
  assert.equal(levelKind('shadowrun'), null);
  assert.equal(levelKind(null), 'level');
  assert.equal(levelKind('unbekannt'), 'level');
});

test('Klassen säubern und anzeigen', () => {
  const rows = cleanClasses([{ name: ' Magier ', level: '3' }, { name: 'Schurke', level: 2 }, { name: '', level: 4 }, { name: 'Mönch', level: '' }, { name: 'Kämpfer', level: 0 }]);
  assert.deepEqual(rows, [{ name: 'Magier', level: 3 }, { name: 'Schurke', level: 2 }]);
  assert.equal(levelText(rows, 'egal'), 'Magier 3 / Schurke 2');
  assert.equal(levelText([], ' Erfahren '), 'Erfahren');
  assert.equal(levelText(undefined, ''), null);
  assert.equal(cleanClasses(Array.from({ length: 6 }, () => ({ name: 'Barde', level: 1 }))).length, 4);
  assert.ok(classSuggestions('dnd', 'de').includes('Hexenmeister'));
  assert.ok(classSuggestions('dnd', 'en').includes('Warlock'));
  assert.deepEqual(classSuggestions('dsa', 'de'), []);
});
