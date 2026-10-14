/*
 * Musterkampagne „Die leisen Wasser“ auf dem Musterserver: macht aus den Texten (de-*.ts, en-*.ts) die Daten, die
 * der nachgeahmte Server ausliefert. Je Start genau eine Sprache. Kapitel 1–7 veröffentlicht, Kapitel 8 wartet auf
 * die Prüfung der SL. Alle Zeiten werden in ganzen Wochen an heute herangerückt, damit Termine nicht veralten.
 */
import type { Comment, DatePoll, Entry, Proposal, Recap, Speaker, TranscriptSegment, UncertainTerm } from '../../api/types';
import type { StoredCharacter } from '../../characters/store';
import { MUSTER_HOST, musterCampaignId } from '../../api/muster';
import {
  campaigns, comments, datePolls, documentTexts, documents, entries, gmNotes, gmNotices, plans, portraits, proposals, recaps, seen, sessions, speakerLists,
  transcripts, uncertainTerms, world, type MockSession
} from '../db';
import { emblemBuffer, emblemDataUrl } from './emblems';
import { musterText } from './index';
import type { MusterProposal, Player, Who } from './types';

type Lang = 'de' | 'en';

export const DEMO_HOST = MUSTER_HOST;

export const DEMO_USERS: Record<string, { id: string; username: string; displayName: string }> & Record<Who, { id: string; username: string; displayName: string }> = {
  anja: { id: 'u-anja', username: 'anja', displayName: 'Anja' },
  lea: { id: 'u-lea', username: 'lea', displayName: 'Lea' },
  tom: { id: 'u-tom', username: 'tom', displayName: 'Tom' },
  sina: { id: 'u-sina', username: 'sina', displayName: 'Sina' }
};

export const musterMember = (lang: Lang, who: Who) => `m-${lang === 'de' ? 'w' : 'q'}-${who}`;
export const musterSessionId = (lang: Lang, n: number) => `s-${musterCampaignId(lang)}-${n}`;
const entryId = (lang: Lang, key: string) => `e-${musterCampaignId(lang)}-${key}`;

/** Feste Kennungen für Charaktere und mitgebrachte Welt (je Sprache verschieden, damit beide nebeneinander gehen) */
const ORDER = ['mara', 'ilsa', 'edda', 'tavin', 'fenna', 'juna', 'brann', 'kompass', 'schilf', 'garten', 'loeffel', 'schar', 'aldo', 'sterk',
  'fuchspass', 'post', 'liv-brief'];
export const musterCharacterId = (lang: Lang, key: string) =>
  `00000000-0000-4000-8000-${(0x700 + (lang === 'de' ? 0 : 0x100) + ORDER.indexOf(key) + 1).toString(16).padStart(12, '0')}`;

const JOINED: Record<Who, string> = { anja: '2026-06-10', lea: '2026-06-10', tom: '2026-06-10', sina: '2026-07-25' };
const PLAYERS: Player[] = ['lea', 'tom', 'sina'];

/** Ganze Wochen seit dem 07.10.2026, um die alle Zeiten verschoben werden (Wochentage bleiben gleich) */
const WEEK = 7 * 86400000;
const OFFSET = Math.max(0, Math.floor((Date.now() - Date.parse('2026-10-07T00:00:00Z')) / WEEK)) * WEEK;
const at = (iso: string, plusDays = 0) => new Date(Date.parse(iso) + OFFSET + plusDays * 86400000).toISOString();
/** Spieltag 19 Uhr Ortszeit (Mitteleuropa, bis 25.10. Sommerzeit) */
const evening = (day: string, hhmm = '19:00') => {
  const local = Date.parse(`${day}T${hhmm}:00Z`);
  return at(new Date(local - (day < '2026-10-25' ? 2 : 1) * 3600000).toISOString());
};
const secs = (t: string) => t.split(':').reduce((a, b) => a * 60 + Number(b), 0);
const quote = (lang: Lang, s: string) => (lang === 'de' ? `„${s}“` : `“${s}”`);

let seeded: Lang | null = null;

export function seedMuster(lang: Lang): void {
  if (seeded) return;
  seeded = lang;
  const x = musterText[lang];
  const cid = musterCampaignId(lang);
  const m = (who: Who) => musterMember(lang, who);
  const e = (key: string) => entryId(lang, key);
  const chr = (key: string) => musterCharacterId(lang, key);
  const collection = (who: Player) => x.collections[who].find((c) => c.inCampaign)!;
  const hidden = (list?: Player[]) => (list ?? []).map(m);

  // ---- Kampagne und Mitglieder
  campaigns.push({
    id: cid, host: MUSTER_HOST, title: x.title, description: x.description, worldInfo: x.worldInfo, language: lang,
    system: 'other', systemName: x.systemName, allowCloudSummary: false, allowExternalTranscription: false, hotwords: x.hotwords,
    coverPreset: 'swamp', inviteCode: 'NEBEL-2026', nextSessionAt: null,
    links: x.links.map((l) => ({ id: `link-${cid}-${l.key}`, label: l.label, url: l.url, shared: l.shared })),
    members: [
      { id: m('anja'), userId: DEMO_USERS.anja.id, displayName: 'Anja', characterName: null, role: 'gm', recordingConsentAt: at(`${JOINED.anja}T18:00:00Z`) },
      ...PLAYERS.map((who) => {
        const c = collection(who);
        return {
          id: m(who), userId: DEMO_USERS[who].id, displayName: DEMO_USERS[who].displayName, role: 'player' as const,
          recordingConsentAt: at(`${JOINED[who]}T18:00:00Z`), characterName: c.name, characterSummary: x.members[who].summary,
          characterBackstory: x.members[who].backstory, characterId: chr(c.key), characterVersion: 2, characterStatus: c.status,
          characterNickname: c.nickname ?? null, portraitUpdatedAt: at(`${JOINED[who]}T18:30:00Z`), moveConsentAt: null
        };
      })
    ]
  });
  for (const who of PLAYERS) {
    portraits[m(who)] = { data: emblemBuffer(collection(who).emblem), type: 'image/svg+xml', updatedAt: at(`${JOINED[who]}T18:30:00Z`) };
  }

  // ---- Kapitel 1–7, veröffentlicht
  x.chapters.forEach((ch, i) => {
    const n = i + 1;
    const id = musterSessionId(lang, n);
    const played = evening(ch.date);
    const published = at(`${ch.date}T09:00:00Z`, 1);
    sessions.push({
      id, campaignId: cid, number: n, title: ch.title, playedAt: played, state: 'published', source: 'table',
      attendees: [
        ...ch.present.map((who) => ({ memberId: m(who), consent: true, consentSource: 'app' as const, consentAt: played })),
        ...(ch.guest ? [{ guestName: ch.guest, consent: true, consentSource: 'on_site' as const, consentAt: played }] : [])
      ],
      durationSeconds: ch.minutes * 60, audioDeletedAt: published, publishedAt: published, phaseStartedAt: null, transcriptionEngine: 'local'
    } as MockSession);
    recaps[id] = { sessionId: id, number: n, title: ch.title, publishedAt: published, text: ch.recap, openThreads: ch.threads };
    gmNotes[id] = ch.gmNote;
  });

  // ---- Bibel
  for (const it of x.entries) {
    const ns = (it.mentions ?? []).map((k) => k[0]);
    entries.push({
      id: e(it.key), campaignId: cid, type: it.type, name: it.name, summary: it.summary, visibility: it.gmOnly ? 'gm_only' : 'public',
      hiddenFromMemberIds: hidden(it.hiddenFrom), gmNotes: it.gmNotes ?? null, status: it.status ?? null,
      holderMemberId: it.holder ? m(it.holder) : null, firstSessionNumber: ns.length ? Math.min(...ns) : null,
      lastSessionNumber: ns.length ? Math.max(...ns) : null, mentions: (it.mentions ?? []).map(([n, note]) => ({ sessionNumber: n, note })),
      updatedAt: at('2026-09-20T10:00:00Z')
    } as Entry);
  }

  // ---- Kapitel 8: Entwurf mit Abschrift, Gegenprüfung, Vorschlägen, unsicheren Namen und Stimmen
  const c8 = x.ch8;
  const s8 = musterSessionId(lang, 8);
  const played8 = evening(c8.date);
  sessions.push({
    id: s8, campaignId: cid, number: 8, title: c8.title, playedAt: played8, state: 'awaiting_review', source: 'table',
    attendees: (['anja', 'lea', 'tom', 'sina'] as Who[]).map((who) => ({ memberId: m(who), consent: true, consentSource: 'app' as const, consentAt: played8 })),
    durationSeconds: c8.minutes * 60, audioDeletedAt: null, publishedAt: null, phaseStartedAt: null, transcriptionEngine: 'local'
  } as MockSession);
  gmNotes[s8] = c8.gmNote;

  const speakerOf: Record<Who, string> = { anja: 'sp1', tom: 'sp2', lea: 'sp3', sina: 'sp4' };
  const nameToWho = (name: string) => name.toLowerCase() as Who;
  const lines = c8.transcript.split('\n').map((l) => {
    const [, time, name, text] = /^\[(\d\d:\d\d:\d\d)\] (\w+): (.*)$/.exec(l)!;
    return { start: secs(time), who: nameToWho(name), text };
  });
  transcripts[s8] = lines.map((l, i): TranscriptSegment => ({
    start: l.start, end: Math.min(l.start + 8, lines[i + 1]?.start ?? l.start + 8), speakerId: speakerOf[l.who], memberId: m(l.who), text: l.text
  }));

  const count = (v: string) => c8.review.filter((r) => r.verdict === v).length;
  recaps[s8] = {
    sessionId: s8, number: 8, title: c8.title, publishedAt: null, text: c8.recap, openThreads: c8.threads,
    review: {
      state: 'done', stale: false, checkedAt: at('2026-10-04T08:20:00Z'), model: lang === 'de' ? 'Lokales Modell' : 'Local model', revised: false,
      report: { total: c8.review.length, supported: count('supported'), partial: count('partial'), unsupported: count('unsupported'),
        contradicted: count('contradicted'), offGame: count('off_game') },
      paragraphs: c8.review.map((r, index) => ({
        index, verdict: r.verdict, note: r.note,
        evidence: r.evidence.map(([time, who, q]) => ({ start: secs(time), end: secs(time) + 6, quote: q, speakerMemberId: m(who) }))
      }))
    }
  } as Recap;

  const proposal = (p: MusterProposal, base: Partial<Proposal>): Proposal => {
    const target = p.target ? entries.find((y) => y.id === e(p.target!)) : undefined;
    // Ergänzung: Ist der Text kein ganzer neuer Eintrag, wird er an den bisherigen angehängt; leer = öffentlicher Teil bleibt
    let detail = p.detail;
    if (target && p.action === 'update') {
      if (!detail || base.decision === 'accepted') detail = target.summary;
      else if (!detail.startsWith(target.summary.slice(0, 20))) detail = `${target.summary} ${detail}`;
    }
    return {
      id: `${base.sessionId ?? base.documentId}-${p.key}`, sessionId: null, documentId: null, entryType: p.type, action: p.action,
      targetEntryId: target?.id ?? null, title: p.title, detail, gmNotes: p.gmNotes ?? null,
      suggestedVisibility: p.gmOnly ? 'gm_only' : 'public', hiddenFromMemberIds: p.hiddenFrom ? hidden(p.hiddenFrom) : target?.hiddenFromMemberIds ?? [],
      visibilityReason: p.visibilityReason ?? null, confidence: p.confidence, flags: p.flag ? [p.flag] : [],
      evidence: p.evidence.map(([where, q]) => (typeof where === 'number' ? { page: where, quote: q } : { start: secs(where), quote: q })),
      decision: p.decision ?? 'open', ...base
    } as Proposal;
  };
  proposals.push(...c8.proposals.map((p) => proposal(p, { sessionId: s8, source: 'session' })));

  uncertainTerms[s8] = c8.terms.map((term, i): UncertainTerm => ({
    id: `${s8}-ut${i + 1}`, heard: term.heard, alternatives: term.alternatives, occurrences: term.occurrences, confidence: term.confidence,
    examples: [{ start: secs(term.example[0]), quote: term.example[1] }], suggestedEntryId: term.entry ? e(term.entry) : null, suggestedMemberId: null
  }));

  speakerLists[s8] = c8.speakers.map((sp, i): Speaker => ({
    id: speakerOf[sp.who], label: `${lang === 'de' ? 'Stimme' : 'Voice'} ${i + 1}`, speakingSeconds: sp.minutes * 60,
    sampleText: quote(lang, sp.sample), suggestedMemberId: m(sp.who), confidence: sp.confidence, source: sp.source
  }));

  // ---- Kommentare (Kapitel 8 ist unveröffentlicht und hat noch keine)
  x.comments.forEach((k, i) => {
    const ch = x.chapters[k.ch - 1];
    comments.push({
      id: `${cid}-k${i + 1}`, sessionId: musterSessionId(lang, k.ch), authorMemberId: m(k.who), recipientMemberId: k.to ? m(k.to) : null,
      text: k.text, createdAt: at(`${ch.date}T${String(10 + i % 8).padStart(2, '0')}:15:00Z`, 2),
      editedAt: null
    } as Comment);
  });

  // ---- Terminabstimmung für Kapitel 9
  datePolls.push({
    id: `poll-${cid}`, campaignId: cid, status: 'open', note: x.poll.note, createdAt: at(`${x.poll.createdAt}T08:00:00Z`), chosenOptionId: null,
    options: x.poll.options.map((o, i) => {
      const [day, time] = o.at.split('T');
      return {
        id: `${cid}-o${i + 1}`, startsAt: evening(day, time), proposedByMemberId: m(o.by),
        votes: (Object.entries(o.votes) as [Who, 'yes' | 'maybe' | 'no'][]).map(([who, answer]) => ({ memberId: m(who), answer }))
      };
    })
  } as DatePoll);

  // ---- SL-Unterlagen
  for (const d of x.documents) {
    const did = `doc-${cid}-${d.key}`;
    documents.push({
      id: did, campaignId: cid, title: d.title, fileName: d.fileName, kind: d.kind, sizeBytes: d.pages * 41_000, pageCount: d.pages,
      state: d.state, progress: null, message: null, proposalCount: 0, openProposalCount: 0, worldInfoSuggestion: d.worldInfoSuggestion ?? null,
      uploadedByMemberId: m('anja'), createdAt: at(`${d.createdAt}T16:00:00Z`), phaseStartedAt: 0
    });
    proposals.push(...d.proposals.map((p) => proposal(p, { documentId: did, source: 'document' })));
    // Zeilen „Seite n“ trennen die Seiten; was davor steht (Titel), gehört zu Seite 1
    const [head, ...pages] = d.text.split(/\n?(?:Seite|Page) \d+\n/);
    documentTexts[did] = (pages.length ? [`${head.trim()}\n\n${pages[0]}`.trim(), ...pages.slice(1)] : [head]).join('\f');
  }

  // ---- Kapitelplan der SL für Kapitel 9 (ab 0.4.12)
  plans.push({
    id: `plan-${cid}-9`, campaignId: cid, title: x.plan.title, sessionNumber: 9, state: 'ready', notes: x.plan.notes,
    scenes: x.plan.scenes.map((sc) => ({ id: `scene-${cid}-${sc.key}`, title: sc.title, notes: sc.notes, entryIds: sc.entries.map(e), state: sc.state ?? 'open' })),
    names: x.plan.names, documentIds: x.plan.documents.map((k) => `doc-${cid}-${k}`),
    createdAt: at('2026-10-02T18:00:00Z'), updatedAt: at('2026-10-02T18:00:00Z')
  });

  // ---- Mitgebrachte Welt: Vorschläge der Spielerinnen und übernommene Einträge
  for (const who of PLAYERS) {
    const c = collection(who);
    world[m(who)] = {};
    for (const w of c.world) {
      const pid = `cp-${cid}-${w.key}`;
      const accepted = w.state === 'accepted';
      proposals.push({
        id: pid, sessionId: null, documentId: null, source: 'character', originCharacterId: chr(c.key), originEntryId: chr(w.key),
        submittedByMemberId: m(who), entryType: w.type, action: 'create', targetEntryId: accepted ? e(w.entry!) : null, title: w.name,
        detail: w.summary, relation: w.relation ?? null, gmNotes: null, suggestedVisibility: 'public', hiddenFromMemberIds: hidden(w.hiddenFrom), confidence: 1, flags: [],
        evidence: [], decision: accepted ? 'accepted' : 'open'
      } as Proposal);
      world[m(who)][chr(w.key)] = { id: chr(w.key), version: 1, proposalId: pid, entryId: accepted ? e(w.entry!) : null, serverVersion: accepted ? 1 : null };
    }
  }

  // ---- Hinweis an die SL: Sina ist neu und sieht das Turmzeichen nicht
  (gmNotices[cid] ??= []).push({
    id: `gn-${cid}-sina`, code: 'hidden_entries_for_newcomer', memberId: m('sina'), entryIds: [e('turmzeichen')], createdAt: at('2026-07-25T21:00:00Z')
  });

  // Ab Schnittstelle 0.4.14: Sina ist neu beigetreten (Hinweis „Passt“ / „Entfernen“)
  gmNotices[cid].push({ id: `gn-${cid}-sina-neu`, code: 'member_joined', memberId: m('sina'), entryIds: [], createdAt: at('2026-07-25T20:55:00Z') });

  // Keine Ungelesen-Punkte zum Start
  seen.chronicle[cid] = '2099-01-01T00:00:00Z';
  seen.bible[cid] = '2099-01-01T00:00:00Z';
}

/** Sammlung „Meine Charaktere“ einer Spielerin, verknüpft mit der Musterkampagne auf connId */
export function musterCollection(lang: Lang, who: Player, connId: string, serverName: string, owner: string | null): StoredCharacter[] {
  const x = musterText[lang];
  const cid = musterCampaignId(lang);
  const chr = (key: string) => musterCharacterId(lang, key);
  return x.collections[who].map((c, i) => {
    const created = at(`${c.inCampaign ? JOINED[who] : `2026-0${3 + i}-01`}T10:00:00Z`);
    return {
      id: chr(c.key), version: 2, name: c.name, nickname: c.nickname ?? null, summary: c.summary, backstory: c.backstory || null,
      system: c.system ?? null, status: c.status, statusChangedAt: c.status === 'active' ? null : created, notes: c.notes,
      portrait: emblemDataUrl(c.emblem), portraitMeta: null, portraitChangedAt: created,
      world: c.world.map((w) => ({ id: chr(w.key), version: 1, type: w.type, name: w.name, summary: w.summary, secret: w.secret, relation: w.relation ?? null })),
      links: c.inCampaign ? [{
        connId, serverName, campaignId: cid, campaignTitle: x.title, memberId: musterMember(lang, who), linkedAt: at(`${JOINED[who]}T18:00:00Z`),
        syncedVersion: 2, portraitSynced: created, submitted: Object.fromEntries(c.world.map((w) => [chr(w.key), 1])),
        world: c.world.map((w) => ({
          id: chr(w.key), proposalId: `cp-${cid}-${w.key}`, entryId: w.state === 'accepted' ? entryId(lang, w.entry!) : null, state: w.state,
          serverVersion: w.state === 'accepted' ? 1 : null
        }))
      }] : [],
      chronicles: {}, createdAt: created, updatedAt: at('2026-10-04T10:00:00Z'), ...(owner ? { owners: [owner] } : {})
    };
  });
}

/** Neue Runde in der Musterkampagne (Probeaufnahme): kein Inhalt aus anderen Testdaten, nur ein ehrlicher Platzhalter */
export function musterProbe(campaignId: string, sessionId: string): { recap: string; threads: string[]; speakers: Speaker[] } | null {
  const lang = seeded;
  if (!lang || campaignId !== musterCampaignId(lang)) return null;
  const de = lang === 'de';
  return {
    recap: de
      ? 'Hier stünde das Kapitel zu eurer Aufnahme. In der Musterkampagne hört niemand zu: Die Aufnahme bleibt auf diesem Gerät, wird nicht ausgewertet und ist nach dem Beenden der Musterkampagne weg.\n\nWie ein fertiger Entwurf aussieht, zeigt Kapitel 8.'
      : 'This is where the chapter for your recording would go. Nobody listens in the sample campaign: the recording stays on this device, is not analysed and is gone once you end the sample campaign.\n\nChapter 8 shows what a finished draft looks like.',
    threads: [de ? 'Wer trug die Laterne am Grauwehrer Ufer?' : 'Who was carrying the lantern on the Grauwehr bank?'],
    speakers: (speakerLists[musterSessionId(lang, 8)] ?? []).map((sp) => ({ ...sp, id: `${sessionId}-${sp.id}` }))
  };
}
