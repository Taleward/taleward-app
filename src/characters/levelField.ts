import type { CharacterClass, GameSystem } from '../api/types';

/*
 * Stufe am Charakter (Schnittstelle 0.4.29): bei D&D und Pathfinder Klassen mit Stufe, sonst ein freies Feld, dessen
 * Bezeichnung vom Spielsystem abhängt. Die App rechnet nichts damit aus. Ohne Laufzeit-Importe
 * (Test: scripts/tests/level-field.test.mjs).
 */

/** class = Klasse und Stufe, experience = Erfahrungsgrad, herograde = Heldengrad, level = Stufe; null = kein Feld */
export type LevelKind = 'class' | 'experience' | 'herograde' | 'level';

const KIND: Record<GameSystem, LevelKind | null> = {
  dnd: 'class',
  pathfinder: 'class',
  dsa: 'experience',
  splittermond: 'herograde',
  cthulhu: null,
  shadowrun: null,
  other: 'level'
};

export function levelKind(system: GameSystem | null | undefined): LevelKind | null {
  // Unbekanntes System (neuerer Server): allgemeines Feld
  return system && Object.hasOwn(KIND, system) ? KIND[system] : 'level';
}

/** Spielsystem aus dem freien Text der Sammlung („DSA 5“, „D&D 5e“) erraten; unbekannt = other */
export function guessSystem(text: string | null | undefined): GameSystem {
  const s = (text ?? '').toLowerCase();
  if (/\bd\s*&\s*d\b|\bdnd\b|dungeons|\b5e\b/.test(s)) return 'dnd';
  if (/pathfinder/.test(s)) return 'pathfinder';
  if (/\bdsa\b|schwarze\s*auge|dark\s*eye/.test(s)) return 'dsa';
  if (/splittermond|splinter/.test(s)) return 'splittermond';
  if (/cthulhu/.test(s)) return 'cthulhu';
  if (/shadowrun/.test(s)) return 'shadowrun';
  return 'other';
}

/** Klassen der Grundregeln als Vorschläge; eigene Namen gehen immer */
const CLASSES: Partial<Record<GameSystem, { de: string[]; en: string[] }>> = {
  dnd: {
    de: ['Barbar', 'Barde', 'Druide', 'Hexenmeister', 'Kämpfer', 'Kleriker', 'Magier', 'Mönch', 'Paladin', 'Schurke', 'Waldläufer', 'Zauberer'],
    en: ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']
  },
  pathfinder: {
    de: ['Alchemist', 'Barbar', 'Barde', 'Champion', 'Druide', 'Hexe', 'Hexenmeister', 'Kämpfer', 'Kleriker', 'Magier', 'Mönch', 'Orakel', 'Schurke', 'Waldläufer'],
    en: ['Alchemist', 'Barbarian', 'Bard', 'Champion', 'Cleric', 'Druid', 'Fighter', 'Investigator', 'Monk', 'Oracle', 'Ranger', 'Rogue', 'Sorcerer', 'Swashbuckler', 'Witch', 'Wizard']
  }
};

export function classSuggestions(system: GameSystem, language: string): string[] {
  const c = CLASSES[system];
  return c ? (language === 'en' ? c.en : c.de) : [];
}

export const MAX_CLASSES = 4;

/** Nur vollständige Zeilen: Name und Stufe 1–30 */
export function cleanClasses(rows: { name: string; level: string | number }[]): CharacterClass[] {
  return rows
    .map((r) => ({ name: r.name.trim().slice(0, 40), level: Number(r.level) }))
    .filter((r) => r.name && Number.isInteger(r.level) && r.level >= 1 && r.level <= 30)
    .slice(0, MAX_CLASSES);
}

/** Anzeige: „Magier 3 / Schurke 2“ oder der freie Text */
export function levelText(classes: CharacterClass[] | null | undefined, level: string | null | undefined): string | null {
  if (classes?.length) return classes.map((c) => `${c.name} ${c.level}`).join(' / ');
  return level?.trim() || null;
}
