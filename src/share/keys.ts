/** Signierschlüssel aus /info säubern (ab 0.4.30): höchstens 4, Kennung und SPKI nur base64url. Ohne Laufzeit-Importe. */
export function cleanShareKeys(keys: unknown): { id: string; spki: string }[] {
  if (!Array.isArray(keys)) return [];
  return keys
    .filter((k): k is { id: string; spki: string } => typeof k === 'object' && k !== null
      && typeof (k as { id?: unknown }).id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test((k as { id: string }).id)
      && typeof (k as { spki?: unknown }).spki === 'string' && /^[A-Za-z0-9_-]{40,400}$/.test((k as { spki: string }).spki))
    .slice(0, 4)
    .map((k) => ({ id: k.id, spki: k.spki }));
}
