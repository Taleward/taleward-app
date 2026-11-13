import { t } from '../i18n';

/**
 * Fehler beim Öffnen des Mikrofons in eigene Worte fassen – der Browser liefert sonst englische Sätze wie
 * „Requested device not found“. Unbekannte Fehler bleiben, wie sie sind.
 */
export function micError(e: unknown): unknown {
  const name = (e as { name?: string })?.name ?? (e as { code?: string })?.code;
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return new Error(t('Kein Mikrofon gefunden. Schließ eins an oder nimm ein anderes Gerät.'));
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return new Error(t('Das Mikrofon ist gerade belegt. Beende andere Programme, die es nutzen, und versuch es noch einmal.'));
  }
  return e;
}
