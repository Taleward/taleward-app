// Typen zur Schnittstelle docs/session-chronik-api.yaml. Bei Änderungen an der Schnittstelle hier nachziehen.

export type Role = 'gm' | 'player';
export type Visibility = 'public' | 'gm_only';
/** pc = Spielercharakter (ab 0.4.7, legt nur der Server an) */
export type EntryType = 'npc' | 'location' | 'quest' | 'item' | 'faction' | 'other' | 'pc';

export type ProcessingState =
  | 'created'
  | 'uploading'
  | 'queued'
  | 'transcribing'
  | 'awaiting_speakers'
  | 'summarizing'
  | 'awaiting_review'
  | 'published'
  | 'failed';

export interface ApiError {
  code: string;
  message: string;
  /** Zusätzliche Angaben je Fehlercode (ab 0.4.7), z. B. { serverVersion } bei character_version_stale */
  details?: Record<string, unknown>;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  /** Nur für die Person selbst (ab 0.4.0): bestätigte E-Mail */
  email?: string | null;
  /** Eingetragen, noch nicht bestätigt */
  emailPending?: string | null;
  /** false bei Konten, die nur über einen Anmeldedienst angelegt wurden */
  hasPassword?: boolean;
  /** Verbundene Anmeldedienste */
  providers?: AuthProviderId[];
  /** Zuletzt zugestimmte Fassung der Nutzungsbedingungen (ab 0.4.22); null = noch nie */
  termsAcceptedVersion?: number | null;
  termsAcceptedAt?: string | null;
  /** Darf eigene Kampagnen anlegen (ab 0.4.23, zählt nur bei ServerInfo.gmApproval required); fehlt = wie granted */
  gmPermission?: 'granted' | 'none' | 'pending' | 'rejected';
  gmDecidedAt?: string | null;
}

export type AuthProviderId = 'google' | 'discord' | 'apple' | 'microsoft';

/** Ergebnis von POST /auth/oidc/exchange (ab 0.4.0) */
export interface OidcExchange {
  status: 'ok' | 'register' | 'email_in_use';
  accessToken?: string | null;
  expiresAt?: string | null;
  user?: User;
  registrationToken?: string | null;
  suggestedDisplayName?: string | null;
  email?: string | null;
  provider?: string | null;
}

export interface Member {
  id: string;
  userId: string;
  displayName: string;
  characterName: string | null;
  role: Role;
  /** Stehende Zustimmung zu Aufnahmen in dieser Kampagne, selbst in der App gegeben (ab 0.3.2). null = keine */
  recordingConsentAt?: string | null;
  /** Kurzbeschreibung des Charakters, für alle sichtbar; darf in die Zusammenfassung einfließen (ab 0.3.2) */
  characterSummary?: string | null;
  /** Hintergrund nur für die SL und die Person selbst; der Server lässt das Feld bei anderen weg (ab 0.3.2) */
  characterBackstory?: string | null;
  /** Gesetzt, wenn ein Charakterbild hochgeladen ist; dient als Cache-Schlüssel (ab 0.3.2) */
  portraitUpdatedAt?: string | null;
  /** Gesetzt, wenn das Konto gelöscht wurde; das Mitglied bleibt als „Gelöschtes Konto“ stehen (ab 0.3.10) */
  deletedAt?: string | null;
  /** Hat die Kampagne verlassen oder wurde entfernt; bleibt wie ein gelöschtes Konto stehen (ab 0.4.5) */
  leftAt?: string | null;
  /** Charakter aus der Sammlung der App (ab 0.4.7); null bei Altbestand und Gästen */
  characterId?: string | null;
  characterVersion?: number | null;
  characterStatus?: CharacterStatus | null;
  characterNickname?: string | null;
  /** „Meine Charakterdaten dürfen bei einem Umzug mit“ (ab 0.4.8); für alle sichtbar, null = nein */
  moveConsentAt?: string | null;
  /** Platz aus einem Umzug, noch nicht besetzt (ab 0.4.8); userId ist dann "" */
  openSeat?: boolean;
}

export type CharacterStatus = 'active' | 'retired' | 'deceased';

/** Serverkopie der Stammdaten eines Charakters aus der Sammlung (ab 0.4.7) */
export interface Character {
  id: string;
  version: number;
  name: string;
  nickname?: string | null;
  summary?: string | null;
  backstory?: string | null;
  system?: string | null;
  status: CharacterStatus;
  statusChangedAt?: string | null;
}

/** Mitgebrachter Welt-Eintrag (ab 0.4.7) */
export interface WorldEntryIn {
  id: string;
  version: number;
  type: Exclude<EntryType, 'pc'>;
  name: string;
  summary: string;
  secret: boolean;
  /** Wie der Eintrag zum Charakter steht, z. B. „Schwester von Litha“ – nur Anzeige (ab 0.4.19) */
  relation?: string | null;
}

export interface WorldEntryStatus {
  id: string;
  proposalId: string | null;
  entryId: string | null;
  state: 'pending' | 'accepted' | 'rejected' | 'unchanged';
  serverVersion: number | null;
}

/** Abschrift der Erlebnisse eines Charakters in einer Kampagne (ab 0.4.7) */
export interface Chronicle {
  server: { name: string; url: string; version: string };
  campaign: { id: string; title: string; system: string | null; language: 'de' | 'en'; createdAt: string; archivedAt: string | null };
  member: { id: string; role: Role; joinedAt: string; leftAt: string | null; characterId: string | null; characterVersion: number | null };
  sessions: {
    id: string;
    number: number;
    title: string | null;
    playedAt: string;
    attended: boolean;
    recap: { title: string; text: string; openThreads: string[]; publishedAt: string } | null;
  }[];
  mentions: { entryId: string; entryType: EntryType; name: string; summary: string; updatedAt: string }[];
  broughtEntries: { originEntryId: string; entryId: string; entryType: EntryType; name: string; summary: string; hidden: boolean; updatedAt: string }[];
  comments: { sessionId: string; text: string; createdAt: string }[];
  takenAt: string;
}

/** Hinweis an die SL (ab 0.4.7) */
export interface GmNotice {
  id: string;
  /**
   * seat_claimed (ab 0.4.8): jemand hat per Beitritt mit Charakter einen offenen Platz eingenommen.
   * character_orphaned (ab 0.4.9): ein Spieler ist ausgetreten; entryIds = seine Figuren (pc ohne Halter).
   * member_joined (ab 0.4.14): jemand ist beigetreten oder wieder eingetreten (memberId).
   * character_analysis_pending (ab 0.4.18): jemand möchte Bogen oder Hintergrund auswerten lassen (analysisId).
   */
  code: 'hidden_entries_for_newcomer' | 'seat_claimed' | 'character_orphaned' | 'member_joined' | 'character_analysis_pending' | string;
  analysisId?: string | null;
  memberId: string | null;
  entryIds: string[];
  createdAt: string;
}

export interface CampaignSummary {
  id: string;
  title: string;
  /** Abgeschlossen: nur noch lesen, keine neuen Kapitel (ab 0.4.5) */
  archivedAt?: string | null;
  /** Verein/Gruppe, zu der die Kampagne gehört (ab 0.3.2) */
  organization?: { id: string; name: string } | null;
  myRole: Role;
  myCharacterName: string | null;
  memberCount: number;
  publishedSessionCount: number;
  pendingReviewCount: number;
  /** Offene Vorschläge aus mitgebrachter Welt, nur für die SL (ab 0.4.7) */
  openCharacterProposals?: number;
  lastPublishedAt: string | null;
  /** Mitgeliefertes Titelbild (ID aus src/covers/presets.tsx), ab 0.3.2 */
  coverPreset?: string | null;
  /** Gesetzt, wenn ein eigenes Titelbild hochgeladen ist (es hat dann Vorrang); dient auch als Cache-Schlüssel */
  coverImageUpdatedAt?: string | null;
  /** Ungelesenes seit meinem letzten Besuch (ab 0.3.2) */
  unread?: Unread;
  /** Festgelegter Termin der nächsten Runde (ab 0.3.2) */
  nextSessionAt?: string | null;
  /** Läuft gerade eine Terminabstimmung, bei der ich noch nicht überall abgestimmt habe? (ab 0.3.2) */
  datePollNeedsMyVote?: boolean;
}

export interface Unread {
  /** Neu veröffentlichte Recaps seit dem letzten Öffnen der Chronik */
  recaps: number;
  /** Neue Kommentare anderer (öffentlich oder privat an mich) in Kapiteln, deren Kommentare ich zuletzt geöffnet habe */
  comments: number;
  /** Neue oder geänderte Bibeleinträge (die ich sehen darf, nicht von mir) seit dem letzten Öffnen der Bibel */
  bible: number;
}

/** Verweis auf ein anderes Programm oder eine Seite (ab 0.4.13); öffnet sich außerhalb von Taleward */
export interface Link {
  id: string;
  label: string;
  url: string;
  /** true = auch Spieler sehen den Link (nicht bei Szenen) */
  shared?: boolean;
}

export interface Campaign extends CampaignSummary {
  description: string;
  /** Links der Kampagne (ab 0.4.13); Spieler bekommen nur geteilte */
  links?: Link[];
  /** Spielsystem; null wird wie 'other' behandelt (ab 0.3.3) */
  system?: GameSystem | null;
  /** Freier Name des Systems, v. a. bei 'other' (ab 0.3.3) */
  systemName?: string | null;
  /** Darf der Server für diese Kampagne den externen Transkriptionsdienst nutzen? Nur SL (ab 0.3.4) */
  allowExternalTranscription?: boolean;
  /** Darf der Server Recap und Vorschläge dieser Kampagne über eine Cloud-API erstellen? Nur SL (ab 0.3.10) */
  allowCloudSummary?: boolean;
  /** Dürfen Mitglieder Charakterbogen und Hintergrund auswerten lassen? Nur SL ändert, alle sehen es (ab 0.4.18) */
  allowCharacterAnalysis?: boolean;
  /** Geltende Grenzen für Charakterbögen (ab 0.4.19); fehlt = 3 Bögen, 20 Seiten, aber ohne Zahlen anzeigen */
  characterSheetLimits?: { maxSheets: number; maxPages: number } | null;
  /** Sprache der Runde: Transkription, Recaps, Vorschläge (ab 0.3.2) */
  language?: 'de' | 'en';
  /** Hintergrund der Spielwelt für alle Mitspielenden (ab Schnittstelle 0.3.2) */
  worldInfo?: string | null;
  /** Namenshilfe für die Transkription – nur SL (ab 0.4.6) */
  hotwords?: string[];
  /** Hinweise an die SL (ab 0.4.7) */
  gmNotices?: GmNotice[];
  members: Member[];
}

/**
 * Anwesende Person. Entweder ein Mitglied (memberId) oder ein Gast ohne Konto (guestName, ab 0.3.2).
 * consentSource: "app" = stehende Zustimmung des Mitglieds in seiner eigenen App,
 * "on_site" = die Person hat vor Ort selbst auf dem Gerät der SL bestätigt (nur für diese Session).
 */
export interface Attendee {
  memberId?: string;
  guestName?: string;
  consent: boolean;
  consentSource?: 'app' | 'on_site';
  consentAt?: string | null;
}

export interface SessionSummary {
  id: string;
  number: number;
  title: string | null;
  playedAt: string;
  state: ProcessingState;
  /** Neue Kommentare in diesem Kapitel seit meinem letzten Besuch (ab 0.3.2) */
  unreadComments?: number;
}

export interface Session extends SessionSummary {
  campaignId: string;
  source: 'table' | 'discord' | null;
  attendees: Attendee[];
  durationSeconds: number | null;
  audioDeletedAt: string | null;
  /** Womit transkribiert wurde (ab 0.3.4) */
  transcriptionEngine?: 'local' | 'external' | null;
  publishedAt: string | null;
}

export interface ProcessingStatus {
  state: ProcessingState;
  progress: number | null;
  queuePosition: number | null;
  /**
   * Hinweis beim Warten oder Fehlertext. Ab 0.4.6 in summarizing ein Schlüssel wie „summarizing.review“,
   * den die App übersetzt (siehe statusMessage in i18n).
   */
  message: string | null;
  updatedAt: string;
  /** Geschätzte Restdauer in Sekunden, z. B. nach erneuter Transkription (ab 0.4.6) */
  estimatedSeconds?: number | null;
}

export interface Speaker {
  id: string;
  label: string;
  speakingSeconds: number;
  sampleText: string;
  suggestedMemberId: string | null;
  confidence: number;
  source: 'intro_round' | 'voice_match' | 'discord_track' | 'none';
  /** Als Gast benannt (ab 0.4.7) */
  assignedGuestName?: string | null;
  /** Bestätigte Zuordnung nach der Bestätigung (ab 0.4.10); null = Gast oder ignoriert, fehlt = noch nicht bestätigt */
  assignedMemberId?: string | null;
  /** Bis zu drei Textproben mit eigener Hörprobe (…/sample?index=i), ab 0.4.21; fehlt = nur sampleText */
  samples?: SpeakerSample[];
  /** Anrede oder Selbstnennung spricht gegen die Zuordnung (ab 0.4.21) */
  hint?: SpeakerHint | null;
}

export interface SpeakerSample {
  start: number;
  end?: number | null;
  text: string;
}

export interface SpeakerHint {
  /** addressed_as = wird oft mit diesem Namen angesprochen; self_named = nennt sich selbst so */
  code: 'addressed_as' | 'self_named' | string;
  name: string;
  /** Mitglied, dessen Figur so heißt */
  memberId: string;
  count: number;
}

/** Vorschau einer Einladung ohne Anmeldung (ab 0.4.10) */
export interface InvitePreview {
  campaignTitle: string;
  seatCharacterName?: string | null;
  expiresAt?: string | null;
}

export type ProposalDecision = 'open' | 'accepted' | 'rejected';
/** evidence_not_found: kein Zitat im Transkript gefunden (ab 0.4.6) */
export type ProposalFlag = 'joke_suspected' | 'low_confidence' | 'contradicts_bible' | 'evidence_not_found';

export interface Proposal {
  id: string;
  /** Aus einer Session – oder null, wenn der Vorschlag aus einer SL-Unterlage stammt */
  sessionId: string | null;
  /** Aus einer hochgeladenen Unterlage (ab 0.3.2) */
  documentId?: string | null;
  /** Herkunft (ab 0.4.7); fehlt bei älteren Servern */
  source?: 'session' | 'document' | 'character';
  /** Bei source character: Charakter, Eintrag der App und einreichendes Mitglied (ab 0.4.7) */
  originCharacterId?: string | null;
  originEntryId?: string | null;
  submittedByMemberId?: string | null;
  /** Aus welcher Auswertung von Bogen oder Hintergrund (ab 0.4.18); null = mitgebrachte Welt */
  analysisId?: string | null;
  /** Bei mitgebrachter Welt: wie der Eintrag zum Charakter steht (ab 0.4.19) */
  relation?: string | null;
  entryType: EntryType;
  /** create = neuer Eintrag, update = ergänzt, reveal = geheimer Eintrag ist am Tisch bekannt geworden (ab 0.3.5) */
  action: 'create' | 'update' | 'reveal';
  targetEntryId: string | null;
  title: string;
  /** Was Spieler wissen (öffentlicher Teil) */
  detail: string;
  /** Geheimer Teil für die SL (ab 0.3.2) */
  gmNotes?: string | null;
  suggestedVisibility: Visibility;
  /** Bei suggestedVisibility public: vor diesen Mitgliedern verborgen, wird beim Übernehmen an den Eintrag weitergegeben (ab 0.3.7) */
  hiddenFromMemberIds?: string[];
  /**
   * Nur bei „gemischten“ Unterlagen: Die KI hält den Eintrag für Spielerwissen. Er kommt trotzdem als gm_only;
   * die SL gibt ihn mit einem Tipp frei (ab 0.3.2).
   */
  publicSuggested?: boolean;
  /** Begründung der KI für die vorgeschlagene Sichtbarkeit (ab 0.3.2) */
  visibilityReason?: string | null;
  confidence: number;
  flags: ProposalFlag[];
  /** Belegstellen: bei Sessions Sekunden (start), bei Unterlagen Seitenzahl (page) */
  evidence: { start?: number; page?: number; quote: string }[];
  decision: ProposalDecision;
  /** Nur bei create: klingt wie ein vorhandener Eintrag (ab 0.4.21) */
  match?: ProposalMatch | null;
  /** Die SL ergänzt lieber diesen Eintrag statt einen neuen anzulegen (ab 0.4.21) */
  mergeIntoEntryId?: string | null;
}

export interface ProposalMatch {
  entryId: string;
  /** Name des Eintrags */
  name: string;
  /** Welcher Name oder Alias passte */
  matchedName?: string;
  entryType: EntryType;
  kind: 'sound' | 'spelling' | 'part_name' | string;
}

export interface Recap {
  sessionId: string;
  number: number;
  title: string;
  text: string;
  openThreads: string[];
  publishedAt: string | null;
  /** Prüfteil – nur für die SL, Spieler bekommen das Feld nicht (ab 0.4.6) */
  review?: RecapReview;
  /** Offener Korrektur-Entwurf aus einem Hinweis der SL (ab 0.4.15, nur SL) */
  revision?: RecapRevision | null;
  /** Teile eines langen Kapitels mit Zwischenüberschrift (ab 0.4.17); fehlt oder leer = ohne Teile */
  parts?: RecapPart[];
  /** Nur SL (ab 0.4.21): Das Kapitel nennt Geheimes */
  gmWarnings?: RecapGmWarning[];
}

export interface RecapGmWarning {
  /** secret_entry_name = Name eines Eintrags, den nicht alle kennen; secret_wording = wörtlich aus geheimem Text */
  code: 'secret_entry_name' | 'secret_wording' | string;
  entryIds: string[];
  names?: string[];
  paragraphs?: number[];
}

/** Ein Teil beginnt bei Absatz firstParagraph (0-basiert) und reicht bis vor den nächsten (ab 0.4.17) */
export interface RecapPart {
  title: string;
  firstParagraph: number;
}

/** Korrektur per Hinweis (ab 0.4.15): der Server schreibt nur betroffene Absätze neu, die SL übernimmt oder verwirft */
export interface RecapRevision {
  state: 'running' | 'ready' | 'failed';
  message?: string | null;
  createdAt?: string;
  changes: { index: number; before: string; after: string }[];
  notes: { text: string; applied: boolean; indexes: number[] }[];
}

export type ReviewVerdict = 'supported' | 'partial' | 'unsupported' | 'contradicted' | 'off_game' | 'unchecked';

/** Gegenprüfung des Recaps, Absatz = durch Leerzeile getrennter Block in Recap.text (ab 0.4.6) */
export interface RecapReview {
  state: 'pending' | 'done' | 'skipped';
  /** Recap wurde nach der Prüfung bearbeitet – Angaben können verrutscht sein */
  stale?: boolean;
  checkedAt: string | null;
  model: string | null;
  revised: boolean;
  report?: { total: number; supported: number; partial: number; unsupported: number; contradicted: number; offGame: number };
  paragraphs: {
    index: number;
    verdict: ReviewVerdict;
    note: string | null;
    evidence: { start: number; end: number | null; quote: string; speakerMemberId: string | null }[];
  }[];
}

/** Unsicher erkannter Name oder Begriff (ab 0.4.6) */
export interface UncertainTerm {
  id: string;
  heard: string;
  alternatives: string[];
  occurrences: number;
  confidence: number;
  examples: { start: number; quote: string }[];
  suggestedEntryId: string | null;
  suggestedMemberId: string | null;
}

export interface UncertainTerms {
  audioAvailable: boolean;
  audioDeletesAt: string | null;
  /** Wie oft noch erneut transkribiert werden darf */
  retranscribesLeft?: number;
  terms: UncertainTerm[];
}

/** Abschnitt des Transkripts (nur SL) */
export interface TranscriptSegment {
  start: number;
  end: number;
  speakerId: string;
  memberId: string | null;
  text: string;
}

export interface Correction {
  heard: string;
  /** Leer = Begriff so lassen, nur nicht mehr melden */
  correct: string;
  addToHotwords?: boolean;
}

export interface EntryInput {
  type: EntryType;
  name: string;
  summary: string;
  status?: 'active' | 'done' | null;
  holderMemberId?: string | null;
  /** Andere Namen oder Schreibweisen („Auch genannt“, ab 0.4.21), sichtbar wie der Name */
  aliases?: string[];
  visibility: Visibility;
  /** Geheimer Teil, nur für die SL; der Server lässt ihn für Spieler weg (ab 0.3.2) */
  gmNotes?: string | null;
  /**
   * Nur bei visibility public: vor diesen Mitgliedern verborgen („Wer weiß was“). Leer = alle sehen es.
   * Spieler bekommen das Feld nie; der Server liefert ihnen verborgene Einträge gar nicht aus (ab 0.3.6).
   */
  hiddenFromMemberIds?: string[];
  /** Links am Eintrag (ab 0.4.13, höchstens 3); Spieler bekommen nur geteilte */
  links?: Link[];
}

export interface Entry extends EntryInput {
  id: string;
  campaignId: string;
  firstSessionNumber: number | null;
  lastSessionNumber: number | null;
  mentions: { sessionNumber: number; note: string }[];
  updatedAt: string;
  /** Ab 0.4.9, nur für die SL: NSC, der aus der Figur dieses ausgetretenen Mitglieds entstanden ist */
  formerHolderMemberId?: string | null;
}

export interface UploadCreated {
  uploadId: string;
  chunkSizeBytes: number;
  files: { fileId: string; fileName: string; chunkCount: number }[];
}

export interface VoiceProfile {
  status: 'none' | 'processing' | 'ready' | 'failed';
  createdAt: string | null;
  sampleSeconds: number | null;
  learnFromSessions: boolean;
  learnedSessionCount: number;
  message: string | null;
}

// ---- Ab Schnittstelle 0.3.2 ----

export type VoteAnswer = 'yes' | 'maybe' | 'no';

export interface DateOption {
  id: string;
  startsAt: string;
  proposedByMemberId: string;
  votes: { memberId: string; answer: VoteAnswer }[];
}

export interface DatePoll {
  id: string;
  campaignId: string;
  status: 'open' | 'closed' | 'cancelled';
  note: string | null;
  createdAt: string;
  chosenOptionId: string | null;
  options: DateOption[];
}

export interface Comment {
  id: string;
  sessionId: string;
  authorMemberId: string;
  /** null = für alle in der Kampagne; sonst private Nachricht, sichtbar nur für Absender und Empfänger */
  recipientMemberId: string | null;
  text: string;
  createdAt: string;
  editedAt: string | null;
}

/** character_sheet = Charakterbogen eines Mitglieds (ab 0.4.7; nur SL und Urheberin; Auswertung ab 0.4.18 nach Zustimmung der SL) */
export type DocumentKind = 'handout' | 'gm' | 'mixed' | 'character_sheet';

/** Hochgeladene SL-Unterlage (ab 0.3.2), nur für die SL sichtbar */
export interface CampaignDocument {
  id: string;
  campaignId: string;
  title: string;
  fileName: string;
  kind: DocumentKind;
  sizeBytes: number;
  pageCount: number | null;
  state: 'queued' | 'processing' | 'awaiting_review' | 'done' | 'failed';
  progress: number | null;
  message: string | null;
  proposalCount: number;
  openProposalCount: number;
  /** Vorschlag für den Welt-Hintergrund aus den öffentlichen Teilen, falls sinnvoll */
  worldInfoSuggestion: string | null;
  /** Wer hochgeladen hat (ab 0.4.7) */
  uploadedByMemberId?: string | null;
  /** Bei character_sheet die zugehörige Auswertung (ab 0.4.18) */
  analysisId?: string | null;
  createdAt: string;
}

/** Auswertung eines Charakterbogens oder Hintergrunds (ab 0.4.18); Spieler sehen nur den Stand ihrer eigenen */
export interface CharacterAnalysis {
  id: string;
  campaignId: string;
  memberId: string;
  source: 'sheet' | 'backstory';
  documentId: string | null;
  title: string;
  state: 'awaiting_gm' | 'rejected' | 'queued' | 'processing' | 'done' | 'failed';
  usesCloud: boolean;
  pageCount: number | null;
  pagesLimited: boolean;
  message: string | null;
  /** Nur für die SL, sobald done */
  proposalCount: number | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Text einer Unterlage je Seite (ab 0.4.12) */
export interface DocumentText {
  pages: { page: number; text: string }[];
}

/** Szene eines Kapitelplans (ab 0.4.12) */
export interface PlanScene {
  id: string;
  title: string;
  notes?: string | null;
  entryIds?: string[];
  state?: 'open' | 'played' | 'skipped';
  /** Links an der Szene (ab 0.4.13, höchstens 3) */
  links?: Link[];
}

export interface ChapterPlanInput {
  title?: string;
  sessionNumber?: number | null;
  state?: 'draft' | 'ready' | 'played';
  notes?: string | null;
  scenes?: PlanScene[];
  names?: string[];
  documentIds?: string[];
  /** Notizen während der Runde (ab 0.4.13) */
  tableNotes?: string | null;
}

/** Kapitelplan (ab 0.4.12) – nur für die SL, fließt nie in Kapitel oder Vorschläge (nur names als Schreibhilfe) */
export interface ChapterPlan {
  id: string;
  campaignId: string;
  title: string;
  sessionNumber: number | null;
  state: 'draft' | 'ready' | 'played';
  notes: string | null;
  scenes: PlanScene[];
  names: string[];
  documentIds: string[];
  /** Notizen während der Runde (ab 0.4.13; fehlt bei älteren Servern) */
  tableNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Angaben zu einem Cloud-Anbieter, für alle am Tisch sichtbar (ab 0.4.11) */
export interface CloudProviderInfo {
  /** Kennung wie in cloudSummary bzw. externalTranscription, z. B. "mistral" */
  id: string;
  /** Anzeigename ohne Sprachbezug, z. B. "Mistral AI" */
  name: string;
  /** Verarbeitung in der EU oder außerhalb */
  region: 'eu' | 'non_eu';
  /** Land der Verarbeitung als ISO-3166-Code, z. B. "FR"; null = unbekannt */
  country?: string | null;
}

/** Öffentliche Angaben eines Servers, abrufbar ohne Anmeldung (ab 0.3.2) */
export interface ServerInfo {
  name: string;
  operator: string;
  contact: string | null;
  apiVersion: string;
  /**
   * Wie man ein Konto bekommt: Kampagneneinladung, allgemeiner Registrierungscode (ab 0.4.23), offen (ab 0.4.23) oder gar
   * nicht. Unbekannte Werte wie invite_only (siehe registrationMode).
   */
  registration: 'invite_only' | 'code' | 'open' | 'closed' | (string & {});
  /** Eigene Kampagnen nur mit SL-Freigabe (ab 0.4.23); fehlt = none */
  gmApproval?: 'required' | 'none';
  /** Unterstützte Anmeldearten; später z. B. 'oidc' für einen zentralen Anmeldedienst oder 'passkey' */
  authMethods: string[];
  privacyPolicyUrl: string | null;
  /** Impressum des Betreibers (ab 0.4.22) */
  legalNoticeUrl?: string | null;
  /** Nutzungsbedingungen des Betreibers (ab 0.4.22 immer gesetzt) */
  termsUrl?: string | null;
  /** Fassung der Nutzungsbedingungen; höher als User.termsAcceptedVersion = neu zustimmen (ab 0.4.22) */
  termsVersion?: number | null;
  /** Mindestalter für ein eigenes Konto (darunter nur mit Zustimmung der Eltern) */
  minAge: number;
  /** null = nur eigene Transkription; sonst Name des freigegebenen externen Anbieters (ab 0.3.4) */
  externalTranscription?: string | null;
  /** Eingerichtete Anmeldedienste (ab 0.4.0) */
  authProviders?: { id: AuthProviderId; name: string }[];
  /**
   * Wie lange das Session-Audio auf dem Server bleibt (ab 0.4.4): bis zur Freigabe des Recaps, höchstens maxDays Tage,
   * oder sofort nach der Transkription gelöscht. Die App nennt das im Einwilligungstext.
   */
  audioRetention?: { mode: 'until_release' | 'immediate'; maxDays: number | null } | null;
  /** Server kann E-Mails verschicken – „Passwort vergessen?“ anbieten (ab 0.4.0) */
  passwordReset?: boolean;
  /** fallback = externe Transkription erst nach 24 h ohne Worker; primary = Aufnahmen gehen direkt dorthin (ab 0.3.10) */
  externalTranscriptionMode?: 'fallback' | 'primary' | null;
  /** Anbieter der Cloud-Zusammenfassung (z. B. "mistral"); null = nur lokales Modell (ab 0.3.10) */
  cloudSummary?: string | null;
  /** Wer die Kapitel schreibt bzw. transkribiert: Name, EU oder nicht, Land (ab 0.4.11) */
  cloudSummaryInfo?: CloudProviderInfo | null;
  externalTranscriptionInfo?: CloudProviderInfo | null;
  /** Ältere Apps werden abgewiesen (426 app_outdated) (ab 0.3.9) */
  minAppVersion?: string | null;
  /** Neueste verfügbare App-Version – die App zeigt dann „Neue Version“ (ab 0.3.9) */
  latestAppVersion?: string | null;
  /** Wo es die App gibt (APK, später Store); auch für die Einladungsseite (ab 0.3.9) */
  appDownloadUrl?: string | null;
  /** Kurz, was neu ist (ab 0.3.9) */
  releaseNotes?: string | null;
  /** SHA-256 (hex) der APK unter appDownloadUrl, wenn der Server sie selbst anbietet (ab 0.4.1) */
  appDownloadSha256?: string | null;
  appDownloadSizeBytes?: number | null;
  /** Adresse für andere Geräte, z. B. http://192.168.178.24:8000 – für Einladungen aus dem Programmfenster (ab 0.4.16) */
  publicUrl?: string | null;
  /** Feste Kennung des Servers, auch wenn sich seine Adresse ändert (ab 0.4.16) */
  serverId?: string | null;
}

/** Verein, Laden oder Gruppe – oberste Ebene über den Kampagnen (ab 0.3.2) */
export interface Organization {
  id: string;
  name: string;
  myRole: 'admin' | 'member';
}

/** Verarbeitungsaufwand einer Kampagne in einem Monat (nur SL, ab 0.3.2) */
export interface Usage {
  month: string;
  sessions: number;
  audioSeconds: number;
  documents: number;
  /** Geschätzte Kosten in Cent (API-Kosten des Sprachmodells, ggf. Rechenzeit) */
  costEstimateCents: number | null;
  /** Wer zahlt: die SL (Betreiber der Kampagne) oder die Organisation */
  billedTo: 'gm' | 'organization';
}

/** Spielsystem der Kampagne (ab 0.3.3). Für die großen Systeme hat der Server eine Begriffsliste als Schreibhilfe. */
export type GameSystem = 'dsa' | 'dnd' | 'pathfinder' | 'cthulhu' | 'shadowrun' | 'splittermond' | 'other';

/** Export einer Kampagne als Datei taleward-kampagne/1 (ab 0.4.8) */
export interface CampaignExport {
  id: string;
  state: 'queued' | 'processing' | 'ready' | 'failed';
  progress?: number | null;
  sizeBytes?: number | null;
  expiresAt?: string | null;
  /** Bei ready: Adresse mit Download-Schlüssel, relativ zur API-Basis, ohne Token nutzbar */
  downloadUrl?: string | null;
  consentedMemberIds: string[];
  message?: string | null;
  createdAt: string;
}

/** Import einer Datei taleward-kampagne/1 (ab 0.4.8) */
export interface ImportStatus {
  id: string;
  state: 'uploading' | 'processing' | 'done' | 'failed';
  progress?: number | null;
  missingChunks?: number[];
  campaignId?: string | null;
  openSeats?: number | null;
  /** Bei failed: import_format, import_too_large, import_unsafe, import_version – oder Klartext */
  message?: string | null;
}

/** Gelöschtes Konto: nicht mehr als Person anbieten (Anwesende, Empfänger, Auswahl) */
export function isDeletedMember(m: Member): boolean {
  return !!m.deletedAt || m.userId === '' || !!m.leftAt || !!m.openSeat;
}
