import { Capacitor, registerPlugin } from '@capacitor/core';
import { clampScale } from './scale';

/*
 * Schriftgröße des Handys in der Android-App übernehmen. Im Browser regelt der Browser selbst
 * (Zoom), dort bleibt --ts bei 1. Ältere Android-Fassungen ohne den nativen Teil: ebenfalls 1.
 */
interface TextScalePlugin {
  get(): Promise<{ scale: number }>;
}

const TextScale = registerPlugin<TextScalePlugin>('TextScale');

async function apply(): Promise<void> {
  try {
    const { scale } = await TextScale.get();
    document.documentElement.style.setProperty('--ts', String(clampScale(scale)));
  } catch {
    /* ohne nativen Teil: normale Größe */
  }
}

/** Beim Start und jedes Mal, wenn die App wieder sichtbar wird (die Einstellung kann sich dazwischen ändern) */
export function followSystemTextScale(): void {
  if (!Capacitor.isNativePlatform()) return;
  apply();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply();
  });
}
