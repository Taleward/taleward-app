/*
 * Lesekopie für unterwegs (ohne Netz): Welche Antworten des Servers auf dem Gerät bleiben dürfen und was vorher
 * herausfällt. Grundsatz (Benjamin 14.10.): Auf dem Gerät liegt nur, was alle Spielerinnen der Kampagne lesen dürfen –
 * auch bei der Spielleitung. Nie: SL-Notizen, Einträge „nur SL“ oder teilweise verborgene Einträge, offene Vorschläge,
 * Abschriften, ungeprüfte Kapitel, Hinweise an die SL, private Nachrichten, Hintergründe anderer Figuren.
 * Ohne Laufzeit-Importe, damit die Regeln für sich getestet werden können.
 */

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const ID = '[A-Za-z0-9_-]{1,64}';

/** Nur diese Lesewege kommen in die Kopie (Pfad ohne Abfrage) */
const RULES: { pattern: RegExp; clean: (data: unknown, myUserId: string | null) => unknown }[] = [
  { pattern: new RegExp('^/campaigns$'), clean: (d) => (Array.isArray(d) ? d.filter(isObj).map(summary) : null) },
  { pattern: new RegExp(`^/campaigns/${ID}$`), clean: (d, me) => (isObj(d) ? campaign(d, me) : null) },
  { pattern: new RegExp(`^/campaigns/${ID}/sessions$`), clean: (d) => (Array.isArray(d) ? d.filter(isObj).filter(published).map(sessionSummary) : null) },
  { pattern: new RegExp(`^/sessions/${ID}$`), clean: (d) => (isObj(d) && published(d) ? session(d) : null) },
  { pattern: new RegExp(`^/sessions/${ID}/recap$`), clean: (d) => (isObj(d) && d.publishedAt ? recap(d) : null) },
  { pattern: new RegExp(`^/sessions/${ID}/comments$`), clean: (d) => (Array.isArray(d) ? d.filter(isObj).filter((c) => c.recipientMemberId == null) : null) },
  { pattern: new RegExp(`^/campaigns/${ID}/entries$`), clean: (d) => (Array.isArray(d) ? d.filter(isObj).filter(publicEntry).map(entry) : null) }
];

/** Darf die Antwort auf diesen Lesewege in die Kopie? (nur GET, Pfad ohne Abfrage) */
export function copyable(path: string): boolean {
  const p = path.split('?')[0];
  return RULES.some((r) => r.pattern.test(p));
}

/** Aufbereitete Fassung für die Kopie, oder null = nichts speichern (und eine alte Kopie verwerfen) */
export function cleanForCopy(path: string, data: unknown, myUserId: string | null): unknown {
  const p = path.split('?')[0];
  const rule = RULES.find((r) => r.pattern.test(p));
  return rule ? rule.clean(data, myUserId) : null;
}

function pick(o: Obj, keys: string[]): Obj {
  const out: Obj = {};
  for (const k of keys) if (k in o) out[k] = o[k];
  return out;
}

const SUMMARY_KEYS = ['id', 'title', 'archivedAt', 'organization', 'myRole', 'myCharacterName', 'memberCount',
  'publishedSessionCount', 'lastPublishedAt', 'coverPreset', 'coverImageUpdatedAt', 'nextSessionAt'];

/** Kampagne in der Liste: ohne Zähler für die SL und ohne „Neues“ (wäre in der Kopie ohnehin veraltet) */
function summary(c: Obj): Obj {
  return { ...pick(c, SUMMARY_KEYS), pendingReviewCount: 0 };
}

function campaign(c: Obj, me: string | null): Obj {
  const out: Obj = {
    ...summary(c),
    ...pick(c, ['description', 'system', 'systemName', 'language', 'worldInfo', 'allowExternalTranscription', 'allowCloudSummary', 'allowCharacterAnalysis', 'characterSheetLimits'])
  };
  // Spieler bekommen ohnehin nur geteilte Links; bei der SL nur die ausdrücklich geteilten
  out.links = c.myRole === 'gm' ? sharedLinks(c.links) : (Array.isArray(c.links) ? c.links.filter(isObj) : []);
  out.members = Array.isArray(c.members) ? c.members.filter(isObj).map((m) => member(m, me)) : [];
  return out;
}

/** Hintergrund einer Figur sehen nur SL und Spielerin selbst – in der Kopie nur der eigene */
function member(m: Obj, me: string | null): Obj {
  const out = { ...m };
  if (!me || m.userId !== me) delete out.characterBackstory;
  return out;
}

const published = (s: Obj) => s.state === 'published';

function sessionSummary(s: Obj): Obj {
  return pick(s, ['id', 'number', 'title', 'playedAt', 'state']);
}

function session(s: Obj): Obj {
  return pick(s, ['id', 'number', 'title', 'playedAt', 'state', 'campaignId', 'publishedAt']);
}

/** Veröffentlichtes Kapitel ohne Prüfteil und Korrektur-Entwurf */
function recap(r: Obj): Obj {
  return pick(r, ['sessionId', 'number', 'title', 'text', 'openThreads', 'publishedAt', 'parts']);
}

/** Nur öffentliche Einträge, die alle sehen (teilweise verborgene zählen wie „nur SL“) */
function publicEntry(e: Obj): boolean {
  return e.visibility === 'public' && (!Array.isArray(e.hiddenFromMemberIds) || e.hiddenFromMemberIds.length === 0);
}

function entry(e: Obj): Obj {
  const out: Obj = pick(e, ['id', 'campaignId', 'type', 'name', 'summary', 'status', 'holderMemberId', 'visibility',
    'firstSessionNumber', 'lastSessionNumber', 'updatedAt']);
  // Erwähnungen können bei der SL aus noch ungeprüften Kapiteln stammen – in der Kopie leer
  out.mentions = [];
  // Ungeteilte Links tragen shared: false (Spieler bekommen sie gar nicht)
  out.links = Array.isArray(e.links) ? e.links.filter(isObj).filter((l) => l.shared !== false) : [];
  return out;
}

function sharedLinks(links: unknown): Obj[] {
  return Array.isArray(links) ? links.filter(isObj).filter((l) => l.shared === true) : [];
}
