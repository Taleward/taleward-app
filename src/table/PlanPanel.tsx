import { useEffect, useState } from 'react';
import { api, isApiError } from '../api/client';
import { apiAtLeast } from '../api/connections';
import { LinkButtons, LinkEditor } from '../components/Links';
import { IconCheck } from '../components/Icons';
import type { CampaignDocument, ChapterPlan, Entry, PlanScene } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { ErrorBox } from '../components/Screen';
import { tk, t } from '../i18n';
import { fuzzyFilter } from '../search/fuzzy';
import { pickPlan } from './currentPlan';

const SCENE_STATE: Record<NonNullable<PlanScene['state']>, string> = {
  open: tk('offen'),
  played: tk('gespielt'),
  skipped: tk('übersprungen')
};


/**
 * Kapitelplan am Tisch: Szenenkarten zum Abhaken, Notizen, Namen und Verweise in Bibel und Unterlagen. Nur für die SL;
 * der Plan fließt nie in Kapitel oder Vorschläge.
 */
export function PlanPanel({ campaignId, nextNumber, onEntry, onDoc, compact }: {
  campaignId: string;
  /** Nummer des nächsten Kapitels (Vorgabe für neue Pläne) */
  nextNumber: number;
  onEntry: (entryId: string) => void;
  onDoc: (docId: string) => void;
  /** Kleine Karte: nur die nächste offene Szene zum Abhaken */
  compact?: boolean;
}) {
  const [plans, setPlans] = useState<ChapterPlan[] | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [docs, setDocs] = useState<CampaignDocument[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = () => api.plans(campaignId).then((list) => {
    setPlans(list);
    setPlanId((id) => (id && list.some((pl) => pl.id === id) ? id : pickPlan(list)?.id ?? null));
  }).catch(setError);

  useEffect(() => {
    load();
    api.entries(campaignId).then(setEntries).catch(() => setEntries([]));
    api.documents(campaignId).then(setDocs).catch(() => setDocs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const plan = plans?.find((pl) => pl.id === planId) ?? null;
  const entryName = (id: string) => entries.find((e) => e.id === id)?.name;

  const save = async (change: Partial<ChapterPlan>) => {
    if (!plan) return;
    setError(null);
    try {
      const u = await api.updatePlan(plan.id, { ...change, ifUpdatedAt: plan.updatedAt });
      setPlans((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null);
    } catch (e) {
      setError(e);
      load();
    }
  };

  /**
   * Kleine Änderung am Tisch (Szene abhaken): hat ein anderes Gerät oder der Notizzettel den Plan inzwischen
   * geändert, einmal frisch laden und dieselbe Änderung auf den neuen Stand anwenden.
   */
  const apply = async (fn: (p: ChapterPlan) => Partial<ChapterPlan>) => {
    if (!plan) return;
    setError(null);
    try {
      let u: ChapterPlan;
      try {
        u = await api.updatePlan(plan.id, { ...fn(plan), ifUpdatedAt: plan.updatedAt });
      } catch (e) {
        if (!isApiError(e, 'conflict')) throw e;
        const fresh = await api.plan(plan.id);
        u = await api.updatePlan(plan.id, { ...fn(fresh), ifUpdatedAt: fresh.updatedAt });
      }
      setPlans((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null);
    } catch (e) {
      setError(e);
      load();
    }
  };
  const setSceneState = (sceneId: string, state: NonNullable<PlanScene['state']>) =>
    apply((p) => ({ scenes: p.scenes.map((x) => (x.id === sceneId ? { ...x, state } : x)) }));

  // Gerade angelegt und noch nie gespeichert: „Abbrechen“ nimmt ihn wieder weg, „Löschen“ braucht es nicht
  const [freshId, setFreshId] = useState<string | null>(null);
  const create = async () => {
    setError(null);
    try {
      const pl = await api.createPlan(campaignId, { title: t('Kapitel {n}', { n: nextNumber }), sessionNumber: nextNumber, state: 'draft' });
      setPlans((list) => [...(list ?? []), pl]);
      setPlanId(pl.id);
      setFreshId(pl.id);
      setEditing(true);
    } catch (e) {
      setError(e);
    }
  };

  if (compact) {
    const current = plan?.scenes.find((sc) => (sc.state ?? 'open') === 'open');
    const done = plan?.scenes.filter((sc) => sc.state === 'played' || sc.state === 'skipped').length ?? 0;
    return (
      <div className="table-panel-body">
        <ErrorBox error={error} />
        {!plans && !error && <div className="muted small">{t('Lade …')}</div>}
        {plans && !plan && <span className="muted small">{t('Noch kein Plan.')}</span>}
        {plan && (
          <>
            <span className="small"><strong>{plan.title}</strong> · {t('{n} von {total} Szenen erledigt', { n: done, total: plan.scenes.length })}</span>
            {current ? (
              <div className="row between" style={{ gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0 }}>{t('Jetzt:')} <strong>{current.title}</strong></span>
                <button type="button" className="btn small outline" aria-label={t('{title} als gespielt abhaken', { title: current.title })}
                  onClick={() => setSceneState(current.id, 'played')}>
                  <IconCheck /> {t('Gespielt')}
                </button>
              </div>
            ) : plan.scenes.length > 0 && <span className="muted small">{t('Alle Szenen erledigt.')}</span>}
          </>
        )}
      </div>
    );
  }

  if (editing && plan) {
    const fresh = freshId === plan.id;
    return <PlanEditor plan={plan} entries={entries} docs={docs}
      onCancel={async () => {
        setEditing(false);
        if (!fresh) return;
        setFreshId(null);
        setPlanId(null);
        await api.deletePlan(plan.id).catch(() => undefined);
        load();
      }}
      onSave={async (change) => { await save(change); setFreshId(null); setEditing(false); }}
      onDelete={fresh ? undefined : async () => {
        if (!(await confirmDialog(t('Plan „{title}“ löschen? Einträge und Unterlagen bleiben.', { title: plan.title }), { confirmLabel: t('Löschen'), danger: true }))) return;
        try {
          await api.deletePlan(plan.id);
          setEditing(false);
          setPlanId(null);
          load();
        } catch (e) {
          setError(e);
        }
      }} />;
  }

  return (
    <div className="table-panel-body">
      <ErrorBox error={error} />
      {!plans && !error && <div className="empty">{t('Lade …')}</div>}
      {plans && plans.length > 1 && (
        <div className="field">
          <label htmlFor="tp-plan">{t('Plan')}</label>
          <select id="tp-plan" value={planId ?? ''} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.sessionNumber ? t('Kapitel {n}', { n: pl.sessionNumber }) + ' · ' : ''}{pl.title}</option>)}
          </select>
        </div>
      )}
      {plans?.length === 0 && (
        <div className="empty">{t('Noch kein Plan. Ein Plan ist freiwillig: Szenen, Namen und Unterlagen für die nächste Runde, nur für dich.')}</div>
      )}
      {plan && (
        <>
          <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {/* Heißt der Plan schon „Kapitel n“, nicht doppelt anzeigen */}
              {plan.sessionNumber && plan.title !== t('Kapitel {n}', { n: plan.sessionNumber }) && <span className="overline">{t('Kapitel {n}', { n: plan.sessionNumber })}</span>}
              <h3 style={{ margin: 0 }}>{plan.title}</h3>
            </div>
            <button type="button" className="btn small outline" onClick={() => setEditing(true)}>{t('Bearbeiten')}</button>
          </div>
          {plan.notes && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{plan.notes}</p>}
          {plan.scenes.length === 0 && <span className="muted small">{t('Noch keine Szenen. Unter „Bearbeiten“ legst du welche an.')}</span>}
          {plan.scenes.map((sc, i) => {
            const state = sc.state ?? 'open';
            return (
              <section key={sc.id} className={`table-scene ${state}`}>
                <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <strong style={{ flex: 1 }}>{i + 1}. {sc.title}</strong>
                  {/* Überall gleich (auch in der Kurzfassung): Abhaken als Knopf mit Haken, erledigt als Abzeichen */}
                  {state === 'open'
                    ? <button type="button" className="btn small outline" aria-label={t('{title} als gespielt abhaken', { title: sc.title })}
                        onClick={() => setSceneState(sc.id, 'played')}><IconCheck /> {t('Gespielt')}</button>
                    : <span className="pill">{t(SCENE_STATE[state])}</span>}
                </div>
                {sc.notes && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{sc.notes}</p>}
                <LinkButtons links={sc.links} />
                {(sc.entryIds?.length ?? 0) > 0 && (
                  <div className="row wrap" style={{ gap: 6 }}>
                    {sc.entryIds!.map((id) => entryName(id) && (
                      <button key={id} type="button" className="btn small chip" onClick={() => onEntry(id)}>{entryName(id)}</button>
                    ))}
                  </div>
                )}
                {state === 'open'
                  ? <button type="button" className="linklike small muted" style={{ alignSelf: 'flex-start', minHeight: 48 }} onClick={() => setSceneState(sc.id, 'skipped')}>{t('Szene überspringen')}</button>
                  : <button type="button" className="linklike small muted" style={{ alignSelf: 'flex-start', minHeight: 48 }} onClick={() => setSceneState(sc.id, 'open')}>{t('Wieder offen')}</button>}
              </section>
            );
          })}
          {plan.names.length > 0 && (
            <div className="small"><span className="muted">{t('Namen als Schreibhilfe:')}</span> {plan.names.join(', ')}</div>
          )}
          {plan.documentIds.length > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              {plan.documentIds.map((id) => {
                const d = docs.find((x) => x.id === id);
                return d ? <button key={id} type="button" className="btn small chip" onClick={() => onDoc(id)}>{d.title}</button> : null;
              })}
            </div>
          )}
        </>
      )}
      {plans && <button type="button" className="btn small dashed" onClick={create}>{t('Neuer Plan')}</button>}
      <p className="muted small" style={{ margin: 0 }}>{t('Pläne sieht nur die Spielleitung. Sie fließen nie in Kapitel oder Vorschläge; nur die Namen helfen beim Schreiben der Abschrift.')}</p>
    </div>
  );
}

function PlanEditor({ plan, entries, docs, onSave, onCancel, onDelete }: {
  plan: ChapterPlan;
  entries: Entry[];
  docs: CampaignDocument[];
  onSave: (change: Partial<ChapterPlan>) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [number, setNumber] = useState(plan.sessionNumber ? String(plan.sessionNumber) : '');
  const [notes, setNotes] = useState(plan.notes ?? '');
  const [scenes, setScenes] = useState<PlanScene[]>(plan.scenes);
  const [names, setNames] = useState(plan.names.join(', '));
  const [docIds, setDocIds] = useState<string[]>(plan.documentIds);
  const [picking, setPicking] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [linking, setLinking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setScene = (id: string, change: Partial<PlanScene>) => setScenes((list) => list.map((s) => (s.id === id ? { ...s, ...change } : s)));
  const move = (i: number, d: -1 | 1) => setScenes((list) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const submit = async () => {
    setBusy(true);
    await onSave({
      title: title.trim() || plan.title,
      sessionNumber: number.trim() ? Math.max(1, parseInt(number, 10) || 1) : null,
      notes: notes.trim() || null,
      scenes: scenes.filter((s) => s.title.trim()).map((s) => ({ ...s, title: s.title.trim() })),
      names: names.split(',').map((n) => n.trim()).filter(Boolean).slice(0, 100),
      documentIds: docIds
    });
    setBusy(false);
  };

  return (
    <div className="table-panel-body">
      <div className="field">
        <label htmlFor="pe-title">{t('Titel')}</label>
        <input id="pe-title" type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pe-number">{t('Für Kapitel')}</label>
        <input id="pe-number" type="text" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} />
      </div>
      <div className="field">
        <label htmlFor="pe-notes">{t('Notiz zum Kapitel')}</label>
        <textarea id="pe-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <h3 style={{ margin: 0 }}>{t('Szenen')}</h3>
      {scenes.map((sc, i) => (
        <section key={sc.id} className="table-scene open">
          <div className="field">
            <label htmlFor={`pe-s-${sc.id}`}>{t('Szene {n}', { n: i + 1 })}</label>
            <input id={`pe-s-${sc.id}`} type="text" value={sc.title} maxLength={120} onChange={(e) => setScene(sc.id, { title: e.target.value })} />
          </div>
          <textarea rows={2} aria-label={t('Notiz zur Szene {n}', { n: i + 1 })} value={sc.notes ?? ''} onChange={(e) => setScene(sc.id, { notes: e.target.value })} />
          <div className="row wrap" style={{ gap: 6 }}>
            {(sc.entryIds ?? []).map((id) => (
              <button key={id} type="button" className="btn small outline" aria-label={t('{name} aus der Szene nehmen', { name: entries.find((e) => e.id === id)?.name ?? '' })}
                onClick={() => setScene(sc.id, { entryIds: (sc.entryIds ?? []).filter((x) => x !== id) })}>
                {entries.find((e) => e.id === id)?.name ?? '?'} ×
              </button>
            ))}
            <button type="button" className="btn small ghost" onClick={() => { setPicking(picking === sc.id ? null : sc.id); setPickQuery(''); }}>{t('Eintrag verknüpfen')}</button>
            {apiAtLeast('0.4.13') && linking !== sc.id && (
              <button type="button" className="btn small ghost" onClick={() => setLinking(sc.id)}>{(sc.links?.length ?? 0) ? t('Links bearbeiten') : t('Link hinzufügen')}</button>
            )}
          </div>
          {linking !== sc.id && <LinkButtons links={sc.links} />}
          {linking === sc.id && (
            <LinkEditor links={sc.links ?? []} max={3} canShare={false} saveLabel={t('Übernehmen')}
              onSave={(links) => { setScene(sc.id, { links }); setLinking(null); }} onCancel={() => setLinking(null)} />
          )}
          {picking === sc.id && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input type="search" aria-label={t('Eintrag suchen')} placeholder={t('Name, Ort, Gegenstand …')} value={pickQuery} autoFocus onChange={(e) => setPickQuery(e.target.value)} />
              <div className="row wrap" style={{ gap: 6 }}>
                {fuzzyFilter(entries.filter((e) => !(sc.entryIds ?? []).includes(e.id)), pickQuery, (e) => [e.name]).slice(0, 8).map((e) => (
                  <button key={e.id} type="button" className="btn small outline" onClick={() => setScene(sc.id, { entryIds: [...(sc.entryIds ?? []), e.id] })}>{e.name}</button>
                ))}
              </div>
            </div>
          )}
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="btn small ghost" disabled={i === 0} onClick={() => move(i, -1)}>{t('Nach oben')}</button>
            <button type="button" className="btn small ghost" disabled={i === scenes.length - 1} onClick={() => move(i, 1)}>{t('Nach unten')}</button>
            <button type="button" className="btn small danger outline" onClick={() => setScenes((list) => list.filter((x) => x.id !== sc.id))}>{t('Entfernen')}</button>
          </div>
        </section>
      ))}
      {scenes.length < 50 && (
        <button type="button" className="btn small dashed" onClick={() => setScenes((list) => [...list, { id: crypto.randomUUID(), title: '', notes: '', entryIds: [], state: 'open' }])}>
          {t('Szene hinzufügen')}
        </button>
      )}
      <div className="field">
        <label htmlFor="pe-names">{t('Namen als Schreibhilfe (mit Komma getrennt)')}</label>
        <input id="pe-names" type="text" value={names} onChange={(e) => setNames(e.target.value)} />
        <span className="muted small">{t('Hilft der Abschrift dieses Kapitels, Namen richtig zu schreiben.')}</span>
      </div>
      {docs.length > 0 && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 700 }}>{t('Unterlagen zu diesem Kapitel')}</legend>
          {docs.filter((d) => d.kind !== 'character_sheet').map((d) => (
            <label key={d.id} className="check">
              <input type="checkbox" checked={docIds.includes(d.id)}
                onChange={(e) => setDocIds((list) => (e.target.checked ? [...list, d.id] : list.filter((x) => x !== d.id)))} />
              <span>{d.title}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small" disabled={busy} onClick={submit}>{t('Speichern')}</button>
        <button type="button" className="btn small ghost" onClick={onCancel}>{t('Abbrechen')}</button>
        {onDelete && <button type="button" className="btn small danger outline" style={{ marginLeft: 'auto' }} onClick={onDelete}>{t('Plan löschen')}</button>}
      </div>
    </div>
  );
}
