import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFor, isApiError } from '../api/client';
import { hasValidToken, updateConnection, type Connection } from '../api/connections';
import type { ServerInfo, User } from '../api/types';
import { t } from '../i18n';
import { ErrorBox } from './Screen';

/*
 * Nutzungsbedingungen und Impressum je Server (ab Schnittstelle 0.4.22). Jeder Server hat eigene Bedingungen; ändert
 * der Betreiber sie, stimmt jede Person neu zu. Bis dahin geht auf diesem Server nur Lesen (der Server setzt das durch).
 */

interface TermsState {
  info: ServerInfo;
  user: User;
}

/** Server-Angaben und eigenes Profil laden – nur, wenn der Server Nutzungsbedingungen meldet */
function useTerms(conn: Connection) {
  const [state, setState] = useState<TermsState | null>(null);
  const [reload, setReload] = useState(0);
  const valid = hasValidToken(conn);
  useEffect(() => {
    if (!valid) return;
    let gone = false;
    const api = apiFor(conn);
    api.info().then(async (info) => {
      if (!info.termsUrl || !info.termsVersion) return;
      const user = await api.me();
      if (!gone) setState({ info, user });
    }).catch(() => undefined);
    return () => { gone = true; };
  }, [conn.id, conn.token, valid, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const outdated = !!state && (state.user.termsAcceptedVersion ?? 0) < (state.info.termsVersion ?? 0);
  return { state, outdated, refresh: () => setReload((n) => n + 1), setUser: (user: User) => setState((s) => (s ? { ...s, user } : s)) };
}

/** Karte, solange eine neue Fassung auf Zustimmung wartet (Kampagnenliste, Übersicht) */
export function TermsReminder({ conn }: { conn: Connection }) {
  const { state, outdated, refresh, setUser } = useTerms(conn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!state || !outdated) return null;
  const { info } = state;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await apiFor(conn).acceptTerms(info.termsVersion!);
      updateConnection(conn.id, { user: { ...(conn.user ?? user), ...user } });
      setUser(user);
    } catch (e) {
      // Inzwischen gibt es schon wieder eine neuere Fassung: neu laden und noch einmal zeigen
      if (isApiError(e, 'terms_changed')) refresh();
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card task terms-reminder" aria-labelledby={`terms-${conn.id}`}>
      <strong id={`terms-${conn.id}`}>{t('Neue Nutzungsbedingungen bei „{name}“', { name: conn.name })}</strong>
      <span className="small">
        {state.user.termsAcceptedVersion
          ? t('{operator} hat die Nutzungsbedingungen geändert. Bis du zustimmst, kannst du auf diesem Server nur lesen.', { operator: info.operator })
          : t('{operator} hat jetzt Nutzungsbedingungen. Bis du zustimmst, kannst du auf diesem Server nur lesen.', { operator: info.operator })}
      </span>
      <a className="small tap-link" href={info.termsUrl!} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>{t('Nutzungsbedingungen lesen')}</a>
      <ErrorBox error={error} />
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn small outline" disabled={busy} onClick={accept}>{t('Zustimmen')}</button>
        <Link className="linklike small tap-link" to="/konto">{t('Nicht einverstanden? Konto löschen')}</Link>
      </div>
    </section>
  );
}

/** Unter „Konten und Server“: wer den Server betreibt, mit Impressum, Datenschutz und Nutzungsbedingungen */
export function ServerLegal({ conn }: { conn: Connection }) {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    apiFor(conn).info().then(setInfo).catch(() => setInfo(null));
  }, [conn.id, conn.baseUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) return null;
  const links = [
    info.legalNoticeUrl ? { href: info.legalNoticeUrl, label: t('Impressum') } : null,
    info.privacyPolicyUrl ? { href: info.privacyPolicyUrl, label: t('Datenschutz') } : null,
    info.termsUrl ? { href: info.termsUrl, label: t('Nutzungsbedingungen') } : null
  ].filter((x): x is { href: string; label: string } => !!x);
  return (
    <div className="server-legal small">
      <span>
        {t('Betrieben von {operator}', { operator: info.operator })}
        {info.contact ? ' · ' + info.contact : ''}
      </span>
      {links.length > 0 && (
        <span className="row wrap" style={{ gap: '0 16px' }}>
          {links.map((l) => <a key={l.label} className="tap-link" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}
        </span>
      )}
    </div>
  );
}
