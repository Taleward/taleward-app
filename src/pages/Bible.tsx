import { isDeletedMember } from '../api/types';
import { PlayerPicker } from '../components/PlayerPicker';
import { confirmDialog } from '../components/confirm';
import { SecretBox, VisTag } from '../components/VisTag';
import { LinkButtons } from '../components/Links';
import { apiAtLeast, p } from '../api/connections';
import { aliasesText, parseAliases } from '../bible/aliases';
import { Link } from 'react-router-dom';
import { t, tk } from '../i18n';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fuzzyFilter } from '../search/fuzzy';
import { api } from '../api/client';
import type { Campaign, Entry, EntryType, Member } from '../api/types';
import { Dialog } from '../components/Dialog';
import { AssignFigureDialog } from '../components/Seats';
import { IconEye } from '../components/Icons';
import { IconLock } from '../components/Icons';
import { ErrorBox, Screen, clearStoredUnread, rememberCampaign, sessionStorageSet } from '../components/Screen';

const TABS: { type: EntryType; label: string }[] = [
  { type: 'npc', label: tk('NSCs') },
  { type: 'location', label: tk('Orte') },
  { type: 'quest', label: tk('Quests') },
  { type: 'item', label: tk('Beute') }
];

function Tag({ entry }: { entry: Entry }) {
  if (entry.visibility === 'gm_only') return <VisTag gm />;
  if (entry.type === 'quest' && entry.status === 'active') return <span className="pill brass">{t('aktiv')}</span>;
  if (entry.type === 'quest' && entry.status === 'done') return <span className="pill moss">{t('erledigt')}</span>;
  return null;
}

export function Bible() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tab, setTab] = useState<EntryType>('npc');
  // Suche aus der Übersicht kommt als ?q= mit
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [all, setAll] = useState<Entry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    sessionStorageSet('lastCampaign', campaignId);
    api.campaign(campaignId).then((c) => {
      setCampaign(c);
      rememberCampaign(c);
      if (c.unread?.bible) api.markSeen(campaignId, 'bible').then(() => clearStoredUnread(campaignId, 'bible')).catch(() => undefined);
    }).catch(setError);
  }, [campaignId]);

  // Die ganze Bibel einmal laden (der Server gibt nur, was diese Person sehen darf) und hier fehlertolerant suchen:
  // „Kasmürin“ findet „Kasmyrin“, kleine Tippfehler auch
  useEffect(() => {
    api.entries(campaignId).then(setAll).catch(setError);
  }, [campaignId, reload]);

  const entries = all && (query.trim()
    ? fuzzyFilter(all, query, (e) => [e.name, ...(e.aliases ?? []), e.summary, e.gmNotes ?? ''])
    : all.filter((e) => e.type === tab));
  const holder = (id: string | null | undefined) => {
    const m = campaign?.members.find((x) => x.id === id);
    return m ? t('Bei {name}', { name: m.characterName ?? m.displayName }) : null;
  };

  return (
    <Screen overline={campaign?.title ?? ' '} title={t('Kampagnenbibel')} hero={{ campaign }}>
      <ErrorBox error={error} />
      {campaign?.myRole === 'gm' && (
        <Link to={p(`/k/${campaignId}/unterlagen`)} className="btn outline small" style={{ alignSelf: 'flex-start' }}>
          {t('Unterlagen hochladen und auswerten')}
        </Link>
      )}
      <div className="field">
        <label htmlFor="search">{t('Suchen')}</label>
        <input id="search" type="search" placeholder={t('Name, Ort, Gegenstand …')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {!query && (
        <div className="segmented" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {TABS.map((item) => (
            <button key={item.type} type="button" aria-pressed={tab === item.type} onClick={() => setTab(item.type)}>
              {t(item.label)}
            </button>
          ))}
        </div>
      )}

      {entries?.length === 0 && (
        <div className="empty">{query ? t('Nichts gefunden für „{q}“.', { q: query }) : t('Hier steht noch nichts. Einträge entstehen aus freigegebenen Vorschlägen.')}</div>
      )}

      {/* Karten einer Reihe gleich hoch – sonst enden sie mit Löchern darunter */}
      <div className="grid-cards even">
      {entries?.map((e) => (
        <EntryCard key={e.id} entry={e} gm={campaign?.myRole === 'gm'} holder={holder(e.holderMemberId)} campaign={campaign}
          players={campaign?.members.filter((m) => m.role === 'player' && !isDeletedMember(m)) ?? []}
          onChanged={(u) => setAll((list) => (u ? list?.map((x) => (x.id === u.id ? u : x)) : list?.filter((x) => x.id !== e.id)) ?? null)} />
      ))}
      </div>

      {campaign?.myRole === 'gm' &&
        (adding ? (
          <AddEntry
            campaignId={campaignId}
            type={tab}
            onDone={(saved) => {
              setAdding(false);
              if (saved) setReload((n) => n + 1);
            }}
          />
        ) : (
          <button type="button" className="btn dashed" onClick={() => setAdding(true)}>
            {t('Eintrag von Hand hinzufügen')}
          </button>
        ))}
    </Screen>
  );
}

function AddEntry({ campaignId, type, onDone }: { campaignId: string; type: EntryType; onDone: (saved: boolean) => void }) {
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [secret, setSecret] = useState(false);
  const [gmNotes, setGmNotes] = useState('');
  const [error, setError] = useState<unknown>(null);

  const save = async () => {
    try {
      await api.createEntry(campaignId, {
        type,
        name: name.trim(),
        summary: summary.trim(),
        visibility: secret ? 'gm_only' : 'public',
        gmNotes: gmNotes.trim() || null,
        status: type === 'quest' ? 'active' : null
      });
      onDone(true);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="card">
      <h2>{t('Neuer Eintrag: {kind}', { kind: t(TABS.find((tab) => tab.type === type)?.label ?? '') })}</h2>
      <div className="field">
        <label htmlFor="e-name">{t('Name')}</label>
        <input id="e-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="e-sum">{t('Beschreibung')}</label>
        <textarea id="e-sum" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="e-gm" className="row" style={{ gap: 6 }}><IconLock size={14} /> {t('Nur SL (geheimer Teil)')}</label>
        <textarea id="e-gm" value={gmNotes} onChange={(e) => setGmNotes(e.target.value)} placeholder={t('Was Spieler (noch) nicht wissen dürfen')} />
      </div>
      <label className="check">
        <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
        <span>{t('Ganzer Eintrag nur für die Spielleitung')}</span>
      </label>
      <ErrorBox error={error} />
      <div className="row">
        <button type="button" className="btn small" disabled={!name.trim()} onClick={save}>{t('Speichern')}</button>
        <button type="button" className="btn small ghost" onClick={() => onDone(false)}>{t('Abbrechen')}</button>
      </div>
    </div>
  );
}

/** Ein Bibeleintrag; die SL kann bearbeiten, Sätze zwischen öffentlich und geheim verschieben, freigeben, löschen */
function EntryCard({ entry: e, gm, holder, campaign, players, onChanged }: {
  entry: Entry;
  gm: boolean;
  holder: string | null;
  campaign: Campaign | null;
  players: Member[];
  onChanged: (updated: Entry | null) => void;
}) {
  const [hiding, setHiding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  // NSC, der aus der Figur eines ausgetretenen Spielers entstanden ist (0.4.9, nur SL)
  const former = e.formerHolderMemberId ? campaign?.members.find((m) => m.id === e.formerHolderMemberId) : undefined;
  const [name, setName] = useState(e.name);
  const [summary, setSummary] = useState(e.summary);
  const [gmNotes, setGmNotes] = useState(e.gmNotes ?? '');
  // „Auch genannt“ (ab 0.4.21): andere Namen, durch Komma getrennt
  const withAliases = apiAtLeast('0.4.21');
  const [aliases, setAliases] = useState(aliasesText(e.aliases));
  const [secret, setSecret] = useState(e.visibility === 'gm_only');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async (action: () => Promise<Entry | null>) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
      setEditing(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const hiddenNames = (e.hiddenFromMemberIds ?? [])
    .map((id) => players.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => m!.characterName ?? m!.displayName);

  const release = () => {
    if (!e.summary.trim()) {
      // Ohne öffentlichen Text gäbe es nichts zu sehen – erst den Teil für Spieler schreiben
      setSecret(false);
      setEditing(true);
      return;
    }
    run(() => api.updateEntry(e.id, { visibility: 'public', hiddenFromMemberIds: [] }));
  };

  const save = () => run(() => api.updateEntry(e.id, {
    name: name.trim(), summary: summary.trim(), gmNotes: gmNotes.trim() || null, visibility: secret ? 'gm_only' : 'public',
    ...(withAliases ? { aliases: parseAliases(aliases, name) } : {})
  }));

  const remove = async () => {
    if (await confirmDialog(t('„{name}“ endgültig aus der Bibel löschen?', { name: e.name }), { confirmLabel: t('Löschen'), danger: true })) {
      run(async () => { await api.deleteEntry(e.id); return null; });
    }
  };

  if (editing) {
    return (
      <div className="card">
        <div className="field">
          <label htmlFor={`en-${e.id}`}>{t('Name')}</label>
          <input id={`en-${e.id}`} type="text" value={name} onChange={(ev) => setName(ev.target.value)} />
        </div>
        {withAliases && (
          <div className="field">
            <label htmlFor={`ea-${e.id}`}>{t('Auch genannt')}</label>
            <input id={`ea-${e.id}`} type="text" value={aliases} onChange={(ev) => setAliases(ev.target.value)}
              placeholder={t('z. B. andere Schreibweise, Spitzname')} aria-describedby={`eah-${e.id}`} />
            <span id={`eah-${e.id}`} className="muted small">{t('Durch Komma getrennt. Hilft Taleward, den Eintrag in der Abschrift wiederzuerkennen. Sichtbar wie der Name.')}</span>
          </div>
        )}
        <div className="field">
          <label htmlFor={`es-${e.id}`} className="row" style={{ gap: 6 }}><IconEye size={16} /> {t('Was Spieler wissen')}</label>
          <textarea id={`es-${e.id}`} value={summary} onChange={(ev) => setSummary(ev.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`eg-${e.id}`} className="row" style={{ gap: 6 }}><IconLock size={16} /> {t('Nur SL')}</label>
          <textarea id={`eg-${e.id}`} value={gmNotes} onChange={(ev) => setGmNotes(ev.target.value)} />
        </div>
        <label className="check">
          <input type="checkbox" checked={!secret} onChange={(ev) => setSecret(!ev.target.checked)} />
          <span>{t('Für Spieler sichtbar')}</span>
        </label>
        <ErrorBox error={error} />
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn small" disabled={busy || !name.trim() || (!secret && !summary.trim())} onClick={save}>{t('Speichern')}</button>
          <button type="button" className="btn small outline" onClick={() => setEditing(false)}>{t('Abbrechen')}</button>
          <button type="button" className="btn small danger outline" style={{ marginLeft: 'auto' }} disabled={busy} onClick={remove}>{t('Löschen')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={e.visibility === 'gm_only' ? 'card secret' : 'card'}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="card-title">{e.name}</div>
        <Tag entry={e} />
      </div>
      {!!e.aliases?.length && <div className="muted small">{t('Auch genannt: {names}', { names: e.aliases.join(', ') })}</div>}
      {e.summary && <div>{e.summary}</div>}
      {e.gmNotes && e.visibility !== 'gm_only' && <SecretBox>{e.gmNotes}</SecretBox>}
      {e.gmNotes && e.visibility === 'gm_only' && <div className="small">{e.gmNotes}</div>}
      <LinkButtons links={e.links} />
      {(e.type === 'item' && holder) || e.firstSessionNumber ? (
        <div className="muted small">
          {e.type === 'item' && holder ? `${holder}. ` : ''}
          {e.firstSessionNumber ? t('Seit Kapitel {n}', { n: e.firstSessionNumber }) : ''}
          {e.lastSessionNumber && e.lastSessionNumber !== e.firstSessionNumber ? ', ' + t('zuletzt in Kapitel {n}', { n: e.lastSessionNumber }) : ''}
        </div>
      ) : null}
      {gm && former && <div className="muted small">{t('Früher gespielt von {name}', { name: former.displayName || t('einem gelöschten Konto') })}</div>}
      <ErrorBox error={error} />
      {gm && hiddenNames.length > 0 && (
        <div className="small" style={{ color: 'var(--siegel-text)' }}>
          <IconLock size={12} /> {t('Verborgen vor: {names}', { names: hiddenNames.join(', ') })}
        </div>
      )}
      {gm && (
        <div className="row wrap" style={{ gap: 8 }}>
          {(e.visibility === 'gm_only' || hiddenNames.length > 0) && (
            <button type="button" className="btn small" disabled={busy} onClick={release}>
              <IconEye size={16} /> {e.visibility === 'gm_only' ? t('Für Spieler freigeben') : t('Für alle freigeben')}
            </button>
          )}
          {e.visibility === 'public' && (
            <button type="button" className="btn small outline" disabled={busy} onClick={() => setHiding(true)}>
              <IconLock size={16} /> {t('Verbergen')}
            </button>
          )}
          <button type="button" className="btn small outline" onClick={() => setEditing(true)}>{t('Bearbeiten')}</button>
          {e.formerHolderMemberId && campaign && (
            <button type="button" className="btn small ghost" onClick={() => setAssigning(true)}>{t('Einem Spieler geben')}</button>
          )}
        </div>
      )}
      {assigning && campaign && (
        <AssignFigureDialog campaign={campaign} entryId={e.id} figureName={e.name} onClose={() => setAssigning(false)}
          onDone={() => { setAssigning(false); onChanged(null); }} />
      )}
      {hiding && (
        <HideDialog players={players} onClose={() => setHiding(false)}
          onHide={(ids) => {
            setHiding(false);
            // Vor allen verborgen = wieder ganz geheim
            run(() => api.updateEntry(e.id, ids.length === players.length
              ? { visibility: 'gm_only', hiddenFromMemberIds: [] }
              : { visibility: 'public', hiddenFromMemberIds: ids }));
          }} />
      )}
    </div>
  );
}

/**
 * „Verbergen für …“ – Mehrfachauswahl. „Alle“ ist vorausgewählt und setzt bzw. löscht alle Haken;
 * wer einzelne abwählt, wählt damit auch „Alle“ ab.
 */
function HideDialog({ players, onHide, onClose }: { players: Member[]; onHide: (memberIds: string[]) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(players.map((m) => m.id));
  return (
    <Dialog title={t('Verbergen für')} onClose={onClose}>
      <PlayerPicker players={players} selected={selected} onChange={setSelected} />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={selected.length === 0} onClick={() => onHide(selected)}>
          <IconLock size={16} /> {t('Verbergen')}
        </button>
        <button type="button" className="btn outline" onClick={onClose}>{t('Abbrechen')}</button>
      </div>
    </Dialog>
  );
}
