/**
 * Leseeinstellungen fürs Kapitel (wie das „Aa“ in Lese-Apps): Schriftgröße und Seite. Wirken nur auf den
 * Kapiteltext, nicht auf die übrige App. Je Gerät gemerkt, ohne Netz nutzbar. Ohne Laufzeit-Importe (Test).
 */
export type ReadSize = 'normal' | 'large' | 'larger';
export type ReadPage = 'app' | 'light' | 'dark';
export interface ReadPrefs { size: ReadSize; page: ReadPage }

export const READ_KEY = 'taleward.lesen';
export const DEFAULT_READ: ReadPrefs = { size: 'normal', page: 'app' };

const SIZES: ReadSize[] = ['normal', 'large', 'larger'];
const PAGES: ReadPage[] = ['app', 'light', 'dark'];

/** Gespeicherten Text lesen; Unbekanntes fällt auf die Voreinstellung zurück */
export function parseReadPrefs(raw: string | null): ReadPrefs {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return {
      size: SIZES.includes(v?.size) ? v.size : DEFAULT_READ.size,
      page: PAGES.includes(v?.page) ? v.page : DEFAULT_READ.page
    };
  } catch {
    return { ...DEFAULT_READ };
  }
}
