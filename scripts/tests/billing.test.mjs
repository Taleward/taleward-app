import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingOn, canApprove, euro, parseEuro, topUpUrl, vouchersAllowed, waitReason } from '../../src/billing/rules.ts';

const on = { billing: { mode: 'credit', currency: 'EUR', topUpUrl: 'https://verein.test/guthaben' } };

test('Guthaben: aus, wenn die Angabe fehlt, null ist oder einen unbekannten Modus hat', () => {
  assert.equal(billingOn(null), false);
  assert.equal(billingOn({}), false);
  assert.equal(billingOn({ billing: null }), false);
  assert.equal(billingOn({ billing: { mode: 'later' } }), false);
  assert.equal(billingOn(on), true);
  assert.equal(billingOn({ billing: { mode: 'pot' } }), true);
});

test('Aufladen: nie im Store, nur auf demselben Server, nur http(s)', () => {
  assert.equal(topUpUrl(on, 'https://verein.test/api/v1', 'store'), null);
  assert.equal(topUpUrl(on, 'https://verein.test/api/v1', 'apk'), 'https://verein.test/guthaben');
  assert.equal(topUpUrl(on, 'https://verein.test', 'web'), 'https://verein.test/guthaben');
  assert.equal(topUpUrl(on, 'https://anderer.test/api/v1', 'apk'), null);
  assert.equal(topUpUrl(on, 'https://verein.test:8443/api/v1', 'apk'), null);
  assert.equal(topUpUrl({ billing: { mode: 'credit', topUpUrl: 'javascript:alert(1)' } }, 'https://verein.test', 'apk'), null);
  assert.equal(topUpUrl({ billing: { mode: 'credit', topUpUrl: null } }, 'https://verein.test', 'apk'), null);
  assert.equal(topUpUrl({ billing: null }, 'https://verein.test', 'apk'), null);
});

test('Gutscheine nicht in der Store-Fassung', () => {
  assert.equal(vouchersAllowed('store'), false);
  assert.equal(vouchersAllowed('apk'), true);
  assert.equal(vouchersAllowed('web'), true);
});

test('Wartegründe und Verarbeiten', () => {
  assert.equal(waitReason('approval'), 'approval');
  assert.equal(waitReason('neu'), 'other');
  assert.equal(waitReason(undefined), 'other');
  assert.equal(canApprove({ reason: 'approval', creditId: 'c1', jobId: 'j1' }), true);
  assert.equal(canApprove({ reason: 'approval', creditId: null, jobId: 'j1' }), false);
  assert.equal(canApprove({ reason: 'empty', creditId: 'c1', jobId: 'j1' }), false);
  assert.equal(canApprove(null), false);
});

test('Beträge', () => {
  assert.equal(euro(1240, 'de').replace(/\s/g, ' '), '12,40 €');
  assert.equal(euro(-35, 'de').replace(/\s/g, ' '), '-0,35 €');
  assert.equal(euro(1240, 'en'), '€12.40');
  assert.equal(parseEuro('2'), 200);
  assert.equal(parseEuro('2,5'), 250);
  assert.equal(parseEuro(' 2.50 € '), 250);
  assert.equal(parseEuro('abc'), null);
  assert.equal(parseEuro('-1'), null);
});
