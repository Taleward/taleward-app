import { t } from '../i18n';
import { ApiRequestError, api, isApiError } from './client';

export interface UploadFile {
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  trackMemberId?: string;
  /** Lädt den Inhalt erst, wenn die Datei an der Reihe ist – spart Speicher bei langen Aufnahmen. */
  load: () => Promise<Blob>;
}

export function blobFile(blob: Blob, fileName: string, trackMemberId?: string): UploadFile {
  return {
    fileName,
    sizeBytes: blob.size,
    mimeType: blob.type || 'application/octet-stream',
    trackMemberId,
    load: async () => blob
  };
}

/** SHA-256 als Hex. Nur in sicherem Kontext (https oder localhost, also auch in der APK) verfügbar. */
async function sha256Hex(data: Blob): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', await data.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lohnt sich ein erneuter Versuch? Netzwerkfehler, Serverfehler und beschädigte Teile ja, alles andere nein. */
function isTransient(e: unknown): boolean {
  if (!(e instanceof ApiRequestError)) return true;
  return e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500 || e.code === 'chunk_checksum_mismatch';
}

const MAX_ATTEMPTS = 5;

/** Der Server hat die Aufnahme beim Abschließen abgelehnt und verworfen; ein neuer Versuch mit derselben Datei hilft nicht */
const REJECTED = ['recording_too_long', 'recording_unreadable'];
export function isRejectedRecording(e: unknown): boolean {
  return isApiError(e) && e.status === 409 && REJECTED.includes(e.code);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lädt Aufnahmen stückweise hoch und setzt abgebrochene Uploads fort.
 *
 * Ablauf: Upload anlegen (der Server liefert bei gleichen Dateien die bestehende uploadId),
 * fragen, welche Teile fehlen, nur diese senden, noch einmal prüfen, abschließen.
 * Jeder Teil geht mit X-Chunk-SHA256; bei 400 chunk_checksum_mismatch wird genau er wiederholt.
 *
 * Bei source "table" sind mehrere Dateien aufeinanderfolgende Abschnitte EINER Aufnahme.
 * Sie müssen vollständig und in der richtigen Reihenfolge übergeben werden – eine Lücke in der
 * Mitte kann der Server nicht erkennen.
 */
export async function uploadSessionAudio(
  sessionId: string,
  source: 'table' | 'discord',
  files: UploadFile[],
  onProgress: (fraction: number) => void
): Promise<void> {
  const created = await api.startUpload(
    sessionId,
    source,
    files.map((f) => ({
      fileName: f.fileName,
      sizeBytes: f.sizeBytes,
      mimeType: f.mimeType,
      // Bei source=table bleibt trackMemberId leer
      trackMemberId: source === 'discord' ? f.trackMemberId : undefined
    }))
  );

  const size = created.chunkSizeBytes;
  const total = created.files.reduce((n, f) => n + f.chunkCount, 0) || 1;

  const sendChunk = async (fileId: string, blob: Blob, index: number) => {
    const part = blob.slice(index * size, (index + 1) * size);
    const hash = await sha256Hex(part);
    for (let attempt = 1; ; attempt++) {
      try {
        await api.putChunk(created.uploadId, fileId, index, part, hash);
        return;
      } catch (e) {
        if (!isTransient(e) || attempt >= MAX_ATTEMPTS) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  };

  /** Sendet alle fehlenden Teile; liefert true, wenn danach nichts mehr fehlt. */
  const sendMissing = async (): Promise<boolean> => {
    const state = await api.uploadState(created.uploadId);
    const missingTotal = state.files.reduce((n, f) => n + f.missingChunks.length, 0);
    if (missingTotal === 0) return true;
    let done = total - missingTotal;
    onProgress(done / total);
    for (const f of state.files) {
      if (!f.missingChunks.length) continue;
      const idx = created.files.findIndex((x) => x.fileId === f.fileId);
      if (idx < 0) throw new Error(t('Der Server kennt eine Datei dieses Uploads nicht. Bitte neu starten.'));
      const blob = await files[idx].load();
      for (const c of f.missingChunks) {
        await sendChunk(f.fileId, blob, c);
        done++;
        onProgress(done / total);
      }
    }
    return false;
  };

  // Erster Durchlauf sendet alles Fehlende (bei fortgesetztem Upload nur den Rest),
  // zweiter prüft nach und liefert eventuelle Lücken nach.
  if (!(await sendMissing())) await sendMissing();

  // 429: Der Server misst gerade andere Aufnahmen; der Upload bleibt offen, nach kurzer Pause noch einmal abschließen
  const complete = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await api.completeUpload(created.uploadId);
      } catch (e) {
        if (!isApiError(e) || e.status !== 429 || attempt >= 6) throw e;
        await wait(Math.min(5000 * attempt, 20000));
      }
    }
  };
  try {
    await complete();
  } catch (e) {
    // 409: Es fehlen doch noch Teile – ein letzter Nachschub, dann erneut abschließen.
    // Zu lang oder nicht lesbar: Der Server hat den Upload verworfen, hier nichts wiederholen
    if (!isApiError(e) || e.status !== 409 || isRejectedRecording(e)) throw e;
    await sendMissing();
    await complete();
  }
  onProgress(1);
}
