import { currentConnection, p } from '../api/connections';
import { formatDate, formatDateFull } from '../components/format';
import { t, tk } from '../i18n';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fillReadCopy, isApiError } from '../api/client';
import type { Campaign, Recap, SessionSummary } from '../api/types';
import { OpenThreads, RecapView } from '../components/RecapView';
import { ErrorBox, Screen, clearStoredUnread, rememberCampaign, sessionStorageSet } from '../components/Screen';

export const PENDING_LABEL: Partial<Record<SessionSummary['state'], string>> = {
  created: tk('Noch keine Aufnahme'),
  uploading: tk('Upload läuft'),
  queued: tk('Wartet auf den Server'),
  transcribing: tk('Wird transkribiert'),
  awaiting_speakers: tk('Stimmen zuordnen'),
  summarizing: tk('Wird zusammengefasst'),
  awaiting_review: tk('Wartet auf deine Prüfung'),
  failed: tk('Fehlgeschlagen')
};

export function Chronicle() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [latest, setLatest] = useState<Recap | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    sessionStorageSet('lastCampaign', campaignId);
    setLatest(null);
    (async () => {
      try {
        const [c, s] = await Promise.all([api.campaign(campaignId), api.sessions(campaignId)]);
        setCampaign(c);
        rememberCampaign(c);
        setSessions(s);
        // Chronik geöffnet: neue Recaps gelten als gesehen (Fehler dabei sind unwichtig)
        if (c.unread?.recaps) {
          api.markSeen(campaignId, 'chronicle').then(() => clearStoredUnread(campaignId, 'recaps')).catch(() => undefined);
        }
        // Für unterwegs: veröffentlichte Kapitel im Hintergrund auf das Gerät holen (nur was noch fehlt)
        const conn = currentConnection();
        window.setTimeout(() => fillReadCopy(conn, s.filter((x) => x.state === 'published').map((x) => x.id)).catch(() => undefined), 1500);
        const newest = s.find((x) => x.state === 'published');
        if (newest) {
          // 404: Recap (noch) nicht vorhanden – dann eben ohne hervorgehobenen Recap
          try {
            setLatest(await api.recap(newest.id));
          } catch (e) {
            if (!isApiError(e) || e.status !== 404) throw e;
          }
        }
      } catch (e) {
        setError(e);
      }
    })();
  }, [campaignId]);

  const unreadOf = (id: string) => sessions?.find((x) => x.id === id)?.unreadComments ?? 0;
  const pending = sessions?.filter((s) => s.state !== 'published') ?? [];
  const earlier = sessions?.filter((s) => s.state === 'published' && s.id !== latest?.sessionId) ?? [];

  return (
    <Screen overline={campaign?.title ?? ' '} title={t('Chronik')} hero={{ campaign }}>
      <ErrorBox error={error} />

      {pending.map((s) => (
        <Link key={s.id} to={p(`/s/${s.id}`)} className={['awaiting_speakers', 'awaiting_review', 'failed'].includes(s.state) ? 'card warn' : 'card'}>
          <div className="row between">
            <strong>{t('Kapitel {n}', { n: s.number })}</strong>
            <span className={['awaiting_speakers', 'awaiting_review', 'failed'].includes(s.state) ? 'pill seal' : 'pill'}>{PENDING_LABEL[s.state] ? t(PENDING_LABEL[s.state]!) : s.state}</span>
          </div>
          <span className="muted small">{t('Gespielt am {date}', { date: formatDateFull(s.playedAt) })}</span>
        </Link>
      ))}

      {sessions && sessions.length === 0 && (
        <div className="empty">
          {t('Noch keine Kapitel.')}{' '}
          {campaign?.myRole === 'gm' ? t('Nimm die erste Runde auf, dann erscheint hier das Kapitel.') : t('Sobald die Spielleitung ein Kapitel veröffentlicht, steht es hier.')}
        </div>
      )}

      <div className="split">
      {latest && (
        <div className="a">
          <RecapView recap={latest} collapsible playedAt={sessions?.find((s) => s.id === latest.sessionId)?.playedAt} />
          <OpenThreads threads={latest.openThreads} />
          <Link to={p(`/s/${latest.sessionId}/recap`)} className="btn outline small" style={{ alignSelf: 'flex-start' }}>
            {t('Kommentare zu Kapitel {n}', { n: latest.number })}
            {!!unreadOf(latest.sessionId) && <span className="pill seal">{t('{n} neu', { n: unreadOf(latest.sessionId) })}</span>}
          </Link>
        </div>
      )}

      {earlier.length > 0 && (
        <section className="b" style={{ gap: 8 }}>
          <h2>{t('Frühere Kapitel')}</h2>
          {earlier.map((s) => (
            <Link key={s.id} to={p(`/s/${s.id}/recap`)} className="chapter-card">
              <span className="num" aria-hidden>{s.number}</span>
              <span className="title">{s.title ?? t('Kapitel {n}', { n: s.number })}</span>
              <span className="meta">
                <span>{t('Kapitel {n}', { n: s.number })} · {t('Gespielt am {date}', { date: formatDate(s.playedAt, 'long') })}</span>
                {!!s.unreadComments && <span className="pill seal">{t('{n} neu', { n: s.unreadComments })}</span>}
              </span>
              {!!s.unreadComments && <span className="dot" aria-label={t('Neue Kommentare')} />}
            </Link>
          ))}
        </section>
      )}
      </div>

    </Screen>
  );
}
