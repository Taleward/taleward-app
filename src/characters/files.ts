/*
 * Unterlagen in der Sammlung: Dateien, die an einem Charakter hängen (Charakterbogen, Notizen, Karten …). Sie liegen
 * nur im Gerät (IndexedDB), ohne Begrenzung durch die App, und gehen nie von selbst an einen Server. Grenzen gelten
 * erst, wenn jemand einen Bogen in einer Kampagne abgibt (characterSheetLimits des Servers).
 */

export interface CharacterFileMeta {
  id: string;
  characterId: string;
  name: string;
  /** MIME-Typ, wie ihn das Gerät meldet (kann leer sein) */
  type: string;
  size: number;
  addedAt: string;
  /** Zuletzt gelesene Seite (PDF, ab 1) */
  lastPage?: number;
}

export interface StoredCharacterFile extends CharacterFileMeta {
  blob: Blob;
}

/** So reisen Unterlagen in einer Charakter-Datei oder Sicherung mit (Inhalt als Base64) */
export interface ExportedCharacterFile extends CharacterFileMeta {
  data: string;
}

const DB = 'taleward-unterlagen';
const STORE = 'dateien';
const CHANGED = 'taleward-unterlagen-changed';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB fehlt'));
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('characterId', 'characterId');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => { dbPromise = null; reject(open.error); };
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  const t = d.transaction(STORE, mode);
  const result = await req(run(t.objectStore(STORE)));
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return result;
}

const changed = () => window.dispatchEvent(new Event(CHANGED));

export function onFilesChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

const meta = ({ blob: _blob, ...m }: StoredCharacterFile): CharacterFileMeta => m;

/** Unterlagen eines Charakters, neueste zuerst (ohne Inhalt) */
export async function listFiles(characterId: string): Promise<CharacterFileMeta[]> {
  const all = await tx('readonly', (s) => s.index('characterId').getAll(characterId) as IDBRequest<StoredCharacterFile[]>);
  return all.map(meta).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function getFile(id: string): Promise<StoredCharacterFile | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<StoredCharacterFile | undefined>);
}

const newId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, '');

export async function addFile(characterId: string, file: File): Promise<CharacterFileMeta> {
  const rec: StoredCharacterFile = {
    id: newId(), characterId, name: file.name || 'Datei', type: file.type || '', size: file.size,
    addedAt: new Date().toISOString(), blob: file
  };
  await tx('readwrite', (s) => s.put(rec));
  changed();
  return meta(rec);
}

export async function removeFile(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  changed();
}

export async function removeFilesOf(characterId: string): Promise<void> {
  const list = await listFiles(characterId).catch(() => []);
  for (const f of list) await tx('readwrite', (s) => s.delete(f.id));
  if (list.length) changed();
}

export async function setLastPage(id: string, page: number): Promise<void> {
  const rec = await getFile(id);
  if (!rec || rec.lastPage === page) return;
  await tx('readwrite', (s) => s.put({ ...rec, lastPage: page }));
}

/** Was die App selbst anzeigt; alles andere öffnet ein Programm des Geräts */
export type FileKind = 'pdf' | 'image' | 'text' | 'other';

export function fileKind(f: Pick<CharacterFileMeta, 'name' | 'type'>): FileKind {
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  if (f.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(f.type) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(ext)) return 'image';
  if (f.type === 'text/plain' || f.type === 'text/markdown' || ['txt', 'md'].includes(ext)) return 'text';
  return 'other';
}

/** Dateiarten, die der Server als Charakterbogen annimmt (wie ACCEPT in CharacterAnalysis) */
export function serverAccepts(f: Pick<CharacterFileMeta, 'name' | 'type'>): boolean {
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  return ['pdf', 'docx', 'txt', 'md'].includes(ext);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(data: string, type: string): Blob {
  const bin = atob(data);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type });
}

export async function exportFiles(characterId: string): Promise<ExportedCharacterFile[]> {
  const out: ExportedCharacterFile[] = [];
  for (const m of await listFiles(characterId)) {
    const rec = await getFile(m.id);
    if (rec) out.push({ ...meta(rec), data: await toBase64(rec.blob) });
  }
  return out;
}

/** Ohne Steuer- und Richtungszeichen (die einen Dateinamen in der Anzeige umdrehen könnten) */
function plainName(name: string): string {
  return [...name].filter((ch) => {
    const c = ch.codePointAt(0)!;
    return c >= 0x20 && c !== 0x7f && !(c >= 0x202a && c <= 0x202e) && !(c >= 0x2066 && c <= 0x2069);
  }).join('');
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Unterlagen aus einer Datei übernehmen. Alles wird geprüft wie fremde Daten: nur bekannte Felder, Name und Typ als
 * Text, Inhalt nur gültiges Base64. Vorhandene Dateien mit gleicher Kennung bleiben (kein Überschreiben).
 */
export async function importFiles(characterId: string, incoming: unknown): Promise<number> {
  if (!Array.isArray(incoming)) return 0;
  let n = 0;
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id, 64).replace(/[^A-Za-z0-9-]/g, '') || newId();
    const data = typeof r.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(r.data) ? r.data : null;
    if (!data) continue;
    if (await getFile(id)) continue;
    const type = /^[\w.+-]+\/[\w.+-]+$/.test(str(r.type, 120)) ? str(r.type, 120) : '';
    let blob: Blob;
    try { blob = fromBase64(data, type); } catch { continue; }
    const added = str(r.addedAt, 40);
    const rec: StoredCharacterFile = {
      id, characterId, name: plainName(str(r.name, 200)) || 'Datei', type, size: blob.size,
      addedAt: !Number.isNaN(Date.parse(added)) ? new Date(added).toISOString() : new Date().toISOString(),
      lastPage: typeof r.lastPage === 'number' && r.lastPage >= 1 ? Math.floor(r.lastPage) : undefined, blob
    };
    await tx('readwrite', (s) => s.put(rec));
    n++;
  }
  if (n) changed();
  return n;
}
