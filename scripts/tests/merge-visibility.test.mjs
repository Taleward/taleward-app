import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergesIntoNotes } from '../../src/review/mergeVisibility.ts';

const prop = (v, hidden = []) => ({ suggestedVisibility: v, hiddenFromMemberIds: hidden });

test('Geheimer Vorschlag bei öffentlichem Eintrag geht in die SL-Notizen', () => {
  assert.equal(mergesIntoNotes(prop('gm_only'), { visibility: 'public', hiddenFromMemberIds: [] }), true);
});

test('Gleiche Sichtbarkeit: normal ergänzen', () => {
  assert.equal(mergesIntoNotes(prop('public'), { visibility: 'public', hiddenFromMemberIds: [] }), false);
  assert.equal(mergesIntoNotes(prop('gm_only'), { visibility: 'gm_only' }), false);
  assert.equal(mergesIntoNotes(prop('public', ['m1']), { visibility: 'public', hiddenFromMemberIds: ['m1', 'm2'] }), false);
});

test('Vor jemandem verborgen, der den Eintrag sieht', () => {
  assert.equal(mergesIntoNotes(prop('public', ['m1']), { visibility: 'public', hiddenFromMemberIds: [] }), true);
  // Ehemalige zählen nicht
  assert.equal(mergesIntoNotes(prop('public', ['alt']), { visibility: 'public', hiddenFromMemberIds: [] }, ['m1']), false);
});

test('Eintrag unbekannt', () => {
  assert.equal(mergesIntoNotes(prop('gm_only'), undefined), null);
});
