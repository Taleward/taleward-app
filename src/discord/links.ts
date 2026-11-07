/*
 * Links des Discord-Bots (Schnittstelle 0.4.32): `<server>/discord/<token>` (Kampagne verbinden) und
 * `<server>/zustimmen/<token>` (zur Aufnahme zustimmen) – wie Einladungen öffnet die Seite des Servers die App über
 * `taleward://discord?url=…` bzw. `taleward://zustimmen?url=…`. Das Token kommt nur in den Anfragekörper an genau
 * diesen Server und wird nie gespeichert. Ohne Laufzeit-Importe (Test: scripts/tests/discord-links.test.mjs).
 */

export interface BotLink { kind: 'discord' | 'zustimmen'; origin: string; token: string }

const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

function isLocalHost(host: string): boolean {
  return host === 'localhost' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local') || /^\[?(fe80|fd|fc)/i.test(host);
}

/** https://<server>/discord/<token> bzw. /zustimmen/<token>; http nur im Heimnetz (wie Einladungen) */
export function parseBotLink(link: string): BotLink | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (u.username || u.password) return null;
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocalHost(u.hostname))) return null;
  const m = /^(.*)\/(discord|zustimmen)\/([^/]+)\/?$/.exec(u.pathname);
  if (!m || !TOKEN.test(m[3]) || u.search || u.hash) return null;
  return { kind: m[2] as BotLink['kind'], origin: `${u.origin}${m[1]}`, token: m[3] };
}

/** taleward://discord?url=… bzw. taleward://zustimmen?url=… → der https-Link; sonst null */
export function botLinkFromAppUrl(url: string): BotLink | null {
  const m = /^taleward:\/\/(discord|zustimmen)\?(.*)$/i.exec(url);
  if (!m) return null;
  const link = new URLSearchParams(m[2]).get('url');
  const parsed = link ? parseBotLink(link) : null;
  return parsed && parsed.kind === m[1].toLowerCase() ? parsed : null;
}

/** API-Adresse zum Server des Links (wie bei Einladungen: <origin>/api/v1) */
export function apiBaseOf(link: BotLink): string {
  return `${link.origin.replace(/\/$/, '')}/api/v1`;
}

/** Drei-Wörter-Code säubern: Kleinbuchstaben, Leerzeichen/Bindestriche einheitlich */
export function cleanCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s_–—-]+/g, '-').replace(/[^a-zäöüß-]/g, '').replace(/^-+|-+$/g, '').slice(0, 64);
}
