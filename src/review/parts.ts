/*
 * Teile im Kapitel (Schnittstelle 0.4.17): Recap.parts sagt, vor welchem Absatz eine Zwischenüberschrift steht.
 * Der Text bleibt eine Folge von Absätzen. Ohne Laufzeit-Importe (Test: scripts/tests/recap-parts.test.mjs).
 */

export interface RecapPartLike {
  title: string;
  firstParagraph: number;
}

export const PART_TITLE_MAX = 120;

/** Absätze wie überall in der App: durch Leerzeilen getrennt */
export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/);
}

/**
 * Gültige Teile als Zuordnung Absatz → Überschrift. Unbrauchbares wird still übergangen (falscher Absatz, nicht
 * aufsteigend, leere Überschrift), damit ein Kapitel immer lesbar bleibt. Mit `chapterTitle` entfällt eine Überschrift
 * am Anfang, die nur den Kapiteltitel wiederholt.
 */
export function partTitles(parts: readonly RecapPartLike[] | null | undefined, paragraphCount: number, chapterTitle?: string): Map<number, string> {
  const out = new Map<number, string>();
  if (!Array.isArray(parts)) return out;
  let last = -1;
  for (const p of parts) {
    if (!p || typeof p.title !== 'string' || !Number.isInteger(p.firstParagraph)) continue;
    const title = p.title.trim().slice(0, PART_TITLE_MAX);
    if (!title || p.firstParagraph <= last || p.firstParagraph < 0 || p.firstParagraph >= paragraphCount) continue;
    out.set(p.firstParagraph, title);
    last = p.firstParagraph;
  }
  const first = out.get(0);
  if (first && chapterTitle && first.toLocaleLowerCase() === chapterTitle.trim().toLocaleLowerCase()) out.delete(0);
  return out;
}

const HEADING = /^#[ \t]+(\S.*)$/;

/** Zum Bearbeiten: Überschriften als eigene Zeile „# Titel“ vor ihren Absatz */
export function toEditText(text: string, parts: readonly RecapPartLike[] | null | undefined): string {
  const paragraphs = splitParagraphs(text);
  const titles = partTitles(parts, paragraphs.length);
  return paragraphs.map((p, i) => (titles.has(i) ? `# ${titles.get(i)}\n\n${p}` : p)).join('\n\n');
}

/** Aus dem Bearbeiten zurück: Zeilen „# Titel“ (allein als Absatz) werden zu Teilen, der Rest ist der Text */
export function fromEditText(edit: string): { text: string; parts: RecapPartLike[] } {
  const paragraphs: string[] = [];
  const parts: RecapPartLike[] = [];
  let pending: string | null = null;
  for (const raw of splitParagraphs(edit.trim())) {
    const block = raw.trim();
    if (!block) continue;
    const m = HEADING.exec(block);
    if (m && !block.includes('\n')) {
      pending = m[1].trim().slice(0, PART_TITLE_MAX);
      continue;
    }
    if (pending) {
      parts.push({ title: pending, firstParagraph: paragraphs.length });
      pending = null;
    }
    paragraphs.push(block);
  }
  return { text: paragraphs.join('\n\n'), parts };
}

/** Zum Vorlesen: Überschriften als eigener Satz vor ihrem Teil */
export function speechText(title: string, text: string, parts: readonly RecapPartLike[] | null | undefined): string {
  const paragraphs = splitParagraphs(text);
  const titles = partTitles(parts, paragraphs.length, title);
  const body = paragraphs.map((p, i) => (titles.has(i) ? `${titles.get(i)}. ${p}` : p)).join('\n\n');
  return `${title}. ${body}`;
}
