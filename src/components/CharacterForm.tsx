import { useState } from 'react';
import { api } from '../api/client';
import type { Campaign, Member } from '../api/types';
import { ImageCropper } from './ImageCropper';
import { t } from '../i18n';
import { Avatar } from './Avatar';
import { IconLock } from './Icons';
import { ErrorBox } from './Screen';

/**
 * Charakter bearbeiten: Name, Bild, Kurzbeschreibung (für alle), Hintergrund (nur für die SL).
 * Wird im Willkommens-Schritt und auf der Charakterseite benutzt.
 */
export function CharacterForm({ campaign, member, onSaved, submitLabel, secondary }: {
  campaign: Campaign;
  member: Member;
  onSaved: (m: Member) => void;
  submitLabel: string;
  secondary?: { label: string; onClick: () => void };
}) {
  const gm = member.role === 'gm';
  const [name, setName] = useState(member.characterName ?? '');
  const [summary, setSummary] = useState(member.characterSummary ?? '');
  const [backstory, setBackstory] = useState(member.characterBackstory ?? '');
  const [current, setCurrent] = useState(member);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async (action: () => Promise<Member | void>) => {
    setBusy(true);
    setError(null);
    try {
      const m = await action();
      if (m) setCurrent(m);
      return m;
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // Erst Ausschnitt wählen lassen, dann hochladen
  const [cropping, setCropping] = useState<File | null>(null);
  const uploadPortrait = (file: File | undefined) => {
    if (file) setCropping(file);
  };

  const removePortrait = () =>
    run(async () => {
      await api.deletePortrait(campaign.id, member.id);
      return { ...current, portraitUpdatedAt: null };
    });

  const save = async () => {
    const m = await run(() =>
      api.updateMember(campaign.id, member.id, gm
        ? {}
        : { characterName: name.trim(), characterSummary: summary.trim(), characterBackstory: backstory.trim() })
    );
    if (m) onSaved({ ...m, portraitUpdatedAt: current.portraitUpdatedAt });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row" style={{ gap: 14 }}>
        <Avatar campaignId={campaign.id} member={{ ...current, characterName: name || current.characterName }} size={72} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="btn small outline" style={{ opacity: busy ? 0.5 : 1 }}>
            {current.portraitUpdatedAt ? t('Bild ändern') : gm ? t('Bild hochladen') : t('Charakterbild hochladen')}
            <input type="file" accept="image/*" disabled={busy} onChange={(e) => { uploadPortrait(e.target.files?.[0]); e.target.value = ''; }}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} />
          </label>
          {current.portraitUpdatedAt && (
            <button type="button" className="btn small danger outline" disabled={busy} onClick={removePortrait}>{t('Bild entfernen')}</button>
          )}
        </div>
      </div>
      <span className="muted small" style={{ marginTop: -6 }}>{t('Selbst gemalt oder generiert – wird automatisch verkleinert.')}</span>

      {!gm && (
        <>
          <div className="field">
            <label htmlFor="c-name">{t('Name deines Charakters')}</label>
            <input id="c-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-summary">{t('Kurzbeschreibung (sehen alle)')}</label>
            <textarea id="c-summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder={t('z. B. Zwergischer Schmied, redet ungern über seine Familie')} />
          </div>
          <div className="field">
            <label htmlFor="c-backstory" className="row" style={{ gap: 6 }}>
              <IconLock size={14} /> {t('Hintergrund (nur für die Spielleitung)')}
            </label>
            <textarea id="c-backstory" rows={5} value={backstory} onChange={(e) => setBackstory(e.target.value)}
              placeholder={t('Geheimnisse, Schulden, alte Feinde …')} />
          </div>
        </>
      )}

      {cropping && (
        <ImageCropper file={cropping} onCancel={() => setCropping(null)}
          onDone={({ blob, crop }) => {
            setCropping(null);
            run(() => api.uploadPortrait(campaign.id, member.id, blob, crop));
          }} />
      )}
      <ErrorBox error={error} />
      <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? t('Speichern …') : submitLabel}</button>
      {secondary && <button type="button" className="btn ghost" disabled={busy} onClick={secondary.onClick}>{secondary.label}</button>}
    </div>
  );
}

/** Was am Charakter noch fehlt – für den Hinweis über dem Formular */
export function missingParts(c: { name?: string | null; summary?: string | null; portrait?: boolean }): string[] {
  return [
    !c.name ? t('Name') : null,
    !c.summary ? t('Kurzbeschreibung') : null,
    !c.portrait ? t('Bild') : null
  ].filter((x): x is string => !!x);
}

export function MissingHint({ parts }: { parts: string[] }) {
  if (!parts.length) return null;
  return <div className="notice" role="status">{t('Es fehlt noch: {list}.', { list: parts.join(', ') })}</div>;
}

/** Fehlt noch etwas Wichtiges am eigenen Charakter? (für den Hinweis auf der Übersicht) */
export function characterIncomplete(m: Member | undefined): boolean {
  if (!m || m.role === 'gm') return false;
  return !m.characterName || !m.characterSummary || !m.portraitUpdatedAt;
}
