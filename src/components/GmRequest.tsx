import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFor, isApiError } from '../api/client';
import { updateConnection, type Connection } from '../api/connections';
import type { ServerInfo, User } from '../api/types';
import { gmState } from '../auth/serverAccess';
import { t } from '../i18n';
import { Dialog } from './Dialog';
import { ErrorBox } from './Screen';

/*
 * SL-Freigabe (ab Schnittstelle 0.4.23): Auf manchen Servern legt nur eine freigegebene Spielleitung eigene Kampagnen
 * an. In der Liste steht nur ein Knopf bzw. eine Zeile; die Erklärung und das Absenden stehen im Fenster dahinter.
 * Kommt die Entscheidung, zeigt ein Fenster sie einmal an (bestätigen, dann Ruhe).
 */

function useReload(conn: Connection, onUser: (u: User) => void) {
  return async () => {
    const u = await apiFor(conn).me();
    updateConnection(conn.id, { user: { ...(conn.user ?? u), ...u } });
    onUser(u);
    return u;
  };
}

/** Knopf „SL-Freigabe anfragen“ bzw. eine Zeile mit dem Stand – null, wenn das Konto anlegen darf */
export function GmRequest({ conn, info, user, onUser }: { conn: Connection; info: ServerInfo; user: User; onUser: (u: User) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const reload = useReload(conn, onUser);
  const state = gmState(info, user);
  if (state === 'ok') return null;
  const operator = info.operator || conn.name;

  if (state === 'pending') {
    return (
      <div className="notice gm-request" role="status" style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
        <span>{t('SL-Freigabe wird geprüft. Die Antwort kommt per E-Mail.')}</span>
        <button type="button" className="linklike small tap-link" disabled={busy}
          onClick={() => { setBusy(true); reload().catch(() => undefined).finally(() => setBusy(false)); }}>
          {t('Stand neu laden')}
        </button>
      </div>
    );
  }
  if (state === 'rejected') {
    return (
      <span className="muted small gm-request">
        {info.contact
          ? t('SL-Freigabe abgelehnt. Fragen dazu gehen an {contact}.', { contact: info.contact })
          : t('SL-Freigabe abgelehnt. Fragen dazu gehen an {operator}.', { operator })}
      </span>
    );
  }
  return (
    <>
      <button type="button" className="btn gm-request" onClick={() => setOpen(true)}>{t('SL-Freigabe anfragen')}</button>
      {open && <GmRequestDialog conn={conn} operator={operator} user={user} onUser={onUser} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Erklärung und Absenden – mit dem Schritt davor, falls die E-Mail noch fehlt */
function GmRequestDialog({ conn, operator, user, onUser, onClose }: {
  conn: Connection; operator: string; user: User; onUser: (u: User) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const reload = useReload(conn, onUser);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const ask = () => run(async () => {
    try {
      onUser(await apiFor(conn).requestGm());
      onClose();
    } catch (e) {
      // Stand hat sich geändert (E-Mail nicht bestätigt, schon abgelehnt): neu laden, die Liste zeigt es dann
      if (isApiError(e, 'email_unverified') || isApiError(e, 'gm_request_closed')) await reload().catch(() => undefined);
      if (isApiError(e, 'gm_request_closed')) { onClose(); return; }
      throw e;
    }
  });

  return (
    <Dialog title={t('SL-Freigabe anfragen')} onClose={onClose}>
      <span className="small">
        {t('Auf „{server}“ legt nur eine freigegebene Spielleitung eigene Kampagnen an. Du fragst einmal an, {operator} entscheidet und schreibt dir per E-Mail.', { server: conn.name, operator })}
      </span>
      {!user.email && (
        <span className="small">
          {user.emailPending
            ? t('Zuerst die E-Mail-Adresse bestätigen: Der Link ist an {email} unterwegs. Danach hier weiter.', { email: user.emailPending })
            : t('Dafür braucht dein Konto eine bestätigte E-Mail-Adresse, an sie geht die Antwort. Sie dient nur deinem Konto.')}
        </span>
      )}
      <span className="muted small">{t('Mitspielen geht ohne Freigabe, mit einer Einladung deiner SL.')}</span>
      <ErrorBox error={error} />
      <div className="row wrap" style={{ gap: 8 }}>
        {user.email ? (
          <button type="button" className="btn" disabled={busy} onClick={ask}>{busy ? t('Einen Moment …') : t('Anfrage senden')}</button>
        ) : user.emailPending ? (
          <button type="button" className="btn" disabled={busy} onClick={() => run(reload)}>{t('Ich habe bestätigt')}</button>
        ) : (
          <Link className="btn" to={`/konto?email=${encodeURIComponent(conn.id)}`} onClick={onClose}>{t('E-Mail eintragen')}</Link>
        )}
        <button type="button" className="btn ghost" onClick={onClose}>{t('Abbrechen')}</button>
      </div>
    </Dialog>
  );
}

const SEEN = (connId: string) => `taleward.gmDecision.${connId}`;

/** Entscheidung schon gesehen? (je Gerät, je Entscheidung – eine neue Entscheidung zeigt sich wieder) */
function decisionSeen(connId: string, at: string): boolean {
  try { return localStorage.getItem(SEEN(connId)) === at; } catch { return true; }
}

/**
 * Freigabe erteilt oder abgelehnt: einmal als Fenster zum Bestätigen. Ohne Zeitpunkt (z. B. Konten, die beim Update
 * übernommen wurden) kein Fenster.
 */
export function GmDecision({ conn, info, user }: { conn: Connection; info: ServerInfo; user: User }) {
  const [closed, setClosed] = useState(false);
  const at = user.gmDecidedAt;
  if (closed || info.gmApproval !== 'required' || !at || decisionSeen(conn.id, at)) return null;
  if (user.gmPermission !== 'granted' && user.gmPermission !== 'rejected') return null;
  const ok = () => {
    try { localStorage.setItem(SEEN(conn.id), at); } catch { /* dann eben noch einmal */ }
    setClosed(true);
  };
  const operator = info.operator || conn.name;
  const granted = user.gmPermission === 'granted';
  return (
    <Dialog title={granted ? t('SL-Freigabe erteilt') : t('SL-Freigabe abgelehnt')} onClose={ok}>
      <span className="small">
        {granted
          ? t('Du kannst auf „{server}“ jetzt eigene Kampagnen anlegen.', { server: conn.name })
          : info.contact
            ? t('{operator} hat deine Anfrage abgelehnt. Fragen dazu gehen an {contact}.', { operator, contact: info.contact })
            : t('{operator} hat deine Anfrage abgelehnt. Fragen dazu gehen an die Verwaltung des Servers.', { operator })}
      </span>
      {!granted && <span className="muted small">{t('Mitspielen geht ohne Freigabe, mit einer Einladung deiner SL.')}</span>}
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={ok} autoFocus>{t('Verstanden')}</button>
    </Dialog>
  );
}
