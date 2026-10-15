// Leseeinstellungen fürs Kapitel: Unbekanntes fällt auf die Voreinstellung zurück.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReadPrefs } from '../../src/reading/prefs.ts';

test('Leseeinstellungen lesen', () => {
  assert.deepEqual(parseReadPrefs(null), { size: 'normal', page: 'app' });
  assert.deepEqual(parseReadPrefs('{"size":"larger","page":"dark"}'), { size: 'larger', page: 'dark' });
  assert.deepEqual(parseReadPrefs('{"size":"riesig","page":"pink"}'), { size: 'normal', page: 'app' });
  assert.deepEqual(parseReadPrefs('kaputt'), { size: 'normal', page: 'app' });
});
