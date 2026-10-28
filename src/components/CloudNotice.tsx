import { IconInfo } from './Icons';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Campaign, CloudProviderInfo, ServerInfo } from '../api/types';
import { locale, t } from '../i18n';

/** „mistral“ → „Mistral“ */
export const providerName = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([locale()], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/**
 * Anbieter so, wie ihn alle am Tisch sehen (ab Schnittstelle 0.4.11 vom Server): kurz „Name (EU)“ bzw. „Name (nicht EU)“,
 * ausführlich mit Land nur unter „Was mit deinen Daten passiert“. Ältere Server liefern nur den Namen.
 */
export function providerLabel(id: string | null | undefined, info?: CloudProviderInfo | null, long = false): string | null {
  if (info) {
    if (!long) return `${info.name} (${info.region === 'eu' ? t('EU') : t('nicht EU')})`;
    const where = [countryName(info.country), info.region === 'eu' ? t('EU') : t('außerhalb der EU')].filter(Boolean).join(', ');
    return `${info.name} (${where})`;
  }
  return id ? providerName(id) : null;
}

/** Server-Info einmal pro Seite holen (Cloud-Dienste, Betriebsart) */
export function useServerInfo(): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    api.info().then(setInfo).catch(() => setInfo(null));
  }, []);
  return info;
}

/** Welche Cloud-Dienste diese Kampagne gerade nutzt – für alle am Tisch sichtbar */
export function cloudUse(info: ServerInfo | null, campaign: Campaign, long = false) {
  const transcription = info?.externalTranscription && campaign.allowExternalTranscription
    ? { provider: providerLabel(info.externalTranscription, info.externalTranscriptionInfo, long)!, primary: info.externalTranscriptionMode === 'primary' }
    : null;
  const summary = info?.cloudSummary && campaign.allowCloudSummary
    ? { provider: providerLabel(info.cloudSummary, info.cloudSummaryInfo, long)! }
    : null;
  return { transcription, summary };
}

/** Kasten auf der Übersicht: klar zeigen, ob Stimmen oder Text den Verein verlassen */
export function CloudNotice({ info, campaign, onOpen }: { info: ServerInfo | null; campaign: Campaign; onOpen: () => void }) {
  const { transcription, summary } = cloudUse(info, campaign);
  if (!transcription && !summary) return null;
  // Eine Zeile statt eigener Karte: Sichtbar für alle bleibt sie, die Einzelheiten stehen
  // unter „Was mit deinen Daten passiert“.
  const providers = [...new Set([transcription?.provider, summary?.provider].filter((x): x is string => !!x))].join(', ');
  return (
    <button type="button" className="notice cloud-line" onClick={onOpen}>
      <span aria-hidden="true" style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
      <span style={{ flex: 1 }}>{t('Cloud aktiv · {provider}', { provider: providers })}</span>
      <span aria-hidden="true" style={{ color: 'var(--ink-faint)' }}>›</span>
    </button>
  );
}
