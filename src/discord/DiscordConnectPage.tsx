import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { currentConnection, p } from '../api/connections';
import type { DiscordLinkPreview } from '../api/types';
import { startProviderLogin } from '../auth/oidc';
import { confirmDialog } from '../components/confirm';
import { ErrorBox, Screen } from '../components/Screen';
import { t } from '../i18n';
import { cleanCode } from './links';

/**
 * Kampagne mit einem Discord-Server verbinden (ab 0.4.32, nur SL): Link vom Bot (Token kommt nur über den Router-Zustand,
 * nie über die Adresse) oder Drei-Wörter-Code. Der Server bindet nur, wenn dieses Konto per Discord-Anmeldung mit genau
 * der Person verknüpft ist, die im Discord „/taleward verbinden“ getippt hat.
 */
export function DiscordConnectPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromLink = (location.state as { token?: string; code?: string } | null) ?? null;
  const [secret, setSecret] = useState<{ token?: string; code?: string } | null>(fromLink?.token || fromLink?.code ? fromLink : null);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<DiscordLinkPreview | null>(null);
  const [choice, setChoice] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<{ title: string; guild: string; campaignId: string } | null>(null);
  const conn = currentConnection();

  useEffect(() => {
    // Den Link nicht im Verlauf behalten
    if (fromLink) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!secret) return;
    setBusy(true);
    setError(null);
    api.discordLinkPreview(secret)
      .then((pv) => { setPreview(pv); setChoice(pv.campaigns?.length === 1 ? pv.campaigns[0].campaignId : ''); })
      .catch((e) => { setPreview(null); setError(e); })
      .finally(() => setBusy(false));
  }, [secret]);

  const connect = async () => {
    const c = preview?.campaigns?.find((x) => x.campaignId === choice);
    if (!secret || !c || !preview?.guildName) return;
    const ok = await confirmDialog(c.connectedGuildName
      ? t('„{title}“ auf „{server}“ mit dem Discord-Server „{guild}“ verbinden? Die Verbindung zu „{old}“ endet dann.', { title: c.title, server: conn.name, guild: preview.guildName, old: c.connectedGuildName })
      : t('„{title}“ auf „{server}“ mit dem Discord-Server „{guild}“ verbinden?', { title: c.title, server: conn.name, guild: preview.guildName }),
    { confirmLabel: t('Verbinden') });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.discordLinkRedeem(secret, c.campaignId);
      setDone({ title: c.title, guild: r.guildName, campaignId: c.campaignId });
      setSecret(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen back title={t('Mit Discord verbunden')}>
        <p style={{ margin: 0 }}>{t('„{title}“ ist jetzt mit „{guild}“ verbunden.', done)}</p>
        <p className="muted" style={{ margin: 0 }}>{t('Zum Aufnehmen tippst du im Sprachkanal „/taleward start“. Wer noch nicht zugestimmt hat, bekommt dort einen eigenen Link.')}</p>
        <Link className="btn" to={p(`/k/${done.campaignId}`)}>{t('Zur Kampagne')}</Link>
      </Screen>
    );
  }

  return (
    <Screen back title={t('Discord-Server verbinden')}>
      <ErrorBox error={error} />
      {!secret && (
        <>
          <p className="muted" style={{ margin: 0 }}>{t('Tippe im Discord „/taleward verbinden“ und dann auf „In Taleward öffnen“. Klappt das nicht, hol dir mit „/taleward verbinden code:ja“ drei Wörter und gib sie hier ein.')}</p>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="dc-code">{t('Drei-Wörter-Code')}</label>
            <input id="dc-code" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={t('z. B. laterne-moor-krug')}
              value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <button type="button" className="btn" disabled={busy || cleanCode(code).split('-').filter(Boolean).length < 3}
            onClick={() => setSecret({ code: cleanCode(code) })}>{t('Weiter')}</button>
        </>
      )}

      {secret && preview && !preview.linked && (
        <>
          <p style={{ margin: 0 }}>{t('Dein Konto auf „{server}“ ist noch nicht mit Discord verknüpft. Verbinden geht nur mit genau dem Discord-Konto, mit dem du „/taleward verbinden“ getippt hast.', { server: conn.name })}</p>
          <button type="button" className="btn" disabled={busy}
            onClick={() => startProviderLogin({ baseUrl: conn.baseUrl, provider: 'discord', purpose: 'link', conn }).catch(setError)}>
            {t('Mit Discord verknüpfen')}
          </button>
          <p className="muted small" style={{ margin: 0 }}>{t('Danach öffne den Link aus dem Discord noch einmal oder gib den Code ein. Er gilt 15 Minuten.')}</p>
        </>
      )}

      {secret && preview?.linked && (
        <>
          <p style={{ margin: 0 }}>{t('Welche Kampagne gehört zum Discord-Server „{guild}“?', { guild: preview.guildName ?? '' })}</p>
          {(preview.campaigns ?? []).length === 0
            ? <p className="muted" style={{ margin: 0 }}>{t('Du leitest auf „{server}“ keine Kampagne. Verbinden kann nur die Spielleitung.', { server: conn.name })}</p>
            : (
              <div className="list-box flat" role="radiogroup" aria-label={t('Kampagne')}>
                {preview.campaigns!.map((c) => (
                  <label key={c.campaignId} className="list-row check-row">
                    <input type="radio" name="dc-campaign" checked={choice === c.campaignId} onChange={() => setChoice(c.campaignId)} />
                    <span className="lr-text">{c.title}
                      {c.connectedGuildName && <span className="lr-sub">{t('Bisher mit „{guild}“ verbunden', { guild: c.connectedGuildName })}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          <button type="button" className="btn" disabled={busy || !choice} onClick={connect}>{t('Verbinden')}</button>
        </>
      )}
    </Screen>
  );
}
