// Hinweis „wer liest“ bei Charakterbögen und Hintergründen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisReader } from '../../src/characters/analysisReader.ts';

test('fehlen die Angaben des Servers, wird bei erlaubter Cloud nie „lokal“ angezeigt', () => {
  assert.equal(analysisReader({ allowCloudSummary: true, infoKnown: false, serverHasCloud: false }), 'maybe_cloud');
  assert.equal(analysisReader({ allowCloudSummary: false, infoKnown: false, serverHasCloud: false }), 'local');
});

test('mit Angaben des Servers', () => {
  assert.equal(analysisReader({ allowCloudSummary: true, infoKnown: true, serverHasCloud: true }), 'cloud');
  assert.equal(analysisReader({ allowCloudSummary: true, infoKnown: true, serverHasCloud: false }), 'local');
  assert.equal(analysisReader({ allowCloudSummary: false, infoKnown: true, serverHasCloud: true }), 'local');
});

test('eine angelegte Auswertung sagt es selbst', () => {
  assert.equal(analysisReader({ usesCloud: true, allowCloudSummary: false, infoKnown: false, serverHasCloud: false }), 'cloud');
  assert.equal(analysisReader({ usesCloud: false, allowCloudSummary: true, infoKnown: true, serverHasCloud: true }), 'local');
});
