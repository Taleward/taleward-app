import { t } from '../i18n';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { UploadFile } from '../api/upload';

export interface NativeFile {
  path: string;
  sizeBytes: number;
}

export interface NativeStatus {
  state: 'idle' | 'recording' | 'paused' | 'stopped';
  sessionId?: string;
  title?: string;
  elapsedMs: number;
  /** Ab App 0.36.0: Pegel 0–1 und wie lange das Mikrofon schon nichts hört (fehlt bei älterem nativem Teil) */
  level?: number;
  quietMs?: number;
  files: NativeFile[];
  error?: string;
}

/** Siehe native-android/BackgroundRecorderPlugin.java */
export interface BackgroundRecorderPlugin {
  /** labels: Benachrichtigung – [läuft, pausiert, Pause-Knopf, Weiter-Knopf] */
  start(options: { sessionId: string; title: string; labels?: string[] }): Promise<NativeStatus>;
  pause(): Promise<NativeStatus>;
  resume(): Promise<NativeStatus>;
  stop(): Promise<NativeStatus>;
  getStatus(): Promise<NativeStatus>;
  discard(options: { sessionId: string }): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<{ value: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
}

export const BackgroundRecorder = registerPlugin<BackgroundRecorderPlugin>('BackgroundRecorder');

export function hasNativeRecorder(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BackgroundRecorder');
}

/** Abschnitte der Aufnahme als Upload-Dateien; geladen wird erst beim Hochladen, einzeln. */
export function nativeUploadFiles(files: NativeFile[]): UploadFile[] {
  return files.map((f, i) => ({
    fileName: `teil-${String(i).padStart(3, '0')}.m4a`,
    sizeBytes: f.sizeBytes,
    mimeType: 'audio/mp4',
    load: async () => {
      const res = await fetch(Capacitor.convertFileSrc(f.path));
      if (!res.ok) throw new Error(t('Aufnahmedatei konnte nicht gelesen werden.'));
      return res.blob();
    }
  }));
}
