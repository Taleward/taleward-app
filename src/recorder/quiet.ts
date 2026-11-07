/**
 * „Hört das Mikrofon etwas?“ – nach 90 s ohne jeden Ton zeigt die Aufnahme einen ruhigen Hinweis (kein Ton, kein
 * Fenster): Mikrofon von einer anderen App belegt, abgedeckt oder abgemeldet. Gleiche Grenze wie im Aufnahmedienst
 * der Android-App (RecorderService.QUIET_AMPLITUDE). Ohne Pegel (Browser ohne Analyse) gibt es keinen Hinweis.
 */
export const QUIET_AFTER_MS = 90_000;
/** Pegel 0–1 (RMS · 4) darunter gilt als nichts gehört */
export const QUIET_LEVEL = 0.01;

export class QuietWatch {
  private heardAt = 0;
  private known = false;

  /** active: läuft gerade (nicht pausiert) */
  sample(level: number | null, now: number, active: boolean): void {
    if (!active || level === null) { this.heardAt = now; this.known = level !== null; return; }
    this.known = true;
    if (level >= QUIET_LEVEL || this.heardAt === 0) this.heardAt = now;
  }

  quietMs(now: number): number {
    return this.known && this.heardAt ? Math.max(0, now - this.heardAt) : 0;
  }
}

export function isTooQuiet(quietMs: number | undefined): boolean {
  return (quietMs ?? 0) >= QUIET_AFTER_MS;
}
