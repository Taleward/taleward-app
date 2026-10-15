import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { DEFAULT_READ, READ_KEY, parseReadPrefs, type ReadPage, type ReadPrefs, type ReadSize } from './prefs';

const EVENT = 'taleward:lesen';

function load(): ReadPrefs {
  try {
    return parseReadPrefs(localStorage.getItem(READ_KEY));
  } catch {
    return { ...DEFAULT_READ };
  }
}

/** Leseeinstellungen, gleich in allen offenen Kapiteln */
export function useReadPrefs(): [ReadPrefs, (change: Partial<ReadPrefs>) => void] {
  const [prefs, setPrefs] = useState<ReadPrefs>(load);
  useEffect(() => {
    const on = () => setPrefs(load());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  // Änderung auf den zuletzt gespeicherten Stand legen (zwei schnelle Tipps überschreiben sich nicht)
  const save = (change: Partial<ReadPrefs>) => {
    const p = { ...load(), ...change };
    try { localStorage.setItem(READ_KEY, JSON.stringify(p)); } catch { /* nur für diese Sitzung */ }
    setPrefs(p);
    window.dispatchEvent(new Event(EVENT));
  };
  return [prefs, save];
}

/** Attribute für die Kapitelseite: eigene Seite (Pergament/Spielabend) und Schriftgröße */
export function pageAttrs(prefs: ReadPrefs): { 'data-theme'?: 'light' | 'dark'; 'data-read-size': ReadSize } {
  return prefs.page === 'app' ? { 'data-read-size': prefs.size } : { 'data-theme': prefs.page, 'data-read-size': prefs.size };
}

/** Das Blatt unter „Aa“: Schriftgröße und Seite, nur mit den vorhandenen Bausteinen */
export function ReadSettings({ prefs, onChange, id }: { prefs: ReadPrefs; onChange: (change: Partial<ReadPrefs>) => void; id: string }) {
  const sizes: { v: ReadSize; label: string }[] = [
    { v: 'normal', label: t('Normal') }, { v: 'large', label: t('Groß') }, { v: 'larger', label: t('Sehr groß') }
  ];
  const pages: { v: ReadPage; label: string }[] = [
    { v: 'app', label: t('Wie die App') }, { v: 'light', label: t('Pergament') }, { v: 'dark', label: t('Spielabend') }
  ];
  return (
    <div id={id} className="read-settings">
      <div role="group" aria-label={t('Schriftgröße')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="small" aria-hidden="true">{t('Schriftgröße')}</span>
        <div className="segmented" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {sizes.map((s) => (
            <button key={s.v} type="button" aria-pressed={prefs.size === s.v} onClick={() => onChange({ size: s.v })}>{s.label}</button>
          ))}
        </div>
      </div>
      <div role="group" aria-label={t('Seite')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="small" aria-hidden="true">{t('Seite')}</span>
        <div className="segmented" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {pages.map((p) => (
            <button key={p.v} type="button" aria-pressed={prefs.page === p.v} onClick={() => onChange({ page: p.v })}>{p.label}</button>
          ))}
        </div>
      </div>
      <span className="muted small">{t('Gilt nur für den Kapiteltext auf diesem Gerät.')}</span>
    </div>
  );
}
