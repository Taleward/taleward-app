import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { Dialog } from './Dialog';

/**
 * Bestätigungen im Stil der App statt des grauen Systemfensters.
 * Aufruf: if (!(await confirmDialog(t('Kommentar löschen?'), { confirmLabel: t('Löschen'), danger: true }))) return;
 */
interface Request {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Kurze Liste unter der Erklärung, z. B. was gelöscht wird und was bleibt */
  list?: { label: string; text: string }[];
  resolve: (ok: boolean) => void;
}

let push: ((r: Request) => void) | null = null;

export function confirmDialog(message: string, opts: Omit<Request, 'message' | 'resolve'> = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(message)); // Rückfall, falls noch nichts gerendert ist
    push({ message, ...opts, resolve });
  });
}

/** „Frage? Erklärung …“ → Überschrift und Erklärung; sonst erster Satz und Rest */
export function splitMessage(message: string): { title: string; body: string } {
  const q = message.indexOf('?');
  if (q > 0) return { title: message.slice(0, q + 1), body: message.slice(q + 1).trim() };
  const s = message.search(/[.!](\s|$)/);
  if (s > 0 && s < message.length - 1) return { title: message.slice(0, s + 1), body: message.slice(s + 1).trim() };
  return { title: message, body: '' };
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    push = setReq;
    return () => { push = null; };
  }, []);
  if (!req) return null;
  // Erste Frage als Überschrift, der Rest als Erklärung in normaler Schrift. Ohne Frage: erster Satz als
  // Überschrift, damit lange Rückfragen nicht als ein fetter Block erscheinen
  const { title, body } = splitMessage(req.message);
  const close = (ok: boolean) => { req.resolve(ok); setReq(null); };
  return (
    <Dialog title={title} onClose={() => close(false)}>
      {body && <p style={{ margin: 0 }}>{body}</p>}
      {req.list && (
        <dl className="confirm-list">
          {req.list.map((r) => (
            <div key={r.label}><dt>{r.label}</dt><dd>{r.text}</dd></div>
          ))}
        </dl>
      )}
      {/* Untereinander und volle Breite: auch lange Beschriftungen passen, Daumen erreicht beide */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className={req.danger ? 'btn danger' : 'btn'} autoFocus onClick={() => close(true)}>
          {req.confirmLabel ?? t('Bestätigen')}
        </button>
        <button type="button" className="btn outline" onClick={() => close(false)}>{req.cancelLabel ?? t('Abbrechen')}</button>
      </div>
    </Dialog>
  );
}
