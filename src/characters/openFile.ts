import { Capacitor } from '@capacitor/core';
import type { StoredCharacterFile } from './files';

/** Dateiname, der in jedem Dateisystem geht (Original bleibt in der Sammlung) */
function safeName(name: string): string {
  const cleaned = name.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 120);
  return cleaned || 'datei';
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Datei mit einem Programm des Geräts öffnen („Öffnen mit …“), z. B. Word-Dateien. In der Android-App wird sie dafür
 * kurz in den Zwischenspeicher der App geschrieben und über das Teilen-Menü angeboten; im Browser lädt sie herunter.
 */
export async function openWithDevice(file: StoredCharacterFile, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    // Kopien früherer Teilungen zuerst wegräumen: Es liegt immer höchstens eine Unterlage im Zwischenspeicher
    await Filesystem.rmdir({ path: 'unterlagen', directory: Directory.Cache, recursive: true }).catch(() => undefined);
    const path = `unterlagen/${file.id}/${safeName(file.name)}`;
    const written = await Filesystem.writeFile({ path, data: await toBase64(file.blob), directory: Directory.Cache, recursive: true });
    // Die andere App liest die Datei erst nach der Auswahl; danach nach einer Minute löschen
    window.setTimeout(() => { Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined); }, 60_000);
    try {
      await Share.share({ title, files: [written.uri], dialogTitle: title });
    } catch (e) {
      // Abbrechen im Teilen-Menü ist kein Fehler
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file.blob);
  a.download = safeName(file.name);
  a.rel = 'noopener';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
