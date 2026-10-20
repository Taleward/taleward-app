import { isUnencrypted } from '../api/addresses';
import { oidcErrorText } from './ConnectPage';
import { LoginSettings } from '../components/LoginSettings';
import { ImportCampaign } from '../components/ImportCampaign';
import { confirmDialog } from '../components/confirm';
import { ThemeSwitch } from '../themeMode';
import { NotifySettingsSection } from '../notify/NotifySettings';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFor } from '../api/client';
import { APP_VERSION, apiAtLeast, hasValidToken, isOutdated, removeConnection, type Connection } from '../api/connections';
import { useAuth } from '../auth/AuthContext';
import { IconInfo } from '../components/Icons';
import { ErrorBox, Screen } from '../components/Screen';
import { formatDateFull } from '../components/format';
import { LanguageSwitch, t, tn } from '../i18n';
import { recordingsOf, removeRecordingsOf } from '../recorder/webStore';
import { ServerLegal } from '../components/Terms';

/** Konten und Server: pro Server abmelden, Daten herunterladen, Konto löschen, Stimmprofil. */
/** Quellcode dieser App – Pflicht nach AGPL §13 für Nutzer über das Netzwerk */
const SOURCE_URL = 'https://github.com/Taleward/taleward-app';

export function AccountPage() {
  const { connections } = useAuth();
  const navigate = useNavigate();
  const query = new URLSearchParams(useLocation().search);
  const linked = query.get('linked');
  const oidcError = query.get('oidc') === 'error' ? query.get('code') ?? 'oidc_failed' : null;
  return (
    <Screen narrow backTo={{ to: '/', label: t('Deine Kampagnen') }} title={t('Konten und Server')} nav={false}>
      <p className="muted" style={{ margin: 0 }}>
        {t('Jeder Server hat ein eigenes Konto.')}
      </p>
      {oidcError && <div className="error" role="alert">{oidcErrorText(oidcError)}</div>}
      {linked && <div className="notice">{t('{name} ist jetzt mit deinem Konto verbunden.', { name: linked.charAt(0).toUpperCase() + linked.slice(1) })}</div>}
      {connections.map((c) => <ConnectionCard key={c.id} conn={c} />)}
      <button type="button" className="btn outline" onClick={() => navigate('/verbinden')}>{t('Weiteren Server verbinden')}</button>
      <section className="card">
        <h2>{t('Einstellungen')}</h2>
        <LanguageSwitch />
        <ThemeSwitch />
      </section>
      <NotifySettingsSection />
      <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
        {t('Taleward {v}', { v: APP_VERSION })} · <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{t('Quellcode (AGPL-3.0)')}</a>
        <br />
        {t('Schriften: Alegreya und Alegreya Sans von Huerta Tipográfica, SIL Open Font License 1.1.')}
      </p>
    </Screen>
  );
}

function ConnectionCard({ conn }: { conn: Connection }) {
  const navigate = useNavigate();
  // Aus der Karte „Neue Nutzungsbedingungen“: direkt zu „Daten und Konto löschen“ dieses Servers
  const [params] = useSearchParams();
  const openDelete = params.get('loeschen') === conn.id;
  const deleteRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (openDelete) deleteRef.current?.scrollIntoView({ block: 'center' });
  }, [openDelete]);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const valid = hasValidToken(conn);

  const exportData = async () => {
    setError(null);
    try {
      const blob = await apiFor(conn).exportMe();
      const file = new File([blob], `taleward-${conn.id}-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
      // Auf dem Handy über „Teilen“ (Speichern, Mail …), im Browser als Download
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t('Meine Daten') });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e);
    }
  };

  // Noch nicht hochgeladene Aufnahmen dieses Servers im Browser nicht still liegen lassen: vorher fragen, dann löschen
  // deleteNow false: nur fragen, gelöscht wird erst, wenn der folgende Schritt geklappt hat
  const recordingsCleared = async (confirmLabel: string, deleteNow = true): Promise<boolean> => {
    const left = await recordingsOf(conn.id).catch(() => []);
    if (!left.length) return true;
    const ok = await confirmDialog(tn(left.length,
      'Auf diesem Gerät liegt noch eine Aufnahme von „{name}“, die nicht hochgeladen ist. Zum Hochladen brich hier ab und öffne die Aufnahme-Seite der Kampagne. Sonst wird sie jetzt gelöscht.',
      'Auf diesem Gerät liegen noch {n} Aufnahmen von „{name}“, die nicht hochgeladen sind. Zum Hochladen brich hier ab und öffne die Aufnahme-Seite der Kampagne. Sonst werden sie jetzt gelöscht.',
      { name: conn.name }), { confirmLabel, danger: true });
    if (ok && deleteNow) await removeRecordingsOf(conn.id).catch(() => undefined);
    return ok;
  };

  const signOut = async () => {
    if (!(await confirmDialog(t('Von „{name}“ abmelden? Deine Daten auf dem Server bleiben erhalten.', { name: conn.name }), { confirmLabel: t('Abmelden') }))) return;
    if (!(await recordingsCleared(t('Löschen und abmelden')))) return;
    removeConnection(conn.id);
  };

  const deleteAccount = async () => {
    if (!(await recordingsCleared(t('Aufnahmen löschen'), false))) return;
    setBusy(true);
    setError(null);
    try {
      await apiFor(conn).deleteMe(conn.user?.hasPassword === false ? { confirmUsername: password } : { password });
      // Erst jetzt, da das Konto gelöscht ist, die Aufnahmen im Browser löschen (scheitert es, bleiben sie zum Hochladen)
      await removeRecordingsOf(conn.id).catch(() => undefined);
      removeConnection(conn.id);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <span className="overline">{conn.operator ?? t('Server')}</span>
      <h2>{conn.name}</h2>
      <div className="muted small" style={{ wordBreak: 'break-all' }}>{conn.baseUrl}</div>
      {isUnencrypted(conn.baseUrl) && (
        <div className="notice">
          <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
          <span>{t('Unverschlüsselt – nur im Heimnetz verwenden.')}</span>
        </div>
      )}
      {conn.user && <div className="small">{t('Angemeldet als {name}', { name: conn.user.displayName })} ({conn.user.username})</div>}
      {valid && conn.expiresAt && <div className="muted small">{t('Anmeldung gültig bis {date}', { date: formatDateFull(conn.expiresAt) })}</div>}
      <ServerLegal conn={conn} />
      {isOutdated(conn.apiVersion) && (
        <div className="notice">
          <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
          <span>{t('Dieser Server ist älter als die App (Version {v}). Manche Funktionen fehlen dort noch.', { v: conn.apiVersion ?? '?' })}</span>
        </div>
      )}
      <ErrorBox error={error} />

      {!valid ? (
        <button type="button" className="btn small" onClick={() => navigate(`/verbinden?server=${encodeURIComponent(conn.baseUrl)}`)}>{t('Neu anmelden')}</button>
      ) : deleting ? (
        <div className="card warn" style={{ gap: 10 }}>
          <strong>{t('Konto auf „{name}“ löschen', { name: conn.name })}</strong>
          <span className="small">
            {t('Gelöscht werden: Konto, Charakterbilder, Zustimmungen, Stimmprofil. Deine Kommentare bleiben als „Gelöschtes Konto“ stehen, damit Gespräche verständlich bleiben. Kampagnen, in denen sonst niemand ist, werden mitgelöscht; solche mit anderen Mitgliedern musst du vorher an eine andere SL übergeben.')}
          </span>
          <div className="field">
            <label htmlFor={`del-${conn.id}`}>{conn.user?.hasPassword === false ? t('Zur Bestätigung dein Benutzername') : t('Zur Bestätigung dein Passwort')}</label>
            <input id={`del-${conn.id}`} type={conn.user?.hasPassword === false ? 'text' : 'password'} autoCapitalize="none"
              autoComplete={conn.user?.hasPassword === false ? 'off' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn small danger" disabled={!password || busy} onClick={deleteAccount}>{t('Endgültig löschen')}</button>
            <button type="button" className="btn small ghost" onClick={() => setDeleting(false)}>{t('Abbrechen')}</button>
          </div>
        </div>
      ) : (
        <>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link className="btn small outline" to={`/v/${conn.id}/profil/stimme`}>{t('Mein Stimmprofil')}</Link>
          <button type="button" className="btn small outline" onClick={signOut}>{t('Abmelden')}</button>
        </div>
        <LoginSettings conn={conn} />
        {/* Umzug von einem anderen Server (ab 0.4.8) – selten gebraucht, darum hier statt auf der Kampagnenliste */}
        {apiAtLeast('0.4.8', conn) && (importing
          ? <ImportCampaign servers={[conn]} onCancel={() => setImporting(false)} />
          : <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start' }} onClick={() => setImporting(true)}>{t('Kampagne aus Datei übernehmen')}</button>)}
        {/* Selten gebraucht – eingeklappt */}
        <details className="card" style={{ gap: 10 }} ref={deleteRef} open={openDelete || undefined}>
          <summary style={{ fontWeight: 700 }}>{t('Daten und Konto löschen')}</summary>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn small outline" onClick={exportData}>{t('Meine Daten herunterladen')}</button>
            <button type="button" className="btn small danger outline" onClick={() => setDeleting(true)}>{t('Konto löschen')}</button>
          </div>
        </details>
        </>
      )}
    </section>
  );
}
