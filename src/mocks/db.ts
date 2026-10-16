import type { CampaignDocument, CharacterAnalysis, ChapterPlan, Comment, Link, DatePoll, Entry, GmNotice, Member, Proposal, Recap, Session, Speaker, TranscriptSegment, UncertainTerm } from '../api/types';

// Testdaten, angelehnt an den Klick-Prototyp. Alles erfunden.

export const ME = { id: 'u-robin', username: 'robin', displayName: 'Robin' };

/** Anmelde-Angaben des Test-Kontos (Schnittstelle 0.4.0) – nur für die Person selbst sichtbar */
export const account = {
  email: null as string | null,
  emailPending: null as string | null,
  hasPassword: true,
  providers: [] as string[]
};

/** Zweiter „Server“ im Testmodus, erreichbar über https://nachbarverein.test/api/v1 */
export const NACHBAR_HOST = 'nachbarverein.test';


export interface MockCampaign {
  id: string;
  title: string;
  description: string;
  worldInfo: string;
  language: 'de' | 'en';
  system?: 'dsa' | 'dnd' | 'pathfinder' | 'cthulhu' | 'shadowrun' | 'splittermond' | 'other' | null;
  systemName?: string | null;
  allowExternalTranscription?: boolean;
  allowCloudSummary?: boolean;
  /** Auswertung von Charakterbögen und Hintergründen (ab 0.4.18) */
  allowCharacterAnalysis?: boolean;
  archivedAt?: string | null;
  /** Namenshilfe (ab 0.4.6, nur SL) */
  hotwords?: string[];
  /** Links der Kampagne (ab 0.4.13) */
  links?: Link[];
  coverPreset: string | null;
  /** Nur im Testmodus: auf welchem „Server“ die Kampagne liegt (fehlt = eingebauter Testserver) */
  host?: string;
  members: Member[];
  inviteCode: string;
  nextSessionAt: string | null;
}

export const campaigns: MockCampaign[] = [
  {
    id: 'c-grau',
    title: 'Die Schatten von Grauwacht',
    description: 'Düstere Stadtkampagne am Grauen Strom.',
    system: 'dsa',
    allowExternalTranscription: true, allowCloudSummary: true, allowCharacterAnalysis: true,
    hotwords: ['Grauwacht', 'Kaltenfurt', 'Thorwald', 'Nyra', 'Ilsabet', 'Hedda', 'Rabenzirkel', 'Vier Wasser'],
    coverPreset: 'swamp',
    language: 'de',
    worldInfo: 'Grauwacht ist ein Dorf am Rand des Moores, eine Tagesreise flussaufwärts von der Hafenstadt Kaltenfurt. Seit Generationen läutet die Glocke von Grauwacht zu jedem Festtag.\n\nDie Menschen hier beten zu den Vier Wassern. Fremden begegnen sie höflich, aber vorsichtig – besonders seit die Raben zurückgekehrt sind.\n\nAm Tisch gilt: Handys weg während der Szenen, Pausen macht die SL.',
    inviteCode: 'RABE-4821',
    nextSessionAt: null,
    members: [
      // Gelöschtes Konto: bleibt stehen, wird aber nirgends mehr als Person angeboten
      { id: 'm-del', userId: '', displayName: 'Gelöschtes Konto', characterName: 'Brakk', role: 'player', recordingConsentAt: null, deletedAt: '2026-09-20T10:00:00Z' },
      { id: 'm-robin', userId: 'u-robin', displayName: 'Robin', characterName: null, role: 'gm' , recordingConsentAt: '2026-07-01T18:00:00Z' },
      { id: 'm-jonas', userId: 'u-jonas', displayName: 'Jonas', characterName: 'Thorwald', characterSummary: 'Zwergischer Schmied aus Grauwacht. Laut, herzlich und redet ungern über seine Familie.', characterBackstory: 'Schuldet der Diebesgilde von Kaltenfurt 300 Silber.', role: 'player', portraitUpdatedAt: '2026-09-01T10:00:00Z', recordingConsentAt: '2026-07-01T18:00:00Z' },
      { id: 'm-lea', userId: 'u-lea', displayName: 'Lea', characterName: 'Ilsabet', characterSummary: 'Heilerin aus dem Moor, spricht mit Pflanzen und manchmal mit Toten.', role: 'player', portraitUpdatedAt: '2026-09-01T10:00:00Z', recordingConsentAt: '2026-07-01T18:00:00Z' },
      { id: 'm-kemal', userId: 'u-kemal', displayName: 'Kemal', characterName: 'Bruder Anselm', role: 'player' , recordingConsentAt: '2026-07-01T18:00:00Z' },
      { id: 'm-sophie', userId: 'u-sophie', displayName: 'Sophie', characterName: 'Nyra', role: 'player' , recordingConsentAt: null }
    ]
  },
  {
    id: 'c-drache',
    title: 'Die Erben des Drachenpasses',
    description: 'Reisekampagne durch das Hochgebirge.',
    system: 'other', systemName: 'Household',
    allowCharacterAnalysis: true,
    coverPreset: 'mountains',
    language: 'de',
    worldInfo: '',
    inviteCode: 'PASS-1177',
    nextSessionAt: '2026-10-04T15:00:00Z',
    members: [
      { id: 'm-mara', userId: 'u-mara', displayName: 'Mara', characterName: null, role: 'gm' , recordingConsentAt: '2026-07-01T18:00:00Z' },
      { id: 'm-robin2', userId: 'u-robin', displayName: 'Robin', characterName: 'Ilvara', characterBackstory: 'Ilvara wuchs bei den Hirten am Nebelkamm auf. Ihr Bruder Kesh verschwand im Winter vor drei Jahren am Pass; seitdem sucht sie ihn. Sie trägt seinen Wanderstab.', role: 'player' , recordingConsentAt: null },
      { id: 'm-tim', userId: 'u-tim', displayName: 'Tim', characterName: 'Garrek', role: 'player' , recordingConsentAt: '2026-07-01T18:00:00Z' }
    ]
  }
];

// Zum Ausprobieren des Beitritts: Kampagne, in der man noch nicht Mitglied ist (Code SALZ-2026)
campaigns.push({
  id: 'c-salz', host: NACHBAR_HOST, title: 'Salz und Silber', description: 'Piratenabenteuer in der Straße der tausend Inseln.',
  worldInfo: '', language: 'de', coverPreset: 'coast', inviteCode: 'SALZ-2026', nextSessionAt: null,
  members: [{ id: 'm-mara3', userId: 'u-mara', displayName: 'Mara', characterName: null, role: 'gm', recordingConsentAt: '2026-09-01T00:00:00Z' }]
});

export interface MockSession extends Session {
  // Nur im Mock: Zeitpunkt, ab dem der aktuelle Verarbeitungsschritt läuft
  phaseStartedAt: number | null;
  // Nur im Mock: Fehler simulieren (Dateiname enthält "fehler" bzw. "weg")
  failNext?: boolean;
  audioGone?: boolean;
  /** Testmodus: Abschließen lehnt ab (recording_unreadable) */
  unreadable?: boolean;
  // Nur im Mock: erneute Transkription nach Korrektur (ab 0.4.6) – danach gleich zur Zusammenfassung
  retranscribing?: boolean;
  retranscribes?: number;
}

const pastSession = (campaignId: string, n: number, title: string, playedAt: string): MockSession => ({
  id: `s-${campaignId}-${n}`,
  campaignId,
  number: n,
  title,
  playedAt,
  state: 'published',
  source: 'table',
  attendees: [],
  durationSeconds: 13800,
  audioDeletedAt: playedAt,
  publishedAt: playedAt,
  phaseStartedAt: null
});

export const sessions: MockSession[] = [
  pastSession('c-grau', 10, 'Die Glocke schweigt', '2026-08-08T17:00:00Z'),
  pastSession('c-grau', 11, 'Der Handel im Weidenkrug', '2026-08-22T17:00:00Z'),
  pastSession('c-grau', 12, 'Nebel über dem Moor', '2026-09-05T17:00:00Z'),
  // Audio noch da (Aufbewahrung bis zur Freigabe) – unsichere Namen lassen sich mit erneuter Transkription korrigieren
  { ...pastSession('c-grau', 13, 'Das Siegel von Kaltenfurt', '2026-09-19T17:00:00Z'), state: 'awaiting_review', publishedAt: null, audioDeletedAt: null },
  pastSession('c-drache', 7, 'Die Brücke aus Eis', '2026-09-14T16:00:00Z')
];

export const recaps: Record<string, Recap> = {
  's-c-grau-10': {
    sessionId: 's-c-grau-10', number: 10, title: 'Die Glocke schweigt', publishedAt: '2026-08-08T17:00:00Z',
    text: 'Die Glocke von Grauwacht blieb am Festtag stumm. Meister Orrin Kalk, der sie gegossen hatte, war über Nacht verschwunden – zurück blieb nur seine Werkstatt voller zerbrochener Formen.',
    openThreads: ['Wo ist Meister Orrin?']
  },
  's-c-grau-11': {
    sessionId: 's-c-grau-11', number: 11, title: 'Der Handel im Weidenkrug', publishedAt: '2026-08-22T17:00:00Z',
    text: 'Im Weidenkrug handelte Thorwald mit der Wirtin Hedda eine Karte des Moores aus. Der Preis: ein Gefallen, den sie irgendwann einfordern wird.',
    openThreads: ['Welchen Gefallen will Hedda?']
  },
  's-c-grau-12': {
    sessionId: 's-c-grau-12', number: 12, title: 'Nebel über dem Moor', publishedAt: '2026-09-05T17:00:00Z',
    text: 'Im dichten Nebel fanden die Gefährten die verirrte Hebamme und brachten sie sicher nach Grauwacht zurück. Auf dem Rückweg hörte Nyra zum ersten Mal Rabenrufe, wo keine Raben waren.\n\nZwei Tage später lud der Bürgermeister zu einem Essen, das niemand genießen konnte. Zwischen Suppe und Braten bat er die Gruppe, den Nebel nicht mehr zu erwähnen – und zahlte im Voraus.',
    openThreads: ['Wer beobachtet die Gruppe?'],
    // Teile im Kapitel (ab 0.4.17)
    parts: [{ title: 'Die verirrte Hebamme', firstParagraph: 0 }, { title: 'Beim Bürgermeister', firstParagraph: 1 }]
  },
  's-c-grau-13': {
    sessionId: 's-c-grau-13', number: 13, title: 'Das Siegel von Kaltenfurt', publishedAt: null,
    text: 'Im Morgengrauen erreichten die Gefährten die Tore von Kaltenfurt – und fanden sie verschlossen. Hauptfrau Veyra Dornfeld ließ sie erst passieren, nachdem Ilsabeth einen kranken Wachmann geheilt hatte, doch ihr Blick blieb misstrauisch.\n\nIn der Ertrunkenen Kapelle stießen Thorwald und Nyra bei Ebbe auf einen Runenschlüssel, der dasselbe Zeichen trägt wie das gestohlene Siegel. Als die Flut zurückkehrte, hörten alle das Läuten einer Glocke, die es dort längst nicht mehr gibt.\n\nAuf dem Rückweg schwor Thorwald, den Raben noch vor dem Winter zu stellen.',
    openThreads: ['Wer hat das Siegel aus dem Tempel entwendet?', 'Welche Tür öffnet der Runenschlüssel?', 'Woher kam das Glockenläuten?'],
    parts: [{ title: 'Vor den Toren', firstParagraph: 0 }, { title: 'Die Ertrunkene Kapelle', firstParagraph: 1 }],
    // Gegenprüfung (ab 0.4.6): ein Absatz belegt, einer teilweise, einer ohne Beleg
    review: {
      state: 'done', stale: false, checkedAt: '2026-09-19T23:40:00Z', model: 'ollama/ministral-3:8b', revised: false,
      report: { total: 3, supported: 1, partial: 1, unsupported: 1, contradicted: 0, offGame: 0 },
      paragraphs: [
        { index: 0, verdict: 'supported', note: null, evidence: [
          { start: 1520, end: 1526, quote: 'Ich bin Hauptfrau Dornfeld, und ihr kommt hier nicht rein.', speakerMemberId: 'm-robin' },
          { start: 1804, end: 1811, quote: 'Ich lege ihm die Hand auf die Stirn und spreche den Heilsegen.', speakerMemberId: 'm-lea' }
        ] },
        { index: 1, verdict: 'partial', note: 'Die Kapelle und der Schlüssel sind belegt, das Glockenläuten erwähnt nur die SL als Frage („Hört ihr das?“).', evidence: [
          { start: 5400, end: 5404, quote: 'Die Kapelle steht halb im Wasser.', speakerMemberId: 'm-robin' },
          { start: 6210, end: 6214, quote: 'Das Zeichen ist dasselbe wie auf dem Siegel!', speakerMemberId: null }
        ] },
        { index: 2, verdict: 'unsupported', note: 'In der Abschrift nicht gefunden – vielleicht nach dem Ende der Aufnahme gesagt.', evidence: [] }
      ]
    }
  },
  's-c-drache-7': {
    sessionId: 's-c-drache-7', number: 7, title: 'Die Brücke aus Eis', publishedAt: '2026-09-14T16:00:00Z',
    text: 'Garrek und Ilvara überquerten die gefrorene Schlucht, kurz bevor die Brücke aus Eis unter dem Gewicht der Verfolger zerbrach.',
    openThreads: ['Wer hat die Verfolger geschickt?']
  }
};

export const gmNotes: Record<string, string> = {
  's-c-grau-13': 'Veyra arbeitet heimlich für den Rabenzirkel.'
};

const entry = (
  id: string, campaignId: string, type: Entry['type'], name: string, summary: string,
  extra: Partial<Entry> = {}
): Entry => ({
  id, campaignId, type, name, summary, visibility: 'public', status: null, holderMemberId: null,
  firstSessionNumber: null, lastSessionNumber: null, mentions: [], updatedAt: '2026-09-05T20:00:00Z', ...extra
});

export const entries: Entry[] = [
  entry('pc-brakk', 'c-grau', 'pc', 'Brakk', 'Halbork und Söldner, schwört auf seine rostige Axt.', { holderMemberId: 'm-del', firstSessionNumber: 10, lastSessionNumber: 12 }),
  entry('e1', 'c-grau', 'npc', 'Meister Orrin Kalk', 'Glockengießer aus Grauwacht, seit Kapitel 10 verschwunden.', { firstSessionNumber: 10, lastSessionNumber: 10 }),
  entry('e2', 'c-grau', 'npc', 'Hedda', 'Wirtin im Weidenkrug, schuldet Thorwald einen Gefallen.', { firstSessionNumber: 11, lastSessionNumber: 11, gmNotes: 'Spioniert für den Rabenzirkel und meldet jeden Fremden.', hiddenFromMemberIds: ['m-kemal'] }),
  entry('e3', 'c-grau', 'npc', 'Der Rabe', 'Anführer des Rabenzirkels, zeigt sich nie selbst.', { visibility: 'gm_only', gmNotes: 'Ist Veyras Bruder.' }),
  entry('e4', 'c-grau', 'location', 'Grauwacht', 'Heimatdorf der Gruppe, Ausgangspunkt der Kampagne.', { firstSessionNumber: 1, lastSessionNumber: 12 }),
  entry('e5', 'c-grau', 'location', 'Der Weidenkrug', 'Gasthaus an der Moorstraße.', { firstSessionNumber: 11, lastSessionNumber: 11 }),
  entry('e6', 'c-grau', 'quest', 'Die schweigende Glocke', 'Warum läutet sie nicht mehr – und wo doch?', { status: 'active', firstSessionNumber: 10, lastSessionNumber: 12 }),
  entry('e7', 'c-grau', 'quest', 'Die Hebamme im Moor', 'In Kapitel 12 sicher nach Grauwacht gebracht.', { status: 'done', firstSessionNumber: 12, lastSessionNumber: 12 }),
  entry('e8', 'c-grau', 'quest', 'Das gestohlene Siegel', 'Das Tempelsiegel von Grauwacht wurde entwendet.', { status: 'active', firstSessionNumber: 9, lastSessionNumber: 12 }),
  entry('e9', 'c-grau', 'item', 'Karte des Moores', 'Unvollständig.', { holderMemberId: 'm-jonas', firstSessionNumber: 11, lastSessionNumber: 11 }),
  entry('e10', 'c-drache', 'location', 'Die Brücke aus Eis', 'Zerbrochen in Kapitel 7.', { firstSessionNumber: 7, lastSessionNumber: 7, updatedAt: '2026-09-14T20:00:00Z' })
];

export function proposalsFor(sessionId: string): Proposal[] {
  const base = (id: string, p: Partial<Proposal>): Proposal => ({
    id: `${sessionId}-${id}`, sessionId, entryType: 'npc', action: 'create', targetEntryId: null,
    title: '', detail: '', suggestedVisibility: 'public', confidence: 0.9, flags: [], evidence: [],
    decision: 'open', ...p
  });
  return [
    base('p1', { title: 'Hauptfrau Veyra Dornfeld', detail: 'Befehligt die Torwache von Kaltenfurt und misstraut der Gruppe.', gmNotes: 'Hat die Gruppe absichtlich warten lassen, um Zeit für einen Boten zu gewinnen.',
      evidence: [{ start: 1520, quote: 'Ich bin Hauptfrau Dornfeld, und ihr kommt hier nicht rein.' }] }),
    base('p2', { entryType: 'quest', action: 'update', targetEntryId: 'e8', title: 'Das gestohlene Siegel',
      detail: 'Die Spur führt ins Hafenviertel von Kaltenfurt.', evidence: [{ start: 6210, quote: 'Das Zeichen ist dasselbe wie auf dem Siegel!' }] }),
    base('p3', { entryType: 'item', title: 'Runenschlüssel', detail: 'Trägt das Zeichen des Siegels. Bei Nyra.',
      evidence: [{ start: 6190, quote: 'Ich stecke den Schlüssel ein.' }] }),
    base('p4', { entryType: 'location', title: 'Die Ertrunkene Kapelle', detail: 'Halb versunkene Kapelle am Grauen Strom, nur bei Ebbe betretbar.',
      confidence: 0.6, flags: ['low_confidence', 'evidence_not_found'], evidence: [{ start: 5400, quote: 'Die Kapelle steht halb im Wasser.' }] }),
    // Geheimer Eintrag ist am Tisch aufgetaucht: nur ein Vorschlag, die SL gibt frei
    base('p6', { action: 'reveal', targetEntryId: 'e3', title: 'Der Rabe',
      detail: 'Anführer des Rabenzirkels, zeigt sich nie selbst. Seine Boten tragen Rabenfedern.',
      gmNotes: 'Ist Veyras Bruder.', suggestedVisibility: 'public', confidence: 0.85,
      visibilityReason: 'Der Name fiel am Tisch: Die Gruppe hat einen Boten mit Rabenfeder gestellt.',
      evidence: [{ start: 7310, quote: 'Der Bote sagt, er dient dem Raben.' }] }),
    // Klingt wie „Meister Orrin Kalk“ (0.4.21: Vorschlag wird dort ergänzt statt doppelt angelegt)
    base('p7', { title: 'Orin Kalk', detail: 'Soll im Hafenviertel von Kaltenfurt gesehen worden sein.',
      evidence: [{ start: 6630, quote: 'Ein Glockengießer namens Orin? Der war letzte Woche am Hafen.' }] }),
    base('p5', { entryType: 'other', title: 'Bruder Anselm ist ein Vampir', detail: 'Wahrscheinlich ein Scherz am Tisch – an dieser Stelle wurde gelacht.',
      confidence: 0.2, flags: ['joke_suspected', 'low_confidence'], evidence: [{ start: 8030, quote: 'Anselm trinkt ja auch nie Wein … verdächtig!' }] })
  ];
}

export const proposals: Proposal[] = proposalsFor('s-c-grau-13');

export function speakersFor(): Speaker[] {
  return [
    { id: 'sp1', label: 'Stimme 1', speakingSeconds: 4210, sampleText: '„Ich bin Robin und leite heute die Runde.“', suggestedMemberId: 'm-robin', confidence: 0.95, source: 'intro_round',
      // Ab 0.4.21 drei Textproben je Stimme
      samples: [{ start: 12, text: '„Ich bin Robin und leite heute die Runde.“' }, { start: 1520, text: '„Ich bin Hauptfrau Dornfeld, und ihr kommt hier nicht rein.“' }, { start: 5400, text: '„Die Kapelle steht halb im Wasser.“' }] },
    { id: 'sp2', label: 'Stimme 2', speakingSeconds: 2380, sampleText: '„Jonas, ich spiele Thorwald, den Schmied.“', suggestedMemberId: 'm-jonas', confidence: 0.93, source: 'intro_round',
      samples: [{ start: 1804, text: '„Ich lege ihm die Hand auf die Stirn und spreche den Heilsegen.“' }, { start: 1830, text: '„Klar, ich seh mir den Wachmann an.“' }, { start: 5120, text: '„Ich bete leise für die Ertrunkenen.“' }],
      // Stimme 2 wird mit „Ilsabet“ angesprochen – vermutlich mit Stimme 3 vertauscht
      hint: { code: 'addressed_as', name: 'Ilsabet', memberId: 'm-lea', count: 4 } },
    { id: 'sp3', label: 'Stimme 3', speakingSeconds: 1970, sampleText: '„Lea hier – Ilsabet, die Heilerin.“', suggestedMemberId: 'm-lea', confidence: 0.72, source: 'intro_round',
      samples: [{ start: 2410, text: '„Ich hau mit dem Hammer drauf, bis das Schloss nachgibt.“' }, { start: 6190, text: '„Ich stecke den Schlüssel ein.“' }, { start: 6480, text: '„Ich, Thorwald, schwöre: Den Raben stellen wir noch vor dem Winter.“' }],
      hint: { code: 'self_named', name: 'Thorwald', memberId: 'm-jonas', count: 2 } },
    { id: 'sp4', label: 'Stimme 4', speakingSeconds: 2105, sampleText: '„Kemal. Bruder Anselm, immer noch durstig.“', suggestedMemberId: 'm-kemal', confidence: 0.88, source: 'intro_round' },
    { id: 'sp5', label: 'Stimme 5', speakingSeconds: 1640, sampleText: '„Warte, wer hat den Schlüssel eingesteckt?“', suggestedMemberId: null, confidence: 0.3, source: 'none' }
  ];
}

/** Abschrift, unsicher erkannte Namen und Stimmen je Session aus der Musterkampagne (sonst die festen Testdaten) */
export const transcripts: Record<string, TranscriptSegment[]> = {};
export const uncertainTerms: Record<string, UncertainTerm[]> = {};
export const speakerLists: Record<string, Speaker[]> = {};

export interface MockUpload {
  id: string;
  sessionId: string;
  signature: string;
  completed: boolean;
  files: { fileId: string; chunkCount: number; received: Set<number> }[];
}

export const uploads: Record<string, MockUpload> = {};


const inDays = (d: number, hourUtc: number) => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + d);
  t.setUTCHours(hourUtc, 0, 0, 0);
  return t.toISOString();
};

export const datePolls: DatePoll[] = [
  {
    id: 'poll-grau', campaignId: 'c-grau', status: 'open', note: 'Kapitel 14 – wer kann wann?', createdAt: inDays(-2, 10), chosenOptionId: null,
    options: [
      { id: 'o1', startsAt: inDays(8, 17), proposedByMemberId: 'm-robin', votes: [
        { memberId: 'm-robin', answer: 'yes' }, { memberId: 'm-jonas', answer: 'yes' }, { memberId: 'm-lea', answer: 'maybe' }, { memberId: 'm-kemal', answer: 'yes' }] },
      { id: 'o2', startsAt: inDays(10, 14), proposedByMemberId: 'm-lea', votes: [
        { memberId: 'm-lea', answer: 'yes' }, { memberId: 'm-jonas', answer: 'no' }, { memberId: 'm-sophie', answer: 'yes' }] },
      { id: 'o3', startsAt: inDays(15, 17), proposedByMemberId: 'm-sophie', votes: [
        { memberId: 'm-sophie', answer: 'yes' }, { memberId: 'm-kemal', answer: 'yes' }] }
    ]
  }
];

export const comments: Comment[] = [
  { id: 'k1', sessionId: 's-c-grau-12', authorMemberId: 'm-jonas', recipientMemberId: null,
    text: 'Kleine Ergänzung: Thorwald hat im Moor auch noch das Amulett der Hebamme eingesteckt.', createdAt: '2026-09-06T09:12:00Z', editedAt: null },
  { id: 'k2', sessionId: 's-c-grau-12', authorMemberId: 'm-sophie', recipientMemberId: null,
    text: 'Die Rabenrufe haben mich die ganze Woche nicht losgelassen.', createdAt: '2026-09-06T18:40:00Z', editedAt: null },
  { id: 'k3', sessionId: 's-c-grau-12', authorMemberId: 'm-robin', recipientMemberId: 'm-lea',
    text: 'Nur für dich: Ilsabet träumt in der Nacht nach dem Moor von einer Glocke unter Wasser.', createdAt: '2026-09-07T20:05:00Z', editedAt: null },
  { id: 'k4', sessionId: 's-c-drache-7', authorMemberId: 'm-mara', recipientMemberId: 'm-robin2',
    text: 'Ilvara bemerkt als Einzige, dass einer der Verfolger das Wappen ihrer Familie trägt.', createdAt: '2026-09-15T08:00:00Z', editedAt: null }
];

/** Eigene Titelbilder im Speicher: Kampagnen-ID → Bild */
export const coverImages: Record<string, { data: ArrayBuffer; type: string; updatedAt: string }> = {};

/** Gelesen-Marker des angemeldeten Nutzers (der echte Server führt sie pro Mitglied) */
export const seen = {
  chronicle: { 'c-grau': '2026-09-06T12:00:00Z', 'c-drache': '2026-09-01T00:00:00Z' } as Record<string, string>,
  bible: { 'c-grau': '2026-09-06T12:00:00Z', 'c-drache': '2026-09-01T00:00:00Z' } as Record<string, string>,
  // pro Kapitel; fehlt der Eintrag, gilt der Chronik-Marker der Kampagne
  comments: { 's-c-grau-12': '2026-09-06T12:00:00Z' } as Record<string, string>
};

// Charaktere (0.4.7): mitgebrachte Welt je Mitglied und Hinweise an die SL
export type WorldRecord = { id: string; version: number; proposalId: string | null; entryId: string | null; serverVersion: number | null };
/** memberId → (Eintrag der App → Stand auf dem Server) */
export const world: Record<string, Record<string, WorldRecord>> = {};
export const gmNotices: Record<string, GmNotice[]> = {
  // Testmodus (0.4.9): Brakk gehörte einem inzwischen gelöschten Konto – die SL entscheidet, was aus der Figur wird
  'c-grau': [
    { id: 'gn-brakk', code: 'character_orphaned', memberId: 'm-del', entryIds: ['pc-brakk'], createdAt: '2026-09-20T10:00:00Z' },
    // Ab 0.4.18: Jonas möchte Thorwalds Hintergrund auswerten lassen
    { id: 'gn-ca-jonas', code: 'character_analysis_pending', memberId: 'm-jonas', analysisId: 'ca-jonas', entryIds: [], createdAt: '2026-10-12T19:00:00Z' }
  ]
};

/** Auswertungen von Charakterbögen und Hintergründen (ab 0.4.18); phaseStartedAt nur im Testmodus */
export const characterAnalyses: (CharacterAnalysis & { phaseStartedAt: number })[] = [
  {
    id: 'ca-jonas', campaignId: 'c-grau', memberId: 'm-jonas', source: 'backstory', documentId: null, title: 'Thorwald',
    state: 'awaiting_gm', usesCloud: true, pageCount: null, pagesLimited: false, message: null, proposalCount: null,
    createdAt: '2026-10-12T19:00:00Z', decidedAt: null, phaseStartedAt: 0
  }
];

/** Charakterbilder im Speicher: Mitglieds-ID → Bild */
export const portraits: Record<string, { data: ArrayBuffer; type: string; updatedAt: string; thumb?: ArrayBuffer }> = {};

// Zwei Beispielbilder, damit man die Kreise im Testmodus sieht (einfache SVG-Zeichnungen)
const face = (bg: string, skin: string, hair: string, beard: boolean) =>
  new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="${bg}"/>` +
    `<rect x="70" y="300" width="160" height="100" rx="40" fill="#5a3b2a"/><circle cx="150" cy="170" r="80" fill="${skin}"/>` +
    `<path d="M70 160 Q150 40 230 160 Q220 90 150 80 Q80 90 70 160Z" fill="${hair}"/>` +
    (beard ? `<path d="M85 190 Q150 330 215 190 Q190 250 150 252 Q110 250 85 190Z" fill="${hair}"/>` : '') +
    `<circle cx="120" cy="170" r="8" fill="#2a2118"/><circle cx="180" cy="170" r="8" fill="#2a2118"/></svg>`).buffer as ArrayBuffer;
portraits['m-jonas'] = { data: face('#8a6423', '#e0b48c', '#b5562e', true), type: 'image/svg+xml', updatedAt: '2026-09-01T10:00:00Z' };
portraits['m-lea'] = { data: face('#3f5e3a', '#f1cfb0', '#2a2118', false), type: 'image/svg+xml', updatedAt: '2026-09-01T10:00:00Z' };

export const documents: (CampaignDocument & { phaseStartedAt: number; failNext?: boolean })[] = [];
/** Erkannter Text der Unterlagen (Seiten durch \f getrennt), ab 0.4.12 */
export const documentTexts: Record<string, string> = {};
/** Kapitelpläne der SL, ab 0.4.12 */
export const plans: ChapterPlan[] = [];

/** Beispielhafte Vorschläge aus einer Unterlage – der echte Server lässt hier die KI arbeiten */
export function proposalsForDocument(doc: CampaignDocument): Proposal[] {
  const handout = doc.kind === 'handout';
  const mixed = doc.kind === 'mixed';
  // Grundsatz: nur Handouts sind direkt öffentlich; bei „gemischt“ macht die KI nur einen Vorschlag
  const vis = () => (handout ? 'public' : 'gm_only') as 'public' | 'gm_only';
  const base = (id: string, p: Partial<Proposal>): Proposal => ({
    id: `${doc.id}-${id}`, sessionId: null, documentId: doc.id, entryType: 'npc', action: 'create', targetEntryId: null,
    title: '', detail: '', gmNotes: null, suggestedVisibility: 'gm_only', visibilityReason: null, confidence: 0.9, flags: [], evidence: [],
    decision: 'open', ...p
  });
  return [
    base('d1', { entryType: 'location', title: 'Kaltenfurt', detail: 'Hafenstadt am Grauen Strom mit rund 4000 Einwohnern; regiert von Graf Aldric.',
      gmNotes: handout ? null : 'Unter dem Hafenviertel liegen alte Schmugglertunnel, die der Rabenzirkel nutzt.',
      suggestedVisibility: vis(), publicSuggested: mixed, visibilityReason: mixed ? 'Allgemein bekannte Angaben zur Stadt; die Tunnel stehen im Abschnitt [SL].' : null,
      evidence: [{ page: 3, quote: 'Kaltenfurt, die Stadt der hundert Brücken …' }] }),
    base('d2', { title: 'Graf Aldric von Kaltenfurt', detail: 'Herrscher der Stadt, gilt als gerecht und kränklich.',
      gmNotes: handout ? null : 'Wird langsam vergiftet – von seinem eigenen Kämmerer.',
      suggestedVisibility: vis(), publicSuggested: mixed, visibilityReason: mixed ? 'Öffentliche Person; die Vergiftung ist als geheim markiert.' : null,
      evidence: [{ page: 5, quote: 'Der Graf zeigt sich nur noch selten auf dem Balkon.' }] }),
    base('d3', { entryType: 'faction', title: 'Der Rabenzirkel', detail: 'Geheimbund, der Informationen sammelt und verkauft.',
      gmNotes: handout ? null : 'Anführer ist Veyras Bruder; Ziel ist die Übernahme der Stadtwache.',
      suggestedVisibility: vis(), visibilityReason: mixed ? 'Die Spieler kennen den Zirkel bisher nur als Gerücht – deshalb geheim.' : null,
      evidence: [{ page: 7, quote: '[SL] Der Zirkel hat Augen in jeder Schenke.' }] }),
    // Ergänzung eines öffentlichen Eintrags: Neues aus SL-Unterlagen landet im geheimen Teil, der öffentliche bleibt unverändert
    base('d4', { action: 'update', targetEntryId: 'e2', title: 'Hedda',
      detail: handout ? 'Wirtin im Weidenkrug, schuldet Thorwald einen Gefallen. Stammt aus Kaltenfurt.' : 'Wirtin im Weidenkrug, schuldet Thorwald einen Gefallen.',
      gmNotes: handout ? null : 'Stammt aus Kaltenfurt. Ihr Bruder sitzt im Kerker des Grafen.',
      suggestedVisibility: 'public', flags: handout ? [] : ['contradicts_bible'],
      visibilityReason: mixed ? 'Hedda ist den Spielern schon bekannt; nur die neuen Geheimnisse sind SL-Wissen.' : null,
      evidence: [{ page: 9, quote: 'Hedda verließ Kaltenfurt nach dem großen Feuer.' }] })
  ];
}
