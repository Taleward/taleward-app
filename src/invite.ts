import { Capacitor } from '@capacitor/core';
import type { Connection } from './api/connections';
import { inviteOrigin } from './api/addresses';

/*
 * Einladungen: Der Server zeigt unter https://<server>/einladung/<CODE> eine Seite mit
 * „In Taleward öffnen“ (taleward://…) und „App herunterladen“. Die App baut den Link, teilt ihn
 * und öffnet sich über taleward://einladung?url=<Link>, wenn jemand darauf tippt.
 */

/**
 * https://<server>/einladung/<CODE> – aus der API-Adresse der Verbindung. Ist die App über localhost verbunden
 * (Programmfenster auf dem PC), nimmt sie die Adresse, die der Server für andere Geräte meldet (publicUrl, ab 0.4.16).
 */
export function inviteLink(conn: Connection, code: string, publicUrl?: string | null): string {
  const own = conn.baseUrl.startsWith('/') ? window.location.origin : new URL(conn.baseUrl).origin;
  return `${inviteOrigin(own, publicUrl)}/einladung/${encodeURIComponent(code)}`;
}

/** App-Adresse, die die installierte App direkt im Beitritt öffnet */
export function appLink(httpsInvite: string): string {
  return `taleward://einladung?url=${encodeURIComponent(httpsInvite)}`;
}

/** taleward://einladung?url=… → der eigentliche Einladungslink; sonst null */
export function inviteFromAppUrl(url: string): string | null {
  if (!url.toLowerCase().startsWith('taleward://')) return null;
  try {
    const q = url.split('?')[1] ?? '';
    const link = new URLSearchParams(q).get('url');
    return link && /^https?:\/\//i.test(link) ? link : null;
  } catch {
    return null;
  }
}

/** Teilen-Menü des Handys (WhatsApp, Signal, Mail …); im Browser ersatzweise kopieren. true = geteilt */
export async function shareInvite(title: string, text: string, url: string): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: title });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return true;
    }
  } catch {
    return false; // abgebrochen
  }
  await copyText(`${text}\n${url}`);
  return false;
}

export async function copyText(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Clipboard } = await import('@capacitor/clipboard');
    await Clipboard.write({ string: text });
    return;
  }
  await navigator.clipboard.writeText(text);
}

/** Zwischenablage lesen (nur nach Tippen – Android meldet das Lesen kurz) */
export async function readClipboard(): Promise<string> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Clipboard } = await import('@capacitor/clipboard');
      return (await Clipboard.read()).value ?? '';
    }
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

/** Aus beliebigem Text (Nachricht mit Link) den Einladungslink heraussuchen */
export function findInviteInText(text: string): string | null {
  return text.match(/https?:\/\/[^\s]+\/einladung\/[A-Za-z0-9-]+/i)?.[0] ?? null;
}
