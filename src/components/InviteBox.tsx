import { IconPlus } from './Icons';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import { useServerInfo } from './CloudNotice';
import { currentConnection } from '../api/connections';
import { t } from '../i18n';
import { copyText, inviteLink, shareInvite } from '../invite';
import { formatDateFull } from './format';
import { ErrorBox } from './Screen';

/** Mitspielende einladen: fertiger Link zum Teilen, Kopieren oder als QR-Code am Tisch */
/** row: als letzte Zeile in „Am Tisch“ (Übersicht); sonst als eigener Knopf (z. B. beim Übergeben der Spielleitung) */
export function InviteBox({ campaignId, campaignTitle, row }: { campaignId: string; campaignTitle?: string; row?: boolean }) {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string; link: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const info = useServerInfo();

  const create = async () => {
    setError(null);
    try {
      const r = await api.createInvite(campaignId);
      setInvite({ ...r, link: inviteLink(currentConnection(), r.code, (info ?? (await api.info().catch(() => null)))?.publicUrl) });
    } catch (e) {
      setError(e);
    }
  };

  useEffect(() => {
    if (!invite) return;
    // QR in den Farben der App: Tinte auf hellem Grund, damit jede Kamera ihn liest
    QRCode.toString(invite.link, { type: 'svg', margin: 1, color: { dark: '#17313b', light: '#fbf6ea' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [invite]);

  const message = campaignTitle
    ? t('Komm in unsere Runde „{title}“ bei Taleward:', { title: campaignTitle })
    : t('Komm in unsere Runde bei Taleward:');

  if (!invite && row) {
    return (
      <>
        <button type="button" className="row invite-row" onClick={create}>
          <span className="invite-plus" aria-hidden><IconPlus /></span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span>{t('Mitspielende einladen')}</span>
            <span className="muted small">{t('Per Link oder QR-Code')}</span>
          </span>
        </button>
        <ErrorBox error={error} />
      </>
    );
  }

  if (!invite) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ErrorBox error={error} />
        <button type="button" className="btn outline" onClick={create}>{t('Mitspielende einladen')}</button>
      </div>
    );
  }

  return (
    <section className={row ? 'invite-open' : 'card'}>
      {row ? <strong>{t('Einladung')}</strong> : <h2>{t('Einladung')}</h2>}
      <div className="notice" style={{ flexDirection: 'column', gap: 4 }}>
        <span className="small" style={{ wordBreak: 'break-all' }}>{invite.link}</span>
        <span className="muted small">{t('Code {code} · gültig bis {date}', { code: invite.code, date: formatDateFull(invite.expiresAt) })}</span>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small" onClick={async () => { if (!(await shareInvite(t('Einladung zu Taleward'), message, invite.link))) setCopied(true); }}>
          {t('Teilen')}
        </button>
        <button type="button" className="btn small outline" onClick={() => copyText(`${message}\n${invite.link}`).then(() => setCopied(true)).catch(setError)}>
          {copied ? t('Kopiert') : t('Link kopieren')}
        </button>
        {qr && (
          <button type="button" className="btn small outline" onClick={() => setShowQr(!showQr)}>
            {showQr ? t('QR-Code ausblenden') : t('QR-Code zeigen')}
          </button>
        )}
      </div>
      {showQr && qr && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 'min(260px, 70vw)', background: '#fbf6ea', padding: 8, borderRadius: 'var(--radius-md)' }}
            dangerouslySetInnerHTML={{ __html: qr }} />
          <span className="muted small">{t('Mit der Handykamera scannen.')}</span>
        </div>
      )}
      <span className="muted small">{t('Wer die App noch nicht hat, findet auf der Seite hinter dem Link den Download.')}</span>
      <ErrorBox error={error} />
    </section>
  );
}
