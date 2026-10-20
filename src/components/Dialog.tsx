import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Einfaches Popup mit abgedunkeltem Hintergrund; schließt mit Escape oder Tippen daneben. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(20, 15, 10, 0.55)', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center', padding: '16px 12px calc(var(--safe-bottom) + 16px)'
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="card floating"
        style={{ width: '100%', maxWidth: 480, gap: 12, maxHeight: '85vh', overflowY: 'auto' }}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body
  );
}
