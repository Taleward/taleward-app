/*
 * Testserver für den Discord-Bot (Schnittstelle 0.4.32), nur die Wege der App. Einschalten: localStorage
 * „taleward.mock.discord“ = 1 (Konto noch nicht mit Discord verknüpft) oder linked (schon verknüpft).
 * Verbinden: jedes Token passend zum Muster oder der Code „laterne-moor-krug“. Zustimmen: Token mit „mitglied“ am
 * Anfang = Discord-ID gehört zu einem Mitglied, mit „abgelaufen“ = 404, sonst Gast.
 */
import { HttpResponse, http } from 'msw';
import { account, campaigns } from './db';
import type { MockCampaign } from './db';

const setting = (): string | null => { try { return localStorage.getItem('taleward.mock.discord'); } catch { return null; } };
export const mockDiscordBot = () => setting() === '1' || setting() === 'linked';
if (setting() === 'linked' && !account.providers.includes('discord')) account.providers.push('discord');

const GUILD = 'Taverne zum Krug';
const connections = new Map<string, { guildName: string; connectedAt: string; connectedBy: string | null }>();
// Verlauf (0.4.33), neueste zuerst; mit einer Beispielrunde, damit der Testmodus etwas zeigt
const logs = new Map<string, { at: string; kind: string; sessionId?: string }[]>();
const logOf = (id: string) => { if (!logs.has(id)) logs.set(id, []); return logs.get(id)!; };
const addLog = (id: string, kind: string, sessionId?: string) => logOf(id).unshift({ at: new Date().toISOString(), kind, ...(sessionId ? { sessionId } : {}) });
const pause = new Map<string, boolean>();
export const mockDiscordPause = (campaignId: string): boolean | undefined => (mockDiscordBot() ? pause.get(campaignId) ?? false : undefined);
export const setMockDiscordPause = (campaignId: string, v: boolean) => { pause.set(campaignId, v); };

const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;
const err = (status: number, code: string, message: string) => HttpResponse.json({ code, message }, { status });
const notFound = () => err(404, 'not_found', 'Nicht gefunden.');

function secretOk(b: { token?: string; code?: string }): boolean {
  return (!!b.token && TOKEN.test(b.token)) || b.code === 'laterne-moor-krug';
}

export function discordHandlers(B: string, deps: { myMember: (c: MockCampaign) => { id: string; role: string; displayName: string } | undefined; authed: (r: Request) => boolean }) {
  const gmCampaigns = () => campaigns.filter((c) => !c.archivedAt && deps.myMember(c)?.role === 'gm');
  return [
    http.post(`${B}/discord-links/preview`, async ({ request }) => {
      if (!mockDiscordBot()) return notFound();
      const b = (await request.json()) as { token?: string; code?: string };
      if (!secretOk(b)) return err(404, 'not_found', 'Dieser Link oder Code gilt nicht (mehr). Tippe im Discord noch einmal „/taleward verbinden“.');
      const linked = account.providers.includes('discord');
      return HttpResponse.json({
        linked,
        expiresAt: new Date(Date.now() + 15 * 60e3).toISOString(),
        ...(linked ? {
          guildName: GUILD,
          campaigns: gmCampaigns().map((c) => ({ campaignId: c.id, title: c.title, connectedGuildName: connections.get(c.id)?.guildName ?? null }))
        } : {})
      });
    }),
    http.post(`${B}/discord-links/redeem`, async ({ request }) => {
      if (!mockDiscordBot()) return notFound();
      const b = (await request.json()) as { token?: string; code?: string; campaignId: string };
      if (!secretOk(b)) return err(404, 'not_found', 'Dieser Link oder Code gilt nicht (mehr). Tippe im Discord noch einmal „/taleward verbinden“.');
      if (!account.providers.includes('discord')) return err(409, 'discord_link_required', 'Verknüpfe zuerst dein Konto mit Discord.');
      const c = gmCampaigns().find((x) => x.id === b.campaignId);
      if (!c) return notFound();
      const conn = { guildName: GUILD, connectedAt: new Date().toISOString(), connectedBy: deps.myMember(c)!.id };
      addLog(c.id, connections.has(c.id) ? 'replaced' : 'connected');
      connections.set(c.id, conn);
      return HttpResponse.json({ campaignId: c.id, ...conn });
    }),
    http.get(`${B}/campaigns/:id/discord`, ({ params }) => {
      const c = gmCampaigns().find((x) => x.id === params.id);
      if (!mockDiscordBot() || !c) return notFound();
      return HttpResponse.json({ connection: connections.get(c.id) ?? null });
    }),
    http.get(`${B}/campaigns/:id/discord/log`, ({ params }) => {
      const c = gmCampaigns().find((x) => x.id === params.id);
      if (!mockDiscordBot() || !c) return notFound();
      return HttpResponse.json({ entries: logOf(c.id).slice(0, 200) });
    }),
    http.delete(`${B}/campaigns/:id/discord`, ({ params }) => {
      const c = gmCampaigns().find((x) => x.id === params.id);
      if (!mockDiscordBot() || !c) return notFound();
      connections.delete(c.id);
      addLog(c.id, 'disconnected');
      return new HttpResponse(null, { status: 204 });
    })
  ];
}

/** Ohne Anmeldung nutzbar (Gäste), deshalb vor der Anmeldeprüfung des Testservers */
export function discordPublicHandlers(B: string, deps: { myMember: (c: MockCampaign) => { id: string; role: string; displayName: string } | undefined; authed: (r: Request) => boolean }) {
  return [
    http.get(`${B}/consent-links/:token`, ({ params }) => {
      const tk = String(params.token);
      if (!mockDiscordBot() || !TOKEN.test(tk) || tk.startsWith('abgelaufen')) return notFound();
      const c = campaigns.find((x) => !x.archivedAt) ?? campaigns[0];
      const gm = c.members.find((m) => m.role === 'gm' && !m.openSeat);
      const member = tk.startsWith('mitglied');
      return HttpResponse.json({
        campaignTitle: c.title, gmName: gm?.displayName, language: c.language,
        expiresAt: new Date(Date.now() + 15 * 60e3).toISOString(),
        memberAllowed: member, guestAllowed: !member, suggestedGuestName: member ? null : 'Kiran'
      });
    }),
    http.post(`${B}/consent-links/:token`, async ({ params, request }) => {
      const tk = String(params.token);
      if (!mockDiscordBot() || !TOKEN.test(tk) || tk.startsWith('abgelaufen')) return notFound();
      const b = (await request.json()) as { consent?: boolean; guestName?: string };
      if (b.consent !== true) return err(400, 'invalid_input', 'Zustimmung fehlt.');
      if (deps.authed(request)) {
        if (!tk.startsWith('mitglied')) return err(409, 'discord_mismatch', 'Dieser Link gehört zu einem anderen Discord-Konto.');
        if (!account.providers.includes('discord')) return err(409, 'discord_link_required', 'Verknüpfe zuerst dein Konto mit Discord.');
        const c = campaigns.find((x) => !x.archivedAt) ?? campaigns[0];
        const me = deps.myMember(c) as { recordingConsentAt?: string | null } | undefined;
        const at = new Date().toISOString();
        if (me) me.recordingConsentAt = at;
        return HttpResponse.json({ memberId: (me as { id?: string } | undefined)?.id, consent: true, consentSource: 'app', consentAt: at });
      }
      if (!b.guestName?.trim()) return err(400, 'invalid_input', 'Bitte einen Namen angeben.');
      return HttpResponse.json({ guestName: b.guestName.trim().slice(0, 40), consent: true, consentSource: 'link', consentAt: new Date().toISOString() });
    })
  ];
}
