import { confirmDialog } from '../components/confirm';
import { t, tk } from '../i18n';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, isApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Campaign, DateOption, DatePoll, VoteAnswer } from '../api/types';
import { ErrorBox, Screen, rememberCampaign } from '../components/Screen';
import { Missing } from '../components/Missing';
import { formatDateTime } from '../components/format';

const ANSWERS: { value: VoteAnswer; label: string }[] = [
  { value: 'yes', label: tk('Passt') },
  { value: 'maybe', label: tk('Vielleicht') },
  { value: 'no', label: tk('Passt nicht') }
];

/** Punkte für die Reihenfolge: passt = 2, vielleicht = 1 */
const score = (o: DateOption) => o.votes.reduce((n, v) => n + (v.answer === 'yes' ? 2 : v.answer === 'maybe' ? 1 : 0), 0);

export function DatePollPage() {
  const { campaignId = '' } = useParams();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [poll, setPoll] = useState<DatePoll | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [newDate, setNewDate] = useState('');
  const [triedDate, setTriedDate] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const c = await api.campaign(campaignId);
      rememberCampaign(c);
      setCampaign(c);
      try {
        setPoll(await api.datePoll(campaignId));
      } catch (e) {
        if (!isApiError(e) || e.status !== 404) throw e;
        setPoll(null);
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const run = async (action: () => Promise<DatePoll | void>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result) setPoll(result);
      else await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const gm = campaign?.myRole === 'gm';
  const me = campaign?.members.find((m) => m.userId === user?.id);
  const name = (memberId: string) => {
    const m = campaign?.members.find((x) => x.id === memberId);
    return m ? m.displayName : t('Unbekannt');
  };

  const open = poll?.status === 'open' ? poll : null;
  const best = open && open.options.length > 1 ? [...open.options].sort((a, b) => score(b) - score(a))[0] : null;

  return (
    <Screen narrow overline={campaign?.title ?? ' '} title={t('Nächste Runde')} hero={{ campaign }}>
      <ErrorBox error={error} />
      {!loaded && <div className="empty">{t('Lade …')}</div>}

      {campaign?.nextSessionAt && !open && (
        <div className="card">
          <span className="overline">{t('Festgelegt')}</span>
          <h2 style={{ fontSize: 'calc(22px * var(--ts))' }}>{formatDateTime(campaign.nextSessionAt)}</h2>
        </div>
      )}

      {loaded && !open && campaign && (
        gm ? (
          <section className="card">
            <h2>{t('Termin abstimmen')}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {t('Alle schlagen Termine vor und stimmen ab, du legst fest.')}
            </p>
            <div className="field">
              <label htmlFor="poll-note">{t('Hinweis (optional)')}</label>
              <input id="poll-note" type="text" value={note} placeholder={t('z. B. Kapitel 14, gern am Wochenende')} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.createDatePoll(campaignId, note))}>
              {t('Abstimmung starten')}
            </button>
          </section>
        ) : (
          !campaign.nextSessionAt && <div className="empty">{t('Die Spielleitung hat noch keine Terminabstimmung gestartet.')}</div>
        )
      )}

      {open && (
        <>
          {open.note && <p style={{ margin: 0 }}>{open.note}</p>}
          {open.options.length === 0 && <div className="empty">{t('Noch keine Vorschläge. Schlag unten einen Termin vor.')}</div>}

          {open.options.map((o) => {
            const mine = o.votes.find((v) => v.memberId === me?.id)?.answer;
            const by = (a: VoteAnswer) => o.votes.filter((v) => v.answer === a).map((v) => name(v.memberId));
            const pending = campaign!.members.filter((m) => !o.votes.some((v) => v.memberId === m.id)).map((m) => m.displayName);
            const canRemove = gm || o.proposedByMemberId === me?.id;
            return (
              <div key={o.id} className={mine ? 'card' : 'card task'}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-title" style={{ fontFamily: 'var(--display)', fontSize: 'calc(19px * var(--ts))' }}>{formatDateTime(o.startsAt)}</div>
                    <div className="muted small">{t('vorgeschlagen von {name}', { name: name(o.proposedByMemberId) })}</div>
                  </div>
                  {best?.id === o.id && score(o) > 0 && <span className="pill moss">{t('Beste Wahl')}</span>}
                </div>

                <div className="small" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {by('yes').length > 0 && <span><strong style={{ color: 'var(--moss)' }}>{t('Passt:')}</strong> {by('yes').join(', ')}</span>}
                  {by('maybe').length > 0 && <span><strong style={{ color: 'var(--ink)' }}><span aria-hidden style={{ color: 'var(--brass)' }}>● </span>{t('Vielleicht:')}</strong> {by('maybe').join(', ')}</span>}
                  {by('no').length > 0 && <span><strong style={{ color: 'var(--seal)' }}>{t('Passt nicht:')}</strong> {by('no').join(', ')}</span>}
                  {pending.length > 0 && <span className="muted">{t('Noch offen')}: {pending.join(', ')}</span>}
                </div>

                <div className="segmented" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label={t('Deine Antwort')}>
                  {ANSWERS.map((a) => (
                    <button key={a.value} type="button" aria-pressed={mine === a.value} disabled={busy}
                      onClick={() => run(() => api.vote(open.id, o.id, a.value))}>
                      {t(a.label)}
                    </button>
                  ))}
                </div>

                {(gm || canRemove) && (() => {
                  // Festlegen steht offen nur bei der besten Wahl; alles Seltene unter „Mehr“
                  const isBest = best?.id === o.id && score(o) > 0;
                  const fix = (cls: string) => (
                    <button type="button" className={cls} disabled={busy} onClick={async () => {
                      if (await confirmDialog(t('{date} als nächsten Termin festlegen? Die Abstimmung wird damit beendet.', { date: formatDateTime(o.startsAt) }), { confirmLabel: t('Festlegen') })) {
                        run(() => api.closeDatePoll(open.id, o.id));
                      }
                    }}>
                      {t('Diesen Termin festlegen')}
                    </button>
                  );
                  return (
                    <>
                      {gm && isBest && fix('btn small moss')}
                      <details className="more">
                        <summary className="small">{t('Mehr')}</summary>
                        <div className="row wrap" style={{ gap: 8, paddingBottom: 4 }}>
                          {gm && !isBest && fix('btn small moss outline')}
                          {canRemove && (
                            <button type="button" className="btn small danger outline" disabled={busy} onClick={() => run(() => api.removeDateOption(open.id, o.id))}>
                              {t('Entfernen')}
                            </button>
                          )}
                        </div>
                      </details>
                    </>
                  );
                })()}
              </div>
            );
          })}

          <section className="card">
            <h2>{t('Termin vorschlagen')}</h2>
            <div className="field">
              <label htmlFor="new-date">{t('Datum und Uhrzeit')}</label>
              <input id="new-date" type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                style={{ width: '100%', minHeight: 46, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--rule-strong)', background: 'var(--field)', color: 'var(--ink)', fontFamily: 'var(--text)', fontSize: 'calc(17px * var(--ts))' }} />
            </div>
            <Missing text={newDate ? null : t('Bitte zuerst Datum und Uhrzeit wählen.')} shown={triedDate} />
            <button type="button" className="btn small" disabled={busy}
              onClick={() => { setTriedDate(true); if (newDate) run(async () => {
                const p = await api.addDateOption(open.id, new Date(newDate).toISOString());
                setNewDate('');
                setTriedDate(false);
                return p;
              }); }}>
              {t('Vorschlagen')}
            </button>
          </section>

          {gm && (
            <button type="button" className="btn small danger outline" disabled={busy} onClick={async () => {
              if (await confirmDialog(t('Abstimmung abbrechen? Alle Vorschläge gehen verloren.'), { confirmLabel: t('Abstimmung abbrechen'), cancelLabel: t('Zurück'), danger: true })) run(() => api.cancelDatePoll(open.id));
            }}>
              {t('Abstimmung abbrechen')}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}
