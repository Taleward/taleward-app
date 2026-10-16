import { currentConnectionId } from '../api/connections';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import type { Member } from '../api/types';
import { t } from '../i18n';
import { useBlobUrl } from './useBlobUrl';

const COLORS = ['var(--tinte)', '#3d6a48', '#6b4a6e', '#5d6b8a', '#7a5a2f'];

function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/**
 * Charakterbild im Kreis (Icon-Größe). Ohne Bild: Anfangsbuchstabe auf Farbe.
 * Antippen öffnet das Bild groß – geladen wird die große Fassung erst dann.
 */
export function Avatar({ campaignId, member, size = 32 }: { campaignId: string; member: Member; size?: number }) {
  const [open, setOpen] = useState(false);
  const key = member.portraitUpdatedAt ? `portrait:${currentConnectionId()}:${member.id}@${member.portraitUpdatedAt}:thumb` : null;
  const { url } = useBlobUrl(key, () => api.portrait(campaignId, member.id, 'thumb'));
  const label = member.characterName ?? member.displayName;
  const circle = {
    width: size, height: size, flexShrink: 0, borderRadius: '50%', overflow: 'hidden',
    display: 'grid', placeItems: 'center', background: colorFor(member.id), color: '#f3f3ee',
    fontFamily: 'var(--font-serif)', fontWeight: 800, fontSize: Math.round(size * 0.45), border: '2px solid var(--paper-raised)', boxShadow: '0 0 0 1px var(--line)'
  } as const;

  if (!key) {
    return <span style={circle} aria-hidden>{label.charAt(0).toUpperCase()}</span>;
  }
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        aria-label={t('Bild von {name} vergrößern', { name: label })}
        style={{ ...circle, padding: 0, cursor: 'zoom-in' }}>
        {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </button>
      {open && <PortraitLightbox campaignId={campaignId} member={member} onClose={() => setOpen(false)} />}
    </>
  );
}

function PortraitLightbox({ campaignId, member, onClose }: { campaignId: string; member: Member; onClose: () => void }) {
  const key = `portrait:${currentConnectionId()}:${member.id}@${member.portraitUpdatedAt}:full`;
  const { url, failed } = useBlobUrl(key, () => api.portrait(campaignId, member.id, 'full'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={member.characterName ?? member.displayName} onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20, 15, 10, 0.92)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14, padding: 'calc(var(--safe-top) + 20px) 20px calc(var(--safe-bottom) + 20px)'
      }}>
      {url && <img src={url} alt={t('Charakterbild von {name}', { name: member.characterName ?? member.displayName })}
        style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 'var(--radius)', objectFit: 'contain', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }} />}
      {!url && !failed && <div style={{ color: '#f3f3ee' }}>{t('Lade …')}</div>}
      {failed && <div style={{ color: '#f3f3ee' }}>{t('Das Bild konnte nicht geladen werden.')}</div>}
      <div style={{ textAlign: 'center', color: '#f3f3ee' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'calc(22px * var(--ts))', fontWeight: 700 }}>{member.characterName ?? member.displayName}</div>
        {member.characterName && <div style={{ color: '#c9d0d2' }}>{t('gespielt von {name}', { name: member.displayName })}</div>}
      </div>
      <button type="button" className="btn outline small" style={{ color: '#f3f3ee', borderColor: '#f3f3ee', background: 'transparent' }} onClick={onClose}>
        {t('Schließen')}
      </button>
    </div>,
    document.body
  );
}
