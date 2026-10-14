import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { currentConnection, currentConnectionId, p, versionLess } from '../api/connections';
import type { Correction, Member, Session, UncertainTerms } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { formatDate } from '../components/format';
import { IconLock } from '../components/Icons';
import { clock } from '../components/RecapReviewView';
import { ErrorBox, Screen, sessionStorageGet, sessionStorageSet } from '../components/Screen';
import { t, tn } from '../i18n';

/** Kann der Server unsichere Namen melden? (Schnittstelle ab 0.4.6) */
export function serverHasNameCheck(): boolean {
  try {
    const v = currentConnection().apiVersion;
    return !!v && !versionLess(v, '0.4.6');
  } catch {
    return false;
  }
}

const skipKey = (sessionId: string) => `names-skipped.${currentConnectionId() ?? '-'}.${sessionId}`;
export const namesSkipped = (sessionId: string) => sessionStorageGet(skipKey(sessionId)) === '1';
const markSkipped = (sessionId: string) => sessionStorageSet(skipKey(sessionId), '1');

/**
 * Unsicher erkannte Namen (Schnittstelle 0.4.6, nur SL): eigener Schritt vor „Vorschläge prüfen“, nur wenn der Server
 * etwas meldet. Je Begriff eine Schreibweise wählen oder „so lassen“; optional mit den korrigierten Namen neu
 * transkribieren, solange die Aufnahme noch da ist.
 */
export function NamesPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [entryNames, setEntryNames] = useState<Record<string, string>>({});
  const [data, setData] = useState<UncertainTerms | null>(null);
  // heard → gewählte Schreibweise; '' = so lassen; fehlt = noch nicht entschieden
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([api.session(sessionId), api.uncertainTerms(sessionId)])
      .then(([s, u]) => {
        setSession(s);
        setData(u);
        api.campaign(s.campaignId).then((c) => setMembers(c.members)).catch(() => undefined);
        if (u.terms.some((x) => x.suggestedEntryId)) {
          api.entries(s.campaignId).then((list) => setEntryNames(Object.fromEntries(list.map((e) => [e.id, e.name])))).catch(() => undefined);
        }
      })
      .catch(setError);
  }, [sessionId]);

  const toReview = () => navigate(p(`/s/${sessionId}/freigabe`), { replace: true });
  const skip = () => { markSkipped(sessionId); toReview(); };

  const corrections = (): Correction[] => Object.entries(choice).map(([heard, correct]) => ({ heard, correct, addToHotwords: remember && !!correct }));
  const decided = Object.keys(choice).length;
  const canRetranscribe = !!data?.audioAvailable && (data.retranscribesLeft ?? 1) > 0;

  const apply = async (retranscribe: boolean) => {
    if (retranscribe && !(await confirmDialog(
      t('Neu transkribieren? Kapitel und Vorschläge entstehen danach neu – deine bisherigen Entscheidungen und Änderungen am Kapitel gehen dabei verloren.'),
      { confirmLabel: t('Neu transkribieren') }))) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.corrections(sessionId, corrections(), retranscribe);
      markSkipped(sessionId); // Rest nicht noch einmal automatisch zeigen
      if ('status' in r) navigate(p(`/s/${sessionId}`), { replace: true });
      else toReview();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const nameOf = (memberId: string | null) => {
    const m = memberId ? members.find((x) => x.id === memberId) : undefined;
    return m?.characterName || null;
  };

  return (
    <Screen
      back
      overline={<span className="row" style={{ gap: 6 }}><IconLock size={14} /> {session ? t('Kapitel {n}', { n: session.number }) + ' · ' + t('nur für dich') : t('Nur für dich')}</span>}
      title={t('Namen prüfen')}
    >
      <ErrorBox error={error} />
      {data && (
        <p className="muted" style={{ margin: 0 }}>
          {tn(data.terms.length,
            'Bei {n} Namen war sich die Transkription unsicher. Wähle die richtige Schreibweise – sie wird in Abschrift, Kapitel und Vorschlägen ersetzt.',
            'Bei {n} Namen war sich die Transkription unsicher. Wähle die richtigen Schreibweisen – sie werden in Abschrift, Kapitel und Vorschlägen ersetzt.')}
        </p>
      )}

      {data?.terms.map((term) => {
        const options = [
          ...(nameOf(term.suggestedMemberId) ? [nameOf(term.suggestedMemberId)!] : []),
          ...(term.suggestedEntryId && entryNames[term.suggestedEntryId] ? [entryNames[term.suggestedEntryId]] : []),
          ...term.alternatives
        ].filter((x, i, all) => x !== term.heard && all.indexOf(x) === i);
        const chosen = choice[term.heard];
        const set = (value: string | undefined) => setChoice((c) => {
          const next = { ...c };
          if (value === undefined) delete next[term.heard]; else next[term.heard] = value;
          return next;
        });
        return (
          <section key={term.id} className="card">
            <div className="row between wrap" style={{ gap: 8 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{term.heard}</strong>
              <span className="muted small">{tn(term.occurrences, 'Einmal gehört', '{n}-mal gehört')}</span>
            </div>
            {term.examples.map((ex) => (
              <p key={ex.start} className="small" style={{ margin: 0 }}>
                <span className="muted">{clock(ex.start)}</span> „{ex.quote}“
              </p>
            ))}
            <div className="term-choices" role="group" aria-label={t('Schreibweise für {name}', { name: term.heard })}>
              {options.map((o) => (
                <button key={o} type="button" className="btn small outline" aria-pressed={chosen === o} onClick={() => set(chosen === o ? undefined : o)}>
                  {o}{o === nameOf(term.suggestedMemberId) ? ' · ' + t('Charakter') : o === entryNames[term.suggestedEntryId ?? ''] ? ' · ' + t('Bibel') : ''}
                </button>
              ))}
              <button type="button" className="btn small ghost" aria-pressed={chosen === ''} onClick={() => set(chosen === '' ? undefined : '')}>
                {t('So lassen')}
              </button>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`term-${term.id}`} className="small">{t('Andere Schreibweise')}</label>
              <input id={`term-${term.id}`} type="text" maxLength={40} value={custom[term.heard] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustom((c) => ({ ...c, [term.heard]: v }));
                  set(v.trim() ? v.trim() : undefined);
                }} />
            </div>
          </section>
        );
      })}

      {data && data.terms.length === 0 && <div className="empty">{t('Keine unsicheren Namen – alles klar.')}</div>}

      {data && data.terms.length > 0 && (
        <>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>{t('Korrigierte Namen als Namenshilfe der Kampagne merken')}</span>
          </label>
          <button type="button" className="btn" disabled={busy || decided === 0} onClick={() => apply(false)}>
            {t('Übernehmen')}
          </button>
          {canRetranscribe && (
            <>
              <button type="button" className="btn outline" disabled={busy || decided === 0} onClick={() => apply(true)}>
                {t('Übernehmen und neu transkribieren')}
              </button>
              <p className="muted small" style={{ margin: 0 }}>
                {t('Neu transkribieren hört mit den richtigen Namen noch einmal genau hin. Das dauert etwa so lange wie beim ersten Mal.')}
                {data.audioDeletesAt ? ' ' + t('Die Aufnahme ist noch bis {date} da.', { date: formatDate(data.audioDeletesAt, 'long') }) : ''}
              </p>
            </>
          )}
          {!data.audioAvailable && (
            <p className="muted small" style={{ margin: 0 }}>{t('Die Aufnahme ist schon gelöscht – korrigiert wird nur die Schreibweise im Text.')}</p>
          )}
        </>
      )}
      <button type="button" className="btn ghost" disabled={busy} onClick={skip}>
        {data && data.terms.length === 0 ? t('Weiter zu den Vorschlägen') : t('Überspringen')}
      </button>
    </Screen>
  );
}
