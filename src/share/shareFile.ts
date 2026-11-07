/*
 * „Kapitel teilen“ (Schnittstelle 0.4.30): geteilte Datei prüfen und öffnen. Nur WebCrypto und Kompression des
 * Browsers, ohne Laufzeit-Importe (Test mit dem gemeinsamen Testvektor: scripts/tests/share-file.test.mjs).
 *
 * Reihenfolge nach S45: Größe → format → Signatur gegen einen gespeicherten Schlüssel genau dieser serverId (nie aus
 * der Datei) → Verbindung und Mitgliedschaft → entschlüsseln (höchstens 20 MB entpackt) → Schema. Jeder Fehlschlag
 * ist derselbe Fehler (ShareRejected), damit niemand am Text sieht, woran es lag.
 */

export const SHARE_FORMAT = 'taleward-kapitel/1';
export const SHARE_MAX_FILE = 5 * 1024 * 1024;
export const SHARE_MAX_CONTENT = 20 * 1024 * 1024;

export class ShareRejected extends Error {
  constructor() { super('share_rejected'); }
}

export interface ShareServerKey { id: string; spki: string }
export interface ShareMemberKey { id: string; key: string }

export interface ShareHead { serverId: string; campaignId: string; shareId: string; createdAt: string }

export interface ShareLookup {
  /** Gespeicherte Signierschlüssel des Servers (nur aus angemeldeten Verbindungen), leer = unbekannter Server */
  serverKeys(serverId: string): ShareServerKey[];
  /** Eigener Schlüssel in dieser Kampagne auf diesem Server, oder null (kein Mitglied, keine Verbindung) */
  memberKey(serverId: string, campaignId: string): Promise<ShareMemberKey | null>;
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new ShareRejected();
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const concat = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

/** Kopf (AAD) in genau dieser Reihenfolge, ohne Leerzeichen */
export function shareHeader(h: ShareHead): Uint8Array<ArrayBuffer> {
  return utf8(JSON.stringify({ format: SHARE_FORMAT, serverId: h.serverId, campaignId: h.campaignId, shareId: h.shareId, createdAt: h.createdAt }));
}

async function gunzipLimited(data: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new ShareRejected(); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Prüft und entschlüsselt eine geteilte Datei. Liefert Kopf und Inhalt (noch ungeprüft gegen die Positivliste der
 * Lesekopie – das macht der Aufrufer) oder wirft ShareRejected.
 */
export async function openShareFile(text: string, lookup: ShareLookup): Promise<{ head: ShareHead; content: Obj }> {
  try {
    if (text.length > SHARE_MAX_FILE) throw new ShareRejected();
    const file = JSON.parse(text) as unknown;
    if (!isObj(file) || file.format !== SHARE_FORMAT || !isStr(file.signed) || !isStr(file.signature)) throw new ShareRejected();
    const signedBytes = fromB64url(file.signed);
    const signed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(signedBytes)) as unknown;
    if (!isObj(signed) || !isStr(signed.serverId) || !isStr(signed.signKeyId)) throw new ShareRejected();
    // Signatur zuerst: Schlüssel nur aus einer angemeldeten Verbindung zu genau diesem Server
    const serverKey = lookup.serverKeys(signed.serverId).find((k) => k.id === signed.signKeyId);
    if (!serverKey) throw new ShareRejected();
    const pub = await crypto.subtle.importKey('spki', fromB64url(serverKey.spki), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = fromB64url(file.signature);
    if (sig.length !== 64) throw new ShareRejected();
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, signedBytes))) throw new ShareRejected();

    const { serverId, campaignId, shareId, createdAt, recipients, nonce, ciphertext } = signed;
    if (!isStr(campaignId) || !ID.test(campaignId) || !isStr(shareId) || !isStr(createdAt) || Number.isNaN(Date.parse(createdAt))
      || !Array.isArray(recipients) || !isStr(nonce) || !isStr(ciphertext)) throw new ShareRejected();
    const head: ShareHead = { serverId, campaignId, shareId, createdAt };
    const mine = await lookup.memberKey(serverId, campaignId);
    if (!mine) throw new ShareRejected();
    const r = recipients.find((x): x is Obj => isObj(x) && x.keyId === mine.id);
    if (!r || !isStr(r.nonce) || !isStr(r.wrapped)) throw new ShareRejected();
    const header = shareHeader(head);
    const memberKey = await crypto.subtle.importKey('raw', fromB64url(mine.key), 'AES-GCM', false, ['decrypt']);
    const contentKeyRaw = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64url(r.nonce), additionalData: concat(header, utf8(mine.id)) }, memberKey, fromB64url(r.wrapped)));
    if (contentKeyRaw.length !== 32) throw new ShareRejected();
    const contentKey = await crypto.subtle.importKey('raw', contentKeyRaw, 'AES-GCM', false, ['decrypt']);
    const packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(nonce), additionalData: header }, contentKey, fromB64url(ciphertext)));
    const raw = await gunzipLimited(packed, SHARE_MAX_CONTENT);
    const content = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown;
    if (!isObj(content) || !isStr(content.campaignTitle) || !Array.isArray(content.sessions) || !Array.isArray(content.entries)) throw new ShareRejected();
    return { head, content };
  } catch {
    throw new ShareRejected();
  }
}
