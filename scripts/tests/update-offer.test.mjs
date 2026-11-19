// Prüft, wann die APK-Fassung ein Angebot eines Servers selbst installieren darf (A26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usableOffer } from '../../src/update/offer.ts';

const SHA = 'a'.repeat(64);

test('https mit Prüfsumme geht', () => {
  assert.deepEqual(usableOffer({ url: 'https://verein.de/taleward.apk', sha256: SHA.toUpperCase() }), { url: 'https://verein.de/taleward.apk', sha256: SHA });
});

test('http nur im Heimnetz', () => {
  assert.ok(usableOffer({ url: 'http://192.168.1.5:8000/taleward.apk', sha256: SHA }));
  assert.equal(usableOffer({ url: 'http://verein.de/taleward.apk', sha256: SHA }), null);
});

test('ohne gültige Prüfsumme kein Angebot', () => {
  for (const sha of [null, undefined, '', 'abc', 'g'.repeat(64), SHA + 'a']) {
    assert.equal(usableOffer({ url: 'https://verein.de/taleward.apk', sha256: sha }), null, String(sha));
  }
});

test('fremde Schemata nie', () => {
  for (const url of ['javascript:alert(1)', 'file:///sdcard/x.apk', 'content://x/y.apk', null]) {
    assert.equal(usableOffer({ url, sha256: SHA }), null, String(url));
  }
});
