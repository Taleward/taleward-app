/**
 * Schriftgröße des Handys → Faktor für die Oberfläche (CSS-Variable --ts). Ohne Laufzeit-Importe, damit es sich testen
 * lässt (scripts/tests/text-scale.test.mjs).
 *
 * Android bietet je nach Gerät etwa 0,85 bis 2,0. Nach oben bei 1,6 begrenzt: Darüber passen Knöpfe, Kopfzeile und
 * SL-Schirm auf einem Handy nicht mehr sinnvoll nebeneinander. Kleiner als 0,85 gibt es nicht.
 */
export const MIN_SCALE = 0.85;
export const MAX_SCALE = 1.6;

export function clampScale(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) * 100) / 100;
}
