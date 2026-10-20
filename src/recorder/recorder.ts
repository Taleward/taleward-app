import { hasRecordingStore, saveMeta, savePart, loadRecording, type StoredRecording } from './webStore';

/**
 * Aufnahme-Schnittstelle. Aktuell steckt dahinter der MediaRecorder des Browsers bzw. WebViews.
 *
 * WICHTIG für den Einsatz am Tisch: Der WebView-Recorder stoppt, wenn Android die App
 * in den Hintergrund schickt oder der Bildschirm ausgeht. Für echte 4-Stunden-Sessions
 * kommt eine native Implementierung (Capacitor-Plugin mit Foreground-Service) hinter
 * genau diese Schnittstelle – die Bildschirme müssen dafür nicht geändert werden.
 */
export interface Recorder {
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<Blob>;
  readonly state: 'idle' | 'recording' | 'paused';
  /** Aktueller Pegel 0–1 (für eine Pegelanzeige); 0, wenn nicht verfügbar */
  level?(): number;
  /** Kennung im Zwischenspeicher des Geräts (null: nur im Arbeitsspeicher) */
  readonly storedId?: string | null;
  /** Aufgenommene Zeit ohne Pausen, in Millisekunden */
  elapsedMs(): number;
}

/** Wohin die Aufnahme gehört – damit sie nach einem Absturz der richtigen Runde zugeordnet werden kann */
export interface RecordingTarget {
  connId: string;
  sessionId: string;
  campaignId: string;
  title: string;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export class WebRecorder implements Recorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  /** Nur, wenn das Gerät nicht speichern kann: Stücke im Arbeitsspeicher */
  private chunks: Blob[] = [];
  private meta: StoredRecording | null = null;
  /** Bleibt auch nach einem Rückfall in den Arbeitsspeicher, damit der Rest im Gerät später gelöscht werden kann */
  private id: string | null = null;
  /** Schreibvorgänge nacheinander, damit beim Beenden alles abgelegt ist */
  private writes: Promise<void> = Promise.resolve();
  private heartbeat: number | null = null;
  private accumulatedMs = 0;
  private runningSince = 0;
  private wakeLock: { release(): Promise<void> } | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array | null = null;

  level(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getFloatTimeDomainData(this.buf as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    // RMS auf eine gut ablesbare Skala bringen (Sprechen in normaler Lautstärke ≈ 0,4–0,8)
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4);
  }

  constructor(private target?: RecordingTarget) {}

  get storedId(): string | null {
    return this.id;
  }

  elapsedMs(): number {
    return this.accumulatedMs + (this.rec?.state === 'recording' ? Date.now() - this.runningSince : 0);
  }

  /** Stück ablegen; klappt das nicht (Speicher voll o. ä.), geht es im Arbeitsspeicher weiter */
  private keep(blob: Blob) {
    const m = this.meta;
    if (!m) {
      this.chunks.push(blob);
      return;
    }
    const seq = m.parts++;
    m.bytes += blob.size;
    this.writes = this.writes.then(async () => {
      // Schon in den Arbeitsspeicher gewechselt: dort anhängen, Reihenfolge bleibt
      if (this.meta !== m) {
        this.chunks.push(blob);
        return;
      }
      try {
        await savePart(m.id, seq, blob);
        await saveMeta({ ...m, elapsedMs: this.elapsedMs(), aliveAt: Date.now() });
      } catch {
        // Ab hier im Arbeitsspeicher: Bisheriges einmal herausholen, damit die Datei vollständig bleibt
        this.meta = null;
        const before = await loadRecording({ ...m, parts: seq }).catch(() => new Blob());
        this.chunks = [before, blob, ...this.chunks];
      }
    });
  }

  private wake = async () => {
    if (document.visibilityState !== 'visible' || this.rec?.state === undefined || this.rec.state === 'inactive') return;
    try {
      // Hält den Bildschirm an, solange die App im Vordergrund ist; nach dem Zurückkehren neu anfordern
      const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  };

  get state(): 'idle' | 'recording' | 'paused' {
    if (!this.rec || this.rec.state === 'inactive') return 'idle';
    return this.rec.state;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        // Am Tisch lieber rohes Signal: Rauschunterdrückung schneidet leise Sprecher ab
        noiseSuppression: false,
        echoCancellation: false,
        autoGainControl: true
      }
    });
    const mimeType = pickMimeType();
    this.rec = new MediaRecorder(this.stream, {
      mimeType: mimeType || undefined,
      audioBitsPerSecond: 32000
    });
    this.chunks = [];
    this.meta = null;
    this.id = null;
    if (this.target && hasRecordingStore()) {
      const meta: StoredRecording = {
        ...this.target,
        id: `${this.target.sessionId}-${Date.now().toString(36)}`,
        mimeType: this.rec.mimeType || mimeType || 'audio/webm',
        startedAt: new Date().toISOString(),
        elapsedMs: 0,
        parts: 0,
        bytes: 0,
        state: 'recording',
        aliveAt: Date.now()
      };
      try {
        await saveMeta(meta);
        this.meta = meta;
        this.id = meta.id;
        // Gerät bitten, den Speicher nicht von selbst zu räumen (stillschweigend, wenn nicht unterstützt)
        await navigator.storage?.persist?.().catch(() => false);
      } catch {
        this.meta = null;
      }
    }
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.keep(e.data);
    };
    this.accumulatedMs = 0;
    this.runningSince = Date.now();
    this.rec.start(10_000);
    // Lebenszeichen auch in der Pause, damit ein anderes Fenster die Aufnahme nicht für abgebrochen hält
    this.heartbeat = window.setInterval(() => {
      const m = this.meta;
      if (m) this.writes = this.writes.then(() => saveMeta({ ...m, elapsedMs: this.elapsedMs(), aliveAt: Date.now() }).catch(() => undefined));
    }, 15_000);
    try {
      this.audioCtx = new AudioContext();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.audioCtx.createMediaStreamSource(this.stream).connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
    } catch {
      this.analyser = null; // ohne Pegelanzeige weiter
    }
    await this.wake();
    document.addEventListener('visibilitychange', this.wake);
  }

  pause(): void {
    if (this.rec?.state !== 'recording') return;
    this.accumulatedMs += Date.now() - this.runningSince;
    this.rec.pause();
  }

  resume(): void {
    if (this.rec?.state !== 'paused') return;
    this.runningSince = Date.now();
    this.rec.resume();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec) return resolve(new Blob());
      const elapsed = this.elapsedMs();
      rec.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        this.audioCtx?.close().catch(() => undefined);
        this.audioCtx = null;
        this.analyser = null;
        if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
        this.heartbeat = null;
        document.removeEventListener('visibilitychange', this.wake);
        this.wakeLock?.release().catch(() => undefined);
        this.rec = null;
        // Das letzte Stück kommt vor onstop; erst warten, bis alles abgelegt ist
        await this.writes;
        const type = rec.mimeType || 'audio/webm';
        const m = this.meta;
        if (!m) return resolve(new Blob(this.chunks, { type }));
        const stopped: StoredRecording = { ...m, elapsedMs: elapsed, state: 'stopped', aliveAt: Date.now() };
        await saveMeta(stopped).catch(() => undefined);
        try {
          resolve(new Blob([await loadRecording(stopped), ...this.chunks], { type }));
        } catch {
          resolve(new Blob(this.chunks, { type }));
        }
      };
      rec.stop();
    });
  }
}

export function createRecorder(target?: RecordingTarget): Recorder {
  return new WebRecorder(target);
}

export function fileExtension(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}
