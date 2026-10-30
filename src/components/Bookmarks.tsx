import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../api/client';
import type { Bookmark } from '../api/types';
import { locale, t, tn } from '../i18n';
import { ErrorBox } from './Screen';

/*
 * „Merken“ (Schnittstelle 0.4.28): Wer bei einer Runde anwesend ist, markiert mit einem Tippen eine Stelle. Nur für
 * die Person selbst, nie für die SL, nie im Kapitel. Ohne Netz merkt sich die App die Uhrzeit und schickt sie später.
 */

interface Queued { sessionId: string; at: string; note: string | null }
const QUEUE = 'taleward.bookmarkQueue';

function loadQueue(): Queued[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveQueue(q: Queued[]): void {
  try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-200))); } catch { /* dann geht es eben verloren */ }
}

/** Liegengebliebene Merkstellen senden; was der Server ablehnt (z. B. schon veröffentlicht), fällt weg */
async function flushQueue(): Promise<void> {
  const q = loadQueue();
  if (!q.length) return;
  const rest: Queued[] = [];
  for (const b of q) {
    try {
      await api.addBookmark(b.sessionId, b.note, b.at);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 0) rest.push(b);
    }
  }
  saveQueue(rest);
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** Karte während einer laufenden Runde (nur für Anwesende): „Stelle merken“ */
export function LiveBookmark({ sessionId }: { sessionId: string }) {
  const [last, setLast] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    flushQueue().catch(() => undefined);
    const online = () => flushQueue().catch(() => undefined);
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);

  const mark = async (withNote?: string) => {
    const at = new Date().toISOString();
    setError(null);
    setLast(at);
    setCount((n) => n + 1);
    setNoting(false);
    setNote('');
    try {
      await api.addBookmark(sessionId, withNote?.trim() || null, at);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 0) saveQueue([...loadQueue(), { sessionId, at, note: withNote?.trim() || null }]);
      else { setError(e); setCount((n) => n - 1); setLast(null); }
    }
  };

  return (
    <section className="card live-bookmark" aria-label={t('Runde läuft')}>
      <div className="row between" style={{ gap: 8, alignItems: 'center' }}>
        <span className="small"><span className="table-rec-dot" style={{ display: 'inline-block', verticalAlign: 'middle' }} aria-hidden /> {t('Runde läuft')}</span>
        {count > 0 && <span className="muted small">{tn(count, '{n} Stelle gemerkt', '{n} Stellen gemerkt', { n: count })}</span>}
      </div>
      {noting ? (
        <>
          <input type="text" maxLength={280} value={note} autoFocus aria-label={t('Notiz zur Stelle')} placeholder={t('Kurz, worum es ging')}
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') mark(note); }} />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => mark(note)}>{t('Merken')}</button>
            <button type="button" className="btn outline" onClick={() => setNoting(false)}>{t('Abbrechen')}</button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="btn" onClick={() => mark()}>{t('Stelle merken')}</button>
          <button type="button" className="quiet-link" onClick={() => setNoting(true)}>{t('Mit Notiz merken')}</button>
        </>
      )}
      <span className="muted small" role="status">
        {last ? t('Gemerkt um {time}. Du findest die Stelle später im Kapitel. Nur du siehst sie.', { time: clock(last) })
          : t('Ein Tippen, wenn etwas Wichtiges passiert. Nur du siehst deine Merkstellen.')}
      </span>
      <ErrorBox error={error} />
    </section>
  );
}

/** Im Kapitel: eigene Merkstellen, mit Sprung zum Absatz, wenn der Server ihn gefunden hat */
export function MyBookmarks({ list, onJump, onDelete }: { list: Bookmark[]; onJump: (paragraph: number) => void; onDelete: (id: string) => void }) {
  if (!list.length) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 className="list-head">{t('Deine Merkstellen')}</h2>
      <div className="list-box">
        {list.map((b) => {
          const label = <span className="lr-text">{clock(b.at)}{b.note ? ` · ${b.note}` : ''}
            <span className="lr-sub">{b.recapParagraph != null ? t('Zur Stelle im Kapitel') : t('Die Stelle ließ sich keinem Absatz zuordnen.')}</span></span>;
          return (
            <div key={b.id} className="file-row">
              {b.recapParagraph != null
                ? <button type="button" className="list-row nav" onClick={() => onJump(b.recapParagraph!)}>{label}</button>
                : <div className="list-row">{label}</div>}
              <button type="button" className="btn ghost square" aria-label={t('Merkstelle löschen')} onClick={() => onDelete(b.id)}>×</button>
            </div>
          );
        })}
      </div>
      <span className="muted small">{t('Nur du siehst deine Merkstellen.')}</span>
    </section>
  );
}
