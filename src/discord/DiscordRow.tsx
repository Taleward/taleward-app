import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { currentConnection, p } from '../api/connections';
import type { Campaign, DiscordConnection } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { formatDate } from '../components/format';
import { ErrorBox } from '../components/Screen';
import { t } from '../i18n';

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
      {conn && pause !== undefined && (
        <label className="list-row check-row">
          <input type="checkbox" checked={pause} disabled={busy} onChange={(e) => onPause(e.target.checked)} />
          <span className="lr-text">{t('Aufnahme anhalten, wenn jemand ohne Zustimmung dazukommt')}
            <span className="lr-sub">{t('Wer nicht zugestimmt hat, wird ohnehin nie aufgenommen.')}</span>
          </span>
        </label>
      )}
    </>
  );
}
