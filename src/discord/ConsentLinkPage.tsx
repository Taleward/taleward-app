import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { fetchConsentLink, fetchServerInfo, isApiError, postConsentLink } from '../api/client';
import { activeConnections, sameServerHost } from '../api/connections';
import type { ConsentLinkInfo, ServerInfo } from '../api/types';
import { startProviderLogin } from '../auth/oidc';
import { CONSENT_ON_SITE, CONSENT_STANDING } from '../consent';
import { ErrorBox, Screen } from '../components/Screen';
import { t } from '../i18n';

/**
 * Zustimmung über den Link des Discord-Bots (ab 0.4.32). Nur die Person selbst, kein automatisches Absenden.
 * Mitglied (angemeldet auf diesem Server): gilt für alle Aufnahmen der Kampagne bis zum Widerruf. Gast: nur diese Runde.
 */
function hostOf(baseUrl: string): string {
  try { return new URL(baseUrl).host; } catch { return baseUrl; }
}

export function ConsentLinkPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [link] = useState(() => (location.state as { baseUrl?: string; token?: string } | null) ?? null);
  const [info, setInfo] = useState<ConsentLinkInfo | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [gone, setGone] = useState(false);
  const [name, setName] = useState('');
  const [figure, setFigure] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const [needLink, setNeedLink] = useState(false);

  const conn = link?.baseUrl ? activeConnections().find((c) => sameServerHost(c.baseUrl, link.baseUrl!)) : undefined;

  useEffect(() => {
    // Token nicht in Adresse oder Verlauf behalten
    navigate(location.pathname, { replace: true, state: null });
    if (!link?.baseUrl || !link.token) { setGone(true); return; }
    fetchConsentLink(link.baseUrl, link.token)
      .then((i) => { setInfo(i); setName(i.suggestedGuestName ?? ''); })
      .catch(() => setGone(true));
    fetchServerInfo(link.baseUrl).then(setServer).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const asMember = !!conn && !!info?.memberAllowed;
  const send = async () => {
    if (!link?.baseUrl || !link.token) return;
    setBusy(true);
    setError(null);
    try {
      await postConsentLink(asMember ? conn! : link.baseUrl, link.token,
        asMember ? { consent: true } : { consent: true, guestName: name.trim(), ...(figure.trim() ? { characterName: figure.trim() } : {}) });
      setDone(true);
    } catch (e) {
      if (isApiError(e) && e.status === 404) setGone(true);
      else if (isApiError(e, 'discord_link_required')) setNeedLink(true);
      else setError(e);
    } finally {
      setBusy(false);
    }
  };

  const ctx = { retention: server?.audioRetention };

  if (done) {
    return (
      <Screen nav={false} title={t('Danke')}>
        <p style={{ margin: 0 }}>{asMember
          ? t('Du bist dabei. Deine Zustimmung gilt für alle Aufnahmen von „{title}“, bis du sie zurücknimmst.', { title: info?.campaignTitle ?? '' })
          : t('Du bist für diese Runde dabei. Du kannst zurück in den Discord.')}</p>
        {conn && <Link className="btn ghost" to="/">{t('Zu deinen Kampagnen')}</Link>}
      </Screen>
    );
  }

  if (gone) {
    return (
      <Screen nav={false} title={t('Zur Aufnahme zustimmen')}>
        <p style={{ margin: 0 }}>{t('Dieser Link ist abgelaufen oder schon benutzt. Hol dir im Discord mit „/taleward bereit“ einen neuen.')}</p>
      </Screen>
    );
  }

  return (
    <Screen nav={false} title={t('Zur Aufnahme zustimmen')} overline={info?.campaignTitle ?? ' '}>
      <ErrorBox error={error} />
      {info && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {info.gmName
              ? t('Spielleitung: {name} · Server „{server}“ ({host})', { name: info.gmName, server: server?.name ?? '', host: hostOf(link!.baseUrl!) })
              : t('Server „{server}“ ({host})', { server: server?.name ?? '', host: hostOf(link!.baseUrl!) })}
          </p>
          {asMember ? (
            <>
              <p style={{ margin: 0 }}>{CONSENT_STANDING(info.campaignTitle, ctx)}</p>
              <p className="notice" style={{ margin: 0 }}>{t('Das gilt für alle Aufnahmen dieser Kampagne, nicht nur für heute. Zurücknehmen kannst du es in der App unter „Kampagne verwalten → Deine Daten“.')}</p>
            </>
          ) : info.guestAllowed ? (
            <>
              <p style={{ margin: 0 }}>{CONSENT_ON_SITE(info.campaignTitle, ctx)}</p>
              <p className="muted small" style={{ margin: 0 }}>{t('Gilt nur für diese Runde. Wenn du es dir anders überlegst, tippe im Discord „/taleward verlassen“.')}</p>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="cl-name">{t('Dein Name im Kapitel')}</label>
                <input id="cl-name" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="cl-figure">{t('Deine Figur (freiwillig)')}</label>
                <input id="cl-figure" type="text" maxLength={60} value={figure} onChange={(e) => setFigure(e.target.value)} />
              </div>
            </>
          ) : (
            <p style={{ margin: 0 }}>{t('Melde dich in der App bei „{server}“ an und öffne den Link dann noch einmal.', { server: server?.name ?? '' })}</p>
          )}
          {needLink && conn && (
            <>
              <p className="notice" style={{ margin: 0 }}>{t('Dein Konto ist noch nicht mit Discord verknüpft. Verknüpfe es einmal, dann hol dir im Discord mit „/taleward bereit“ einen neuen Link.')}</p>
              <button type="button" className="btn" onClick={() => startProviderLogin({ baseUrl: conn.baseUrl, provider: 'discord', purpose: 'link', conn }).catch(setError)}>
                {t('Mit Discord verknüpfen')}
              </button>
            </>
          )}
          {!needLink && (asMember || info.guestAllowed) && (
            <>
              <label className="check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>{t('Ich stimme zu.')}</span>
              </label>
              <button type="button" className="btn" disabled={busy || !agree || (!asMember && !name.trim())} onClick={send}>{t('Zustimmen')}</button>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
