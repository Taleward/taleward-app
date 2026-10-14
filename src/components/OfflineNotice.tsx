import { useSyncExternalStore } from 'react';
import { getConnection } from '../api/connections';
import { offlineSince, onOfflineChange } from '../api/readCopy';
import { t } from '../i18n';
import { formatDateTime } from './format';
import { IconInfo } from './Icons';

/** Seit wann dieser Server nur aus der Lesekopie kommt (null = erreichbar) */
export function useOfflineSince(connId: string | null | undefined): string | null {
  return useSyncExternalStore(onOfflineChange, () => offlineSince(connId));
}

/** Hinweis oben auf jeder Seite einer Kampagne, solange die App aus der Lesekopie liest (Benjamin 14.10.) */
export function OfflineNotice({ connId }: { connId: string | null | undefined }) {
  const since = useOfflineSince(connId);
  if (!since || !connId) return null;
  const name = getConnection(connId)?.name ?? t('Server');
  return (
    <div className="notice offline-notice" role="status">
      <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
      <span>
        <strong>{t('Stand vom {date}', { date: formatDateTime(since) })}</strong>{' '}
        {t('„{name}“ ist gerade nicht erreichbar. Du kannst lesen, was du zuletzt gesehen hast. Ändern geht erst wieder, wenn der Server erreichbar ist.', { name })}
      </span>
    </div>
  );
}
