import { http, HttpResponse, delay } from 'msw';
import { DEMO_HOST, DEMO_USERS, musterProbe } from './muster/seed';
import { textToPdf } from './minipdf';
import { cleanAliases, findMatch, secretWarnings } from './checks';
import { billingHandlers, billingInfo, campaignExtras, mockAnalysisCost, mockCreditWait, recordChange, snapshot } from './billing';

/** Alle Titelbild-IDs (Schnittstelle 0.4.3) – wie der Server: neue Kampagnen bekommen eines zufällig */
const COVER_IDS = ['meadow', 'forest', 'desert', 'city', 'cyber', 'mountains', 'coast', 'swamp', 'dungeon', 'space', 'castle', 'dark-fantasy', 'moonwood', 'ancient-ruins', 'tavern', 'battlefield', 'frozen-north', 'arcane-ruins', 'fairy-wilds', 'underworld', 'storm-coast', 'steampunk', 'post-apocalypse', 'western', 'noir', 'space-opera', 'orient', 'necropolis', 'manor', 'riverside-mystery'];
import type { CampaignDocument, CharacterAnalysis, ChapterPlan, ChapterPlanInput, Link, CampaignExport, CampaignSummary, Character, ImportStatus, Chronicle, Comment, Correction, WorldEntryIn, WorldEntryStatus, Entry, DatePoll, EntryInput, ProcessingStatus, Proposal, Recap, RecapPart, Session, UncertainTerm, VoteAnswer, VoiceProfile, Member } from '../api/types';
import {
  ME, NACHBAR_HOST, account, characterAnalyses, gmNotices, world, type WorldRecord, campaigns, comments, coverImages, datePolls, documentTexts, documents, plans, portraits, proposalsForDocument, seen, entries, gmNotes, proposals, proposalsFor, recaps, sessions, speakersFor, uploads, speakerLists, transcripts, uncertainTerms,
  type MockCampaign, type MockSession
} from './db';

const B = '*/api/v1';
const TOKEN = 'mock-token';
const CHUNK = 5 * 1024 * 1024;

// Dauer der simulierten Verarbeitungsschritte in Sekunden
const PHASES = { queued: 2, transcribing: 8, summarizing: 6 };

const voice: VoiceProfile & { readyAt: number } = {
  status: 'none', createdAt: null, sampleSeconds: null, learnFromSessions: true, learnedSessionCount: 0, message: null, readyAt: 0
};

function voiceStatus(): VoiceProfile {
  if (voice.status === 'processing' && Date.now() > voice.readyAt) voice.status = 'ready';
  const { readyAt: _r, ...rest } = voice;
  return rest;
}

const err = (status: number, code: string, message: string) =>
  HttpResponse.json({ code, message }, { status });

/** Testmodus: welcher „Server“ ist gemeint? (alles außer nachbarverein.test ist der eingebaute) */
function hostKey(req: Request): string {
  const h = new URL(req.url).hostname;
  return h === NACHBAR_HOST || h === DEMO_HOST ? h : 'local';
}

/** Test-Nutzer mit den Anmelde-Angaben, die nur die Person selbst sieht */
function meUser() {
  return ME.id === 'u-robin' ? { ...ME, ...account } : { ...ME, email: null, emailPending: null, hasPassword: true, providers: [], termsAcceptedVersion: termsVersion(), termsAcceptedAt: null };
}

/**
 * Fassung der Nutzungsbedingungen des Testservers (0.4.22). Zum Ausprobieren einer neuen Fassung:
 * localStorage „taleward.mock.termsVersion“ auf 2 setzen und neu laden.
 */
function termsVersion(): number {
  try { return Math.max(1, Number(localStorage.getItem('taleward.mock.termsVersion')) || 1); } catch { return 1; }
}
const termsOutdated = () => (account.termsAcceptedVersion ?? 0) < termsVersion();

/**
 * Registrierungsart und SL-Freigabe des Testservers (0.4.23). Zum Ausprobieren in localStorage setzen und neu laden:
 * „taleward.mock.registration“ = invite_only | code | open | closed (allgemeiner Code: TAVERNE-2026),
 * „taleward.mock.gmApproval“ = required, „taleward.mock.gmPermission“ (unten), „taleward.mock.gmDecision“ = granted | rejected (entscheidet eine offene
 * Anfrage beim nächsten Laden des Profils). Ein neu angelegtes Konto startet ohne Freigabe.
 */
const mockSetting = (key: string): string | null => { try { return localStorage.getItem(`taleward.mock.${key}`); } catch { return null; } };
const registrationSetting = () => {
  const r = mockSetting('registration');
  return r === 'code' || r === 'open' || r === 'closed' ? r : 'invite_only';
};
const gmRequired = () => mockSetting('gmApproval') === 'required';
const MOCK_REGISTRATION_CODE = 'TAVERNE-2026';
// „taleward.mock.gmPermission“ = none | pending | rejected: Startstand des Test-Kontos (sonst granted)
{
  const g = mockSetting('gmPermission');
  if (g === 'none' || g === 'pending' || g === 'rejected') account.gmPermission = g;
}
let emailPendingSince = 0;

function authed(req: Request): boolean {
  return (req.headers.get('Authorization') ?? '').startsWith(`Bearer ${TOKEN}`);
}

function myMember(c: MockCampaign) {
  // Wer verlassen hat oder entfernt wurde, ist kein Mitglied mehr
  return c.members.find((m) => m.userId === ME.id && !m.leftAt);
}

function isGm(campaignId: string): boolean {
  const c = campaigns.find((x) => x.id === campaignId);
  return !!c && myMember(c)?.role === 'gm';
}

function summary(c: MockCampaign): CampaignSummary {
  const me = myMember(c)!;
  const cs = sessions.filter((s) => s.campaignId === c.id);
  const published = cs.filter((s) => s.state === 'published');
  return {
    id: c.id,
    title: c.title,
    myRole: me.role,
    myCharacterName: me.characterName,
    memberCount: c.members.length,
    publishedSessionCount: published.length,
    pendingReviewCount: me.role === 'gm' ? cs.filter((s) => s.state === 'awaiting_review' || s.state === 'awaiting_speakers').length : 0,
    openCharacterProposals: me.role === 'gm'
      ? proposals.filter((p) => p.source === 'character' && p.decision === 'open' && c.members.some((m) => m.id === p.submittedByMemberId)).length : 0,
    lastPublishedAt: published.map((s) => s.publishedAt!).sort().pop() ?? null,
    unread: unreadFor(c),
    archivedAt: c.archivedAt ?? null,
    organization: c.host === NACHBAR_HOST ? { id: 'org-nachbar', name: 'Spielgemeinschaft Nachbarort e. V.' } : { id: 'org-verein', name: 'Rollenspielverein' },
    coverPreset: c.coverPreset,
    coverImageUpdatedAt: coverImages[c.id]?.updatedAt ?? null,
    nextSessionAt: c.nextSessionAt,
    datePollNeedsMyVote: (() => {
      const poll = datePolls.find((p) => p.campaignId === c.id && p.status === 'open');
      return !!poll && poll.options.some((o) => !o.votes.some((v) => v.memberId === me.id));
    })()
  };
}

/** Schreitet die simulierte Verarbeitung anhand der verstrichenen Zeit voran. */
function advance(s: MockSession): ProcessingStatus {
  const t = s.phaseStartedAt ? (Date.now() - s.phaseStartedAt) / 1000 : 0;
  let progress: number | null = null;
  if (s.state === 'queued' && t > PHASES.queued) {
    s.state = 'transcribing';
    s.phaseStartedAt = Date.now();
  } else if (s.state === 'transcribing') {
    progress = Math.min(1, t / PHASES.transcribing);
    if (t > PHASES.transcribing / 2 && s.failNext) {
      s.state = 'failed';
      s.phaseStartedAt = null;
      return {
        state: 'failed', progress: null, queuePosition: null, updatedAt: new Date().toISOString(),
        message: 'Die Transkription ist abgebrochen (Testmodus: Dateiname enthält „fehler“).'
      };
    }
    if (t > PHASES.transcribing && s.retranscribing) {
      // Erneute Transkription nach Korrektur (0.4.6): Stimmzuordnung bleibt, gleich weiter zur Zusammenfassung
      s.retranscribing = false;
      s.state = 'summarizing';
      s.phaseStartedAt = Date.now();
      progress = 0;
    } else if (t > PHASES.transcribing) {
      s.state = 'awaiting_speakers';
      s.transcriptionEngine = 'local';
      s.durationSeconds = 13920;
      s.audioDeletedAt = new Date().toISOString();
      s.phaseStartedAt = null;
      progress = null;
    }
  } else if (s.state === 'summarizing') {
    progress = Math.min(1, t / PHASES.summarizing);
    if (t > PHASES.summarizing) {
      s.state = 'awaiting_review';
      s.phaseStartedAt = null;
      progress = null;
      const old = rewrites[s.id];
      if (old) {
        delete rewrites[s.id];
        if (old.recap) recaps[s.id] = { ...old.recap, review: old.recap.review ? { ...old.recap.review, stale: false } : undefined };
        proposals.push(...old.proposals.map((p) => ({ ...p, decision: 'open' as const })));
      }
      const probe = musterProbe(s.campaignId, s.id);
      if (!recaps[s.id]) {
        recaps[s.id] = {
          sessionId: s.id, number: s.number, title: s.title ?? `Kapitel ${s.number}`, publishedAt: null,
          text: probe?.recap ?? 'Dies ist ein Test-Kapitel aus dem Testmodus. Der echte Server schreibt hier die Zusammenfassung der Runde.',
          openThreads: probe?.threads ?? ['Offener Faden aus der Testsession']
        };
      }
      if (!probe && !proposals.some((p) => p.sessionId === s.id)) proposals.push(...proposalsFor(s.id));
    }
  }
  return {
    state: s.state,
    progress,
    queuePosition: s.state === 'queued' ? 1 : null,
    message: s.state === 'failed' ? 'Die Transkription ist abgebrochen (Testmodus).'
      : s.state === 'queued' ? 'Zurzeit ist kein Worker für die Transkription verbunden. Die Runde wird verarbeitet, sobald einer da ist. (Testmodus)'
      // Ab 0.4.6: feste Schlüssel für die Schritte der Zusammenfassung, die App übersetzt sie
      : s.state === 'summarizing' ? ((progress ?? 0) < 0.34 ? 'summarizing.recap' : (progress ?? 0) < 0.67 ? 'summarizing.proposals' : 'summarizing.review')
      : null,
    updatedAt: new Date().toISOString(),
    ...(s.retranscribes && (s.state === 'transcribing' || s.state === 'summarizing') ? { estimatedSeconds: Math.max(0, Math.round(
      (s.state === 'transcribing' ? PHASES.transcribing + PHASES.summarizing : PHASES.summarizing) - (s.phaseStartedAt ? (Date.now() - s.phaseStartedAt) / 1000 : 0))) } : {})
  };
}

// ---------------- Qualitätsprüfung (0.4.6): unsicher erkannte Namen im Testmodus

const uncertain: Record<string, UncertainTerm[]> = Object.assign(uncertainTerms, {
  's-c-grau-13': [
    { id: 'ut1', heard: 'Ilsabeth', alternatives: ['Ilsabet', 'Elisabeth'], occurrences: 4, confidence: 0.41,
      examples: [{ start: 1790, quote: 'Ilsabeth, kannst du dir den Wachmann ansehen?' }, { start: 1812, quote: 'Danke, Ilsabeth.' }],
      suggestedEntryId: null, suggestedMemberId: 'm-lea' },
    { id: 'ut2', heard: 'Kaltenfurth', alternatives: ['Kaltenfurt'], occurrences: 2, confidence: 0.55,
      examples: [{ start: 320, quote: 'Morgen früh sind wir in Kaltenfurth.' }], suggestedEntryId: null, suggestedMemberId: null },
    { id: 'ut3', heard: 'Veira', alternatives: ['Veyra', 'Vera'], occurrences: 3, confidence: 0.48,
      examples: [{ start: 1530, quote: 'Veira, lass sie durch.' }], suggestedEntryId: null, suggestedMemberId: null }
  ]
});

/** Kurzes Test-Transkript rund um die Belegstellen von Kapitel 13 (Korrekturen wirken auch hier) */
const transcriptLines: [number, string | null, string][] = [
  [318, 'm-jonas', 'Wie weit ist es noch?'],
  [320, 'm-robin', 'Morgen früh sind wir in Kaltenfurth.'],
  [1510, 'm-robin', 'Am Tor steht eine Frau in Rüstung, die Hand am Schwert.'],
  [1520, 'm-robin', 'Ich bin Hauptfrau Dornfeld, und ihr kommt hier nicht rein.'],
  [1530, 'm-jonas', 'Veira, lass sie durch.'],
  [1790, 'm-robin', 'Ilsabeth, kannst du dir den Wachmann ansehen?'],
  [1804, 'm-lea', 'Ich lege ihm die Hand auf die Stirn und spreche den Heilsegen.'],
  [1812, 'm-robin', 'Danke, Ilsabeth.'],
  [5390, 'm-robin', 'Das Wasser zieht sich zurück.'],
  [5400, 'm-robin', 'Die Kapelle steht halb im Wasser.'],
  [6190, 'm-sophie', 'Ich stecke den Schlüssel ein.'],
  [6210, null, 'Das Zeichen ist dasselbe wie auf dem Siegel!'],
  [6230, 'm-robin', 'Hört ihr das?']
];
/** Korrekturen je Session, wirken auf die Abschrift */
const transcriptFixes: Record<string, [string, string][]> = {};

function transcriptFor(sessionId: string) {
  const fix = (text: string) => (transcriptFixes[sessionId] ?? []).reduce((acc, [a, b]) => replaceWord(acc, a, b), text);
  if (transcripts[sessionId]) return transcripts[sessionId].map((x) => ({ ...x, text: fix(x.text) }));
  if (sessionId !== 's-c-grau-13') return [];
  return transcriptLines.map(([start, memberId, text], i) => ({ start, end: start + 6, speakerId: `sp${i % 4}`, memberId, text: fix(text) }));
}

/** 0.4.21: „neu anlegen“-Vorschläge gegen die Bibel prüfen (nur SL bekommt Vorschläge) */
function withMatch(p: Proposal): Proposal {
  if (p.action !== 'create' || p.source === 'character') return p;
  const campaignId = sessions.find((x) => x.id === p.sessionId)?.campaignId ?? documents.find((d) => d.id === p.documentId)?.campaignId;
  return { ...p, match: findMatch(p.title, entries.filter((e) => e.campaignId === campaignId)), mergeIntoEntryId: p.mergeIntoEntryId ?? null };
}

/** Recap so, wie diese Person ihn sehen darf: den Prüfteil bekommt nur die SL */
function recapFor(r: Recap, gm: boolean): Recap {
  if (gm) {
    // 0.4.21: Geheimes im Kapitel – nur für die SL; ein angenommener reveal-Vorschlag zählt nicht
    const s = sessions.find((x) => x.id === r.sessionId);
    const revealed = proposals.filter((p) => p.sessionId === r.sessionId && p.action === 'reveal' && p.decision === 'accepted').map((p) => p.targetEntryId ?? '');
    const list = s ? entries.filter((e) => e.campaignId === s.campaignId) : [];
    return { ...withRevision(r), gmWarnings: r.publishedAt ? [] : secretWarnings(r.text, list, revealed) };
  }
  const { review: _r, revision: _v, gmWarnings: _w, ...rest } = r;
  return rest;
}

// ---------------- Korrektur per Hinweis (0.4.15): Entwurf nach kurzer Wartezeit, nur betroffene Absätze

const revisionJobs: Record<string, { readyAt: number; result: NonNullable<Recap['revision']> }> = {};
const revisionCount: Record<string, number[]> = {};

/** Läuft der Auftrag lange genug, liegt der Entwurf vor */
function withRevision(r: Recap): Recap {
  const job = revisionJobs[r.sessionId];
  if (job && r.revision?.state === 'running' && Date.now() >= job.readyAt) {
    r.revision = job.result;
    delete revisionJobs[r.sessionId];
  }
  return r;
}

/**
 * Testmodus: jeder Satz des Hinweises ist ein eigener Hinweis. Mit Bezug „Zu „…“:“ landet er in diesem Absatz, sonst in
 * dem, mit dem er die meisten Wörter teilt („fehlt …“ im letzten Absatz); ohne gemeinsames Wort bleibt er unumgesetzt.
 */
function mockRevision(text: string, note: string): NonNullable<Recap['revision']> {
  const paras = text.split(/\n\s*\n/);
  const after = [...paras];
  const words = (x: string) => new Set(x.toLowerCase().match(/[\p{L}]{4,}/gu) ?? []);
  const sentences = (x: string) => (x.match(/[^.!?]+[.!?]?/g) ?? []).map((y) => y.trim()).filter(Boolean);
  // Erst je Zeile: Bezug „Zu „…“:“ (setzt die App davor) bestimmt den Absatz, erst danach in Sätze teilen
  const items: { sentence: string; target: number | null }[] = [];
  for (const line of note.split('\n').map((x) => x.trim()).filter(Boolean)) {
    const ref = line.match(/^(?:zu|about)\s+[„"“](.*?)[“"”]:\s*/i);
    let target: number | null = null;
    let rest = line;
    if (ref) {
      const head = ref[1].replace(/\s*…$/, '').trim();
      const i = paras.findIndex((p) => p.trim().startsWith(head));
      target = i >= 0 ? i : null;
      rest = line.slice(ref[0].length);
    }
    for (const sentence of sentences(rest)) items.push({ sentence, target });
  }
  const notes = items.map(({ sentence, target }) => {
    let best = target ?? -1;
    if (best < 0) {
      const w = words(sentence);
      let score = 0;
      paras.forEach((p, i) => {
        const hit = [...words(p)].filter((x) => w.has(x)).length;
        if (hit > score) { score = hit; best = i; }
      });
    }
    if (best < 0 && /fehlt|missing/i.test(sentence)) best = paras.length - 1;
    if (best < 0) return { text: sentence, applied: false, indexes: [] as number[] };
    const fix = sentence.replace(/^(es )?fehlt[:,]?\s*/i, '').replace(/\s*fehlt\.?$/i, '.');
    after[best] = `${after[best]} ${fix.charAt(0).toUpperCase()}${fix.slice(1)}`.replace(/\s+/g, ' ');
    return { text: sentence, applied: true, indexes: [best] };
  });
  const changes = paras.map((before, index) => ({ index, before, after: after[index] })).filter((c) => c.before !== c.after);
  return { state: 'ready', message: null, createdAt: new Date().toISOString(), changes, notes };
}

function replaceWord(text: string, heard: string, correct: string): string {
  return text.split(heard).join(correct);
}

// ---------------- Charaktere (0.4.7): Serverkopie, mitgebrachte Welt, Hinweise an die SL


function worldStatus(w: WorldRecord): WorldEntryStatus {
  const p = w.proposalId ? proposals.find((x) => x.id === w.proposalId) : undefined;
  const state = !p ? 'accepted' : p.decision === 'open' ? 'pending' : p.decision;
  return { id: w.id, proposalId: w.proposalId, entryId: w.entryId, state, serverVersion: w.serverVersion };
}

function applyCharacter(c: MockCampaign, m: Member, ch: Character) {
  Object.assign(m, {
    characterId: ch.id, characterVersion: ch.version, characterName: ch.name.trim(), characterNickname: ch.nickname ?? null,
    characterSummary: ch.summary ?? null, characterBackstory: ch.backstory ?? null, characterStatus: ch.status
  });
  const pc = entries.find((e) => e.campaignId === c.id && e.type === 'pc' && e.holderMemberId === m.id);
  if (pc) Object.assign(pc, { name: m.characterName, summary: ch.summary ?? '', updatedAt: new Date().toISOString() });
  else entries.push({ id: 'pc-' + m.id, campaignId: c.id, type: 'pc', name: ch.name.trim(), summary: ch.summary ?? '', visibility: 'public',
    status: null, holderMemberId: m.id, firstSessionNumber: null, lastSessionNumber: null, mentions: [], updatedAt: new Date().toISOString() });
}

/** Hinweise character_orphaned verschwinden, wenn keine ihrer Figuren mehr ohne Halter ist (wie der Server) */
function settleOrphanNotices(campaignId: string) {
  const c = campaigns.find((x) => x.id === campaignId);
  if (!c || !gmNotices[campaignId]) return;
  const orphan = (id: string) => {
    const e = entries.find((x) => x.id === id);
    if (!e || e.type !== 'pc') return false;
    const h = c.members.find((m) => m.id === e.holderMemberId);
    return !h || !!h.leftAt || !!h.deletedAt;
  };
  gmNotices[campaignId] = gmNotices[campaignId].filter((n) => n.code !== 'character_orphaned' || n.entryIds.some(orphan));
}

function applyCharacterProposal(p: Proposal) {
  const rec = p.submittedByMemberId && p.originEntryId ? world[p.submittedByMemberId]?.[p.originEntryId] : undefined;
  if (p.decision !== 'accepted') return;
  const c = campaigns.find((x) => x.members.some((m) => m.id === p.submittedByMemberId));
  if (!c) return;
  const target = p.targetEntryId ? entries.find((e) => e.id === p.targetEntryId) : undefined;
  if (target) Object.assign(target, { name: p.title, summary: p.detail, updatedAt: new Date().toISOString() });
  else {
    const e: Entry = { id: 'e-' + crypto.randomUUID().slice(0, 8), campaignId: c.id, type: p.entryType, name: p.title, summary: p.detail,
      visibility: p.suggestedVisibility, hiddenFromMemberIds: p.hiddenFromMemberIds ?? [], gmNotes: p.gmNotes ?? null, status: null,
      holderMemberId: null, firstSessionNumber: null, lastSessionNumber: null, mentions: [], updatedAt: new Date().toISOString() };
    entries.push(e);
    if (rec) rec.entryId = e.id;
  }
  if (rec) rec.serverVersion = rec.version;
}

function publicSession(s: MockSession): Session {
  const { phaseStartedAt: _ignored, ...rest } = s;
  return rest;
}

/** Kurzer Ton als Hörprobe, damit der Abspielknopf im Testmodus etwas tut. */
function toneWav(): ArrayBuffer {
  const rate = 8000, len = rate;
  const buf = new ArrayBuffer(44 + len);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + len, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, len, true);
  for (let i = 0; i < len; i++) v.setUint8(44 + i, 128 + Math.round(40 * Math.sin((2 * Math.PI * 330 * i) / rate)));
  return buf;
}

/** Auswertung von Bogen oder Hintergrund im Testmodus: nach der Zustimmung ein paar Sekunden, dann Vorschläge (0.4.18) */
function advanceAnalysis(a: (typeof characterAnalyses)[number], forGm: boolean): CharacterAnalysis {
  // Zeit seit der Zustimmung: nach 2 s läuft sie, nach 6 s ist sie fertig
  const t = (Date.now() - a.phaseStartedAt) / 1000;
  if (a.state === 'queued' && t > 2) a.state = 'processing';
  if (a.state === 'processing' && t > 6) {
    a.state = 'done';
    const c = campaigns.find((x) => x.id === a.campaignId)!;
    const others = c.members.filter((x) => x.id !== a.memberId && !x.leftAt && !x.deletedAt && x.role === 'player').map((x) => x.id);
    const made = analysisProposals(a).map((x) => ({
      ...x, id: 'cp-' + crypto.randomUUID().slice(0, 8), sessionId: null, documentId: null, source: 'character' as const,
      originCharacterId: null, originEntryId: null, submittedByMemberId: a.memberId, analysisId: a.id, action: 'create' as const,
      targetEntryId: null, suggestedVisibility: 'public' as const, hiddenFromMemberIds: others, confidence: 0.8, flags: [],
      evidence: [], decision: 'open' as const
    }));
    proposals.push(...made);
    a.proposalCount = made.length;
  }
  const { phaseStartedAt: _p, ...rest } = a;
  // 0.4.25: Kosten im Dialog der SL (nur mit Guthaben)
  const cost = rest.state === 'awaiting_gm' ? mockAnalysisCost(forGm) : null;
  return forGm ? { ...rest, costEstimateCents: cost } : { ...rest, proposalCount: null };
}

function analysisProposals(a: CharacterAnalysis): Pick<Proposal, 'entryType' | 'title' | 'detail' | 'gmNotes'>[] {
  // Musterkampagne (Aufnahmen für die Website): Vorschläge aus den Hintergründen von Mara und Tavin, je Sprache
  const muster = MUSTER_ANALYSIS[a.campaignId]?.[campaigns.find((c) => c.id === a.campaignId)?.members.find((m) => m.id === a.memberId)?.userId ?? ''];
  if (muster) return muster;
  if (a.memberId === 'm-jonas') return [
    { entryType: 'faction', title: 'Diebesgilde von Kaltenfurt', detail: 'Thorwald schuldet ihr 300 Silber.', gmNotes: null }
  ];
  return [
    { entryType: 'npc', title: 'Kesh', detail: 'Bruder der Figur, vor drei Jahren am Pass verschwunden.', gmNotes: null },
    { entryType: 'location', title: 'Nebelkamm', detail: 'Hirtenland, in dem die Figur aufwuchs.', gmNotes: null }
  ];
}

const MUSTER_ANALYSIS: Record<string, Record<string, Pick<Proposal, 'entryType' | 'title' | 'detail' | 'gmNotes'>[]>> = {
  'c-wasser': {
    'u-lea': [
      { entryType: 'location', title: 'Kartenkammer des Archivs', detail: 'Hier zeichnete Maras Mutter Liv Venn Karten für das Archiv von Hohenwacht.', gmNotes: null },
      { entryType: 'quest', title: 'Livs Verschwinden', detail: 'Vor sechs Jahren ging Liv Venn abends ins Archiv und kam nicht zurück. Die Stadt sagt, sie sei fortgezogen.', gmNotes: null }
    ],
    'u-tom': [
      { entryType: 'item', title: 'Abschrift aus dem Grenzregister', detail: 'Eine Seite, die Tavin im Winter zur Übung abschrieb und nicht hätte mitnehmen dürfen.', gmNotes: null }
    ]
  },
  'c-waters': {
    'u-lea': [
      { entryType: 'location', title: 'The archive map room', detail: 'Where Mara\'s mother Liv Venn drew maps for the archive of Hohenwacht.', gmNotes: null },
      { entryType: 'quest', title: 'Liv\'s disappearance', detail: 'Six years ago Liv Venn went into the archive one evening and never came back. The town says she moved away.', gmNotes: null }
    ],
    'u-tom': [
      { entryType: 'item', title: 'Copy from the border register', detail: 'A page Tavin copied as an exercise last winter and should never have taken with him.', gmNotes: null }
    ]
  }
};

/** Neue Auswertung anlegen und der SL Bescheid geben (0.4.18) */
function newAnalysis(c: MockCampaign, memberId: string, source: 'sheet' | 'backstory', title: string, documentId: string | null, pageCount: number | null) {
  const a = {
    id: 'ca-' + crypto.randomUUID().slice(0, 8), campaignId: c.id, memberId, source, documentId, title, state: 'awaiting_gm' as const,
    usesCloud: !!c.allowCloudSummary, pageCount, pagesLimited: (pageCount ?? 0) > 20, message: null, proposalCount: null,
    createdAt: new Date().toISOString(), decidedAt: null, phaseStartedAt: 0
  };
  characterAnalyses.push(a);
  (gmNotices[c.id] ??= []).push({ id: 'gn-' + a.id, code: 'character_analysis_pending', memberId, analysisId: a.id, entryIds: [], createdAt: a.createdAt });
  return a;
}

/** Simulierte Auswertung einer Unterlage: 2 s Warteschlange, 6 s Auswertung */
function advanceDoc(d: (typeof documents)[number]): CampaignDocument {
  const t = (Date.now() - d.phaseStartedAt) / 1000;
  if (d.state === 'queued' && t > 2) { d.state = 'processing'; d.phaseStartedAt = Date.now(); }
  else if (d.state === 'processing') {
    d.progress = Math.min(1, t / 6);
    if (d.failNext && t > 3) { d.state = 'failed'; d.message = 'Text konnte nicht gelesen werden (Testmodus: Dateiname enthält „fehler“).'; }
    else if (t > 6) {
      d.state = 'awaiting_review';
      d.progress = null;
      proposals.push(...proposalsForDocument(d));
      if (d.kind !== 'gm') d.worldInfoSuggestion = 'Kaltenfurt ist die Stadt der hundert Brücken am Grauen Strom. Graf Aldric regiert sie seit zwanzig Jahren, zeigt sich aber nur noch selten.';
    }
  }
  const own = proposals.filter((p) => p.documentId === d.id);
  d.proposalCount = own.length;
  d.openProposalCount = own.filter((p) => p.decision === 'open').length;
  const { phaseStartedAt: _p, failNext: _f, ...rest } = d;
  return rest;
}

/** Spoilerschutz: den geheimen Hintergrund sehen nur die Person selbst und die SL */
// ---- Umzug (0.4.8) im Testmodus: Exporte laufen ein paar Sekunden, Importe legen eine Kampagne mit offenen Plätzen an
const exportsMock: Record<string, CampaignExport & { campaignId: string; readyAt: number }> = {};
const importsMock: Record<string, { id: string; fileName: string; chunkCount: number; got: Set<number>; doneAt: number | null; campaignId: string | null; host: string }> = {};
/** Einladungen für genau einen offenen Platz: Code → [Kampagne, Platz] */
const seatCodes: Record<string, [string, string]> = {};
/** Bestätigte Stimmenzuordnung je Session (0.4.10: auch nach der Bestätigung abrufbar) */
const assignments: Record<string, Record<string, { memberId: string | null; guestName: string | null }>> = {};
/** Kapitel neu schreiben (0.4.10): Entwurf merken und nach dem Durchlauf wieder einsetzen, Entscheidungen offen */
const rewrites: Record<string, { recap: Recap | undefined; proposals: Proposal[] }> = {};

function startRewrite(s: MockSession) {
  rewrites[s.id] = { recap: recaps[s.id], proposals: proposals.filter((p) => p.sessionId === s.id) };
  delete recaps[s.id];
  for (let i = proposals.length - 1; i >= 0; i--) if (proposals[i].sessionId === s.id) proposals.splice(i, 1);
  s.state = 'summarizing';
  s.phaseStartedAt = Date.now();
}

function exportView(x: CampaignExport & { campaignId: string; readyAt: number }): CampaignExport {
  const left = x.readyAt - Date.now();
  const { campaignId: _c, readyAt: _r, ...rest } = x;
  if (left > 0) return { ...rest, state: 'processing', progress: Math.min(0.95, 1 - left / 4000) };
  return { ...rest, state: 'ready', progress: 1, sizeBytes: 48_300_000, expiresAt: new Date(x.readyAt + 7 * 864e5).toISOString(),
    downloadUrl: `/campaigns/${x.campaignId}/exports/${x.id}/file?t=testmodus` };
}

function importView(i: (typeof importsMock)[string]): ImportStatus {
  if (i.doneAt === null) return { id: i.id, state: 'uploading', progress: i.got.size / i.chunkCount, missingChunks: [...Array(i.chunkCount).keys()].filter((n) => !i.got.has(n)) };
  if (Date.now() < i.doneAt) return { id: i.id, state: 'processing', progress: 0.5 };
  if (!i.campaignId) {
    // Wie der Server: neue Kampagne, die importierende Person ist einzige SL, alle Plätze der Datei sind offen
    const id = 'c-' + crypto.randomUUID().slice(0, 8);
    const title = i.fileName.replace(/^taleward-kampagne-/, '').replace(/-\d{4}-\d{2}-\d{2}\.zip$|\.zip$/, '').replace(/-/g, ' ') || 'Übernommene Kampagne';
    campaigns.push({
      id, title: title.charAt(0).toUpperCase() + title.slice(1), description: 'Aus einer Datei übernommen.', worldInfo: '', language: 'de',
      host: i.host === 'local' ? undefined : i.host, coverPreset: 'moonwood', nextSessionAt: null, inviteCode: 'MOND-' + Math.floor(10000000 + Math.random() * 89999999),
      members: [
        { id: 'm-' + crypto.randomUUID().slice(0, 8), userId: ME.id, displayName: ME.displayName, characterName: null, role: 'gm', recordingConsentAt: null },
        { id: 'seat-sl', userId: '', displayName: '', characterName: null, role: 'gm', openSeat: true, recordingConsentAt: null },
        { id: 'seat-1', userId: '', displayName: '', characterName: 'Wendel Krähenfuß', role: 'player', openSeat: true, recordingConsentAt: null },
        { id: 'seat-2', userId: '', displayName: '', characterName: 'Maren vom Steg', role: 'player', openSeat: true, recordingConsentAt: null }
      ]
    });
    i.campaignId = id;
  }
  return { id: i.id, state: 'done', progress: 1, campaignId: i.campaignId, openSeats: campaigns.find((c) => c.id === i.campaignId)?.members.filter((m) => m.openSeat).length ?? 0 };
}

function membersFor(c: MockCampaign) {
  const gm = isGm(c.id);
  return c.members.map((m) => (gm || m.userId === ME.id ? m : { ...m, characterBackstory: undefined }));
}

function commentMarker(s: MockSession): string {
  return seen.comments[s.id] ?? seen.chronicle[s.campaignId] ?? '1970-01-01T00:00:00Z';
}

function unreadCommentsIn(s: MockSession, meId: string): number {
  const marker = commentMarker(s);
  return comments.filter((k) => k.sessionId === s.id && k.authorMemberId !== meId && visibleTo(k, meId) && k.createdAt > marker).length;
}

function unreadFor(c: MockCampaign) {
  const me = myMember(c)!;
  const gm = me.role === 'gm';
  const visibleSessions = sessions.filter((s) => s.campaignId === c.id && (gm || s.state === 'published'));
  const chron = seen.chronicle[c.id] ?? '1970-01-01T00:00:00Z';
  const bib = seen.bible[c.id] ?? '1970-01-01T00:00:00Z';
  return {
    recaps: visibleSessions.filter((s) => s.state === 'published' && (s.publishedAt ?? '') > chron).length,
    comments: visibleSessions.reduce((n, s) => n + unreadCommentsIn(s, me.id), 0),
    // Die SL ändert die Bibel selbst – für sie zählt das nicht als neu
    bible: gm ? 0 : entries.filter((e) => e.campaignId === c.id && e.visibility === 'public' && !(e.hiddenFromMemberIds ?? []).includes(me.id) && e.updatedAt > bib).length
  };
}

/** Aktuelle Abstimmung: die offene, sonst die zuletzt beendete (nicht abgebrochene). */
function pollOf(campaignId: string): DatePoll | undefined {
  const list = datePolls.filter((p) => p.campaignId === campaignId && p.status !== 'cancelled');
  return list.find((p) => p.status === 'open') ?? list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function openPoll(pollId: string) {
  const poll = datePolls.find((p) => p.id === pollId);
  const c = poll && campaigns.find((x) => x.id === poll.campaignId);
  const me = c && myMember(c);
  if (!poll || !me) return { error: err(404, 'not_found', 'Abstimmung nicht gefunden.') };
  if (poll.status !== 'open') return { error: err(409, 'date_poll_closed', 'Diese Abstimmung ist schon beendet.') };
  return { poll, me };
}

/** Kommentare gibt es für Spieler nur bei veröffentlichten Kapiteln. */
function commentContext(sessionId: string) {
  const session = sessions.find((x) => x.id === sessionId);
  const campaign = session && campaigns.find((c) => c.id === session.campaignId);
  const me = campaign && myMember(campaign);
  if (!session || !campaign || !me || (me.role !== 'gm' && session.state !== 'published')) {
    return { error: err(404, 'not_found', 'Kapitel nicht gefunden.') };
  }
  return { session, campaign, me };
}

function visibleTo(k: Comment, memberId: string): boolean {
  return k.recipientMemberId === null || k.authorMemberId === memberId || k.recipientMemberId === memberId;
}

/** Links prüfen wie der Server (ab 0.4.13): nur http(s), keine Zugangsdaten in der Adresse */
function checkLinks(raw: unknown, max: number): Link[] | string {
  if (!Array.isArray(raw) || raw.length > max) return `Höchstens ${max} Links.`;
  const out: Link[] = [];
  for (const l of raw as Partial<Link>[]) {
    if (!l?.id || !l.label?.trim() || l.label.length > 60 || !l.url || l.url.length > 2000) return 'Link unvollständig.';
    let u: URL;
    try { u = new URL(l.url); } catch { return 'Keine gültige Adresse.'; }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return 'Nur Adressen mit http:// oder https:// ohne Zugangsdaten.';
    out.push({ id: l.id, label: l.label.trim(), url: l.url, shared: !!l.shared });
  }
  return out;
}

/** Spieler bekommen nur geteilte Links */
function visibleLinks(links: Link[] | undefined, gm: boolean): Link[] {
  return (links ?? []).filter((l) => gm || l.shared);
}

/** 0.4.22 (S38): was ohne Zustimmung zu neuen Nutzungsbedingungen weiter geht – zurücknehmen, löschen, absichern */
function termsAllowed(method: string, path: string, body: Record<string, unknown>): boolean {
  const own = (id: string | undefined) => {
    const c = campaigns.find((x) => path.startsWith(`/campaigns/${x.id}/`));
    return !!id && !!c && (id === 'me' || myMember(c)?.id === id);
  };
  if (path.startsWith('/auth/') || path.startsWith('/uploads/') || path === '/me/terms') return true;
  if (method === 'DELETE' && /^\/(me|me\/voice-profile|me\/email|me\/providers\/[^/]+|campaigns\/[^/]+\/members\/me\/character|campaigns\/[^/]+\/members\/[^/]+\/portrait|comments\/[^/]+|documents\/[^/]+)$/.test(path)) return true;
  if (method === 'PUT' && path === '/me/password') return true;
  if (method === 'PUT' && /\/(recording-consent|members\/me\/move-consent)$/.test(path)) return body.granted === false;
  if (method === 'PATCH' && path === '/me/voice-profile') return body.learnFromSessions === false && Object.keys(body).length === 1;
  if (method === 'PATCH' && /^\/campaigns\/[^/]+$/.test(path)) {
    const keys = Object.keys(body);
    return keys.length > 0 && keys.every((k) => ['allowExternalTranscription', 'allowCloudSummary', 'allowCharacterAnalysis'].includes(k) && body[k] === false);
  }
  const member = /^\/campaigns\/[^/]+\/members\/([^/]+)$/.exec(path);
  if (member && own(member[1])) {
    if (method === 'DELETE') return true;
    if (method === 'PATCH') {
      const keys = Object.keys(body);
      return keys.length > 0 && keys.every((k) => ['characterBackstory', 'characterSummary'].includes(k) && !body[k]);
    }
  }
  return false;
}

export const handlers = [
  http.post(`${B}/auth/login`, async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as { username?: string; password?: string };
    if (!body.username || !body.password) return err(401, 'invalid_credentials', 'Benutzername und Passwort eingeben.');
    // Musterserver: nur anja, lea, tom, sina – das Token trägt die Person (siehe installMockFetch)
    if (hostKey(request) === DEMO_HOST) {
      const u = DEMO_USERS[body.username.trim().toLowerCase()];
      if (!u) return err(401, 'invalid_credentials', 'Auf dem Musterserver gibt es anja, lea, tom und sina.');
      return HttpResponse.json({ accessToken: `${TOKEN}:${u.id}`, expiresAt: new Date(Date.now() + 864e5 * 30).toISOString(), user: u });
    }
    return HttpResponse.json({ accessToken: TOKEN, expiresAt: new Date(Date.now() + 864e5 * 30).toISOString(), user: meUser() });
  }),

  http.get(`${B}/info`, ({ request }) => {
    const nachbar = new URL(request.url).hostname === NACHBAR_HOST;
    if (hostKey(request) === DEMO_HOST) {
      return HttpResponse.json({
        name: 'Taleward', operator: 'Euer Verein e. V.', contact: null, apiVersion: '0.4.21', registration: 'invite_only', serverId: 'musterserver',
        authMethods: ['password'], privacyPolicyUrl: null, minAge: 16, externalTranscription: null,
        minAppVersion: null, latestAppVersion: null, appDownloadUrl: null, releaseNotes: null
      });
    }
    return HttpResponse.json({
      name: nachbar ? 'Chronik des Nachbarvereins' : 'Testserver',
      operator: nachbar ? 'Spielgemeinschaft Nachbarort e. V.' : 'Rollenspielverein (Testmodus)',
      contact: nachbar ? 'vorstand@nachbarverein.test' : null,
      // Eingebauter Testserver kann alles bis zur aktuellen Schnittstelle; der Nachbarverein bleibt alt (zeigt das Ausblenden neuer Funktionen)
      apiVersion: nachbar ? '0.3.9' : '0.4.26',
      serverId: nachbar ? undefined : 'testserver',
      registration: nachbar ? 'invite_only' : registrationSetting(),
      gmApproval: nachbar ? undefined : gmRequired() ? 'required' : 'none',
      // 0.4.25: Guthaben (taleward.mock.billing)
      billing: nachbar ? undefined : billingInfo(true),
      authMethods: ['password'],
      privacyPolicyUrl: null,
      // 0.4.22: Impressum und Nutzungsbedingungen des Betreibers
      legalNoticeUrl: nachbar ? undefined : 'https://verein.test/impressum',
      termsUrl: nachbar ? undefined : 'https://verein.test/nutzungsbedingungen',
      termsVersion: nachbar ? undefined : termsVersion(),
      minAge: 16,
      audioRetention: nachbar ? { mode: 'immediate', maxDays: null } : { mode: 'until_release', maxDays: 7 },
      authProviders: nachbar ? [] : [{ id: 'google', name: 'Google' }, { id: 'discord', name: 'Discord' }, { id: 'apple', name: 'Apple' }, { id: 'microsoft', name: 'Microsoft' }],
      passwordReset: !nachbar,
      externalTranscription: nachbar ? null : 'mistral',
      externalTranscriptionMode: nachbar ? null : 'fallback',
      cloudSummary: nachbar ? null : 'mistral',
      // Ab 0.4.11: wer schreibt bzw. transkribiert, mit Land und EU
      cloudSummaryInfo: nachbar ? null : { id: 'mistral', name: 'Mistral AI', region: 'eu', country: 'FR' },
      externalTranscriptionInfo: nachbar ? null : { id: 'mistral', name: 'Mistral AI', region: 'eu', country: 'FR' },
      minAppVersion: nachbar ? null : '0.8.0',
      latestAppVersion: nachbar ? null : '0.10.1',
      appDownloadUrl: nachbar ? null : 'https://example.org/taleward-0.9.1.apk',
      releaseNotes: nachbar ? null : 'Einladen per Link und QR-Code, Aufnahmeknopf mit Verwandlung, Kapitel bearbeiten. (Testmodus)',
      appDownloadSha256: null,
      appDownloadSizeBytes: null
    });
  }),

  http.post(`${B}/auth/register`, async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as { inviteCode?: string; registrationCode?: string; username?: string; displayName?: string; password?: string; acceptPrivacy?: boolean; ageConfirmed?: boolean; registrationToken?: string; acceptTerms?: boolean; termsVersion?: number };
    if (!body.acceptPrivacy || !body.ageConfirmed) return err(400, 'consent_required', 'Bitte Datenschutzhinweise und Alter bestätigen.');
    // 0.4.22: Nutzungsbedingungen (nur der Testserver, der Nachbarverein ist älter)
    if (new URL(request.url).hostname !== NACHBAR_HOST) {
      if (!body.acceptTerms || !body.termsVersion) return err(400, 'consent_required', 'Bitte den Nutzungsbedingungen zustimmen.');
      if (body.termsVersion !== termsVersion()) return err(409, 'terms_changed', 'Die Nutzungsbedingungen haben sich gerade geändert. Bitte lies die neue Fassung.');
      Object.assign(account, { termsAcceptedVersion: body.termsVersion, termsAcceptedAt: new Date().toISOString() });
    }
    if (body.registrationToken) {
      // Zweite Form (0.4.0): nach Anmeldung mit einem Dienst, ohne Benutzername und Passwort
      if (body.registrationToken !== 'reg-mock') return err(400, 'registration_token_invalid', 'Die Anmeldung über den Dienst ist abgelaufen. Bitte noch einmal.');
      if (!body.displayName) return err(400, 'invalid_input', 'Bitte einen Namen angeben.');
      Object.assign(account, { hasPassword: false, providers: ['discord'], email: 'robin@example.org', emailPending: null });
    } else {
      if (!body.username || !body.displayName) return err(400, 'invalid_input', 'Name und Benutzername fehlen.');
      if (!/^[A-Za-z0-9._-]{3,64}$/.test(body.username)) return err(400, 'username_invalid', 'Der Benutzername braucht 3–64 Zeichen aus Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.');
      if (!body.password || body.password.length < 8) return err(400, 'weak_password', 'Das Passwort braucht mindestens 8 Zeichen.');
    }
    const host = hostKey(request);
    // 0.4.23: Registrierungsarten (der Nachbarverein kennt nur Einladungen)
    const reg = host === 'local' ? registrationSetting() : 'invite_only';
    if (reg === 'closed') return err(403, 'registration_closed', 'Auf diesem Server gibt es gerade keine neuen Konten.');
    if (body.registrationCode && reg === 'code') {
      if (body.registrationCode.trim().toUpperCase() !== MOCK_REGISTRATION_CODE) return err(400, 'registration_code_invalid', 'Dieser Registrierungscode stimmt nicht.');
    } else if (body.inviteCode || reg === 'invite_only') {
      if (!campaigns.some((c) => (c.host ?? 'local') === host && c.inviteCode.toUpperCase() === (body.inviteCode ?? '').trim().toUpperCase())) {
        return err(404, 'invite_invalid', 'Dieser Einladungscode ist ungültig oder abgelaufen.');
      }
    } else if (reg === 'code') {
      return err(400, 'registration_code_required', 'Bitte den Code eingeben.');
    }
    // Neues Konto: ohne SL-Freigabe (nur zählt, wenn der Server sie verlangt)
    if (host === 'local') Object.assign(account, { gmPermission: 'none', gmDecidedAt: null });
    // Testmodus: alle „Server“ teilen denselben Benutzer
    return HttpResponse.json({ accessToken: TOKEN, expiresAt: new Date(Date.now() + 864e5 * 30).toISOString(), user: meUser() }, { status: 201 });
  }),

  http.post(`${B}/auth/password-reset`, async () => {
    await delay(300);
    return new HttpResponse(null, { status: 202 }); // immer 202 – verrät nicht, ob es das Konto gibt
  }),

  // Testmodus: Tickets heißen mock-<dienst>-<zweck>. Google = bekanntes Konto, Discord = neues Konto,
  // Apple/Microsoft = E-Mail gehört schon einem anderen Konto.
  http.post(`${B}/auth/oidc/exchange`, async ({ request }) => {
    await delay(300);
    const { ticket, verifier } = (await request.json()) as { ticket?: string; verifier?: string };
    const m = (ticket ?? '').match(/^mock-(google|discord|apple|microsoft)-(login|link)$/);
    if (!m || !verifier || verifier.length < 43) return err(400, 'ticket_invalid', 'Die Anmeldung ist abgelaufen. Bitte noch einmal.');
    const [, provider, purpose] = m;
    if (purpose === 'link') {
      if (!account.providers.includes(provider)) account.providers.push(provider);
      return HttpResponse.json({ status: 'ok', accessToken: null, expiresAt: null, user: meUser(), provider });
    }
    if (provider === 'google') {
      if (!account.providers.includes('google')) account.providers.push('google');
      return HttpResponse.json({ status: 'ok', accessToken: TOKEN, expiresAt: new Date(Date.now() + 864e5 * 30).toISOString(), user: meUser(), provider });
    }
    if (provider === 'discord') {
      return HttpResponse.json({ status: 'register', registrationToken: 'reg-mock', suggestedDisplayName: 'Robin', email: 'robin@example.org', provider });
    }
    return HttpResponse.json({ status: 'email_in_use', provider });
  }),

  // Vorschau einer Einladung ohne Anmeldung (0.4.10)
  http.get(`${B}/invites/:code`, ({ params, request }) => {
    const code = String(params.code).trim().toUpperCase();
    const seat = seatCodes[code];
    if (seat) {
      const c = campaigns.find((x) => x.id === seat[0]);
      const m = c?.members.find((x) => x.id === seat[1] && x.openSeat);
      if (c && m) return HttpResponse.json({ campaignTitle: c.title, seatCharacterName: m.characterName ?? null, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() });
    }
    const host = hostKey(request);
    const c = campaigns.find((x) => (x.host ?? 'local') === host && x.inviteCode.toUpperCase() === code);
    if (!c) return err(404, 'invite_invalid', 'Dieser Einladungscode ist ungültig oder abgelaufen. Frag deine Spielleitung nach einem neuen.');
    return HttpResponse.json({ campaignTitle: c.title, seatCharacterName: null, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() });
  }),

  // Ab hier alles nur mit Token
  http.all(`${B}/*`, ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth) return err(401, 'not_authenticated', 'Bitte melde dich an.');
    if (!authed(request)) return err(401, 'token_invalid', 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
  }),

  // 0.4.22: Ohne Zustimmung zur aktuellen Fassung nur lesen (Ausnahmen wie in der Schnittstelle)
  http.all(`${B}/*`, async ({ request }) => {
    if (request.method === 'GET' || new URL(request.url).hostname === NACHBAR_HOST || !termsOutdated()) return undefined;
    const path = new URL(request.url).pathname.replace(/^.*\/api\/v1/, '');
    if (termsAllowed(request.method, path, (await request.clone().json().catch(() => ({}))) as Record<string, unknown>)) return undefined;
    return err(403, 'terms_required', 'Die Nutzungsbedingungen haben sich geändert. Bis du zustimmst, kannst du nur lesen.');
  }),

  http.get(`${B}/me`, () => {
    // Testmodus: der Bestätigungslink gilt nach ein paar Sekunden als angeklickt, eine offene Anfrage wird entschieden
    if (account.emailPending && Date.now() - emailPendingSince > 5000) Object.assign(account, { email: account.emailPending, emailPending: null });
    const decision = mockSetting('gmDecision');
    if (account.gmPermission === 'pending' && (decision === 'granted' || decision === 'rejected')) {
      Object.assign(account, { gmPermission: decision, gmDecidedAt: new Date().toISOString() });
    }
    return HttpResponse.json(meUser());
  }),

  // 0.4.23: SL-Freigabe anfragen
  http.post(`${B}/me/gm-request`, async () => {
    await delay(300);
    if (!gmRequired() || account.gmPermission === 'granted') return HttpResponse.json(meUser());
    if (account.gmPermission === 'rejected') return err(409, 'gm_request_closed', 'Deine Anfrage wurde abgelehnt. Eine neue geht erst, wenn die Verwaltung sie wieder erlaubt.');
    if (!account.email) return err(409, 'email_unverified', 'Bitte zuerst eine E-Mail-Adresse eintragen und bestätigen.');
    account.gmPermission = 'pending';
    return HttpResponse.json(meUser(), { status: 202 });
  }),

  http.put(`${B}/me/terms`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { accept?: boolean; version?: number };
    if (body.accept !== true || !body.version) return err(400, 'invalid_input', 'Bitte zustimmen.');
    if (body.version !== termsVersion()) return err(409, 'terms_changed', 'Die Nutzungsbedingungen haben sich gerade geändert. Bitte lies die neue Fassung.');
    Object.assign(account, { termsAcceptedVersion: body.version, termsAcceptedAt: new Date().toISOString() });
    return HttpResponse.json(meUser());
  }),

  http.put(`${B}/me/email`, async ({ request }) => {
    const { email } = (await request.json()) as { email?: string };
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(400, 'invalid_email', 'Das ist keine gültige E-Mail-Adresse.');
    account.emailPending = email.trim();
    emailPendingSince = Date.now();
    return new HttpResponse(null, { status: 202 });
  }),

  http.delete(`${B}/me/email`, () => {
    account.email = null;
    account.emailPending = null;
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${B}/me/password`, async ({ request }) => {
    const { currentPassword, newPassword } = (await request.json()) as { currentPassword?: string; newPassword?: string };
    if (account.hasPassword && !currentPassword) return err(401, 'wrong_password', 'Das bisherige Passwort stimmt nicht.');
    if (!newPassword || newPassword.length < 8) return err(400, 'weak_password', 'Das Passwort braucht mindestens 8 Zeichen.');
    account.hasPassword = true;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${B}/me/providers/:provider/link`, () => HttpResponse.json({ linkToken: 'link-mock' })),

  http.delete(`${B}/me/providers/:provider`, ({ params }) => {
    const p = params.provider as string;
    if (!account.providers.includes(p)) return err(404, 'not_found', 'Dieser Dienst ist nicht verbunden.');
    if (!account.hasPassword && account.providers.length === 1) {
      return err(409, 'last_login_method', 'Das ist deine einzige Anmeldung. Leg vorher ein Passwort fest oder verbinde einen anderen Dienst.');
    }
    account.providers = account.providers.filter((x) => x !== p);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/me/export`, ({ request }) => {
    const host = hostKey(request);
    const mine = campaigns.filter((c) => (c.host ?? 'local') === host && myMember(c));
    const data = {
      exportedAt: new Date().toISOString(),
      user: ME,
      campaigns: mine.map((c) => ({ id: c.id, title: c.title, member: myMember(c) })),
      comments: comments.filter((k) => mine.some((c) => c.members.some((m) => m.id === k.authorMemberId && m.userId === ME.id))),
      voiceProfile: voiceStatus()
    };
    return new HttpResponse(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json' } });
  }),

  http.delete(`${B}/me`, async ({ request }) => {
    const { password } = (await request.json()) as { password?: string };
    if (!password) return err(400, 'invalid_input', 'Bitte das Passwort eingeben.');
    const host = hostKey(request);
    const soleGm = campaigns.filter((c) => (c.host ?? 'local') === host && myMember(c)?.role === 'gm' && c.members.filter((m) => m.role === 'gm').length === 1);
    if (soleGm.length) return err(409, 'last_gm_campaigns', `Du leitest noch allein: ${soleGm.map((c) => c.title).join(', ')}. Übergib diese Kampagnen vorher an eine andere SL.`);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/organizations`, ({ request }) => {
    const nachbar = hostKey(request) === NACHBAR_HOST;
    return HttpResponse.json([{ id: nachbar ? 'org-nachbar' : 'org-verein', name: nachbar ? 'Spielgemeinschaft Nachbarort e. V.' : 'Rollenspielverein', myRole: 'member' }]);
  }),

  http.get(`${B}/me/voice-profile`, () => HttpResponse.json(voiceStatus())),

  http.post(`${B}/me/voice-profile`, async ({ request }) => {
    const form = await request.formData();
    const audio = form.get('audio');
    if (form.get('consent') !== 'true') return err(400, 'consent_missing', 'Ohne Einwilligung wird kein Stimmprofil gespeichert.');
    if (!(audio instanceof Blob) || audio.size < 1000) return err(400, 'too_short', 'Die Aufnahme ist zu kurz. Lies den Text bitte vollständig vor.');
    voice.status = 'processing';
    voice.createdAt = new Date().toISOString();
    voice.sampleSeconds = 25;
    voice.learnFromSessions = form.get('learnFromSessions') !== 'false';
    voice.learnedSessionCount = 0;
    voice.readyAt = Date.now() + 3000;
    return HttpResponse.json(voiceStatus(), { status: 202 });
  }),

  http.patch(`${B}/me/voice-profile`, async ({ request }) => {
    if (voice.status === 'none') return err(404, 'not_found', 'Es gibt noch kein Stimmprofil.');
    voice.learnFromSessions = ((await request.json()) as { learnFromSessions: boolean }).learnFromSessions;
    return HttpResponse.json(voiceStatus());
  }),

  http.delete(`${B}/me/voice-profile`, () => {
    Object.assign(voice, { status: 'none', createdAt: null, sampleSeconds: null, learnFromSessions: true, learnedSessionCount: 0, readyAt: 0 });
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/campaigns`, async ({ request }) => {
    await delay(200);
    const host = hostKey(request);
    return HttpResponse.json(campaigns.filter((c) => (c.host ?? 'local') === host && myMember(c)).map(summary));
  }),

  http.get(`${B}/campaigns/:id/usage`, ({ params, request }) => {
    const m = new URL(request.url).searchParams.get('month');
    if (m !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return err(400, 'validation_error', 'Der Monat muss im Format JJJJ-MM angegeben werden.');
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !myMember(c)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!isGm(c.id)) return err(403, 'forbidden', 'Den Verbrauch sieht nur die Spielleitung.');
    const month = new Date().toISOString().slice(0, 7);
    const cs = sessions.filter((s) => s.campaignId === c.id && s.playedAt.startsWith(month.slice(0, 4)));
    return HttpResponse.json({
      month, sessions: cs.length, audioSeconds: cs.reduce((n, s) => n + (s.durationSeconds ?? 0), 0),
      documents: documents.filter((d) => d.campaignId === c.id).length, costEstimateCents: 42 * cs.length, billedTo: 'gm'
    });
  }),

  http.post(`${B}/campaigns`, async ({ request }) => {
    if (hostKey(request) === 'local' && gmRequired() && account.gmPermission !== 'granted') {
      return err(403, 'gm_permission_required', 'Eigene Kampagnen legst du hier erst nach der SL-Freigabe an.');
    }
    const body = (await request.json()) as { title: string; description?: string; language?: 'de' | 'en'; system?: MockCampaign['system']; systemName?: string | null; settings?: Record<string, boolean> };
    const c: MockCampaign = {
      id: 'c-' + crypto.randomUUID().slice(0, 8),
      title: body.title,
      description: body.description ?? '',
      worldInfo: '',
      language: body.language ?? 'de',
      system: body.system ?? null,
      systemName: body.systemName ?? null,
      host: hostKey(request) === 'local' ? undefined : hostKey(request),
      // Neue Kampagnen bekommen ein zufälliges Motiv
      coverPreset: COVER_IDS[Math.floor(Math.random() * COVER_IDS.length)],
      nextSessionAt: null,
      inviteCode: 'NEU-' + Math.floor(1000 + Math.random() * 9000),
      members: [{ id: 'm-' + crypto.randomUUID().slice(0, 8), userId: ME.id, displayName: ME.displayName, characterName: null, role: 'gm' }],
      // 0.4.25: Einstellungen gleich beim Anlegen
      allowCloudSummary: body.settings?.allowCloudSummary === true,
      allowExternalTranscription: body.settings?.allowExternalTranscription === true,
      allowCharacterAnalysis: body.settings?.allowCharacterAnalysis === true
    };
    campaigns.push(c);
    return HttpResponse.json({ ...summary(c), links: visibleLinks(c.links, isGm(c.id)), description: c.description, worldInfo: c.worldInfo, language: c.language, system: c.system ?? null, systemName: c.systemName ?? null, allowExternalTranscription: !!c.allowExternalTranscription, allowCloudSummary: !!c.allowCloudSummary, allowCharacterAnalysis: !!c.allowCharacterAnalysis, characterSheetLimits: { maxSheets: 3, maxPages: 20 }, ...campaignExtras(c, myMember(c)), members: membersFor(c) }, { status: 201 });
  }),

  http.post(`${B}/campaigns/join`, async ({ request }) => {
    const body = (await request.json()) as { code: string; characterName?: string; character?: Character | null };
    const host = hostKey(request);
    const seat = seatCodes[body.code.trim().toUpperCase()];
    if (seat) {
      // Einladung für genau einen Platz (0.4.8): wer damit beitritt, sitzt auf diesem Platz
      const c = campaigns.find((x) => x.id === seat[0]);
      const m = c?.members.find((x) => x.id === seat[1] && x.openSeat);
      if (!c || !m) return err(404, 'invite_invalid', 'Dieser Einladungscode ist ungültig oder abgelaufen. Frag deine Spielleitung nach einem neuen.');
      delete seatCodes[body.code.trim().toUpperCase()];
      Object.assign(m, { userId: ME.id, displayName: ME.displayName, openSeat: false, role: 'player' });
      if (body.character) applyCharacter(c, m, body.character);
      (gmNotices[c.id] ??= []).push({ id: 'gn-' + crypto.randomUUID().slice(0, 8), code: 'seat_claimed', memberId: m.id, entryIds: [], createdAt: new Date().toISOString() });
      return HttpResponse.json({ ...summary(c), links: visibleLinks(c.links, isGm(c.id)), description: c.description, worldInfo: c.worldInfo, language: c.language, system: c.system ?? null, systemName: c.systemName ?? null, allowExternalTranscription: false, allowCloudSummary: false, allowCharacterAnalysis: false, members: membersFor(c) });
    }
    const c = campaigns.find((x) => (x.host ?? 'local') === host && x.inviteCode.toUpperCase() === body.code.trim().toUpperCase());
    if (!c) return err(404, 'invite_invalid', 'Dieser Einladungscode ist ungültig oder abgelaufen. Frag deine Spielleitung nach einem neuen.');
    if (!myMember(c)) {
      const ch = body.character;
      if (ch && c.members.some((m) => m.characterId === ch.id && !m.leftAt && !m.deletedAt)) {
        return err(409, 'character_in_campaign', 'Dieser Charakter spielt in dieser Kampagne schon mit.');
      }
      const m: Member = { id: 'm-' + crypto.randomUUID().slice(0, 8), userId: ME.id, displayName: ME.displayName, characterName: body.characterName?.trim() || null, role: 'player', recordingConsentAt: null };
      c.members.push(m);
      if (ch) applyCharacter(c, m, ch);
      // Neuzugang in alle nicht-leeren „verborgen vor“-Listen; die SL bekommt einen Hinweis
      const partly = entries.filter((e) => e.campaignId === c.id && (e.hiddenFromMemberIds ?? []).length > 0);
      partly.forEach((e) => e.hiddenFromMemberIds!.push(m.id));
      if (partly.length) (gmNotices[c.id] ??= []).push({ id: 'gn-' + crypto.randomUUID().slice(0, 8), code: 'hidden_entries_for_newcomer', memberId: m.id, entryIds: partly.map((e) => e.id), createdAt: new Date().toISOString() });
      // Ab 0.4.14: Hinweis an die SL bei jedem Beitritt
      (gmNotices[c.id] ??= []).push({ id: 'gn-' + crypto.randomUUID().slice(0, 8), code: 'member_joined', memberId: m.id, entryIds: [], createdAt: new Date().toISOString() });
      seen.chronicle[c.id] = seen.bible[c.id] = new Date().toISOString();
    }
    return HttpResponse.json({ ...summary(c), links: visibleLinks(c.links, isGm(c.id)), description: c.description, worldInfo: c.worldInfo, language: c.language, system: c.system ?? null, systemName: c.systemName ?? null, allowExternalTranscription: !!c.allowExternalTranscription, allowCloudSummary: !!c.allowCloudSummary, allowCharacterAnalysis: !!c.allowCharacterAnalysis, characterSheetLimits: { maxSheets: 3, maxPages: 20 }, ...campaignExtras(c, myMember(c)), members: membersFor(c) });
  }),

  http.get(`${B}/campaigns/:id`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !myMember(c)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    return HttpResponse.json({ ...summary(c), links: visibleLinks(c.links, isGm(c.id)), description: c.description, worldInfo: c.worldInfo, language: c.language, system: c.system ?? null, systemName: c.systemName ?? null, allowExternalTranscription: !!c.allowExternalTranscription, allowCloudSummary: !!c.allowCloudSummary, allowCharacterAnalysis: !!c.allowCharacterAnalysis, characterSheetLimits: { maxSheets: 3, maxPages: 20 }, ...campaignExtras(c, myMember(c)), ...(isGm(c.id) ? { hotwords: c.hotwords ?? [], gmNotices: gmNotices[c.id] ?? [] } : {}), members: membersFor(c) });
  }),

  // ---------------- Charaktere (0.4.7)

  http.put(`${B}/campaigns/:id/members/me/character`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const ch = (await request.json()) as Character;
    if (!ch?.id || !ch.name?.trim() || !(ch.version >= 1)) return err(400, 'invalid_input', 'Charakter unvollständig.');
    if (m.characterId && m.characterId !== ch.id) return err(409, 'character_mismatch', 'Du spielst hier einen anderen Charakter. Löse ihn zuerst.');
    if (m.characterId && (m.characterVersion ?? 0) >= ch.version) {
      return HttpResponse.json({ code: 'character_version_stale', message: 'Der Server kennt schon einen neueren Stand dieses Charakters.', details: { serverVersion: m.characterVersion } }, { status: 409 });
    }
    applyCharacter(c, m, ch);
    return HttpResponse.json(m);
  }),

  http.delete(`${B}/campaigns/:id/members/me/character`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!m.characterId) return err(409, 'no_character', 'Du hast in dieser Kampagne keinen Charakter aus deiner Sammlung.');
    const pc = entries.find((e) => e.campaignId === c.id && e.type === 'pc' && e.holderMemberId === m.id);
    if (pc) pc.holderMemberId = null;
    Object.assign(m, { characterId: null, characterVersion: null });
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/campaigns/:id/members/me/world`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    return HttpResponse.json({ entries: Object.values(world[m.id] ?? {}).map(worldStatus) });
  }),

  http.post(`${B}/campaigns/:id/members/me/world`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!m.characterId) return err(409, 'no_character', 'Mitgebrachte Welt geht nur mit einem Charakter aus deiner Sammlung.');
    const body = (await request.json()) as { entries?: WorldEntryIn[] };
    const list = body.entries ?? [];
    if (list.length === 0) return err(400, 'invalid_input', 'Keine Einträge.');
    if (list.length > 100) return err(400, 'world_too_many', 'Höchstens 100 Einträge auf einmal.');
    if (list.some((w) => (w.relation ?? '').length > 120)) return err(400, 'invalid_input', 'Die Beziehung ist zu lang (höchstens 120 Zeichen).');
    const mine = (world[m.id] ??= {});
    const others = c.members.filter((x) => x.id !== m.id && !x.leftAt && !x.deletedAt && x.role === 'player').map((x) => x.id);
    const out: WorldEntryStatus[] = [];
    for (const w of list) {
      const known = mine[w.id];
      if (known && known.version >= w.version) { out.push({ ...worldStatus(known), state: 'unchanged' }); continue; }
      if (known?.proposalId) {
        const old = proposals.find((p) => p.id === known.proposalId && p.decision === 'open');
        if (old) old.decision = 'rejected';
      }
      const p: Proposal = {
        id: 'cp-' + crypto.randomUUID().slice(0, 8), sessionId: null, documentId: null, source: 'character',
        originCharacterId: m.characterId, originEntryId: w.id, submittedByMemberId: m.id,
        entryType: w.type, action: known?.entryId ? 'update' : 'create', targetEntryId: known?.entryId ?? null,
        title: w.name, detail: w.summary, relation: w.relation?.trim() || null, gmNotes: null, suggestedVisibility: 'public',
        hiddenFromMemberIds: w.secret ? others : [], confidence: 1, flags: [], evidence: [], decision: 'open'
      };
      proposals.push(p);
      mine[w.id] = { id: w.id, version: w.version, proposalId: p.id, entryId: known?.entryId ?? null, serverVersion: known?.serverVersion ?? null };
      out.push(worldStatus(mine[w.id]));
    }
    return HttpResponse.json({ entries: out });
  }),

  http.get(`${B}/campaigns/:id/members/me/chronicle`, ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c?.members.find((x) => x.userId === ME.id);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const pc = entries.find((e) => e.campaignId === c.id && e.type === 'pc' && e.holderMemberId === m.id);
    const name = m.characterName ?? '';
    const out: Chronicle = {
      server: { name: 'Testserver', url: new URL(request.url).origin, version: '0.4.7' },
      campaign: { id: c.id, title: c.title, system: c.systemName ?? c.system ?? null, language: c.language, createdAt: '2026-07-01T18:00:00Z', archivedAt: c.archivedAt ?? null },
      member: { id: m.id, role: m.role, joinedAt: '2026-07-01T18:00:00Z', leftAt: m.leftAt ?? null, characterId: m.characterId ?? null, characterVersion: m.characterVersion ?? null },
      sessions: sessions.filter((s) => s.campaignId === c.id).sort((a, b) => a.number - b.number).map((s) => {
        const r = recaps[s.id];
        const attended = s.attendees.length === 0 || s.attendees.some((a) => a.memberId === m.id);
        return { id: s.id, number: s.number, title: s.title, playedAt: s.playedAt, attended,
          recap: s.state === 'published' && attended && r ? { title: r.title, text: r.text, openThreads: r.openThreads, publishedAt: r.publishedAt ?? s.playedAt } : null };
      }),
      mentions: name ? entries.filter((e) => e.campaignId === c.id && e.visibility === 'public' && e.type !== 'pc' && !(e.hiddenFromMemberIds ?? []).includes(m.id) && (e.summary.includes(name) || (pc && e.holderMemberId === m.id)))
        .map((e) => ({ entryId: e.id, entryType: e.type, name: e.name, summary: e.summary, updatedAt: e.updatedAt })) : [],
      broughtEntries: Object.values(world[m.id] ?? {}).filter((w) => w.entryId).map((w) => {
        const e = entries.find((x) => x.id === w.entryId)!;
        return { originEntryId: w.id, entryId: e.id, entryType: e.type, name: e.name, summary: e.summary, hidden: e.visibility === 'gm_only', updatedAt: e.updatedAt };
      }),
      comments: comments.filter((k) => k.authorMemberId === m.id).map((k) => ({ sessionId: k.sessionId, text: k.text, createdAt: k.createdAt })),
      takenAt: new Date().toISOString()
    };
    return HttpResponse.json(out);
  }),

  // ---- Auswertung von Charakterbögen und Hintergründen (0.4.18)
  http.get(`${B}/campaigns/:id/character-analyses`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const gm = m.role === 'gm';
    const list = characterAnalyses.filter((a) => a.campaignId === c.id && (gm || a.memberId === m.id));
    return HttpResponse.json(list.map((a) => advanceAnalysis(a, gm)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }),

  http.post(`${B}/campaigns/:id/members/me/backstory-analysis`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!c.allowCharacterAnalysis) return err(409, 'analysis_off', 'In dieser Kampagne werden Hintergründe nicht ausgewertet.');
    if (!m.characterBackstory?.trim()) return err(409, 'backstory_empty', 'Der Hintergrund ist noch leer.');
    if (characterAnalyses.some((a) => a.memberId === m.id && a.source === 'backstory' && ['awaiting_gm', 'queued', 'processing'].includes(a.state))) {
      return err(409, 'analysis_pending', 'Dein Hintergrund liegt schon bei der Spielleitung.');
    }
    return HttpResponse.json(advanceAnalysis(newAnalysis(c, m.id, 'backstory', m.characterName ?? m.displayName, null, null), m.role === 'gm'), { status: 201 });
  }),

  http.post(`${B}/character-analyses/:aid/decision`, async ({ params, request }) => {
    const a = characterAnalyses.find((x) => x.id === params.aid);
    if (!a || !isGm(a.campaignId)) return err(404, 'not_found', 'Nicht gefunden.');
    if (a.state !== 'awaiting_gm') return err(409, 'wrong_state', 'Darüber ist schon entschieden.');
    const body = (await request.json()) as { approve?: boolean };
    a.state = body.approve ? 'queued' : 'rejected';
    a.decidedAt = new Date().toISOString();
    a.phaseStartedAt = Date.now();
    gmNotices[a.campaignId] = (gmNotices[a.campaignId] ?? []).filter((n) => n.analysisId !== a.id);
    return HttpResponse.json(advanceAnalysis(a, true));
  }),

  http.get(`${B}/campaigns/:id/character-proposals`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !isGm(c.id)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    for (const a of characterAnalyses) if (a.campaignId === c.id) advanceAnalysis(a, true);
    const mine = proposals.filter((p) => p.source === 'character' && c.members.some((m) => m.id === p.submittedByMemberId));
    return HttpResponse.json([...mine.filter((p) => p.decision === 'open'), ...mine.filter((p) => p.decision !== 'open').slice(-50)]);
  }),

  http.delete(`${B}/campaigns/:id/gm-notices/:nid`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !isGm(c.id)) return err(404, 'not_found', 'Hinweis nicht gefunden.');
    gmNotices[c.id] = (gmNotices[c.id] ?? []).filter((n) => n.id !== params.nid);
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch(`${B}/campaigns/:id`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !myMember(c)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!isGm(c.id)) return err(403, 'forbidden', 'Nur die Spielleitung kann die Kampagne bearbeiten.');
    const settingsBefore = snapshot(c);
    const body = (await request.json()) as { title?: string; description?: string; worldInfo?: string; language?: 'de' | 'en'; coverPreset?: string | null; system?: MockCampaign['system']; systemName?: string | null };
    const SYSTEMS = ['dsa', 'dnd', 'pathfinder', 'cthulhu', 'shadowrun', 'splittermond', 'other'];
    if (body.system !== undefined && body.system !== null && !SYSTEMS.includes(body.system)) return err(400, 'invalid_input', 'Unbekanntes Spielsystem.');
    if (body.systemName && body.systemName.length > 100) return err(400, 'invalid_input', 'Der Name des Systems ist zu lang (höchstens 100 Zeichen).');
    if (body.title !== undefined) {
      if (!body.title.trim()) return err(400, 'invalid_input', 'Der Titel darf nicht leer sein.');
      c.title = body.title.trim();
    }
    if (body.description !== undefined) c.description = body.description;
    if (body.worldInfo !== undefined) c.worldInfo = body.worldInfo;
    if (body.language === 'de' || body.language === 'en') c.language = body.language;
    if (body.system !== undefined) c.system = body.system; // null leert das Feld
    if (typeof (body as { allowCloudSummary?: boolean }).allowCloudSummary === 'boolean') {
      c.allowCloudSummary = (body as { allowCloudSummary: boolean }).allowCloudSummary;
    }
    if (typeof (body as { allowCharacterAnalysis?: boolean }).allowCharacterAnalysis === 'boolean') {
      c.allowCharacterAnalysis = (body as { allowCharacterAnalysis: boolean }).allowCharacterAnalysis;
      // Ausschalten lehnt offene Anfragen ab (0.4.18)
      if (!c.allowCharacterAnalysis) {
        for (const a of characterAnalyses) if (a.campaignId === c.id && a.state === 'awaiting_gm') { a.state = 'rejected'; a.decidedAt = new Date().toISOString(); }
        gmNotices[c.id] = (gmNotices[c.id] ?? []).filter((n) => n.code !== 'character_analysis_pending');
      }
    }
    if (typeof (body as { allowExternalTranscription?: boolean }).allowExternalTranscription === 'boolean') {
      c.allowExternalTranscription = (body as { allowExternalTranscription: boolean }).allowExternalTranscription;
    }
    if (body.systemName !== undefined) c.systemName = body.systemName || null;
    const hotwords = (body as { hotwords?: unknown }).hotwords;
    if (hotwords !== undefined) {
      if (!Array.isArray(hotwords) || hotwords.length > 200 || hotwords.some((w) => typeof w !== 'string' || w.length > 40)) {
        return err(400, 'invalid_input', 'Namenshilfe: höchstens 200 Einträge mit je höchstens 40 Zeichen.');
      }
      c.hotwords = [...new Set((hotwords as string[]).map((w) => w.trim()).filter(Boolean))];
    }
    const links = (body as { links?: unknown }).links;
    if (links !== undefined) {
      const ok = checkLinks(links, 20);
      if (typeof ok === 'string') return err(400, 'invalid_input', ok);
      c.links = ok;
    }
    const archived = (body as { archived?: boolean }).archived;
    if (typeof archived === 'boolean') c.archivedAt = archived ? new Date().toISOString() : null;
    if (body.coverPreset !== undefined) {
      c.coverPreset = body.coverPreset;
      delete coverImages[c.id]; // Motiv gewählt: eigenes Bild entfällt
    }
    recordChange(c, settingsBefore, myMember(c)?.id ?? null);
    return HttpResponse.json({ ...summary(c), links: visibleLinks(c.links, isGm(c.id)), description: c.description, worldInfo: c.worldInfo, language: c.language, system: c.system ?? null, systemName: c.systemName ?? null, allowExternalTranscription: !!c.allowExternalTranscription, allowCloudSummary: !!c.allowCloudSummary, allowCharacterAnalysis: !!c.allowCharacterAnalysis, characterSheetLimits: { maxSheets: 3, maxPages: 20 }, ...campaignExtras(c, myMember(c)), hotwords: c.hotwords ?? [], members: membersFor(c) });
  }),

  http.patch(`${B}/campaigns/:id/members/:mid`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c?.members.find((x) => x.id === params.mid);
    if (!c || !myMember(c) || !m) return err(404, 'not_found', 'Mitglied nicht gefunden.');
    const body = (await request.json()) as { characterName?: string; characterSummary?: string; characterBackstory?: string; role?: 'gm' | 'player' };
    if ((body.characterSummary !== undefined || body.characterBackstory !== undefined) && m.userId !== ME.id) {
      return err(403, 'forbidden', 'Beschreibung und Hintergrund pflegt jede Person selbst.');
    }
    if (m.userId !== ME.id && !isGm(c.id)) return err(403, 'forbidden', 'Nur die Spielleitung kann andere Mitglieder ändern.');
    if (body.role && !isGm(c.id)) return err(403, 'forbidden', 'Nur die Spielleitung kann Rollen ändern.');
    if (body.role === 'player' && m.role === 'gm' && c.members.filter((x) => x.role === 'gm' && !x.leftAt && !x.deletedAt).length === 1) {
      return err(409, 'last_gm', 'Die Kampagne braucht mindestens eine Spielleitung.');
    }
    if (body.characterName !== undefined) m.characterName = body.characterName || null;
    if (body.characterSummary !== undefined) m.characterSummary = body.characterSummary || null;
    if (body.characterBackstory !== undefined) m.characterBackstory = body.characterBackstory || null;
    if (body.role) m.role = body.role;
    return HttpResponse.json(m);
  }),

  // ---------------- Umzug (0.4.8)

  http.put(`${B}/campaigns/:id/members/me/move-consent`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const { granted } = (await request.json()) as { granted: boolean };
    m.moveConsentAt = granted ? new Date().toISOString() : null;
    return HttpResponse.json(m);
  }),

  http.post(`${B}/campaigns/:id/exports`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !isGm(c.id)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const x = { id: 'x-' + crypto.randomUUID().slice(0, 8), campaignId: c.id, readyAt: Date.now() + 4000, state: 'queued' as const, consentedMemberIds: c.members.filter((m) => m.moveConsentAt).map((m) => m.id), createdAt: new Date().toISOString() };
    exportsMock[x.id] = x;
    return HttpResponse.json(exportView(x), { status: 202 });
  }),

  http.get(`${B}/campaigns/:id/exports/:xid`, ({ params }) => {
    const x = exportsMock[params.xid as string];
    if (!x || x.campaignId !== params.id || !isGm(x.campaignId)) return err(404, 'not_found', 'Export nicht gefunden.');
    return HttpResponse.json(exportView(x));
  }),

  http.post(`${B}/imports`, async ({ request }) => {
    if (hostKey(request) === 'local' && gmRequired() && account.gmPermission !== 'granted') {
      return err(403, 'gm_permission_required', 'Eigene Kampagnen legst du hier erst nach der SL-Freigabe an.');
    }
    const { fileName, sizeBytes } = (await request.json()) as { fileName: string; sizeBytes: number };
    if (!fileName?.toLowerCase().endsWith('.zip')) return err(400, 'invalid_input', 'Bitte eine Datei taleward-kampagne-….zip wählen.');
    if (sizeBytes > 1024 ** 3) return HttpResponse.json({ code: 'import_too_large', message: 'Die Datei ist zu groß.', details: { maxBytes: 1024 ** 3 } }, { status: 413 });
    const id = 'i-' + crypto.randomUUID().slice(0, 8);
    const chunkCount = Math.max(1, Math.ceil(sizeBytes / CHUNK));
    importsMock[id] = { id, fileName, chunkCount, got: new Set(), doneAt: null, campaignId: null, host: hostKey(request) };
    return HttpResponse.json({ importId: id, chunkSizeBytes: CHUNK, chunkCount }, { status: 201 });
  }),

  http.put(`${B}/imports/:iid/chunks/:n`, async ({ params }) => {
    const i = importsMock[params.iid as string];
    if (!i) return err(404, 'not_found', 'Import nicht gefunden.');
    await delay(150);
    i.got.add(Number(params.n));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/imports/:iid`, ({ params }) => {
    const i = importsMock[params.iid as string];
    return i ? HttpResponse.json(importView(i)) : err(404, 'not_found', 'Import nicht gefunden.');
  }),

  http.post(`${B}/imports/:iid/complete`, ({ params }) => {
    const i = importsMock[params.iid as string];
    if (!i) return err(404, 'not_found', 'Import nicht gefunden.');
    const missing = [...Array(i.chunkCount).keys()].filter((n) => !i.got.has(n));
    if (missing.length) return HttpResponse.json({ code: 'upload_incomplete', message: 'Es fehlen noch Teile.', details: { missingChunks: missing } }, { status: 409 });
    i.doneAt ??= Date.now() + 2500;
    return HttpResponse.json(importView(i), { status: 202 });
  }),

  http.post(`${B}/campaigns/:id/members/:mid/invite`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !isGm(c.id)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const m = c.members.find((x) => x.id === params.mid);
    if (!m?.openSeat) return err(409, 'seat_not_open', 'Dieser Platz ist schon besetzt.');
    const code = 'PLATZ-' + Math.floor(10000000 + Math.random() * 89999999);
    seatCodes[code] = [c.id, m.id];
    return HttpResponse.json({ code, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), memberId: m.id }, { status: 201 });
  }),

  http.post(`${B}/campaigns/:id/members/:mid/take`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const me = c && myMember(c);
    if (!c || !me) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (me.role !== 'gm') return err(403, 'not_importer', 'Das kann nur die Person, die die Kampagne übernommen hat.');
    const seat = c.members.find((x) => x.id === params.mid);
    if (!seat?.openSeat) return err(409, 'seat_not_open', 'Dieser Platz ist schon besetzt.');
    Object.assign(seat, { userId: ME.id, displayName: ME.displayName, openSeat: false, role: 'gm', recordingConsentAt: me.recordingConsentAt ?? null });
    c.members = c.members.filter((x) => x !== me);
    return HttpResponse.json({ ...summary(c), links: visibleLinks(c.links, isGm(c.id)), description: c.description, worldInfo: c.worldInfo, language: c.language, system: c.system ?? null, systemName: c.systemName ?? null, allowExternalTranscription: false, allowCloudSummary: false, allowCharacterAnalysis: false, gmNotices: gmNotices[c.id] ?? [], members: membersFor(c) });
  }),

  http.post(`${B}/campaigns/:id/members/:mid/release`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !isGm(c.id)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const m = c.members.find((x) => x.id === params.mid && !x.leftAt && !x.deletedAt);
    if (!m) return err(404, 'not_found', 'Mitglied nicht gefunden.');
    if (m.role === 'gm' && c.members.filter((x) => x.role === 'gm' && !x.leftAt && !x.deletedAt && !x.openSeat).length === 1) {
      return err(409, 'last_gm', 'Die Kampagne braucht mindestens eine Spielleitung.');
    }
    Object.assign(m, { userId: '', displayName: '', openSeat: true, recordingConsentAt: null });
    gmNotices[c.id] = (gmNotices[c.id] ?? []).filter((n) => !(n.code === 'seat_claimed' && n.memberId === m.id));
    return HttpResponse.json(m);
  }),

  // ---------------- Verwalten (0.4.5): Kampagne löschen, Mitglied entfernen/verlassen, Kapitel verwerfen

  http.delete(`${B}/campaigns/:id`, async ({ params, request }) => {
    const i = campaigns.findIndex((x) => x.id === params.id);
    if (i < 0 || !myMember(campaigns[i])) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!isGm(campaigns[i].id)) return err(403, 'forbidden', 'Nur die Spielleitung kann die Kampagne löschen.');
    const { confirmTitle } = (await request.json().catch(() => ({}))) as { confirmTitle?: string };
    if ((confirmTitle ?? '').trim() !== campaigns[i].title) return err(400, 'confirmation_mismatch', 'Der eingegebene Titel stimmt nicht.');
    campaigns.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete(`${B}/campaigns/:id/members/:mid`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c?.members.find((x) => x.id === params.mid && !x.leftAt);
    if (!c || !myMember(c) || !m) return err(404, 'not_found', 'Mitglied nicht gefunden.');
    const self = m.userId === ME.id;
    if (!self && !isGm(c.id)) return err(403, 'forbidden', 'Nur die Spielleitung kann andere entfernen.');
    if (m.role === 'gm' && c.members.filter((x) => x.role === 'gm' && !x.leftAt && !x.deletedAt).length === 1) {
      return err(409, 'last_gm', 'Die Kampagne braucht mindestens eine Spielleitung. Ernenne erst eine zweite oder lösche die Kampagne.');
    }
    m.leftAt = new Date().toISOString();
    // Ab 0.4.14: „ist beigetreten“ erledigt sich mit dem Austritt
    gmNotices[c.id] = (gmNotices[c.id] ?? []).filter((n) => !(n.code === 'member_joined' && n.memberId === m.id));
    // Ab 0.4.9: Hinweis an die SL, was mit der Figur passieren soll
    const pcs = entries.filter((e) => e.campaignId === c.id && e.type === 'pc' && e.holderMemberId === m.id);
    if (pcs.length && m.role === 'player') {
      (gmNotices[c.id] ??= []).push({ id: 'gn-' + crypto.randomUUID().slice(0, 8), code: 'character_orphaned', memberId: m.id, entryIds: pcs.map((e) => e.id), createdAt: new Date().toISOString() });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete(`${B}/sessions/:sid`, ({ params }) => {
    const i = sessions.findIndex((x) => x.id === params.sid);
    if (i < 0) return err(404, 'not_found', 'Kapitel nicht gefunden.');
    if (!isGm(sessions[i].campaignId)) return err(403, 'forbidden', 'Nur die Spielleitung kann Kapitel verwerfen.');
    if (sessions[i].state === 'published') return err(409, 'session_published', 'Veröffentlichte Kapitel lassen sich nicht verwerfen.');
    sessions.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---------------- Terminabstimmung (0.3.2)

  http.get(`${B}/campaigns/:id/date-poll`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !myMember(c)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const poll = pollOf(c.id);
    if (!poll) return err(404, 'no_date_poll', 'Es gibt noch keine Terminabstimmung.');
    return HttpResponse.json(poll);
  }),

  http.post(`${B}/campaigns/:id/date-poll`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !myMember(c)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!isGm(c.id)) return err(403, 'forbidden', 'Eine Terminabstimmung startet die Spielleitung.');
    if (datePolls.some((p) => p.campaignId === c.id && p.status === 'open')) return err(409, 'date_poll_open', 'Es läuft bereits eine Terminabstimmung.');
    const body = (await request.json()) as { note?: string };
    const poll: DatePoll = { id: 'poll-' + crypto.randomUUID().slice(0, 8), campaignId: c.id, status: 'open', note: body.note?.trim() || null, createdAt: new Date().toISOString(), chosenOptionId: null, options: [] };
    datePolls.push(poll);
    return HttpResponse.json(poll, { status: 201 });
  }),

  http.post(`${B}/date-polls/:pid/options`, async ({ params, request }) => {
    const found = openPoll(params.pid as string);
    if ('error' in found) return found.error;
    const { poll, me } = found;
    const { startsAt } = (await request.json()) as { startsAt: string };
    if (!startsAt || isNaN(Date.parse(startsAt))) return err(400, 'invalid_input', 'Bitte ein gültiges Datum mit Uhrzeit angeben.');
    if (Date.parse(startsAt) < Date.now()) return err(400, 'date_in_past', 'Der Termin liegt in der Vergangenheit.');
    if (poll.options.some((o) => o.startsAt === new Date(startsAt).toISOString())) return err(409, 'option_exists', 'Diesen Termin gibt es schon.');
    // Wer vorschlägt, kann auch – Stimme "passt" gleich mit
    poll.options.push({ id: 'o-' + crypto.randomUUID().slice(0, 6), startsAt: new Date(startsAt).toISOString(), proposedByMemberId: me.id, votes: [{ memberId: me.id, answer: 'yes' }] });
    poll.options.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return HttpResponse.json(poll, { status: 201 });
  }),

  http.delete(`${B}/date-polls/:pid/options/:oid`, ({ params }) => {
    const found = openPoll(params.pid as string);
    if ('error' in found) return found.error;
    const { poll, me } = found;
    const o = poll.options.find((x) => x.id === params.oid);
    if (!o) return err(404, 'not_found', 'Termin nicht gefunden.');
    if (o.proposedByMemberId !== me.id && !isGm(poll.campaignId)) return err(403, 'forbidden', 'Nur wer den Termin vorgeschlagen hat oder die Spielleitung kann ihn entfernen.');
    poll.options = poll.options.filter((x) => x !== o);
    return HttpResponse.json(poll);
  }),

  http.put(`${B}/date-polls/:pid/options/:oid/vote`, async ({ params, request }) => {
    const found = openPoll(params.pid as string);
    if ('error' in found) return found.error;
    const { poll, me } = found;
    const o = poll.options.find((x) => x.id === params.oid);
    if (!o) return err(404, 'not_found', 'Termin nicht gefunden.');
    const { answer } = (await request.json()) as { answer: VoteAnswer };
    if (!['yes', 'maybe', 'no'].includes(answer)) return err(400, 'invalid_input', 'Ungültige Antwort.');
    o.votes = o.votes.filter((v) => v.memberId !== me.id).concat({ memberId: me.id, answer });
    return HttpResponse.json(poll);
  }),

  http.post(`${B}/date-polls/:pid/close`, async ({ params, request }) => {
    const found = openPoll(params.pid as string);
    if ('error' in found) return found.error;
    const { poll } = found;
    if (!isGm(poll.campaignId)) return err(403, 'forbidden', 'Den Termin legt die Spielleitung fest.');
    const { optionId } = (await request.json()) as { optionId: string };
    const o = poll.options.find((x) => x.id === optionId);
    if (!o) return err(404, 'not_found', 'Termin nicht gefunden.');
    poll.status = 'closed';
    poll.chosenOptionId = o.id;
    campaigns.find((c) => c.id === poll.campaignId)!.nextSessionAt = o.startsAt;
    return HttpResponse.json(poll);
  }),

  http.delete(`${B}/date-polls/:pid`, ({ params }) => {
    const found = openPoll(params.pid as string);
    if ('error' in found) return found.error;
    if (!isGm(found.poll.campaignId)) return err(403, 'forbidden', 'Nur die Spielleitung kann die Abstimmung abbrechen.');
    found.poll.status = 'cancelled';
    return new HttpResponse(null, { status: 204 });
  }),

  // ---------------- SL-Unterlagen (0.3.2)

  http.get(`${B}/campaigns/:id/documents`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    // Spieler (ab 0.4.7): nur die eigenen Charakterbögen
    const mine = (d: (typeof documents)[number]) => isGm(c.id) || (d.kind === 'character_sheet' && d.uploadedByMemberId === m.id);
    const withWait = (d: CampaignDocument): CampaignDocument => {
      const wait = d.state === 'queued' || d.state === 'processing' ? mockCreditWait(isGm(c.id), 'document', d.id) : null;
      return wait ? { ...d, state: 'queued', progress: null, message: null, creditWait: wait } : d;
    };
    return HttpResponse.json(documents.filter((d) => d.campaignId === params.id && mine(d)).map(advanceDoc).map(withWait).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }),

  http.post(`${B}/campaigns/:id/documents`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c && myMember(c);
    if (!c || !m) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const form = await request.formData();
    const file = form.get('file');
    const kind = form.get('kind') as 'handout' | 'gm' | 'mixed' | 'character_sheet';
    if (kind !== 'character_sheet' && !isGm(c.id)) return err(403, 'forbidden', 'Unterlagen lädt nur die Spielleitung hoch.');
    if (!(file instanceof File)) return err(400, 'invalid_input', 'Datei fehlt.');
    if (!['handout', 'gm', 'mixed', 'character_sheet'].includes(kind)) return err(400, 'invalid_input', 'Unbekannte Art der Unterlage.');
    if (kind === 'character_sheet' && documents.filter((d) => d.campaignId === c.id && d.kind === 'character_sheet' && d.uploadedByMemberId === m.id).length >= 3) {
      return err(409, 'sheet_limit', 'Du hast schon drei Charakterbögen hochgeladen. Lösch erst einen.');
    }
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) return err(400, 'unsupported_document', 'Bitte PDF, Word (.docx) oder Text hochladen.');
    if (file.size > 50 * 1024 * 1024) return err(413, 'document_too_large', 'Die Datei ist zu groß (höchstens 50 MB).');
    const sheet = kind === 'character_sheet';
    const d: (typeof documents)[number] = {
      id: 'doc-' + crypto.randomUUID().slice(0, 8), campaignId: params.id as string, title: String(form.get('title') || file.name),
      // Bögen wertet nur die Auswertung aus – nach Zustimmung der SL (0.4.18)
      fileName: file.name, kind, sizeBytes: file.size, pageCount: /\.pdf$/i.test(file.name) ? 12 : null, state: sheet ? 'done' : 'queued',
      progress: sheet ? null : 0, message: null, proposalCount: 0, openProposalCount: 0, worldInfoSuggestion: null,
      createdAt: new Date().toISOString(), phaseStartedAt: Date.now(), failNext: file.name.toLowerCase().includes('fehler'),
      uploadedByMemberId: m.id, analysisId: null
    };
    if (sheet && c.allowCharacterAnalysis) d.analysisId = newAnalysis(c, m.id, 'sheet', d.title, d.id, d.pageCount).id;
    documents.push(d);
    return HttpResponse.json(advanceDoc(d), { status: 201 });
  }),

  http.get(`${B}/documents/:did`, ({ params }) => {
    const d = documents.find((x) => x.id === params.did);
    if (!d || !isGm(d.campaignId)) return err(404, 'not_found', 'Unterlage nicht gefunden.');
    return HttpResponse.json(advanceDoc(d));
  }),

  // Ab 0.4.12: Unterlagen am Tisch nachlesen (nur SL)
  http.get(`${B}/documents/:did/text`, ({ params }) => {
    const d = documents.find((x) => x.id === params.did);
    if (!d || !isGm(d.campaignId)) return err(404, 'not_found', 'Unterlage nicht gefunden.');
    const text = documentTexts[d.id] ?? '';
    return HttpResponse.json({ pages: text ? text.split('\f').map((t, i) => ({ page: i + 1, text: t.trim() })) : [] });
  }),

  http.get(`${B}/documents/:did/file`, ({ params }) => {
    const d = documents.find((x) => x.id === params.did);
    if (!d || !isGm(d.campaignId)) return err(404, 'not_found', 'Unterlage nicht gefunden.');
    const text = documentTexts[d.id] ?? '';
    // Testmodus: PDF-Unterlagen als echte PDF aus dem erkannten Text, alles andere als Text
    if (/\.pdf$/i.test(d.fileName)) {
      return new HttpResponse(textToPdf(text.split('\f'), d.title), {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.fileName.replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'no-store' }
      });
    }
    return new HttpResponse(text.replace(/\f/g, '\n\n'), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }),

  // Ab 0.4.12: Kapitelpläne (nur SL; für alle anderen 404, auch keine Anzahl)
  http.get(`${B}/campaigns/:id/plans`, ({ params }) => {
    if (!isGm(params.id as string)) return err(404, 'not_found', 'Nicht gefunden.');
    const order = (n: number | null) => n ?? Number.MAX_SAFE_INTEGER;
    return HttpResponse.json(plans.filter((p) => p.campaignId === params.id)
      .sort((a, b) => order(a.sessionNumber) - order(b.sessionNumber) || a.createdAt.localeCompare(b.createdAt)));
  }),

  http.post(`${B}/campaigns/:id/plans`, async ({ params, request }) => {
    if (!isGm(params.id as string)) return err(404, 'not_found', 'Nicht gefunden.');
    const body = (await request.json()) as ChapterPlanInput;
    if (!body.title?.trim()) return err(400, 'invalid_input', 'Titel fehlt.');
    const now = new Date().toISOString();
    const plan: ChapterPlan = {
      id: 'plan-' + crypto.randomUUID().slice(0, 8), campaignId: params.id as string, title: body.title.trim(),
      sessionNumber: body.sessionNumber ?? null, state: body.state ?? 'draft', notes: body.notes ?? null,
      scenes: body.scenes ?? [], names: body.names ?? [], documentIds: body.documentIds ?? [], createdAt: now, updatedAt: now
    };
    plans.push(plan);
    return HttpResponse.json(plan, { status: 201 });
  }),

  http.get(`${B}/plans/:pid`, ({ params }) => {
    const plan = plans.find((p) => p.id === params.pid);
    if (!plan || !isGm(plan.campaignId)) return err(404, 'not_found', 'Nicht gefunden.');
    return HttpResponse.json(plan);
  }),

  http.patch(`${B}/plans/:pid`, async ({ params, request }) => {
    const plan = plans.find((p) => p.id === params.pid);
    if (!plan || !isGm(plan.campaignId)) return err(404, 'not_found', 'Nicht gefunden.');
    const body = (await request.json()) as ChapterPlanInput & { ifUpdatedAt?: string | null };
    if (body.ifUpdatedAt && body.ifUpdatedAt !== plan.updatedAt) return err(409, 'conflict', 'Der Plan wurde inzwischen auf einem anderen Gerät geändert.');
    if (body.title !== undefined && !body.title.trim()) return err(400, 'invalid_input', 'Titel fehlt.');
    const known = new Set(entries.filter((x) => x.campaignId === plan.campaignId).map((x) => x.id));
    if (body.scenes?.some((sc) => (sc.entryIds ?? []).some((id) => !known.has(id)))) return err(400, 'invalid_input', 'Unbekannter Eintrag.');
    for (const sc of body.scenes ?? []) {
      if (sc.links === undefined) continue;
      const ok = checkLinks(sc.links, 3);
      if (typeof ok === 'string') return err(400, 'invalid_input', ok);
      sc.links = ok;
    }
    if (typeof body.tableNotes === 'string' && body.tableNotes.length > 20000) return err(400, 'invalid_input', 'Notizen zu lang.');
    const { ifUpdatedAt: _, ...change } = body;
    Object.assign(plan, change, { updatedAt: new Date().toISOString() });
    return HttpResponse.json(plan);
  }),

  http.delete(`${B}/plans/:pid`, ({ params }) => {
    const i = plans.findIndex((p) => p.id === params.pid);
    if (i < 0 || !isGm(plans[i].campaignId)) return err(404, 'not_found', 'Nicht gefunden.');
    plans.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/documents/:did/proposals`, ({ params }) => {
    const d = documents.find((x) => x.id === params.did);
    if (!d || !isGm(d.campaignId)) return err(404, 'not_found', 'Unterlage nicht gefunden.');
    return HttpResponse.json(proposals.filter((p) => p.documentId === d.id));
  }),

  http.post(`${B}/documents/:did/apply`, async ({ params, request }) => {
    const d = documents.find((x) => x.id === params.did);
    if (!d || !isGm(d.campaignId)) return err(404, 'not_found', 'Unterlage nicht gefunden.');
    if (advanceDoc(d).state !== 'awaiting_review') return err(409, 'not_ready', 'Die Unterlage ist nicht zur Prüfung bereit.');
    const { applyWorldInfo } = (await request.json()) as { applyWorldInfo?: boolean };
    for (const p of proposals.filter((x) => x.documentId === d.id)) {
      if (p.decision === 'open') p.decision = 'rejected';
      if (p.decision !== 'accepted') continue;
      const target = p.targetEntryId ? entries.find((e) => e.id === p.targetEntryId) : undefined;
      if (target) {
        target.summary = p.detail;
        if (p.gmNotes) target.gmNotes = [target.gmNotes, p.gmNotes].filter(Boolean).join(' ');
        target.updatedAt = new Date().toISOString();
      } else {
        entries.push({
          id: 'e-' + crypto.randomUUID().slice(0, 8), campaignId: d.campaignId, type: p.entryType, name: p.title, summary: p.detail,
          gmNotes: p.gmNotes ?? null, visibility: p.suggestedVisibility, hiddenFromMemberIds: p.hiddenFromMemberIds ?? [], status: p.entryType === 'quest' ? 'active' : null, holderMemberId: null,
          firstSessionNumber: null, lastSessionNumber: null, mentions: [], updatedAt: new Date().toISOString()
        });
      }
    }
    if (applyWorldInfo && d.worldInfoSuggestion) {
      const c = campaigns.find((x) => x.id === d.campaignId)!;
      c.worldInfo = [c.worldInfo, d.worldInfoSuggestion].filter(Boolean).join('\n\n');
    }
    d.state = 'done';
    return HttpResponse.json(advanceDoc(d));
  }),

  http.post(`${B}/documents/:did/retry`, ({ params }) => {
    const d = documents.find((x) => x.id === params.did);
    if (!d || !isGm(d.campaignId)) return err(404, 'not_found', 'Unterlage nicht gefunden.');
    if (d.state !== 'failed') return err(409, 'not_failed', 'Die Auswertung ist nicht fehlgeschlagen.');
    Object.assign(d, { state: 'queued', message: null, phaseStartedAt: Date.now(), failNext: false });
    return HttpResponse.json(advanceDoc(d));
  }),

  http.delete(`${B}/documents/:did`, ({ params }) => {
    const i = documents.findIndex((x) => x.id === params.did);
    const doc = documents[i];
    const owner = doc && doc.kind === 'character_sheet' && doc.uploadedByMemberId === myMember(campaigns.find((c) => c.id === doc.campaignId)!)?.id;
    if (i < 0 || !(isGm(doc.campaignId) || owner)) return err(404, 'not_found', 'Unterlage nicht gefunden.');
    // Eine noch nicht entschiedene Auswertung des Bogens entfällt (0.4.18)
    for (const a of characterAnalyses) if (a.documentId === doc.id && a.state === 'awaiting_gm') { a.state = 'rejected'; a.decidedAt = new Date().toISOString(); }
    gmNotices[doc.campaignId] = (gmNotices[doc.campaignId] ?? []).filter((n) => !characterAnalyses.some((a) => a.id === n.analysisId && a.documentId === doc.id));
    documents.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---------------- Kommentare (0.3.2)

  http.get(`${B}/sessions/:id/comments`, ({ params }) => {
    const ctx = commentContext(params.id as string);
    if ('error' in ctx) return ctx.error;
    return HttpResponse.json(comments.filter((k) => k.sessionId === ctx.session.id && visibleTo(k, ctx.me.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }),

  http.post(`${B}/sessions/:id/comments`, async ({ params, request }) => {
    const ctx = commentContext(params.id as string);
    if ('error' in ctx) return ctx.error;
    const body = (await request.json()) as { text: string; recipientMemberId?: string | null };
    const text = body.text?.trim();
    if (!text) return err(400, 'invalid_input', 'Der Kommentar ist leer.');
    if (text.length > 4000) return err(413, 'comment_too_long', 'Der Kommentar ist zu lang (höchstens 4000 Zeichen).');
    const recipient = body.recipientMemberId ?? null;
    if (recipient) {
      const r = ctx.campaign.members.find((m) => m.id === recipient);
      if (!r || r.id === ctx.me.id) return err(400, 'invalid_recipient', 'Ungültiger Empfänger.');
      // Spieler schreiben privat nur an die SL, die SL an alle
      if (ctx.me.role !== 'gm' && r.role !== 'gm') return err(403, 'forbidden', 'Private Nachrichten gehen nur an die Spielleitung.');
    }
    const k: Comment = { id: 'k-' + crypto.randomUUID().slice(0, 8), sessionId: ctx.session.id, authorMemberId: ctx.me.id, recipientMemberId: recipient, text, createdAt: new Date().toISOString(), editedAt: null };
    comments.push(k);
    return HttpResponse.json(k, { status: 201 });
  }),

  http.patch(`${B}/comments/:cid`, async ({ params, request }) => {
    const k = comments.find((x) => x.id === params.cid);
    const ctx = k ? commentContext(k.sessionId) : null;
    if (!k || !ctx || 'error' in ctx || !visibleTo(k, ctx.me.id)) return err(404, 'not_found', 'Kommentar nicht gefunden.');
    if (k.authorMemberId !== ctx.me.id) return err(403, 'forbidden', 'Nur eigene Kommentare lassen sich bearbeiten.');
    const text = ((await request.json()) as { text: string }).text?.trim();
    if (!text) return err(400, 'invalid_input', 'Der Kommentar ist leer.');
    k.text = text;
    k.editedAt = new Date().toISOString();
    return HttpResponse.json(k);
  }),

  http.delete(`${B}/comments/:cid`, ({ params }) => {
    const idx = comments.findIndex((x) => x.id === params.cid);
    const k = comments[idx];
    const ctx = k ? commentContext(k.sessionId) : null;
    if (!k || !ctx || 'error' in ctx || !visibleTo(k, ctx.me.id)) return err(404, 'not_found', 'Kommentar nicht gefunden.');
    if (k.authorMemberId !== ctx.me.id && ctx.me.role !== 'gm') return err(403, 'forbidden', 'Nur eigene Kommentare lassen sich löschen.');
    comments.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/campaigns/:id/cover-image`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const img = coverImages[params.id as string];
    if (!c || !myMember(c) || !img) return err(404, 'not_found', 'Kein Titelbild vorhanden.');
    return new HttpResponse(img.data, { headers: { 'Content-Type': img.type } });
  }),

  http.put(`${B}/campaigns/:id/cover-image`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !myMember(c)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!isGm(c.id)) return err(403, 'forbidden', 'Nur die Spielleitung kann das Titelbild ändern.');
    const type = request.headers.get('Content-Type') ?? '';
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return err(400, 'unsupported_image', 'Bitte ein JPEG-, PNG- oder WebP-Bild hochladen.');
    const data = await request.arrayBuffer();
    if (data.byteLength > 5 * 1024 * 1024) return err(413, 'image_too_large', 'Das Bild ist zu groß (höchstens 5 MB).');
    coverImages[c.id] = { data, type, updatedAt: new Date().toISOString() };
    c.coverPreset = null;
    return HttpResponse.json({ ...summary(c), links: visibleLinks(c.links, isGm(c.id)), description: c.description, worldInfo: c.worldInfo, language: c.language, system: c.system ?? null, systemName: c.systemName ?? null, allowExternalTranscription: !!c.allowExternalTranscription, allowCloudSummary: !!c.allowCloudSummary, allowCharacterAnalysis: !!c.allowCharacterAnalysis, characterSheetLimits: { maxSheets: 3, maxPages: 20 }, ...campaignExtras(c, myMember(c)), members: membersFor(c) });
  }),

  http.delete(`${B}/campaigns/:id/cover-image`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !myMember(c)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    if (!isGm(c.id)) return err(403, 'forbidden', 'Nur die Spielleitung kann das Titelbild ändern.');
    delete coverImages[c.id];
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${B}/campaigns/:id/seen`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !myMember(c)) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const { area } = (await request.json()) as { area: 'chronicle' | 'bible' };
    if (area !== 'chronicle' && area !== 'bible') return err(400, 'invalid_input', 'Unbekannter Bereich.');
    seen[area][c.id] = new Date().toISOString();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${B}/sessions/:id/seen`, ({ params }) => {
    const ctx = commentContext(params.id as string);
    if ('error' in ctx) return ctx.error;
    seen.comments[ctx.session.id] = new Date().toISOString();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/campaigns/:id/members/:mid/portrait`, ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const img = portraits[params.mid as string];
    if (!c || !myMember(c) || !img || !c.members.some((m) => m.id === params.mid)) return err(404, 'not_found', 'Kein Bild vorhanden.');
    // size=thumb: 256-px-Quadrat aus dem gewählten Ausschnitt (sonst das Original)
    const thumb = new URL(request.url).searchParams.get('size') === 'thumb' && img.thumb;
    return new HttpResponse(thumb || img.data, { headers: { 'Content-Type': thumb ? 'image/jpeg' : img.type } });
  }),

  http.put(`${B}/campaigns/:id/members/:mid/portrait`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c?.members.find((x) => x.id === params.mid);
    if (!c || !myMember(c) || !m) return err(404, 'not_found', 'Mitglied nicht gefunden.');
    if (m.userId !== ME.id) return err(403, 'forbidden', 'Du kannst nur dein eigenes Bild hochladen.');
    const type = request.headers.get('Content-Type') ?? '';
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return err(400, 'unsupported_image', 'Bitte ein JPEG-, PNG- oder WebP-Bild hochladen.');
    const data = await request.arrayBuffer();
    if (data.byteLength > 3 * 1024 * 1024) return err(413, 'image_too_large', 'Das Bild ist zu groß (höchstens 3 MB).');
    portraits[m.id] = { data, type, updatedAt: new Date().toISOString() };
    // Wie der Server: aus dem gewählten Ausschnitt ein quadratisches Vorschaubild schneiden
    const q = new URL(request.url).searchParams;
    const cx = Number(q.get('cropX')), cy = Number(q.get('cropY')), cs = Number(q.get('cropSize'));
    if (q.has('cropSize') && cs > 0 && typeof OffscreenCanvas !== 'undefined') {
      try {
        const bmp = await createImageBitmap(new Blob([data], { type }));
        const canvas = new OffscreenCanvas(256, 256);
        canvas.getContext('2d')!.drawImage(bmp, cx, cy, cs, cs, 0, 0, 256, 256);
        const thumb = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
        portraits[m.id].thumb = await thumb.arrayBuffer();
      } catch {
        /* Testmodus: dann eben ohne Ausschnitt */
      }
    }
    m.portraitUpdatedAt = portraits[m.id].updatedAt;
    return HttpResponse.json(m);
  }),

  http.delete(`${B}/campaigns/:id/members/:mid/portrait`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const m = c?.members.find((x) => x.id === params.mid);
    if (!c || !myMember(c) || !m) return err(404, 'not_found', 'Mitglied nicht gefunden.');
    // Eigenes Bild oder, als Moderation, die SL
    if (m.userId !== ME.id && !isGm(c.id)) return err(403, 'forbidden', 'Nur das eigene Bild lässt sich entfernen.');
    delete portraits[m.id];
    m.portraitUpdatedAt = null;
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${B}/campaigns/:id/recording-consent`, async ({ params, request }) => {
    const c = campaigns.find((x) => x.id === params.id);
    const me = c && myMember(c);
    if (!c || !me) return err(404, 'not_found', 'Kampagne nicht gefunden.');
    const { granted } = (await request.json()) as { granted: boolean };
    if (typeof granted !== 'boolean') return err(400, 'invalid_input', 'granted fehlt.');
    me.recordingConsentAt = granted ? new Date().toISOString() : null;
    return HttpResponse.json(me);
  }),

  http.post(`${B}/campaigns/:id/invites`, ({ params }) => {
    const c = campaigns.find((x) => x.id === params.id);
    if (!c || !isGm(c.id)) return err(403, 'forbidden', 'Nur die Spielleitung kann einladen.');
    return HttpResponse.json({ code: c.inviteCode, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() }, { status: 201 });
  }),

  http.get(`${B}/campaigns/:id/sessions`, ({ params }) => {
    const gm = isGm(params.id as string);
    const list = sessions
      .filter((s) => s.campaignId === params.id && (gm || s.state === 'published'))
      .sort((a, b) => b.number - a.number)
      .map((s) => ({ id: s.id, number: s.number, title: s.title, playedAt: s.playedAt, state: advance(s).state, unreadComments: unreadCommentsIn(s, myMember(campaigns.find((c) => c.id === s.campaignId)!)!.id) }));
    return HttpResponse.json(list);
  }),

  http.post(`${B}/campaigns/:id/sessions`, async ({ params, request }) => {
    if (!isGm(params.id as string)) return err(403, 'forbidden', 'Nur die Spielleitung kann Sessions anlegen.');
    const body = (await request.json()) as { playedAt: string; attendees: Session['attendees']; title?: string };
    const c = campaigns.find((x) => x.id === params.id)!;
    if (c.archivedAt) return err(409, 'campaign_archived', 'Die Kampagne ist abgeschlossen. Nimm sie erst wieder auf.');
    for (const a of body.attendees) {
      if (!!a.memberId === !!a.guestName) return err(400, 'invalid_attendee', 'Jede anwesende Person braucht entweder memberId oder guestName.');
      if (a.guestName && a.consentSource !== 'on_site') return err(400, 'invalid_attendee', 'Gäste können nur vor Ort zustimmen.');
      if (a.memberId) {
        const m = c.members.find((x) => x.id === a.memberId);
        if (!m) return err(400, 'invalid_attendee', 'Unbekanntes Mitglied bei den Anwesenden.');
        if (a.consentSource === 'app' && !m.recordingConsentAt) {
          return err(409, 'consent_missing', `${m.displayName} hat in der App (noch) nicht zugestimmt.`);
        }
      }
    }
    const n = Math.max(0, ...sessions.filter((s) => s.campaignId === params.id).map((s) => s.number)) + 1;
    const s: MockSession = {
      id: 's-' + crypto.randomUUID().slice(0, 8), campaignId: params.id as string, number: n,
      title: body.title ?? null, playedAt: body.playedAt, state: 'created', source: null,
      attendees: body.attendees.map((a) => ({ ...a, consentAt: a.consent ? a.consentAt ?? new Date().toISOString() : null })),
      durationSeconds: null, audioDeletedAt: null, publishedAt: null, phaseStartedAt: null
    };
    sessions.push(s);
    return HttpResponse.json(publicSession(s), { status: 201 });
  }),

  http.get(`${B}/sessions/:id`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || (!isGm(s.campaignId) && s.state !== 'published')) return err(404, 'not_found', 'Session nicht gefunden.');
    advance(s);
    return HttpResponse.json(publicSession(s));
  }),

  http.get(`${B}/sessions/:id/status`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s) return err(404, 'not_found', 'Session nicht gefunden.');
    const st = advance(s);
    // 0.4.25: Wartegrund des Guthabens (Testmodus: taleward.mock.creditWait)
    const wait = st.state === 'queued' || st.state === 'transcribing' || st.state === 'summarizing' ? mockCreditWait(isGm(s.campaignId), 'session', s.id) : null;
    return HttpResponse.json(wait ? { ...st, state: 'queued', progress: null, message: null, creditWait: wait } : st);
  }),

  http.post(`${B}/sessions/:id/uploads`, async ({ params, request }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s) return err(404, 'not_found', 'Session nicht gefunden.');
    if (s.attendees.some((a) => !a.consent)) return err(409, 'consent_missing', 'Es haben noch nicht alle Anwesenden eingewilligt.');
    const camp = campaigns.find((x) => x.id === s.campaignId)!;
    const revoked = s.attendees.filter((a) => a.consentSource === 'app' && !camp.members.find((m) => m.id === a.memberId)?.recordingConsentAt);
    if (revoked.length) return err(409, 'consent_revoked', 'Eine anwesende Person hat ihre Zustimmung inzwischen widerrufen. Die Aufnahme darf nicht verarbeitet werden.');
    const body = (await request.json()) as { source: 'table' | 'discord'; files: { fileName: string; sizeBytes: number }[] };
    // Gleiche Dateien für dieselbe Session: bestehenden Upload fortsetzen
    const signature = body.source + '|' + body.files.map((f) => `${f.fileName}:${f.sizeBytes}`).join('|');
    const existing = Object.values(uploads).find((u) => u.sessionId === s.id && u.signature === signature && !u.completed);
    if (existing) {
      return HttpResponse.json({
        uploadId: existing.id, chunkSizeBytes: CHUNK,
        files: existing.files.map((f, i) => ({ fileId: f.fileId, fileName: body.files[i].fileName, chunkCount: f.chunkCount }))
      }, { status: 201 });
    }
    if (Object.values(uploads).some((u) => u.sessionId === s.id && !u.completed)) {
      return err(409, 'upload_in_progress', 'Für diese Session läuft bereits ein anderer Upload.');
    }
    const names = body.files.map((f) => f.fileName.toLowerCase()).join(' ');
    s.failNext = names.includes('fehler');
    s.audioGone = names.includes('weg');
    // Testmodus: „unlesbar“ im Dateinamen → der Server lehnt beim Abschließen ab (wie mit eingeschaltetem Guthaben)
    s.unreadable = names.includes('unlesbar') || names.includes('unreadable');
    const id = 'up-' + crypto.randomUUID().slice(0, 8);
    const files = body.files.map((f, i) => ({ fileId: `f${i}`, fileName: f.fileName, chunkCount: Math.max(1, Math.ceil(f.sizeBytes / CHUNK)) }));
    uploads[id] = { id, sessionId: s.id, signature, completed: false, files: files.map((f) => ({ fileId: f.fileId, chunkCount: f.chunkCount, received: new Set() })) };
    s.state = 'uploading';
    s.source = body.source;
    return HttpResponse.json({ uploadId: id, chunkSizeBytes: CHUNK, files }, { status: 201 });
  }),

  http.put(`${B}/uploads/:uid/files/:fid/chunks/:idx`, async ({ params, request }) => {
    await delay(150);
    const f = uploads[params.uid as string]?.files.find((x) => x.fileId === params.fid);
    if (!f) return err(404, 'not_found', 'Upload nicht gefunden.');
    const expected = request.headers.get('X-Chunk-SHA256');
    if (expected) {
      const digest = await crypto.subtle.digest('SHA-256', await request.arrayBuffer());
      const actual = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      if (actual !== expected.toLowerCase()) {
        return err(400, 'chunk_checksum_mismatch', 'Ein Teil der Aufnahme ist beschädigt angekommen und wird erneut gesendet.');
      }
    }
    f.received.add(Number(params.idx));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/uploads/:uid`, ({ params }) => {
    const u = uploads[params.uid as string];
    if (!u) return err(404, 'not_found', 'Upload nicht gefunden.');
    return HttpResponse.json({
      files: u.files.map((f) => ({
        fileId: f.fileId,
        missingChunks: Array.from({ length: f.chunkCount }, (_, i) => i).filter((i) => !f.received.has(i))
      }))
    });
  }),

  http.post(`${B}/uploads/:uid/complete`, ({ params }) => {
    const u = uploads[params.uid as string];
    if (!u) return err(404, 'not_found', 'Upload nicht gefunden.');
    if (u.files.some((f) => f.received.size < f.chunkCount)) return err(409, 'chunks_missing', 'Es fehlen noch Teile der Aufnahme.');
    const s = sessions.find((x) => x.id === u.sessionId)!;
    if (s.unreadable) {
      delete uploads[u.id];
      s.state = 'created';
      return err(409, 'recording_unreadable', 'Diese Aufnahme kann Taleward nicht lesen. Speichere sie bitte als gewöhnliche Audiodatei (zum Beispiel MP3 oder M4A) und lade sie noch einmal hoch.');
    }
    u.completed = true;
    s.state = 'queued';
    s.phaseStartedAt = Date.now();
    return HttpResponse.json(advance(s), { status: 202 });
  }),

  http.post(`${B}/sessions/:id/retry`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(404, 'not_found', 'Session nicht gefunden.');
    if (s.state !== 'failed') return err(409, 'not_failed', 'Die Verarbeitung ist nicht fehlgeschlagen.');
    if (s.audioGone) return err(409, 'audio_gone', 'Die Aufnahme ist nicht mehr auf dem Server. Bitte lade sie neu hoch.');
    s.failNext = false;
    s.state = 'queued';
    s.phaseStartedAt = Date.now();
    return HttpResponse.json(advance(s), { status: 202 });
  }),

  http.post(`${B}/sessions/:id/resummarize`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(404, 'not_found', 'Session nicht gefunden.');
    if (s.state !== 'awaiting_review') return err(409, 'wrong_state', 'Neu schreiben geht nur, solange das Kapitel auf deine Prüfung wartet.');
    startRewrite(s);
    return HttpResponse.json(advance(s), { status: 202 });
  }),

  http.get(`${B}/sessions/:id/speakers`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(403, 'forbidden', 'Nur die Spielleitung ordnet Stimmen zu.');
    const list = [...(speakerLists[s.id] ?? musterProbe(s.campaignId, s.id)?.speakers ?? speakersFor())];
    // Mit Stimmprofil wird die eigene Stimme ohne Vorstellungsrunde erkannt
    if (voiceStatus().status === 'ready') list[0] = { ...list[0], source: 'voice_match', confidence: 0.97, sampleText: '„Also, wo waren wir stehen geblieben?“' };
    // 0.4.24: Ist ein Gast dabei, schlägt der Testserver ihm die letzte, sonst unbekannte Stimme vor
    const guest = s.attendees.find((a) => a.guestName)?.guestName;
    const last = list.length - 1;
    if (guest && last >= 0 && !list[last].suggestedMemberId) list[last] = { ...list[last], suggestedGuestName: guest, confidence: 0.6, source: 'intro_round' };
    // Nach der Bestätigung (0.4.10): bestätigte Zuordnung mitliefern; ältere Testsessions gelten als wie vorgeschlagen bestätigt
    if (s.state !== 'awaiting_speakers') {
      const a = assignments[s.id];
      return HttpResponse.json(list.map((sp) => {
        const x = a?.[sp.id];
        return { ...sp, assignedMemberId: x ? x.memberId : sp.suggestedMemberId, assignedGuestName: x ? x.guestName : sp.assignedGuestName ?? null };
      }));
    }
    return HttpResponse.json(list);
  }),

  http.put(`${B}/sessions/:id/speakers`, async ({ params, request }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(403, 'forbidden', 'Nur die Spielleitung ordnet Stimmen zu.');
    const mapping = (await request.json().catch(() => [])) as { speakerId: string; memberId: string | null; guestName?: string | null }[];
    if (mapping.some((x) => x.memberId && x.guestName)) return err(400, 'invalid_input', 'Eine Stimme ist entweder ein Mitglied oder ein Gast.');
    const guests = s.attendees.map((a) => a.guestName).filter(Boolean);
    if (mapping.some((x) => x.guestName && !guests.includes(x.guestName))) return err(400, 'guest_unknown', 'Diesen Gast gibt es in dieser Runde nicht.');
    if (s.state !== 'awaiting_speakers' && s.state !== 'awaiting_review') return err(409, 'wrong_state', 'Die Stimmen lassen sich gerade nicht ändern.');
    assignments[s.id] = Object.fromEntries(mapping.map((x) => [x.speakerId, { memberId: x.memberId, guestName: x.guestName ?? null }]));
    if (s.state === 'awaiting_review') {
      // 0.4.10: Zuordnung geändert → Kapitel aus der Abschrift neu schreiben
      startRewrite(s);
      return HttpResponse.json(advance(s), { status: 202 });
    }
    s.state = 'summarizing';
    s.phaseStartedAt = Date.now();
    if (voiceStatus().status === 'ready' && voice.learnFromSessions) voice.learnedSessionCount++;
    return HttpResponse.json(advance(s), { status: 202 });
  }),

  http.get(`${B}/sessions/:id/speakers/:sid/sample`, ({ params, request }) => {
    // 0.4.21: ?index= für eine der drei Textproben
    const index = new URL(request.url).searchParams.get('index');
    if (index !== null) {
      const sp = (speakerLists[params.id as string] ?? speakersFor()).find((x) => x.id === params.sid);
      if (!sp || !/^[0-2]$/.test(index) || Number(index) >= (sp.samples?.length ?? 0)) return err(404, 'not_found', 'Diese Hörprobe gibt es nicht.');
    }
    return new HttpResponse(toneWav(), { headers: { 'Content-Type': 'audio/wav' } });
  }),

  http.get(`${B}/sessions/:id/proposals`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(403, 'forbidden', 'Nur für die Spielleitung.');
    return HttpResponse.json(proposals.filter((p) => p.sessionId === s.id).map(withMatch));
  }),

  http.patch(`${B}/proposals/:id`, async ({ params, request }) => {
    const p = proposals.find((x) => x.id === params.id);
    if (!p) return err(404, 'not_found', 'Vorschlag nicht gefunden.');
    // Mitgebrachte Welt: Entscheidung wirkt sofort und ist endgültig (Server 0.4.7)
    if (p.source === 'character' && p.decision !== 'open') return err(409, 'invalid_state', 'Dieser Vorschlag ist schon entschieden.');
    const body = (await request.json()) as Partial<Proposal> & { visibility?: Proposal['suggestedVisibility'] };
    if (body.gmNotes !== undefined) p.gmNotes = body.gmNotes || null;
    if (body.visibility) p.publicSuggested = false;
    if (Array.isArray(body.hiddenFromMemberIds)) p.hiddenFromMemberIds = body.hiddenFromMemberIds;
    if (body.decision) p.decision = body.decision;
    if (body.title !== undefined) p.title = body.title;
    if (body.detail !== undefined) p.detail = body.detail;
    if (body.visibility) p.suggestedVisibility = body.visibility;
    // 0.4.21: bei einem vorhandenen Eintrag ergänzen statt neu anlegen
    if (body.mergeIntoEntryId !== undefined) {
      const target = body.mergeIntoEntryId ? entries.find((e) => e.id === body.mergeIntoEntryId) : null;
      const campaignId = sessions.find((x) => x.id === p.sessionId)?.campaignId ?? documents.find((d) => d.id === p.documentId)?.campaignId;
      if (p.action !== 'create' || (body.mergeIntoEntryId && (!target || target.campaignId !== campaignId))) {
        return err(400, 'invalid_input', 'Dieser Vorschlag lässt sich dort nicht ergänzen.');
      }
      p.mergeIntoEntryId = body.mergeIntoEntryId;
    }
    // 0.4.26: Halter der Beute
    if (body.holderMemberId !== undefined || body.holderCleared !== undefined) {
      const campaignId = sessions.find((x) => x.id === p.sessionId)?.campaignId;
      const c = campaigns.find((x) => x.id === campaignId);
      if (p.entryType !== 'item') return err(400, 'invalid_input', 'Nur Beute hat einen Halter.');
      if (body.holderMemberId && !c?.members.some((m) => m.id === body.holderMemberId && m.role === 'player' && !m.leftAt && !m.deletedAt)) {
        return err(400, 'holder_unknown', 'Diese Person ist nicht am Tisch.');
      }
      if (body.holderCleared && p.action === 'create' && !p.mergeIntoEntryId) return err(400, 'invalid_input', 'Ein neuer Gegenstand hat noch keinen Halter.');
      p.holderMemberId = body.holderCleared ? null : body.holderMemberId ?? null;
      p.holderCleared = !!body.holderCleared && !body.holderMemberId;
    }
    // Mitgebrachte Welt (0.4.7): Entscheidung wirkt sofort
    if (p.source === 'character' && body.decision && body.decision !== 'open') applyCharacterProposal(p);
    return HttpResponse.json(withMatch(p));
  }),

  http.get(`${B}/sessions/:id/recap`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    const r = recaps[params.id as string];
    if (!s || !r || (!isGm(s.campaignId) && s.state !== 'published')) return err(404, 'not_found', 'Für diese Runde gibt es noch kein Kapitel.');
    return HttpResponse.json(recapFor(r, isGm(s.campaignId)));
  }),

  http.put(`${B}/sessions/:id/recap`, async ({ params, request }) => {
    const s = sessions.find((x) => x.id === params.id);
    const r = recaps[params.id as string];
    if (!s || !r) return err(404, 'not_found', 'Für diese Runde gibt es noch kein Kapitel.');
    if (!isGm(s.campaignId)) return err(403, 'forbidden', 'Nur die Spielleitung kann das Kapitel bearbeiten.');
    if (s.state === 'published') return err(409, 'session_published', 'Das Kapitel ist schon veröffentlicht.');
    const body = (await request.json()) as { title?: string; text?: string; openThreads?: string[]; parts?: RecapPart[] };
    // Ab 0.4.17: Teile beziehen sich auf den Text aus derselben Anfrage
    const newText = body.text ?? r.text;
    const count = newText.split(/\n\s*\n/).length;
    if (body.parts !== undefined) {
      let last = -1;
      for (const part of body.parts) {
        if (!part || typeof part.title !== 'string' || !part.title.trim() || part.title.length > 120
          || !Number.isInteger(part.firstParagraph) || part.firstParagraph <= last || part.firstParagraph >= count) {
          return err(400, 'invalid_parts', 'Die Teile passen nicht zum Text.');
        }
        last = part.firstParagraph;
      }
    }
    if (body.title !== undefined) r.title = body.title;
    if (body.openThreads !== undefined) r.openThreads = body.openThreads;
    if (body.text !== undefined && body.text !== r.text) {
      if (withRevision(r).revision?.state === 'running') return err(409, 'revision_running', 'Die Korrektur läuft noch. Warte kurz, bevor du von Hand änderst.');
      const before = r.text.split(/\n\s*\n/).length;
      r.text = body.text;
      if (body.parts === undefined && before !== count) r.parts = [];
      if (r.review) r.review.stale = true; // Absätze können verrutscht sein
      r.revision = null; // ab 0.4.15: Bearbeiten von Hand verwirft einen offenen Korrektur-Entwurf
      delete revisionJobs[r.sessionId];
    }
    if (body.parts !== undefined) r.parts = body.parts.map((x) => ({ title: x.title.trim(), firstParagraph: x.firstParagraph }));
    return HttpResponse.json(recapFor(r, true));
  }),

  http.post(`${B}/sessions/:id/recap/revision`, async ({ params, request }) => {
    const s = sessions.find((x) => x.id === params.id);
    const r = recaps[params.id as string];
    if (!s || !r || !isGm(s.campaignId)) return err(404, 'not_found', 'Für diese Runde gibt es noch kein Kapitel.');
    if (s.state !== 'awaiting_review') return err(409, 'wrong_state', 'Korrigieren geht nur, solange das Kapitel auf deine Prüfung wartet.');
    withRevision(r);
    if (r.revision?.state === 'running') return err(409, 'revision_running', 'Die Korrektur läuft noch.');
    const body = (await request.json().catch(() => ({}))) as { note?: string; baseText?: string };
    const note = (body.note ?? '').trim();
    if (!note || note.length > 2000) return err(400, 'invalid_input', 'Schreib kurz, was nicht stimmt oder fehlt.');
    if (body.baseText !== r.text) return err(409, 'recap_changed', 'Das Kapitel hat sich inzwischen geändert. Lies es noch einmal und schreib den Hinweis dazu.');
    const now = Date.now();
    const recent = (revisionCount[s.id] ?? []).filter((t0) => now - t0 < 864e5);
    if (recent.length >= 10) return err(409, 'revision_limit', 'Dieses Kapitel wurde in den letzten 24 Stunden schon zehnmal korrigiert. Später geht es wieder – oder ändere den Text selbst.');
    revisionCount[s.id] = [...recent, now];
    revisionJobs[s.id] = { readyAt: now + 2500, result: mockRevision(r.text, note) };
    r.revision = { state: 'running', message: null, createdAt: new Date(now).toISOString(), changes: [], notes: [] };
    return HttpResponse.json(r, { status: 202 });
  }),

  http.post(`${B}/sessions/:id/recap/revision/decision`, async ({ params, request }) => {
    const s = sessions.find((x) => x.id === params.id);
    const r = recaps[params.id as string];
    if (!s || !r || !isGm(s.campaignId)) return err(404, 'not_found', 'Für diese Runde gibt es noch kein Kapitel.');
    withRevision(r);
    const v = r.revision;
    if (!v) return err(409, 'no_revision', 'Es gibt keinen offenen Korrektur-Entwurf.');
    if (v.state === 'running') return err(409, 'revision_running', 'Die Korrektur läuft noch.');
    const { accept } = (await request.json().catch(() => ({}))) as { accept?: boolean };
    if (accept) {
      if (v.state !== 'ready') return err(409, 'no_revision', 'Es gibt keinen fertigen Korrektur-Entwurf.');
      const paras = r.text.split(/\n\s*\n/);
      if (v.changes.some((c) => paras[c.index] !== c.before)) return err(409, 'recap_changed', 'Das Kapitel hat sich inzwischen geändert. Nichts wurde übernommen.');
      for (const c of v.changes) paras[c.index] = c.after;
      r.text = paras.join('\n\n');
      if (r.review) {
        r.review.paragraphs = r.review.paragraphs.map((x) => v.changes.some((c) => c.index === x.index) ? { ...x, verdict: 'unchecked', note: null, evidence: [] } : x);
      }
    }
    r.revision = null;
    return HttpResponse.json(recapFor(r, true));
  }),

  http.get(`${B}/sessions/:id/transcript`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(404, 'not_found', 'Session nicht gefunden.');
    return HttpResponse.json(transcriptFor(s.id));
  }),

  http.get(`${B}/sessions/:id/uncertain-terms`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(404, 'not_found', 'Session nicht gefunden.');
    return HttpResponse.json({
      audioAvailable: !s.audioDeletedAt,
      audioDeletesAt: s.audioDeletedAt ? null : new Date(Date.now() + 3 * 86400000).toISOString(),
      retranscribesLeft: 2 - (s.retranscribes ?? 0),
      terms: uncertain[s.id] ?? []
    });
  }),

  http.post(`${B}/sessions/:id/corrections`, async ({ params, request }) => {
    const s = sessions.find((x) => x.id === params.id);
    const c = s && campaigns.find((x) => x.id === s.campaignId);
    if (!s || !c || !myMember(c)) return err(404, 'not_found', 'Session nicht gefunden.');
    if (!isGm(c.id)) return err(403, 'forbidden', 'Nur die Spielleitung kann Namen korrigieren.');
    if (s.state !== 'awaiting_review' && s.state !== 'failed') return err(409, 'wrong_state', 'Korrigieren geht nur, solange das Kapitel auf deine Prüfung wartet.');
    const body = (await request.json()) as { corrections?: Correction[]; retranscribe?: boolean };
    if (!body.corrections?.length) return err(400, 'invalid_input', 'Keine Korrektur angegeben.');
    if (body.retranscribe) {
      if (s.audioDeletedAt) return err(409, 'audio_gone', 'Die Aufnahme ist schon gelöscht – erneut transkribieren geht nicht mehr.');
      if ((s.retranscribes ?? 0) >= 2) return err(409, 'retranscribe_limit', 'Dieses Kapitel wurde schon zweimal neu transkribiert.');
    }
    const r = recaps[s.id];
    for (const k of body.corrections) {
      uncertain[s.id] = (uncertain[s.id] ?? []).filter((u) => u.heard !== k.heard);
      const correct = k.correct.trim();
      if (!correct) continue; // so lassen, nur nicht mehr melden
      (transcriptFixes[s.id] ??= []).push([k.heard, correct]);
      if (r) r.text = replaceWord(r.text, k.heard, correct);
      for (const p of proposals.filter((x) => x.sessionId === s.id)) {
        p.title = replaceWord(p.title, k.heard, correct);
        p.detail = replaceWord(p.detail, k.heard, correct);
        p.evidence = p.evidence.map((e) => ({ ...e, quote: replaceWord(e.quote, k.heard, correct) }));
      }
      if (k.addToHotwords !== false && !(c.hotwords ?? []).includes(correct)) c.hotwords = [...(c.hotwords ?? []), correct];
    }
    if (body.retranscribe) {
      s.retranscribes = (s.retranscribes ?? 0) + 1;
      s.retranscribing = true;
      s.state = 'transcribing';
      s.phaseStartedAt = Date.now();
      return HttpResponse.json(advance(s), { status: 202 });
    }
    if (r?.review) Object.assign(r.review, { stale: false, checkedAt: new Date().toISOString() });
    return HttpResponse.json(recapFor(r, true));
  }),

  http.post(`${B}/sessions/:id/publish`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(403, 'forbidden', 'Nur die Spielleitung kann veröffentlichen.');
    if (s.state !== 'awaiting_review') return err(409, 'not_ready', 'Die Session ist noch nicht fertig verarbeitet.');
    for (const p of proposals.filter((x) => x.sessionId === s.id)) {
      if (p.decision === 'open') p.decision = 'rejected';
      if (p.decision !== 'accepted') continue;
      const merge = p.action === 'create' && p.mergeIntoEntryId ? entries.find((e) => e.id === p.mergeIntoEntryId) : undefined;
      // 0.4.26: Halter der Beute übernehmen (nur bei Gegenständen)
      const holderTo = (e: Entry | undefined) => {
        if (!e || e.type !== 'item') return;
        if (p.holderCleared) e.holderMemberId = null;
        else if (p.holderMemberId) e.holderMemberId = p.holderMemberId;
      };
      if (!merge) holderTo(p.targetEntryId ? entries.find((e) => e.id === p.targetEntryId) : undefined);
      if (merge) {
        // Wie der Server: Ist der Vorschlag weniger sichtbar als der Eintrag, kommen Titel und Text nur in die SL-Notizen
        const lessVisible = merge.visibility === 'public' && (p.suggestedVisibility !== 'public'
          || (p.hiddenFromMemberIds ?? []).some((id) => !(merge.hiddenFromMemberIds ?? []).includes(id)));
        if (lessVisible) {
          const note = [`${p.title}: ${p.detail}`.replace(/: $/, ''), p.gmNotes].filter(Boolean).join('\n\n');
          merge.gmNotes = merge.gmNotes ? `${merge.gmNotes}\n\n${note}` : note;
          merge.updatedAt = new Date().toISOString();
          continue;
        }
        holderTo(merge);
        // 0.4.21: wie update anhängen, abweichende Schreibweise zu „Auch genannt“; Sichtbarkeit bleibt
        if (p.detail && !merge.summary.includes(p.detail)) merge.summary = merge.summary ? `${merge.summary}\n\n${p.detail}` : p.detail;
        if (p.gmNotes) merge.gmNotes = merge.gmNotes ? `${merge.gmNotes}\n\n${p.gmNotes}` : p.gmNotes;
        merge.aliases = cleanAliases([...(merge.aliases ?? []), p.title], merge.name);
        merge.lastSessionNumber = s.number;
        merge.mentions.push({ sessionNumber: s.number, note: p.detail });
        merge.updatedAt = new Date().toISOString();
        continue;
      }
      const target = p.targetEntryId ? entries.find((e) => e.id === p.targetEntryId) : undefined;
      if (target && p.action === 'reveal') {
        // Freigabe: öffentlicher Teil wird sichtbar, der geheime bleibt
        target.summary = p.detail || target.summary;
        if (p.gmNotes !== undefined) target.gmNotes = p.gmNotes;
        target.visibility = 'public';
        target.hiddenFromMemberIds = p.hiddenFromMemberIds ?? [];
        target.lastSessionNumber = s.number;
        target.updatedAt = new Date().toISOString();
      } else if (target) {
        target.summary = p.detail;
        if (p.gmNotes) target.gmNotes = p.gmNotes;
        target.visibility = p.suggestedVisibility;
        target.hiddenFromMemberIds = p.suggestedVisibility === 'public' ? p.hiddenFromMemberIds ?? [] : [];
        target.lastSessionNumber = s.number;
        target.mentions.push({ sessionNumber: s.number, note: p.detail });
        target.updatedAt = new Date().toISOString();
      } else {
        entries.push({
          id: 'e-' + crypto.randomUUID().slice(0, 8), campaignId: s.campaignId,
          type: p.entryType === 'other' ? 'other' : p.entryType, name: p.title, summary: p.detail,
          visibility: p.suggestedVisibility, hiddenFromMemberIds: p.hiddenFromMemberIds ?? [], gmNotes: p.gmNotes ?? null, status: p.entryType === 'quest' ? 'active' : null,
          holderMemberId: p.entryType === 'item' ? p.holderMemberId ?? null : null,
          firstSessionNumber: s.number, lastSessionNumber: s.number, mentions: [], updatedAt: new Date().toISOString()
        });
      }
    }
    s.state = 'published';
    s.publishedAt = new Date().toISOString();
    if (recaps[s.id]) recaps[s.id].publishedAt = s.publishedAt;
    return HttpResponse.json(publicSession(s));
  }),

  http.get(`${B}/sessions/:id/gm-note`, ({ params }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(403, 'forbidden', 'Nur für die Spielleitung.');
    return HttpResponse.json({ text: gmNotes[s.id] ?? '', updatedAt: new Date().toISOString() });
  }),

  http.put(`${B}/sessions/:id/gm-note`, async ({ params, request }) => {
    const s = sessions.find((x) => x.id === params.id);
    if (!s || !isGm(s.campaignId)) return err(403, 'forbidden', 'Nur für die Spielleitung.');
    gmNotes[s.id] = ((await request.json()) as { text: string }).text;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/campaigns/:id/entries`, ({ params, request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const q = url.searchParams.get('q')?.toLowerCase();
    const gm = isGm(params.id as string);
    const meId = myMember(campaigns.find((c) => c.id === params.id)!)?.id ?? '';
    return HttpResponse.json(
      entries
        .filter((e) => e.campaignId === params.id)
        // Spoilerschutz serverseitig: geheim oder vor mir verborgen = gar nicht ausliefern
        .filter((e) => gm || (e.visibility === 'public' && !(e.hiddenFromMemberIds ?? []).includes(meId)))
        .map((e) => (gm ? e : { ...e, gmNotes: undefined, hiddenFromMemberIds: undefined, formerHolderMemberId: undefined, links: visibleLinks(e.links, false) }))
        .filter((e) => !type || e.type === type)
        .filter((e) => !q || (e.name + ' ' + (e.aliases ?? []).join(' ') + ' ' + e.summary + ' ' + (gm ? e.gmNotes ?? '' : '')).toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    );
  }),

  http.patch(`${B}/entries/:eid`, async ({ params, request }) => {
    const e = entries.find((x) => x.id === params.eid);
    if (!e || !isGm(e.campaignId)) return err(404, 'not_found', 'Eintrag nicht gefunden.');
    const body = (await request.json()) as Partial<Entry>;
    if (body.visibility === 'public' && !(body.summary ?? e.summary)?.trim()) {
      return err(400, 'invalid_input', 'Zum Freigeben braucht der Eintrag einen Text für die Spieler.');
    }
    if (body.links !== undefined) {
      const ok = checkLinks(body.links, 3);
      if (typeof ok === 'string') return err(400, 'invalid_input', ok);
      body.links = ok;
    }
    Object.assign(e, Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'summary', 'gmNotes', 'visibility', 'status', 'holderMemberId', 'type', 'hiddenFromMemberIds', 'links'].includes(k))));
    // 0.4.21: „Auch genannt“ bereinigt speichern (ohne Namen, ohne Doppelte)
    if (body.aliases !== undefined || body.name !== undefined) e.aliases = cleanAliases(body.aliases ?? e.aliases ?? [], e.name);
    e.updatedAt = new Date().toISOString();
    return HttpResponse.json(e);
  }),

  // Figuren ausgetretener Spieler (0.4.9)
  http.post(`${B}/entries/:eid/to-npc`, ({ params }) => {
    const e = entries.find((x) => x.id === params.eid);
    if (!e || !isGm(e.campaignId)) return err(404, 'not_found', 'Eintrag nicht gefunden.');
    if (e.type !== 'pc') return err(409, 'not_a_character', 'Das ist keine Spielerfigur.');
    const c = campaigns.find((x) => x.id === e.campaignId)!;
    const holder = c.members.find((m) => m.id === e.holderMemberId);
    if (holder && !holder.leftAt && !holder.deletedAt) return err(409, 'holder_active', 'Die Figur gehört noch einem aktiven Mitglied.');
    Object.assign(e, { type: 'npc', formerHolderMemberId: e.holderMemberId ?? null, holderMemberId: null, updatedAt: new Date().toISOString() });
    settleOrphanNotices(c.id);
    return HttpResponse.json(e);
  }),

  http.post(`${B}/entries/:eid/assign`, async ({ params, request }) => {
    const e = entries.find((x) => x.id === params.eid);
    if (!e || !isGm(e.campaignId)) return err(404, 'not_found', 'Eintrag nicht gefunden.');
    const c = campaigns.find((x) => x.id === e.campaignId)!;
    const holder = c.members.find((m) => m.id === e.holderMemberId);
    const free = (e.type === 'pc' && (!holder || holder.leftAt || holder.deletedAt)) || (e.type === 'npc' && !!e.formerHolderMemberId);
    if (!free) return err(409, 'not_a_character', 'Diese Figur lässt sich nicht übergeben.');
    const { memberId } = (await request.json().catch(() => ({}))) as { memberId?: string };
    const target = c.members.find((m) => m.id === memberId && !m.leftAt && !m.deletedAt && !m.openSeat);
    if (!target || target.role !== 'player') return err(409, 'not_a_player', 'Nur aktive Spieler können eine Figur übernehmen.');
    if (entries.some((x) => x.campaignId === c.id && x.type === 'pc' && x.holderMemberId === target.id)) {
      return err(409, 'member_has_character', 'Diese Person spielt schon eine Figur.');
    }
    Object.assign(e, { type: 'pc', holderMemberId: target.id, updatedAt: new Date().toISOString() });
    Object.assign(target, { characterName: e.name, characterSummary: e.summary || null, characterId: null, characterVersion: null });
    settleOrphanNotices(c.id);
    return HttpResponse.json(e);
  }),

  http.delete(`${B}/entries/:eid`, ({ params }) => {
    const i = entries.findIndex((x) => x.id === params.eid);
    if (i < 0 || !isGm(entries[i].campaignId)) return err(404, 'not_found', 'Eintrag nicht gefunden.');
    entries.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${B}/campaigns/:id/entries`, async ({ params, request }) => {
    if (!isGm(params.id as string)) return err(403, 'forbidden', 'Nur die Spielleitung kann Einträge anlegen.');
    const body = (await request.json()) as Partial<EntryInput>;
    if (!body.name || !body.type) return err(400, 'invalid_input', 'Name und Art des Eintrags fehlen.');
    const e = {
      ...(body as EntryInput),
      aliases: cleanAliases(body.aliases, body.name),
      // Wie der Server: ohne Angabe nur für die SL sichtbar
      visibility: body.visibility ?? 'gm_only', id: 'e-' + crypto.randomUUID().slice(0, 8), campaignId: params.id as string,
      firstSessionNumber: null, lastSessionNumber: null, mentions: [], updatedAt: new Date().toISOString()
    };
    entries.push(e);
    return HttpResponse.json(e, { status: 201 });
  }),
  // 0.4.25: Guthaben und Kampagnen-Einstellungen
  ...billingHandlers(B, { myMember, terms: () => !termsOutdated() })
];
