// Charakter-Datei aufräumen (Schnittstelle 0.4.14)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCharacter } from '../../src/characters/sanitize.ts';

const ok = {
  id: 'c1', version: 2, name: 'Litha', status: 'active', notes: 'privat', portrait: null, updatedAt: '2026-10-01T00:00:00Z',
  world: [{ id: 'w1', version: 1, type: 'npc', name: 'Bruder', summary: '', secret: false }],
  links: [{ connId: 'k1', serverName: 'A', campaignId: 'c-wasser', campaignTitle: 'X', memberId: 'm1', linkedAt: '', syncedVersion: 1 }],
  chronicles: { 'k1:c-wasser': { takenAt: '2026-10-01T00:00:00Z' } }
};

test('gültiger Charakter bleibt', () => {
  const c = sanitizeCharacter(ok);
  assert.equal(c.links.length, 1);
  assert.equal(c.world.length, 1);
});

test('Verknüpfung mit ungültiger Kennung fällt weg', () => {
  const c = sanitizeCharacter({ ...ok, links: [{ ...ok.links[0], campaignId: '../sessions/x?' }, { ...ok.links[0], memberId: 'a/b' }] });
  assert.deepEqual(c.links, []);
});

test('unbrauchbare Charaktere werden abgelehnt', () => {
  assert.equal(sanitizeCharacter({ ...ok, id: '../x' }), null);
  assert.equal(sanitizeCharacter({ ...ok, portrait: 'javascript:alert(1)' }), null);
  assert.equal(sanitizeCharacter(null), null);
});

test('fremde Welt-Einträge fallen weg', () => {
  const c = sanitizeCharacter({ ...ok, world: [{ ...ok.world[0], type: 'pc' }, { ...ok.world[0], id: 'x y' }] });
  assert.deepEqual(c.world, []);
});

test('Beziehung zum Charakter (0.4.19): kurzer Text bleibt, zu lang oder kein Text fällt weg', () => {
  const c = sanitizeCharacter({ ...ok, world: [
    { ...ok.world[0], relation: 'Bruder von Litha' },
    { ...ok.world[0], id: 'w2', relation: null },
    { ...ok.world[0], id: 'w3', relation: 'x'.repeat(121) },
    { ...ok.world[0], id: 'w4', relation: 42 }
  ] });
  assert.deepEqual(c.world.map((w) => w.id), ['w1', 'w2']);
});
