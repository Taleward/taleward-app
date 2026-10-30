import type { GameSystem } from '../api/types';

/*
 * Stufe am Charakter (Schnittstelle 0.4.29): ein freies Feld, dessen Bezeichnung vom Spielsystem abhängt. Die App
 * rechnet nichts damit aus. Ohne Laufzeit-Importe (Test: scripts/tests/level-field.test.mjs).
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
