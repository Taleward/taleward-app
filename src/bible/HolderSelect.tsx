import type { Member } from '../api/types';
import { t } from '../i18n';

/** Name einer Figur, wie er am Tisch fällt */
export const figureName = (m: Member) => m.characterName ?? m.displayName;

export const KEEP = '';
export const NOBODY = '-';

/**
 * „Bei wem?“ für Beute. value: Mitglieds-Id, NOBODY (bei niemandem) oder KEEP (bleibt, wie es ist – nur bei
 * Vorschlägen, die einen vorhandenen Gegenstand ergänzen).
 */
export function HolderSelect({ id, players, value, onChange, keep }: {
  id: string;
  players: Member[];
  value: string;
  onChange: (value: string) => void;
  keep?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{t('Bei wem?')}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {keep && <option value={KEEP}>{t('Bleibt, wie es ist')}</option>}
        <option value={NOBODY}>{keep ? t('Bei keiner Figur mehr') : t('Bei keiner Figur')}</option>
        {players.map((m) => <option key={m.id} value={m.id}>{figureName(m)}</option>)}
      </select>
    </div>
  );
}
