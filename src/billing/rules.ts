/*
 * Guthaben in der App (Schnittstelle 0.4.25) – Regeln ohne Laufzeit-Importe (Test: scripts/tests/billing.test.mjs).
 *
 * Bezahlt wird nie in der App. Store-Fassung: kein Link, kein Knopf und keine Preise zum Aufladen, Gutscheine vorerst
 * auch nicht (Prüfung der Store-Regeln vor dem Scharfschalten). Fassung von der Website und Web-App: Knopf „Guthaben
 * aufladen“ öffnet die Aufladeseite des Servers im Browser – nur wenn sie auf demselben Server liegt wie die Verbindung.
 */

export type Dist = 'apk' | 'store' | 'web';

export interface BillingInfo {
  billing?: { mode?: string; currency?: string; topUpUrl?: string | null } | null;
}

/** Rechnet der Server mit Guthaben ab? Fehlt die Angabe (ältere Server) oder ist sie null: nein */
export function billingOn(info: BillingInfo | null | undefined): boolean {
  return !!info?.billing && (info.billing.mode === 'credit' || info.billing.mode === 'pot');
}

function origin(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Adresse für „Guthaben aufladen“ oder null. Nie in der Store-Fassung, nur über https (http nur, wenn auch die
 * Verbindung http ist, z. B. im Heimnetz) und nur auf demselben Server wie die Verbindung.
 */
export function topUpUrl(info: BillingInfo | null | undefined, connBaseUrl: string, dist: Dist): string | null {
  if (dist === 'store' || !billingOn(info)) return null;
  const url = info?.billing?.topUpUrl;
  if (!url) return null;
  const a = origin(url);
  const b = origin(connBaseUrl);
  if (!a || !b || a !== b) return null;
  return url;
}

/** Gutschein einlösen: vorerst nicht in der Store-Fassung */
export const vouchersAllowed = (dist: Dist): boolean => dist !== 'store';

export type WaitReason = 'approval' | 'empty' | 'too_low' | 'no_payer' | 'pot' | 'other';

/** Bekannte Wartegründe; unbekannte (neuere Server) als „other“ */
export function waitReason(reason: string | null | undefined): WaitReason {
  return reason === 'approval' || reason === 'empty' || reason === 'too_low' || reason === 'no_payer' || reason === 'pot' ? reason : 'other';
}

/** Darf ich hier „Verarbeiten“ tippen? Nur mit Kennungen (die gibt es nur für Berechtigte) und nicht beim Topf */
export function canApprove(wait: { reason: string; creditId?: string | null; jobId?: string | null } | null | undefined): boolean {
  return !!wait && waitReason(wait.reason) === 'approval' && !!wait.creditId && !!wait.jobId;
}

/** Betrag in Euro, z. B. „12,40 €“ bzw. „€12.40“; negative mit Minuszeichen */
export function euro(cents: number, lang: 'de' | 'en'): string {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Eingabe „2“, „2,50“ oder „2.50“ in Cent; ungültig → null */
export function parseEuro(text: string): number | null {
  const s = text.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
