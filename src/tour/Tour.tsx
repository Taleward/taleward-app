import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { TOUR_STEPS, availableSteps, markTourSeen, tourSeen, type TourRole, type TourStep } from './steps';

const find = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
const visible = (el: HTMLElement | null) => !!el && el.getClientRects().length > 0;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const GAP = 12;
const MARGIN = 16;

/**
 * Kurze Tour beim ersten Öffnen einer Kampagne (je Gerät und Rolle einmal). Hebt die echte Stelle hervor, „Weiter“ und
 * „Überspringen“, Esc beendet. Startet nicht, solange ein anderes Fenster offen ist (Nutzungsbedingungen, Rückfrage).
 */
export function Tour({ role }: { role: TourRole }) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (tourSeen(role)) return;
    const timer = window.setTimeout(() => {
      if (document.querySelector('[aria-modal="true"]')) return; // ein anderes Fenster hat Vorrang; nächstes Mal
      const list = availableSteps(TOUR_STEPS[role], (target) => visible(find(target)));
      if (list.length < 2) return;
      markTourSeen(role); // auch wer mittendrin weggeht, bekommt sie nicht noch einmal ungefragt
      setSteps(list);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [role]);

  const step = steps?.[index] ?? null;

  const measure = useCallback(() => {
    if (!step?.target) { setRect(null); return; }
    const el = find(step.target);
    setRect(visible(el) ? el!.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    if (!step) return;
    const el = step.target ? find(step.target) : null;
    el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    measure();
    const later = window.setTimeout(measure, reducedMotion() ? 0 : 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    next.current?.focus();
    return () => {
      window.clearTimeout(later);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, measure]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
  }, [step, rect]);

  const close = useCallback(() => setSteps(null), []);
  useEffect(() => {
    if (!steps) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps, close]);

  if (!steps || !step) return null;
  const last = index === steps.length - 1;

  // Karte unter dem Ziel, sonst darüber; ohne Ziel mittig
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(360, vw - 2 * MARGIN);
  let top = (vh - cardH) / 2;
  let left = (vw - width) / 2;
  if (rect) {
    const below = rect.bottom + GAP;
    top = below + cardH <= vh - MARGIN ? below : Math.max(MARGIN, rect.top - GAP - cardH);
    left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - width / 2), vw - width - MARGIN);
  }

  return createPortal(
    <div className="tour-shade">
      {rect
        ? <div className="tour-ring" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
        : <div className="tour-dim" />}
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text"
        className="card floating tour-card" style={{ top, left, width }}>
        <span className="overline">{t('{n} von {m}', { n: index + 1, m: steps.length })}</span>
        <strong id="tour-title" style={{ fontFamily: 'var(--display)', fontSize: 'calc(19px * var(--ts))' }}>{t(step.title)}</strong>
        <span id="tour-text" className="small">{t(step.text)}</span>
        <div className="row between" style={{ gap: 8, marginTop: 4 }}>
          {!last
            ? <button type="button" className="linklike small" style={{ minHeight: 48 }} onClick={close}>{t('Überspringen')}</button>
            : <span />}
          <div className="row" style={{ gap: 8 }}>
            {index > 0 && <button type="button" className="btn small outline" onClick={() => setIndex(index - 1)}>{t('Zurück')}</button>}
            <button ref={next} type="button" className="btn small" onClick={() => (last ? close() : setIndex(index + 1))}>
              {last ? t('Fertig') : t('Weiter')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
