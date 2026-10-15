/**
 * Unverschlüsselte Verbindungen (http://) nur im Heimnetz: private IPv4-Bereiche, localhost, .local, .fritz.box und
 * private IPv6-Adressen. Öffentliche Adressen gehen immer über https://.
 */
export function isHomeNetworkHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.fritz.box')) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (h.includes(':')) {
    if (h === '::1') return true;
    const first = parseInt(h.split(':')[0] || '0', 16);
    // fc00::/7 (eigene Adressen im Heimnetz) und fe80::/10 (nur im selben Netz)
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  return false;
}

/** http:// mit öffentlicher Adresse wird zu https://; im Heimnetz bleibt http:// erlaubt. */
export function secureUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' && !isHomeNetworkHost(u.hostname)) {
      return url.trim().replace(/^http:\/\//i, 'https://');
    }
  } catch {
    /* keine Adresse – unverändert lassen, der Aufrufer meldet den Fehler */
  }
  return url;
}

/** Läuft die Verbindung unverschlüsselt (nur im Heimnetz erlaubt)? */
export function isUnencrypted(baseUrl: string): boolean {
  return /^http:\/\//i.test(baseUrl.trim());
}

/** Adresse vereinheitlichen: „verein.de“ → „https://verein.de/api/v1“ */
export function normalizeBaseUrl(input: string): string {
  let s = input.trim();
  if (s.startsWith('/')) return s.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) {
    // Server nur im Heimnetz (private IP-Adresse, localhost, .local, .fritz.box) laufen ohne HTTPS unter http://<IP>:8000
    const host = s.startsWith('[') ? s.slice(0, s.indexOf(']') + 1) : s.split(/[/:]/)[0];
    s = (isHomeNetworkHost(host) ? 'http://' : 'https://') + s;
  }
  // Unverschlüsselt nur im Heimnetz – öffentliche Adressen immer über https
  const u = new URL(secureUrl(s));
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.origin}${path.endsWith('/api/v1') ? path : '/api/v1'}`;
}

/**
 * Einladung erkennen: Link „https://verein.de/einladung/RABE-4821“ (mit Server)
 * oder nur der Code „RABE-4821“ (Server muss dann gewählt werden).
 */
/** Gehören Einladungslink und gespeicherte Verbindung zum selben Server? Gleicher Hostname (mit Port) genügt –
 *  ein Link kann https nennen, wo die App im Heimnetz über http verbunden ist, oder ohne den Unterpfad /app/ */
export function sameServerHost(a: string, b: string): boolean {
  try {
    return new URL(a).host.toLowerCase() === new URL(b).host.toLowerCase();
  } catch {
    return false;
  }
}

export function parseInvite(input: string): { baseUrl: string | null; code: string } | null {
  const s = input.trim();
  const link = s.match(/^(https?:\/\/[^/\s]+)(?:\/[^\s]*)?\/einladung\/([A-Za-z0-9-]+)\/?$/i);
  if (link) return { baseUrl: `${secureUrl(link[1])}/api/v1`, code: link[2].toUpperCase() };
  if (/^[A-Za-z]+-\d+$/.test(s)) return { baseUrl: null, code: s.toUpperCase() };
  return null;
}

/** Nur dieses Gerät selbst (localhost, 127.x, ::1) – von anderen Geräten aus nicht erreichbar */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/**
 * Herkunft für Einladungslinks (Schnittstelle 0.4.16): Ist die App selbst über localhost verbunden (Programmfenster auf
 * dem PC), nimmt sie die Adresse, die der Server für andere Geräte meldet (`publicUrl`); sonst die eigene.
 * http nur zu Adressen im Heimnetz, alles andere bleibt bei der eigenen Herkunft.
 */
export function inviteOrigin(ownOrigin: string, publicUrl?: string | null): string {
  try {
    if (!publicUrl || !isLoopbackHost(new URL(ownOrigin).hostname)) return ownOrigin;
    const u = new URL(publicUrl);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isHomeNetworkHost(u.hostname))) return ownOrigin;
    if (isLoopbackHost(u.hostname)) return ownOrigin;
    return u.origin;
  } catch {
    return ownOrigin;
  }
}

/** Die zentrale Web-Fassung – dort gibt es keinen „eigenen“ Server */
const CENTRAL_HOSTS = ['taleward.org', 'www.taleward.org', 'app.taleward.org'];

/**
 * Läuft die Web-App unter /app/ eines Taleward-Servers, ist dieser Server vorgegeben: `<Herkunft>/api/v1`.
 * Sonst (zentrale Web-Fassung, Android-App, Entwicklung) null.
 */
export function ownServerBase(loc: { origin: string; hostname: string; pathname: string }): string | null {
  if (!/^\/app(\/|$)/.test(loc.pathname)) return null;
  if (CENTRAL_HOSTS.includes(loc.hostname.toLowerCase())) return null;
  if (!/^https?:\/\//.test(loc.origin)) return null;
  return `${loc.origin}/api/v1`;
}

/**
 * Kann eine gespeicherte Verbindung derselbe Server unter neuer Adresse sein (Schnittstelle 0.4.16, `serverId`)?
 * Die `serverId` ist öffentlich, also kein Nachweis. Darum nur, wenn beide Adressen im Heimnetz liegen (PC hat im WLAN
 * eine neue Adresse bekommen) oder der Hostname gleich bleibt (anderer Port, http → https). Sonst gilt der Server als neu.
 */
export function isPlausibleMove(oldBaseUrl: string, newBaseUrl: string): boolean {
  let a: URL;
  let b: URL;
  try {
    a = new URL(oldBaseUrl);
    b = new URL(newBaseUrl);
  } catch {
    return false;
  }
  if (a.hostname.toLowerCase() === b.hostname.toLowerCase()) return true;
  return isHomeNetworkHost(a.hostname) && isHomeNetworkHost(b.hostname);
}

/**
 * Nach der Anmeldung unter der neuen Adresse: Die gespeicherte Verbindung wird nur übernommen, wenn der Server dasselbe
 * Konto meldet. Sonst entsteht eine eigene Verbindung, die alte bleibt unverändert (Adresse und Anmeldung).
 */
export function adoptsMovedConnection(savedUserId: string | null | undefined, loggedInUserId: string | null | undefined): boolean {
  return !!savedUserId && savedUserId === loggedInUserId;
}
