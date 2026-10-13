import { Capacitor } from '@capacitor/core';
import { apiFor, fetchServerInfo } from '../api/client';
import { activeConnections, getConnection, saveConnection, versionLess, type Connection } from '../api/connections';
import type { AuthProviderId } from '../api/types';
import { readAuthReturn } from './authReturn';

/*
 * Anmelden mit Google, Discord, Apple, Microsoft (Schnittstelle 0.4.0). Die App spricht nie selbst mit dem Dienst:
 * Sie öffnet /auth/oidc/{provider}/start im Systembrowser (Custom Tabs). Der Server leitet am Ende auf
 * taleward://auth?ticket=… zurück; das Ticket tauscht nur diese App ein, weil nur sie den verifier kennt (PKCE).
 *
 * Ab Schnittstelle 0.4.13 führt der Rückweg der Android-App über APP_LINK_RETURN: eine https-Adresse, die Android
 * dieser App zuordnet (App Link, bestätigt über /.well-known/assetlinks.json).
 */

/** Rückweg der Android-App ab Schnittstelle 0.4.13 (App Link); muss zu setup-android.mjs und public/.well-known passen */
export const APP_LINK_RETURN = 'https://app.taleward.org/auth/app';

/** Ist das eine Rückkehr vom Anmeldedienst (eigenes Schema oder App Link)? */
export function isAuthReturnUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.startsWith('taleward://auth') || u === APP_LINK_RETURN || u.startsWith(APP_LINK_RETURN + '?') || u.startsWith(APP_LINK_RETURN + '/');
}

const PENDING = 'taleward.oidcPending';
const REGISTER = 'taleward.oidcRegister';
const MOCK = import.meta.env.VITE_API_MODE === 'mock';

export interface PendingLogin {
  baseUrl: string;
  provider: AuthProviderId;
  purpose: 'login' | 'link';
  verifier: string;
  inviteCode: string | null;
  connId: string | null;
  at: number;
}

export interface PendingRegister {
  baseUrl: string;
  provider: string;
  registrationToken: string;
  suggestedDisplayName: string | null;
  email: string | null;
  inviteCode: string | null;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48))); // 64 Zeichen
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(hash) };
}

const probe = (baseUrl: string): Connection => ({ id: '_probe', baseUrl, name: '', operator: null, apiVersion: null, token: null, expiresAt: null, user: null });

/** Anmelden (purpose login) oder Dienst mit bestehendem Konto verbinden (purpose link, braucht conn) */
export async function startProviderLogin(opts: {
  baseUrl: string;
  provider: AuthProviderId;
  purpose: 'login' | 'link';
  inviteCode?: string | null;
  conn?: Connection;
}): Promise<void> {
  const { verifier, challenge } = await pkce();
  let linkToken: string | null = null;
  if (opts.purpose === 'link' && opts.conn) linkToken = (await apiFor(opts.conn).linkProvider(opts.provider)).linkToken;
  const pending: PendingLogin = {
    baseUrl: opts.baseUrl, provider: opts.provider, purpose: opts.purpose, verifier,
    inviteCode: opts.inviteCode ?? null, connId: opts.conn?.id ?? null, at: Date.now()
  };
  localStorage.setItem(PENDING, JSON.stringify(pending));
  // Im Browser (Web-Fassung) zurück auf diese Seite statt auf taleward:// – nur erlaubte Ziele nimmt der Server an
  const web = !Capacitor.isNativePlatform() && !MOCK;
  // Pfad der geladenen Seite statt fester Basis: dieselbe Web-Fassung läuft unter /app/ und an der Wurzel
  const path = window.location.pathname.replace(/index\.html$/, '');
  let returnTo = web ? `${window.location.origin}${path}#/auth` : null;
  // Android-App: App Link statt taleward://, sobald der Server ihn kennt (ab 0.4.13); ältere Server bleiben beim alten Weg
  if (Capacitor.isNativePlatform() && !MOCK) {
    // Ist der Server gerade nicht zu fragen, gilt der zuletzt bekannte Stand einer Verbindung zu ihm
    const known = opts.conn?.apiVersion ?? activeConnections().find((c) => c.baseUrl === opts.baseUrl)?.apiVersion ?? null;
    const apiVersion = await fetchServerInfo(opts.baseUrl).then((i) => i.apiVersion).catch(() => known);
    if (apiVersion && !versionLess(apiVersion, '0.4.13')) returnTo = APP_LINK_RETURN;
  }
  const q = new URLSearchParams({ challenge, purpose: opts.purpose, ...(linkToken ? { linkToken } : {}), ...(returnTo ? { returnTo } : {}) });
  const url = `${opts.baseUrl}/auth/oidc/${opts.provider}/start?${q}`;

  if (MOCK) {
    // Testmodus: kein echter Dienst – so tun, als käme der Browser gleich zurück
    setTimeout(() => window.dispatchEvent(new CustomEvent('taleward:auth-url', {
      detail: `taleward://auth?ticket=mock-${opts.provider}-${opts.purpose}&serverId=test`
    })), 700);
    return;
  }
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, toolbarColor: '#17313b' });
  } else {
    window.location.href = url; // gleiche Registerkarte – der Server leitet danach auf #/auth zurück
  }
}

export function readPendingRegister(): PendingRegister | null {
  try {
    return JSON.parse(sessionStorage.getItem(REGISTER) ?? 'null');
  } catch {
    return null;
  }
}

export function clearPendingRegister(): void {
  sessionStorage.removeItem(REGISTER);
}

/** taleward://auth?… bzw. APP_LINK_RETURN?… verarbeiten; liefert das Ziel, zu dem die App springen soll */
export async function handleAuthUrl(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    Browser.close().catch(() => undefined);
  }
  const pending: PendingLogin | null = (() => {
    try { return JSON.parse(localStorage.getItem(PENDING) ?? 'null'); } catch { return null; }
  })();
  localStorage.removeItem(PENDING);
  const ret = readAuthReturn(url, pending, Date.now());
  if (ret.kind === 'discard' || !pending) return '/verbinden?oidc=error&code=expired';
  const back = pending.purpose === 'link' ? '/konto' : `/verbinden?server=${encodeURIComponent(pending.baseUrl)}`;
  if (ret.kind === 'error') return `${back}${back.includes('?') ? '&' : '?'}oidc=error&code=${encodeURIComponent(ret.code)}`;
  const ticket = ret.ticket;

  try {
    const result = await apiFor(probe(pending.baseUrl)).oidcExchange(ticket, pending.verifier);
    if (result.status === 'email_in_use') {
      return `/verbinden?server=${encodeURIComponent(pending.baseUrl)}&oidc=email_in_use&provider=${pending.provider}`;
    }
    if (result.status === 'register') {
      const reg: PendingRegister = {
        baseUrl: pending.baseUrl, provider: pending.provider, registrationToken: result.registrationToken ?? '',
        suggestedDisplayName: result.suggestedDisplayName ?? null, email: result.email ?? null, inviteCode: pending.inviteCode
      };
      sessionStorage.setItem(REGISTER, JSON.stringify(reg));
      return `/verbinden?server=${encodeURIComponent(pending.baseUrl)}&oidc=register`;
    }
    // status ok
    if (pending.purpose === 'link') {
      const conn = pending.connId ? getConnection(pending.connId) : undefined;
      if (conn) saveConnection({ ...conn, user: await apiFor(conn).me() });
      return `/konto?linked=${pending.provider}`;
    }
    const info = await fetchServerInfo(pending.baseUrl);
    const conn = saveConnection({
      baseUrl: pending.baseUrl, name: info.name, operator: info.operator, apiVersion: info.apiVersion,
      token: result.accessToken ?? null, expiresAt: result.expiresAt ?? null, user: result.user ?? null
    });
    if (pending.inviteCode) {
      const c = await apiFor(conn).joinCampaign(pending.inviteCode);
      return `/v/${conn.id}/k/${c.id}/willkommen`;
    }
    return '/';
  } catch {
    return `${back}${back.includes('?') ? '&' : '?'}oidc=error&code=ticket_invalid`;
  }
}

/** Gibt es schon eine Verbindung mit Anmeldung zu diesem Server? */
export function hasActiveConnection(baseUrl: string): boolean {
  return activeConnections().some((c) => c.baseUrl === baseUrl);
}
