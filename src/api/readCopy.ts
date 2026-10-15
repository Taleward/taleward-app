/**
 * Lesekopie auf dem Gerät (IndexedDB): die zuletzt gesehenen Antworten der Lesewege aus readCopyRules, je Server
 * und Konto. Ist der Server nicht erreichbar, liefert der Client diese Kopie und merkt sich, seit wann – die
 * Oberfläche zeigt dann „Stand vom …“ und dass Ändern erst wieder mit dem Server geht.
 * Gelöscht wird beim Abmelden, beim Entfernen des Servers, bei abgelaufener Anmeldung (401), für eine ganze Kampagne,
 * sobald sie nicht mehr sichtbar ist, nach MAX_AGE_DAYS und beim Start, wenn Server oder Konto nicht mehr passen.
 */
import { sessionOfPath } from './readCopyRules';

const DB = 'taleward-lesekopie';
const STORE = 'antworten';
/** Älter als das wird nicht mehr gezeigt und beim Start gelöscht */
export const MAX_AGE_DAYS = 90;

interface Row { key: string; connId: string; userId: string; campaignId: string | null; savedAt: string; data: unknown }

const tooOld = (savedAt: string, now = Date.now()) => !(Date.parse(savedAt) > now - MAX_AGE_DAYS * 864e5);

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null;
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      // Fassung 2 kennt die Kampagne je Zeile; ältere Kopien ohne diese Angabe fallen weg
      if (r.result.objectStoreNames.contains(STORE)) r.result.deleteObjectStore(STORE);
      const store = r.result.createObjectStore(STORE, { keyPath: 'key' });
      store.createIndex('connId', 'connId');
      store.createIndex('campaign', ['connId', 'campaignId']);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbp = null; reject(r.error); };
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

const keyOf = (connId: string, userId: string, path: string) => `${connId}|${userId}|${path}`;

export async function saveCopy(connId: string, userId: string, path: string, data: unknown, campaignId: string | null = null,
  stillAllowed: () => boolean = () => true): Promise<void> {
  const db = await open();
  if (!db) return;
  const key = keyOf(connId, userId, path);
  // null = darf nicht (mehr) in die Kopie, z. B. Kapitel zurückgezogen
  if (data === null) {
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key));
    return;
  }
  // Kapitel und Kommentare kennen ihre Kampagne nur über den Kapitel-Kopf
  let campaign = campaignId;
  const session = campaign ? null : sessionOfPath(path);
  if (session) {
    const head = await req(db.transaction(STORE).objectStore(STORE).get(keyOf(connId, userId, `/sessions/${session}`))) as Row | undefined;
    campaign = head?.campaignId ?? null;
  }
  // Ohne bekannte Kampagne nichts ablegen (sonst fiele es beim Aufräumen einer Kampagne nicht mit weg); die Chronik
  // holt den Kapitel-Kopf zuerst, danach kommt der Rest beim nächsten Nachladen
  if (!campaign && path !== '/campaigns') return;
  if (!stillAllowed()) return;
  const row: Row = { key, connId, userId, campaignId: campaign, savedAt: new Date().toISOString(), data };
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  await req(store.put(row));
}

export async function readCopy(connId: string, userId: string, path: string): Promise<{ savedAt: string; data: unknown } | null> {
  const db = await open();
  if (!db) return null;
  const row = await req(db.transaction(STORE).objectStore(STORE).get(keyOf(connId, userId, path))) as Row | undefined;
  if (!row) return null;
  if (tooOld(row.savedAt)) {
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(row.key));
    return null;
  }
  return { savedAt: row.savedAt, data: row.data };
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

/** Alles zu einer Kampagne verwerfen (nicht mehr sichtbar, verlassen, entfernt, gelöscht) */
export async function removeCopiesOfCampaign(connId: string, campaignId: string): Promise<void> {
  const db = await open();
  if (!db) return;
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  const keys = await req(store.index('campaign').getAllKeys([connId, campaignId]));
  await Promise.all(keys.map((k) => req(store.delete(k))));
}

/** Nach einer frischen Kampagnenliste: Kopien von Kampagnen verwerfen, die nicht mehr darin stehen */
export async function keepOnlyCampaigns(connId: string, campaignIds: string[]): Promise<void> {
  const db = await open();
  if (!db) return;
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  const keep = new Set(campaignIds);
  const rows = await req(store.index('connId').getAll(connId)) as Row[];
  await Promise.all(rows.filter((r) => r.campaignId && !keep.has(r.campaignId)).map((r) => req(store.delete(r.key))));
}

/** Beim Start: Kopien von Servern, die es nicht mehr gibt, eines anderen Kontos oder zu alte verwerfen */
export async function removeOrphanCopies(current: { id: string; userId: string | null }[]): Promise<void> {
  const db = await open();
  if (!db) return;
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  const rows = await req(store.getAll()) as Row[];
  const ok = new Set(current.filter((c) => c.userId).map((c) => `${c.id}|${c.userId}`));
  const now = Date.now();
  const orphan = (r: Row) => !r.campaignId && !r.key.endsWith('|/campaigns');
  await Promise.all(rows.filter((r) => !ok.has(`${r.connId}|${r.userId}`) || tooOld(r.savedAt, now) || orphan(r))
    .map((r) => req(store.delete(r.key))));
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
