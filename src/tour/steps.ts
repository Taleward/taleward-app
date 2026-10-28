// Markiert Texte für die Übersetzung (wie tk aus i18n; hier ohne Abhängigkeit, damit die Tests es laden)
const tk = (text: string): string => text;

/**
 * Kurze Tour durch eine Kampagne – je Rolle eigene Schritte. Ein Schritt zeigt auf ein Element mit
 * `data-tour="…"`; fehlt es (z. B. „Jetzt dran“ ist leer), fällt der Schritt still weg. Ohne Ziel steht der Text mittig.
 */
export type TourRole = 'player' | 'gm';

export interface TourStep {
  target: string | null;
  title: string;
  text: string;
}

export const TOUR_STEPS: Record<TourRole, TourStep[]> = {
  player: [
    { target: null, title: tk('Kurz herumgeführt'), text: tk('Wo du Kapitel liest, Namen nachschlägst und was von dir gebraucht wird. Dauert eine halbe Minute.') },
    { target: 'now', title: tk('Jetzt dran'), text: tk('Steht hier etwas, wartet es auf dich: zustimmen, abstimmen, ein neues Kapitel lesen.') },
    { target: 'nav-chronik', title: tk('Chronik'), text: tk('Hier liest du die Kapitel eurer Runden. Darunter kannst du kommentieren, das sehen alle am Tisch.') },
    { target: 'nav-bibel', title: tk('Bibel'), text: tk('Personen, Orte und Aufträge, die deine Figur kennt. Die Suche dort findet Namen auch halb erinnert.') },
    { target: 'members', title: tk('Am Tisch'), text: tk('Hier steht deine Figur. Bild und Hintergrund gehören dir, du kannst sie in andere Kampagnen mitnehmen.') }
  ],
  gm: [
    { target: null, title: tk('Kurz herumgeführt'), text: tk('Wo du aufnimmst, Kapitel prüfst und am Spielabend nachschlägst. Dauert eine halbe Minute.') },
    { target: 'first-steps', title: tk('Hier fängst du an'), text: tk('Lade deine Runde ein und nimm am Spielabend die erste Runde auf. Alles andere kann warten.') },
    { target: 'nav-aufnahme', title: tk('Aufnahme'), text: tk('Hier nimmst du die Runde auf. Vorher stimmt jede Person am Tisch selbst zu.') },
    { target: 'now', title: tk('Jetzt dran'), text: tk('Nach der Runde steht hier „Kapitel prüfen“. Erst wenn du es freigibst, lesen es die anderen.') },
    { target: 'nav-bibel', title: tk('Bibel'), text: tk('Namen aus den Kapiteln kommen als Vorschlag hierher. Was nur du weißt, bleibt „Nur SL“.') },
    { target: 'schirm', title: tk('SL-Schirm'), text: tk('Für den Spielabend: Kapitelplan, Bibel und Gruppe auf einen Blick.') },
    { target: 'invite', title: tk('Mitspielende einladen'), text: tk('Hier holst du deine Runde dazu, per Link oder QR-Code.') }
  ]
};

/** Nur Schritte, deren Ziel gerade da ist (ohne Ziel immer) */
export function availableSteps(steps: TourStep[], present: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => s.target === null || present(s.target));
}

const KEY = (role: TourRole) => `taleward.tour.${role}`;

export function tourSeen(role: TourRole): boolean {
  try { return localStorage.getItem(KEY(role)) === '1'; } catch { return true; }
}

export function markTourSeen(role: TourRole): void {
  try { localStorage.setItem(KEY(role), '1'); } catch { /* dann eben beim nächsten Mal wieder */ }
}

/** „Tour noch einmal zeigen“: beim nächsten Öffnen einer Kampagne startet sie wieder */
export function resetTour(): void {
  try {
    localStorage.removeItem(KEY('player'));
    localStorage.removeItem(KEY('gm'));
  } catch { /* egal */ }
}
