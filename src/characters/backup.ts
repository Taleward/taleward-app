/*
 * Sammlung sichern und zurückholen. Die Sammlung liegt nur im Gerät; geht das Handy verloren oder wird die App
 * gelöscht, wäre sie weg. Eine Sicherung ist eine Datei taleward-charaktere/1 (JSON) mit allen eigenen Charakteren,
 * auch Bildern, mitgebrachter Welt, Abschriften und privaten Notizen. Sie bleibt beim Menschen, nie auf einem Server.
 */
import { APP_VERSION, listConnections } from '../api/connections';
import { t } from '../i18n';
import { mergeCharacter } from './merge';
import { sanitizeCharacter } from './sanitize';
import { allStoredCharacters, listCharacters, myAccountKeys, putCharacters, type StoredCharacter } from './store';
import { exportFiles, importFiles, type ExportedCharacterFile } from './files';

export const BACKUP_FORMAT = 'taleward-charaktere/1';
/** Ein einzelner Charakter als Datei (zum Weitergeben an ein anderes Gerät) */
export const CHARACTER_FORMAT = 'taleward-charakter/1';

interface CharacterFileData {
  format: typeof CHARACTER_FORMAT;
  exportedAt: string;
  appVersion: string;
  character: StoredCharacter;
  /** Unterlagen (ab App 0.34) – ältere Apps lassen das Feld liegen */
  files?: ExportedCharacterFile[];
}

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  appVersion: string;
  characters: StoredCharacter[];
  /** Unterlagen je Charakter (ab App 0.34) */
  files?: Record<string, ExportedCharacterFile[]>;
}

/** Datei mit der ganzen eigenen Sammlung, mit allen Unterlagen */
export async function backupFile(now = new Date()): Promise<File> {
  const characters = listCharacters();
  const files: Record<string, ExportedCharacterFile[]> = {};
  for (const c of characters) {
    const list = await exportFiles(c.id).catch(() => []);
    if (list.length) files[c.id] = list;
  }
  const data: BackupFile = { format: BACKUP_FORMAT, exportedAt: now.toISOString(), appVersion: APP_VERSION, characters, ...(Object.keys(files).length ? { files } : {}) };
  return new File([JSON.stringify(data)], `taleward-charaktere-${now.toISOString().slice(0, 10)}.json`, { type: 'application/json' });
}

/** Datei mit einem Charakter: Stammdaten, Bild, mitgebrachte Welt, Abschriften, private Notizen und auf Wunsch Unterlagen */
export async function characterFile(c: StoredCharacter, { withFiles = false, now = new Date() }: { withFiles?: boolean; now?: Date } = {}): Promise<File> {
  const { owners: _owners, ...character } = c;
  const files = withFiles ? await exportFiles(c.id) : [];
  const data: CharacterFileData = { format: CHARACTER_FORMAT, exportedAt: now.toISOString(), appVersion: APP_VERSION, character: character as StoredCharacter, ...(files.length ? { files } : {}) };
  const slug = c.name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'charakter';
  return new File([JSON.stringify(data)], `taleward-charakter-${slug}.json`, { type: 'application/json' });
}

/** Auf dem Handy über „Teilen“ (Speichern, Mail …), im Browser als Download */
export async function saveOrShare(file: File, title: string): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}


export interface RestoreResult { added: number; updated: number; unchanged: number }

/**
 * Sicherung oder Charakter-Datei zurückholen. Neue Charaktere kommen dazu; bei vorhandenen gewinnt der neuere Stand,
 * Abschriften und mitgebrachte Welt werden zusammengeführt (siehe merge.ts). Verknüpfungen mit Servern, die dieses
 * Gerät nicht kennt, fallen weg (dort muss man sich erst anmelden).
 */
export async function restoreBackup(text: string): Promise<RestoreResult> {
  const wrong = () => new Error(t('Das ist weder eine Charakter-Datei noch eine Sicherung der Sammlung.'));
  let data: { format?: string; characters?: unknown[]; character?: unknown; files?: unknown } | null;
  try {
    data = JSON.parse(text);
  } catch {
    throw wrong();
  }
  let incoming: unknown[];
  if (data?.format === BACKUP_FORMAT && Array.isArray(data.characters)) incoming = data.characters;
  else if (data?.format === CHARACTER_FORMAT && data.character) incoming = [data.character];
  else throw wrong();
  const known = new Set(listConnections().map((c) => c.id));
  const mine = myAccountKeys();
  // Ohne Anmeldung gehörte der Charakter niemandem und bliebe unsichtbar
  if (!mine.length) throw new Error(t('Melde dich erst bei einem Server an, dann kannst du die Sammlung zurückholen.'));
  const all = new Map(allStoredCharacters().map((c) => [c.id, c]));
  const result: RestoreResult = { added: 0, updated: 0, unchanged: 0 };
  const take: StoredCharacter[] = [];
  for (const c of incoming.map(sanitizeCharacter).filter((x): x is StoredCharacter => !!x)) {
    const old = all.get(c.id);
    const { result: merged, outcome } = mergeCharacter(old, c, known);
    result[outcome]++;
    if (outcome === 'unchanged') continue;
    take.push({ ...merged, owners: [...new Set([...(old?.owners ?? []), ...mine])] });
  }
  if (take.length) putCharacters(take);
  // Unterlagen nur zu Charakteren, die jetzt (auch) diesem Konto gehören
  const ids = new Set(incoming.map(sanitizeCharacter).filter((x): x is StoredCharacter => !!x).map((c) => c.id));
  if (data.format === CHARACTER_FORMAT) {
    const id = [...ids][0];
    if (id) await importFiles(id, data.files).catch(() => 0);
  } else if (data.files && typeof data.files === 'object') {
    for (const [id, list] of Object.entries(data.files as Record<string, unknown>)) {
      if (ids.has(id)) await importFiles(id, list).catch(() => 0);
    }
  }
  return result;
}
