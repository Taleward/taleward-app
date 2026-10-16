// Prüft, dass Adressen vom Server nur als http(s)-Link durchkommen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeLink, withSafeLinks } from '../../src/api/safeUrl.ts';

test('nur https und http werden zu Links', () => {
  assert.equal(safeLink('https://verein.de/datenschutz'), 'https://verein.de/datenschutz');
  assert.equal(safeLink('http://192.168.1.5:8000/app.apk'), 'http://192.168.1.5:8000/app.apk');
});

test('javascript:, data: und Unsinn werden verworfen', () => {
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'kein link', '', null, undefined]) {
    assert.equal(safeLink(bad), null, String(bad));
  }
});

test('Server-Info wird bereinigt, andere Felder bleiben', () => {
  const info = withSafeLinks({ name: 'Verein', privacyPolicyUrl: 'javascript:alert(1)', appDownloadUrl: 'https://verein.de/taleward.apk' });
  assert.deepEqual(info, { name: 'Verein', privacyPolicyUrl: null, appDownloadUrl: 'https://verein.de/taleward.apk' });
  const legal = withSafeLinks({ privacyPolicyUrl: null, legalNoticeUrl: 'data:text/html,x', termsUrl: 'https://verein.de/nutzungsbedingungen' });
  assert.equal(legal.legalNoticeUrl, null);
  assert.equal(legal.termsUrl, 'https://verein.de/nutzungsbedingungen');
});
