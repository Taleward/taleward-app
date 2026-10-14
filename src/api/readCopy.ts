/**
 * Lesekopie auf dem Gerät (IndexedDB): die zuletzt gesehenen Antworten der Lesewege aus readCopyRules, je Server
 * und Konto. Ist der Server nicht erreichbar, liefert der Client diese Kopie und merkt sich, seit wann – die
 * Oberfläche zeigt dann „Stand vom …“ und dass Ändern erst wieder mit dem Server geht.
 * Gelöscht wird beim Abmelden, beim Entfernen des Servers, bei abgelaufener Anmeldung (401) und beim Start, wenn
 * Server oder Konto nicht mehr passen.
 */

const DB = 'taleward-lesekopie';
const STORE = 'antworten';

interface Row { key: string; connId: string; userId: string; savedAt: string; data: unknown }

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null;
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex('connId', 'connId'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbp = null; reject(r.error); };
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

const keyOf = (connId: string, userId: string, path: string) => `${connId}|${userId}|${path}`;

export async function saveCopy(connId: string, userId: string, path: string, data: unknown): Promise<void> {
  const db = await open();
  if (!db) return;
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  const key = keyOf(connId, userId, path);
  // null = darf nicht (mehr) in die Kopie, z. B. Kapitel zurückgezogen
  if (data === null) await req(store.delete(key));
  else await req(store.put({ key, connId, userId, savedAt: new Date().toISOString(), data } satisfies Row));
}

export async function readCopy(connId: string, userId: string, path: string): Promise<{ savedAt: string; data: unknown } | null> {
  const db = await open();
  if (!db) return null;
  const row = await req(db.transaction(STORE).objectStore(STORE).get(keyOf(connId, userId, path))) as Row | undefined;
  return row ? { savedAt: row.savedAt, data: row.data } : null;
}

export async function hasCopy(connId: string, userId: string, path: string): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return (await req(db.transaction(STORE).objectStore(STORE).count(keyOf(connId, userId, path)))) > 0;
}

export async function removeCopiesOf(connId: string): Promise<void> {
  const db = await open();
  if (!db) return;
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  const keys = await req(store.index('connId').getAllKeys(connId));
  await Promise.all(keys.map((k) => req(store.delete(k))));
}

/** Beim Start: Kopien von Servern, die es nicht mehr gibt, oder eines anderen Kontos verwerfen */
export async function removeOrphanCopies(current: { id: string; userId: string | null }[]): Promise<void> {
  const db = await open();
  if (!db) return;
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  const rows = await req(store.getAll()) as Row[];
  const ok = new Set(current.filter((c) => c.userId).map((c) => `${c.id}|${c.userId}`));
  await Promise.all(rows.filter((r) => !ok.has(`${r.connId}|${r.userId}`)).map((r) => req(store.delete(r.key))));
}

// ---- Wer gerade aus der Kopie liest (je Server): für den Hinweis in der Oberfläche
const offline = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function markOffline(connId: string, savedAt: string): void {
  const old = offline.get(connId);
  // Ältester gezeigter Stand zählt, damit „Stand vom …“ nicht schöner aussieht, als er ist
  if (old && old <= savedAt) return;
  offline.set(connId, savedAt);
  emit();
}

export function markOnline(connId: string): void {
  if (offline.delete(connId)) emit();
}

export function offlineSince(connId: string | null | undefined): string | null {
  return connId ? offline.get(connId) ?? null : null;
}

export function onOfflineChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
