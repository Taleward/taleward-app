/**
 * „Auch genannt“ (ab Schnittstelle 0.4.21): weitere Namen eines Bibeleintrags.
 * Ohne Laufzeit-Importe, damit es sich testen lässt (scripts/tests/aliases.test.mjs).
 */
export const MAX_ALIASES = 10;
export const MAX_ALIAS_LENGTH = 40;

const key = (s: string) => s.trim().toLocaleLowerCase('de');

/** Eingabe „Tarvok, der Alte; Tharv“ → bereinigte Liste wie der Server sie speichert (ohne den Namen selbst, ohne Doppelte) */
export function parseAliases(input: string, name: string): string[] {
  const out: string[] = [];
  const seen = new Set([key(name)]);
  for (const raw of input.split(/[,;\n]/)) {
    const a = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_ALIAS_LENGTH).trim();
    if (!a || seen.has(key(a))) continue;
    seen.add(key(a));
    out.push(a);
    if (out.length === MAX_ALIASES) break;
  }
  return out;
}

export function aliasesText(aliases: string[] | undefined): string {
  return (aliases ?? []).join(', ');
}

/** Kommt die Schreibweise eines Vorschlags beim Ergänzen zu „Auch genannt“? (nicht, wenn sie schon Name oder Alias ist) */
export function addsAlias(spelling: string, name: string, aliases: string[] | undefined): boolean {
  const k = key(spelling);
  return !!k && k !== key(name) && !(aliases ?? []).some((a) => key(a) === k);
}
