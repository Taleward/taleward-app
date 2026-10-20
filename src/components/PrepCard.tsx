import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { p } from '../api/connections';
import type { Campaign, Entry, SessionSummary } from '../api/types';
import { locale, t } from '../i18n';
import { lastRoundEntries, needsDate, type PrepWhen } from '../prep/prep';
import { IconLock } from './Icons';

const MAX_THREADS = 5;

/** „Samstag, 19:00“, eine Woche und mehr entfernt „Samstag, 31. Oktober, 19:00“, am Spieltag „Heute, 19:00“ */
function when(iso: string, today: boolean): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (today) return t('Heute, {time}', { time });
  const day = d.toLocaleDateString(locale(), needsDate(iso, new Date()) ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'long' });
  return `${day}, ${time}`;
}

/**
 * Vorbereitung auf die nächste Runde (nur SL), sobald ein Termin steht: offene Fäden des letzten Kapitels, NSC und
 * Orte der letzten Runde, neue Kommentare zu älteren Kapiteln. Nur Bestätigtes, kein Sprachmodell. Offene Vorschläge
 * stehen schon in „Jetzt dran“, neue Kommentare zum letzten Kapitel auf dessen Karte – darum hier nicht noch einmal.
 */
export function PrepCard({ campaign, sessions, phase }: { campaign: Campaign; sessions: SessionSummary[]; phase: Exclude<PrepWhen, 'none'> }) {
  const latest = sessions.find((s) => s.state === 'published') ?? null;
  const [threads, setThreads] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    if (!latest) return;
    let gone = false;
    api.recap(latest.id).then((r) => { if (!gone) setThreads(r.openThreads ?? []); }).catch(() => undefined);
    api.entries(campaign.id).then((list) => { if (!gone) setEntries(lastRoundEntries(list, latest.number)); }).catch(() => undefined);
    return () => { gone = true; };
  }, [campaign.id, latest?.id, latest?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  const older = sessions.filter((s) => s.state === 'published' && s.id !== latest?.id && (s.unreadComments ?? 0) > 0).slice(0, 3);
  const bible = (name: string) => p(`/k/${campaign.id}/bibel?q=${encodeURIComponent(name)}`);

  return (
    <section className={phase === 'today' ? 'card prep-card today' : 'card prep-card'} aria-labelledby="prep-title">
      <span className="overline row" style={{ gap: 6 }}>
        {t('Nächste Runde')} · <IconLock size={12} /> {t('nur für dich')}
      </span>
      <h2 id="prep-title" className="prep-when">{t('Für {when}', { when: when(campaign.nextSessionAt!, phase === 'today') })}</h2>

      {latest && threads.length > 0 && (
        <div className="prep-part">
          <h3 className="prep-head">{t('Offen aus Kapitel {n}', { n: latest.number })}</h3>
          <ul className="prep-threads">
            {threads.slice(0, MAX_THREADS).map((x) => (
              <li key={x}><Link to={p(`/s/${latest.id}/recap`)}>{x}</Link></li>
            ))}
          </ul>
        </div>
      )}

      {latest && entries.length > 0 && (
        <div className="prep-part">
          <h3 className="prep-head">{t('Zuletzt dabei')}</h3>
          <div className="prep-chips">
            {entries.map((e) => (
              <Link key={e.id} className="btn small chip" to={bible(e.name)}
                aria-label={e.visibility === 'gm_only' ? t('{name}, nur für dich', { name: e.name }) : undefined}>
                {e.visibility === 'gm_only' && <IconLock size={12} />}{e.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {older.map((s) => (
        <Link key={s.id} className="prep-line" to={p(`/s/${s.id}/recap`)}>
          {t('Neue Kommentare zu Kapitel {n}', { n: s.number })} <span aria-hidden="true">›</span>
        </Link>
      ))}

      {!latest && <span className="muted small">{t('Nach der ersten Runde stehen hier offene Fäden und wer zuletzt dabei war.')}</span>}
      <Link className="linklike small tap-link" to={p(`/k/${campaign.id}/termin`)} style={{ alignSelf: 'flex-start' }}>{t('Termin ansehen')}</Link>
    </section>
  );
}
