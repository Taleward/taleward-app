import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, countWord, excerptParts, excerptsFor, nameFixProblem, replaceWholeWord } from '../../src/names/nameFix.ts';

test('nur ganze Wörter, wörtlich', () => {
  assert.equal(countWord('Orasilas sprach. Orasilasson nicht, aber Orasilas’ Schwur.', 'Orasilas'), 2);
  assert.equal(replaceWholeWord('Orasilas und Orasilas’ Schwur, nicht Orasilasson', 'Orasilas', 'Horasilas'),
    'Horasilas und Horasilas’ Schwur, nicht Orasilasson');
  assert.equal(countWord('a.c abc a.c', 'a.c'), 2, 'Punkt nur wörtlich');
  assert.equal(replaceWholeWord('x+y und xxy', 'x+y', 'z'), 'z und xxy');
  assert.equal(replaceWholeWord('Kosten $1 gilt', '$1', 'zwei'), 'Kosten zwei gilt', 'kein Ersatzmuster');
  assert.equal(countWord('Äbtissin Ärwin', 'Ärwin'), 1);
});

test('Eingabe prüfen', () => {
  assert.equal(nameFixProblem('er', 'sie'), 'short');
  assert.equal(nameFixProblem('Orasilas', 'Orasilas'), 'same');
  assert.equal(nameFixProblem('Orasilas', 'x'.repeat(65)), 'long');
  assert.equal(nameFixProblem(' Orasilas ', 'Horasilas'), null);
  assert.equal(cleanName('Ora' + String.fromCharCode(0) + 'silas' + String.fromCharCode(10)), 'Orasilas');
});

test('Ausschnitte mit Markierung', () => {
  const ex = excerptsFor('Es regnete. Dann trat Orasilas aus dem Schilf. Später ging Orasilas.', 'Orasilas');
  assert.deepEqual(ex, ['Dann trat [[Orasilas]] aus dem Schilf.', 'Später ging [[Orasilas]].']);
  assert.deepEqual(excerptParts(ex[0]), [{ text: 'Dann trat ', mark: false }, { text: 'Orasilas', mark: true }, { text: ' aus dem Schilf.', mark: false }]);
  assert.ok(excerptsFor(`${'x '.repeat(150)}Orasilas ${'y '.repeat(150)}.`, 'Orasilas')[0].length <= 200);
});
