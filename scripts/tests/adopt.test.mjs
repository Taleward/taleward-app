import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptTarget } from '../../src/characters/adopt.ts';

test('Charakter eines anderen Kontos nur nach Rückfrage', () => {
  const stored = [{ id: 'c1', owners: ['https://a.test/api/v1|u-a'] }, { id: 'c2', owners: ['https://b.test/api/v1|u-b'] }];
  const mineB = ['https://b.test/api/v1|u-b'];
  assert.equal(adoptTarget('c1', stored, mineB), 'foreign');
  assert.equal(adoptTarget('c2', stored, mineB), 'own');
  assert.equal(adoptTarget('c3', stored, mineB), 'new');
  assert.equal(adoptTarget(null, stored, mineB), 'new');
  assert.equal(adoptTarget('c1', [{ id: 'c1', owners: null }], mineB), 'foreign');
});
