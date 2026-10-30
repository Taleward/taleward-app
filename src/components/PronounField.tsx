import { useState } from 'react';
import { t } from '../i18n';

/**
 * „So sprechen andere über die Figur“ (ab Schnittstelle 0.4.28): freiwillig. Gespeichert wird der Text selbst („sie“,
 * „er“ oder eigener), damit das Kapitel ihn so übernehmen kann.
 */
export function PronounField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const she = t('sie');
  const he = t('er');
  const preset = value === '' ? 'none' : value === she ? 'she' : value === he ? 'he' : 'own';
  const [own, setOwn] = useState(preset === 'own');
  const mode = own ? 'own' : preset;
  const pick = (m: string) => {
    setOwn(m === 'own');
    onChange(m === 'she' ? she : m === 'he' ? he : m === 'own' && preset === 'own' ? value : '');
  };
  return (
    <div className="field">
      <label htmlFor={`${id}-sel`}>{t('Pronomen (optional)')}</label>
      <select id={`${id}-sel`} value={mode} onChange={(e) => pick(e.target.value)}>
        <option value="none">{t('Keine Angabe')}</option>
        <option value="she">{she}</option>
        <option value="he">{he}</option>
        <option value="own">{t('Eigenes …')}</option>
      </select>
      {mode === 'own' && (
        <input id={id} type="text" maxLength={32} value={value} aria-label={t('Eigene Angabe')} placeholder={t('z. B. dey, they')}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
