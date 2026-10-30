import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorBox, Screen } from '../components/Screen';
import { t } from '../i18n';
import { fileKind, getFile, setLastPage, type StoredCharacterFile } from './files';
import { openWithDevice } from './openFile';
import { getCharacter } from './store';

/**
 * Unterlage aus der Sammlung lesen, ohne Netz. PDF über pdf.js (ohne Formular-Skripte; ab 6.x ohne eval), Bild als Bild, Text als
 * Text – nie als HTML. Bei PDFs merkt sich die App die zuletzt gelesene Seite.
 */
export function FileViewer() {
  const { characterId = '', fileId = '' } = useParams();
  const c = getCharacter(characterId);
  const [file, setFile] = useState<StoredCharacterFile | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getFile(fileId).then((f) => setFile(f && f.characterId === characterId ? f : null)).catch((e) => { setError(e); setFile(null); });
  }, [fileId, characterId]);

  const back = { to: `/charaktere/${characterId}`, label: c?.name ?? t('Meine Charaktere') };
  const kind = file ? fileKind(file) : null;

  return (
    <Screen nav={false} wide={kind === 'pdf'} backTo={back} overline={c?.name ?? ' '} title={file?.name ?? ' '}>
      <ErrorBox error={error} />
      {file === null && (
        <>
          <div className="empty">{t('Diese Datei gibt es nicht mehr.')}</div>
          <Link className="btn outline" to={back.to}>{t('Zurück')}</Link>
        </>
      )}
      {file && kind === 'pdf' && <PdfPages file={file} onError={setError} />}
      {file && kind === 'image' && <ImageView file={file} />}
      {file && kind === 'text' && <TextView file={file} />}
      {file && (
        <button type="button" className="quiet-link" onClick={() => openWithDevice(file, file.name).catch(setError)}>{t('Mit einer anderen App öffnen')}</button>
      )}
    </Screen>
  );
}

function ImageView({ file }: { file: StoredCharacterFile }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img src={url} alt={file.name} style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-card)' }} /> : null;
}

function TextView({ file }: { file: StoredCharacterFile }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { file.blob.text().then(setText).catch(() => setText('')); }, [file]);
  return <div className="card"><p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text ?? t('Lade …')}</p></div>;
}

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};

/**
 * pdf.js in der „legacy“-Fassung: Sie bringt Ersatz für neue JavaScript-Funktionen mit, die ältere WebViews auf
 * Android noch nicht kennen. Wird erst beim ersten Öffnen eines PDF geladen.
 */
async function loadPdf(blob: Blob): Promise<{ promise: Promise<PdfDoc>; destroy: () => Promise<void> }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({ data, enableXfa: false }) as unknown as { promise: Promise<PdfDoc>; destroy: () => Promise<void> };
}

/** Seiten untereinander; gezeichnet wird erst, wenn eine Seite in die Nähe kommt */
function PdfPages({ file, onError }: { file: StoredCharacterFile; onError: (e: unknown) => void }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [current, setCurrent] = useState(file.lastPage ?? 1);
  const box = useRef<HTMLDivElement>(null);
  const jumped = useRef(false);

  useEffect(() => {
    let alive = true;
    let task: { destroy: () => Promise<void> } | null = null;
    loadPdf(file.blob).then(async (loading) => {
      task = loading;
      const d = await loading.promise;
      if (!alive) return;
      // Seitengrößen vorab, damit die Platzhalter stimmen und der Sprung zur letzten Seite passt
      const list: { w: number; h: number }[] = [];
      for (let n = 1; n <= d.numPages; n++) {
        const v = (await d.getPage(n)).getViewport({ scale: 1 });
        list.push({ w: v.width, h: v.height });
      }
      if (!alive) return;
      setSizes(list);
      setDoc(d);
    }).catch((e) => alive && onError(e));
    return () => { alive = false; task?.destroy().catch(() => undefined); };
  }, [file, onError]);

  // Zur zuletzt gelesenen Seite springen
  useEffect(() => {
    if (!doc || jumped.current) return;
    jumped.current = true;
    const start = Math.min(file.lastPage ?? 1, doc.numPages);
    if (start > 1) window.setTimeout(() => box.current?.querySelector(`[data-page="${start}"]`)?.scrollIntoView({ block: 'start' }), 50);
  }, [doc, file.lastPage]);

  // Aktuelle Seite merken
  useEffect(() => {
    if (!doc || !box.current) return;
    const io = new IntersectionObserver((items) => {
      const seen = items.filter((i) => i.isIntersecting).map((i) => Number((i.target as HTMLElement).dataset.page));
      if (seen.length) setCurrent(Math.min(...seen));
    }, { rootMargin: '-40% 0px -55% 0px' });
    box.current.querySelectorAll('[data-page]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [doc]);
  useEffect(() => {
    if (!doc) return;
    const id = window.setTimeout(() => setLastPage(file.id, current).catch(() => undefined), 600);
    return () => window.clearTimeout(id);
  }, [current, doc, file.id]);

  if (!doc) return <div className="empty">{t('Lade …')}</div>;
  return (
    <>
      <span className="muted small" role="status">{t('Seite {n} von {total}', { n: current, total: doc.numPages })}</span>
      <div ref={box} className="pdf-pages">
        {sizes.map((s, i) => <PdfPageView key={i} doc={doc} n={i + 1} ratio={s.h / s.w} />)}
      </div>
    </>
  );
}

function PdfPageView({ doc, n, ratio }: { doc: PdfDoc; n: number; ratio: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = holder.current;
    if (!el || drawn) return;
    const io = new IntersectionObserver(async (items) => {
      if (!items.some((i) => i.isIntersecting) || !canvas.current) return;
      io.disconnect();
      const page = await doc.getPage(n);
      const width = el.clientWidth;
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale });
      canvas.current.width = Math.floor(viewport.width);
      canvas.current.height = Math.floor(viewport.height);
      await page.render({ canvas: canvas.current, viewport }).promise.catch(() => undefined);
      setDrawn(true);
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [doc, n, drawn]);
  return (
    <div ref={holder} data-page={n} className="pdf-page" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvas} aria-label={t('Seite {n}', { n })} role="img" />
    </div>
  );
}
