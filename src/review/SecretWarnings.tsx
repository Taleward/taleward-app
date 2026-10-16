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

export function SecretWarnings({ recap, entries, onJump }: { recap: Recap; entries: Entry[]; onJump: (paragraph: number) => void }) {
  const warnings = recap.gmWarnings ?? [];
  if (!warnings.length) return null;
  const label = (ids: string[], names?: string[]) => {
    const list = names?.filter(Boolean).length ? names! : ids.map((id) => entries.find((e) => e.id === id)?.name).filter((x): x is string => !!x);
    return list.length ? list.join(', ') : t('ein geheimer Eintrag');
  };
  return (
    <section className="secret-warning" role="note" aria-labelledby="secret-warning-title">
      <strong id="secret-warning-title" className="row" style={{ gap: 6 }}><IconLock size={16} /> {t('Bitte vor der Freigabe prüfen')}</strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>
            <span>
              {w.code === 'secret_wording'
                ? t('Übernimmt Text aus geheimen Notizen: {names}', { names: label(w.entryIds, w.names) })
                : t('Nennt den Namen eines geheimen Eintrags: {names}', { names: label(w.entryIds, w.names) })}
            </span>
            {w.paragraphs?.length ? (
              <button type="button" className="linklike small tap-link" onClick={() => onJump(w.paragraphs![0])}>{t('Zur Stelle')}</button>
            ) : null}
          </li>
        ))}
      </ul>
      <span className="muted small">{t('Die Spieler sehen das Kapitel so, wie es hier steht. Veröffentlichen kannst du trotzdem.')}</span>
    </section>
  );
}
