import type { Proposal } from '../api/types';

/**
 * „Unauffällige übernehmen“: nur offene Vorschläge ohne Warnzeichen. Einzeln prüfen muss man alles, was unsicher,
 * vermutlich ein Scherz, ohne Beleg oder im Widerspruch zur Bibel ist, was etwas Geheimes aufdeckt oder sichtbar macht
 * und was wie ein vorhandener Eintrag klingt (sonst entstünde ein Doppel).
 */
export function needsOwnLook(p: Pick<Proposal, 'flags' | 'action' | 'publicSuggested' | 'match'>): boolean {
  if (p.flags.length > 0) return true;
  if (p.action === 'reveal') return true;
  if (p.publicSuggested) return true;
  if (p.action === 'create' && p.match) return true;
  return false;
}

export function bulkAcceptable<T extends Pick<Proposal, 'decision' | 'flags' | 'action' | 'publicSuggested' | 'match'>>(list: T[]): T[] {
  return list.filter((p) => p.decision === 'open' && !needsOwnLook(p));
}
