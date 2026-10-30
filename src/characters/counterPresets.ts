import type { CounterKind, GameSystem } from '../api/types';

/*
 * Vorschläge für Zähler je Spielsystem (Schnittstelle 0.4.28). Die SL übernimmt sie oder schreibt eigene; gespeichert
 * werden die Texte, nicht die Vorlage. Ohne Laufzeit-Importe (Test: scripts/tests/counter-presets.test.mjs).
 */

type Preset = [id: string, label: string, hint: string][];

const DE: Record<GameSystem, Preset> = {
  dsa: [['lep', 'LeP', 'Lebenspunkte'], ['asp', 'AsP', 'Astralpunkte'], ['kap', 'KaP', 'Karmapunkte'], ['schip', 'SchiP', 'Schicksalspunkte']],
  dnd: [['stufe', 'Stufe', 'Stufe'], ['tp', 'TP', 'Trefferpunkte'], ['insp', 'Inspiration', 'Inspiration']],
  pathfinder: [['stufe', 'Stufe', 'Stufe'], ['tp', 'TP', 'Trefferpunkte'], ['held', 'Heldenpunkte', 'Heldenpunkte']],
  cthulhu: [['tp', 'TP', 'Trefferpunkte'], ['mp', 'MP', 'Magiepunkte'], ['sta', 'STA', 'Stabilität'], ['glueck', 'Glück', 'Glück']],
  shadowrun: [['koerper', 'Körper', 'Körperlicher Zustandsmonitor'], ['geist', 'Geist', 'Geistiger Zustandsmonitor'], ['edge', 'Edge', 'Edge']],
  splittermond: [['lp', 'LP', 'Lebenspunkte'], ['fo', 'FO', 'Fokus'], ['sp', 'Splitterpunkte', 'Splitterpunkte']],
  other: [['leben', 'Leben', 'Lebenspunkte'], ['energie', 'Energie', 'Energie oder Magie']]
};

const EN: Record<GameSystem, Preset> = {
  dsa: [['lep', 'LP', 'Life points'], ['asp', 'AE', 'Arcane energy'], ['kap', 'KP', 'Karma points'], ['schip', 'FP', 'Fate points']],
  dnd: [['stufe', 'Level', 'Level'], ['tp', 'HP', 'Hit points'], ['insp', 'Inspiration', 'Inspiration']],
  pathfinder: [['stufe', 'Level', 'Level'], ['tp', 'HP', 'Hit points'], ['held', 'Hero points', 'Hero points']],
  cthulhu: [['tp', 'HP', 'Hit points'], ['mp', 'MP', 'Magic points'], ['sta', 'SAN', 'Sanity'], ['glueck', 'Luck', 'Luck']],
  shadowrun: [['koerper', 'Physical', 'Physical condition monitor'], ['geist', 'Stun', 'Stun condition monitor'], ['edge', 'Edge', 'Edge']],
  splittermond: [['lp', 'LP', 'Life points'], ['fo', 'Focus', 'Focus'], ['sp', 'Splinter points', 'Splinter points']],
  other: [['leben', 'Health', 'Health'], ['energie', 'Energy', 'Energy or magic']]
};

export function counterPreset(system: GameSystem | null | undefined, language: 'de' | 'en' | undefined): CounterKind[] {
  const table = language === 'en' ? EN : DE;
  return (table[system ?? 'other'] ?? table.other).map(([id, label, hint]) => ({ id, label, hint }));
}

/** Kennung aus der Bezeichnung (für eigene Zähler), eindeutig in der Liste */
export function counterId(label: string, taken: string[]): string {
  const base = label.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'zaehler';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`.slice(0, 24);
  return id;
}
