import { Fragment, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Member, Recap, ReviewVerdict, TranscriptSegment } from '../api/types';
import { t, tn } from '../i18n';
import { Dialog } from './Dialog';
import { IconLock } from './Icons';
import { ErrorBox } from './Screen';
import { PartHeading } from './PartHeading';
import { partTitles } from '../review/parts';

/*
 * Gegenprüfung des Recap-Entwurfs (Schnittstelle 0.4.6, nur SL). Ruhige Ansicht: Der Text sieht aus wie Text.
 * Markiert wird nur, wo die SL hinschauen sollte – „widerspricht“ mit einem Randstrich in siegel, „nicht gefunden“ und
 * „außerhalb des Spiels“ mit einem neutralen Strich, ebenso „teilweise“ mit Begründung. Belegt, teilweise ohne
 * Begründung und nicht geprüft bleiben unmarkiert.
 * Je markiertem Absatz die Begründung des Prüfers als Satz (ohne Begründung ein kurzes Wort zur Art), Belege nur zum
 * Aufklappen (höchstens zwei).
 */

/** Diese Urteile bekommen eine Markierung; „teilweise“ nur, wenn der Server einen Satz dazu hat (z. B. „Nicht erzählt: …“) */
const FLAGGED: ReviewVerdict[] = ['contradicted', 'unsupported', 'off_game'];
const isFlagged = (p: { verdict: ReviewVerdict; note: string | null }) => FLAGGED.includes(p.verdict) || (p.verdict === 'partial' && !!p.note);
const MAX_EVIDENCE = 2;

function flagLabel(v: ReviewVerdict): string {
  switch (v) {
    case 'contradicted': return t('Passt nicht zur Abschrift.');
    case 'unsupported': return t('In der Abschrift nicht gefunden.');
    default: return t('Vermutlich außerhalb des Spiels.');
  }
}

/** Absätze, die die SL ansehen sollte */
function flagged(recap: Recap) {
  const r = recap.review;
  if (!r || r.state !== 'done') return [];
  return r.paragraphs.filter(isFlagged);
}

/** Sekunden → 1:02:03 bzw. 12:34 */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Eine Zeile über dem Entwurf: „3 Stellen zum Ansehen“ bzw. „Nichts aufgefallen“ */
export function reportSentence(recap: Recap): string | null {
  if (recap.review?.state !== 'done') return null;
  const n = flagged(recap).length;
  return n ? tn(n, '{n} Stelle zum Ansehen', '{n} Stellen zum Ansehen') : t('Nichts aufgefallen');
}

/** Zur ersten markierten Stelle springen */
export function jumpToFirstFlagged(recap: Recap): void {
  const first = flagged(recap)[0];
  const el = first ? document.getElementById(`stelle-${first.index}`) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

/** Zu einem Absatz springen (0-basiert), z. B. vom Hinweis auf Geheimes */
export function jumpToParagraph(index: number): void {
  const el = document.querySelector<HTMLElement>(`[data-para="${Math.trunc(index)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

/** Braucht der Entwurf Aufmerksamkeit? (dann klappt die Ansicht von selbst auf) */
export function reviewNeedsAttention(recap: Recap): boolean {
  return flagged(recap).some((p) => p.verdict !== 'off_game');
}

export function RecapReviewView({ sessionId, recap, members = [], showReport = true, onPick, after, highlight, secretAt }: {
  sessionId: string;
  recap: Recap;
  members?: Member[];
  /** Prüfbericht-Satz zeigen (aus, wenn er schon in der Überschrift steht) */
  showReport?: boolean;
  /** Ab 0.4.15: Antippen eines Absatzes (Text) – dort einen Korrektur-Hinweis schreiben */
  onPick?: (index: number, text: string) => void;
  /** Ab 0.4.15: was unter einem Absatz stehen soll (die wandernde Hinweis-Zeile) */
  after?: (index: number) => ReactNode;
  /** Arbeitsplatz: Absätze hervorheben, in denen der gerade angesehene Vorschlag vorkommt */
  highlight?: ((paragraph: string) => boolean) | null;
  /** Ab 0.4.21, nur SL: Absätze mit Geheimem (Index → Satz am Rand) */
  secretAt?: Map<number, string>;
}) {
  const review = recap.review;
  const paragraphs = recap.text.split(/\n\s*\n/);
  const titles = partTitles(recap.parts, paragraphs.length, recap.title);
  const heading = (i: number) => (titles.has(i) ? <PartHeading title={titles.get(i)!} /> : null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [excerptAt, setExcerptAt] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  const speaker = (memberId: string | null) => {
    const m = memberId ? members.find((x) => x.id === memberId) : undefined;
    return m ? (m.role === 'gm' ? t('SL') : m.characterName || m.displayName) : null;
  };

  const showExcerpt = async (start: number) => {
    setExcerptAt(start);
    if (transcript) return;
    try {
      setTranscript(await api.transcript(sessionId));
    } catch (e) {
      setError(e);
    }
  };

  const hl = (para: string, cls: string, i?: number) => {
    const c = i !== undefined && secretAt?.has(i) ? `${cls} secret-para` : cls;
    return highlight && highlight(para) ? `${c} hl` : c;
  };
  const secretNote = (i: number) => (secretAt?.has(i)
    ? <p className="review-note small secret-note"><IconLock size={14} /> {secretAt.get(i)}</p>
    : null);

  // Text eines Absatzes; mit onPick antippbar (nur Zeiger und Finger – mit Tastatur gibt es die Zeile am Ende)
  const text = (para: string, i: number) => (
    <div className={onPick ? 'recap pickable' : 'recap'} onClick={onPick ? () => onPick(i, para) : undefined}><p>{para}</p></div>
  );

  if (!review || review.state === 'skipped') {
    return (
      <div className="review">
        {paragraphs.map((para, i) => <Fragment key={i}>{heading(i)}<div data-para={i} tabIndex={-1} className={hl(para, 'review-para', i)}>{text(para, i)}{secretNote(i)}{after?.(i)}</div></Fragment>)}
      </div>
    );
  }

  const excerpt = excerptAt === null || !transcript ? [] : transcript.filter((s) => s.end >= excerptAt - 60 && s.start <= excerptAt + 60);
  const closest = excerpt.reduce<TranscriptSegment | null>((best, s) => (!best || Math.abs(s.start - excerptAt!) < Math.abs(best.start - excerptAt!) ? s : best), null);

  return (
    <div className="review">
      {review.state === 'pending' && <p className="muted small" style={{ margin: 0 }}>{t('Die Gegenprüfung läuft noch.')}</p>}
      {showReport && review.state === 'done' && <p className="small" style={{ margin: 0 }}><strong>{reportSentence(recap)}</strong></p>}
      {review.stale && <p className="muted small" style={{ margin: 0 }}>{t('Die Prüfung ist von vor deiner Änderung – die Zuordnung der Absätze kann verrutscht sein.')}</p>}

      {paragraphs.map((para, i) => {
        const info = review.state === 'done' ? review.paragraphs.find((x) => x.index === i) : undefined;
        if (!info || !isFlagged(info)) {
          return <Fragment key={i}>{heading(i)}<div data-para={i} tabIndex={-1} className={hl(para, 'review-para', i)}>{text(para, i)}{secretNote(i)}{after?.(i)}</div></Fragment>;
        }
        const evidence = info.evidence.slice(0, MAX_EVIDENCE);
        return (
          <Fragment key={i}>{heading(i)}<div id={`stelle-${i}`} data-para={i} tabIndex={-1} className={hl(para, `review-para flagged v-${info.verdict}`, i)}>
            {text(para, i)}
            {secretNote(i)}
            <p className="review-note small">
              {/* Die Begründung des Prüfers genügt; ohne sie ein kurzes Wort zur Art */}
              {info.note ? info.note : <strong>{flagLabel(info.verdict)}</strong>}
            </p>
            {evidence.length > 0 && (
              <details>
                <summary className="small">{t('Belege ansehen')}</summary>
                {evidence.map((ev, k) => (
                  <button key={k} type="button" className="review-evidence linklike small" onClick={() => showExcerpt(ev.start)}
                    aria-label={t('Abschrift um {time} zeigen: {quote}', { time: clock(ev.start), quote: ev.quote })}>
                    <span className="muted">{clock(ev.start)}{speaker(ev.speakerMemberId) ? ' · ' + speaker(ev.speakerMemberId) : ''}</span>
                    <span>{t('„{q}“', { q: ev.quote })}</span>
                  </button>
                ))}
              </details>
            )}
            {after?.(i)}
          </div></Fragment>
        );
      })}

      {excerptAt !== null && (
        <Dialog title={t('Abschrift um {time}', { time: clock(excerptAt) })} onClose={() => setExcerptAt(null)}>
          <ErrorBox error={error} />
          {!transcript && !error && <p className="muted">{t('Wird geladen …')}</p>}
          {transcript && excerpt.length === 0 && <p className="muted">{t('An dieser Stelle ist die Abschrift leer.')}</p>}
          {excerpt.map((s) => (
            <p key={s.start} className={s === closest ? 'transcript-line hit' : 'transcript-line'}>
              <span className="muted small">{clock(s.start)}{speaker(s.memberId) ? ' · ' + speaker(s.memberId) : ''}</span>
              <br />{s.text}
            </p>
          ))}
          <button type="button" className="btn small outline" onClick={() => setExcerptAt(null)}>{t('Schließen')}</button>
        </Dialog>
      )}
    </div>
  );
}
