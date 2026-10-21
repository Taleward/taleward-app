import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { apiAtLeast } from '../api/connections';
import type { Entry, EntryInput, EntryType, Link, Member } from '../api/types';
import { LinkButtons, LinkEditor } from '../components/Links';
import { ENTRY_KIND } from '../components/ProposalCard';
import { ErrorBox } from '../components/Screen';
import { SecretBox, VisTag } from '../components/VisTag';
import { t } from '../i18n';
import { fuzzyFilter } from '../search/fuzzy';
import { rememberName } from './currentPlan';

const QUICK_TYPES: EntryType[] = ['npc', 'location', 'item', 'faction', 'quest', 'other'];

const UNDO_SECONDS = 10;

/**
 * Bibel am Tisch: Suche „Wer war das?“ (fehlertolerant), alles mit Geheimem und SL-Notizen, Aufdecken mit ein paar
 * Sekunden zum Zurücknehmen.
 */
export function BiblePanel({ campaignId, members, query, onQuery, focusEntryId, compact, onEntry }: {
  campaignId: string;
  members: Member[];
  query: string;
  onQuery: (q: string) => void;
  /** Von außen (Kapitelplan) gewählter Eintrag: aufklappen und hinscrollen */
  focusEntryId: string | null;
  /** Kleine Karte: nur Suchfeld und die besten Treffer; Tippen öffnet die Bibel groß */
  compact?: boolean;
  onEntry?: (entryId: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [undo, setUndo] = useState<{ entry: Entry; before: Partial<EntryInput>; left: number } | null>(null);
  const timer = useRef<number | null>(null);
  const [quick, setQuick] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickType, setQuickType] = useState<EntryType>('npc');
  const [linking, setLinking] = useState<string | null>(null);

  /** Neuer Eintrag in fünf Sekunden: geheim angelegt, Name gleich als Schreibhilfe für die Abschrift */
  const quickAdd = async () => {
    const name = quickName.trim();
    if (!name) return;
    setError(null);
    try {
      const e = await api.createEntry(campaignId, { type: quickType, name, summary: '', visibility: 'gm_only' });
      setEntries((list) => [...(list ?? []), e].sort((a, b) => a.name.localeCompare(b.name)));
      setQuickName('');
      setQuick(false);
      setOpen(e.id);
      window.setTimeout(() => document.getElementById(`tb-${e.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
      rememberName(campaignId, name);
    } catch (err) {
      setError(err);
    }
  };

  const saveLinks = async (e: Entry, links: Link[]) => {
    setError(null);
    try {
      replace(await api.updateEntry(e.id, { links }));
      setLinking(null);
    } catch (err) {
      setError(err);
    }
  };

  useEffect(() => {
    api.entries(campaignId).then(setEntries).catch(setError);
  }, [campaignId]);

  const loaded = entries !== null;
  useEffect(() => {
    if (!focusEntryId || !loaded) return;
    setOpen(focusEntryId);
    window.setTimeout(() => document.getElementById(`tb-${focusEntryId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }, [focusEntryId, loaded]);

  // Rückweg-Uhr
  useEffect(() => {
    if (!undo) return;
    if (undo.left <= 0) { setUndo(null); return; }
    timer.current = window.setTimeout(() => setUndo((u) => (u ? { ...u, left: u.left - 1 } : u)), 1000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [undo]);

  const replace = (e: Entry) => setEntries((list) => list?.map((x) => (x.id === e.id ? e : x)) ?? null);

  const reveal = async (e: Entry) => {
    setError(null);
    const before = { visibility: e.visibility, hiddenFromMemberIds: e.hiddenFromMemberIds ?? [] };
    try {
      const u = await api.updateEntry(e.id, { visibility: 'public', hiddenFromMemberIds: [] });
      replace(u);
      setUndo({ entry: u, before, left: UNDO_SECONDS });
    } catch (err) {
      setError(err);
    }
  };

  const takeBack = async () => {
    if (!undo) return;
    const { entry, before } = undo;
    setUndo(null);
    try {
      replace(await api.updateEntry(entry.id, before));
    } catch (err) {
      setError(err);
    }
  };

  const shown = entries ? fuzzyFilter(entries, query, (e) => [e.name, ...(e.aliases ?? []), e.summary ?? '', e.gmNotes ?? '']) : null;
  const hiddenNames = (e: Entry) => (e.hiddenFromMemberIds ?? [])
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => !!m)
    .map((m) => m.characterName ?? m.displayName);

  if (compact) {
    return (
      <div className="table-panel-body">
        <div className="field">
          <label htmlFor="tbc-search">{t('Wer war das?')}</label>
          <input id="tbc-search" type="search" value={query} placeholder={t('Name, Ort, Gegenstand …')} onChange={(ev) => onQuery(ev.target.value)} />
        </div>
        <ErrorBox error={error} />
        {query.trim() && shown?.length === 0 && <span className="muted small">{t('Nichts gefunden für „{q}“.', { q: query })}</span>}
        {query.trim() && (shown?.length ?? 0) > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {shown!.slice(0, 4).map((e) => (
              <button key={e.id} type="button" className="btn small outline" onClick={() => onEntry?.(e.id)}>
                {e.name}{e.visibility === 'gm_only' ? ' · ' + t('Nur SL') : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="table-panel-body">
      <div className="field table-sticky">
        <label htmlFor="tb-search">{t('Wer war das?')}</label>
        <input id="tb-search" type="search" value={query} placeholder={t('Name, Ort, Gegenstand …')} onChange={(ev) => onQuery(ev.target.value)} />
      </div>
      {!quick ? (
        <button type="button" className="linklike small" style={{ alignSelf: 'flex-start', minHeight: 48 }} onClick={() => setQuick(true)}>{t('Schnell anlegen')}</button>
      ) : (
        <form className="table-quick" onSubmit={(ev) => { ev.preventDefault(); quickAdd(); }}>
          <input type="text" aria-label={t('Name des neuen Eintrags')} placeholder={t('Name')} value={quickName} maxLength={120} autoFocus onChange={(ev) => setQuickName(ev.target.value)} />
          <select aria-label={t('Art')} value={quickType} onChange={(ev) => setQuickType(ev.target.value as EntryType)}>
            {QUICK_TYPES.map((k) => <option key={k} value={k}>{t(ENTRY_KIND[k])}</option>)}
          </select>
          <button type="submit" className="btn small" disabled={!quickName.trim()}>{t('Anlegen')}</button>
          <button type="button" className="btn small ghost" onClick={() => setQuick(false)}>{t('Abbrechen')}</button>
          <span className="muted small" style={{ flexBasis: '100%' }}>{t('Wird geheim angelegt und als Schreibhilfe für die Abschrift gemerkt. Beschreiben kannst du ihn später.')}</span>
        </form>
      )}
      <ErrorBox error={error} />
      {undo && (
        <div className="notice" role="status" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{t('„{name}“ ist aufgedeckt.', { name: undo.entry.name })}</span>
          <button type="button" className="btn small outline" onClick={takeBack}>{t('Zurücknehmen ({n})', { n: undo.left })}</button>
        </div>
      )}
      {!entries && !error && <div className="empty">{t('Lade …')}</div>}
      {shown?.length === 0 && <div className="empty">{query ? t('Nichts gefunden für „{q}“.', { q: query }) : t('Die Bibel ist noch leer.')}</div>}
      {shown?.map((e) => {
        const secret = e.visibility === 'gm_only';
        const partly = !secret && (e.hiddenFromMemberIds?.length ?? 0) > 0;
        const isOpen = open === e.id;
        return (
          <section key={e.id} id={`tb-${e.id}`} className={isOpen ? 'table-entry open' : 'table-entry'}>
            <button type="button" className="table-entry-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{e.name}</strong>
                <span className="muted small"> · {t(ENTRY_KIND[e.type])}{e.lastSessionNumber ? ' · ' + t('zuletzt in Kapitel {n}', { n: e.lastSessionNumber }) : ''}</span>
              </span>
              {/* Nur das Seltene markieren: Öffentliches bleibt ohne Marke */}
              {secret && <VisTag gm />}
            </button>
            {isOpen && (
              <div className="table-entry-body">
                {e.summary && <p className="small" style={{ margin: 0 }}>{e.summary}</p>}
                {e.gmNotes && <SecretBox>{e.gmNotes}</SecretBox>}
                {partly && <span className="small" style={{ color: 'var(--siegel-text)' }}>{t('nicht für {names}', { names: hiddenNames(e).join(', ') })}</span>}
                <LinkButtons links={e.links} />
                {linking === e.id
                  ? <LinkEditor links={e.links ?? []} max={3} canShare onSave={(l) => saveLinks(e, l)} onCancel={() => setLinking(null)} />
                  : (
                    <div className="row wrap" style={{ gap: 6 }}>
                      {(secret || partly) && (
                        <button type="button" className="btn small outline" onClick={() => reveal(e)}>
                          {secret ? t('Aufdecken') : t('Für alle aufdecken')}
                        </button>
                      )}
                      {apiAtLeast('0.4.13') && (
                        <button type="button" className="btn small ghost" onClick={() => setLinking(e.id)}>{(e.links?.length ?? 0) ? t('Links bearbeiten') : t('Link hinzufügen')}</button>
                      )}
                    </div>
                  )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
