/*
 * Aufnahmen für Website und Store aus dem Testmodus (Musterkampagne „Die leisen Wasser“).
 *
 *   npm run build:mock
 *   npx vite preview --port 4173          (in einem zweiten Fenster laufen lassen)
 *   node scripts/screenshots.mjs          (Chrome oder Edge wird gesucht; sonst CHROME_PATH setzen)
 *
 * Ergebnis: screenshots/taleward-<nr>-<sprache>-<thema>.png, 1080 × 2400 px (Pixel-7-Maße, Dichte 2,625).
 * Die Aufnahmen entstehen im Browser in Handy-Größe – ohne Android-Statusleiste, die setzt die Website selbst.
 * Ausnahme Nr. 16 (SL-Schirm am Tablet quer): 2560 × 1600 px (1280 × 800, Dichte 2).
 */
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const OUT = process.env.OUT_DIR ?? 'screenshots';
const SERVER = 'https://muster.taleward.invalid';
const DPR = 1080 / 411;
const W = 411, H = 2400.9 / DPR; // leicht aufgerundet, damit genau 2400 px entstehen

const CHROME = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome/Edge nicht gefunden – bitte CHROME_PATH setzen.');

const L = {
  de: { cid: 'c-wasser', next: 'Weiter', askConsent: 'Zustimmen lassen', agree: 'Zustimmen',
    accept: 'Übernehmen', publish: 'Kapitel veröffentlichen', invite: 'Mitspielende einladen', qr: 'QR-Code zeigen',
    all: 'Alle (', world: 'Mitgebrachte Welt', mara: '00000000-0000-4000-8000-000000000701',
    played: 'Gespielt', search: 'Sefa Mor', hint: 'Geflohen stimmt nicht. Sie ist gegangen, bevor man sie holen konnte.',
    analyse: 'Für die Spielleitung auswerten', sheet: 'Mara Venn – Charakterbogen.pdf', fromBackstory: 'Aus dem Hintergrund' },
  en: { cid: 'c-waters', next: 'Continue', askConsent: 'Ask to agree', agree: 'Agree',
    accept: 'Accept', publish: 'Publish chapter', invite: 'Invite players', qr: 'Show QR code',
    all: 'All (', world: 'Brought-along world', mara: '00000000-0000-4000-8000-000000000801',
    played: 'Played', search: 'Sefa Mor', hint: 'She did not flee. She left before they could come for her.',
    analyse: 'Have it analysed for the game master', sheet: 'Mara Venn – character sheet.pdf', fromBackstory: 'From the backstory' }
};

// Welche Aufnahmen in welchem Thema (Stern in der Anfrage = zusätzlich Spielabend)
// 10–14: Charaktere (Schnittstelle 0.4.7) – Sammlung, Charakterseite, mitgebrachte Welt, Willkommen, SL-Prüfung
// 15: Startbildschirm (drei Wege: Einladung, selbst leiten, ohne Server ausprobieren)
const CHAR = [10, 11, 12, 13, 14];
const START = [15];
// 16: SL-Schirm am Tablet quer (eine Szene abgehakt, Bibel-Suche mit Tippfehler), 17: SL-Schirm am Handy (Kurzfassung),
// 18: Prüfen-Seite mit einem Hinweis an einem Absatz („Stimmt etwas nicht oder fehlt etwas?“, ab Schnittstelle 0.4.15)
const GM = [16, 17, 18];
// 19–22: Auswertung von Charakterbögen und Hintergründen (Schnittstelle 0.4.18) – Charakterseite der Spielerin mit Stand,
// „Jetzt dran“ der SL mit aufgeklappter Bitte, „Mitgebrachte Welt“ mit Herkunft, „Was mit deinen Daten passiert“
const ANALYSIS = [19, 20, 21, 22];
const RUNS = [
  { lang: 'de', theme: 'pergament', shots: [1, 2, 3, 4, 5, 6, 7, 8, 9, ...CHAR, ...START, ...GM, ...ANALYSIS] },
  { lang: 'en', theme: 'pergament', shots: [1, 2, 3, 4, 5, 6, 7, 8, 9, ...CHAR, ...START, ...GM, ...ANALYSIS] },
  { lang: 'de', theme: 'spielabend', shots: [1, 7, ...CHAR, ...START, ...GM, ...ANALYSIS] },
  { lang: 'en', theme: 'spielabend', shots: [1, 7, ...CHAR, ...START, ...GM, ...ANALYSIS] }
].map((r) => (process.env.SHOTS ? { ...r, shots: r.shots.filter((n) => process.env.SHOTS.split(',').map(Number).includes(n)) } : r));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(process.env.NO_SANDBOX ? ['--no-sandbox', '--single-process', '--no-zygote'] : [])] });

for (const run of RUNS) {
  const t = L[run.lang];
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: W, height: Math.ceil(H), deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  // Zeitanzeige der Aufnahme gezielt auf 01:12:40 bringen: Sekunden-Takte laufen schnell und halten dort an
  await page.evaluateOnNewDocument(() => {
    const orig = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => {
      const target = window.__recTarget;
      if (ms !== 1000 || !target) return orig(fn, ms, ...a);
      let n = 0;
      return orig(() => { if (n < target) { n++; fn(); } }, 2, ...a);
    };
  });

  const shot = async (nr, size = { width: W, height: H }) => {
    if (!run.shots.includes(nr)) return;
    await wait(700);
    const file = `${OUT}/taleward-${String(nr).padStart(2, '0')}-${run.lang}-${run.theme}.png`;
    await page.screenshot({ path: file, clip: { x: 0, y: 0, ...size } });
    console.log('  ', file);
  };
  const phone = () => page.setViewport({ width: W, height: Math.ceil(H), deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await wait(1200); };
  const click = async (text, scope = 'body') => page.evaluate((txt, sc) => {
    const el = [...document.querySelectorAll(`${sc} button, ${sc} summary`)].find((b) => b.textContent.trim() === txt || b.textContent.trim().startsWith(txt));
    if (!el) throw new Error('Knopf fehlt: ' + txt);
    el.click();
  }, text, scope);
  const login = async (user) => {
    await go(`/verbinden?server=${encodeURIComponent(SERVER + '/api/v1')}`);
    await page.$eval('#address', (el) => { el.value = ''; });
    await page.type('#address', SERVER);
    await click(t.next); await wait(900);
    await page.type('#user', user); await page.type('#pass', 'demo');
    await page.click('button[type=submit]'); await wait(1500);
  };

  console.log(`${run.lang} / ${run.theme}`);
  await page.goto(`${BASE}/#/`);
  await page.evaluate((lang, theme) => {
    localStorage.clear();
    localStorage.setItem('session-chronik.lang', lang);
    localStorage.setItem('taleward.theme', theme === 'spielabend' ? 'dark' : 'light');
  }, run.lang, run.theme);
  await page.reload(); await wait(800);
  // 15: Startbildschirm ohne Einladung – Feld leer, Testmodus-Hinweis ausgeblendet
  if (run.shots.includes(15)) {
    await page.evaluate(() => {
      const input = document.querySelector('#address');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('p')].filter((x) => x.textContent.includes('/api/v1')).forEach((x) => x.remove());
    });
    await shot(15);
  }

  await login('anja');
  const conn = await page.evaluate(() => JSON.parse(localStorage.getItem('session-chronik.connections'))[0].id);
  const k = `/v/${conn}/k/${t.cid}`, s = `/v/${conn}/s/s-${t.cid}-8`;
  // Kapitel 8 hat unsichere Namen; für die Aufnahmen gleich zur Prüfung
  await page.evaluate((key) => sessionStorage.setItem(key, '1'), `session-chronik.names-skipped.${conn}.s-${t.cid}-8`);

  // In der Musterkampagne haben alle schon zugestimmt; für die Aufnahmen 2 und 3 zieht Sina ihre
  // Zustimmung zurück, damit „Zustimmen lassen“ zu sehen ist
  await page.evaluate(async (base, cid) => {
    await fetch(`${base}/api/v1/campaigns/${cid}/recording-consent`, {
      method: 'PUT', headers: { Authorization: 'Bearer mock-token:u-sina', 'Content-Type': 'application/json' },
      body: JSON.stringify({ granted: false })
    });
  }, SERVER, t.cid);
  await go(`${k}/aufnahme`); await shot(2);
  await go(`${s}/stimmen`); await shot(4);
  await go(`${s}/freigabe`);
  await page.evaluate(() => document.querySelector('details.card summary')?.click());
  await shot(5);
  if (run.shots.includes(18)) {
    // Zweiten Absatz antippen und einen Hinweis schreiben (abgeschickt wird nichts)
    await page.evaluate(() => { const d = document.querySelector('details.card'); if (d) d.open = true; }); await wait(400);
    await page.evaluate(() => document.querySelectorAll('.recap.pickable')[1]?.click()); await wait(500);
    const field = await page.$('.paragraph-hint textarea, .paragraph-hint input');
    if (!field) throw new Error('Hinweisfeld fehlt');
    await field.type(t.hint);
    await page.evaluate(() => { document.querySelectorAll('.recap.pickable')[1]?.scrollIntoView({ block: 'start' }); document.querySelector('.screen-main').scrollBy(0, -12); });
    await shot(18);
  }
  await go(k); await click(t.invite); await wait(600); await click(t.qr); await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('.card')].find((c) => c.querySelector('svg') && c.textContent.includes('/einladung/'))?.scrollIntoView({ block: 'start' }));
  await shot(9);
  if (run.shots.some((n) => n === 16 || n === 17)) {
    // SL-Schirm: erste Szene abhaken, in der Bibel mit Tippfehler suchen; erst Tablet quer, dann Handy
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2, hasTouch: true });
    await go(`${k}/tisch`); await wait(800);
    await page.evaluate((txt) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(txt))?.click(), t.played); await wait(600);
    const search = await page.$('#tb-search');
    if (search) { await search.type(t.search); await wait(600); }
    await shot(16, { width: 1280, height: 800 });
    await phone(); await go(`${k}/tisch`); await wait(800);
    await shot(17);
  }
  if (run.shots.includes(3)) {
    await go(`${k}/aufnahme`);
    await click(t.askConsent); await wait(300);
    await page.evaluate(() => document.querySelector('[role=dialog] input[type=checkbox]').click());
    await click(t.agree, '[role=dialog]'); await wait(300);
    await page.evaluate(() => { window.__recTarget = 1 * 3600 + 12 * 60 + 40; });
    await page.click('.rec-button');
    await page.waitForFunction(() => document.querySelector('.rec-time')?.textContent === '01:12:40', { timeout: 30000 });
    await shot(3);
    await page.evaluate(() => { window.__recTarget = 0; });
  }
  await go(`${s}/freigabe`); await click(t.accept); await wait(500); await click(t.publish); await wait(500);
  // Offene Vorschläge: Rückfrage bestätigen
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /^(Veröffentlichen|Publish)$/.test(b.textContent.trim()))?.click()); await wait(1500);
  await go(`${k}/bibel`);
  await page.evaluate(() => [...document.querySelectorAll('.card-title')].find((c) => c.textContent.trim() === 'Oren Silt')?.closest('.card')?.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => document.querySelector('.screen-main').scrollBy(0, -12));
  await shot(7);

  await login('lea');
  await go(`${k}/chronik`); await shot(1);
  await go(`${k}/termin`); await shot(8);

  await login('tom');
  await go(`${s}/recap`); await shot(6);

  if (run.shots.some((n) => CHAR.includes(n))) {
    // Sammlung liegt im Speicher der App; die Demo liefert sie fertig (nur im Testmodus)
    const seed = (who) => page.evaluate((lang, w) => {
      const c = JSON.parse(localStorage.getItem('session-chronik.connections')).find((x) => x.user?.username === w);
      const list = window.__talewardDemo.musterCollection(lang, w, c.id, c.name, `${c.baseUrl}|${c.user.id}`);
      localStorage.setItem('taleward.characters', JSON.stringify(list));
    }, run.lang, who);
    const scrollTo = (text) => page.evaluate((txt) => {
      [...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === txt)?.scrollIntoView({ block: 'start' });
      document.querySelector('.screen-main').scrollBy(0, -12);
    }, text);
    await login('lea'); await seed('lea');
    await go('/charaktere'); await click(t.all); await shot(10);
    await go(`/charaktere/${t.mara}`); await shot(11);
    await scrollTo(t.world); await shot(12);
    await login('tom'); await seed('tom');
    await go(`${k}/willkommen`); await shot(13);
    await login('anja');
    await go(`${k}/mitgebracht`); await shot(14);
  }

  if (run.shots.some((n) => ANALYSIS.includes(n))) {
    // Auswertung vorbereiten (nur im Testmodus, direkt am Musterserver): SL erlaubt sie, Lea gibt ihren Hintergrund ab
    // (die SL stimmt zu, fertig) und danach einen Bogen (wartet), Tom gibt seinen Hintergrund ab (wartet)
    await page.evaluate(async (base, cid, sheetName) => {
      const call = (who, method, path, body) => fetch(`${base}/api/v1${path}`, {
        method, headers: { Authorization: `Bearer mock-token:u-${who}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
      }).then((r) => (r.status === 204 ? null : r.json()));
      await call('anja', 'PATCH', `/campaigns/${cid}`, { allowCharacterAnalysis: true });
      const lea = await call('lea', 'POST', `/campaigns/${cid}/members/me/backstory-analysis`);
      await call('anja', 'POST', `/character-analyses/${lea.id}/decision`, { approve: true });
      await new Promise((r) => setTimeout(r, 7000));
      await call('anja', 'GET', `/campaigns/${cid}/character-proposals`);
      const form = new FormData();
      form.append('file', new File(['%PDF-1.4'], sheetName, { type: 'application/pdf' }));
      form.append('kind', 'character_sheet');
      form.append('title', sheetName.replace(/\.pdf$/, ''));
      await call('lea', 'POST', `/campaigns/${cid}/documents`, form);
      await call('tom', 'POST', `/campaigns/${cid}/members/me/backstory-analysis`);
    }, SERVER, t.cid, t.sheet);
    const toHeading = (text) => page.evaluate((txt) => {
      [...document.querySelectorAll('h2, summary')].find((h) => h.textContent.trim() === txt)?.closest('section, details')?.scrollIntoView({ block: 'start' });
      document.querySelector('.screen-main').scrollBy(0, -12);
    }, text);
    await login('lea');
    const leaMember = await page.evaluate(async (base, cid) => {
      const c = await fetch(`${base}/api/v1/campaigns/${cid}`, { headers: { Authorization: 'Bearer mock-token:u-lea' } }).then((r) => r.json());
      return c.members.find((m) => m.userId === 'u-lea').id;
    }, SERVER, t.cid);
    await go(`${k}/charakter/${leaMember}`); await toHeading(t.analyse); await shot(19);
    await go(k);
    await page.evaluate(() => { const d = document.getElementById('data-summary'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); document.querySelector('.screen-main').scrollBy(0, -12); } });
    await shot(22);
    await login('anja');
    await go(k);
    await page.evaluate(() => {
      const s = [...document.querySelectorAll('.now-fold > summary')].find((x) => x.textContent.startsWith('Tom'));
      s?.click();
      document.querySelector('.now-list')?.scrollIntoView({ block: 'start' });
      document.querySelector('.screen-main').scrollBy(0, -12);
    });
    await wait(800);
    await shot(20);
    // Bis zu den Vorschlägen aus Leas Hintergrund scrollen (Herkunft „Aus dem Hintergrund“)
    await go(`${k}/mitgebracht`);
    await page.evaluate((txt) => {
      [...document.querySelectorAll('span.muted')].find((x) => x.textContent.trim() === txt)?.scrollIntoView({ block: 'start' });
      document.querySelector('.screen-main').scrollBy(0, -12);
    }, t.fromBackstory);
    await shot(21);
  }

  if (errors.length) console.log('   Fehler in der Seite:', errors);
  await page.close();
}
await browser.close();
