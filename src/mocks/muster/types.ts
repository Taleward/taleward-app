/*
 * Musterkampagne „Die leisen Wasser“ – Aufbau der Inhalte. Die Texte stehen je Sprache in de-a/de-b bzw. en-a/en-b,
 * gleich aufgebaut; seed.ts macht daraus die Daten des Musterservers. Alles ist erfunden.
 */
import type { CharacterStatus, DocumentKind, EntryType, ProposalFlag, ReviewVerdict, Speaker, VoteAnswer } from '../../api/types';

/** Personen am Tisch: Anja leitet, Lea spielt Mara, Tom spielt Tavin, Sina spielt Juna (ab Kapitel 4) */
export type Who = 'anja' | 'lea' | 'tom' | 'sina';
export type Player = Exclude<Who, 'anja'>;

/** Zeit in der Aufnahme als „hh:mm:ss“ */
export type Time = string;

export interface MusterChapter {
  title: string;
  /** Spieltag, 19 Uhr Ortszeit */
  date: string;
  minutes: number;
  present: Who[];
  /** Gast ohne Konto, hat vor Ort selbst zugestimmt */
  guest?: string;
  recap: string;
  threads: string[];
  gmNote: string;
}

export interface MusterEntry {
  key: string;
  type: EntryType;
  name: string;
  summary: string;
  gmNotes?: string;
  gmOnly?: boolean;
  hiddenFrom?: Player[];
  status?: 'active' | 'done';
  holder?: Player;
  /** [Kapitel, Notiz] */
  mentions?: [number, string][];
}

export interface MusterProposal {
  key: string;
  action: 'create' | 'update' | 'reveal';
  type: EntryType;
  /** Schlüssel des betroffenen Bibeleintrags bei update/reveal */
  target?: string;
  title: string;
  detail: string;
  gmNotes?: string;
  gmOnly?: boolean;
  /** Bei update: neue Liste (leer = vor niemandem mehr verborgen) */
  hiddenFrom?: Player[];
  confidence: number;
  flag?: ProposalFlag;
  /** Grund für das Kennzeichen bzw. für eine abgelehnte Entscheidung */
  reason?: string;
  /** Warum die vorgeschlagene Sichtbarkeit passt */
  visibilityReason?: string;
  /** Kapitel: [Zeit, Zitat]; Unterlagen: [Seite, Zitat] */
  evidence: [Time | number, string][];
  decision?: 'open' | 'accepted' | 'rejected';
}

export interface MusterReview {
  verdict: ReviewVerdict;
  note: string;
  /** [Zeit, Person, Zitat] */
  evidence: [Time, Who, string][];
}

export interface MusterTerm {
  heard: string;
  alternatives: string[];
  occurrences: number;
  confidence: number;
  entry?: string;
  example: [Time, string];
}

export interface MusterSpeaker {
  who: Who;
  source: Speaker['source'];
  confidence: number;
  minutes: number;
  sample: string;
}

export interface MusterDocument {
  key: string;
  title: string;
  fileName: string;
  kind: DocumentKind;
  pages: number;
  createdAt: string;
  state: 'done' | 'awaiting_review';
  /** Voller Text der Unterlage (für spätere PDFs und Aufnahmen) */
  text: string;
  worldInfoSuggestion?: string;
  proposals: MusterProposal[];
}

export interface MusterWorldItem {
  key: string;
  type: Exclude<EntryType, 'pc'>;
  name: string;
  summary: string;
  secret: boolean;
  /** Wie der Eintrag zum Charakter steht (ab 0.4.19) */
  relation?: string;
  /** pending = Vorschlag offen, accepted = als Bibeleintrag übernommen (Schlüssel) */
  state: 'pending' | 'accepted';
  entry?: string;
  hiddenFrom?: Player[];
}

export interface MusterCharacter {
  key: string;
  name: string;
  nickname?: string;
  summary: string;
  backstory: string;
  system?: string;
  status: CharacterStatus;
  notes: string;
  /** Wappen statt Gesicht: Form und Farbe */
  emblem: { shape: 'reeds' | 'quill' | 'satchel' | 'mortar' | 'spoon' | 'barrier'; color: string };
  world: MusterWorldItem[];
  /** Spielt in der Musterkampagne; Hintergrund dann leer, er kommt aus members */
  inCampaign?: boolean;
}

export interface MusterPlan {
  title: string;
  notes: string;
  scenes: { key: string; title: string; notes: string; entries: string[]; state?: 'open' | 'played' | 'skipped' }[];
  names: string[];
  /** Schlüssel der Unterlagen */
  documents: string[];
}

export interface MusterText {
  title: string;
  description: string;
  systemName: string;
  worldInfo: string;
  hotwords: string[];
  members: Record<Player, { summary: string; backstory: string }>;
  chapters: MusterChapter[];
  entries: MusterEntry[];
  ch8: {
    title: string;
    date: string;
    minutes: number;
    recap: string;
    threads: string[];
    gmNote: string;
    /** Zeilen „[hh:mm:ss] Name: Text“ */
    transcript: string;
    review: MusterReview[];
    proposals: MusterProposal[];
    terms: MusterTerm[];
    speakers: MusterSpeaker[];
  };
  comments: { ch: number; who: Who; to?: Who; text: string }[];
  poll: { note: string; createdAt: string; options: { at: string; by: Who; votes: Record<Who, VoteAnswer> }[] };
  documents: MusterDocument[];
  /** Hinweis an die SL: Sina ist neu und sieht einen verborgenen Eintrag nicht */
  newcomerNotice: string;
  /** Kapitelplan der SL für Kapitel 9 (ab Schnittstelle 0.4.12, nur SL) */
  plan: MusterPlan;
  /** Links der Kampagne (ab Schnittstelle 0.4.13); erfundene Adressen unter .example */
  links: { key: string; label: string; url: string; shared: boolean }[];
  collections: Record<Player, MusterCharacter[]>;
}

/** Teil 1: Kampagne, Mitglieder, Kapitel 1–7, Bibel */
export type MusterTextA = Pick<MusterText, 'title' | 'description' | 'systemName' | 'worldInfo' | 'hotwords' | 'members' | 'chapters' | 'entries'>;
/** Teil 2: Kapitel 8, Kommentare, Terminabstimmung, Unterlagen, Hinweis, Sammlungen */
export type MusterTextB = Omit<MusterText, keyof MusterTextA>;
