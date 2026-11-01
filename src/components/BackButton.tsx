import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { isRecordingActive } from '../recorder/activity';
import { t } from '../i18n';
import { confirmDialog } from './confirm';

/**
 * Android-Zurück-Taste: offenes Fenster schließen, sonst eine Seite zurück; auf der Startseite App schließen.
 * Während einer Aufnahme erst nachfragen – die Aufnahme läuft im Hintergrund weiter, aber man soll nicht
 * versehentlich den Aufnahme-Bildschirm verlieren.
 */
export function BackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App } = await import('@capacitor/app');
      const sub = await App.addListener('backButton', async ({ canGoBack }) => {
        // Offenes Fenster (Rückfrage, Auswahl) zuerst schließen, sonst wäre Eingetipptes mit der Seite weg
        if (document.querySelector('[aria-modal="true"]')) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          return;
        }
        if (isRecordingActive()) {
          const leave = await confirmDialog(t('Die Aufnahme läuft. Zum Beenden „Beenden und hochladen“ tippen. Trotzdem diesen Bildschirm verlassen?'), {
            confirmLabel: t('Verlassen, Aufnahme läuft weiter'), cancelLabel: t('Hierbleiben')
          });
          if (!leave) return;
        }
        if (canGoBack) window.history.back();
        else App.exitApp();
      });
      remove = () => sub.remove();
    })();
    return () => remove?.();
  }, []);
  return null;
}
