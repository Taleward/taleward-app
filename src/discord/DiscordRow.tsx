import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { apiAtLeast, currentConnection, p } from '../api/connections';
import type { Campaign, DiscordConnection, DiscordLogEntry } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { formatDate, formatDateTime } from '../components/format';
import { ErrorBox } from '../components/Screen';
import { t, tk } from '../i18n';

/** Server bietet den Discord-Bot an (ServerInfo.discordBot, ab 0.4.32) */
export function serverHasDiscordBot(): boolean {
  try { return currentConnection().discordBot === true; } catch { return false; }
}

/**
 * „Kampagne verwalten“ → Discord (nur SL, nur wenn der Server den Bot anbietet): verbundener Discord-Server mit
 * „Lösen“, sonst „Verbinden“; dazu die Einstellung „Aufnahme anhalten, wenn jemand ohne Zustimmung dazukommt“.
 */
export function DiscordRow({ campaign, pause, busy, onPause }: {
  campaign: Campaign;
  /** CampaignSettings.discordPauseOnUnconsented; undefined = Server kennt sie nicht */
  pause?: boolean;
  busy: boolean;
  onPause: (value: boolean) => void;
}) {
  const [conn, setConn] = useState<DiscordConnection | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    api.campaignDiscord(campaign.id).then((r) => setConn(r.connection)).catch((e) => { setConn(null); setError(e); });
  }, [campaign.id]);

  const unlink = async () => {
    if (!conn) return;
    const ok = await confirmDialog(t('Die Verbindung von „{title}“ auf „{server}“ zum Discord-Server „{guild}“ lösen? Eine laufende Aufnahme im Discord endet dann.',
      { title: campaign.title, server: currentConnection().name, guild: conn.guildName }), { confirmLabel: t('Lösen'), danger: true });
    if (!ok) return;
    setWorking(true);
    setError(null);
    try { await api.unlinkDiscord(campaign.id); setConn(null); } catch (e) { setError(e); } finally { setWorking(false); }
  };

  if (conn === undefined) return null;
  return (
    <>
      <ErrorBox error={error} />
      {conn ? (
        <div className="list-row" style={{ display: 'grid', gap: 2 }}>
          <span className="lr-text">{t('Discord')}
            <span className="lr-sub">{t('Verbunden mit „{guild}“ seit {date}', { guild: conn.guildName, date: formatDate(conn.connectedAt, 'short') })}</span>
          </span>
          <span><button type="button" className="quiet-link small" disabled={working} onClick={unlink}>{t('Verbindung lösen')}</button></span>
        </div>
      ) : (
        <Link className="list-row nav" to={p('/discord-verbinden')}>
          <span className="lr-text">{t('Mit Discord verbinden')}<span className="lr-sub">{t('Runden im Sprachkanal aufnehmen')}</span></span>
        </Link>
      )}
      {apiAtLeast('0.4.33') && <DiscordLog campaignId={campaign.id} />}
      {conn && pause !== undefined && (
        <label className="list-row check-row">
          <input type="checkbox" checked={pause} disabled={busy} onChange={(e) => onPause(e.target.checked)} />
          <span className="lr-text">{t('Aufnahme anhalten, wenn jemand ohne Zustimmung dazukommt')}</span>
        </label>
      )}
    </>
  );
}

const KIND: Record<string, string> = {
  connected: tk('Mit Discord verbunden'),
  disconnected: tk('Verbindung gelöst'),
  disconnected_auto: tk('Verbindung vom Server gelöst'),
  replaced: tk('Mit anderem Discord-Server verbunden'),
  recording_started: tk('Aufnahme gestartet'),
  recording_stopped: tk('Aufnahme beendet'),
  recording_discarded: tk('Aufnahme verworfen'),
  track_discarded: tk('Eine Spur verworfen'),
  track_revoked: tk('Zustimmung während der Aufnahme zurückgenommen'),
  consent_member: tk('Zugestimmt (Mitglied)'),
  consent_guest: tk('Zugestimmt (Gast)')
};

/** Verlauf (ab 0.4.33), lädt erst beim Aufklappen. Ohne Namen, nur Zeitpunkt und Art. */
function DiscordLog({ campaignId }: { campaignId: string }) {
  const [entries, setEntries] = useState<DiscordLogEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = () => { if (entries === null) api.discordLog(campaignId).then((r) => setEntries(r.entries)).catch(setError); };
  return (
    <details className="list-item" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) load(); }}>
      <summary className="list-row"><span className="lr-text">{t('Verlauf')}</span></summary>
      <div className="list-body">
        <ErrorBox error={error} />
        {entries && entries.length === 0 && <span className="muted small">{t('Noch nichts passiert.')}</span>}
        {entries && entries.length > 0 && (
          <ul className="small" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {entries.map((x, i) => (
              <li key={i}>
                <span className="muted">{formatDateTime(x.at)}</span>{' · '}
                {x.sessionId
                  ? <Link to={p(`/s/${x.sessionId}`)}>{t(KIND[x.kind] ?? 'Discord')}</Link>
                  : t(KIND[x.kind] ?? 'Discord')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
