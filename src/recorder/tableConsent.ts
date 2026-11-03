/*
 * Zustimmungen am Tisch (vor Ort, für diese Runde) und Gäste überstehen einen Seitenwechsel am selben Abend: gemerkt je
 * Verbindung und Kampagne, höchstens 12 Stunden. Ohne Laufzeit-Importe (Test: scripts/tests/table-consent.test.mjs).
 */
export interface TableConsent { onSite: Record<string, string>; guests: { name: string; consentAt: string }[] }
const MAX_MS = 12 * 3600_000;
const key = (connId: string, campaignId: string) => `taleward.tableConsent.${connId}.${campaignId}`;

export function loadTableConsent(connId: string, campaignId: string, now = Date.now()): TableConsent {
  const empty: TableConsent = { onSite: {}, guests: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(key(connId, campaignId)) ?? 'null');
    if (!raw || typeof raw !== 'object' || typeof raw.savedAt !== 'number' || now - raw.savedAt > MAX_MS) return empty;
    const fresh = (at: unknown) => typeof at === 'string' && now - Date.parse(at) <= MAX_MS;
    const onSite = Object.fromEntries(Object.entries(raw.onSite ?? {}).filter(([, at]) => fresh(at))) as Record<string, string>;
    const guests = Array.isArray(raw.guests)
      ? raw.guests.filter((g: unknown): g is { name: string; consentAt: string } =>
        !!g && typeof (g as { name?: unknown }).name === 'string' && fresh((g as { consentAt?: unknown }).consentAt))
      : [];
    return { onSite, guests };
  } catch {
    return empty;
  }
}

export function saveTableConsent(connId: string, campaignId: string, c: TableConsent, now = Date.now()): void {
  try {
    if (!Object.keys(c.onSite).length && !c.guests.length) localStorage.removeItem(key(connId, campaignId));
    else localStorage.setItem(key(connId, campaignId), JSON.stringify({ savedAt: now, ...c }));
  } catch { /* dann eben nur bis zum Seitenwechsel */ }
}

/** Nach dem Hochladen oder Verwerfen: die Runde ist vorbei */
export function clearTableConsent(connId: string, campaignId: string): void {
  try { localStorage.removeItem(key(connId, campaignId)); } catch { /* egal */ }
}
