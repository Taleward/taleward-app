import { isUnencrypted } from '../api/addresses';
import { resetTour } from '../tour/steps';
import { oidcErrorText } from './ConnectPage';
import { LoginSettings } from '../components/LoginSettings';
import { ImportCampaign } from '../components/ImportCampaign';
import { confirmDialog } from '../components/confirm';
import { ThemeRow } from '../themeMode';
import { NotifySettingsSection } from '../notify/NotifySettings';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFor } from '../api/client';
import { APP_VERSION, apiAtLeast, getConnection, hasValidToken, isOutdated, removeConnection, type Connection } from '../api/connections';
import { useAuth } from '../auth/AuthContext';
import { IconBell, IconDownload, IconGlobe, IconInfo, IconLogOut, IconMic, IconMoon, IconPlus, IconRoute, IconServer, IconTrash, IconWallet } from '../components/Icons';
import { ErrorBox, Screen } from '../components/Screen';
import { formatDateFull } from '../components/format';
import { LanguageRow, t, tn } from '../i18n';
import { recordingsOf, removeRecordingsOf } from '../recorder/webStore';
import { ServerLegal } from '../components/Terms';
import { gmState, type GmState } from '../auth/serverAccess';
import { billingOn } from '../billing/rules';
import { eur } from '../billing/CreditWaitNote';
import type { VoiceProfile } from '../api/types';

/** Quellcode dieser App – Pflicht nach AGPL §13 für Nutzer über das Netzwerk */
const SOURCE_URL = 'https://github.com/Taleward/taleward-app';

/**
 * Konten und Server: oben die Server (je eine Zeile, Einzelheiten auf einer eigenen Seite), darunter die Einstellungen
 * der App. Alles als Zeilen, damit die Seite ruhig bleibt.
 */
export function AccountPage() {
  const { connections } = useAuth();
  const navigate = useNavigate();
  const query = new URLSearchParams(useLocation().search);
  const linked = query.get('linked');
  const oidcError = query.get('oidc') === 'error' ? query.get('code') ?? 'oidc_failed' : null;
  // Alte Verweise (?email=<id>, ?loeschen=<id>) führen auf die Seite des Servers
  const emailFor = query.get('email');
  const deleteFor = query.get('loeschen');
  const target = emailFor ?? deleteFor;
  if (target && getConnection(target)) {
    return <Navigate to={`/konto/${encodeURIComponent(target)}?${emailFor ? 'email=1' : 'loeschen=1'}`} replace />;
  }
  return (
    <Screen narrow backTo={{ to: '/', label: t('Deine Kampagnen') }} title={t('Konten und Server')} nav={false}>
      {oidcError && <div className="error" role="alert">{oidcErrorText(oidcError)}</div>}
      {linked && <div className="notice">{t('{name} ist jetzt mit deinem Konto verbunden.', { name: linked.charAt(0).toUpperCase() + linked.slice(1) })}</div>}
      <h2 className="list-head">{t('Deine Server')}</h2>
      <div className="list-box">
        {connections.map((c) => (
          <Link key={c.id} className="list-row" to={`/konto/${encodeURIComponent(c.id)}`}>
            <IconServer />
            <span className="lr-text">
              {c.name}
              <span className="lr-sub">{hasValidToken(c) ? c.user?.displayName ?? '' : t('Abgemeldet – neu anmelden')}</span>
            </span>
          </Link>
        ))}
        <button type="button" className="list-row" onClick={() => navigate('/verbinden')}>
          <IconPlus />
          <span className="lr-text" style={{ fontWeight: 700 }}>{t('Weiteren Server verbinden')}</span>
        </button>
      </div>
      <h2 className="list-head">{t('App')}</h2>
      <div className="list-box">
        <LanguageRow icon={<IconGlobe />} />
        <ThemeRow icon={<IconMoon />} />
        <NotifySettingsSection icon={<IconBell />} />
        <TourAgain />
      </div>
      <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
        {t('Taleward {v}', { v: APP_VERSION })} · <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{t('Quellcode (AGPL-3.0)')}</a>
        <br />
        {t('Schriften: Alegreya und Alegreya Sans von Huerta Tipográfica, SIL Open Font License 1.1.')}
      </p>
    </Screen>
  );
}

/** Ein Server: Konto, Guthaben, Stimmprofil, Umzug – darunter Seltenes (Rechtliches, Löschen, Abmelden) */
export function ServerAccountPage() {
  const { connId = '' } = useParams();
  const conn = getConnection(connId);
  if (!conn) return <Navigate to="/konto" replace />;
  return (
    <Screen narrow backTo={{ to: '/konto', label: t('Konten und Server') }} overline={conn.operator ?? t('Server')} title={conn.name} nav={false}>
      <ServerDetails key={conn.id} conn={conn} />
    </Screen>
  );
}

function ServerDetails({ conn }: { conn: Connection }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openDelete = params.get('loeschen') === '1';
  const deleteRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (openDelete) deleteRef.current?.scrollIntoView({ block: 'center' });
  }, [openDelete]);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  // Kampagne aus einer Datei übernehmen heißt: neue Kampagne als SL – auf manchen Servern erst nach der SL-Freigabe
  const [gm, setGm] = useState<GmState>('ok');
  const [billing, setBilling] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [voice, setVoice] = useState<VoiceProfile['status'] | null>(null);
  const valid = hasValidToken(conn);
  useEffect(() => {
    if (!valid) return;
    const api = apiFor(conn);
    api.info().then(async (info) => {
      setBilling(billingOn(info));
      if (billingOn(info)) api.credits().then((list) => setBalance(list.find((c) => c.kind === 'account')?.balanceCents ?? null)).catch(() => undefined);
      if (info.gmApproval === 'required') setGm(gmState(info, await api.me()));
    }).catch(() => undefined);
    api.voiceProfile().then((v) => setVoice(v.status)).catch(() => undefined);
  }, [conn.id, conn.token]); // eslint-disable-line react-hooks/exhaustive-deps
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

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
    navigate('/konto', { replace: true });
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

  const voiceText = voice === 'ready' ? t('Angelegt') : voice === 'processing' ? t('Wird gerade erstellt') : t('Freiwillig, nicht angelegt');

  return (
    <>
      {conn.user && <span className="muted small" style={{ marginTop: -8 }}>{t('Angemeldet als {name}', { name: conn.user.displayName })} ({conn.user.username})</span>}
      {isUnencrypted(conn.baseUrl) && (
        <div className="notice">
          <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
          <span>{t('Unverschlüsselt – nur im Heimnetz verwenden.')}</span>
        </div>
      )}
      {isOutdated(conn.apiVersion) && (
        <div className="notice">
          <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
          <span>{t('Dieser Server ist älter als die App (Version {v}). Manche Funktionen fehlen dort noch.', { v: conn.apiVersion ?? '?' })}</span>
        </div>
      )}
      <ErrorBox error={error} />

      {!valid ? (
        <button type="button" className="btn" onClick={() => navigate(`/verbinden?server=${encodeURIComponent(conn.baseUrl)}`)}>{t('Neu anmelden')}</button>
      ) : (
        <div className="list-box">
          <LoginSettings conn={conn} open={params.get('email') === '1'} />
          {billing && (
            <Link className="list-row" to={`/v/${conn.id}/guthaben`}>
              <IconWallet />
              <span className="lr-text">{t('Guthaben')}</span>
              {balance !== null && <span className="lr-val">{eur(balance)}</span>}
            </Link>
          )}
          <Link className="list-row" to={`/v/${conn.id}/profil/stimme`}>
            <IconMic size={22} />
            <span className="lr-text">{t('Stimmprofil')}<span className="lr-sub">{voiceText}</span></span>
          </Link>
          {/* Umzug von einem anderen Server (ab 0.4.8) – selten gebraucht, darum hier statt auf der Kampagnenliste */}
          {apiAtLeast('0.4.8', conn) && (
            <details className="list-item" open={importing || undefined} onToggle={(e) => setImporting((e.target as HTMLDetailsElement).open)}>
              <summary className="list-row"><IconDownload /><span className="lr-text">{t('Kampagne aus Datei übernehmen')}</span></summary>
              <div className="list-body">
                {gm !== 'ok'
                  ? <span className="muted small">{t('Geht hier erst nach der SL-Freigabe. Anfragen kannst du unter „Deine Kampagnen“.')}</span>
                  : importing && <ImportCampaign servers={[conn]} onCancel={() => setImporting(false)} />}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="list-box">
        <details className="list-item">
          <summary className="list-row"><IconInfo /><span className="lr-text">{t('Server und Rechtliches')}<span className="lr-sub">{t('Adresse, Impressum, Nutzungsbedingungen')}</span></span></summary>
          <div className="list-body">
            <div className="muted small" style={{ wordBreak: 'break-all' }}>{conn.baseUrl}</div>
            {valid && conn.expiresAt && <div className="muted small">{t('Anmeldung gültig bis {date}', { date: formatDateFull(conn.expiresAt) })}</div>}
            <ServerLegal conn={conn} />
          </div>
        </details>
        {valid && (
          <details className="list-item" ref={deleteRef} open={openDelete || undefined}>
            <summary className="list-row"><IconTrash /><span className="lr-text">{t('Daten herunterladen oder Konto löschen')}</span></summary>
            <div className="list-body">
              {deleting ? (
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
                <div className="row wrap" style={{ gap: 8 }}>
                  <button type="button" className="btn small outline" onClick={exportData}>{t('Meine Daten herunterladen')}</button>
                  <button type="button" className="btn small danger outline" onClick={() => setDeleting(true)}>{t('Konto löschen')}</button>
                </div>
              )}
            </div>
          </details>
        )}
        <button type="button" className="list-row" onClick={signOut}>
          <IconLogOut />
          <span className="lr-text">{t('Abmelden')}</span>
        </button>
      </div>
    </>
  );
}

/** Die kurze Tour startet beim nächsten Öffnen einer Kampagne wieder */
function TourAgain() {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="list-row" onClick={() => { resetTour(); setDone(true); }}>
      <IconRoute />
      <span className="lr-text">
        {t('Tour noch einmal zeigen')}
        {done && <span className="lr-sub" role="status">{t('Sie startet beim nächsten Öffnen einer Kampagne.')}</span>}
      </span>
    </button>
  );
}
