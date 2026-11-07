/*
 * Geteiltes Kapitel öffnen (Schnittstelle 0.4.30): Datei prüfen (shareFile.ts) und den Inhalt in die Lesekopie der
 * passenden Verbindung legen – durch dieselbe Positivliste wie Antworten des Servers. Neueres gewinnt; die nächste
 * Antwort des Servers ersetzt die Kopie ohnehin.
 */
import { listConnections, type Connection } from '../api/connections';
import { readCopy, saveCopy } from '../api/readCopy';
import { cleanForCopy } from '../api/readCopyRules';
import { openShareFile, SHARE_MAX_FILE, ShareRejected, type ShareMemberKey } from './shareFile';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Angemeldete Verbindungen zu diesem Server (Schlüssel und Kopie gehören zu Verbindung und Konto) */
const signedIn = (serverId: string) => listConnections().filter((c) => c.serverId === serverId && !!c.token && !!c.user);

export interface OpenedShare { conn: Connection; campaignId: string; campaignTitle: string; sessionId: string | null; sessionNumber: number | null; createdAt: string }

export async function importShareFile(file: File): Promise<OpenedShare> {
  if (file.size > SHARE_MAX_FILE) throw new ShareRejected();
  let target: Connection | null = null;
  const { head, content } = await openShareFile(await file.text(), {
    serverKeys: (serverId) => signedIn(serverId).flatMap((c) => c.shareKeys ?? []),
    memberKey: async (serverId, campaignId) => {
      for (const c of signedIn(serverId)) {
        const copy = await readCopy(c.id, c.user!.id, `/campaigns/${campaignId}`).catch(() => null);
        const key = isObj(copy?.data) && isObj(copy.data.shareKey) ? copy.data.shareKey as unknown as ShareMemberKey : null;
        if (key) { target = c; return key; }
      }
      return null;
    }
  });
  const conn = target as Connection | null;
  if (!conn?.user) throw new ShareRejected();
  const userId = conn.user.id;
  const { campaignId, createdAt } = head;

  // Nur überschreiben, was älter ist als die Datei
  const put = async (path: string, data: unknown) => {
    const clean = cleanForCopy(path, data, userId);
    if (clean === null) return;
    const old = await readCopy(conn.id, userId, path).catch(() => null);
    if (old && old.savedAt >= createdAt) return;
    await saveCopy(conn.id, userId, path, clean, campaignId, () => true, createdAt);
  };

  let first: { id: string; number: number } | null = null;
  for (const item of (content.sessions as unknown[]).slice(0, 1)) {
    if (!isObj(item) || !isObj(item.session) || !isObj(item.recap)) continue;
    const s = item.session, r = item.recap;
    if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s.id) || r.sessionId !== s.id || !r.publishedAt) continue;
    await put(`/sessions/${s.id}`, { ...s, campaignId, publishedAt: r.publishedAt, state: 'published' });
    await put(`/sessions/${s.id}/recap`, r);
    // Kapitelliste: zusammenführen, das geteilte Kapitel ersetzt nur sich selbst
    const listPath = `/campaigns/${campaignId}/sessions`;
    const list = await readCopy(conn.id, userId, listPath).catch(() => null);
    const old = Array.isArray(list?.data) ? (list.data as Obj[]).filter((x) => x.id !== s.id) : [];
    const merged = [...old, { ...s, state: 'published' }].sort((a, b) => Number(a.number) - Number(b.number));
    const clean = cleanForCopy(listPath, merged, userId);
    if (clean) await saveCopy(conn.id, userId, listPath, clean, campaignId, () => true, list?.savedAt && list.savedAt > createdAt ? list.savedAt : createdAt);
    if (typeof s.number === 'number') first = { id: s.id, number: s.number };
  }

  // Einträge: nach id zusammenführen, höheres updatedAt gewinnt
  const entriesPath = `/campaigns/${campaignId}/entries`;
  const have = await readCopy(conn.id, userId, entriesPath).catch(() => null);
  const byId = new Map<string, Obj>((Array.isArray(have?.data) ? have.data as Obj[] : []).map((e) => [String(e.id), e]));
  for (const e of content.entries as unknown[]) {
    if (!isObj(e) || typeof e.id !== 'string' || e.campaignId !== campaignId) continue;
    const old = byId.get(e.id);
    if (!old || String(e.updatedAt ?? '') > String(old.updatedAt ?? '')) byId.set(e.id, e);
  }
  const cleanEntries = cleanForCopy(entriesPath, [...byId.values()], userId);
  if (cleanEntries) await saveCopy(conn.id, userId, entriesPath, cleanEntries, campaignId, () => true, have?.savedAt && have.savedAt > createdAt ? have.savedAt : createdAt);

  return { conn, campaignId, campaignTitle: String(content.campaignTitle).slice(0, 200), sessionId: (first as { id: string } | null)?.id ?? null,
    sessionNumber: (first as { number: number } | null)?.number ?? null, createdAt };
}
