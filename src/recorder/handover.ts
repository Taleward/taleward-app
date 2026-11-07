/*
 * Zustimmung am Tisch übernehmen: Mitglied (auch die eigene Person) kommt zu den Anwesenden vor Ort, nur eine Person
 * ohne Konto wird Gast. Ohne Laufzeit-Importe (Test: scripts/tests/handover.test.mjs).
 */
export interface Handover {
  memberId?: string;
  name: string;
  /** Die eigene Person: zusätzlich stehende Zustimmung für die Kampagne */
  self?: boolean;
}

export interface TableState {
  onSite: Record<string, string>;
  guests: { name: string; consentAt: string }[];
}

export function applyHandover(state: TableState, h: Handover, at: string): TableState & { consentSelf: boolean } {
  if (h.memberId) return { onSite: { ...state.onSite, [h.memberId]: at }, guests: state.guests, consentSelf: !!h.self };
  return { onSite: state.onSite, guests: [...state.guests, { name: h.name, consentAt: at }], consentSelf: false };
}
