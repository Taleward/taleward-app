import type { Entry, Proposal } from '../api/types';

/**
 * Wie der Server beim Ergänzen (0.4.21): Ist der Vorschlag weniger sichtbar als der Eintrag, kommen Titel und Text nur
 * in dessen SL-Notizen. Ohne Angaben zum Eintrag: unbekannt (null).
 */
export function mergesIntoNotes(p: Pick<Proposal, 'suggestedVisibility' | 'hiddenFromMemberIds'>, target: Pick<Entry, 'visibility' | 'hiddenFromMemberIds'> | undefined, memberIds?: string[]): boolean | null {
  if (!target) return null;
  if (target.visibility !== 'public') return false;
  if (p.suggestedVisibility !== 'public') return true;
  const hidden = (p.hiddenFromMemberIds ?? []).filter((id) => !memberIds || memberIds.includes(id));
  const targetHidden = target.hiddenFromMemberIds ?? [];
  return hidden.some((id) => !targetHidden.includes(id));
}
