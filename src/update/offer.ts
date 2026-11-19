import { safeLink } from '../api/safeUrl.ts';

/**
 * Angebot eines Servers für die APK-Fassung nur annehmen, wenn Adresse und Prüfsumme taugen: https (http nur im
 * Heimnetz) und SHA-256 als 64 Hex-Zeichen. Ohne Prüfsumme kein Selbst-Update – Paketname und Signatur prüft danach
 * zusätzlich der native Teil vor dem Installationsdialog.
 */
export function usableOffer(offer: { url: string | null | undefined; sha256?: string | null }): { url: string; sha256: string } | null {
  const url = safeLink(offer.url ?? null);
  const sha = (offer.sha256 ?? '').trim().toLowerCase();
  if (!url || !/^[0-9a-f]{64}$/.test(sha)) return null;
  return { url, sha256: sha };
}

/** Offizielle Bezugsquelle der APK-Fassung (Website), neben jedem Angebot eines Servers */
export function officialDownloadUrl(lang: string): string {
  return lang === 'en' ? 'https://taleward.org/en/' : 'https://taleward.org/';
}
