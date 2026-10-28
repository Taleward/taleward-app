import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFor } from '../api/client';
import type { Connection } from '../api/connections';
import { termsOutdated } from '../auth/serverAccess';
import { getLive, onLiveChange } from '../recorder/live';
import { t } from '../i18n';

/*
 * Einmal nach dem Anlegen eines Kontos: freundlicher Hinweis, eine E-Mail fürs Passwort-Zurücksetzen zu hinterlegen.
 * Freiwillig, je Server und Konto genau einmal („Nein danke“ = nie wieder), nur wenn der Server Mails verschicken kann,
 * nicht während einer Aufnahme und nicht neben den Nutzungsbedingungen.
 */
const key = (connId: string) => `taleward.emailNudge.${connId}`;

/** Nach dem Registrieren aufrufen */
export function markNewAccount(connId: string): void {
  try { localStorage.setItem(key(connId), 'due'); } catch { /* ohne Speicher eben kein Hinweis */ }
}

function due(connId: string): boolean {
  try { return localStorage.getItem(key(connId)) === 'due'; } catch { return false; }
}
function done(connId: string): void {
  try { localStorage.setItem(key(connId), 'done'); } catch { /* egal */ }
}

export function EmailNudge({ conn }: { conn: Connection }) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [recording, setRecording] = useState(!!getLive());
  useEffect(() => onLiveChange(() => setRecording(!!getLive())), []);
  useEffect(() => {
    if (!conn.token || !due(conn.id)) return;
    let alive = true;
    const api = apiFor(conn);
    Promise.all([api.info(), api.me()]).then(([info, user]) => {
      if (!alive) return;
      if (user.email || user.emailPending) { done(conn.id); return; }
      setShow(!!info.passwordReset && !termsOutdated(info, user));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [conn.id, conn.token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show || recording) return null;
  return (
    <section className="card" aria-label={t('E-Mail hinterlegen')}>
      <strong>{t('Willst du eine E-Mail hinterlegen?')}</strong>
      <span className="small">{t('Dann kannst du dein Passwort selbst zurücksetzen. Sie bleibt freiwillig, niemand am Tisch sieht sie.')}</span>
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small outline" onClick={() => { done(conn.id); navigate(`/konto?email=${encodeURIComponent(conn.id)}`); }}>{t('Eintragen')}</button>
        <button type="button" className="btn small ghost" onClick={() => { done(conn.id); setShow(false); }}>{t('Nein danke')}</button>
      </div>
    </section>
  );
}
