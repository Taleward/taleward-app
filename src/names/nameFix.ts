/*
 * Namen einmal berichtigen (Schnittstelle 0.4.31). Reine Hilfen ohne Laufzeit-Importe, genutzt von der Oberfläche
 * (Ausschnitte anzeigen, Eingabe prüfen) und vom Testserver (Suchen und Ersetzen wie der Server: wörtlich, ganze Wörter,
 * deutsche Endungen mit). Test: scripts/tests/name-fix.test.mjs.
 */

export const NAME_FIX_MIN = 3;
export const NAME_FIX_MAX = 64;

/** Steuerzeichen und unsichtbare Zeichen (Bereiche als Zahlen, damit keine Escape-Folgen im Text stehen) */
const INVISIBLE: [number, number][] = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff]];
const isInvisible = (c: number) => INVISIBLE.some(([a, b]) => c >= a && c <= b);

/** Steuerzeichen raus, Leerraum an den Enden weg */
export function cleanName(s: string): string {
  return Array.from(s).filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0)).join('').trim();
}

/** null = in Ordnung, sonst Grund (für den Hinweis in der Oberfläche) */
export function nameFixProblem(from: string, to: string): 'short' | 'long' | 'same' | null {
  const a = cleanName(from), b = cleanName(to);
  if (a.length < NAME_FIX_MIN || b.length < NAME_FIX_MIN) return 'short';
  if (a.length > NAME_FIX_MAX || b.length > NAME_FIX_MAX) return 'long';
  if (a === b) return 'same';
  return null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ganzes Wort, wörtlich; danach darf ’ oder ' kommen („Orasilas’ Schwur“), aber kein weiterer Buchstabe */
function wordPattern(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escape(word)}(?![\\p{L}\\p{N}_])`, 'gu');
}

export function countWord(text: string, word: string): number {
  if (!text || !word) return 0;
  return (text.match(wordPattern(word)) ?? []).length;
}

export function replaceWholeWord(text: string, from: string, to: string): string {
  if (!text || !from) return text;
  return text.replace(wordPattern(from), () => to);
}

/** Bis zu drei Sätze um die Fundstellen, höchstens 200 Zeichen, das Wort als [[…]] */
export function excerptsFor(text: string, word: string, max = 3): string[] {
  const out: string[] = [];
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) ?? [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!countWord(sentence, word)) continue;
    let marked = sentence.replace(wordPattern(word), (m) => `[[${m}]]`);
    if (marked.length > 200) {
      const at = marked.indexOf('[[');
      const start = Math.max(0, at - 80);
      marked = (start > 0 ? '… ' : '') + marked.slice(start, start + 190).trim() + ' …';
    }
    out.push(marked);
    if (out.length >= max) break;
  }
  return out;
}

/** Ausschnitt in Teile zerlegen, damit die Oberfläche das Wort hervorheben kann (ohne HTML) */
export function excerptParts(excerpt: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0;
  for (let m = re.exec(excerpt); m; m = re.exec(excerpt)) {
    if (m.index > last) parts.push({ text: excerpt.slice(last, m.index), mark: false });
    parts.push({ text: m[1], mark: true });
    last = m.index + m[0].length;
  }
  if (last < excerpt.length) parts.push({ text: excerpt.slice(last), mark: false });
  return parts;
}
