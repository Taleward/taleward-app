/*
 * Musterkampagne starten, nach einem Neustart wiederherstellen und beenden. Der nachgeahmte Server wird erst geladen,
 * wenn jemand die Musterkampagne nutzt, und beantwortet nur Anfragen an ihre .invalid-Adresse.
 */
import { getLang, t } from '../i18n';
import { forgetAccount, putCharacters, accountKey } from '../characters/store';
import { apiFor } from './client';
import { listConnections, removeConnection, saveConnection, type Connection } from './connections';
import { MUSTER_BASE_URL, MUSTER_HOST, isMusterUrl, musterCampaignId, type MusterRole } from './muster';

const KEY = 'taleward.muster';
const MOCK = import.meta.env.VITE_API_MODE === 'mock';
let installed = false;

/** Sprache, in der die Musterkampagne angelegt wurde (bleibt, auch wenn die App-Sprache wechselt) */
export function musterLang(): 'de' | 'en' {
  if (MOCK) return getLang();
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { lang?: string } | null;
    if (v?.lang === 'de' || v?.lang === 'en') return v.lang;
  } catch { /* egal */ }
  return getLang();
}

export function musterConnection(): Connection | undefined {
  return listConnections().find((c) => isMusterUrl(c.baseUrl));
}

/** Adresse der Musterkampagne in der App */
export function musterPath(conn: Connection): string {
  return `/v/${conn.id}/k/${musterCampaignId(musterLang())}`;
}

async function install(lang: 'de' | 'en'): Promise<void> {
  if (installed || MOCK) return;
  const { installMockFetch } = await import('../mocks/installMockFetch');
  installMockFetch({ lang, onlyHost: MUSTER_HOST });
  installed = true;
}

/** Beim Start: Gibt es eine Musterkampagne, wird ihr Server vor dem ersten Aufruf wieder bereitgestellt */
export async function restoreMuster(): Promise<void> {
  if (musterConnection()) await install(musterLang());
}

/** Musterkampagne anlegen und als Anja (Spielleitung) oder Lea (Spielerin) anmelden */
export async function startMuster(role: MusterRole): Promise<Connection> {
  const lang = musterLang();
  try { localStorage.setItem(KEY, JSON.stringify({ lang })); } catch { /* egal */ }
  await install(lang);
  const probe = saveConnection({ baseUrl: MUSTER_BASE_URL, name: t('Musterkampagne'), operator: null, apiVersion: '0.4.16', token: null, expiresAt: null, user: null });
  const res = await apiFor(probe).login(role, 'muster');
  const conn = saveConnection({ ...probe, name: t('Musterkampagne'), token: res.accessToken, expiresAt: res.expiresAt, user: res.user });
  if (role === 'lea') {
    const { musterCollection } = await import('../mocks/muster/seed');
    putCharacters(musterCollection(lang, 'lea', conn.id, conn.name, accountKey(conn)));
  }
  return conn;
}

/** Musterkampagne beenden: Verbindung, Muster-Charaktere und Verknüpfungen weg, dann frisch starten */
export function endMuster(): void {
  const conn = musterConnection();
  if (conn) {
    const owner = accountKey(conn);
    if (owner) forgetAccount(owner, conn.id);
    removeConnection(conn.id);
  }
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
  window.location.hash = '#/';
  window.location.reload();
}
