import { ProviderButton } from '../components/ProviderButton';
import { inDesktopShell } from '../display/desktopShell';
import { clearPendingRegister, readPendingRegister, startProviderLogin, type PendingRegister } from '../auth/oidc';
import { LinkInput } from '../components/LinkInput';
import { DownloadButton } from '../components/UpdateNotices';
import { Wordmark } from '../components/Wordmark';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFor, fetchInvitePreview, fetchServerInfo, isApiError } from '../api/client';
import {
  APP_VERSION, getConnection, isOutdated, listConnections, normalizeBaseUrl, versionLess, parseInvite, REQUIRED_API_VERSION,
  saveConnection, updateConnection, type Connection
} from '../api/connections';
import { adoptsMovedConnection, isPlausibleMove, ownServerBase } from '../api/addresses';
import type { InvitePreview, ServerInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { IconInfo } from '../components/Icons';
import { Divider, ErrorBox } from '../components/Screen';
import { MusterTry } from '../components/Muster';
import { isMusterUrl } from '../api/muster';
import { Missing } from '../components/Missing';
import { codeRequired, registrationCodes, registrationMode, type RegistrationMode } from '../auth/serverAccess';
import { LanguageSwitch, getLang, t } from '../i18n';

const DEFAULT_SERVER: string = import.meta.env.VITE_API_BASE ?? '';
const MOCK = import.meta.env.VITE_API_MODE === 'mock';
// Web-App unter /app/ eines Servers (z. B. im Programmfenster auf dem PC): dieser Server ist vorgegeben
const OWN_SERVER = MOCK ? null : ownServerBase(window.location);

/**
 * Mit einem Server verbinden: Adresse oder Einladungslink eingeben, Server prüfen,
 * dann anmelden oder mit Einladungscode ein Konto anlegen. Ein Token gilt immer nur für diesen Server.
 */
export function ConnectPage() {
  const navigate = useNavigate();
  const { active } = useAuth();
  const params = new URLSearchParams(useLocation().search);
  const [address, setAddress] = useState(params.get('invite') ?? params.get('server') ?? (MOCK ? '/api/v1' : OWN_SERVER ?? DEFAULT_SERVER));
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  // Wohin die Einladung führt (ab Schnittstelle 0.4.10)
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [age, setAge] = useState(false);
  // Nutzungsbedingungen des Betreibers (ab 0.4.22)
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const oidc = params.get('oidc');
  const [pendingReg] = useState(() => (oidc === 'register' ? readPendingRegister() : null));
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  // Derselbe Server (gleiche serverId, ab 0.4.16) ist schon unter einer anderen Adresse gespeichert
  const [moved, setMoved] = useState<Connection | null>(null);

  // Kommt die Seite über einen Einladungslink (App-Link oder „Einladung annehmen“), gleich weiter prüfen
  useEffect(() => {
    if (params.get('invite') || params.get('oidc') || (OWN_SERVER && !active.length && !params.get('server'))) checkServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkServer = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!address.trim()) {
      setTried(true);
      document.getElementById('address')?.focus();
      return;
    }
    setTried(false);
    const invite = parseInvite(address);
    let url: string;
    try {
      url = invite?.baseUrl ?? normalizeBaseUrl(invite ? DEFAULT_SERVER || '/api/v1' : address);
    } catch {
      setError(new Error(t('Das ist keine gültige Adresse.')));
      return;
    }
    if (invite) {
      setCode(invite.code);
      setMode('register');
    }
    setBusy(true);
    try {
      const i = await fetchServerInfo(url);
      setPreview(null);
      if (invite && i.apiVersion && !versionLess(i.apiVersion, '0.4.10')) {
        // Ungültiger Code: gleich hier sagen, nicht erst nach dem Anlegen des Kontos
        setPreview(await fetchInvitePreview(url, invite.code));
      }
      // Nur im Heimnetz oder unter demselben Hostnamen – die serverId allein beweist nichts
      const same = i.serverId
        ? listConnections().find((c) => c.serverId === i.serverId && c.baseUrl !== url && isPlausibleMove(c.baseUrl, url))
        : undefined;
      setMoved(same ?? null);
      if (same) {
        setMode('login');
        setUsername(same.user?.username ?? '');
      }
      setInfo(i);
      setBaseUrl(url);
    } catch (err) {
      if (isApiError(err, 'invite_invalid')) {
        setError(err);
        return;
      }
      // http:// mit öffentlicher Adresse versucht die App über https; antwortet dort niemand, sagt sie das deutlich
      const upgraded = /^\s*http:\/\//i.test(address) && url.startsWith('https://');
      if (upgraded) setError(new Error(t('Dieser Server ist nicht verschlüsselt erreichbar. Außerhalb des Heimnetzes verbindet sich Taleward nur über https.')));
      else setError(isApiError(err) && err.status === 0 ? err : new Error(t('Unter dieser Adresse antwortet kein Taleward-Server.')));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (conn: Connection, invite: string | null) => {
    if (invite) {
      // Nach einem Adresswechsel ist man meist schon dabei – dann einfach zur Kampagnenliste
      const c = await apiFor(conn).joinCampaign(invite).catch((e) => { if (moved) return null; throw e; });
      navigate(c ? `/v/${conn.id}/k/${c.id}/willkommen` : '/', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!baseUrl || !info) return;
    setTried(true);
    if (missing) return;
    setBusy(true);
    setError(null);
    try {
      const fields = { baseUrl, name: info.name, operator: info.operator, apiVersion: info.apiVersion, token: null, expiresAt: null, serverId: info.serverId ?? null };
      // Neue Adresse eines bekannten Servers: erst anmelden, ohne die gespeicherte Verbindung anzufassen
      const probe: Connection = moved ? { ...fields, id: '_probe', user: null } : saveConnection({ ...fields, user: null });
      // Registrieren: Einladung oder allgemeiner Registrierungscode (ab 0.4.23); beim Anmelden ist ein Code immer eine Einladung
      const codes = mode === 'login'
        ? registrationCodes('invite_only', code, true)
        : await codesFor(regMode, code, baseUrl, !!preview);
      const res = mode === 'login'
        ? await apiFor(probe).login(username.trim(), password)
        : await apiFor(probe).register({ ...codes, username: username.trim(), displayName: displayName.trim(), password, acceptPrivacy: true, ageConfirmed: true, ...termsConsent(info) });
      const login = { token: res.accessToken, expiresAt: res.expiresAt, user: res.user };
      let conn: Connection;
      if (moved && adoptsMovedConnection(moved.user?.id, res.user.id)) {
        // Dasselbe Konto: Verbindung behalten (Kampagnen, Charaktere), nur die Adresse gilt neu
        updateConnection(moved.id, { ...fields, ...login });
        conn = getConnection(moved.id)!;
      } else {
        // Anderes Konto oder kein bekannter Server: eigene Verbindung, die alte bleibt, wie sie war
        conn = saveConnection({ ...fields, ...login });
      }
      await finish(conn, codes.inviteCode ?? null);
    } catch (err) {
      setError(err);
      // Fassung hat sich gerade geändert: neue Angaben holen, Haken neu setzen lassen
      if (isApiError(err, 'terms_changed')) {
        fetchServerInfo(baseUrl).then((i) => { setInfo(i); setTerms(false); }).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  const regMode = registrationMode(info);
  const canRegister = !!regMode && regMode !== 'closed';
  const pwMismatch = mode === 'register' && password2.length > 0 && password !== password2;
  // Was vor dem Anmelden noch fehlt – der Knopf bleibt antippbar und sagt es dann
  const missing = mode === 'login'
    ? (!username.trim() ? t('Bitte den Benutzernamen eingeben.') : !password ? t('Bitte das Passwort eingeben.') : null)
    : !code.trim() && codeRequired(regMode) ? (regMode === 'code' ? t('Bitte den Code eingeben.') : t('Bitte den Einladungscode eingeben.'))
    : !displayName.trim() ? t('Bitte deinen Namen eingeben.')
    : !username.trim() ? t('Bitte einen Benutzernamen eingeben.')
    : password.length < 8 ? t('Das Passwort braucht mindestens 8 Zeichen.')
    : password !== password2 ? t('Die Passwörter stimmen nicht überein.')
    : !privacy ? t('Bitte bestätige, dass du die Datenschutzhinweise gelesen hast.')
    : info?.termsVersion && !info?.termsUrl ? t('Der Server nennt keine Adresse für seine Nutzungsbedingungen. Ein Konto geht hier erst, wenn sie lesbar sind – sag deiner SL Bescheid.')
    : info?.termsUrl && !terms ? t('Bitte stimme den Nutzungsbedingungen zu.')
    : !age ? t('Bitte bestätige das Mindestalter.')
    : null;

  return (
    <div className="screen narrow">
      <main className="screen-main" style={{ gap: 18 }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 16 }}>
          <Wordmark />
          <p className="muted" style={{ margin: 0, font: 'italic 400 19px/31px var(--font-serif)' }}>{t('Eure Geschichte, gut verwahrt.')}</p>
        </div>
        <Divider />

        {!info && (
          <form onSubmit={checkServer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2>{active.length ? t('Weiteren Server verbinden') : t('Ich habe eine Einladung')}</h2>
            <div className="field">
              <label htmlFor="address">{t('Einladungslink oder Serveradresse')}</label>
              <LinkInput id="address" value={address} onChange={setAddress} describedBy="address-new address-account"
                placeholder={t('https://taleward.unser-verein.example/einladung/RABE-4821')} />
              <span id="address-new" className="muted small">{t('Neu dabei: Den Link bekommst du von deiner SL, als Text oder QR-Code.')}</span>
              <span id="address-account" className="muted small">{t('Schon ein Konto: Die Adresse deines Servers reicht, z. B. taleward.unser-verein.example. Danach meldest du dich an.')}</span>
            </div>
            <ErrorBox error={error} />
            <Missing text={address.trim() ? null : t('Bitte einen Einladungslink oder eine Serveradresse eingeben.')} shown={tried} />
            <button className="btn" type="submit" disabled={busy}>{busy ? t('Prüfe Server …') : t('Weiter')}</button>
            {MOCK && <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>{t('Testmodus: „/api/v1“ ist der eingebaute Testserver. Zum Ausprobieren eines zweiten Servers: https://nachbarverein.test/einladung/SALZ-2026')}</p>}
            {active.length > 0 && <button type="button" className="btn ghost small" onClick={() => navigate('/')}>{t('Abbrechen')}</button>}
          </form>
        )}
        {!info && !params.get('invite') && (
          <>
            <Divider />
            {/* Auch aus der Musterkampagne heraus: wer selbst leiten will, braucht zuerst einen Server */}
            {active.every((c) => isMusterUrl(c.baseUrl)) && (
              <section className="card" aria-labelledby="lead-title">
                <h2 id="lead-title">{t('Ich will selbst leiten')}</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  {t('Jeder Verein und jede Gruppe hat einen eigenen Server. Frag in deinem Verein nach, oder richtet selbst einen ein. Wer ihn betreibt, schickt dir einen Link, danach legst du hier deine Kampagne an.')}
                </p>
                <a className="btn outline" href={getLang() === 'en' ? 'https://taleward.org/en/self-hosting/' : 'https://taleward.org/selbst-betreiben/'} target="_blank" rel="noopener noreferrer">{t('So richtet ihr einen Server ein')}</a>
              </section>
            )}
            <MusterTry />
          </>
        )}

        {info && baseUrl && (
          <>
            <section className="card">
              <span className="overline">{t('Server')}</span>
              <h2>{info.name}</h2>
              <div className="muted small">{t('Betrieben von {operator}', { operator: info.operator })}{info.contact ? ` · ${info.contact}` : ''}</div>
              <div className="muted small" style={{ wordBreak: 'break-all' }}>{baseUrl}</div>
              {preview && (
                <div className="small" style={{ fontWeight: 600 }}>
                  {preview.seatCharacterName
                    ? t('Einladung zu „{title}“, auf den Platz von „{seat}“', { title: preview.campaignTitle, seat: preview.seatCharacterName })
                    : t('Einladung zu „{title}“', { title: preview.campaignTitle })}
                </div>
              )}
              {info.minAppVersion && versionLess(APP_VERSION, info.minAppVersion) && (
                <div className="notice" style={{ flexDirection: 'column', gap: 8 }}>
                  <span>{t('Dieser Server verlangt mindestens Taleward {min}, du hast {v}. Bitte erst aktualisieren.', { min: info.minAppVersion, v: APP_VERSION })}</span>
                  {info.appDownloadUrl && <DownloadButton url={info.appDownloadUrl} />}
                </div>
              )}
              {isOutdated(info.apiVersion) && (
                <div className="notice">
                  <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
                  <span>{t('Dieser Server ist älter (Version {v}) als die App erwartet ({r}). Manche Funktionen fehlen dort noch.', { v: info.apiVersion, r: REQUIRED_API_VERSION })}</span>
                </div>
              )}
              {moved && (
                <div className="notice">
                  {t('Diesen Server kennt die App schon unter {old}. Melde dich hier an, dann gilt die neue Adresse. Deine Kampagnen bleiben, wie sie sind.', {
                    old: moved.baseUrl.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '')
                  })}
                </div>
              )}
              <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => { setInfo(null); setBaseUrl(null); setPreview(null); setMoved(null); }}>{t('Anderer Server')}</button>
            </section>

            {oidc === 'email_in_use' && (
              <div className="notice">
                {t('Diese E-Mail gehört schon zu einem Konto. Melde dich mit deinem Benutzernamen an und verbinde {name} dann unter „Konten und Server“.', {
                  name: providerLabel(params.get('provider'))
                })}
              </div>
            )}
            {oidc === 'error' && (
              <div className="error" role="alert">
                {oidcErrorText(params.get('code'))}
              </div>
            )}

            {oidc === 'register' && pendingReg ? (
              <RegisterWithProvider info={info} pending={pendingReg} />
            ) : (
            <>
            {(info.authProviders?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {info.authProviders!.map((p) => (
                  <ProviderButton key={p.id} id={p.id} name={p.name} disabled={busy}
                    onClick={() => startProviderLogin({ baseUrl: baseUrl!, provider: p.id, purpose: 'login', inviteCode: code.trim() || null }).catch(setError)} />
                ))}
                <div className="muted small" style={{ textAlign: 'center' }}>{t('oder mit Benutzername')}</div>
              </div>
            )}
            {canRegister && (
              <div className="segmented" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>{t('Anmelden')}</button>
                <button type="button" aria-pressed={mode === 'register'} onClick={() => setMode('register')}>{t('Neues Konto')}</button>
              </div>
            )}
            {canRegister && code && mode === 'register' && (
              <span className="muted small">{t('Schon ein Konto auf diesem Server? Dann tippe auf „Anmelden“. Du trittst mit deinem Konto bei, ein zweites brauchst du nicht.')}</span>
            )}

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mode === 'register' && (
                <>
                  <CodeField id="code" mode={regMode} fromInvite={!!preview} operator={info.operator} value={code} onChange={setCode} />
                  <div className="field">
                    <label htmlFor="display">{t('Dein Name (sehen die anderen am Tisch)')}</label>
                    <input id="display" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="user">{t('Benutzername')}</label>
                <input id="user" type="text" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
                {mode === 'register' && <span className="muted small">{t('3–64 Zeichen: Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.')}</span>}
              </div>
              <div className="field">
                <label htmlFor="pass">{t('Passwort')}</label>
                <input id="pass" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                {mode === 'register' && <span className="muted small">{t('Mindestens 8 Zeichen. Nur für diesen Server – nimm kein Passwort, das du woanders nutzt.')}</span>}
              </div>
              {mode === 'register' && (
                <>
                  <div className="field">
                    <label htmlFor="pass2">{t('Passwort wiederholen')}</label>
                    <input id="pass2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
                    {pwMismatch && <span className="small" style={{ color: 'var(--seal)' }}>{t('Die Passwörter stimmen nicht überein.')}</span>}
                  </div>
                  <label className="check" style={{ alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} style={{ marginTop: 3 }} />
                    <span>
                      {t('Ich habe die Datenschutzhinweise von {operator} gelesen.', { operator: info.operator })}
                      {info.privacyPolicyUrl && <> <a href={info.privacyPolicyUrl} target="_blank" rel="noreferrer">{t('Öffnen')}</a></>}
                    </span>
                  </label>
                  {info.termsUrl && (
                    <label className="check" style={{ alignItems: 'flex-start' }}>
                      <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={{ marginTop: 3 }} />
                      <span>
                        {t('Ich stimme den Nutzungsbedingungen von {operator} zu.', { operator: info.operator })}
                        {' '}<a href={info.termsUrl} target="_blank" rel="noreferrer">{t('Öffnen')}</a>
                      </span>
                    </label>
                  )}
                  <label className="check" style={{ alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} style={{ marginTop: 3 }} />
                    <span>{t('Ich bin mindestens {n} Jahre alt – oder meine Eltern sind einverstanden.', { n: info.minAge })}</span>
                  </label>
                </>
              )}
              <ErrorBox error={error} />
              <Missing text={missing} shown={tried} />
              <button className="btn" type="submit" disabled={busy}>
                {busy ? t('Einen Moment …')
                  : mode === 'login' ? (code ? t('Anmelden und beitreten') : t('Anmelden'))
                  : code.trim() && (regMode !== 'code' || preview) ? t('Konto anlegen und beitreten') : t('Konto anlegen')}
              </button>
              {MOCK && <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>{t('Testmodus: beliebiger Benutzername und beliebiges Passwort.')}</p>}
            </form>
            {mode === 'login' && <ForgotPassword info={info} baseUrl={baseUrl} />}
            </>
            )}
          </>
        )}
        <div style={{ maxWidth: 220, alignSelf: 'center', width: '100%' }}><LanguageSwitch /></div>
      </main>
    </div>
  );
}

const providerLabel = (id: string | null) =>
  ({ google: 'Google', discord: 'Discord', apple: 'Apple', microsoft: 'Microsoft' } as Record<string, string>)[id ?? ''] ?? t('den Dienst');

/** „Passwort vergessen?“ – per E-Mail, wenn der Server Mails verschicken kann; sonst Hinweis auf die Verwaltung */
function ForgotPassword({ info, baseUrl }: { info: ServerInfo; baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!open) {
    return <button type="button" className="btn small quiet" style={{ alignSelf: 'center' }} onClick={() => setOpen(true)}>{t('Passwort vergessen?')}</button>;
  }
  if (!info.passwordReset) {
    // Im Programmfenster „Alles auf diesem PC“ ist man selbst die Verwaltung: dort setzt das Programm das Passwort neu
    return <div className="notice">{inDesktopShell()
      ? t('Im Taleward-Programm unter Einstellungen → Erweitert → Passwort vergessen.')
      : t('Die Verwaltung eures Servers schickt dir einen Link zum Zurücksetzen.')}</div>;
  }
  if (sent) {
    return <div className="notice">{t('Wenn es zu diesem Konto eine bestätigte E-Mail gibt, ist ein Link unterwegs. Er gilt eine Stunde.')}</div>;
  }
  return (
    <div className="card">
      <div className="field">
        <label htmlFor="reset-login">{t('Benutzername oder E-Mail')}</label>
        <input id="reset-login" type="text" autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)} />
      </div>
      <ErrorBox error={error} />
      <button type="button" className="btn small" disabled={!login.trim() || busy} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          await apiFor({ id: '_probe', baseUrl, name: '', operator: null, apiVersion: null, token: null, expiresAt: null, user: null }).passwordReset(login.trim());
          setSent(true);
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}>{t('Link schicken')}</button>
    </div>
  );
}

/** Konto anlegen nach Anmeldung mit einem Dienst: ohne Benutzername und Passwort */
function RegisterWithProvider({ info, pending }: { info: ServerInfo; pending: PendingRegister }) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(pending.suggestedDisplayName ?? '');
  const [code, setCode] = useState(pending.inviteCode ?? '');
  const [privacy, setPrivacy] = useState(false);
  const [age, setAge] = useState(false);
  // Nutzungsbedingungen des Betreibers (ab 0.4.22)
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const regMode = registrationMode(info);
  const fromInvite = !!pending.inviteCode && code.trim() === pending.inviteCode.trim();
  const missing = !code.trim() && codeRequired(regMode) ? (regMode === 'code' ? t('Bitte den Code eingeben.') : t('Bitte den Einladungscode eingeben.'))
    : !displayName.trim() ? t('Bitte deinen Namen eingeben.')
    : !privacy ? t('Bitte bestätige, dass du die Datenschutzhinweise gelesen hast.')
    : info.termsVersion && !info.termsUrl ? t('Der Server nennt keine Adresse für seine Nutzungsbedingungen. Ein Konto geht hier erst, wenn sie lesbar sind – sag deiner SL Bescheid.')
    : info.termsUrl && !terms ? t('Bitte stimme den Nutzungsbedingungen zu.')
    : !age ? t('Bitte bestätige das Mindestalter.')
    : null;

  const submit = async () => {
    setTried(true);
    if (missing) return;
    setBusy(true);
    setError(null);
    try {
      const probe = saveConnection({ baseUrl: pending.baseUrl, name: info.name, operator: info.operator, apiVersion: info.apiVersion, token: null, expiresAt: null, user: null });
      const codes = await codesFor(regMode, code, pending.baseUrl, fromInvite);
      const res = await apiFor(probe).register({
        ...codes, registrationToken: pending.registrationToken, displayName: displayName.trim(), acceptPrivacy: true, ageConfirmed: true,
        ...termsConsent(info)
      });
      const conn = saveConnection({ ...probe, token: res.accessToken, expiresAt: res.expiresAt, user: res.user });
      clearPendingRegister();
      if (codes.inviteCode) {
        const c = await apiFor(conn).joinCampaign(codes.inviteCode);
        navigate(`/v/${conn.id}/k/${c.id}/willkommen`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>{t('Konto anlegen')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {pending.email
          ? t('Angemeldet über {name} als {email}. Ein Passwort brauchst du nicht.', { name: providerLabel(pending.provider), email: pending.email })
          : t('Angemeldet über {name}. Ein Passwort brauchst du nicht.', { name: providerLabel(pending.provider) })}
      </p>
      <CodeField id="reg-code" mode={regMode} fromInvite={fromInvite} operator={info.operator} value={code} onChange={setCode} />
      <div className="field">
        <label htmlFor="reg-name">{t('Dein Name (sehen die anderen am Tisch)')}</label>
        <input id="reg-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <label className="check" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          {t('Ich habe die Datenschutzhinweise von {operator} gelesen.', { operator: info.operator })}
          {info.privacyPolicyUrl && <> <a href={info.privacyPolicyUrl} target="_blank" rel="noreferrer">{t('Öffnen')}</a></>}
        </span>
      </label>
      {info.termsUrl && (
        <label className="check" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            {t('Ich stimme den Nutzungsbedingungen von {operator} zu.', { operator: info.operator })}
            {' '}<a href={info.termsUrl} target="_blank" rel="noreferrer">{t('Öffnen')}</a>
          </span>
        </label>
      )}
      <label className="check" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} style={{ marginTop: 3 }} />
        <span>{t('Ich bin mindestens {n} Jahre alt – oder meine Eltern sind einverstanden.', { n: info.minAge })}</span>
      </label>
      <ErrorBox error={error} />
      <Missing text={missing} shown={tried} />
      <button type="button" className="btn" disabled={busy} onClick={submit}>
        {busy ? t('Einen Moment …') : code.trim() && (regMode !== 'code' || fromInvite) ? t('Konto anlegen und beitreten') : t('Konto anlegen')}
      </button>
    </section>
  );
}

/** Fehlercodes aus taleward://auth?error=… in verständliche Sätze übersetzen */
export function oidcErrorText(code: string | null): string {
  switch (code) {
    case 'cancelled':
    case 'access_denied':
      return t('Die Anmeldung wurde abgebrochen.');
    case 'provider_unknown':
      return t('Dieser Anmeldedienst ist auf dem Server nicht eingerichtet.');
    case 'link_invalid':
      return t('Der Verbinden-Vorgang ist abgelaufen. Bitte noch einmal starten.');
    case 'expired':
    case 'ticket_invalid':
      return t('Die Anmeldung ist abgelaufen. Bitte noch einmal.');
    default:
      return t('Die Anmeldung über den Dienst hat nicht geklappt. Versuch es noch einmal oder melde dich mit Benutzername an.');
  }
}

/** Zustimmung zu den Nutzungsbedingungen mitschicken, wenn der Server welche hat (ab 0.4.22) */
function termsConsent(info: ServerInfo): { acceptTerms?: true; termsVersion?: number } {
  return info.termsUrl && info.termsVersion ? { acceptTerms: true, termsVersion: info.termsVersion } : {};
}

/**
 * Codefeld beim Registrieren, je nach Registrierungsart des Servers (ab 0.4.23): Einladung (Pflicht), Einladung oder
 * allgemeiner Code des Betreibers, oder freiwillig (offener Server).
 */
function CodeField({ id, mode, fromInvite, operator, value, onChange }: {
  id: string; mode: RegistrationMode | null; fromInvite: boolean; operator: string; value: string; onChange: (v: string) => void;
}) {
  const label = fromInvite || mode === 'invite_only' || !mode ? t('Einladungscode')
    : mode === 'code' ? t('Einladungs- oder Registrierungscode')
    : t('Einladungscode (wenn du einen hast)');
  const hint = fromInvite ? null
    : mode === 'code' ? t('Den Code bekommst du von deiner SL oder von {operator}. Mit dem Code des Servers legst du nur dein Konto an, ohne Kampagne.', { operator })
    : mode === 'open' ? t('Ohne Einladung legst du nur dein Konto an. Mitspielen geht danach mit einer Einladung deiner SL.')
    : null;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" autoCapitalize="characters" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && <span id={`${id}-hint`} className="muted small">{hint}</span>}
    </div>
  );
}

/**
 * Welcher Code ist es? Bei `code` kann ein getippter Code eine Kampagneneinladung sein (dann gleich beitreten) oder der
 * allgemeine Registrierungscode. Die Einladungsvorschau sagt es, ohne etwas anzulegen.
 */
async function codesFor(mode: RegistrationMode | null, code: string, baseUrl: string, knownInvite: boolean) {
  if (mode !== 'code' || knownInvite || !code.trim()) return registrationCodes(mode, code, knownInvite);
  const invite = await fetchInvitePreview(baseUrl, code.trim()).catch(() => null);
  return registrationCodes(mode, code, !!invite);
}
