import { useEffect, useRef, useState } from 'react';
import { useEscape } from './useEscape';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import { t } from '../i18n';

/**
 * QR-Code mit der Handykamera lesen (z. B. Einladung am Tisch). Liefert den Text des Codes.
 * Läuft komplett auf dem Gerät; es wird nichts gespeichert oder verschickt.
 */
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
      const v = video.current;
      if (!done && v && ctx && v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          done = true;
          onResult(code.data);
          return;
        }
      }
      raf = requestAnimationFrame(scan);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => undefined);
        }
        raf = requestAnimationFrame(scan);
      })
      .catch(() => setError(t('Die Kamera ist nicht verfügbar. Erlaube den Zugriff in den Einstellungen oder füge den Link ein.')));

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onResult]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('QR-Code scannen')} style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#0c1518', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, padding: 'calc(var(--safe-top) + 16px) 20px calc(var(--safe-bottom) + 16px)', color: '#fbf6ea' }}>
      <div style={{ font: '700 22px/28px var(--font-serif)' }}>{t('QR-Code scannen')}</div>
      {error ? (
        <div className="notice" style={{ maxWidth: 320 }}>{error}</div>
      ) : (
        <div style={{ position: 'relative', width: 'min(300px, 80vw)', aspectRatio: '1', borderRadius: 18, overflow: 'hidden', boxShadow: '0 0 0 3px #fbf6ea' }}>
          <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <span className="small" style={{ color: '#d8d2c4' }}>{t('Den Einladungscode der Spielleitung ins Bild halten.')}</span>
      <button type="button" className="btn outline" onClick={onClose}>{t('Abbrechen')}</button>
    </div>,
    document.body
  );
}
