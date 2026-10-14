/*
 * Abgleich Sammlung ↔ Server (Schnittstelle 0.4.7). Die App ist die Quelle: Stammdaten, Bild und mitgebrachte Welt
 * gehen auf Knopfdruck an die Kampagne; zurück kommen nur Stand der Vorschläge und die Abschrift (Chronik).
 */
import { t } from '../i18n';
import { apiFor, isApiError } from '../api/client';
import { apiAtLeast, getConnection, versionLess, type Connection } from '../api/connections';
import type { Member } from '../api/types';
import {
  accountKey, addOwners, allStoredCharacters, getCharacter, myAccountKeys, portraitToBlob, removeLink, saveChronicle, saveLink, setVersion, toServerCharacter,
  type CharacterLink, type StoredCharacter
} from './store';

/** Kann der Server Charaktere aus der Sammlung annehmen? */
export function serverHasCharacters(conn: Connection | undefined | null): boolean {
  return !!conn?.apiVersion && !versionLess(conn.apiVersion, '0.4.7');
}

/** Ist auf dem Server ein älterer Stand als in der Sammlung? */
export function linkOutdated(c: StoredCharacter, l: CharacterLink): boolean {
  if (l.syncedVersion < c.version) return true;
  if ((c.portraitChangedAt ?? null) !== (l.portraitSynced ?? null)) return true;
  return c.world.some((w) => (l.submitted?.[w.id] ?? 0) < w.version);
}

function connOf(l: { connId: string }): Connection {
  const conn = getConnection(l.connId);
  if (!conn) throw new Error(t('Dieser Server ist in der App nicht (mehr) eingerichtet.'));
  return conn;
}

/**
 * Stammdaten, Bild und Welt an eine Kampagne schicken. Kennt der Server schon einen neueren Stand
 * (z. B. von einem anderen Gerät), zählt die Sammlung über ihn hinaus und versucht es noch einmal.
 */
export async function pushToCampaign(characterId: string, target: { connId: string; campaignId: string; campaignTitle: string; memberId: string }): Promise<StoredCharacter> {
  const conn = connOf(target);
  const api = apiFor(conn);
  let c = getCharacter(characterId);
  if (!c) throw new Error(t('Charakter nicht gefunden.'));
  const old = c.links.find((l) => l.connId === target.connId && l.campaignId === target.campaignId);

  let member: Member;
  try {
    member = await api.putMyCharacter(target.campaignId, toServerCharacter(c));
  } catch (e) {
    const serverVersion = isApiError(e, 'character_version_stale') ? Number(e.details?.serverVersion) : NaN;
    if (!Number.isFinite(serverVersion)) throw e;
    c = setVersion(characterId, Math.max(c.version, serverVersion) + 1);
    member = await api.putMyCharacter(target.campaignId, toServerCharacter(c));
  }

  // Bild: hochladen, wenn geändert; entfernen, wenn in der Sammlung gelöscht
  let portraitSynced = old?.portraitSynced ?? null;
  if ((c.portraitChangedAt ?? null) !== portraitSynced) {
    if (c.portrait) await api.uploadPortrait(target.campaignId, member.id, await portraitToBlob(c.portrait), c.portraitMeta?.crop);
    else if (member.portraitUpdatedAt) await api.deletePortrait(target.campaignId, member.id);
    portraitSynced = c.portraitChangedAt ?? null;
  }

  // Welt: alles schicken – der Server meldet bekannte Versionen als „unchanged“
  const submitted = { ...(old?.submitted ?? {}) };
  let world = old?.world;
  if (c.world.length) {
    // Beziehung erst ab Schnittstelle 0.4.19 mitschicken – ältere Server kennen das Feld nicht
    const withRelation = apiAtLeast('0.4.19', conn);
    await api.submitWorld(target.campaignId, c.world.map(({ relation, ...w }) => (withRelation && relation?.trim() ? { ...w, relation: relation.trim() } : w)));
    for (const w of c.world) submitted[w.id] = w.version;
    // Die Antwort meldet Bekanntes als „unchanged“ – der echte Stand kommt aus der Liste
    world = (await api.myWorld(target.campaignId)).entries;
  }

  const key = accountKey(conn);
  if (key) addOwners(characterId, [key]);
  return saveLink(characterId, {
    connId: conn.id, serverName: conn.name, campaignId: target.campaignId, campaignTitle: target.campaignTitle,
    memberId: member.id, linkedAt: old?.linkedAt ?? new Date().toISOString(), syncedVersion: c.version,
    world, submitted, portraitSynced
  });
}

/** Stand der eingereichten Welt-Einträge neu holen */
export async function refreshWorld(characterId: string, l: CharacterLink): Promise<StoredCharacter> {
  const r = await apiFor(connOf(l)).myWorld(l.campaignId);
  return saveLink(characterId, { ...l, world: r.entries });
}

/** Abschrift (Chronik aus Sicht des Charakters) holen und in der Sammlung ablegen */
export async function fetchChronicle(characterId: string, l: { connId: string; campaignId: string }): Promise<StoredCharacter> {
  const chronicle = await apiFor(connOf(l)).myChronicle(l.campaignId);
  return saveChronicle(characterId, l.connId, chronicle);
}

/** Charakter von der Kampagne lösen – die Serverkopie bleibt als Altbestand stehen */
export async function releaseFromCampaign(characterId: string, l: CharacterLink): Promise<StoredCharacter> {
  try {
    await apiFor(connOf(l)).releaseMyCharacter(l.campaignId);
  } catch (e) {
    // Schon gelöst oder Kampagne weg: lokal trotzdem aufräumen
    if (!isApiError(e, 'no_character') && !(isApiError(e) && e.status === 404)) throw e;
  }
  return removeLink(characterId, l.connId, l.campaignId);
}

/**
 * Charaktere aus 0.11 (ohne Besitzer) zuordnen: Bei Verknüpfungen fragt die App den Server, welchem Konto das
 * Mitglied gehört; ohne Verknüpfung gehört der Charakter den gerade angemeldeten Konten. Charaktere anderer Konten
 * bleiben so unsichtbar.
 */
export async function claimLegacyCharacters(): Promise<void> {
  const mine = myAccountKeys();
  if (mine.length === 0) return;
  for (const c of allStoredCharacters().filter((x) => !x.owners)) {
    if (c.links.length === 0) {
      addOwners(c.id, mine);
      continue;
    }
    const owners: string[] = [];
    for (const l of c.links) {
      const conn = getConnection(l.connId);
      if (!conn) continue;
      try {
        const campaign = await apiFor(conn).campaign(l.campaignId);
        const m = campaign.members.find((x) => x.id === l.memberId);
        if (m?.userId) owners.push(`${conn.baseUrl}|${m.userId}`);
      } catch {
        /* Kampagne für dieses Konto nicht sichtbar – dann gehört der Charakter nicht ihm */
      }
    }
    if (owners.length) addOwners(c.id, owners);
  }
}
