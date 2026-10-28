import { useState, type ReactNode } from 'react';
import { en } from './en';

/**
 * Übersetzung Deutsch/Englisch.
 *
 * Schlüssel ist der deutsche Text selbst: t('Deine Kampagnen') liefert auf Englisch den Eintrag aus en.ts,
 * sonst den deutschen Text. Platzhalter in geschweiften Klammern: t('Kapitel {n}', { n: 3 }).
 * `npm run i18n:check` meldet deutsche Texte ohne englische Übersetzung.
 *
 * Die Sprache ist global; beim Umschalten baut der LanguageProvider die App neu auf,
 * deshalb kann t() überall direkt benutzt werden – auch außerhalb von Komponenten.
 */

/*
 * Weitere Sprache nachreichen: Code hier bei Lang ergänzen, Wörterbuch (z. B. fr.ts, Schlüssel = deutscher Text)
 * anlegen und in LANGUAGES eintragen. Fehlende Einträge fallen auf Deutsch zurück.
 */
export type Lang = 'de' | 'en';

export const LANGUAGES: { code: Lang; name: string; locale: string; dict: Record<string, string> | null }[] = [
  { code: 'de', name: 'Deutsch', locale: 'de-DE', dict: null },
  { code: 'en', name: 'English', locale: 'en-GB', dict: en }
];

const KEY = 'session-chronik.lang';
const isLang = (v: string | null): v is Lang => LANGUAGES.some((l) => l.code === v);

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* ignorieren */
  }
  // Handy-Sprache, wenn es sie gibt; sonst Englisch als gemeinsame Sprache
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'de').toLowerCase().slice(0, 2);
  return isLang(nav) ? nav : 'en';
}

const dictOf = (l: Lang) => LANGUAGES.find((x) => x.code === l)?.dict ?? null;

let current: Lang = detect();

export function getLang(): Lang {
  return current;
}

/** Locale für Datums- und Zahlenformate */
export function locale(): string {
  return LANGUAGES.find((l) => l.code === current)?.locale ?? 'de-DE';
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const source = dictOf(current)?.[text] ?? text;
  if (!vars) return source;
  return source.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/**
 * Markiert einen Text als übersetzbar, ohne ihn schon zu übersetzen – für Konstanten auf Modulebene,
 * die erst beim Anzeigen mit t(…) übersetzt werden (sonst bliebe nach dem Sprachwechsel die alte Sprache stehen).
 */
export const tk = (text: string): string => text;

/**
 * Einzahl/Mehrzahl: tn(n, '{n} Kapitel', '{n} Kapitel').
 * Ist eine Form im Deutschen gleich, im Englischen aber nicht, trägt en.ts beide Formen: 'one||many'.
 */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number>): string {
  const key = n === 1 ? one : many;
  let text = dictOf(current)?.[key] ?? key;
  if (text.includes('||')) text = text.split('||')[n === 1 ? 0 : 1];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(({ n, ...vars } as Record<string, string | number>)[k] ?? `{${k}}`));
}

let setLangHandler: ((l: Lang) => void) | null = null;

export function setLang(l: Lang): void {
  setLangHandler?.(l);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState<Lang>(current);
  setLangHandler = (l: Lang) => {
    current = l;
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignorieren */
    }
    document.documentElement.lang = l;
    setState(l);
  };
  document.documentElement.lang = lang;
  // key: bei Sprachwechsel alles neu aufbauen, damit jedes t() neu ausgewertet wird
  return <div key={lang} style={{ display: 'contents' }}>{children}</div>;
}

/** Sprache als Zeile in einer Liste (Konten und Server) */
export function LanguageRow({ icon }: { icon?: ReactNode }) {
  return (
    <label className="list-row">
      {icon}
      <span className="lr-text">{t('Sprache')}</span>
      <select value={current} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGUAGES.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
      </select>
    </label>
  );
}

/** Auswahl „Sprache“ – alle Sprachen in ihrem eigenen Namen */
export function LanguageSwitch() {
  return (
    <div className="field">
      <label htmlFor="app-lang">{t('Sprache')}</label>
      <select id="app-lang" value={current} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGUAGES.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
      </select>
    </div>
  );
}
