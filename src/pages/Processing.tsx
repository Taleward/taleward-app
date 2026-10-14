import { confirmDialog } from '../components/confirm';
import { IconInfo } from '../components/Icons';
import { p } from '../api/connections';
import { t, tk, tn } from '../i18n';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { api, isApiError } from '../api/client';
import type { ProcessingState, ProcessingStatus, Role, Session } from '../api/types';
import { ErrorBox, Screen } from '../components/Screen';

/** Schlüssel des Servers für die Schritte der Zusammenfassung (ab Schnittstelle 0.4.6); andere Texte unverändert */
function statusText(message: string): string {
  switch (message) {
    case 'summarizing.notes': return t('Szenennotizen werden geschrieben …');
    case 'summarizing.recap': return t('Das Kapitel wird geschrieben …');
    case 'summarizing.proposals': return t('Vorschläge für die Bibel werden gesammelt …');
    case 'summarizing.review': return t('Das Kapitel wird mit der Abschrift gegengeprüft …');
    case 'summarizing.revision': return t('Unbelegte Stellen werden nachgebessert …');
    default: return message;
  }
}

const STEPS: { state: ProcessingState[]; label: string }[] = [
  { state: ['uploading', 'queued'], label: tk('Aufnahme angekommen') },
  { state: ['transcribing'], label: tk('Transkription') },
  { state: ['awaiting_speakers'], label: tk('Stimmen zuordnen') },
  { state: ['summarizing'], label: tk('Zusammenfassung') },
  { state: ['awaiting_review'], label: tk('Kapitel prüfen') },
  { state: ['published'], label: tk('Veröffentlicht') }
];

const RUNNING: ProcessingState[] = ['uploading', 'queued', 'transcribing', 'summarizing'];
const POLL_MS = 3000;

export function Processing() {
  const { sessionId = '' } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [lastRunning, setLastRunning] = useState<ProcessingState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pollRound, setPollRound] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [audioGone, setAudioGone] = useState(false);

  useEffect(() => {
    api
      .session(sessionId)
      .then(async (s) => {
        setSession(s);
        setRole((await api.campaign(s.campaignId)).myRole);
      })
      .catch(setError);
  }, [sessionId]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await api.status(sessionId);
        if (!alive) return;
        setStatus(s);
        setError(null);
        if (RUNNING.includes(s.state)) {
          setLastRunning(s.state);
          timer = setTimeout(tick, POLL_MS);
        }
      } catch (e) {
        if (!alive) return;
        setError(e);
        // Bei Netzwerkproblemen weiter versuchen, bei 401/404 nicht
        if (isApiError(e) && e.status !== 0 && e.status < 500) return;
        timer = setTimeout(tick, POLL_MS * 3);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sessionId, pollRound]);

  const retry = async () => {
    setRetrying(true);
    setError(null);
    try {
      setStatus(await api.retry(sessionId));
      setPollRound((n) => n + 1);
    } catch (e) {
      if (isApiError(e, 'audio_gone')) setAudioGone(true);
      else setError(e);
    } finally {
      setRetrying(false);
    }
  };

  const failed = status?.state === 'failed';
  // Bei "failed" den zuletzt erreichten Schritt als gescheitert markieren
  const current = STEPS.findIndex((s) => {
    const st = failed ? lastRunning : status?.state;
    return st ? s.state.includes(st) : false;
  });

  return (
    <Screen narrow back overline={session ? t('Kapitel {n}', { n: session.number }) : ' '} title={t('Verarbeitung')}>
      <ErrorBox error={error} />

      {failed && (
        <div className="card warn" role="alert">
          <strong>{t('Die Verarbeitung ist fehlgeschlagen')}</strong>
          <div className="muted small">{status.message ?? t('Ein unerwarteter Fehler ist aufgetreten.')}</div>
          {role === 'gm' && !audioGone && (
            <button type="button" className="btn small" disabled={retrying} onClick={retry}>
              {retrying ? t('Wird neu gestartet …') : t('Erneut versuchen')}
            </button>
          )}
          {role === 'player' && <div className="muted small">{t('Die Spielleitung kann die Verarbeitung neu starten.')}</div>}
        </div>
      )}

      {audioGone && session && (
        <div className="card warn" role="alert">
          <strong>{t('Die Aufnahme ist nicht mehr auf dem Server')}</strong>
          <div className="muted small">
            {t('Nach einem Fehler wird das Audio höchstens 7 Tage aufbewahrt. Lade die Aufnahme neu hoch.')}
          </div>
          <Link className="btn small" to={p(`/k/${session.campaignId}/aufnahme`)}>{t('Zur Aufnahme')}</Link>
        </div>
      )}

      <ol className="card" style={{ listStyle: 'none', margin: 0, gap: 14 }}>
        {STEPS.map((step, i) => {
          const done = current > i;
          const active = current === i;
          const broken = active && failed;
          const color = done ? 'var(--moss)' : active ? 'var(--seal)' : 'var(--rule-strong)';
          return (
            <li key={step.label} className="row" aria-current={active ? 'step' : undefined}>
              <span
                aria-hidden
                style={{
                  width: 14, height: 14, flexShrink: 0, transform: 'rotate(45deg)',
                  background: done || (active && !broken) ? color : 'transparent',
                  border: `2px solid ${color}`
                }}
              />
              <span style={{ flex: 1, fontWeight: active ? 700 : 400, color: done || active ? 'var(--ink)' : 'var(--ink-soft)' }}>
                {t(step.label)}
              </span>
              {done && <span className="muted small">{t('erledigt')}</span>}
              {broken && <span className="muted small" style={{ color: 'var(--seal)' }}>{t('fehlgeschlagen')}</span>}
            </li>
          );
        })}
      </ol>

      {/* Hinweis des Servers während des Wartens, z. B. „Zurzeit ist kein Worker … verbunden“ */}
      {(status?.message || status?.estimatedSeconds) && !failed && (
        <div className="notice">
          <span style={{ flexShrink: 0, color: 'var(--ink-muted)' }}><IconInfo /></span>
          <span>
            {status.message ? statusText(status.message) + ' ' : ''}
            {status.estimatedSeconds ? tn(Math.max(1, Math.round(status.estimatedSeconds / 60)), 'Noch etwa eine Minute.', 'Noch etwa {n} Minuten.') : ''}
          </span>
        </div>
      )}
      {status && status.progress !== null && !failed && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(status.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${status.progress * 100}%` }} />
        </div>
      )}
      {role === 'gm' && session?.transcriptionEngine && (
        <p className="muted small" style={{ margin: 0 }}>
          {session.transcriptionEngine === 'local'
            ? t('Transkribiert auf dem lokalen Server.')
            : t('Extern transkribiert – kein Worker war erreichbar.')}
        </p>
      )}
      {status?.queuePosition != null && <p className="muted" style={{ margin: 0 }}>{t('Platz {n} in der Warteschlange.', { n: status.queuePosition })}</p>}
      {status && RUNNING.includes(status.state) && status.state !== 'uploading' && (
        <p className="muted small" style={{ margin: 0 }}>{t('Du kannst die App schließen.')}</p>
      )}

      {status?.state === 'awaiting_speakers' && <Link className="btn" to={p(`/s/${sessionId}/stimmen`)}>{t('Stimmen zuordnen')}</Link>}
      {status?.state === 'awaiting_review' && <Link className="btn" to={p(`/s/${sessionId}/freigabe`)}>{t('Kapitel prüfen')}</Link>}
      {status?.state === 'published' && session && <Link className="btn" to={p(`/k/${session.campaignId}/chronik`)}>{t('Zur Chronik')}</Link>}

      {/* Abgebrochene oder unbrauchbare Aufnahme loswerden – nur vor dem Veröffentlichen (ab 0.4.5) */}
      {role === 'gm' && session && status && status.state !== 'published' && (
        <button type="button" className="btn small danger outline" style={{ alignSelf: 'flex-start', marginTop: 12 }} onClick={async () => {
          if (!(await confirmDialog(t('Kapitel {n} verwerfen? Aufnahme, Abschrift und Vorschläge werden gelöscht. Spätere Kapitel rücken um eins auf.', { n: session.number }), { confirmLabel: t('Verwerfen'), danger: true }))) return;
          try {
            await api.deleteSession(sessionId);
            navigate(p(`/k/${session.campaignId}`), { replace: true });
          } catch (e) {
            setError(e);
          }
        }}>{t('Kapitel verwerfen')}</button>
      )}
    </Screen>
  );
}
