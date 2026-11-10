import { Link } from 'react-router-dom';
import type { ProcessingStatus } from '../api/types';
import { IconInfo } from '../components/Icons';
import { t } from '../i18n';

/**
 * Warum eine Runde nicht weiterkommt (Schnittstelle 0.4.36). Der Server nennt den Grund erst nach 10 Minuten ohne
 * freien Weg; Spielende bekommen nur „waiting“. Für die SL ein Knopf, wenn sie selbst etwas schalten kann.
 */
export function WaitReasonNote({ status, campaignHref }: { status: ProcessingStatus; campaignHref: string | null }) {
  const reason = status.waitReason;
  if (!reason || reason === 'credit') return null; // credit: Satz aus creditWait
  const actions = status.waitActions ?? [];
  let text: string;
  switch (reason) {
    case 'no_worker':
      text = t('Gerade ist kein Worker erreichbar. Es geht weiter, sobald einer da ist.');
      break;
    case 'cloud_not_allowed':
      text = t('Gerade ist kein Worker erreichbar, und die Cloud ist für diese Kampagne nicht freigegeben.');
      break;
    case 'paused':
      text = t('Die Verarbeitung ist auf dem Server angehalten. Sie geht danach von selbst weiter.');
      break;
    default:
      text = t('Die Verarbeitung wartet. Die Spielleitung sieht, woran es liegt.');
  }
  return (
    <div className="notice" role="status">
      <span style={{ flexShrink: 0, color: 'var(--ink-muted)' }}><IconInfo /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        {text}
        {actions.length > 0 && campaignHref && (
          <Link className="btn small" to={campaignHref} state={{ manage: true }}>{t('Cloud freigeben')}</Link>
        )}
      </span>
    </div>
  );
}
