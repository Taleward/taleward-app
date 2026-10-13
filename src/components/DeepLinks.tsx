import { handleAuthUrl, isAuthReturnUrl } from '../auth/oidc';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { apiFor, fetchInvitePreview } from '../api/client';
import { activeConnections, apiAtLeast, parseInvite } from '../api/connections';
import { inviteFromAppUrl } from '../invite';
import { t } from '../i18n';
import { isSafeAppPath } from '../api/pathGuard';
import { confirmDialog } from './confirm';

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl, window.location.href).host;
  } catch {
    return baseUrl;
  }
}

/**
 * Öffnet die App über taleward://einladung?url=…, geht sie in den Beitritt:
 * bekannter Server mit Anmeldung → nach Rückfrage beitreten; sonst über „Mit Server verbinden“ (Konto anlegen).
 */
export function DeepLinks() {
  const navigate = useNavigate();

  // Testmodus: simulierte Rückkehr vom Anmeldedienst
  useEffect(() => {
    const onAuth = async (e: Event) => navigate(await handleAuthUrl((e as CustomEvent<string>).detail), { replace: true });
    window.addEventListener('taleward:auth-url', onAuth);
    return () => window.removeEventListener('taleward:auth-url', onAuth);
  }, [navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;

    const handle = async (url: string) => {
      // Benachrichtigung angetippt: taleward://oeffnen?pfad=/v/<server>/k/<kampagne>/…
      if (url.toLowerCase().startsWith('taleward://oeffnen')) {
        const path = new URL(url.replace(/^taleward:/i, 'http:')).searchParams.get('pfad') ?? '';
        navigate(isSafeAppPath(path) ? path : '/');
        return;
      }
      // Rückkehr vom Anmeldedienst
      if (isAuthReturnUrl(url)) {
        navigate(await handleAuthUrl(url), { replace: true });
        return;
      }
      const link = inviteFromAppUrl(url);
      if (!link) return;
      const invite = parseInvite(link);
      const conn = invite?.baseUrl ? activeConnections().find((c) => c.baseUrl === invite.baseUrl) : undefined;
      if (invite && conn) {
        // Nie ungefragt beitreten: Ein Link von irgendeiner Webseite könnte sonst in eine fremde Kampagne führen.
        // Ab Schnittstelle 0.4.10 nennt die Rückfrage auch die Kampagne.
        let title: string | null = null;
        let seat: string | null = null;
        if (apiAtLeast('0.4.10', conn)) {
          try {
            const preview = await fetchInvitePreview(conn.baseUrl, invite.code);
            title = preview?.campaignTitle ?? null;
            seat = preview?.seatCharacterName ?? null;
          } catch (e) {
            navigate('/', { state: { joinError: e instanceof Error ? e.message : t('Beitreten hat nicht geklappt.'), invite: link } });
            return;
          }
        }
        const vars = { server: conn.name, host: hostOf(conn.baseUrl), code: invite.code, name: conn.user?.displayName ?? '', title: title ?? '', seat: seat ?? '' };
        const ok = await confirmDialog(
          title && seat
            ? t('Einladung annehmen? Du trittst auf „{server}“ ({host}) der Kampagne „{title}“ bei und übernimmst den Platz von „{seat}“, Code {code}. Die anderen dort sehen dann deinen Namen „{name}“. Nimm nur Einladungen an, die du von deiner Spielleitung oder Gruppe bekommen hast.', vars)
            : title
              ? t('Einladung annehmen? Du trittst auf „{server}“ ({host}) der Kampagne „{title}“ bei, Code {code}. Die anderen dort sehen dann deinen Namen „{name}“. Nimm nur Einladungen an, die du von deiner Spielleitung oder Gruppe bekommen hast.', vars)
              : t('Einladung annehmen? Du trittst auf „{server}“ ({host}) einer Kampagne bei, Code {code}. Die anderen dort sehen dann deinen Namen „{name}“. Nimm nur Einladungen an, die du von deiner Spielleitung oder Gruppe bekommen hast.', vars),
          { confirmLabel: t('Beitreten'), cancelLabel: t('Nicht beitreten') }
        );
        if (!ok) {
          navigate('/');
          return;
        }
        try {
          const c = await apiFor(conn).joinCampaign(invite.code);
          navigate(`/v/${conn.id}/k/${c.id}/willkommen`);
        } catch (e) {
          // Schon angemeldet: kein neues Konto anlegen lassen, sondern die Meldung auf der Kampagnenliste zeigen
          // (Code abgelaufen, zu viele Versuche …)
          navigate('/', { state: { joinError: e instanceof Error ? e.message : t('Beitreten hat nicht geklappt.'), invite: link } });
        }
        return;
      }
      navigate(`/verbinden?invite=${encodeURIComponent(link)}`);
    };

    (async () => {
      const { App } = await import('@capacitor/app');
      const launch = await App.getLaunchUrl();
      if (launch?.url) handle(launch.url);
      const sub = await App.addListener('appUrlOpen', (e) => handle(e.url));
      remove = () => sub.remove();
    })();
    return () => remove?.();
  }, [navigate]);

  return null;
}
