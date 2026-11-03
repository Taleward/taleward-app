/**
 * Zufällige Kennung dieser Installation je Server (ab Schnittstelle 0.4.27, freiwillig): Der Server schickt die
 * Hinweis-Mail zur Anmeldung nur, wenn die Kennung für das Konto neu ist. Nie aus Hardware-Kennungen, je Server einmal
 * zufällig erzeugt – zwei Server sehen nie dieselbe Kennung. Ohne Speicher (z. B. privates Fenster) bleibt es bei einer
 * Kennung je Sitzung.
 */
const KEY = 'taleward.deviceIds';
const OLD_KEY = 'taleward.deviceId';
const ID = /^[A-Za-z0-9_-]{16,64}$/;
const memo = new Map<string, string>();

function load(): Record<string, string> {
  try {
    localStorage.removeItem(OLD_KEY);
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function save(all: Record<string, string>): void {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* egal */ }
}

/** Schlüssel: Adresse des Servers ohne Pfad-Ende, damit dieselbe Verbindung stabil bleibt */
function serverKey(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').toLowerCase();
}

export function deviceId(baseUrl: string): string {
  const key = serverKey(baseUrl);
  const known = memo.get(key);
  if (known) return known;
  const all = load();
  const saved = all[key];
  if (typeof saved === 'string' && ID.test(saved)) {
    memo.set(key, saved);
    return saved;
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const fresh = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  memo.set(key, fresh);
  save({ ...all, [key]: fresh });
  return fresh;
}

/** Beim Entfernen der letzten Verbindung zu diesem Server mitlöschen */
export function forgetDeviceId(baseUrl: string): void {
  const key = serverKey(baseUrl);
  memo.delete(key);
  const all = load();
  if (key in all) {
    delete all[key];
    save(all);
  }
}
