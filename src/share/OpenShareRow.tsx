import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listConnections } from '../api/connections';
import { IconDownload } from '../components/Icons';
import { t } from '../i18n';
import { importShareFile, type OpenedShare } from './importShare';

/** Zeigt die Zeile nur, wenn ein angemeldeter Server Kapitel teilen kann */
export function canOpenShares(): boolean {
  return listConnections().some((c) => !!c.token && !!c.shareKeys?.length);
}

/** „Geteiltes Kapitel öffnen“ (ab 0.4.30): Datei aus dem Gruppenchat in die Lesekopie übernehmen */
export function OpenShareRow() {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<OpenedShare | null>(null);
  const [failed, setFailed] = useState(false);

  const open = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setDone(null);
    setFailed(false);
    try { setDone(await importShareFile(file)); } catch { setFailed(true); } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className="list-row nav" disabled={busy} onClick={() => picker.current?.click()}>
        <IconDownload /><span className="lr-text">{t('Geteiltes Kapitel öffnen')}<span className="lr-sub">{t('Datei aus dem Gruppenchat')}</span></span>
      </button>
      <input ref={picker} type="file" hidden onChange={(e) => { open(e.target.files?.[0]); e.target.value = ''; }} />
      {failed && <div className="error" role="alert">{t('Diese Datei ist nicht für dich bestimmt.')}</div>}
      {done && (
        <div className="notice" role="status">
          <span>
            {done.sessionNumber != null
              ? t('Kapitel {n} ist jetzt in deiner Kampagne „{title}“.', { n: done.sessionNumber, title: done.campaignTitle })
              : t('Die Bibel von „{title}“ ist auf dem neuesten Stand der Datei.', { title: done.campaignTitle })}
            {done.sessionId && <> <Link to={`/v/${done.conn.id}/s/${done.sessionId}/recap`}>{t('Lesen')}</Link></>}
          </span>
        </div>
      )}
    </>
  );
}
