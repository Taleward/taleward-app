import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkAcceptable } from '../../src/review/bulk.ts';

const base = { decision: 'open', flags: [], action: 'create', publicSuggested: false, match: null };

test('Sammelübernahme: nur offene Vorschläge ohne Warnzeichen', () => {
  const list = [
    { ...base, id: 'ok' },
    { ...base, id: 'joke', flags: ['joke_suspected'] },
    { ...base, id: 'unsure', flags: ['low_confidence'] },
    { ...base, id: 'reveal', action: 'reveal' },
    { ...base, id: 'public', publicSuggested: true },
    { ...base, id: 'similar', match: { entryId: 'e1', name: 'Orin', entryType: 'npc' } },
    { ...base, id: 'done', decision: 'accepted' },
    { ...base, id: 'update', action: 'update' }
  ];
  assert.deepEqual(bulkAcceptable(list).map((p) => p.id), ['ok', 'update']);
});
