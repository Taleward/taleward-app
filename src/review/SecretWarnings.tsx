import type { Entry, Recap } from '../api/types';
import { t } from '../i18n';
import { IconLock } from '../components/Icons';

/**
 * Ab Schnittstelle 0.4.21, nur SL: Der Server hat im Kapitel Geheimes gefunden (Name eines Eintrags, den nicht alle
 * kennen, oder wörtlich aus geheimen Notizen). Freigeben bleibt möglich; die SL soll es nur vorher gesehen haben.
 */
export function secretNames(recap: Recap, entries: Entry[]): string[] {
  const names = new Set<string>();
  for (const w of recap.gmWarnings ?? []) {
    const found = w.names?.filter(Boolean) ?? [];
    if (found.length) found.forEach((n) => names.add(n));
    else w.entryIds.forEach((id) => { const e = entries.find((x) => x.id === id); if (e) names.add(e.name); });
  }
  return [...names];
}

/** Ein Satz je Hinweis – für den Kasten oben und für die Markierung am Absatz */
export function secretLines(recap: Recap, entries: Entry[]): { text: string; paragraphs: number[] }[] {
  return (recap.gmWarnings ?? []).map((w) => {
    const list = w.names?.filter(Boolean).length ? w.names! : w.entryIds.map((id) => entries.find((e) => e.id === id)?.name).filter((x): x is string => !!x);
    const names = list.join(', ');
    const text = w.code === 'secret_wording'
      ? (names ? t('Übernimmt geheimen Text zu „{names}“.', { names }) : t('Übernimmt Text aus geheimen Notizen.'))
      : (names ? t('Nennt „{names}“ (geheim).', { names }) : t('Nennt einen geheimen Eintrag.'));
    return { text, paragraphs: (w.paragraphs ?? []).map((n) => Math.trunc(n)) };
  });
}

/** Absatz → Satz, der dort am Rand steht */
export function secretByParagraph(recap: Recap, entries: Entry[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const l of secretLines(recap, entries)) {
    for (const i of l.paragraphs) map.set(i, map.has(i) ? map.get(i) + ' ' + l.text : l.text);
  }
  return map;
}

export function SecretWarnings({ recap, entries, onJump }: { recap: Recap; entries: Entry[]; onJump: (paragraph: number) => void }) {
  const lines = secretLines(recap, entries);
  if (!lines.length) return null;
  return (
    <section className="secret-warning" role="note" aria-labelledby="secret-warning-title">
      <strong id="secret-warning-title" className="row" style={{ gap: 6 }}><IconLock size={16} /> {t('Bitte vor der Freigabe prüfen')}</strong>
      <ul>
        {lines.map((l, i) => (
          <li key={i}>
            <span>{l.text}</span>
            {l.paragraphs.length ? (
              <button type="button" className="linklike small tap-link" onClick={() => onJump(l.paragraphs[0])}>{t('Zur Stelle')}</button>
            ) : null}
          </li>
        ))}
      </ul>
      <span className="muted small">{t('Die Spieler sehen das Kapitel so, wie es hier steht. Veröffentlichen kannst du trotzdem.')}</span>
    </section>
  );
}
