import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFor, isApiError } from '../api/client';
import { updateConnection, type Connection } from '../api/connections';
import type { ServerInfo, User } from '../api/types';
import { gmState } from '../auth/serverAccess';
import { t } from '../i18n';
import { ErrorBox } from './Screen';

/**
 * SL-Freigabe (ab Schnittstelle 0.4.23): Auf manchen Servern legt nur eine freigegebene Spielleitung eigene Kampagnen
 * an. Die Karte zeigt den Stand und stellt die Anfrage; entscheiden tut die Verwaltung des Servers, per E-Mail.
 * E-Mail bestätigen und Freigabe anfragen sind zwei Schritte – die Karte sagt, welcher gerade dran ist.
 */
export function GmRequest({ conn, info, user, onUser }: { conn: Connection; info: ServerInfo; user: User; onUser: (u: User) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const state = gmState(info, user);
  if (state === 'ok') return null;
  const id = `gm-${conn.id}`;
  const operator = info.operator || conn.name;

  const reload = async () => {
    const u = await apiFor(conn).me();
    updateConnection(conn.id, { user: { ...(conn.user ?? u), ...u } });
    onUser(u);
    return u;
  };

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const u = await apiFor(conn).requestGm();
      onUser(u);
    } catch (e) {
      // Stand hat sich geändert (E-Mail noch nicht bestätigt, schon abgelehnt): neu laden, die Karte zeigt es dann
      if (isApiError(e, 'email_unverified') || isApiError(e, 'gm_request_closed')) await reload().catch(() => undefined);
      if (!isApiError(e, 'gm_request_closed')) setError(e);
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card gm-request" aria-labelledby={id}>
      {state === 'none' && (
        <>
          <h2 id={id}>{t('Du möchtest eine Runde leiten?')}</h2>
          <span className="small">
            {t('Auf „{server}“ legt nur eine freigegebene Spielleitung eigene Kampagnen an. Du fragst einmal an, {operator} entscheidet und schreibt dir per E-Mail.', { server: conn.name, operator })}
          </span>
          {user.email ? (
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={ask}>
              {busy ? t('Einen Moment …') : t('SL-Freigabe anfragen')}
            </button>
          ) : user.emailPending ? (
            <>
              <span className="small">{t('Zuerst die E-Mail-Adresse bestätigen: Der Link ist an {email} unterwegs. Danach hier weiter.', { email: user.emailPending })}</span>
              <button type="button" className="btn outline" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={check}>{t('Ich habe bestätigt')}</button>
            </>
          ) : (
            <>
              <span className="small">{t('Dafür braucht dein Konto eine bestätigte E-Mail-Adresse, an sie geht die Antwort. Sie dient nur deinem Konto.')}</span>
              <Link className="btn" style={{ alignSelf: 'flex-start' }} to={`/konto?email=${encodeURIComponent(conn.id)}`}>{t('E-Mail eintragen')}</Link>
            </>
          )}
        </>
      )}
      {state === 'pending' && (
        <>
          <h2 id={id}>{t('SL-Freigabe wird geprüft')}</h2>
          <span className="small">
            {user.email
              ? t('Deine Anfrage liegt bei {operator}. Die Entscheidung kommt per E-Mail an {email} und steht dann auch hier.', { operator, email: user.email })
              : t('Deine Anfrage liegt bei {operator}. Die Entscheidung kommt per E-Mail und steht dann auch hier.', { operator })}
          </span>
          <button type="button" className="linklike small tap-link" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={check}>{t('Stand neu laden')}</button>
        </>
      )}
      {state === 'rejected' && (
        <>
          <h2 id={id}>{t('SL-Freigabe abgelehnt')}</h2>
          <span className="small">
            {info.contact
              ? t('{operator} hat deine Anfrage abgelehnt. Fragen dazu gehen an {contact}.', { operator, contact: info.contact })
              : t('{operator} hat deine Anfrage abgelehnt. Fragen dazu gehen an die Verwaltung des Servers.', { operator })}
          </span>
        </>
      )}
      <span className="muted small">{t('Mitspielen geht ohne Freigabe, mit einer Einladung deiner SL.')}</span>
      <ErrorBox error={error} />
    </section>
  );
}
