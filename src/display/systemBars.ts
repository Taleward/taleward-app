import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/**
 * Farbe der Symbole in der Statusleiste (Uhr, Akku) passend zur App.
 *
 * Ab Android 15 zeichnet die App unter die Statusleiste: dahinter liegt der Seitenhintergrund, die Symbole folgen
 * also dem Thema (Pergament → dunkle Symbole, Spielabend → helle). Bis Android 14 ist die Leiste fest tinte
 * (Thema in scripts/setup-android.mjs), dort bleiben die Symbole hell.
 * Nutzt das in Capacitor eingebaute SystemBars statt des alten Statusleisten-Plugins (dessen Farb-Aufrufe sind seit
 * Android 15 eingestellt).
 */
export function androidMajor(userAgent: string): number | null {
  const m = /Android (\d+)/.exec(userAgent);
  return m ? Number(m[1]) : null;
}

export function barStyleFor(dark: boolean, major: number | null): 'dark' | 'light' {
  if (major !== null && major < 15) return 'dark';
  return dark ? 'dark' : 'light';
}

function appIsDark(): boolean {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'dark') return true;
  if (set === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

let listening = false;

export function syncSystemBars(): void {
  if (!Capacitor.isNativePlatform()) return;
  const style = barStyleFor(appIsDark(), androidMajor(navigator.userAgent));
  // „dark“ heißt bei Capacitor: Leiste dunkel, Symbole hell
  SystemBars.setStyle({ style: style === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  if (!listening && typeof matchMedia === 'function') {
    listening = true;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => syncSystemBars());
  }
}
