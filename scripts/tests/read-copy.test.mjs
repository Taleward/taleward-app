// Lesekopie ohne Netz: nur, was alle Spielerinnen sehen dürfen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignOfPath, cleanForCopy, copyable, sessionOfPath } from '../../src/api/readCopyRules.ts';

test('nur die Lesewege für Übersicht, Chronik, Kapitel, Kommentare und Bibel', () => {
  assert.ok(copyable('/campaigns'));
  assert.ok(copyable('/campaigns/c-1'));
  assert.ok(copyable('/campaigns/c-1/sessions'));
  assert.ok(copyable('/sessions/s-1/recap'));
  assert.ok(copyable('/campaigns/c-1/entries?type=npc'));
  for (const p of ['/sessions/s-1/transcript', '/sessions/s-1/proposals', '/sessions/s-1/gm-note', '/campaigns/c-1/plans',
    '/campaigns/c-1/documents', '/me', '/campaigns/c-1/character-proposals', '/campaigns/../x']) assert.equal(copyable(p), false, p);
});

test('Kampagne: keine Hinweise an die SL, keine Namenshilfe, nur geteilte Links, nur der eigene Hintergrund', () => {
  const c = cleanForCopy('/campaigns/c-1', {
    id: 'c-1', title: 'T', myRole: 'gm', description: 'd', openCharacterProposals: 3, pendingReviewCount: 2, unread: { recaps: 1 },
    hotwords: ['Geheimname'], gmNotices: [{ id: 'n' }],
    links: [{ id: 'a', shared: true }, { id: 'b', shared: false }],
    members: [{ id: 'm1', userId: 'u-sl', characterBackstory: 'eigen' }, { id: 'm2', userId: 'u-x', characterBackstory: 'fremd' }]
  }, 'u-sl');
  assert.equal(c.hotwords, undefined);
  assert.equal(c.gmNotices, undefined);
  assert.equal(c.openCharacterProposals, undefined);
  assert.equal(c.unread, undefined);
  assert.equal(c.pendingReviewCount, 0);
  assert.deepEqual(c.links.map((l) => l.id), ['a']);
  assert.equal(c.members[0].characterBackstory, 'eigen');
  assert.equal(c.members[1].characterBackstory, undefined);
});

test('Spieler: alle gelieferten Links bleiben', () => {
  const c = cleanForCopy('/campaigns/c-1', { id: 'c-1', myRole: 'player', links: [{ id: 'a' }], members: [] }, 'u');
  assert.equal(c.links.length, 1);
});

test('Chronik und Kapitel: nur Veröffentlichtes, ohne Prüfteil und Entwurf', () => {
  const list = cleanForCopy('/campaigns/c-1/sessions', [{ id: 's1', state: 'published' }, { id: 's2', state: 'awaiting_review' }], null);
  assert.deepEqual(list.map((s) => s.id), ['s1']);
  assert.equal(cleanForCopy('/sessions/s2', { id: 's2', state: 'awaiting_review' }, null), null);
  assert.equal(cleanForCopy('/sessions/s2/recap', { sessionId: 's2', text: 'x', publishedAt: null }, null), null);
  const r = cleanForCopy('/sessions/s1/recap', { sessionId: 's1', text: 'x', publishedAt: '2026-10-01', review: {}, revision: {} }, null);
  assert.equal(r.review, undefined);
  assert.equal(r.revision, undefined);
  assert.equal(r.text, 'x');
});

test('Bibel: nur öffentliche Einträge, die alle sehen, ohne SL-Notiz', () => {
  const list = cleanForCopy('/campaigns/c-1/entries', [
    { id: 'a', visibility: 'public', gmNotes: 'geheim', formerHolderMemberId: 'm', links: [{ id: 'l1', shared: false }, { id: 'l2', shared: true }] },
    { id: 'b', visibility: 'gm_only' },
    { id: 'c', visibility: 'public', hiddenFromMemberIds: ['m2'] }
  ], null);
  assert.deepEqual(list.map((e) => e.id), ['a']);
  assert.equal(list[0].gmNotes, undefined);
  assert.equal(list[0].formerHolderMemberId, undefined);
  assert.deepEqual(list[0].links.map((l) => l.id), ['l2']);
});

test('Kommentare: keine privaten Nachrichten', () => {
  const list = cleanForCopy('/sessions/s1/comments', [{ id: 'a', recipientMemberId: null }, { id: 'b', recipientMemberId: 'm2' }], null);
  assert.deepEqual(list.map((c) => c.id), ['a']);
});

test('fremde Plätze nur mit Feldern, die alle sehen; Charakter-Kennung nur am eigenen Platz', () => {
  const c = cleanForCopy('/campaigns/c-1', {
    id: 'c-1', myRole: 'gm', members: [
      { id: 'm1', userId: 'u-sl', displayName: 'Anja', role: 'gm', characterId: 'ch-1', characterVersion: 3, recordingConsentAt: 'x', künftigesSlFeld: 'geheim' },
      { id: 'm2', userId: '', displayName: 'Offen', role: 'player', openSeat: true, characterId: 'ch-2', characterVersion: 1, recordingConsentAt: 'y', characterSummary: 'kurz' }
    ]
  }, 'u-sl');
  assert.equal(c.members[0].characterId, 'ch-1');
  assert.equal(c.members[0].recordingConsentAt, 'x');
  assert.equal(c.members[0].künftigesSlFeld, undefined);
  assert.equal(c.members[1].characterId, undefined);
  assert.equal(c.members[1].characterVersion, undefined);
  assert.equal(c.members[1].recordingConsentAt, undefined);
  assert.equal(c.members[1].characterSummary, 'kurz');
  assert.equal(c.members[1].openSeat, true);
});

test('jede Kopie kennt ihre Kampagne', () => {
  assert.equal(campaignOfPath('/campaigns/c-1', null), 'c-1');
  assert.equal(campaignOfPath('/campaigns/c-1/entries?x=1', null), 'c-1');
  assert.equal(campaignOfPath('/sessions/s-1', { campaignId: 'c-9' }), 'c-9');
  assert.equal(campaignOfPath('/sessions/s-1/recap', {}), null);
  assert.equal(sessionOfPath('/sessions/s-1/comments'), 's-1');
  assert.equal(campaignOfPath('/campaigns', []), null);
});

test('Kommentare nur mit bekannten Feldern, Einträge ohne Kapitelnummern', () => {
  const c = cleanForCopy('/sessions/s-1/comments', [{ id: 'k', sessionId: 's-1', authorMemberId: 'm', recipientMemberId: null, text: 'Hallo', createdAt: 'x', editedAt: null, neuesFeld: 'geheim' }], 'u');
  assert.equal(c[0].text, 'Hallo');
  assert.equal(c[0].neuesFeld, undefined);
  const e = cleanForCopy('/campaigns/c-1/entries', [{ id: 'e', visibility: 'public', name: 'Ort', firstSessionNumber: 3, lastSessionNumber: 9 }], 'u');
  assert.equal(e[0].name, 'Ort');
  assert.equal(e[0].firstSessionNumber, undefined);
  assert.equal(e[0].lastSessionNumber, undefined);
  // „Auch genannt“ bleibt, aber nur als kurze Texte
  const a = cleanForCopy('/campaigns/c-1/entries', [{ id: 'e', visibility: 'public', name: 'Ort', aliases: ['Altort', 7, 'x'.repeat(80)] }], 'u');
  assert.deepEqual(a[0].aliases, ['Altort', 'x'.repeat(40)]);
});
