import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFor } from '../api/client';
import type { Connection } from '../api/connections';
import { t, tk, tn } from '../i18n';
import { ErrorBox } from './Screen';
import { Missing } from './Missing';

/** Feste Fehlerschlüssel des Servers beim Import (0.4.8) → Sätze in der Sprache der App */
const IMPORT_MESSAGES: Record<string, string> = {
  import_format: tk('Das ist keine Taleward-Kampagnendatei.'),
  import_too_large: tk('Die Datei ist größer, als dieser Server annimmt.'),
  import_unsafe: tk('Die Datei ist beschädigt oder enthält Unzulässiges und wurde abgelehnt.'),
  import_version: tk('Die Datei stammt von einem neueren Server. Dieser Server muss erst aktualisiert werden.')
};

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Kampagne aus einer Datei taleward-kampagne/1 übernehmen (0.4.8): stückweise hochladen wie eine Aufnahme, der Server
 * prüft und legt eine neue Kampagne an, in der man selbst die Spielleitung ist. Danach die Plätze vergeben.
 */
export function ImportCampaign({ servers, onCancel }: { servers: Connection[]; onCancel: () => void }) {
  const navigate = useNavigate();
  const [serverId, setServerId] = useState(servers[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'pick' | 'upload' | 'check'>('pick');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const conn = servers.find((c) => c.id === serverId) ?? servers[0];

  const run = async () => {
    setTried(true);
    if (!file || !conn) return;
    const api = apiFor(conn);
    setError(null);
    setPhase('upload');
    setProgress(0);
    try {
      const imp = await api.startImport(file.name, file.size);
      for (let i = 0; i < imp.chunkCount; i++) {
        const part = file.slice(i * imp.chunkSizeBytes, (i + 1) * imp.chunkSizeBytes);
        // Ein Aussetzer im Netz soll nicht alles abbrechen: jeden Teil bis zu dreimal versuchen
        for (let attempt = 1; ; attempt++) {
          try {
            await api.putImportChunk(imp.importId, i, part);
            break;
          } catch (e) {
            if (attempt >= 3) throw e;
            await sleep(1500 * attempt);
          }
        }
        setProgress((i + 1) / imp.chunkCount);
      }
      setPhase('check');
      let st = await api.completeImport(imp.importId);
      while (st.state === 'processing' || st.state === 'uploading') {
        await sleep(2000);
        st = await api.importStatus(imp.importId);
      }
      if (st.state === 'failed' || !st.campaignId) {
        const key = st.message ?? '';
        throw new Error(IMPORT_MESSAGES[key] ? t(IMPORT_MESSAGES[key]) : key || t('Das hat nicht geklappt.'));
      }
      navigate(`/v/${conn.id}/k/${st.campaignId}`, { state: { imported: true } });
    } catch (e) {
      setError(e);
      setPhase('pick');
    }
  };

  return (
    <div className="card">
      <strong>{t('Kampagne aus Datei übernehmen')}</strong>
      <span className="muted small">{t('Für eine Datei taleward-kampagne-….zip, die eine Spielleitung auf ihrem alten Server unter „Kampagne verwalten“ → „Kampagne umziehen“ erstellt hat. Du wirst hier die Spielleitung.')}</span>
      {phase === 'pick' && (
        <>
          {servers.length > 1 && (
            <div className="field">
              <label htmlFor="iserver">{t('Auf welchen Server?')}</label>
              <select id="iserver" value={serverId} onChange={(e) => setServerId(e.target.value)}>
                {servers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <label className="btn outline">
            {file ? file.name : t('Datei wählen (taleward-kampagne-….zip)')}
            <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} />
          </label>
          <ErrorBox error={error} />
          <Missing text={file ? null : t('Bitte zuerst die Datei wählen.')} shown={tried} />
          <div className="row">
            <button className="btn small" type="button" onClick={run}>{t('Kampagne übernehmen')}</button>
            <button className="btn small ghost" type="button" onClick={onCancel}>{t('Abbrechen')}</button>
          </div>
        </>
      )}
      {phase !== 'pick' && (
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="small">
            {phase === 'upload'
              ? t('Datei wird übertragen … {p} %', { p: Math.round(progress * 100) })
              : t('Der Server prüft die Datei und legt die Kampagne an …')}
          </span>
          <div className="progress"><div style={{ width: `${phase === 'upload' ? Math.round(progress * 100) : 100}%` }} /></div>
          <span className="muted small">{phase === 'upload' && file ? tn(Math.ceil(file.size / (1024 * 1024)), '{n} MB', '{n} MB') + ' · ' : ''}{t('Bitte die App offen lassen.')}</span>
        </div>
      )}
    </div>
  );
}
