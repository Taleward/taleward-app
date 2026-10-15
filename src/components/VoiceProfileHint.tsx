import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { currentConnectionId } from '../api/connections';
import { t } from '../i18n';

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

  return (
    <section className="card" aria-labelledby="voice-hint-title">
      <strong id="voice-hint-title">{t('Stimmprofil, freiwillig')}</strong>
      <span className="small">{t('Der Server erkennt dich dann in Aufnahmen, auch ohne Vorstellungsrunde. Dafür liest du einmal einen kurzen Text vor.')}</span>
      <span className="muted small">{t('Gespeichert wird nur ein Stimmabdruck, keine Aufnahme. Jederzeit löschbar.')}</span>
      <div className="row wrap" style={{ gap: 8 }}>
        <Link className="btn small outline" to={`/v/${connId}/profil/stimme`}>{t('Stimmprofil anlegen')}</Link>
        <button type="button" className="btn small ghost" onClick={dismiss}>{t('Nicht jetzt')}</button>
      </div>
    </section>
  );
}
