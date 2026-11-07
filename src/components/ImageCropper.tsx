import { useEffect, useRef, useState } from 'react';
import { useEscape } from './useEscape';
import { createPortal } from 'react-dom';
import { resizeImage } from '../covers/resize';
import { t } from '../i18n';

export interface CropResult {
  /** Verkleinertes Bild (lange Kante ≤ 1024 px), das hochgeladen wird */
  blob: Blob;
  /** Quadratischer Ausschnitt für den Kreis, in Pixeln dieses Bildes */
  crop: { x: number; y: number; size: number };
}

/**
 * Ausschnitt fürs Charakterbild wählen: Bild verschieben (ziehen), vergrößern (Regler oder zwei Finger).
 * Das ganze Bild wird hochgeladen; der Server schneidet daraus den Kreis. Die Großansicht zeigt das ganze Bild.
 */
export function ImageCropper({ file, onDone, onCancel }: { file: Blob; onDone: (r: CropResult) => void; onCancel: () => void }) {
  const V = Math.min(300, window.innerWidth - 64);
  const [img, setImg] = useState<{ blob: Blob; url: string; w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEscape(onCancel);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    let url = '';
    resizeImage(file, 1024, 0.85)
      .then((blob) => new Promise<void>((resolve, reject) => {
        url = URL.createObjectURL(blob);
        const el = new Image();
        el.onload = () => {
          setImg({ blob, url, w: el.naturalWidth, h: el.naturalHeight });
          const s = V / Math.min(el.naturalWidth, el.naturalHeight);
          setOff({ x: (V - el.naturalWidth * s) / 2, y: (V - el.naturalHeight * s) / 2 });
          resolve();
        };
        el.onerror = () => reject(new Error());
        el.src = url;
      }))
      .catch((e) => setError(e instanceof Error && e.message ? e.message : t('Das Bild konnte nicht gelesen werden.')));
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const base = img ? V / Math.min(img.w, img.h) : 1;
  const scale = base * zoom;

  // Bild muss den Kreis immer ganz ausfüllen
  const clamp = (x: number, y: number, s = scale) => img
    ? { x: Math.min(0, Math.max(V - img.w * s, x)), y: Math.min(0, Math.max(V - img.h * s, y)) }
    : { x, y };

  const setZoomKeepCenter = (z: number) => {
    if (!img) return;
    const nz = Math.min(4, Math.max(1, z));
    const ns = base * nz;
    const cx = (V / 2 - off.x) / scale;
    const cy = (V / 2 - off.y) / scale;
    setZoom(nz);
    setOff(clamp(V / 2 - cx * ns, V / 2 - cy * ns, ns));
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoomKeepCenter(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist));
    } else if (pointers.current.size === 1) {
      setOff((o) => clamp(o.x + e.clientX - prev.x, o.y + e.clientY - prev.y));
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const done = () => {
    if (!img) return;
    const size = Math.round(V / scale);
    onDone({
      blob: img.blob,
      crop: {
        x: Math.max(0, Math.min(img.w - size, Math.round(-off.x / scale))),
        y: Math.max(0, Math.min(img.h - size, Math.round(-off.y / scale))),
        size: Math.min(size, img.w, img.h)
      }
    });
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('Ausschnitt wählen')} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(12, 18, 21, 0.94)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 18, padding: 'calc(var(--safe-top) + 16px) 20px calc(var(--safe-bottom) + 16px)', color: '#fbf6ea' }}>
      <div style={{ font: '700 22px/28px var(--font-serif)' }}>{t('Ausschnitt wählen')}</div>
      {error && <div className="error" role="alert">{error}</div>}
      <div
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onWheel={(e) => setZoomKeepCenter(zoom * (e.deltaY < 0 ? 1.08 : 0.93))}
        style={{ width: V, height: V, borderRadius: '50%', overflow: 'hidden', position: 'relative', touchAction: 'none',
          cursor: 'grab', boxShadow: '0 0 0 3px #fbf6ea, 0 10px 30px rgba(0,0,0,0.6)', background: '#223' }}>
        {img && (
          <img src={img.url} alt="" draggable={false}
            style={{ position: 'absolute', left: off.x, top: off.y, width: img.w * scale, height: img.h * scale, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }} />
        )}
      </div>
      <div style={{ width: V, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="crop-zoom" className="small" style={{ color: '#d8d2c4' }}>{t('Größe')}</label>
        <input id="crop-zoom" type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomKeepCenter(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#fbf6ea' }} />
        <span className="small" style={{ color: '#d8d2c4', textAlign: 'center' }}>{t('Ziehen zum Verschieben')}</span>
      </div>
      <div className="row" style={{ gap: 10, width: V }}>
        <button type="button" className="btn" style={{ flex: 1, background: '#fbf6ea', color: '#17313b', borderColor: '#fbf6ea' }} disabled={!img} onClick={done}>
          {t('Übernehmen')}
        </button>
        <button type="button" className="btn outline" onClick={onCancel}>{t('Abbrechen')}</button>
      </div>
    </div>,
    document.body
  );
}
