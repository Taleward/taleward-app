// Vorbereitung auf die nächste Runde: wann die Karte steht, welche Einträge hineingehören
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastRoundEntries, needsDate, prepWhen } from '../../src/prep/prep.ts';

const at = (s) => new Date(s);

test('Ohne Termin oder lange nach dem Beginn: keine Karte', () => {
  assert.equal(prepWhen(null, at('2026-10-17T10:00:00')), 'none');
  assert.equal(prepWhen('kaputt', at('2026-10-17T10:00:00')), 'none');
  assert.equal(prepWhen('2026-10-17T19:00:00', at('2026-10-18T02:00:00')), 'none');
});

test('Spieltag und davor', () => {
  assert.equal(prepWhen('2026-10-17T19:00:00', at('2026-10-17T09:00:00')), 'today');
  assert.equal(prepWhen('2026-10-17T19:00:00', at('2026-10-17T22:00:00')), 'today');
  assert.equal(prepWhen('2026-10-17T19:00:00', at('2026-10-15T09:00:00')), 'upcoming');
});

test('Datum erst ab einer Woche Abstand', () => {
  assert.equal(needsDate('2026-10-17T19:00:00', at('2026-10-15T09:00:00')), false);
  assert.equal(needsDate('2026-10-31T19:00:00', at('2026-10-15T09:00:00')), true);
});

test('NSC und Orte der letzten Runde, NSC zuerst', () => {
  const list = [
    { type: 'location', name: 'Senkmoor', lastSessionNumber: 8 },
    { type: 'npc', name: 'Ohm Tessel', lastSessionNumber: 8 },
    { type: 'npc', name: 'Edmar Quell', lastSessionNumber: 8 },
    { type: 'npc', name: 'Rell', lastSessionNumber: 7 },
    { type: 'quest', name: 'Livs Verschwinden', lastSessionNumber: 8 }
  ];
  assert.deepEqual(lastRoundEntries(list, 8).map((e) => e.name), ['Edmar Quell', 'Ohm Tessel', 'Senkmoor']);
});
