import { IconTrash } from '../components/Icons';
import { getLang, t } from '../i18n';
import type { GameSystem } from '../api/types';
import { classSuggestions, MAX_CLASSES } from './levelField';

export interface ClassRow { name: string; level: string }

/** Klasse und Stufe (D&D, Pathfinder): Name mit Vorschlägen, Stufe als Zahl; weitere Klassen über einen leisen Link */
export function ClassRows({ system, rows, onChange }: { system: GameSystem; rows: ClassRow[]; onChange: (rows: ClassRow[]) => void }) {
  const listId = `klassen-${system}`;
  const edit = (i: number, change: Partial<ClassRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  return (
    <div className="field">
      <span className="label">{t('Klasse und Stufe (optional)')}</span>
      {rows.map((r, i) => (
        <div key={i} className="class-row">
          <input type="text" maxLength={40} list={listId} value={r.name}
            aria-label={i === 0 ? t('Klasse') : t('Weitere Klasse')} onChange={(e) => edit(i, { name: e.target.value })} />
          <input type="number" inputMode="numeric" min={1} max={30} value={r.level}
            aria-label={t('Stufe')} placeholder={t('Stufe')} onChange={(e) => edit(i, { level: e.target.value })} />
          {i === 0 ? rows.length > 1 && <span className="icon-spacer" aria-hidden /> : (
            <button type="button" className="icon-btn" aria-label={t('Klasse entfernen')} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <IconTrash size={18} />
            </button>
          )}
        </div>
      ))}
      {rows.length < MAX_CLASSES && (
        <button type="button" className="quiet-link small" onClick={() => onChange([...rows, { name: '', level: '' }])}>{t('Weitere Klasse')}</button>
      )}
      <datalist id={listId}>
        {classSuggestions(system, getLang()).map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}
