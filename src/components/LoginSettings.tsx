import { useEffect, useRef, useState } from 'react';
import { apiFor } from '../api/client';
import { updateConnection, type Connection } from '../api/connections';
import type { ServerInfo, User } from '../api/types';
import { startProviderLogin } from '../auth/oidc';
import { t } from '../i18n';
import { confirmDialog } from './confirm';
import { ErrorBox } from './Screen';

/**
 * Konten und Server → Anmeldung: freiwillige E-Mail (nur fürs Passwort-Zurücksetzen), verbundene Dienste,
 * Passwort setzen oder ändern (Schnittstelle 0.4.0). Auf älteren Servern unsichtbar.
 */
export function LoginSettings({ conn, open }: { conn: Connection; open?: boolean }) {
  const api = apiFor(conn);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [user, setUser] = useState<User | null>(conn.user);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', next2: '' });
  const [pwOpen, setPwOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Von „E-Mail eintragen“ (SL-Freigabe): gleich aufgeklappt und im Blick
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (open && info && user) box.current?.scrollIntoView({ block: 'start' });
  }, [open, !!info, !!user]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    const me = await api.me();
    setUser(me);
    updateConnection(conn.id, { user: me });
  };

  useEffect(() => {
    api.info().then(setInfo).catch(() => undefined);
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.id]);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await action();
      await refresh();
      if (done) setMsg(done);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!info || !user) return null;
  // Server ohne 0.4.0: Funktion nur für diesen Server ausblenden, mit dezentem Hinweis
  if (user.hasPassword === undefined) {
    return <p className="muted small" style={{ margin: 0 }}>{t('E-Mail und Anmelden mit Google & Co.: Dieser Server kann das noch nicht – der Betreiber muss aktualisieren.')}</p>;
  }
  const providers = info.authProviders ?? [];

  return (
    <details className="card" style={{ gap: 12 }} ref={box} open={open || undefined}>
      <summary style={{ fontWeight: 700 }}>{t('Anmeldung und E-Mail')}</summary>

      {/* E-Mail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <strong>{t('E-Mail')}</strong>
        <span className="muted small">
          {info.gmApproval === 'required'
            ? t('Freiwillig. Für „Passwort vergessen“ und die Antwort auf eine SL-Freigabe – niemand am Tisch sieht sie.')
            : t('Freiwillig. Nur für „Passwort vergessen“ – niemand am Tisch sieht sie.')}
        </span>
        {user.email && <span className="small">{user.email} · <span style={{ color: 'var(--salbei)' }}>{t('bestätigt')}</span></span>}
        {user.emailPending && <span className="small">{user.emailPending} · <span className="muted">{t('wartet auf Bestätigung – schau in dein Postfach')}</span></span>}
        <div className="row" style={{ gap: 8 }}>
          <input type="email" aria-label={t('E-Mail')} placeholder={t('name@beispiel.de')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="button" className="btn small" disabled={busy || !email.includes('@')}
            onClick={() => run(() => api.setEmail(email.trim()), t('Bestätigungslink verschickt.')).then(() => setEmail(''))}>
            {user.email || user.emailPending ? t('Ändern') : t('Eintragen')}
          </button>
        </div>
        {(user.email || user.emailPending) && (
          <button type="button" className="btn small danger outline" style={{ alignSelf: 'flex-start' }} disabled={busy}
            onClick={async () => {
              if (await confirmDialog(t('E-Mail entfernen? Dann geht „Passwort vergessen“ nicht mehr.'), { confirmLabel: t('Entfernen'), danger: true })) {
                run(() => api.deleteEmail());
              }
            }}>{t('E-Mail entfernen')}</button>
        )}
      </div>

      {/* Dienste */}
      {providers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong>{t('Anmelden mit')}</strong>
          {providers.map((p) => {
            const linked = (user.providers ?? []).includes(p.id);
            return (
              <div key={p.id} className="row between" style={{ minHeight: 48 }}>
                <span>{p.name}{linked && <span className="muted small"> · {t('verbunden')}</span>}</span>
                {linked ? (
                  <button type="button" className="btn small danger outline" disabled={busy} onClick={async () => {
                    if (await confirmDialog(t('{name} trennen?', { name: p.name }), { confirmLabel: t('Trennen'), danger: true })) {
                      run(() => api.unlinkProvider(p.id));
                    }
                  }}>{t('Trennen')}</button>
                ) : (
                  <button type="button" className="btn small outline" disabled={busy}
                    onClick={() => startProviderLogin({ baseUrl: conn.baseUrl, provider: p.id, purpose: 'link', conn }).catch(setError)}>
                    {t('Verbinden')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Passwort */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <strong>{t('Passwort')}</strong>
        {!user.hasPassword && <span className="muted small">{t('Du meldest dich bisher nur über einen Dienst an.')}</span>}
        {!pwOpen ? (
          <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start' }} onClick={() => setPwOpen(true)}>
            {user.hasPassword ? t('Passwort ändern') : t('Passwort festlegen')}
          </button>
        ) : (
          <>
            {user.hasPassword && (
              <input type="password" autoComplete="current-password" aria-label={t('Bisheriges Passwort')} placeholder={t('Bisheriges Passwort')}
                value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            )}
            <input type="password" autoComplete="new-password" aria-label={t('Neues Passwort')} placeholder={t('Neues Passwort (mindestens 8 Zeichen)')}
              value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <input type="password" autoComplete="new-password" aria-label={t('Passwort wiederholen')} placeholder={t('Passwort wiederholen')}
              value={pw.next2} onChange={(e) => setPw({ ...pw, next2: e.target.value })} />
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn small" disabled={busy || pw.next.length < 8 || pw.next !== pw.next2 || (user.hasPassword && !pw.current)}
                onClick={() => run(() => api.setPassword(pw.next, user.hasPassword ? pw.current : undefined), t('Passwort gespeichert. Andere Geräte sind abgemeldet.'))
                  .then(() => { setPw({ current: '', next: '', next2: '' }); setPwOpen(false); })}>
                {t('Speichern')}
              </button>
              <button type="button" className="btn small outline" onClick={() => setPwOpen(false)}>{t('Abbrechen')}</button>
            </div>
          </>
        )}
      </div>

      {msg && <div className="notice">{msg}</div>}
      <ErrorBox error={error} />
    </details>
  );
}
