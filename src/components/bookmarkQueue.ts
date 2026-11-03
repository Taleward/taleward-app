/*
 * Liegengebliebene Merkstellen (ohne Netz gemerkt). Jeder Eintrag gehört zu genau einer Verbindung und einem Konto und
 * geht nur an diesen Server. Ohne Laufzeit-Importe (Test: scripts/tests/bookmark-queue.test.mjs).
 */
export interface QueuedBookmark { connId: string; account: string; sessionId: string; at: string; note: string | null }
export const QUEUE_KEY = 'taleward.bookmarkQueue';

export function loadQueue(): QueuedBookmark[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    // Einträge ohne Verbindung (ältere Fassung) fallen weg – sie wären keinem Server sicher zuzuordnen
    return Array.isArray(raw) ? raw.filter((b) => b && typeof b.connId === 'string' && typeof b.account === 'string' && typeof b.sessionId === 'string') : [];
  } catch {
    return [];
  }
}

export function saveQueue(q: QueuedBookmark[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200))); } catch { /* dann geht es eben verloren */ }
}

/** Beim Abmelden bzw. Entfernen einer Verbindung deren Einträge löschen */
export function dropQueueOf(connId: string): void {
  const q = loadQueue();
  const rest = q.filter((b) => b.connId !== connId);
  if (rest.length !== q.length) saveQueue(rest);
}

/** Welche Einträge an diese Verbindung mit diesem Konto gehen dürfen */
export function queueFor(q: QueuedBookmark[], connId: string, account: string | null): QueuedBookmark[] {
  return account ? q.filter((b) => b.connId === connId && b.account === account) : [];
}
