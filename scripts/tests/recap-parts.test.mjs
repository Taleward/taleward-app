// Teile im Kapitel (Schnittstelle 0.4.17)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromEditText, partTitles, speechText, toEditText } from '../../src/review/parts.ts';

const text = 'Erster Absatz.\n\nZweiter Absatz.\n\nDritter Absatz.';
const parts = [{ title: 'Die Anwerbung', firstParagraph: 0 }, { title: 'Am nächsten Abend', firstParagraph: 2 }];

test('gültige Teile', () => {
  const m = partTitles(parts, 3);
  assert.deepEqual([...m.entries()], [[0, 'Die Anwerbung'], [2, 'Am nächsten Abend']]);
});

test('Unbrauchbares wird übergangen, das Kapitel bleibt lesbar', () => {
  assert.equal(partTitles(undefined, 3).size, 0);
  assert.equal(partTitles(null, 3).size, 0);
  const m = partTitles([
    { title: 'A', firstParagraph: 1 },
    { title: 'zurück', firstParagraph: 0 },
    { title: '  ', firstParagraph: 2 },
    { title: 'zu weit', firstParagraph: 3 },
    { title: 'krumm', firstParagraph: 1.5 },
    { title: 'B', firstParagraph: 2 }
  ], 3);
  assert.deepEqual([...m.entries()], [[1, 'A'], [2, 'B']]);
  assert.equal(partTitles([{ title: 'x'.repeat(200), firstParagraph: 0 }], 1).get(0).length, 120);
});

test('Bearbeiten: hin und zurück', () => {
  const edit = toEditText(text, parts);
  assert.equal(edit, '# Die Anwerbung\n\nErster Absatz.\n\nZweiter Absatz.\n\n# Am nächsten Abend\n\nDritter Absatz.');
  assert.deepEqual(fromEditText(edit), { text, parts });
});

test('Bearbeiten: Absatz eingefügt, Überschrift verschoben, gelöscht', () => {
  const r = fromEditText('Neu vorn.\n\n# Die Anwerbung\n\nErster Absatz.\n\nZweiter Absatz.\n\nDritter Absatz.');
  assert.deepEqual(r.parts, [{ title: 'Die Anwerbung', firstParagraph: 1 }]);
  assert.equal(r.text, 'Neu vorn.\n\nErster Absatz.\n\nZweiter Absatz.\n\nDritter Absatz.');
  // „#“ mitten im Absatz oder über mehrere Zeilen ist keine Überschrift
  const s = fromEditText('# nur eine Zeile\nund noch eine\n\nText');
  assert.deepEqual(s.parts, []);
  // Überschrift ganz am Ende ohne Absatz danach fällt weg
  assert.deepEqual(fromEditText('Text\n\n# Ende').parts, []);
});

test('Vorlesen mit Überschriften', () => {
  assert.equal(speechText('Kapitel', 'A\n\nB', [{ title: 'Teil zwei', firstParagraph: 1 }]), 'Kapitel. A\n\nTeil zwei. B');
});

test('Überschrift, die nur den Kapiteltitel wiederholt, entfällt', () => {
  const m = partTitles([{ title: 'Nebel', firstParagraph: 0 }, { title: 'Danach', firstParagraph: 1 }], 2, ' nebel ');
  assert.deepEqual([...m.entries()], [[1, 'Danach']]);
  assert.equal(speechText('Nebel', 'A\n\nB', [{ title: 'Nebel', firstParagraph: 0 }]), 'Nebel. A\n\nB');
});
