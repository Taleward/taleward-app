import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiFor, isApiError } from '../api/client';
import { getConnection, hasValidToken, updateConnection, type Connection } from '../api/connections';
import type { ServerInfo, User } from '../api/types';
import { t } from '../i18n';
import { ErrorBox } from './Screen';
import { Dialog } from './Dialog';

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
      // Ohne Fassung: keine Nutzungsbedingungen. Mit Fassung, aber ohne (lesbare) Adresse: unten als Hinweis
      if (!info.termsVersion) return;
      const user = await api.me();
      if (!gone) setState({ info, user });
    }).catch(() => undefined);
    return () => { gone = true; };
  }, [conn.id, conn.token, valid, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  // Zugestimmt an anderer Stelle (Fenster, Kampagnenliste): alle Karten dieses Servers verschwinden zugleich
  useEffect(() => onTermsAccepted((id, user) => { if (id === conn.id) setState((s) => (s ? { ...s, user } : s)); }), [conn.id]);
  const outdated = !!state && (state.user.termsAcceptedVersion ?? 0) < (state.info.termsVersion ?? 0);
  return { state, outdated, refresh: () => setReload((n) => n + 1), setUser: (user: User) => setState((s) => (s ? { ...s, user } : s)) };
}

/** Karte, solange eine neue Fassung auf Zustimmung wartet (Kampagnenliste) */
export function TermsReminder({ conn }: { conn: Connection }) {
  return useTermsNotice(conn);
}

/** Meldet der Server 403 terms_required (irgendwo in der App), kommt dieselbe Karte als Fenster */
export const TERMS_REQUIRED_EVENT = 'taleward:terms-required';

// Nach „Später“ eine Weile Ruhe: Auch Hintergrund-Anfragen (z. B. „gelesen“) melden terms_required
const quietUntil = new Map<string, number>();
const QUIET_MS = 10 * 60_000;

/** Das Fenster gezielt öffnen (z. B. vor dem Anlegen einer Kampagne), auch kurz nach „Später“ */
export function askTerms(connId: string): void {
  quietUntil.delete(connId);
  window.dispatchEvent(new CustomEvent(TERMS_REQUIRED_EVENT, { detail: connId }));
}

/** Nach der Zustimmung: wer auf dem Server wartet, erfährt es (Banner weg, alte Fehlermeldung weg) */
export const TERMS_ACCEPTED_EVENT = 'taleward:terms-accepted';

export function onTermsAccepted(cb: (connId: string, user: User) => void): () => void {
  const on = (e: Event) => {
    const d = (e as CustomEvent<{ connId: string; user: User }>).detail;
    if (d) cb(d.connId, d.user);
  };
  window.addEventListener(TERMS_ACCEPTED_EVENT, on);
  return () => window.removeEventListener(TERMS_ACCEPTED_EVENT, on);
}

export function TermsGate() {
  const [connId, setConnId] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if ((quietUntil.get(id) ?? 0) > Date.now()) return;
      setConnId(id);
    };
    window.addEventListener(TERMS_REQUIRED_EVENT, on);
    return () => window.removeEventListener(TERMS_REQUIRED_EVENT, on);
  }, []);
  const conn = connId ? getConnection(connId) : undefined;
  if (!conn) return null;
  const later = () => {
    quietUntil.set(conn.id, Date.now() + QUIET_MS);
    setConnId(null);
  };
  return <TermsDialog key={conn.id} conn={conn} onClose={later} onDone={() => setConnId(null)} />;
}

function TermsDialog({ conn, onClose, onDone }: { conn: Connection; onClose: () => void; onDone: () => void }) {
  const notice = useTermsNotice(conn, onDone);
  // Schon zugestimmt (z. B. auf einem anderen Gerät): nichts zu zeigen
  const { state, outdated } = useTerms(conn);
  useEffect(() => { if (state && !outdated) onDone(); }, [state, outdated]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog title={t('Nutzungsbedingungen')} onClose={onClose}>
      {notice ?? <span className="muted">{t('Lade …')}</span>}
      <button type="button" className="linklike small tap-link" style={{ alignSelf: 'flex-start' }} onClick={onClose}>{t('Später')}</button>
    </Dialog>
  );
}

/**
 * Dieselbe Karte als Inhalt – null, solange nichts zuzustimmen ist. Die Übersicht zeigt sie als Zeile in „Jetzt dran“.
 */
export function useTermsNotice(conn: Connection, onAccepted?: () => void): ReactNode {
  const { state, outdated, refresh, setUser } = useTerms(conn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!state || !outdated) return null;
  const { info } = state;
  // Der Server meldet eine Fassung, aber keine Adresse, die die App öffnen darf: nicht still zustimmen
  if (!info.termsUrl) {
    return (
      <section className="card task terms-reminder" aria-labelledby={`terms-${conn.id}`}>
        <strong id={`terms-${conn.id}`}>{t('Neue Nutzungsbedingungen bei „{name}“', { name: conn.name })}</strong>
        <span className="small">{t('Der Server nennt keine Adresse, unter der du sie lesen kannst. Bis du zustimmst, kannst du hier nur lesen. Sag deiner SL oder {operator} Bescheid.', { operator: info.operator })}</span>
      </section>
    );
  }

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await apiFor(conn).acceptTerms(info.termsVersion!);
      updateConnection(conn.id, { user: { ...(conn.user ?? user), ...user } });
      setUser(user);
      window.dispatchEvent(new CustomEvent(TERMS_ACCEPTED_EVENT, { detail: { connId: conn.id, user } }));
      onAccepted?.();
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
