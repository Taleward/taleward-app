import type { Entry, ProposalMatch, RecapGmWarning } from '../api/types';

/*
 * Testserver (Schnittstelle 0.4.21): grobe Nachbildung der Server-Prüfungen ohne Sprachmodell –
 * „Auch genannt“ bereinigen, „klingt wie“ bei neuen Vorschlägen, Geheimes im Kapitel. Der echte Server rechnet
 * genauer (Kölner Phonetik, Zeichenabstand); hier reicht es, damit die Oberfläche etwas zu zeigen hat.
 */

const ARTICLE = /^(der|die|das|den|dem|des|the)\s+/i;
const norm = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9ß ]/g, ' ').replace(/\s+/g, ' ').trim();

export function cleanAliases(raw: unknown, name: string): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([norm(name)]);
  const out: string[] = [];
  for (const a of raw) {
    if (typeof a !== 'string') continue;
    const v = a.trim().slice(0, 40).trim();
    if (!v || seen.has(norm(v))) continue;
    seen.add(norm(v));
    out.push(v);
    if (out.length === 10) break;
  }
  return out;
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

const close = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && distance(a, b) <= (a.length >= 7 ? 2 : 1));

/** Bester Treffer für einen „neu anlegen“-Vorschlag unter Namen und Aliassen der Kampagne */
export function findMatch(title: string, list: Entry[]): ProposalMatch | null {
  const t = norm(title.replace(ARTICLE, ''));
  if (!t) return null;
  const tw = t.split(' ');
  for (const kind of ['spelling', 'part_name'] as const) {
    for (const e of list) {
      for (const cand of [e.name, ...(e.aliases ?? [])]) {
        const c = norm(cand.replace(ARTICLE, ''));
        const cw = c.split(' ');
        const hit = kind === 'spelling'
          ? close(t, c)
          : tw.length !== cw.length && (tw.length < cw.length ? tw : cw).every((w) => (tw.length < cw.length ? cw : tw).some((x) => close(w, x)));
        if (hit) return { entryId: e.id, name: e.name, matchedName: cand, entryType: e.type, kind };
      }
    }
  }
  return null;
}

/** Namen geheimer bzw. teilweise verborgener Einträge im Kapiteltext (mit einfacher Beugung: „den Raben“) */
export function secretWarnings(text: string, list: Entry[], skipEntryIds: string[]): RecapGmWarning[] {
  const paras = text.split(/\n\s*\n/);
  const out: RecapGmWarning[] = [];
  for (const e of list) {
    const hidden = e.visibility === 'gm_only' || (e.hiddenFromMemberIds?.length ?? 0) > 0;
    if (!hidden || skipEntryIds.includes(e.id)) continue;
    for (const n of [e.name, ...(e.aliases ?? [])]) {
      const core = n.replace(ARTICLE, '').trim();
      if (core.length < 3) continue;
      const re = new RegExp(`(^|[^\\p{L}])(${core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:n|en|s|es)?)(?![\\p{L}])`, 'iu');
      const at = paras.map((p, i) => (re.test(p) ? i : -1)).filter((i) => i >= 0);
      if (!at.length) continue;
      const found = paras[at[0]].match(re)?.[2] ?? core;
      out.push({ code: 'secret_entry_name', entryIds: [e.id], names: [found], paragraphs: at });
      break;
    }
  }
  return out;
}
