/**
 * Zufällige Kennung dieser Installation (ab Schnittstelle 0.4.27, freiwillig): Der Server schickt die Hinweis-Mail zur
 * Anmeldung nur, wenn die Kennung für das Konto neu ist. Nie aus Hardware-Kennungen, nur einmal zufällig erzeugt.
 * Ohne Speicher (z. B. privates Fenster) bleibt es bei einer Kennung je Sitzung.
 */
const KEY = 'taleward.deviceId';
let memo: string | null = null;

export function deviceId(): string {
  if (memo) return memo;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return (memo = saved);
  } catch { /* weiter ohne Speicher */ }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  memo = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(KEY, memo); } catch { /* egal */ }
  return memo;
}
