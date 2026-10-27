import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeRequired, gmState, registrationCodes, registrationMode, termsOutdated } from '../../src/auth/serverAccess.ts';

test('Registrierungsart: unbekannte Werte gelten wie invite_only, ohne Angaben nichts', () => {
  assert.equal(registrationMode({ registration: 'invite_only' }), 'invite_only');
  assert.equal(registrationMode({ registration: 'code' }), 'code');
  assert.equal(registrationMode({ registration: 'open' }), 'open');
  assert.equal(registrationMode({ registration: 'closed' }), 'closed');
  assert.equal(registrationMode({ registration: 'later_mode' }), 'invite_only');
  assert.equal(registrationMode(null), null);
});

test('Registrieren: nur bei offenem Server ohne Code', () => {
  assert.equal(codeRequired('open'), false);
  assert.equal(codeRequired('invite_only'), true);
  assert.equal(codeRequired('code'), true);
});

test('Registrieren: allgemeiner Code geht als registrationCode, Einladungen als inviteCode', () => {
  assert.deepEqual(registrationCodes('code', ' TAVERNE ', false), { registrationCode: 'TAVERNE' });
  assert.deepEqual(registrationCodes('code', 'RABE-4821', true), { inviteCode: 'RABE-4821' });
  assert.deepEqual(registrationCodes('invite_only', 'RABE-4821', false), { inviteCode: 'RABE-4821' });
  assert.deepEqual(registrationCodes('open', 'RABE-4821', false), { inviteCode: 'RABE-4821' });
  assert.deepEqual(registrationCodes('open', '  ', false), {});
});

test('SL-Freigabe: nur bei gmApproval required zählt gmPermission; ältere Server und Konten wie freigegeben', () => {
  assert.equal(gmState({}, { gmPermission: 'none' }), 'ok');
  assert.equal(gmState({ gmApproval: 'none' }, { gmPermission: 'none' }), 'ok');
  assert.equal(gmState({ gmApproval: 'required' }, {}), 'ok');
  assert.equal(gmState({ gmApproval: 'required' }, { gmPermission: 'granted' }), 'ok');
  assert.equal(gmState({ gmApproval: 'required' }, { gmPermission: 'none' }), 'none');
  assert.equal(gmState({ gmApproval: 'required' }, { gmPermission: 'pending' }), 'pending');
  assert.equal(gmState({ gmApproval: 'required' }, { gmPermission: 'rejected' }), 'rejected');
  assert.equal(gmState({ gmApproval: 'required' }, { gmPermission: 'something_new' }), 'none');
});

test('Nutzungsbedingungen: neue Fassung erkannt, ohne Fassung nie', () => {
  assert.equal(termsOutdated({ termsVersion: 2 }, { termsAcceptedVersion: 1 }), true);
  assert.equal(termsOutdated({ termsVersion: 2 }, { termsAcceptedVersion: null }), true);
  assert.equal(termsOutdated({ termsVersion: 2 }, { termsAcceptedVersion: 2 }), false);
  assert.equal(termsOutdated({ termsVersion: null }, { termsAcceptedVersion: null }), false);
});
