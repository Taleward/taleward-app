import { removeCopiesOf } from './readCopy';
import type { User } from './types';

/**
 * Verbindungen zu Servern. Die App kann mit mehreren Servern gleichzeitig arbeiten
 * (eigener Verein, Nachbarverein, gehostete Fassung). Pro Server gibt es ein eigenes Konto
 * und ein eigenes Anmelde-Token – ein Token wird nie an einen anderen Server geschickt.
 */
export interface Connection {
  /** Kurze, stabile ID für Adressen in der App (/v/<id>/…) */
  id: string;
  /** z. B. https://chronik.verein-x.de/api/v1 */
  baseUrl: string;
  /** Anzeigename des Servers aus /info */
  name: string;
  operator: string | null;
  apiVersion: string | null;
  token: string | null;
  expiresAt: string | null;
  user: User | null;
  /** App-Versionen laut Server (ab 0.3.9); zuletzt beim Laden der Kampagnenliste abgefragt */
  appInfo?: {
    minAppVersion: string | null;
    latestAppVersion: string | null;
    appDownloadUrl: string | null;
    releaseNotes: string | null;
    appDownloadSha256?: string | null;
    appDownloadSizeBytes?: number | null;
  } | null;
  /** Server hat 426 app_outdated gemeldet */
  appOutdated?: boolean;
  /** Feste Kennung des Servers aus /info (ab 0.4.16) – erkennt ihn unter neuer Adresse wieder */
  serverId?: string | null;
}

/** Ist diese App für den Server zu alt? */
export function appTooOld(c: Connection): boolean {
  return !!c.appOutdated || (!!c.appInfo?.minAppVersion && versionLess(APP_VERSION, c.appInfo.minAppVersion));
}

/** Server kennt die App-Version (ab Schnittstelle 0.3.9) – erst dann schickt die App ihre Version mit */
export function serverKnowsAppVersion(c: Connection): boolean {
  return !!c.apiVersion && !versionLess(c.apiVersion, '0.3.9');
}

const KEY = 'session-chronik.connections';

/** Konnte die Liste der Verbindungen gelesen werden? Sonst darf beim Start nichts aufgeräumt werden. */
let readable = true;

function load(): Connection[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Connection[];
    if (Array.isArray(list)) return list;
    readable = false;
    return [];
  } catch {
    readable = false;
    return [];
  }
}

/** true, wenn die gespeicherten Verbindungen beim Start sicher gelesen wurden (leer zählt als gelesen) */
export function connectionsReadable(): boolean {
  return readable;
}

/** Übernahme aus der Zeit mit nur einem Server: altes Token wird zur ersten Verbindung */
function migrate(list: Connection[]): Connection[] {
  if (list.length) return list;
  try {
    const token = localStorage.getItem('session-chronik.token');
    if (!token) return list;
    const baseUrl: string = import.meta.env.VITE_API_BASE ?? '/api/v1';
    const conn: Connection = {
      id: 'server', baseUrl, name: 'Server', operator: null, apiVersion: null, token,
      expiresAt: localStorage.getItem('session-chronik.tokenExpiresAt'), user: null
    };
    localStorage.removeItem('session-chronik.token');
    localStorage.removeItem('session-chronik.tokenExpiresAt');
    localStorage.setItem(KEY, JSON.stringify([conn]));
    return [conn];
  } catch {
    return list;
  }
}

let connections: Connection[] = migrate(load());
let currentId: string | null = null;

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(connections));
  } catch {
    /* Speicher nicht verfügbar */
  }
  window.dispatchEvent(new Event('session-chronik:connections'));
}

export function listConnections(): Connection[] {
  return connections;
}

/** Nur Verbindungen mit gültiger Anmeldung */
export function activeConnections(): Connection[] {
  return connections.filter((c) => hasValidToken(c));
}

export function hasValidToken(c: Connection): boolean {
  return !!c.token && (!c.expiresAt || Date.parse(c.expiresAt) > Date.now());
}

export function getConnection(id: string): Connection | undefined {
  return connections.find((c) => c.id === id);
}

export function setCurrentConnection(id: string | null): void {
  currentId = id;
}

export function currentConnection(): Connection {
  const c = (currentId && getConnection(currentId)) || activeConnections()[0];
  if (!c) throw new Error('Keine Serververbindung');
  return c;
}

export function currentConnectionId(): string | null {
  return currentId;
}

/** Pfad innerhalb der aktuellen Verbindung: p('/k/abc') → '/v/<id>/k/abc' */
export function p(path: string): string {
  return `/v/${currentId ?? currentConnection().id}${path}`;
}

export { normalizeBaseUrl, parseInvite, sameServerHost } from './addresses';


function newId(baseUrl: string): string {
  const base = baseUrl.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'server';
  let id = base.slice(0, 24).replace(/^-|-$/g, '') || 'server';
  let n = 2;
  while (connections.some((c) => c.id === id)) id = `${base.slice(0, 20)}-${n++}`;
  return id;
}

/** Verbindung anlegen oder – bei gleicher Adresse – aktualisieren */
export function saveConnection(data: Omit<Connection, 'id'> & { id?: string }): Connection {
  const existing = connections.find((c) => c.baseUrl === data.baseUrl);
  const conn: Connection = { ...existing, ...data, id: existing?.id ?? data.id ?? newId(data.baseUrl) } as Connection;
  connections = existing ? connections.map((c) => (c.id === conn.id ? conn : c)) : [...connections, conn];
  persist();
  return conn;
}

export function updateConnection(id: string, change: Partial<Connection>): void {
  connections = connections.map((c) => (c.id === id ? { ...c, ...change } : c));
  persist();
}

export function removeConnection(id: string): void {
  connections = connections.filter((c) => c.id !== id);
  persist();
  // Lesekopie dieses Servers mit entfernen (Abmelden, Konto gelöscht, Musterkampagne beendet)
  removeCopiesOf(id).catch(() => undefined);
}

/**
 * Kompatibilitätsfenster: Server-Schnittstellen ab dieser Version werden unterstützt;
 * neuere Funktionen blendet die App bei älteren Servern nur für diesen Server aus. Darunter gilt der Server als
 * „veraltet“ – seine Kampagnen sind gesperrt, die anderen Server laufen weiter. Beim Anheben mindestens
 * 12 Monate Rückwärtsfenster lassen.
 */
export const MIN_API_VERSION = '0.3.7';

/** Server außerhalb des Kompatibilitätsfensters? */
export function serverTooOld(c: Connection): boolean {
  return !!c.apiVersion && versionLess(c.apiVersion, MIN_API_VERSION);
}

/** Schnittstellenversion, die diese App mindestens erwartet */
export const REQUIRED_API_VERSION = '0.3.7';

/** Diese App-Version */
export const APP_VERSION: string = __APP_VERSION__;

/** a < b bei Versionen wie „0.9.2“ */
export function versionLess(a: string, b: string): boolean {
  const x = a.split('.').map((n) => parseInt(n, 10) || 0);
  const y = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
}

/** Kann der Server (Standard: der aktuelle) mindestens diese Schnittstellenversion? */
export function apiAtLeast(min: string, conn: Connection | null | undefined = currentConnection()): boolean {
  return !!conn?.apiVersion && !versionLess(conn.apiVersion, min);
}

export function isOutdated(apiVersion: string | null): boolean {
  if (!apiVersion) return false;
  const a = apiVersion.split('.').map(Number);
  const b = REQUIRED_API_VERSION.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
