/*
 * Zuletzt geöffnete Kampagne, die man leitet – für die feste Adresse #/schirm (Taleward Desktop öffnet sie im Bereich
 * „SL-Schirm“, ohne die Kampagnen zu kennen). Nur Kennungen, keine Inhalte; geht verloren, wenn der Speicher fehlt.
 */
const KEY = 'taleward.lastTable';

export interface LastTable { conn: string; campaignId: string }

export function parseLastTable(raw: string | null): LastTable | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastTable>;
    const ok = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x);
    return ok(v.conn) && ok(v.campaignId) ? { conn: v.conn, campaignId: v.campaignId } : null;
  } catch {
    return null;
  }
}

export function rememberTable(conn: string, campaignId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ conn, campaignId }));
  } catch {
    /* ohne Speicher eben nicht */
  }
}

export function lastTable(): LastTable | null {
  try {
    return parseLastTable(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
