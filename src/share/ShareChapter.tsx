import { useState } from 'react';
import { api } from '../api/client';
import { currentConnection } from '../api/connections';
import type { Campaign } from '../api/types';
import { saveOrShare } from '../characters/backup';
import { ErrorBox } from '../components/Screen';
import { t } from '../i18n';

/** Kann dieser Server Kapitel als Datei teilen? (Schnittstelle 0.4.30, Signierschlüssel bekannt) */
export function serverCanShare(): boolean {
  try { return !!currentConnection().shareKeys?.length; } catch { return false; }
}

/**
 * „Kapitel teilen“ (nur SL, veröffentlichtes Kapitel): Datei vom Server holen und über das Teilen-Menü weitergeben –
 * für Gruppen, deren Server nur im Heimnetz läuft. Die Datei öffnet nur, wer Mitglied der Kampagne ist.
 */
export function ShareChapter({ campaign, sessionId }: { campaign: Campaign; sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [missing, setMissing] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setError(null);
    setMissing(null);
    try {
      const r = await api.shareChapter(campaign.id, sessionId);
      const names = r.missingKeys
        .map((id) => campaign.members.find((m) => m.id === id))
        .map((m) => m?.characterName || m?.displayName)
        .filter((x): x is string => !!x);
      if (names.length) setMissing(t('Für {names} geht es erst nach dem nächsten Treffen im WLAN.', { names: names.join(', ') }));
      const safeName = /^[A-Za-z0-9._-]{1,80}$/.test(r.fileName) ? r.fileName : 'taleward-kapitel.taleward';
      await saveOrShare(new File([r.file], safeName, { type: 'application/vnd.taleward.share+json' }), t('Kapitel teilen'));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ErrorBox error={error} />
      <button type="button" className="quiet-link" disabled={busy} onClick={share}>{t('Kapitel als Datei teilen')}</button>
      <p className="muted small" style={{ margin: '-6px 0 0' }}>
        {t('Für den Gruppenchat, wenn euer Server nur im Heimnetz läuft. Öffnen kann die Datei nur, wer in der Kampagne ist.')}
      </p>
      {missing && <div className="notice" role="status">{missing}</div>}
    </>
  );
}
