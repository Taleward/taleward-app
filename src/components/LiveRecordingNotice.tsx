import { Link, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import { useLive } from '../recorder/useLive';

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Läuft eine Browser-Aufnahme weiter, während man anderswo in der App ist: kurze Zeile mit dem Weg zurück */
export function LiveRecordingNotice() {
  const live = useLive(true);
  const path = useLocation().pathname;
  if (!live || live.recorder.state === 'idle') return null;
  const to = `/v/${live.connId}/k/${live.campaignId}/aufnahme`;
  if (path === to) return null;
  const paused = live.recorder.state === 'paused';
  return (
    <div className="table-rec" role="status">
      <span className={paused ? 'table-rec-dot paused' : 'table-rec-dot'} aria-hidden />
      <span style={{ flex: 1 }}>{paused ? t('Aufnahme pausiert') : t('Aufnahme läuft')} · {clock(live.recorder.elapsedMs())}</span>
      <Link className="btn small ghost" to={to}>{t('Zur Aufnahme')}</Link>
    </div>
  );
}
