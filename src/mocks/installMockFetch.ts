import { getResponse } from 'msw';
import { handlers } from './handlers';
import { ME } from './db';
import { DEMO_USERS, musterCollection, musterSheet, seedMuster } from './muster/seed';

const DEFAULT_ME = { ...ME };

/**
 * Testmodus: leitet Anfragen an /api/v1 auf die nachgeahmten Endpunkte um.
 * Bewusst ohne Service Worker, damit es auch in der Android-APK funktioniert.
 * Die Daten leben nur im Arbeitsspeicher und sind nach einem Neustart zurückgesetzt.
 *
 * onlyHost: nur Anfragen an diesen Server abfangen, alles andere geht unverändert hinaus (Musterkampagne in der
 * richtigen App). lang: Sprache der Musterkampagne.
 */
export function installMockFetch(options: { lang: 'de' | 'en'; onlyHost?: string }): void {
  seedMuster(options.lang);
  const realFetch = window.fetch.bind(window);
  if (!options.onlyHost) {
    // Für die Aufnahmen (scripts/screenshots.mjs): Sammlung „Meine Charaktere“ der Musterkampagne
    (window as unknown as { __talewardDemo: unknown }).__talewardDemo = { musterCollection, musterSheet };
  }
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/v1/') && (!options.onlyHost || url.hostname === options.onlyHost)) {
      // Wer fragt? Muster-Tokens tragen die Person („mock-token:u-lea“), sonst der Standard-Nutzer
      const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
      const id = token.split(':')[1];
      const who = Object.values(DEMO_USERS).find((u) => u.id === id) ?? DEFAULT_ME;
      Object.assign(ME, who);
      const response = await getResponse(handlers, request);
      if (response) return response;
      // Musterserver: nie ins Netz, auch nicht bei einem Weg, den der Testmodus nicht kennt
      if (options.onlyHost) return new Response(JSON.stringify({ code: 'not_found', message: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
}
