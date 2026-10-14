/*
 * Charakter aus einer Datei (Sicherung, Charakter-Datei) aufräumen, bevor er in die Sammlung kommt: Kennungen nach dem
 * Muster aus api/pathGuard.ts (Schnittstelle 0.4.14), Einträge mit bekannter Art, vernünftige Längen.
 * Ohne Laufzeit-Importe (Test: scripts/tests/character-sanitize.test.mjs).
 */
import type { StoredCharacter } from './store';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const WORLD_TYPES = ['npc', 'location', 'item', 'faction', 'quest', 'other'];
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Bereinigter Charakter oder null, wenn er unbrauchbar ist. Unpassende Einträge, Verknüpfungen und Abschriften fallen weg. */
export function sanitizeCharacter(raw: unknown): StoredCharacter | null {
  if (!obj(raw)) return null;
  const x = raw;
  if (!ID.test(String(x.id)) || !text(x.name, 200) || !x.name.trim() || !text(x.updatedAt, 40)) return null;
  if (!Array.isArray(x.world) || !Array.isArray(x.links) || !obj(x.chronicles)) return null;
  if (!(x.portrait === null || x.portrait === undefined || (text(x.portrait, 8_000_000) && x.portrait.startsWith('data:image/')))) return null;
  const world = x.world.filter((w): w is StoredCharacter['world'][number] => obj(w) && ID.test(String(w.id))
    && Number.isInteger(w.version) && WORLD_TYPES.includes(String(w.type)) && text(w.name, 200) && text(w.summary, 20_000) && typeof w.secret === 'boolean'
    && (w.relation === undefined || w.relation === null || text(w.relation, 120)));
  const links = x.links.filter((l): l is StoredCharacter['links'][number] => obj(l) && text(l.connId, 100)
    && ID.test(String(l.campaignId)) && ID.test(String(l.memberId)) && text(l.campaignTitle, 300) && text(l.serverName, 300));
  const chronicles = Object.fromEntries(Object.entries(x.chronicles).filter(([, ch]) => obj(ch) && text(ch.takenAt, 40)));
  return {
    ...(x as unknown as StoredCharacter),
    version: Number.isInteger(x.version) ? (x.version as number) : 1,
    notes: text(x.notes, 100_000) ? x.notes : '',
    world,
    links,
    chronicles: chronicles as StoredCharacter['chronicles']
  };
}
