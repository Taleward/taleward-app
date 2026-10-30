import { useState } from 'react';
import { t } from '../i18n';

/**
 * „So sprechen andere über die Figur“ (ab Schnittstelle 0.4.28): freiwillig, eine Wahl ohne Pflicht. Gespeichert
 * wird der Text selbst („sie“, „er“ oder eigener), damit das Kapitel ihn so übernehmen kann.
 */
export function PronounField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const she = t('sie');
  const he = t('er');
  const preset = value === '' ? 'none' : value === she ? 'she' : value === he ? 'he' : 'own';
  const [own, setOwn] = useState(preset === 'own');
  const mode = own ? 'own' : preset;
  const pick = (m: 'none' | 'she' | 'he' | 'own') => {
    setOwn(m === 'own');
    onChange(m === 'she' ? she : m === 'he' ? he : m === 'none' ? '' : preset === 'own' ? value : '');
  };
  return (
    <div className="field">
      <span className="label" id={`${id}-l`}>{t('So sprechen andere über die Figur (optional)')}</span>
      <div className="segmented" role="group" aria-labelledby={`${id}-l`} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <button type="button" aria-pressed={mode === 'none'} onClick={() => pick('none')}>{t('Keine Angabe')}</button>
        <button type="button" aria-pressed={mode === 'she'} onClick={() => pick('she')}>{she}</button>
        <button type="button" aria-pressed={mode === 'he'} onClick={() => pick('he')}>{he}</button>
        <button type="button" aria-pressed={mode === 'own'} onClick={() => pick('own')}>{t('Eigenes')}</button>
      </div>
      {mode === 'own' && (
        <input id={id} type="text" maxLength={32} value={value} aria-label={t('Eigene Angabe')} placeholder={t('z. B. dey, they')}
          onChange={(e) => onChange(e.target.value)} />
      )}
      <span className="muted small">{t('Damit das Kapitel nicht rät. Sehen alle am Tisch.')}</span>
    </div>
  );
}
