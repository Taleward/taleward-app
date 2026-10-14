import { useState } from 'react';
import type { WorldEntryIn } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { Dialog } from '../components/Dialog';
import { IconLock } from '../components/Icons';
import { ENTRY_KIND } from '../components/ProposalCard';
import { ErrorBox } from '../components/Screen';
import { t } from '../i18n';
import { removeWorldItem, saveWorldItem, type StoredCharacter, type WorldItem } from './store';

const TYPES: WorldEntryIn['type'][] = ['npc', 'location', 'faction', 'item', 'quest', 'other'];

/** Mitgebrachten Welt-Eintrag anlegen oder ändern (Familie, Heimatort, alte Feinde, Erbstück …) */
export function WorldItemDialog({ character, item, onClose }: { character: StoredCharacter; item: WorldItem | null; onClose: () => void }) {
  const [type, setType] = useState<WorldEntryIn['type']>(item?.type ?? 'npc');
  const [name, setName] = useState(item?.name ?? '');
  const [summary, setSummary] = useState(item?.summary ?? '');
  const [secret, setSecret] = useState(item?.secret ?? false);
  const [relation, setRelation] = useState(item?.relation ?? '');
  const [error, setError] = useState<unknown>(null);

  const save = () => {
    try {
      saveWorldItem(character.id, { id: item?.id, type, name: name.trim(), summary: summary.trim(), secret, relation: relation.trim() || null });
      onClose();
    } catch (e) {
      setError(e);
    }
  };

  const remove = async () => {
    if (!item) return;
    const sent = character.links.some((l) => l.submitted?.[item.id]);
    if (!(await confirmDialog(
      sent ? t('„{name}“ aus deiner Sammlung entfernen? In Kampagnen, die ihn schon übernommen haben, bleibt der Eintrag stehen.', { name: item.name })
        : t('„{name}“ entfernen?', { name: item.name }),
      { confirmLabel: t('Entfernen'), danger: true }))) return;
    removeWorldItem(character.id, item.id);
    onClose();
  };

  return (
    <Dialog title={item ? t('Eintrag bearbeiten') : t('Mitgebrachter Eintrag')} onClose={onClose}>
      <div className="field">
        <label htmlFor="w-type">{t('Art')}</label>
        <select id="w-type" value={type} onChange={(e) => setType(e.target.value as WorldEntryIn['type'])}>
          {TYPES.map((x) => <option key={x} value={x}>{t(ENTRY_KIND[x])}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="w-name">{t('Name')}</label>
        <input id="w-name" type="text" maxLength={200} value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t('z. B. Onkel Brann, Hafen von Velmar')} />
      </div>
      <div className="field">
        <label htmlFor="w-relation">{t('Beziehung zu {name} (freiwillig)', { name: character.nickname || character.name })}</label>
        <input id="w-relation" type="text" maxLength={120} value={relation} onChange={(e) => setRelation(e.target.value)}
          placeholder={t('z. B. Schwester, alter Lehrmeister, Erbstück der Mutter')} />
      </div>
      <div className="field">
        <label htmlFor="w-summary">{t('Beschreibung')}</label>
        <textarea id="w-summary" rows={4} maxLength={4000} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <label className="check">
        <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
        <span className="row" style={{ gap: 6 }}><IconLock size={14} /> {t('Geheim – nur die Spielleitung und du')}</span>
      </label>
      <span className="muted small">{t('Die Spielleitung entscheidet, ob und wie der Eintrag in die Bibel ihrer Kampagne kommt.')}</span>
      <ErrorBox error={error} />
      <button type="button" className="btn" disabled={!name.trim() || !summary.trim()} onClick={save}>{t('Speichern')}</button>
      {item && <button type="button" className="btn danger outline" onClick={remove}>{t('Entfernen')}</button>}
      <button type="button" className="btn ghost" onClick={onClose}>{t('Abbrechen')}</button>
    </Dialog>
  );
}
