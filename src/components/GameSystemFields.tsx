import type { GameSystem } from '../api/types';
import { t, tk } from '../i18n';

// Anzeigenamen der Spielsysteme; Eigennamen bleiben in beiden Sprachen gleich
export const GAME_SYSTEMS: { value: GameSystem; label: string }[] = [
  { value: 'dsa', label: 'Das Schwarze Auge' },
  { value: 'dnd', label: 'Dungeons & Dragons' },
  { value: 'pathfinder', label: 'Pathfinder' },
  { value: 'cthulhu', label: 'Cthulhu' },
  { value: 'shadowrun', label: 'Shadowrun' },
  { value: 'splittermond', label: 'Splittermond' },
  { value: 'other', label: tk('Anderes') }
];

/** Anzeige „Das Schwarze Auge“ bzw. bei „Anderes“ der frei eingetragene Name */
export function systemLabel(system: GameSystem | null | undefined, systemName: string | null | undefined): string | null {
  // Unbekanntes System (neuerer Server): wie „Anderes“ behandeln statt abzustürzen
  const known = system && system !== 'other' ? GAME_SYSTEMS.find((s) => s.value === system) : undefined;
  if (known) return known.label;
  return systemName?.trim() || null;
}

/** Auswahl „Spielsystem“ (nur SL), bei „Anderes“ mit optionalem Namen */
export function GameSystemFields({ idPrefix, system, systemName, onChange }: {
  idPrefix: string;
  system: GameSystem | null;
  systemName: string;
  onChange: (system: GameSystem | null, systemName: string) => void;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-system`}>{t('Spielsystem')}</label>
        <select id={`${idPrefix}-system`} value={system ?? ''}
          onChange={(e) => onChange((e.target.value || null) as GameSystem | null, systemName)}>
          <option value="">{t('Bitte wählen …')}</option>
          {GAME_SYSTEMS.map((s) => <option key={s.value} value={s.value}>{s.value === 'other' ? t(s.label) : s.label}</option>)}
        </select>
        <span className="muted small">{t('Hilft, Namen richtig zu schreiben.')}</span>
      </div>
      {system === 'other' && (
        <div className="field">
          <label htmlFor={`${idPrefix}-system-name`}>{t('Name des Systems (optional)')}</label>
          <input id={`${idPrefix}-system-name`} type="text" maxLength={100} value={systemName}
            placeholder={t('z. B. Household, Mausritter, Eigenbau')} onChange={(e) => onChange(system, e.target.value)} />
        </div>
      )}
    </>
  );
}
