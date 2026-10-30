import { isDeletedMember } from '../api/types';
import { PlayerPicker } from '../components/PlayerPicker';
import { confirmDialog } from '../components/confirm';
import { SecretBox } from '../components/VisTag';
import { LinkButtons } from '../components/Links';
import { apiAtLeast, p } from '../api/connections';
import { aliasesText, parseAliases } from '../bible/aliases';
import { Link } from 'react-router-dom';
import { t, tk, tn } from '../i18n';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fuzzyFilter, matchScore } from '../search/fuzzy';
import { api } from '../api/client';
import type { Campaign, Entry, EntryType, Member } from '../api/types';
import { Dialog } from '../components/Dialog';
import { AssignFigureDialog } from '../components/Seats';
import { ENTRY_KIND } from '../components/ProposalCard';
import { HolderSelect, NOBODY, figureName } from '../bible/HolderSelect';
import { IconEye, IconLock, IconPlus } from '../components/Icons';
import { ErrorBox, Screen, clearStoredUnread, rememberCampaign, sessionStorageSet } from '../components/Screen';

type Tab = 'all' | EntryType;

const TABS: { type: Tab; label: string }[] = [
  { type: 'all', label: tk('Alles') },
  { type: 'npc', label: tk('NSCs') },
  { type: 'location', label: tk('Orte') },
  { type: 'quest', label: tk('Quests') },
  { type: 'item', label: tk('Beute') }
];

/** Überschriften der Suchergebnisse, in dieser Reihenfolge */
const GROUPS: { type: EntryType; label: string }[] = [
  { type: 'npc', label: tk('NSCs') },
  { type: 'location', label: tk('Orte') },
  { type: 'quest', label: tk('Quests') },
  { type: 'item', label: tk('Beute') },
  { type: 'faction', label: tk('Fraktionen') },
  { type: 'pc', label: tk('Spielercharaktere') },
  { type: 'other', label: tk('Sonstiges') }
];

const UNDO_SECONDS = 10;

const ADD_TYPES: EntryType[] = ['npc', 'location', 'quest', 'item', 'faction', 'other'];

const isTab = (v: string | null): v is Tab => !!v && TABS.some((x) => x.type === v);

/** Hebt wörtliche Vorkommen der Suche hervor; leicht verschriebene Treffer bleiben ohne Markierung */
function highlight(text: string, query: string): ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const low = text.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  for (let at = low.indexOf(q); at >= 0; at = low.indexOf(q, i)) {
    out.push(text.slice(i, at), <mark key={at}>{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  out.push(text.slice(i));
  return out;
}

/** Ausschnitt um den ersten wörtlichen Treffer, damit er in der ersten Zeile sichtbar ist */
function snippet(text: string, query: string): string {
  const at = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at < 40) return text;
  const start = text.lastIndexOf(' ', at - 30);
  return '… ' + text.slice(start < 0 ? at - 30 : start + 1);
}

export function Bible() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  // Reiter, Suche und offener Eintrag stehen in der Adresse: „Zurück“ führt dorthin, wo man war
  const [params, setParams] = useSearchParams();
  const art = params.get('art');
  const tab: Tab = isTab(art) ? art : 'all';
  // Die Suche tippt in einen eigenen Zustand und schreibt erst danach in die Adresse – sonst gehen bei schnellem Tippen Zeichen verloren
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const openId = params.get('e');
  const [all, setAll] = useState<Entry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
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

  const gm = campaign?.myRole === 'gm';
  const players = campaign?.members.filter((m) => m.role === 'player' && !isDeletedMember(m)) ?? [];
  const holderMember = (id: string | null | undefined) => (id ? campaign?.members.find((x) => x.id === id) : undefined);
  const holder = (id: string | null | undefined) => {
    const m = holderMember(id);
    return m ? t('Bei {name}', { name: m.characterName ?? m.displayName }) : null;
  };
  // Beute findet man auch über die Figur bzw. Person, die sie hat („Nyra“ findet den Runenschlüssel)
  const holderNames = (e: Entry) => {
    const m = e.type === 'item' ? holderMember(e.holderMemberId) : undefined;
    return m ? [m.characterName ?? '', m.displayName] : [];
  };

  const withParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  };
  const setParam = (key: string, value: string | null) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });
  // Was wir selbst in die Adresse geschrieben haben, nicht zurücklesen; nur fremde Änderungen (Zurück, Link) übernehmen
  const written = useRef(query);
  const urlQuery = params.get('q') ?? '';
  useEffect(() => {
    if (urlQuery !== query) {
      written.current = query;
      setParam('q', query || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => {
    if (urlQuery !== written.current) {
      written.current = urlQuery;
      setQuery(urlQuery);
    }
  }, [urlQuery]);

  if (openId) {
    const entry = all?.find((x) => x.id === openId);
    return (
      <Screen overline={campaign?.title ?? ' '} title={entry?.name ?? t('Kampagnenbibel')} hero={{ campaign }}
        backTo={{ to: `?${withParam('e', null).toString()}`, label: t('Kampagnenbibel') }}>
        <ErrorBox error={error} />
        {all && !entry && <div className="empty">{t('Diesen Eintrag gibt es nicht mehr.')}</div>}
        {entry && (
          <EntryDetail key={entry.id} entry={entry} gm={gm} holder={holder(entry.holderMemberId)} campaign={campaign} players={players}
            onChanged={(u) => {
              setAll((list) => (u ? list?.map((x) => (x.id === u.id ? u : x)) : list?.filter((x) => x.id !== entry.id)) ?? null);
              if (!u) setParam('e', null);
            }} />
        )}
      </Screen>
    );
  }

  const href = (id: string) => `?${withParam('e', id).toString()}`;
  const sorted = all && [...all].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const hits = sorted && query.trim()
    ? fuzzyFilter(sorted, query, (e) => [e.name, ...(e.aliases ?? []), e.summary, e.gmNotes ?? '', ...holderNames(e)])
    : null;
  const shown = sorted && (tab === 'all' ? sorted : sorted.filter((e) => e.type === tab));
  const count = (type: Tab) => (type === 'all' ? all?.length : all?.filter((e) => e.type === type).length) ?? 0;

  return (
    <Screen overline={campaign?.title ?? ' '} title={t('Kampagnenbibel')} hero={{ campaign }}>
      <ErrorBox error={error} />
      <div className="bible-bar">
        <input type="search" aria-label={t('In der ganzen Bibel suchen')} placeholder={t('Wer war das? Alles durchsuchen …')}
          value={query} onChange={(e) => setQuery(e.target.value)} />
        {gm && (
          <button type="button" className="btn outline square" aria-label={t('Etwas hinzufügen')} aria-expanded={menu || adding}
            onClick={() => { if (adding) setAdding(false); else setMenu((v) => !v); }}>
            <IconPlus />
          </button>
        )}
      </div>

      {gm && menu && (
        <div className="list-box">
          <button type="button" className="list-row nav" onClick={() => { setMenu(false); setAdding(true); }}>
            <span className="lr-text">{t('Eintrag anlegen')}<span className="lr-sub">{t('NSC, Ort, Quest, Beute …')}</span></span>
          </button>
          <Link className="list-row nav" to={p(`/k/${campaignId}/unterlagen`)}>
            <span className="lr-text">{t('Aus Unterlagen auswerten lassen')}<span className="lr-sub">{t('Taleward schlägt Einträge aus deinen Notizen und Abenteuern vor')}</span></span>
          </Link>
        </div>
      )}

      {gm && adding && (
        <AddEntry campaignId={campaignId} type={tab === 'all' ? 'npc' : tab} players={players}
          onDone={(saved) => {
            setAdding(false);
            if (saved) setReload((n) => n + 1);
          }} />
      )}

      {hits ? (
        <SearchResults hits={hits} query={query} gm={gm} href={href} holder={(e) => holder(e.holderMemberId)} holderNames={holderNames} />
      ) : (
        <>
          <div className="tabs" role="group" aria-label={t('Arten')}>
            {TABS.map((item) => (
              <button key={item.type} type="button" aria-pressed={tab === item.type}
                onClick={() => setParam('art', item.type === 'all' ? null : item.type)}>
                {t(item.label)}<span className="n">{all ? count(item.type) : ' '}</span>
              </button>
            ))}
          </div>

          {shown?.length === 0 && (
            <div className="empty">
              {all && all.length > 0 ? t('In dieser Rubrik steht noch nichts.')
                : gm ? t('Noch leer. Nach jeder Runde schlägt Taleward Einträge vor, und du kannst selbst welche anlegen.')
                : t('Noch leer. Hier steht, was deine Figur weiß, sobald die SL es freigibt.')}
            </div>
          )}
          {gm && all?.length === 0 && !adding && (
            <button type="button" className="btn" onClick={() => setAdding(true)}>{t('Eintrag hinzufügen')}</button>
          )}

          {!!shown?.length && (
            <div className="list-box">
              {shown.map((e) => (
                <EntryRow key={e.id} entry={e} gm={gm} href={href(e.id)} holder={holder(e.holderMemberId)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* In der leeren Bibel hilft der Weg über die Unterlagen am meisten; sonst steht er unter „+“ */}
      {gm && all?.length === 0 && !adding && (
        <Link to={p(`/k/${campaignId}/unterlagen`)} className="quiet-link">{t('Aus Unterlagen auswerten lassen')}</Link>
      )}
    </Screen>
  );
}

/** Kurze Zeile unter dem Namen: Kapitel, Status, bei wem, für die SL Notiz und Verbergen */
function metaLine(e: Entry, gm: boolean, holder: string | null): string {
  const parts: string[] = [];
  const n = e.lastSessionNumber ?? e.firstSessionNumber;
  if (n) parts.push(t('Kapitel {n}', { n }));
  if (e.type === 'quest' && e.status === 'active') parts.push(t('aktiv'));
  if (e.type === 'quest' && e.status === 'done') parts.push(t('erledigt'));
  if (e.type === 'item' && holder) parts.push(holder);
  if (gm && e.gmNotes) parts.push(t('mit SL-Notiz'));
  const hidden = e.hiddenFromMemberIds?.length ?? 0;
  if (gm && hidden) parts.push(t('verborgen vor {n}', { n: hidden }));
  return parts.join(' · ');
}

function EntryRow({ entry: e, gm, href, holder }: { entry: Entry; gm: boolean; href: string; holder: string | null }) {
  const meta = metaLine(e, gm, holder);
  return (
    <Link className="list-row entry" to={href}>
      <span className="lr-text">
        <span className="lr-sub">{t(ENTRY_KIND[e.type] ?? '')}</span>
        <span className="entry-name">{e.name}</span>
        {e.summary && <span className="entry-sum">{e.summary}</span>}
        {e.visibility === 'gm_only'
          ? <span className="entry-tag"><IconLock size={14} /> {t('Nur SL')}</span>
          : meta && <span className="lr-sub">{meta}</span>}
      </span>
    </Link>
  );
}

function SearchResults({ hits, query, gm, href, holder, holderNames }: {
  hits: Entry[];
  query: string;
  gm: boolean;
  href: (id: string) => string;
  holder: (e: Entry) => string | null;
  holderNames: (e: Entry) => string[];
}) {
  if (hits.length === 0) {
    return <div className="empty">{t('Nichts gefunden für „{q}“.', { q: query })}</div>;
  }
  return (
    <>
      <span className="muted small">{tn(hits.length, '{n} Treffer in der ganzen Bibel', '{n} Treffer in der ganzen Bibel', { n: hits.length })}</span>
      {GROUPS.map((g) => {
        const list = hits.filter((e) => e.type === g.type);
        if (!list.length) return null;
        return (
          <Fragment key={g.type}>
            <h2 className="list-head">{t(g.label)}</h2>
            <div className="list-box">
              {list.map((e) => {
                // Wo hat die Suche gegriffen? Die SL-Notiz nur nennen, wenn sonst nichts passt
                const inName = matchScore(query, e.name) > 0;
                const alias = !inName ? e.aliases?.find((a) => matchScore(query, a) > 0) : undefined;
                const inSummary = !!e.summary && matchScore(query, e.summary) > 0;
                const inNotes = gm && !inName && !alias && !inSummary && !!e.gmNotes && matchScore(query, e.gmNotes) > 0;
                const byHolder = !inName && !alias && !inSummary && !inNotes && holderNames(e).some((n) => !!n && matchScore(query, n) > 0);
                return (
                  <Link key={e.id} className="list-row entry" to={href(e.id)}>
                    <span className="lr-text">
                      <span className="entry-name">{highlight(e.name, query)}</span>
                      {alias && <span className="lr-sub">{t('Auch genannt: {names}', { names: '' })}{highlight(alias, query)}</span>}
                      {inNotes
                        ? <span className="entry-sum">{highlight(snippet(e.gmNotes!, query), query)}</span>
                        : e.summary && <span className="entry-sum">{highlight(inSummary ? snippet(e.summary, query) : e.summary, query)}</span>}
                      {inNotes && <span className="entry-tag"><IconLock size={14} /> {t('Treffer in der SL-Notiz')}</span>}
                      {byHolder && <span className="lr-sub">{highlight(holder(e) ?? '', query)}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </>
  );
}

function AddEntry({ campaignId, type: initialType, players, onDone }: { campaignId: string; type: EntryType; players: Member[]; onDone: (saved: boolean) => void }) {
  const [type, setType] = useState<EntryType>(initialType);
  const [holder, setHolder] = useState(NOBODY);
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
        status: type === 'quest' ? 'active' : null,
        ...(type === 'item' ? { holderMemberId: holder === NOBODY ? null : holder } : {})
      });
      onDone(true);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="card">
      <h2>{t('Neuer Eintrag')}</h2>
      <div className="field">
        <label htmlFor="e-type">{t('Art')}</label>
        <select id="e-type" value={type} onChange={(e) => setType(e.target.value as EntryType)}>
          {ADD_TYPES.map((x) => <option key={x} value={x}>{t(ENTRY_KIND[x])}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="e-name">{t('Name')}</label>
        <input id="e-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="e-sum">{t('Beschreibung')}</label>
        <textarea id="e-sum" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      {type === 'item' && players.length > 0 && <HolderSelect id="e-holder" players={players} value={holder} onChange={setHolder} />}
      <div className="field">
        <label htmlFor="e-gm" className="row" style={{ gap: 6 }}><IconLock size={14} /> {t('Nur SL (geheimer Teil)')}</label>
        <textarea id="e-gm" value={gmNotes} onChange={(e) => setGmNotes(e.target.value)} />
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

/** Ein Bibeleintrag, ganz geöffnet; die SL kann bearbeiten, Sichtbarkeit ändern, freigeben, löschen */
function EntryDetail({ entry: e, gm, holder, campaign, players, onChanged }: {
  entry: Entry;
  gm: boolean;
  holder: string | null;
  campaign: Campaign | null;
  players: Member[];
  onChanged: (updated: Entry | null) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const [pickingHolder, setPickingHolder] = useState(false);
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
  const [holderId, setHolderId] = useState(e.holderMemberId ?? NOBODY);
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

  const holderPerson = e.holderMemberId ? players.find((m) => m.id === e.holderMemberId) : undefined;
  const holderLabel = holderPerson ? figureName(holderPerson) : holder;
  const hiddenIds = e.hiddenFromMemberIds ?? [];
  const hiddenNames = hiddenIds
    .map((id) => players.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => m!.characterName ?? m!.displayName);

  // Ohne öffentlichen Text gäbe es nichts zu sehen – erst den Teil für Spieler schreiben
  const needsText = () => {
    if (e.summary.trim()) return false;
    setSecret(false);
    setEditing(true);
    return true;
  };

  // Aufdecken mit Rückweg: ein paar Sekunden lang lässt es sich zurücknehmen (wie am SL-Schirm)
  const [undo, setUndo] = useState<{ before: { visibility: Entry['visibility']; hiddenFromMemberIds: string[] }; left: number } | null>(null);
  useEffect(() => {
    if (!undo) return;
    if (undo.left <= 0) { setUndo(null); return; }
    const id = window.setTimeout(() => setUndo((u) => (u ? { ...u, left: u.left - 1 } : u)), 1000);
    return () => window.clearTimeout(id);
  }, [undo]);
  const open = (hiddenFromMemberIds: string[]) => {
    const before = { visibility: e.visibility, hiddenFromMemberIds: e.hiddenFromMemberIds ?? [] };
    const moreVisible = before.visibility === 'gm_only' || hiddenFromMemberIds.length < before.hiddenFromMemberIds.length;
    run(async () => {
      const u = await api.updateEntry(e.id, { visibility: 'public', hiddenFromMemberIds });
      if (moreVisible) setUndo({ before, left: UNDO_SECONDS });
      return u;
    });
  };
  const takeBack = () => {
    if (!undo) return;
    const { before } = undo;
    setUndo(null);
    run(() => api.updateEntry(e.id, before));
  };

  const release = () => {
    if (!needsText()) open([]);
  };

  const setHidden = (ids: string[]) => {
    setChoosing(false);
    if (ids.length === 0) return release();
    // Vor allen verborgen = wieder ganz geheim
    if (ids.length === players.length) return run(() => api.updateEntry(e.id, { visibility: 'gm_only', hiddenFromMemberIds: [] }));
    if (!needsText()) open(ids);
  };

  const save = () => run(() => api.updateEntry(e.id, {
    name: name.trim(), summary: summary.trim(), gmNotes: gmNotes.trim() || null, visibility: secret ? 'gm_only' : 'public',
    ...(withAliases ? { aliases: parseAliases(aliases, name) } : {}),
    ...(e.type === 'item' ? { holderMemberId: holderId === NOBODY ? null : holderId } : {})
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
            <span id={`eah-${e.id}`} className="muted small">{t('Durch Komma getrennt. Hilft Taleward, den Eintrag in der Abschrift wiederzuerkennen.')}</span>
          </div>
        )}
        <div className="field">
          <label htmlFor={`es-${e.id}`} className="row" style={{ gap: 6 }}><IconEye size={16} /> {t('Was Spieler wissen')}</label>
          <textarea id={`es-${e.id}`} value={summary} onChange={(ev) => setSummary(ev.target.value)} />
        </div>
        {e.type === 'item' && players.length > 0 && (
          <HolderSelect id={`eh-${e.id}`} players={players} value={holderId} onChange={setHolderId} />
        )}
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
        </div>
      </div>
    );
  }

  const kind = [t(ENTRY_KIND[e.type] ?? ''),
    e.firstSessionNumber ? t('seit Kapitel {n}', { n: e.firstSessionNumber }) : '',
    e.type === 'quest' && e.status === 'active' ? t('aktiv') : '',
    e.type === 'quest' && e.status === 'done' ? t('erledigt') : ''].filter(Boolean).join(' · ');
  const who = e.visibility === 'gm_only' ? t('Nur die Spielleitung')
    : hiddenNames.length ? t('Alle außer {names}', { names: hiddenNames.join(', ') })
    : t('Alle am Tisch');

  return (
    <>
      <span className="muted small">{kind}</span>
      {!!e.aliases?.length && <span className="muted small">{t('Auch genannt: {names}', { names: e.aliases.join(', ') })}</span>}
      {e.summary
        ? <p className="entry-text">{e.summary}</p>
        : gm && <p className="muted" style={{ margin: 0 }}>{t('Noch kein Text für Spieler.')}</p>}
      {gm && e.gmNotes && <SecretBox><span style={{ whiteSpace: 'pre-wrap' }}>{e.gmNotes}</span></SecretBox>}
      <LinkButtons links={e.links} />
      {!gm && e.type === 'item' && holder && <span className="small">{holder}</span>}
      {gm && former && <span className="muted small">{t('Früher gespielt von {name}', { name: former.displayName || t('einem gelöschten Konto') })}</span>}

      {gm && (players.length > 0 || e.type === 'item') && (
        <div className="list-box">
          {players.length > 0 && (
            <button type="button" className="list-row nav" onClick={() => setChoosing(true)} disabled={busy}>
              <span className="lr-text">{t('Wer sieht das?')}<span className="lr-sub">{who}</span></span>
              <span className="lr-val">{t('Ändern')}</span>
            </button>
          )}
          {e.type === 'item' && (players.length > 0 ? (
            <button type="button" className="list-row nav" onClick={() => setPickingHolder(true)} disabled={busy}>
              <span className="lr-text">{t('Bei wem?')}<span className="lr-sub">{holderLabel ?? t('Bei keiner Figur')}</span></span>
              <span className="lr-val">{t('Ändern')}</span>
            </button>
          ) : (
            <div className="list-row">
              <span className="lr-text">{t('Bei wem?')}<span className="lr-sub">{t('Sobald jemand mitspielt, kannst du den Gegenstand einer Figur geben.')}</span></span>
            </div>
          ))}
        </div>
      )}
      <ErrorBox error={error} />
      {undo && (
        <div className="notice" role="status" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{t('„{name}“ ist aufgedeckt.', { name: e.name })}</span>
          <button type="button" className="btn small outline" onClick={takeBack}>{t('Zurücknehmen ({n})', { n: undo.left })}</button>
        </div>
      )}
      {gm && (
        <div className="row wrap" style={{ gap: 8 }}>
          {(e.visibility === 'gm_only' || hiddenNames.length > 0) && (
            <button type="button" className="btn" disabled={busy} onClick={release}>
              <IconEye size={16} /> {t('Für alle freigeben')}
            </button>
          )}
          <button type="button" className="btn outline" onClick={() => setEditing(true)}>{t('Bearbeiten')}</button>
          {e.formerHolderMemberId && campaign && (
            <button type="button" className="btn ghost" onClick={() => setAssigning(true)}>{t('Einem Spieler geben')}</button>
          )}
        </div>
      )}

      {e.mentions?.length > 0 && (
        <>
          <h2 className="list-head">{t('In den Kapiteln')}</h2>
          {e.mentions.map((m, i) => (
            <span key={i} className="small"><span className="muted">{t('Kapitel {n}', { n: m.sessionNumber })}:</span> {m.note}</span>
          ))}
        </>
      )}

      {gm && (
        <button type="button" className="quiet-link danger" disabled={busy} onClick={remove}>{t('Eintrag löschen')}</button>
      )}

      {assigning && campaign && (
        <AssignFigureDialog campaign={campaign} entryId={e.id} figureName={e.name} onClose={() => setAssigning(false)}
          onDone={() => { setAssigning(false); onChanged(null); }} />
      )}
      {pickingHolder && (
        <HolderDialog players={players} initial={e.holderMemberId ?? NOBODY} onClose={() => setPickingHolder(false)}
          onSave={(id) => {
            setPickingHolder(false);
            run(() => api.updateEntry(e.id, { holderMemberId: id === NOBODY ? null : id }));
          }} />
      )}
      {choosing && (
        <VisibilityDialog players={players}
          initial={e.visibility === 'gm_only' ? players.map((m) => m.id) : hiddenIds}
          onClose={() => setChoosing(false)} onSave={setHidden} />
      )}
    </>
  );
}

/**
 * „Wer sieht das?“ – angehakt heißt: sieht den Eintrag nicht. Niemand angehakt = alle sehen ihn,
 * alle angehakt = nur die Spielleitung.
 */
function VisibilityDialog({ players, initial, onSave, onClose }: {
  players: Member[];
  initial: string[];
  onSave: (hiddenIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const seeing = players.length - selected.length;
  return (
    <Dialog title={t('Verbergen vor')} onClose={onClose}>
      <PlayerPicker players={players} selected={selected} onChange={setSelected} />
      <span className="muted small">
        {selected.length === 0 ? t('Alle am Tisch sehen den Eintrag.')
          : seeing === 0 ? t('Nur die Spielleitung sieht den Eintrag.')
          : tn(seeing, '{n} Person sieht den Eintrag.', '{n} Personen sehen den Eintrag.', { n: seeing })}
      </span>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onSave(selected)}>{t('Speichern')}</button>
        <button type="button" className="btn outline" onClick={onClose}>{t('Abbrechen')}</button>
      </div>
    </Dialog>
  );
}

/** „Bei wem?“ für einen Gegenstand, direkt aus der Ansicht des Eintrags */
function HolderDialog({ players, initial, onSave, onClose }: {
  players: Member[];
  initial: string;
  onSave: (id: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Dialog title={t('Bei wem?')} onClose={onClose}>
      <div className="list-box" role="radiogroup" aria-label={t('Bei wem?')}>
        {[{ id: NOBODY, name: t('Bei keiner Figur') }, ...players.map((m) => ({ id: m.id, name: figureName(m) }))].map((o) => (
          <label key={o.id} className="list-row check-row">
            <input type="radio" name="holder" checked={value === o.id} onChange={() => setValue(o.id)} />
            <span className="lr-text">{o.name}</span>
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onSave(value)}>{t('Speichern')}</button>
        <button type="button" className="btn outline" onClick={onClose}>{t('Abbrechen')}</button>
      </div>
    </Dialog>
  );
}
