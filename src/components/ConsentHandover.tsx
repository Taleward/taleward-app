import { t } from '../i18n';
import { useState } from 'react';
import { Divider } from './Screen';

/**
 * Vollbild zum Weiterreichen des Handys: Die Person selbst liest den Text und bestätigt.
 * Die SL klickt hier nicht für andere – deshalb die eigene Bestätigung mit Namen.
 */
export function ConsentHandover({ name, text, onConsent, onCancel }: {
  name: string;
  text: string;
  onConsent: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handover-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'var(--parchment)', overflowY: 'auto',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)'
      }}
    >
      <div className="screen-main" style={{ maxWidth: 640, margin: '0 auto', gap: 18, paddingTop: 28 }}>
        <div className="overline">{t('Bitte das Handy weitergeben an')}</div>
        <h1 id="handover-title" style={{ fontSize: 'calc(30px * var(--ts))' }}>{name}</h1>
        <Divider />
        <p style={{ margin: 0, fontSize: 'calc(18px * var(--ts))', lineHeight: 1.6 }}>{text}</p>
        <label className="check card" style={{ flexDirection: 'row' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{t('Ich bin {name} und stimme zu.', { name })}</span>
        </label>
        <button type="button" className="btn" disabled={!checked} onClick={onConsent}>{t('Zustimmen')}</button>
        <button type="button" className="btn outline" onClick={onCancel}>{t('Nicht zustimmen')}</button>
        <p className="muted small" style={{ margin: 0 }}>
          {t('Tipp: In der Vorstellungsrunde kurz „Ich bin einverstanden“ sagen.')}
        </p>
      </div>
    </div>
  );
}
