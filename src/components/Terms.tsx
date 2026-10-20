import { useEffect, useState, type ReactNode } from 'react';
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

/** Karte, solange eine neue Fassung auf Zustimmung wartet (Kampagnenliste) */
export function TermsReminder({ conn }: { conn: Connection }) {
  return useTermsNotice(conn);
}

/**
 * Dieselbe Karte als Inhalt – null, solange nichts zuzustimmen ist. Die Übersicht zeigt sie als Zeile in „Jetzt dran“.
 */
export function useTermsNotice(conn: Connection): ReactNode {
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
      <ErrorBox error={error} />
      <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={accept}>{t('Zustimmen')}</button>
      <span className="row wrap small" style={{ gap: '0 16px' }}>
        <a className="tap-link" href={info.termsUrl!} target="_blank" rel="noreferrer">{t('Nutzungsbedingungen lesen')}</a>
        <Link className="tap-link" to={`/konto?loeschen=${encodeURIComponent(conn.id)}`}>{t('Nicht einverstanden? Konto löschen')}</Link>
      </span>
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
      {/* Der Betreiber steht schon über der Karte; hier nur Kontakt und Rechtliches */}
      {info.contact && <span>{t('Kontakt: {contact}', { contact: info.contact })}</span>}
      {links.length > 0 && (
        <span className="row wrap" style={{ gap: '0 16px' }}>
          {links.map((l) => <a key={l.label} className="tap-link" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}
        </span>
      )}
    </div>
  );
}
