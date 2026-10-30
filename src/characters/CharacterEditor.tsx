import { useState } from 'react';
import { PronounField } from '../components/PronounField';
import { ImageCropper } from '../components/ImageCropper';
import { IconLock } from '../components/Icons';
import { ErrorBox } from '../components/Screen';
import { t } from '../i18n';
import { guessSystem, levelKind } from './levelField';
import { LEVEL_LABEL, LEVEL_PLACEHOLDER } from './levelLabels';
import { CharacterPortrait } from './Portrait';
import { blobToPortrait, createCharacter, updateCharacter, type PortraitMeta, type StoredCharacter } from './store';

/**
 * Charakter der Sammlung anlegen oder bearbeiten: Bild, Name, Rufname, Regelsystem, Kurzbeschreibung (sehen alle
 * am Tisch), Hintergrund (nur Spielleitung). Gespeichert wird nur in der App; an Kampagnen geht es erst beim Abgleich.
 */
export function CharacterEditor({ character, submitLabel, onSaved, secondary, initialName }: {
  character?: StoredCharacter;
  submitLabel: string;
  onSaved: (c: StoredCharacter) => void;
  secondary?: { label: string; onClick: () => void };
  initialName?: string;
}) {
  const [name, setName] = useState(character?.name ?? initialName ?? '');
  const [nickname, setNickname] = useState(character?.nickname ?? '');
  const [system, setSystem] = useState(character?.system ?? '');
  const [pronouns, setPronouns] = useState(character?.pronouns ?? '');
  const [level, setLevel] = useState(character?.level ?? '');
  const kind = levelKind(guessSystem(system));
  const [summary, setSummary] = useState(character?.summary ?? '');
  const [backstory, setBackstory] = useState(character?.backstory ?? '');
  const [portrait, setPortrait] = useState<{ portrait: string | null; portraitMeta: PortraitMeta | null }>({
    portrait: character?.portrait ?? null, portraitMeta: character?.portraitMeta ?? null
  });
  const [cropping, setCropping] = useState<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const id = character?.id ?? 'neu';

  const save = () => {
    setError(null);
    try {
      const data = {
        name: name.trim(), nickname: nickname.trim() || null, system: system.trim() || null, pronouns: pronouns.trim() || null,
        // Ohne Feld (z. B. Shadowrun) bleibt ein früher eingetragener Wert stehen
        level: kind ? level.trim() || null : character?.level ?? null,
        summary: summary.trim() || null, backstory: backstory.trim() || null, ...portrait
      };
      onSaved(character ? updateCharacter(character.id, data) : createCharacter(data));
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row" style={{ gap: 14 }}>
        <CharacterPortrait id={id} name={name || '?'} portrait={portrait.portrait} meta={portrait.portraitMeta} size={80} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="btn small outline">
            {portrait.portrait ? t('Bild ändern') : t('Charakterbild hochladen')}
            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropping(f); e.target.value = ''; }}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} />
          </label>
          {portrait.portrait && (
            <button type="button" className="btn small danger outline" onClick={() => setPortrait({ portrait: null, portraitMeta: null })}>
              {t('Bild entfernen')}
            </button>
          )}
        </div>
      </div>

      <div className="field">
        <label htmlFor="ch-name">{t('Name')}</label>
        <input id="ch-name" type="text" maxLength={128} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="ch-nick">{t('Rufname (optional)')}</label>
          <input id="ch-nick" type="text" maxLength={64} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="ch-system">{t('Regelsystem (optional)')}</label>
          <input id="ch-system" type="text" maxLength={64} value={system} onChange={(e) => setSystem(e.target.value)}
            placeholder={t('z. B. DSA 5')} />
        </div>
      </div>
      <PronounField id="ch-pronouns" value={pronouns} onChange={setPronouns} />
      {kind && (
        <div className="field">
          <label htmlFor="ch-level">{t(LEVEL_LABEL[kind])}</label>
          <input id="ch-level" type="text" maxLength={64} value={level} onChange={(e) => setLevel(e.target.value)}
            placeholder={LEVEL_PLACEHOLDER[kind] ? t(LEVEL_PLACEHOLDER[kind]!) : undefined} />
        </div>
      )}
      <div className="field">
        <label htmlFor="ch-summary">{t('Kurzbeschreibung (sehen alle am Tisch)')}</label>
        <textarea id="ch-summary" rows={3} maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)}
          placeholder={t('z. B. Zwergischer Schmied, redet ungern über seine Familie')} />
      </div>
      <div className="field">
        <label htmlFor="ch-backstory" className="row" style={{ gap: 6 }}>
          <IconLock size={14} /> {t('Hintergrund (nur für die Spielleitung)')}
        </label>
        <textarea id="ch-backstory" rows={5} maxLength={20000} value={backstory} onChange={(e) => setBackstory(e.target.value)}
          placeholder={t('Geheimnisse, Schulden, alte Feinde …')} />
      </div>

      {cropping && (
        <ImageCropper file={cropping} onCancel={() => setCropping(null)}
          onDone={({ blob, crop }) => {
            setCropping(null);
            blobToPortrait(blob, crop).then(setPortrait).catch(setError);
          }} />
      )}
      <ErrorBox error={error} />
      <button type="button" className="btn" disabled={!name.trim()} onClick={save}>{submitLabel}</button>
      {secondary && <button type="button" className="btn ghost" onClick={secondary.onClick}>{secondary.label}</button>}
    </div>
  );
}
