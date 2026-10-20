import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLastTable } from '../../src/table/lastTable.ts';

test('Gemerkter SL-Schirm: nur gültige Kennungen', () => {
  assert.deepEqual(parseLastTable('{"conn":"verein","campaignId":"c-grau"}'), { conn: 'verein', campaignId: 'c-grau' });
  assert.equal(parseLastTable(null), null);
  assert.equal(parseLastTable('kaputt'), null);
  assert.equal(parseLastTable('{"conn":"verein","campaignId":"../x"}'), null);
  assert.equal(parseLastTable('{"conn":"verein"}'), null);
});
