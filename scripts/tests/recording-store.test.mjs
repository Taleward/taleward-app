// Zwischenspeicher für Browser-Aufnahmen: Stücke in Reihenfolge, liegengebliebene Aufnahmen finden, nichts von selbst löschen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_MS, leftoverRecordings, loadRecording, removeRecording, saveMeta, savePart, setStoreBackend
} from '../../src/recorder/webStore.ts';

function memoryBackend() {
  const meta = new Map();
  const parts = new Map();
  return {
    async putMeta(m) { meta.set(m.id, { ...m }); },
    async allMeta() { return [...meta.values()]; },
    async putPart(id, seq, blob) { parts.set(`${id}|${seq}`, { id, seq, blob }); },
    async parts(id) {
      return [...parts.values()].filter((p) => p.id === id).sort((a, b) => a.seq - b.seq).map((p) => p.blob);
    },
    async remove(id) {
      meta.delete(id);
      for (const k of [...parts.keys()]) if (k.startsWith(`${id}|`)) parts.delete(k);
    }
  };
}

const rec = (over) => ({
  id: 'r1', connId: 'k1', sessionId: 's1', campaignId: 'c1', title: 'Grauwacht', mimeType: 'audio/webm',
  startedAt: '2026-10-13T18:00:00.000Z', elapsedMs: 0, parts: 0, bytes: 0, state: 'recording', aliveAt: 0, ...over
});

test('Stücke ergeben in Reihenfolge wieder eine Datei, auch wenn sie durcheinander ankommen', async () => {
  setStoreBackend(memoryBackend());
  const m = rec({ parts: 3 });
  await saveMeta(m);
  await savePart('r1', 2, new Blob(['C']));
  await savePart('r1', 0, new Blob(['A']));
  await savePart('r1', 1, new Blob(['B']));
  const blob = await loadRecording(m);
  assert.equal(await blob.text(), 'ABC');
  assert.equal(blob.type, 'audio/webm');
});

test('liegengeblieben: beendet oder ohne Lebenszeichen; laufende Aufnahme in anderem Fenster nicht', async () => {
  setStoreBackend(memoryBackend());
  const now = Date.parse('2026-10-13T22:00:00Z');
  await saveMeta(rec({ id: 'beendet', state: 'stopped', parts: 2, aliveAt: now }));
  await saveMeta(rec({ id: 'abgestuerzt', parts: 5, aliveAt: now - STALE_MS - 1, startedAt: '2026-10-13T19:00:00.000Z' }));
  await saveMeta(rec({ id: 'laeuft', parts: 9, aliveAt: now - 5000 }));
  await saveMeta(rec({ id: 'fremd', connId: 'k2', state: 'stopped', parts: 1 }));
  const list = await leftoverRecordings('k1', now);
  assert.deepEqual(list.map((r) => r.id), ['abgestuerzt', 'beendet']);
});

test('ohne Ton abgebrochen: wird aufgeräumt, mit Ton bleibt bis zum Löschen', async () => {
  const b = memoryBackend();
  setStoreBackend(b);
  await saveMeta(rec({ id: 'leer', state: 'stopped', parts: 0 }));
  await saveMeta(rec({ id: 'voll', state: 'stopped', parts: 1 }));
  await savePart('voll', 0, new Blob(['x']));
  assert.deepEqual((await leftoverRecordings('k1')).map((r) => r.id), ['voll']);
  assert.deepEqual((await b.allMeta()).map((r) => r.id), ['voll']);
  await removeRecording('voll');
  assert.deepEqual(await leftoverRecordings('k1'), []);
  assert.deepEqual(await b.parts('voll'), []);
});

test('ohne Speicher im Gerät: keine Liste, kein Fehler', async () => {
  setStoreBackend(null);
  assert.deepEqual(await leftoverRecordings('k1'), []);
  await assert.rejects(saveMeta(rec({})));
});
