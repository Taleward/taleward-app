/**
 * Zwischenspeicher für Aufnahmen im Browser. Der MediaRecorder liefert alle 10 Sekunden ein Stück; jedes Stück wird
 * sofort im Gerät abgelegt (IndexedDB), nicht im Arbeitsspeicher gesammelt. Schließt jemand das Fenster, stürzt der
 * Browser ab oder ist der Server beim Hochladen nicht erreichbar, bleibt die Aufnahme erhalten und die Aufnahme-Seite
 * bietet „Jetzt hochladen“ an – wie die Android-App mit ihren Abschnitten auf dem Handy.
 *
 * Die Stücke einer Aufnahme ergeben aneinandergehängt wieder eine gültige Datei (das erste enthält den Kopf).
 * Gelöscht wird nach erfolgreichem Hochladen, wenn die SL „Verwerfen“ bestätigt, beim Abmelden nach Rückfrage und beim
 * Start, wenn die Verbindung dazu nicht mehr existiert.
 */

export interface StoredRecording {
  id: string;
  /** Verbindung (Server), zu der die Runde gehört – Kennungen gelten nur dort */
  connId: string;
  sessionId: string;
  campaignId: string;
  title: string;
  mimeType: string;
  startedAt: string;
  elapsedMs: number;
  parts: number;
  bytes: number;
  state: 'recording' | 'stopped';
  /** Letztes Lebenszeichen der laufenden Aufnahme (ms seit 1970) */
  aliveAt: number;
}

export interface StoreBackend {
  putMeta(m: StoredRecording): Promise<void>;
  allMeta(): Promise<StoredRecording[]>;
  putPart(id: string, seq: number, blob: Blob): Promise<void>;
  parts(id: string): Promise<Blob[]>;
  remove(id: string): Promise<void>;
}

/** Ohne Lebenszeichen so lange gilt eine „laufende“ Aufnahme als abgebrochen */
export const STALE_MS = 45_000;

const DB = 'taleward-aufnahmen';
const META = 'aufnahmen';
const PARTS = 'stuecke';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function idbBackend(): StoreBackend | null {
  if (typeof indexedDB === 'undefined') return null;
  let db: Promise<IDBDatabase> | null = null;
  const open = () => {
    db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore(META, { keyPath: 'id' });
        r.result.createObjectStore(PARTS);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { db = null; reject(r.error); };
    });
    return db;
  };
  const range = (id: string) => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
  return {
    async putMeta(m) {
      const tx = (await open()).transaction(META, 'readwrite');
      tx.objectStore(META).put(m);
      await done(tx);
    },
    async allMeta() {
      return req((await open()).transaction(META).objectStore(META).getAll() as IDBRequest<StoredRecording[]>);
    },
    async putPart(id, seq, blob) {
      const tx = (await open()).transaction(PARTS, 'readwrite');
      tx.objectStore(PARTS).put(blob, [id, seq]);
      await done(tx);
    },
    async parts(id) {
      // Schlüssel [id, seq] sind nach seq sortiert
      return req((await open()).transaction(PARTS).objectStore(PARTS).getAll(range(id)) as IDBRequest<Blob[]>);
    },
    async remove(id) {
      const tx = (await open()).transaction([META, PARTS], 'readwrite');
      tx.objectStore(META).delete(id);
      tx.objectStore(PARTS).delete(range(id));
      await done(tx);
    }
  };
}

let backend: StoreBackend | null | undefined;
const store = () => (backend === undefined ? (backend = idbBackend()) : backend);

/** Nur für Tests: eigenen Speicher einsetzen (null = keiner vorhanden) */
export function setStoreBackend(b: StoreBackend | null): void {
  backend = b;
}

export function hasRecordingStore(): boolean {
  return !!store();
}

export async function saveMeta(m: StoredRecording): Promise<void> {
  const b = store();
  if (!b) throw new Error('kein Speicher');
  await b.putMeta(m);
}

export async function savePart(id: string, seq: number, blob: Blob): Promise<void> {
  const b = store();
  if (!b) throw new Error('kein Speicher');
  await b.putPart(id, seq, blob);
}

/** Die ganze Aufnahme als eine Datei (Stücke in Reihenfolge) */
export async function loadRecording(m: StoredRecording): Promise<Blob> {
  const b = store();
  return new Blob(b ? await b.parts(m.id) : [], { type: m.mimeType || 'audio/webm' });
}

export async function removeRecording(id: string): Promise<void> {
  await store()?.remove(id);
}

/**
 * Nicht hochgeladene Aufnahmen dieser Verbindung, neueste zuerst. Eine „laufende“ ohne Lebenszeichen ist abgebrochen
 * (Fenster zu, Absturz) und zählt mit; eine, die gerade in einem anderen Fenster läuft, nicht.
 */
export async function leftoverRecordings(connId: string, now = Date.now()): Promise<StoredRecording[]> {
  const b = store();
  if (!b) return [];
  const all = await b.allMeta().catch(() => [] as StoredRecording[]);
  const ended = all.filter((m) => m.connId === connId && (m.state === 'stopped' || now - m.aliveAt > STALE_MS));
  // Abgebrochen, bevor das erste Stück da war: enthält keinen Ton, nur aufräumen
  for (const m of ended) if (m.parts === 0) await b.remove(m.id).catch(() => undefined);
  return ended.filter((m) => m.parts > 0).sort((a, c) => c.startedAt.localeCompare(a.startedAt));
}

/** Alle Aufnahmen dieser Verbindung, die noch Ton enthalten (auch eine, die gerade in einem anderen Fenster läuft) */
export async function recordingsOf(connId: string): Promise<StoredRecording[]> {
  const b = store();
  if (!b) return [];
  const all = await b.allMeta().catch(() => [] as StoredRecording[]);
  return all.filter((m) => m.connId === connId && m.parts > 0);
}

/** Beim Abmelden bzw. Entfernen einer Verbindung, nach Rückfrage: ihre Aufnahmen aus dem Gerät löschen */
export async function removeRecordingsOf(connId: string): Promise<void> {
  const b = store();
  if (!b) return;
  for (const m of await b.allMeta().catch(() => [] as StoredRecording[])) if (m.connId === connId) await b.remove(m.id);
}

/**
 * Beim Start: Aufnahmen zu Verbindungen, die es nicht mehr gibt, kann niemand mehr hochladen – sie werden gelöscht,
 * damit kein Ton unbemerkt im Browser liegen bleibt (gemeinsam genutzter PC). Eine laufende bleibt unberührt.
 */
export async function removeOrphanRecordings(knownConnIds: readonly string[], now = Date.now()): Promise<number> {
  const b = store();
  if (!b) return 0;
  const all = await b.allMeta().catch(() => [] as StoredRecording[]);
  const orphans = all.filter((m) => !knownConnIds.includes(m.connId) && (m.state === 'stopped' || now - m.aliveAt > STALE_MS));
  for (const m of orphans) await b.remove(m.id).catch(() => undefined);
  return orphans.length;
}
