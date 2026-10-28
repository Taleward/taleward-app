import { Fragment, useEffect, useRef, useState } from 'react';
import { api, isApiError } from '../api/client';
import type { Recap } from '../api/types';
import { t, tn } from '../i18n';
import { ErrorBox } from '../components/Screen';
import { IconSend } from '../components/Icons';
import { wordDiff } from './wordDiff';
import { partTitles } from './parts';
import { PartHeading } from '../components/PartHeading';

/*
 * Kapitel per Hinweis korrigieren (Schnittstelle 0.4.15, nur SL). Bewusst schmal: eine ruhige Zeile am Ende des
 * Kapitels („Stimmt etwas nicht? …“), der Pfeil zum Absenden erscheint erst mit Text. Tippt die SL einen Absatz an,
 * bekommt er darunter eine eigene Zeile; alle Hinweise werden gesammelt und mit dem einen Pfeil am Ende zusammen
 * abgeschickt (jeweils mit dem Absatz als Bezug). Der Server ordnet die Hinweise den Absätzen zu und legt
 * einen Entwurf vor; die App zeigt ihn wie eine Korrektur auf Papier (neu unterstrichen, gestrichen durchgestrichen)
 * mit „Übernehmen“ / „Verwerfen“ für das Ganze.
 */

/** Liegt ein Entwurf vor oder läuft einer? Dann ist Bearbeiten von Hand gesperrt. */
export function revisionOpen(recap: Recap): boolean {
  return recap.revision?.state === 'running' || recap.revision?.state === 'ready';
}

/** Bezug auf einen Absatz für den Hinweis: „Zu „Pipo bricht zusammen …“: “ */
export function paragraphRef(para: string): string {
  const words = para.trim().split(/\s+/);
  const head = words.slice(0, 6).join(' ') + (words.length > 6 ? ' …' : '');
  return t('Zu {q}: ', { q: t('„{q}“', { q: head }) });
}

/** Ruhiges Eingabefeld: nur ein Strich darunter, wächst beim Schreiben; Pfeil zum Absenden nur, wenn erlaubt */
function HintInput({ value, onChange, label, placeholder, focusKey = 0, busy = false, onSend, onFocusChange, onBlurEmpty }: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  focusKey?: number;
  busy?: boolean;
  onSend?: () => void;
  onFocusChange?: (focused: boolean) => void;
  onBlurEmpty?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Höhe dem Text anpassen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  // Nach dem Antippen eines Absatzes: Fokus und Schreibmarke ans Ende
  useEffect(() => {
    const el = ref.current;
    if (!el || !focusKey) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusKey]);
  return (
    <div className="revision-input">
      <textarea ref={ref} rows={1} maxLength={2000} value={value} disabled={busy} aria-label={label} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => { onFocusChange?.(false); if (!value.trim()) onBlurEmpty?.(); }} />
      {onSend && (
        <button type="button" className="revision-send" disabled={busy} onClick={onSend} aria-label={t('Korrigieren lassen')} title={t('Korrigieren lassen')}>
          <IconSend />
        </button>
      )}
    </div>
  );
}

/** Hinweis direkt unter einem angetippten Absatz – wird gesammelt, abgeschickt wird erst am Ende */
export function ParagraphHint({ value, onChange, onRemove, focusKey }: {
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  focusKey: number;
}) {
  return (
    <div className="revision-line paragraph-hint">
      <HintInput value={value} onChange={onChange} focusKey={focusKey} onBlurEmpty={onRemove}
        label={t('Was stimmt in diesem Absatz nicht?')} placeholder={t('Was stimmt hier nicht?')} />
    </div>
  );
}

const TIP_KEY = 'taleward.revisionTipSeen';

/** Die Zeile am Ende: eigener Hinweis (z. B. was fehlt) und der eine Pfeil, der alles Gesammelte abschickt */
function RevisionLine({ note, setNote, count, busy, onSend, onSelfEdit, }: {
  note: string;
  setNote: (v: string) => void;
  count: number;
  busy: boolean;
  onSend: () => void;
  onSelfEdit?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const ready = note.trim().length > 0 || count > 0;
  // Tipp nur beim ersten Prüfen auf diesem Gerät
  const [tip] = useState(() => { try { return localStorage.getItem(TIP_KEY) !== '1'; } catch { return true; } });
  useEffect(() => { if (tip) try { localStorage.setItem(TIP_KEY, '1'); } catch { /* egal */ } }, [tip]);
  return (
    <div className="revision-line">
      <HintInput value={note} onChange={setNote} busy={busy} onSend={ready ? onSend : undefined} onFocusChange={setFocused}
        label={t('Stimmt etwas nicht oder fehlt etwas?')}
        placeholder={count ? t('Sonst noch etwas, z. B. was fehlt? …') : t('Stimmt etwas nicht? Schreib es einfach hier hin …')} />
      {count > 0
        ? <span className="muted small">{tn(count, '{n} Hinweis an einem Absatz. Der Pfeil schickt alles auf einmal.', '{n} Hinweise an Absätzen. Der Pfeil schickt alles auf einmal.')}</span>
        : focused || ready
          ? <span className="muted small">{t('Nur du siehst das. Geändert werden nur die betroffenen Absätze, und du entscheidest danach.')}</span>
          : onSelfEdit && <button type="button" className="btn small subtle revision-self" onClick={onSelfEdit}>{t('Selbst bearbeiten')}</button>}
      {tip && count === 0 && !focused && !ready && <span className="muted small revision-tip">{t('Tipp: Tippe einen Absatz an, um genau dort etwas anzumerken.')}</span>}
    </div>
  );
}

/** Das Kapitel mit den vorgeschlagenen Änderungen im Text */
export function RevisionDraft({ recap }: { recap: Recap }) {
  const v = recap.revision;
  if (!v || v.state !== 'ready') return null;
  const paragraphs = recap.text.split(/\n\s*\n/);
  const titles = partTitles(recap.parts, paragraphs.length, recap.title);
  return (
    <div className="recap revision-draft" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {paragraphs.map((para, i) => {
        const change = v.changes.find((c) => c.index === i);
        const heading = titles.has(i) ? <PartHeading title={titles.get(i)!} /> : null;
        if (!change) return <Fragment key={i}>{heading}<p>{para}</p></Fragment>;
        return (
          <Fragment key={i}>{heading}<p className="revision-changed">
            {wordDiff(change.before, change.after).map((part, k) =>
              part.kind === 'same' ? <span key={k}>{part.text}</span>
                : part.kind === 'del' ? <del key={k}>{part.text}</del>
                  : <ins key={k}>{part.text}</ins>
            )}
          </p></Fragment>
        );
      })}
    </div>
  );
}

/**
 * Die Zeile bzw. Stand des Auftrags und die Entscheidung. Die Texte liegen beim Aufrufer: `note` ist die Zeile am Ende,
 * `collected` die gesammelten Hinweise an Absätzen (schon mit Bezug „Zu „…“:“), `count` ihre Zahl.
 */
export function RevisionBox({ sessionId, recap, onRecap, note, setNote, collected, count, onSent, onSelfEdit }: {
  sessionId: string;
  recap: Recap;
  onRecap: (r: Recap) => void;
  note: string;
  setNote: (v: string) => void;
  collected: string;
  count: number;
  onSent: () => void;
  onSelfEdit?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const v = recap.revision;

  // Während der Server korrigiert, alle paar Sekunden nachsehen
  useEffect(() => {
    if (v?.state !== 'running') return;
    const timer = window.setTimeout(() => { api.recap(sessionId).then(onRecap).catch(setError); }, 2500);
    return () => window.clearTimeout(timer);
  }, [v?.state, recap, sessionId, onRecap]);

  const run = async (action: () => Promise<Recap>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      onRecap(await action());
      after?.();
    } catch (e) {
      setError(e);
      // Hat sich das Kapitel geändert, den aktuellen Stand holen
      if (isApiError(e) && e.status === 409) api.recap(sessionId).then(onRecap).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  if (v?.state === 'running') {
    return <p className="muted small" role="status" style={{ margin: 0 }}>{t('Wird korrigiert …')}</p>;
  }

  if (v?.state === 'ready') {
    const missed = v.notes.filter((n) => !n.applied);
    return (
      <div className="revision-box">
        <ErrorBox error={error} />
        <p className="small" style={{ margin: 0 }}>
          {v.changes.length
            ? tn(v.changes.length, 'Korrektur: {n} Absatz geändert. Neues ist unterstrichen, Gestrichenes durchgestrichen.', 'Korrektur: {n} Absätze geändert. Neues ist unterstrichen, Gestrichenes durchgestrichen.')
            : t('Es wurde nichts geändert.')}
        </p>
        {missed.map((n, i) => (
          <p key={i} className="small muted" style={{ margin: 0 }}>
            {t('Dazu wurde nichts geändert: {q} Schreib es noch einmal eindeutig: wer tat was.', { q: t('„{q}“', { q: n.text }) })}
          </p>
        ))}
        <div className="row wrap" style={{ gap: 8 }}>
          {v.changes.length > 0 && (
            <button type="button" className="btn small moss outline" disabled={busy} onClick={() => run(() => api.decideRevision(sessionId, true))}>{t('Übernehmen')}</button>
          )}
          <button type="button" className="btn small outline" disabled={busy} onClick={() => run(() => api.decideRevision(sessionId, false))}>
            {v.changes.length ? t('Verwerfen') : t('Schließen')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="revision-box">
      {v?.state === 'failed' && (
        <p className="small" role="alert" style={{ margin: 0 }}>{v.message || t('Die Korrektur hat nicht geklappt. Versuch es noch einmal.')}</p>
      )}
      <ErrorBox error={error} />
      <RevisionLine note={note} setNote={setNote} count={count} busy={busy} onSelfEdit={onSelfEdit}
        onSend={() => run(() => api.requestRevision(sessionId, [collected, note.trim()].filter(Boolean).join('\n'), recap.text), onSent)} />
    </div>
  );
}
