import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { currentConnectionId } from '../api/connections';
import { t } from '../i18n';
import { IconMic } from './Icons';

const KEY = 'taleward.voiceHintDismissed';

function dismissedFor(connId: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
    return list.includes('*') || list.includes(connId);
  } catch {
    return false;
  }
}

/**
 * Freiwilliger Hinweis auf das Stimmprofil: erscheint nur ohne Stimmprofil auf diesem Server. Einmal wegklicken gilt
 * für alle Kampagnen und Server; anlegen geht weiter unter „Konten und Server“. Kein Druck – Aufnahmen funktionieren auch ohne (Vorstellungsrunde oder Zuordnung durch die SL).
 */
export function VoiceProfileHint() {
  const connId = currentConnectionId() ?? '-';
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (dismissedFor(connId)) return;
    let alive = true;
    api.voiceProfile().then((v) => { if (alive) setShow(v.status === 'none'); }).catch(() => undefined);
    return () => { alive = false; };
  }, [connId]);

  if (!show) return null;

  const dismiss = () => {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
      localStorage.setItem(KEY, JSON.stringify([...new Set([...list, '*'])]));
    } catch { /* egal */ }
    setShow(false);
  };

  // Eine Zeile statt einer Karte: freiwillig, also leise; „Nicht jetzt“ als ×
  return (
    <section className="list-box voice-hint" aria-label={t('Stimmprofil, freiwillig')}>
      <div className="row" style={{ gap: 4 }}>
        <Link className="list-row" style={{ flex: 1 }} to={`/v/${connId}/profil/stimme`}>
          <IconMic size={20} />
          <span className="lr-text">{t('Stimmprofil anlegen')}
            <span className="lr-sub">{t('Freiwillig. Der Server erkennt dich dann auch ohne Vorstellungsrunde.')}</span>
          </span>
        </Link>
        <button type="button" className="btn ghost square" aria-label={t('Nicht jetzt')} title={t('Nicht jetzt')} onClick={dismiss}>
          <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>×</span>
        </button>
      </div>
    </section>
  );
}
