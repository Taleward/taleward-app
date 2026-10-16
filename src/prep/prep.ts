/**
 * Vorbereitung auf die nächste Runde (nur SL): wann die Karte erscheint und was hineingehört.
 * Ohne Laufzeit-Importe, damit es sich testen lässt (scripts/tests/prep.test.mjs).
 */

/** Nach dem Beginn der Runde bleibt die Karte noch so lange stehen (die Runde läuft ja noch) */
export const AFTER_START_MS = 6 * 3600 * 1000;

export type PrepWhen = 'none' | 'upcoming' | 'today';

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** none = kein Termin oder Runde vorbei; today = Spieltag (Karte nach oben); upcoming = Termin steht */
export function prepWhen(nextSessionAt: string | null | undefined, now: Date): PrepWhen {
  if (!nextSessionAt) return 'none';
  const at = new Date(nextSessionAt);
  if (Number.isNaN(at.getTime())) return 'none';
  if (now.getTime() > at.getTime() + AFTER_START_MS) return 'none';
  return sameDay(at, now) ? 'today' : 'upcoming';
}

/** Mehr als sechs Tage entfernt: mit Datum, sonst reicht der Wochentag */
export function needsDate(nextSessionAt: string, now: Date): boolean {
  return new Date(nextSessionAt).getTime() - now.getTime() > 6 * 24 * 3600 * 1000;
}

export interface PrepEntryLike {
  type: string;
  name: string;
  lastSessionNumber: number | null;
}

export const PREP_TYPES = ['npc', 'location'];
export const MAX_PREP_ENTRIES = 8;

/** NSC und Orte, die zuletzt im Kapitel `number` vorkamen; NSC zuerst, dann alphabetisch */
export function lastRoundEntries<T extends PrepEntryLike>(entries: T[], number: number): T[] {
  return entries
    .filter((e) => e.lastSessionNumber === number && PREP_TYPES.includes(e.type))
    .sort((a, b) => PREP_TYPES.indexOf(a.type) - PREP_TYPES.indexOf(b.type) || a.name.localeCompare(b.name, 'de'))
    .slice(0, MAX_PREP_ENTRIES);
}
