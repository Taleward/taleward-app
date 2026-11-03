/*
 * „Auf dieses Gerät holen“: Was mit einer Charakter-Kennung vom Server passiert. Ohne Laufzeit-Importe
 * (Test: scripts/tests/adopt.test.mjs).
 * own     – gehört diesem Konto schon, nur verknüpfen
 * foreign – liegt auf dem Gerät unter einem anderen Konto, nur nach Rückfrage
 * new     – nicht auf dem Gerät, aus den Angaben des Servers neu anlegen
 */
export type AdoptTarget = 'own' | 'foreign' | 'new';

export function adoptTarget(characterId: string | null | undefined, stored: { id: string; owners?: string[] | null }[], mine: string[]): AdoptTarget {
  if (!characterId) return 'new';
  const c = stored.find((x) => x.id === characterId);
  if (!c) return 'new';
  return (c.owners ?? []).some((o) => mine.includes(o)) ? 'own' : 'foreign';
}
