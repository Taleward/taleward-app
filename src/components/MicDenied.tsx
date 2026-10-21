import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { t } from '../i18n';
import { inDesktopShell, onShellChange, openMicSettings, shellCan } from '../display/desktopShell';

/**
 * Kein Zugriff aufs Mikrofon – mit dem Weg, der hier wirklich hilft: Android-App (App-Einstellungen), Programmfenster
 * unter Windows (Datenschutz → Mikrofon, mit Knopf, sobald das Programm ihn anbietet) oder Browser (Seiteneinstellungen).
 */
export function MicDenied() {
  const [, redraw] = useState(0);
  useEffect(() => onShellChange(() => redraw((n) => n + 1)), []);
  const desktop = inDesktopShell();

  return (
    <div className="card warn" role="alert">
      <strong>{t('Kein Zugriff aufs Mikrofon')}</strong>
      {Capacitor.isNativePlatform() ? (
        <span className="small">{t('Erlaube ihn in den App-Einstellungen des Handys.')}</span>
      ) : desktop ? (
        <>
          <span className="small">
            {t('Windows lässt Taleward gerade nicht ans Mikrofon. In den Windows-Einstellungen unter „Datenschutz und Sicherheit“ → „Mikrofon“ „Desktop-Apps den Zugriff erlauben“ einschalten, dann hier noch einmal starten.')}
          </span>
          {shellCan('mic-settings') && (
            <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start' }} onClick={openMicSettings}>
              {t('Einstellungen öffnen')}
            </button>
          )}
        </>
      ) : (
        <span className="small">{t('Erlaube ihn in den Einstellungen des Browsers für diese Seite (Schloss oder Symbol links neben der Adresse) und starte noch einmal.')}</span>
      )}
    </div>
  );
}
