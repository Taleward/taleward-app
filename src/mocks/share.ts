/*
 * Testserver für „Kapitel teilen“ (Schnittstelle 0.4.30): eigener Signierschlüssel je Seitenaufruf, Schlüssel je
 * Mitglied, Datei genau nach ShareFile (gzip, AES-256-GCM, Kopf als AAD, ECDSA P-256 r‖s). Sina hat noch keinen
 * Schlüssel (zeigt den Hinweis „erst nach dem nächsten Treffen im WLAN“).
 */
import { shareHeader, SHARE_FORMAT } from '../share/shareFile';

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const utf8 = (s: string) => new TextEncoder().encode(s);

let server: Promise<{ id: string; spki: string; key: CryptoKey }> | null = null;
export function mockShareServerKey() {
  server ??= (async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    return { id: 'testschluessel-1', spki: b64url(spki), key: pair.privateKey };
  })();
  return server;
}

const memberKeys = new Map<string, { id: string; key: string }>();
/** Schlüssel eines Mitglieds; ohne Schlüssel (noch nicht im WLAN gewesen) = null */
export function mockMemberKey(memberId: string, displayName: string): { id: string; key: string } | null {
  if (/^sina$/i.test(displayName)) return null;
  let k = memberKeys.get(memberId);
  if (!k) { k = { id: `k-${memberId}`, key: b64url(rand(32)) }; memberKeys.set(memberId, k); }
  return k;
}

async function gzip(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const out = await new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return new Uint8Array(out);
}

export async function mockShareFile(serverId: string, campaignId: string, content: unknown, recipients: { id: string; key: string }[]): Promise<string> {
  const s = await mockShareServerKey();
  const head = { serverId, campaignId, shareId: `share-${Date.now().toString(36)}`, createdAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
  const header = shareHeader(head);
  const contentKeyRaw = rand(32);
  const contentKey = await crypto.subtle.importKey('raw', contentKeyRaw, 'AES-GCM', false, ['encrypt']);
  const nonce = rand(12);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: header }, contentKey, await gzip(utf8(JSON.stringify(content)))));
  const wrapped = await Promise.all(recipients.map(async (r) => {
    const raw = Uint8Array.from(atob(r.key.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
    const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const n = rand(12);
    const aad = new Uint8Array([...header, ...utf8(r.id)]);
    return { keyId: r.id, nonce: b64url(n), wrapped: b64url(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: n, additionalData: aad }, k, contentKeyRaw))) };
  }));
  const signed = utf8(JSON.stringify({ ...head, signKeyId: s.id, recipients: wrapped, nonce: b64url(nonce), ciphertext: b64url(ciphertext) }));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, s.key, signed));
  return JSON.stringify({ format: SHARE_FORMAT, signed: b64url(signed), signature: b64url(signature) });
}
