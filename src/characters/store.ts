/*
 * Sammlung „Meine Charaktere“ (ab Schnittstelle 0.4.7): Charaktere gehören der Spielerin und liegen in der App,
 * nicht auf einem Server. Server bekommen nur eine Kopie der Stammdaten (PUT …/members/me/character) und die
 * mitgebrachte Welt als Vorschläge für die SL. Gespeichert im Speicher des Geräts (localStorage); private Notizen
 * und Chronik-Abschriften verlassen das Gerät nie.
 */
import { t } from '../i18n';
import type { Character, CharacterStatus, Chronicle, WorldEntryIn, WorldEntryStatus } from '../api/types';
import { activeConnections, type Connection } from '../api/connections';

/** Mitgebrachter Welt-Eintrag in der Sammlung */
export type WorldItem = WorldEntryIn;

/** Verknüpfung mit einer Kampagne auf einem Server */
export interface CharacterLink {
  connId: string;
  serverName: string;
  campaignId: string;
  campaignTitle: string;
  memberId: string;
  linkedAt: string;
  /** Version der Stammdaten, die der Server zuletzt angenommen hat */
  syncedVersion: number;
  /** Letzter bekannter Stand der mitgebrachten Einträge auf diesem Server (aus myWorld) */
  world?: WorldEntryStatus[];
  /** Je Welt-Eintrag: zuletzt eingereichte Version */
  submitted?: Record<string, number>;
  /** Stand des Bildes, der zuletzt hochgeladen wurde (portraitChangedAt) */
  portraitSynced?: string | null;
}

export interface StoredCharacter extends Character {
  /** Private Notizen – gehen nie auf einen Server */
  notes: string;
  /** Charakterbild als Data-URL (lange Kante ≤ 800 px), ganzes Bild */
  portrait: string | null;
  /** Größe des Bildes und quadratischer Ausschnitt für den Kreis (in Pixeln des Bildes) */
  portraitMeta?: PortraitMeta | null;
  /** Wann das Bild zuletzt geändert wurde */
  portraitChangedAt?: string | null;
  world: WorldItem[];
  links: CharacterLink[];
  /** Abschriften je Kampagne (Schlüssel connId:campaignId) */
  chronicles: Record<string, Chronicle>;
  createdAt: string;
  updatedAt: string;
  /**
   * Konten, denen der Charakter gehört (`<baseUrl>|<userId>`). Die Sammlung liegt im Gerät; meldet sich auf demselben
   * Gerät ein anderes Konto an (geteiltes Tablet, Testkonten), sieht es fremde Charaktere nicht. Fehlt das Feld
   * (angelegt vor 0.12), ordnet claimLegacyCharacters() den Charakter zu; bis dahin ist er unsichtbar.
   */
  owners?: string[];
}

/** Schlüssel eines Kontos auf einem Server */
export function accountKey(c: Pick<Connection, 'baseUrl' | 'user'>): string | null {
  return c.user?.id ? `${c.baseUrl}|${c.user.id}` : null;
}

/** Konten, die gerade in der App angemeldet sind */
export function myAccountKeys(): string[] {
  return activeConnections().map(accountKey).filter((k): k is string => !!k);
}

function visible(c: StoredCharacter, mine: string[]): boolean {
  return !!c.owners && c.owners.some((o) => mine.includes(o));
}

/** Alle Charaktere im Gerät, auch fremde – nur für die Zuordnung alter Charaktere */
export function allStoredCharacters(): StoredCharacter[] {
  return load();
}

export interface PortraitMeta {
  w: number;
  h: number;
  crop: { x: number; y: number; size: number };
}

const KEY = 'taleward.characters';
const listeners = new Set<() => void>();

function load(): StoredCharacter[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(list: StoredCharacter[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error(t('Der Speicher der App ist voll. Entferne große Charakterbilder oder alte Chroniken.'));
  }
  listeners.forEach((l) => l());
}

export function onCharactersChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Charaktere der angemeldeten Konten */
export function listCharacters(): StoredCharacter[] {
  const mine = myAccountKeys();
  return load().filter((c) => visible(c, mine)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getCharacter(id: string): StoredCharacter | undefined {
  const mine = myAccountKeys();
  return load().find((c) => c.id === id && visible(c, mine));
}

/** Konten als Besitzer eintragen */
export function addOwners(id: string, keys: string[]): void {
  const list = load();
  const i = list.findIndex((c) => c.id === id);
  if (i < 0 || keys.length === 0) return;
  const owners = [...new Set([...(list[i].owners ?? []), ...keys])];
  if (owners.length === (list[i].owners ?? []).length && list[i].owners) return;
  list[i] = { ...list[i], owners };
  persist(list);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function createCharacter(data: { id?: string; version?: number; name: string; nickname?: string | null; summary?: string | null; backstory?: string | null; system?: string | null; pronouns?: string | null; level?: string | null; portrait?: string | null; portraitMeta?: PortraitMeta | null }): StoredCharacter {
  const now = new Date().toISOString();
  const c: StoredCharacter = {
    id: data.id ?? newId(), version: data.version ?? 1, name: data.name.trim(), nickname: data.nickname ?? null, summary: data.summary ?? null,
    backstory: data.backstory ?? null, system: data.system ?? null, pronouns: data.pronouns ?? null, level: data.level ?? null, status: 'active', statusChangedAt: null,
    owners: myAccountKeys(), notes: '', portrait: data.portrait ?? null, portraitMeta: data.portraitMeta ?? null, portraitChangedAt: data.portrait ? now : null, world: [], links: [], chronicles: {}, createdAt: now, updatedAt: now
  };
  persist([...load(), c]);
  return c;
}

/** Stammdaten, die auf Server gehen – ändern sie sich, steigt die Version */
const SHARED: (keyof Character)[] = ['name', 'nickname', 'summary', 'backstory', 'system', 'pronouns', 'level', 'status'];

export function updateCharacter(id: string, change: Partial<Omit<StoredCharacter, 'id' | 'version' | 'createdAt'>>): StoredCharacter {
  const list = load();
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(t('Charakter nicht gefunden.'));
  const old = list[i];
  const next: StoredCharacter = { ...old, ...change, updatedAt: new Date().toISOString() };
  if (SHARED.some((k) => k in change && ((change as Record<string, unknown>)[k] ?? null) !== (old[k] ?? null))) next.version = old.version + 1;
  if (change.status && change.status !== old.status) next.statusChangedAt = new Date().toISOString();
  if ('portrait' in change && change.portrait !== old.portrait) next.portraitChangedAt = new Date().toISOString();
  list[i] = next;
  persist(list);
  return next;
}

/** Version gezielt setzen (wenn ein Server schon einen neueren Stand kennt) */
export function setVersion(id: string, version: number): StoredCharacter {
  const list = load();
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(t('Charakter nicht gefunden.'));
  list[i] = { ...list[i], version };
  persist(list);
  return list[i];
}

export function deleteCharacter(id: string): void {
  persist(load().filter((c) => c.id !== id));
}

/** Welt-Eintrag anlegen oder ändern; geänderte Einträge bekommen eine höhere Version */
export function saveWorldItem(characterId: string, item: Omit<WorldItem, 'id' | 'version'> & { id?: string }): StoredCharacter {
  const c = getCharacter(characterId);
  if (!c) throw new Error(t('Charakter nicht gefunden.'));
  const old = item.id ? c.world.find((w) => w.id === item.id) : undefined;
  const changed = !old || old.name !== item.name || old.summary !== item.summary || old.type !== item.type || old.secret !== item.secret
    || (old.relation ?? '') !== (item.relation ?? '');
  const next: WorldItem = { ...item, id: old?.id ?? newId(), version: old ? old.version + (changed ? 1 : 0) : 1 } as WorldItem;
  const world = old ? c.world.map((w) => (w.id === old.id ? next : w)) : [...c.world, next];
  return updateCharacter(characterId, { world });
}

export function removeWorldItem(characterId: string, itemId: string): StoredCharacter {
  const c = getCharacter(characterId)!;
  return updateCharacter(characterId, { world: c.world.filter((w) => w.id !== itemId) });
}

export function linkKey(connId: string, campaignId: string): string {
  return `${connId}:${campaignId}`;
}

export function saveLink(characterId: string, link: CharacterLink): StoredCharacter {
  const c = getCharacter(characterId)!;
  const others = c.links.filter((l) => !(l.connId === link.connId && l.campaignId === link.campaignId));
  return updateCharacter(characterId, { links: [...others, link] });
}

export function removeLink(characterId: string, connId: string, campaignId: string): StoredCharacter {
  const c = getCharacter(characterId)!;
  return updateCharacter(characterId, { links: c.links.filter((l) => !(l.connId === connId && l.campaignId === campaignId)) });
}

export function saveChronicle(characterId: string, connId: string, chronicle: Chronicle): StoredCharacter {
  const c = getCharacter(characterId)!;
  return updateCharacter(characterId, { chronicles: { ...c.chronicles, [linkKey(connId, chronicle.campaign.id)]: chronicle } });
}

/** Charakter, der in dieser Kampagne verknüpft ist */
export function characterForCampaign(connId: string, campaignId: string): StoredCharacter | undefined {
  return listCharacters().find((c) => c.links.some((l) => l.connId === connId && l.campaignId === campaignId));
}

/** Stammdaten für den Server (ohne Notizen, Bild, Welt, Abschriften) */
export function toServerCharacter(c: StoredCharacter): Character {
  return {
    id: c.id, version: c.version, name: c.name, nickname: c.nickname || null, summary: c.summary || null,
    backstory: c.backstory || null, system: c.system || null, status: c.status, statusChangedAt: c.statusChangedAt ?? null,
    // Ab 0.4.28; ältere Server lassen das Feld liegen
    ...(c.pronouns ? { pronouns: c.pronouns } : {}),
    // Ab 0.4.29
    ...(c.level ? { level: c.level } : {})
  };
}

export const STATUS_ORDER: CharacterStatus[] = ['active', 'retired', 'deceased'];

/** Bild verkleinern und als Data-URL speichern (lange Kante ≤ 800 px, JPEG); Ausschnitt wird mitskaliert */
export async function blobToPortrait(blob: Blob, crop: PortraitMeta['crop']): Promise<{ portrait: string; portraitMeta: PortraitMeta }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(t('Das Bild ließ sich nicht lesen.')));
      i.src = url;
    });
    const w0 = img.naturalWidth || 800;
    const h0 = img.naturalHeight || 800;
    const scale = Math.min(1, 800 / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      portrait: canvas.toDataURL('image/jpeg', 0.85),
      portraitMeta: {
        w: canvas.width, h: canvas.height,
        crop: { x: Math.round(crop.x * scale), y: Math.round(crop.y * scale), size: Math.max(1, Math.round(crop.size * scale)) }
      }
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function portraitToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Fertige Charaktere übernehmen (Musterkampagne); gleiche ID ersetzt den alten Stand */
export function putCharacters(list: StoredCharacter[]): void {
  const ids = new Set(list.map((c) => c.id));
  persist([...load().filter((c) => !ids.has(c.id)), ...list]);
}

/**
 * Ein Konto vergessen (Musterkampagne beenden): Charaktere, die nur diesem Konto gehören, verschwinden; bei allen
 * anderen fallen die Verknüpfungen mit diesem Server weg.
 */
export function forgetAccount(owner: string, connId: string): void {
  persist(load()
    .filter((c) => !(c.owners?.length && c.owners.every((o) => o === owner)))
    .map((c) => ({ ...c, owners: c.owners?.filter((o) => o !== owner), links: c.links.filter((l) => l.connId !== connId) })));
}
