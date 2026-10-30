import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmDialog } from '../components/confirm';
import { formatDate } from '../components/format';
import { ErrorBox } from '../components/Screen';
import { IconTrash } from '../components/Icons';
import { t } from '../i18n';
import { addFile, fileKind, formatSize, getFile, listFiles, onFilesChanged, removeFile, type CharacterFileMeta } from './files';
import { openWithDevice } from './openFile';

export function useCharacterFiles(characterId: string | undefined): CharacterFileMeta[] | null {
  const [files, setFiles] = useState<CharacterFileMeta[] | null>(null);
  useEffect(() => {
    if (!characterId) return;
    const load = () => listFiles(characterId).then(setFiles).catch(() => setFiles([]));
    load();
    return onFilesChanged(load);
  }, [characterId]);
  return files;
}

/** Datei öffnen: PDF, Bild und Text zeigt die App selbst, alles andere ein Programm des Geräts */
export function fileHref(characterId: string, f: CharacterFileMeta): string | null {
  return fileKind(f) === 'other' ? null : `/charaktere/${characterId}/datei/${f.id}`;
}

/**
 * „Unterlagen“ in der Sammlung: beliebig viele Dateien je Charakter, nur auf diesem Gerät. Beim Abgeben in einer
 * Kampagne gelten die Grenzen des Servers.
 */
export function Attachments({ characterId, name }: { characterId: string; name: string }) {
  const files = useCharacterFiles(characterId);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(list)) await addFile(characterId, f);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const openOther = async (f: CharacterFileMeta) => {
    setError(null);
    try {
      const rec = await getFile(f.id);
      if (rec) await openWithDevice(rec, f.name);
    } catch (e) {
      setError(e);
    }
  };

  const remove = async (f: CharacterFileMeta) => {
    if (!(await confirmDialog(t('„{file}“ von {name} löschen?', { file: f.name, name }), { confirmLabel: t('Löschen'), danger: true }))) return;
    removeFile(f.id).catch(setError);
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2>{t('Unterlagen')}</h2>
      {files && files.length > 0 && (
        <div className="list-box">
          {files.map((f) => {
            const href = fileHref(characterId, f);
            const sub = [formatSize(f.size), formatDate(f.addedAt)].join(' · ');
            const label = <span className="lr-text">{f.name}<span className="lr-sub">{sub}</span></span>;
            return (
              <div key={f.id} className="file-row">
                {href
                  ? <Link className="list-row nav" to={href}>{label}</Link>
                  : <button type="button" className="list-row nav" onClick={() => openOther(f)}>{label}<span className="lr-val">{t('Öffnen mit …')}</span></button>}
                <button type="button" className="btn ghost square" aria-label={t('„{file}“ löschen', { file: f.name })} onClick={() => remove(f)}><IconTrash size={18} /></button>
              </div>
            );
          })}
        </div>
      )}
      <ErrorBox error={error} />
      <button type="button" className="btn outline" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => picker.current?.click()}>
        {busy ? t('Wird gespeichert …') : t('Datei anhängen')}
      </button>
      <input ref={picker} type="file" hidden multiple onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
    </section>
  );
}
