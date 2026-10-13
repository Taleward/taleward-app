/*
 * Rückkehr vom Anmeldedienst auswerten. Ohne Laufzeit-Importe (Test: scripts/tests/auth-return.test.mjs).
 * Ein Ticket zählt nur, wenn diese App den Vorgang selbst begonnen hat und er nicht zu alt ist.
 */

export const PENDING_MAX_AGE_MS = 15 * 60_000;

export type AuthReturn =
  | { kind: 'discard' }
  | { kind: 'error'; code: string }
  | { kind: 'ticket'; ticket: string };

export function readAuthReturn(url: string, pending: { at?: unknown } | null, now: number): AuthReturn {
  if (!pending || typeof pending.at !== 'number' || !(now - pending.at <= PENDING_MAX_AGE_MS) || pending.at > now) {
    return { kind: 'discard' };
  }
  const params = new URLSearchParams(url.split('?')[1] ?? '');
  const error = params.get('error');
  const ticket = params.get('ticket');
  if (error || !ticket) return { kind: 'error', code: error ?? 'oidc_failed' };
  return { kind: 'ticket', ticket };
}
