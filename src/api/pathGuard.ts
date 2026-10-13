/*
 * Kennungen in Pfaden (Schnittstelle 0.4.14): nur Buchstaben, Ziffern, „-“ und „_“, höchstens 64 Zeichen. Pfade baut
 * die App nur aus solchen Teilen. Ohne Laufzeit-Importe (Test: scripts/tests/path-guard.test.mjs).
 */

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Ist das eine gültige Kennung? */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/**
 * Ist der Pfad aus lauter harmlosen Teilen gebaut? Erlaubt sind Buchstaben, Ziffern, „-“, „_“ und „.“ (nicht allein).
 * Eine Abfrage nach „?“ enthält kein „/“, kein zweites „?“ und kein „#“.
 */
export function isSafePath(path: string): boolean {
  const q = path.indexOf('?');
  const pathOnly = q < 0 ? path : path.slice(0, q);
  const query = q < 0 ? '' : path.slice(q + 1);
  if (/[/?#]/.test(query)) return false;
  if (!pathOnly.startsWith('/')) return false;
  return pathOnly.slice(1).split('/').every((seg) => /^[A-Za-z0-9_.-]+$/.test(seg) && seg !== '.' && seg !== '..');
}

/** Pfad innerhalb der App (z. B. aus einer Benachrichtigung): nur /v/… aus gültigen Kennungen, ohne Abfrage. */
export function isSafeAppPath(path: string): boolean {
  if (!path.startsWith('/v/')) return false;
  return path.slice(1).split('/').every((seg) => isSafeId(seg));
}

/** Sind alle Routen-Parameter gültige Kennungen? */
export function allSafeIds(params: Record<string, string | undefined>): boolean {
  return Object.values(params).every((v) => v === undefined || isSafeId(v));
}
