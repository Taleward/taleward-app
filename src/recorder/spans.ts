/*
 * Zeiten, in denen wirklich aufgenommen wurde (ab Schnittstelle 0.4.28). Der Server rechnet damit gemerkte Stellen
 * („Merken“ der Spielenden, Uhrzeit ihres Handys) in eine Zeit der Aufnahme um. Gespeichert je Runde im Gerät, bis
 * die Aufnahme hochgeladen ist. Pausen, die die App nicht mitbekommt (z. B. aus der Benachrichtigung), fallen beim
 * Abgleich mit der Länge der Aufnahme auf – dann schicken wir lieber nichts als falsche Zeiten.
 */

interface Span { s: string; e: string | null }

const KEY = 'taleward.spans';
/** So viel Abweichung zur gemessenen Länge nehmen wir hin */
const TOLERANCE_MS = 60_000;

function load(): Record<string, Span[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function save(all: Record<string, Span[]>): void {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ohne Speicher eben ohne Zeiten */ }
}

export function spanOpen(sessionId: string, now = new Date()): void {
  const all = load();
  const list = all[sessionId] ?? [];
  if (list.length && list[list.length - 1].e === null) return;
  all[sessionId] = [...list, { s: now.toISOString(), e: null }].slice(-500);
  save(all);
}

export function spanClose(sessionId: string, now = new Date()): void {
  const all = load();
  const list = all[sessionId];
  if (!list?.length || list[list.length - 1].e !== null) return;
  list[list.length - 1].e = now.toISOString();
  save(all);
}

/**
 * Spannen für den Upload. Offene Spanne gilt bis jetzt. Mit elapsedMs (gemessene Länge der Aufnahme) wird geprüft,
 * ob die Spannen dazu passen; sonst undefined.
 */
export function spansFor(sessionId: string, elapsedMs?: number, now = new Date()): { startedAt: string; endedAt: string }[] | undefined {
  const list = load()[sessionId];
  if (!list?.length) return undefined;
  const out = list.map((x) => ({ startedAt: x.s, endedAt: x.e ?? now.toISOString() }))
    .filter((x) => Date.parse(x.endedAt) > Date.parse(x.startedAt));
  if (!out.length) return undefined;
  if (elapsedMs != null) {
    const sum = out.reduce((n, x) => n + Date.parse(x.endedAt) - Date.parse(x.startedAt), 0);
    if (Math.abs(sum - elapsedMs) > TOLERANCE_MS) return undefined;
  }
  return out;
}

export function clearSpans(sessionId: string): void {
  const all = load();
  if (!(sessionId in all)) return;
  delete all[sessionId];
  save(all);
}
