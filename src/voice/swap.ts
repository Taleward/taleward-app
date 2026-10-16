/**
 * „Tauschen“ auf der Seite „Stimmen zuordnen“ (Hinweis ab Schnittstelle 0.4.21).
 * Ohne Laufzeit-Importe, damit es sich testen lässt (scripts/tests/speaker-swap.test.mjs).
 *
 * mapping: Stimme → Mitglied-ID, „guest:Name“, „__ignore“ oder '' (noch offen).
 * Die Stimme bekommt memberId; jede Stimme, die bisher memberId hatte, bekommt die bisherige Zuordnung dieser Stimme.
 */
export function swapAssignment(mapping: Record<string, string>, speakerId: string, memberId: string): Record<string, string> {
  const before = mapping[speakerId] ?? '';
  if (before === memberId) return mapping;
  const next: Record<string, string> = {};
  for (const [id, v] of Object.entries(mapping)) next[id] = id === speakerId ? memberId : v === memberId ? before : v;
  return next;
}
