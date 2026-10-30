/*
 * Testmodus zu Schnittstelle 0.4.28: Vorschläge von Spielenden, „Merken“, Zähler, laufende Runde.
 * Wie der echte Server: Spielende sehen nur die eigenen Vorschläge und Merkstellen, nie fremde und keine Anzahl;
 * Zähler sieht nur die Person selbst und die SL. Zum Ausprobieren in localStorage:
 * - „taleward.mock.live“ = 1: In „Die Erben des Drachenpasses“ läuft gerade eine Runde (Robin ist anwesend).
 */
import { HttpResponse, http } from 'msw';
import type { Bookmark, CounterKind, CounterValue, Entry, Member, PlayerProposal, PlayerProposalDecision, PlayerProposalIn } from '../api/types';
import { campaigns, entries, sessions } from './db';
import type { MockCampaign } from './db';

const setting = (key: string): string | null => { try { return localStorage.getItem(`taleward.mock.${key}`); } catch { return null; } };
const err = (status: number, code: string, message: string) => HttpResponse.json({ code, message }, { status });
const notFound = () => err(404, 'not_found', 'Nicht gefunden.');
const ago = (h: number) => new Date(Date.now() - h * 36e5).toISOString();
const id = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export const DSA_COUNTERS: CounterKind[] = [
  { id: 'lep', label: 'LeP', hint: 'Lebenspunkte' },
  { id: 'asp', label: 'AsP', hint: 'Astralpunkte' },
  { id: 'schip', label: 'SchiP', hint: 'Schicksalspunkte' }
];

/** Zählerstände je Mitglied */
const counters: Record<string, CounterValue[]> = {
  'm-jonas': [{ kindId: 'lep', value: 21, max: 34 }, { kindId: 'schip', value: 2, max: 3 }],
  'm-lea': [{ kindId: 'lep', value: 28, max: 28 }, { kindId: 'asp', value: 9, max: 30 }, { kindId: 'schip', value: 3, max: 3 }],
  'm-robin2': [{ kindId: 'lep', value: 30, max: 32 }, { kindId: 'schip', value: 1, max: 3 }]
};

export const playerProposals: PlayerProposal[] = [
  { id: 'pp1', campaignId: 'c-grau', authorMemberId: 'm-lea', entryType: 'npc', title: 'Der Fährmann',
    detail: 'Bringt Leute über den Moorsee, will nie Geld, nur eine Geschichte.', targetEntryId: null, state: 'open', createdAt: ago(20) },
  { id: 'pp2', campaignId: 'c-grau', authorMemberId: 'm-jonas', entryType: 'quest', title: 'Die schweigende Glocke',
    detail: 'Thorwald glaubt, dass jemand den Klöppel ausgetauscht hat.', targetEntryId: 'e6', state: 'open', createdAt: ago(5) },
  { id: 'pp3', campaignId: 'c-drache', authorMemberId: 'm-robin2', entryType: 'location', title: 'Hirtenhütte am Nebelkamm',
    detail: 'Hier hat Ilvara als Kind die Winter verbracht.', targetEntryId: null, state: 'accepted', createdAt: ago(200), decidedAt: ago(150), resultEntryId: null },
  { id: 'pp4', campaignId: 'c-drache', authorMemberId: 'm-robin2', entryType: 'npc', title: 'Kesh',
    detail: 'Ilvaras Bruder, seit drei Wintern verschwunden.', targetEntryId: null, state: 'open', createdAt: ago(30) }
];

const bookmarks: (Bookmark & { memberId: string })[] = [
  { id: 'bm1', memberId: 'm-robin2', sessionId: 's-c-drache-7', at: '2026-09-14T17:12:00Z', note: 'Die Stimme unter dem Eis', offsetMs: 4320000, recapParagraph: 0, createdAt: '2026-09-14T17:12:00Z' },
  { id: 'bm2', memberId: 'm-robin2', sessionId: 's-c-drache-7', at: '2026-09-14T18:40:00Z', note: null, offsetMs: null, recapParagraph: null, createdAt: '2026-09-14T18:40:00Z' }
];

// Laufende Runde zum Ausprobieren von „Merken“
if (setting('live') === '1' && !sessions.some((s) => s.id === 's-c-drache-live')) {
  sessions.push({
    id: 's-c-drache-live', campaignId: 'c-drache', number: 8, title: null, playedAt: ago(1), state: 'created', source: 'table',
    attendees: [{ memberId: 'm-robin2', consent: true, consentSource: 'app' }, { memberId: 'm-tim', consent: true, consentSource: 'app' }],
    durationSeconds: null, audioDeletedAt: null, transcriptionEngine: null, publishedAt: null, unreadComments: 0, phaseStartedAt: null
  });
}

export function counterKindsOf(c: MockCampaign): CounterKind[] {
  return c.counterKinds ?? [];
}

/** Zusätze für Campaign (0.4.28) */
export function playerExtras(c: MockCampaign, me: Member | undefined) {
  const gm = me?.role === 'gm';
  const live = sessions.find((s) => s.campaignId === c.id && (s.state === 'created' || s.state === 'uploading')
    && Date.now() - Date.parse(s.playedAt) < 16 * 36e5 && (gm || s.attendees.some((a) => a.memberId === me?.id)));
  return {
    ...(gm ? { openPlayerProposals: playerProposals.filter((p) => p.campaignId === c.id && p.state === 'open').length } : {}),
    liveSessionId: live?.id ?? null
  };
}

/** Mitglied, wie es die betrachtende Person sehen darf: Zähler nur für sich selbst und die SL */
export function memberCounters(c: MockCampaign, m: Member, viewer: Member | undefined): Member {
  const kinds = counterKindsOf(c);
  const mine = viewer?.id === m.id || viewer?.role === 'gm';
  if (!kinds.length || !mine || m.role !== 'player') return { ...m, counters: undefined };
  return { ...m, counters: (counters[m.id] ?? []).filter((v) => kinds.some((k) => k.id === v.kindId)) };
}

/** Für Spielende: eigener Vorschlag; resultEntryId nur, wenn der Eintrag sichtbar ist */
function forAuthor(p: PlayerProposal, visible: (e: Entry) => boolean): PlayerProposal {
  const e = p.resultEntryId ? entries.find((x) => x.id === p.resultEntryId) : undefined;
  return { ...p, resultEntryId: e && visible(e) ? e.id : null };
}

export function playerHandlers(B: string, deps: {
  myMember: (c: MockCampaign) => Member | undefined;
  /** Sieht diese Person den Eintrag? (wie der Server: gm_only und verborgen vor ihr = nein) */
  canSee: (e: Entry, m: Member) => boolean;
  createEntry: (c: MockCampaign, input: Partial<Entry>) => Entry;
}) {
  const campaignOf = (cid: string) => {
    const c = campaigns.find((x) => x.id === cid);
    const m = c && deps.myMember(c);
    return c && m ? { c, m } : null;
  };
  return [
    http.get(`${B}/campaigns/:id/player-proposals`, ({ params, request }) => {
      const g = campaignOf(String(params.id));
      if (!g) return notFound();
      const onlyOpen = new URL(request.url).searchParams.get('state') === 'open';
      const list = playerProposals.filter((p) => p.campaignId === g.c.id && (!onlyOpen || p.state === 'open'))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (g.m.role === 'gm') return HttpResponse.json(list);
      if (g.c.playerProposals === false) return HttpResponse.json([]);
      return HttpResponse.json(list.filter((p) => p.authorMemberId === g.m.id).map((p) => forAuthor(p, (e) => deps.canSee(e, g.m))));
    }),
    http.post(`${B}/campaigns/:id/player-proposals`, async ({ params, request }) => {
      const g = campaignOf(String(params.id));
      if (!g) return notFound();
      if (g.m.role !== 'player') return err(403, 'forbidden', 'Nur Spielende schlagen vor.');
      if (g.c.playerProposals === false) return err(403, 'player_proposals_off', 'In dieser Kampagne nimmt die Spielleitung gerade keine Vorschläge an.');
      const body = (await request.json()) as PlayerProposalIn;
      const title = body.title?.trim() ?? '';
      if (!title || title.length > 120 || (body.detail ?? '').length > 2000) return err(400, 'invalid_input', 'Bitte einen Namen angeben (höchstens 120 Zeichen).');
      if (body.targetEntryId) {
        const t = entries.find((e) => e.id === body.targetEntryId && e.campaignId === g.c.id);
        if (!t || !deps.canSee(t, g.m)) return notFound();
      }
      if (playerProposals.filter((p) => p.authorMemberId === g.m.id && p.state === 'open').length >= 20) {
        return err(409, 'player_proposal_limit', 'Du hast schon 20 offene Vorschläge. Warte, bis die Spielleitung sie angesehen hat.');
      }
      const p: PlayerProposal = { id: id('pp'), campaignId: g.c.id, authorMemberId: g.m.id, entryType: body.entryType, title,
        detail: body.detail?.trim() ?? '', targetEntryId: body.targetEntryId ?? null, state: 'open', createdAt: new Date().toISOString() };
      playerProposals.push(p);
      return HttpResponse.json(p, { status: 201 });
    }),
    http.delete(`${B}/player-proposals/:pid`, ({ params }) => {
      const p = playerProposals.find((x) => x.id === params.pid);
      const g = p && campaignOf(p.campaignId);
      if (!p || !g || p.authorMemberId !== g.m.id) return notFound();
      if (p.state !== 'open') return err(409, 'wrong_state', 'Die Spielleitung hat schon entschieden.');
      p.state = 'withdrawn';
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${B}/player-proposals/:pid/decision`, async ({ params, request }) => {
      const p = playerProposals.find((x) => x.id === params.pid);
      const g = p && campaignOf(p.campaignId);
      if (!p || !g || g.m.role !== 'gm') return notFound();
      if (p.state !== 'open') return err(409, 'wrong_state', 'Darüber ist schon entschieden.');
      const d = (await request.json()) as PlayerProposalDecision;
      p.decidedAt = new Date().toISOString();
      if (d.decision === 'reject') {
        p.state = 'rejected';
        return HttpResponse.json(p);
      }
      const into = d.mergeIntoEntryId === undefined ? p.targetEntryId : d.mergeIntoEntryId;
      const detail = (d.detail ?? p.detail ?? '').trim();
      if (into) {
        const e = entries.find((x) => x.id === into && x.campaignId === g.c.id);
        if (!e) return err(400, 'entry_unknown', 'Diesen Eintrag gibt es nicht.');
        if (detail) e.summary = e.summary ? `${e.summary}\n\n${detail}` : detail;
        if (d.gmNotes) e.gmNotes = e.gmNotes ? `${e.gmNotes}\n\n${d.gmNotes}` : d.gmNotes;
        e.updatedAt = p.decidedAt;
        p.resultEntryId = e.id;
      } else {
        const e = deps.createEntry(g.c, {
          type: d.entryType ?? p.entryType, name: (d.title ?? p.title).trim(), summary: detail, gmNotes: d.gmNotes ?? null,
          visibility: d.visibility ?? 'public', hiddenFromMemberIds: d.hiddenFromMemberIds ?? [],
          holderMemberId: (d.entryType ?? p.entryType) === 'item' ? d.holderMemberId ?? null : null
        });
        p.resultEntryId = e.id;
      }
      p.state = 'accepted';
      return HttpResponse.json(p);
    }),

    http.get(`${B}/sessions/:sid/bookmarks`, ({ params }) => {
      const s = sessions.find((x) => x.id === params.sid);
      const g = s && campaignOf(s.campaignId);
      if (!s || !g) return notFound();
      if (s.state !== 'published' && g.m.role !== 'gm' && !s.attendees.some((a) => a.memberId === g.m.id)) return notFound();
      return HttpResponse.json(bookmarks.filter((b) => b.sessionId === s.id && b.memberId === g.m.id).map(({ memberId: _m, ...b }) => b));
    }),
    http.post(`${B}/sessions/:sid/bookmarks`, async ({ params, request }) => {
      const s = sessions.find((x) => x.id === params.sid);
      const g = s && campaignOf(s.campaignId);
      if (!s || !g || !s.attendees.some((a) => a.memberId === g.m.id)) return notFound();
      if (s.state === 'published') return err(409, 'session_published', 'Die Runde ist schon veröffentlicht.');
      const body = (await request.json().catch(() => ({}))) as { at?: string; note?: string | null };
      const now = new Date().toISOString();
      const b = { id: id('bm'), memberId: g.m.id, sessionId: s.id, at: body.at ?? now, note: body.note?.trim() || null, offsetMs: null, recapParagraph: null, createdAt: now };
      bookmarks.push(b);
      const { memberId: _m, ...out } = b;
      return HttpResponse.json(out, { status: 201 });
    }),
    http.delete(`${B}/bookmarks/:bid`, ({ params }) => {
      const i = bookmarks.findIndex((b) => b.id === params.bid);
      const s = i >= 0 ? sessions.find((x) => x.id === bookmarks[i].sessionId) : undefined;
      const g = s && campaignOf(s.campaignId);
      if (i < 0 || !g || bookmarks[i].memberId !== g.m.id) return notFound();
      bookmarks.splice(i, 1);
      return new HttpResponse(null, { status: 204 });
    }),

    http.put(`${B}/campaigns/:id/members/me/counters`, async ({ params, request }) => {
      const g = campaignOf(String(params.id));
      if (!g) return notFound();
      const kinds = counterKindsOf(g.c);
      if (!kinds.length) return err(403, 'counters_off', 'In dieser Kampagne gibt es keine Zähler.');
      if (g.m.role !== 'player') return err(403, 'forbidden', 'Zähler gehören zu einer Figur.');
      const { values } = (await request.json()) as { values: CounterValue[] };
      if (!Array.isArray(values) || values.some((v) => !kinds.some((k) => k.id === v.kindId))) return err(400, 'counter_unknown', 'Diesen Zähler gibt es hier nicht.');
      counters[g.m.id] = values.map((v) => ({ kindId: v.kindId, value: Math.round(v.value), max: v.max ?? null }));
      return HttpResponse.json(counters[g.m.id]);
    })
  ];
}
