/**
 * Adressen, die ein Server mitschickt (Datenschutzerklärung, App-Download), nur als Link verwenden, wenn sie mit
 * https:// beginnen – im Heimnetz auch http://. Alles andere (javascript:, data: …) wird verworfen.
 */
export function safeLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** Server-Info mit geprüften Adressen */
export function withSafeLinks<T extends { privacyPolicyUrl?: string | null; appDownloadUrl?: string | null; legalNoticeUrl?: string | null; termsUrl?: string | null }>(info: T): T {
  return {
    ...info,
    privacyPolicyUrl: safeLink(info.privacyPolicyUrl),
    ...('appDownloadUrl' in info ? { appDownloadUrl: safeLink(info.appDownloadUrl) } : {}),
    // Impressum und Nutzungsbedingungen (ab 0.4.22)
    ...('legalNoticeUrl' in info ? { legalNoticeUrl: safeLink(info.legalNoticeUrl) } : {}),
    ...('termsUrl' in info ? { termsUrl: safeLink(info.termsUrl) } : {})
  };
}
