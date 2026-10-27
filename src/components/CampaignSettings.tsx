import { useCallback, useEffect, useState } from 'react';
import { api, fetchServerInfo, isApiError } from '../api/client';
import { apiAtLeast, type Connection } from '../api/connections';
import type { Campaign, CampaignSettings, CampaignSettingsIn, CampaignSettingsLogEntry, ServerInfo, SettingField } from '../api/types';
import { providerLabel } from './CloudNotice';
import { isDeletedMember } from '../api/types';
import { formatDate } from './format';
import { t, tk } from '../i18n';

/*
 * Kampagnen-Einstellungen an einem Ort (Schnittstelle 0.4.25): Lesen und Ändern über …/settings mit Fassungsnummer,
 * damit zwei Geräte sich nicht still überschreiben; Vorgaben des Betreibers (locks); Protokoll. Ältere Server: wie
 * bisher über PATCH /campaigns/{id}.
 */

export interface SettingsState {
  values: Record<SettingField, boolean>;
  /** null = frei; operator = vom Betreiber festgelegt; unavailable = gibt es auf diesem Server nicht */
  lock: (field: SettingField) => 'operator' | 'unavailable' | null;
  change: (field: SettingField, value: boolean) => Promise<void>;
  /** Jemand anderes hat inzwischen geändert – der neue Stand ist geladen */
  conflict: boolean;
  /** Protokoll vorhanden (ab 0.4.25) */
  hasLog: boolean;
}

export function useCampaignSettings(campaign: Campaign, onChanged: () => void): SettingsState {
  const modern = apiAtLeast('0.4.25');
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (!modern) return;
    api.campaignSettings(campaign.id).then(setSettings).catch(() => setSettings(null));
  }, [campaign.id, campaign.settingsVersion, modern]);

  const values: Record<SettingField, boolean> = settings
    ? { allowCloudSummary: settings.allowCloudSummary, allowExternalTranscription: settings.allowExternalTranscription, allowCharacterAnalysis: settings.allowCharacterAnalysis }
    : { allowCloudSummary: !!campaign.allowCloudSummary, allowExternalTranscription: !!campaign.allowExternalTranscription, allowCharacterAnalysis: !!campaign.allowCharacterAnalysis };

  const lock = (field: SettingField) => {
    const l = settings?.locks.find((x) => x.field === field);
    if (!l) return null;
    return l.reason === 'unavailable' ? 'unavailable' : 'operator';
  };

  const change = useCallback(async (field: SettingField, value: boolean) => {
    setConflict(false);
    if (!modern || !settings) {
      await api.updateCampaign(campaign.id, { [field]: value });
      onChanged();
      return;
    }
    try {
      setSettings(await api.updateCampaignSettings(campaign.id, settings.version, { [field]: value }));
      onChanged();
    } catch (e) {
      if (isApiError(e, 'settings_conflict')) {
        const current = (e.details as { current?: CampaignSettings } | undefined)?.current;
        if (current) setSettings(current);
        else api.campaignSettings(campaign.id).then(setSettings).catch(() => undefined);
        setConflict(true);
        onChanged();
        return;
      }
      throw e;
    }
  }, [campaign.id, modern, settings, onChanged]);

  return { values, lock, change, conflict, hasLog: modern && !!settings };
}

const FIELDS: Record<string, string> = {
  allowCloudSummary: tk('Zusammenfassung über die Cloud'),
  allowExternalTranscription: tk('Transkription über die Cloud'),
  allowCharacterAnalysis: tk('Charakterbögen auswerten')
};

/** Wer hat wann was geändert (nur SL, ab 0.4.25) */
export function SettingsLog({ campaign }: { campaign: Campaign }) {
  const [log, setLog] = useState<CampaignSettingsLogEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !log) api.campaignSettingsLog(campaign.id).then(setLog).catch(() => setLog([]));
  }, [open, log, campaign.id]);
  const who = (e: CampaignSettingsLogEntry) => {
    if (e.byOperator) return t('Betreiber');
    const m = campaign.members.find((x) => x.id === e.byMemberId);
    return m && !isDeletedMember(m) ? m.displayName : t('Unbekannt');
  };
  const value = (v: boolean | number | null) => (v === true ? t('an') : v === false ? t('aus') : v === null ? '–' : String(v));
  return (
    <details className="more" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="small">{t('Änderungen der Einstellungen')}</summary>
      {open && !log && <span className="muted small">{t('Wird geladen …')}</span>}
      {log && log.length === 0 && <span className="muted small">{t('Noch nichts geändert.')}</span>}
      {log && log.length > 0 && (
        <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {log.map((e, i) => (
            <li key={i}>
              {formatDate(e.at)} · {who(e)}: {FIELDS[e.field] ? t(FIELDS[e.field]) : e.field} {value(e.oldValue)} → {value(e.newValue)}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Hinweis bei Vorgabe des Betreibers */
export function LockNote({ lock }: { lock: 'operator' | 'unavailable' | null }) {
  if (lock !== 'operator') return null;
  return <span className="muted small">{t('Vom Betreiber des Servers festgelegt.')}</span>;
}

/**
 * Drei kurze Fragen beim Anlegen (ab 0.4.25), eingeklappt und freiwillig. Geschickt wird nur, was die SL ändert;
 * sonst gilt die Voreinstellung des Servers (bei „Nur Cloud“ ist die Cloud dort schon an).
 */
export function StartSettings({ conn, value, onChange }: {
  conn: Connection; value: CampaignSettingsIn; onChange: (v: CampaignSettingsIn) => void;
}) {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    fetchServerInfo(conn.baseUrl).then(setInfo).catch(() => setInfo(null));
  }, [conn.baseUrl]);
  if (!apiAtLeast('0.4.25', conn) || !info) return null;
  const cloudOnly = info.externalTranscriptionMode === 'primary';
  const shown = (field: SettingField, fallback: boolean) => value[field] ?? fallback;
  const set = (field: SettingField, v: boolean) => onChange({ ...value, [field]: v });
  const summary = providerLabel(info.cloudSummary, info.cloudSummaryInfo);
  const external = providerLabel(info.externalTranscription, info.externalTranscriptionInfo);
  return (
    <details className="more">
      <summary>{t('Einstellungen (freiwillig, später änderbar)')}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {summary && (
          <label className="check" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={shown('allowCloudSummary', cloudOnly)} onChange={(e) => set('allowCloudSummary', e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
            <span>{t('Kapitel über {provider} schreiben lassen', { provider: summary })}</span>
          </label>
        )}
        {external && (
          <label className="check" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={shown('allowExternalTranscription', cloudOnly)} onChange={(e) => set('allowExternalTranscription', e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
            <span>{cloudOnly ? t('Abschrift über {provider}', { provider: external }) : t('Abschrift über {provider} als Ausweichlösung', { provider: external })}</span>
          </label>
        )}
        <label className="check" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={shown('allowCharacterAnalysis', false)} onChange={(e) => set('allowCharacterAnalysis', e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
          <span>{t('Charakterbögen und Hintergründe auswerten lassen (du stimmst jeder Auswertung zu)')}</span>
        </label>
        {(summary || external) && <span className="muted small">{t('Was in die Cloud geht, sehen alle am Tisch. Sag es vorher in der Runde.')}</span>}
      </div>
    </details>
  );
}
