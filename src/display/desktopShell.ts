/**
 * Läuft die App im Programmfenster „Taleward Desktop“? Dort steckt sie in einem Rahmen der Programmoberfläche
 * (http://localhost:<Anschluss>), die selbst nur unter localhost läuft. Erkennung über `location.ancestorOrigins`
 * (Chromium/WebView2) – keine Abfrage, kein Speicher.
 *
 * Absprache mit der Programmoberfläche (nur Nachrichten zwischen den beiden Fenstern):
 * - App → Oberfläche: `{ taleward: 'hello' }` beim Start, `{ taleward: 'mic-settings' }` für den Knopf.
 * - Oberfläche → App: `{ taleward: 'desktop', can: ['mic-settings'] }` – erst danach zeigt die App den Knopf.
 * Die Oberfläche öffnet dafür fest die Mikrofon-Seite der Windows-Einstellungen, ohne Angaben aus der Nachricht.
 */

const SHELL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/;

/** Herkunft der Programmoberfläche, wenn die App direkt darin steckt – sonst null */
export function shellOrigin(ancestors: ArrayLike<string> | undefined, self: string, top: boolean): string | null {
  if (top || !ancestors || ancestors.length !== 1) return null;
  const parent = ancestors[0];
  if (!SHELL.test(parent)) return null;
  // Die App selbst kommt vom Server auf demselben PC
  if (!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/.test(self)) return null;
  return parent;
}

/** Nachricht der Oberfläche lesen: welche Hilfen sie anbietet (nur bekannte Namen) */
export function parseShellHello(data: unknown): string[] | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { taleward?: unknown; can?: unknown };
  if (d.taleward !== 'desktop' || !Array.isArray(d.can)) return null;
  return d.can.filter((x): x is string => x === 'mic-settings');
}

let origin: string | null | undefined;
let can: string[] = [];
const listeners = new Set<() => void>();

function detect(): string | null {
  if (origin !== undefined) return origin;
  try {
    origin = shellOrigin(location.ancestorOrigins, location.origin, window.top === window);
  } catch {
    origin = null;
  }
  if (origin) {
    const from = origin;
    window.addEventListener('message', (e) => {
      if (e.origin !== from || e.source !== window.parent) return;
      const c = parseShellHello(e.data);
      if (!c) return;
      can = c;
      listeners.forEach((l) => l());
    });
    window.parent.postMessage({ taleward: 'hello' }, from);
  }
  return origin;
}

/** Im Programmfenster? */
export function inDesktopShell(): boolean {
  return detect() !== null;
}

/** Bietet die Oberfläche den Weg zu den Mikrofon-Einstellungen an? */
export function shellCan(what: 'mic-settings'): boolean {
  detect();
  return can.includes(what);
}

export function onShellChange(cb: () => void): () => void {
  detect();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Windows-Einstellungen → Mikrofon öffnen (macht die Programmoberfläche) */
export function openMicSettings(): void {
  const o = detect();
  if (o && can.includes('mic-settings')) window.parent.postMessage({ taleward: 'mic-settings' }, o);
}
