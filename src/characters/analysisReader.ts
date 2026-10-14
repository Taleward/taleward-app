/*
 * Wer liest einen Charakterbogen bzw. Hintergrund (Schnittstelle 0.4.18)? Ohne Laufzeit-Importe
 * (Test: scripts/tests/analysis-reader.test.mjs). Ohne Angaben des Servers wird nie „lokal“ behauptet, solange die
 * Kampagne die Cloud erlaubt.
 */
export type AnalysisReader = 'cloud' | 'local' | 'maybe_cloud';

export function analysisReader(opts: {
  /** Aus der Auswertung selbst (CharacterAnalysis.usesCloud), falls schon angelegt */
  usesCloud?: boolean;
  allowCloudSummary: boolean;
  /** Angaben des Servers (/info) geladen? */
  infoKnown: boolean;
  /** Server hat eine Cloud-API für Zusammenfassungen eingerichtet */
  serverHasCloud: boolean;
}): AnalysisReader {
  if (opts.usesCloud !== undefined) return opts.usesCloud ? 'cloud' : 'local';
  if (!opts.allowCloudSummary) return 'local';
  if (!opts.infoKnown) return 'maybe_cloud';
  return opts.serverHasCloud ? 'cloud' : 'local';
}
