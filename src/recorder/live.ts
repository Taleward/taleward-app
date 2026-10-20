import { setRecordingActive } from './activity';
import type { Recorder } from './recorder';

/*
 * Laufende Aufnahme im Browser für die ganze App. Die Seite „Aufnahme“ startet sie und hängt sich beim Wiederkommen an;
 * verlässt man die Seite (z. B. zum SL-Schirm), läuft sie weiter. Beendet wird sie nur über „Beenden und hochladen“.
 * Die Android-App nimmt über den eigenen Dienst auf und nutzt das hier nicht.
 */
export interface LiveRecording {
  recorder: Recorder;
  connId: string;
  campaignId: string;
  sessionId: string;
  /** Wie viele am Tisch beim Start zugestimmt haben (alle Anwesenden – ohne Zustimmung aller startet keine Aufnahme) */
  consented: number;
}

let live: LiveRecording | null = null;
const listeners = new Set<() => void>();

// Fenster schließen während der Aufnahme: nachfragen (der Ton bis hierher bleibt trotzdem im Gerät)
const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };

export function setLive(next: LiveRecording | null): void {
  if (!live && next) window.addEventListener('beforeunload', warn);
  if (live && !next) window.removeEventListener('beforeunload', warn);
  live = next;
  setRecordingActive(!!next);
  listeners.forEach((l) => l());
}

export function getLive(): LiveRecording | null {
  return live;
}

export function onLiveChange(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
