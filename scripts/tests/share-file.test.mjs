import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openShareFile, ShareRejected } from '../../src/share/shareFile.ts';

const v = JSON.parse(readFileSync(new URL('./vektoren/kapitel-teilen-1.json', import.meta.url), 'utf8'));
const lookup = (key, keys = [{ id: v.signKeyId, spki: v.spki }]) => ({
  serverKeys: (id) => (id === v.serverId ? keys : []),
  memberKey: async (s, c) => (s === v.serverId && c === v.campaignId ? key : null)
});

test('beide Empfänger öffnen die Datei und bekommen genau den Inhalt', async () => {
  for (const r of v.recipients) {
    const { head, content } = await openShareFile(v.file, lookup({ id: r.keyId, key: r.key }));
    assert.equal(head.campaignId, v.campaignId);
    assert.equal(head.createdAt, v.createdAt);
    assert.deepEqual(content, v.content);
  }
});

const rejects = (p) => assert.rejects(p, (e) => e instanceof ShareRejected);

test('fremder Schlüssel, unbekannter Server, falscher Signierschlüssel → abgelehnt', async () => {
  await rejects(openShareFile(v.file, lookup(v.fremderSchluessel)));
  const r = v.recipients[0];
  await rejects(openShareFile(v.file, lookup({ id: r.keyId, key: r.key }, [])));
  await rejects(openShareFile(v.file, lookup({ id: r.keyId, key: r.key }, [{ id: v.signKeyId, spki: v.spki.slice(0, -4) + 'AAAA' }])));
  await rejects(openShareFile(v.file, { serverKeys: () => [{ id: v.signKeyId, spki: v.spki }], memberKey: async () => null }));
});

test('veränderte Datei → abgelehnt', async () => {
  const r = v.recipients[0];
  const ok = lookup({ id: r.keyId, key: r.key });
  const f = JSON.parse(v.file);
  const flip = (s) => s.slice(0, 20) + (s[20] === 'A' ? 'B' : 'A') + s.slice(21);
  await rejects(openShareFile(JSON.stringify({ ...f, signed: flip(f.signed) }), ok));
  await rejects(openShareFile(JSON.stringify({ ...f, signature: flip(f.signature) }), ok));
  await rejects(openShareFile(JSON.stringify({ ...f, format: 'taleward-kapitel/2' }), ok));
  await rejects(openShareFile('kein json', ok));
  await rejects(openShareFile(' '.repeat(5 * 1024 * 1024 + 1), ok));
});

test('Signatur r‖s passt zu DER (gleiches Paar)', () => {
  const der = Buffer.from(v.derSignature, 'base64url');
  const p1363 = Buffer.from(v.p1363Signature, 'base64url');
  assert.equal(p1363.length, 64);
  // DER: 30 len 02 lr r 02 ls s – führende Nullen entfernt
  const rLen = der[3], r = der.subarray(4, 4 + rLen), s = der.subarray(6 + rLen);
  const pad = (x) => Buffer.concat([Buffer.alloc(32), x.subarray(x[0] === 0 ? 1 : 0)]).subarray(-32);
  assert.deepEqual(Buffer.concat([pad(r), pad(s)]), p1363);
});
