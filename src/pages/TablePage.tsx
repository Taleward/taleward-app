import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { spanClose, spanOpen } from '../recorder/spans';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { apiAtLeast, currentConnectionId, p } from '../api/connections';
import { useLive } from '../recorder/useLive';
import type { Campaign, CampaignSummary } from '../api/types';
import { Dialog } from '../components/Dialog';
import { CampaignCover, hasCover } from '../covers/CampaignCover';
import { IconBack, IconExpand } from '../components/Icons';
import { ErrorBox, rememberCampaign } from '../components/Screen';
import { t, tk, tn } from '../i18n';
import { BackgroundRecorder, hasNativeRecorder, type NativeStatus } from '../recorder/native';
import { BiblePanel } from '../table/BiblePanel';
import { DocsPanel } from '../table/DocsPanel';
import { GroupPanel } from '../table/GroupPanel';
import {
  GRID_COLS, GRID_ROWS, MIN_H, MIN_W, defaultLayout, fits, loadLayout, placeNew, readingOrder, saveLayout, tryChange, unusedPanels,
  type CardPos, type Layout, type PanelId
} from '../table/layout';
import { ClockPanel, LinksPanel, NotesPanel } from '../table/ExtraPanels';
import { PlanPanel } from '../table/PlanPanel';
import { Popup } from '../table/Popup';

const native = hasNativeRecorder();

/** Namen der Module (neue Module: hier, in layout.ts und unten in panel()) */
const LABELS: Record<PanelId, string> = {
  plan: tk('Kapitelplan'),
  docs: tk('Unterlagen'),
  bible: tk('Bibel'),
  group: tk('Die Gruppe'),
  notes: tk('Notizzettel'),
  clock: tk('Uhr'),
  links: tk('Links')
};
const label = (id: PanelId) => t(LABELS[id]);

/** Unter dieser Größe zeigt eine Karte nur die Kurzfassung; „Groß öffnen“ zeigt das Modul im Fenster */
const COMPACT_HEIGHT = 300;
const COMPACT_WIDTH = 280;
const WIDE = '(min-width: 700px)';

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Schmale Leiste, wenn dieses Gerät gerade aufnimmt. Sonst nichts. */
function RecordingBar({ campaignId }: { campaignId: string }) {
  const [st, setSt] = useState<NativeStatus | null>(null);
  // Browser (z. B. Taleward am PC): Aufnahme und Schirm im selben Fenster
  const live = useLive(true);
  useEffect(() => {
    if (!native) return;
    const poll = () => BackgroundRecorder.getStatus().then(setSt).catch(() => setSt(null));
    poll();
    const id = window.setInterval(poll, 1000);
    return () => window.clearInterval(id);
  }, []);
  const web = !native && live && live.connId === currentConnectionId() && live.recorder.state !== 'idle' ? live : null;
  if (!web && (!st || (st.state !== 'recording' && st.state !== 'paused'))) return null;
  const paused = web ? web.recorder.state === 'paused' : st!.state === 'paused';
  const elapsedMs = web ? web.recorder.elapsedMs() : st!.elapsedMs;
  const toggle = async () => {
    if (web) {
      if (paused) { web.recorder.resume(); spanOpen(web.sessionId); }
      else { web.recorder.pause(); spanClose(web.sessionId); }
      return;
    }
    const next = paused ? await BackgroundRecorder.resume() : await BackgroundRecorder.pause();
    if (next.sessionId) (next.state === 'paused' ? spanClose : spanOpen)(next.sessionId);
    setSt(next);
  };
  const target = web ? web.campaignId : campaignId;
  return (
    <div className="table-rec" role="status">
      <span className={paused ? 'table-rec-dot paused' : 'table-rec-dot'} aria-hidden />
      <span style={{ flex: 1 }}>
        {paused ? t('Aufnahme pausiert') : t('Aufnahme läuft')} · {clock(elapsedMs)}
      </span>
      <button type="button" className="btn small outline" onClick={toggle}>{paused ? t('Weiter') : t('Pause')}</button>
      <Link className="btn small ghost" to={p(`/k/${target}/aufnahme`)}>{t('Zur Aufnahme')}</Link>
    </div>
  );
}

/** „Kampagne wechseln“: andere Kampagnen dieses Servers, die man leitet – direkt zu deren SL-Schirm */
function SwitchCampaign({ current }: { current: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!open || list) return;
    api.campaigns().then((all) => setList(all.filter((c) => c.myRole === 'gm' && !c.archivedAt && c.id !== current))).catch(setError);
  }, [open, list, current]);
  return (
    <>
      <button type="button" className="linklike tap-link small" onClick={() => setOpen(true)}>{t('Kampagne wechseln')}</button>
      {open && (
        <Dialog title={t('Kampagne wechseln')} onClose={() => setOpen(false)}>
          <ErrorBox error={error} />
          {!list && !error && <span className="muted">{t('Lade …')}</span>}
          {list?.length === 0 && <span className="muted">{t('Du leitest auf diesem Server keine weitere Kampagne.')}</span>}
          {list?.map((c) => (
            <button key={c.id} type="button" className="btn outline" style={{ justifyContent: 'flex-start' }}
              onClick={() => { setOpen(false); navigate(p(`/k/${c.id}/tisch`)); }}>
              {c.title}
            </button>
          ))}
          <Link className="tap-link small" to="/" onClick={() => setOpen(false)}>{t('Alle Kampagnen')}</Link>
        </Dialog>
      )}
    </>
  );
}

/** Eine Karte auf dem Schirm; misst selbst, ob sie für die volle Ansicht groß genug ist */
function Card({ id, forceCompact, onCompact, onExpand, style, edge = '', children }: {
  id: PanelId;
  /** Trennlinie zum Nachbarn links/oben (Raster): 'l', 't' oder beides */
  edge?: string;
  forceCompact: boolean;
  onCompact: (id: PanelId, compact: boolean) => void;
  onExpand: () => void;
  style?: CSSProperties;
  children: (compact: boolean) => ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || forceCompact) return;
    // Die Größe gibt das Raster vor, nicht der Inhalt; darum schaukelt sich hier nichts auf
    const ro = new ResizeObserver(([e]) => setSmall(e.contentRect.height < COMPACT_HEIGHT || e.contentRect.width < COMPACT_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, [forceCompact]);
  const compact = forceCompact || small;
  useEffect(() => { onCompact(id, compact); }, [id, compact, onCompact]);
  return (
    <section ref={ref} className={['table-panel', compact ? 'compact' : '', edge.includes('l') ? 'edge-l' : '', edge.includes('t') ? 'edge-t' : ''].filter(Boolean).join(' ')}
      aria-label={label(id)} style={style}>
      <div className="table-panel-head">
        <h2 className="table-panel-title">{label(id)}</h2>
        {/* Als Zeichen statt als Wortknopf: drei gleiche Knöpfe am Handy machen den Schirm unruhig */}
        {compact && (
          <button type="button" className="btn ghost square" aria-label={t('{name} groß öffnen', { name: label(id) })} title={t('Groß öffnen')} onClick={onExpand}>
            <IconExpand />
          </button>
        )}
      </div>
      {children(compact)}
    </section>
  );
}

const area = (c: CardPos): CSSProperties => ({ gridColumn: `${c.x + 1} / span ${c.w}`, gridRow: `${c.y + 1} / span ${c.h}` });
const share = (n: number) => ({ 2: '1/3', 3: '1/2', 4: '2/3', 5: '5/6', 6: '1' } as Record<number, string>)[n] ?? `${n}/6`;

interface Drag {
  id: PanelId;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  orig: CardPos;
  preview: CardPos;
  ok: boolean;
}

/**
 * Bearbeiten: Karten ziehen (verschieben) oder an der Ecke ziehen (Größe), alles rastet im Raster ein und überlappt nie.
 * Dieselben Schritte gehen über die Leiste mit Knöpfen, auch ohne Ziehen und mit der Tastatur.
 */
function Editor({ layout, onChange, onDone }: { layout: Layout; onChange: (l: Layout) => void; onDone: () => void }) {
  const grid = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<PanelId | null>(layout[0]?.id ?? null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const card = layout.find((c) => c.id === selected) ?? null;
  const free = unusedPanels(layout);

  const change = (delta: Partial<Omit<CardPos, 'id'>>) => {
    if (!card) return;
    const next = tryChange(layout, card.id, delta);
    if (next) onChange(next);
  };
  const can = (delta: Partial<Omit<CardPos, 'id'>>) => !!card && fits(layout, { ...card, ...delta });

  const start = (e: ReactPointerEvent, c: CardPos, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(c.id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ id: c.id, mode, startX: e.clientX, startY: e.clientY, orig: c, preview: c, ok: true });
  };
  const move = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    const rect = grid.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dx = Math.round((e.clientX - d.startX) / (rect.width / GRID_COLS));
    const dy = Math.round((e.clientY - d.startY) / (rect.height / GRID_ROWS));
    const o = d.orig;
    const preview = d.mode === 'move'
      ? { ...o, x: Math.min(Math.max(0, o.x + dx), GRID_COLS - o.w), y: Math.min(Math.max(0, o.y + dy), GRID_ROWS - o.h) }
      : { ...o, w: Math.min(Math.max(MIN_W, o.w + dx), GRID_COLS - o.x), h: Math.min(Math.max(MIN_H, o.h + dy), GRID_ROWS - o.y) };
    setDrag({ ...d, preview, ok: fits(layout, preview) });
  };
  const end = () => {
    const d = dragRef.current;
    if (d && d.ok) onChange(layout.map((c) => (c.id === d.id ? d.preview : c)));
    setDrag(null);
  };

  // Ist kein Platz frei, macht placeNew die größte Karte etwas kleiner – das neue Modul ist dann gleich ausgewählt
  const add = (id: PanelId) => {
    const next = placeNew(layout, id);
    if (next) { onChange(next); setSelected(id); }
  };
  const anyRoom = free.length > 0 && !!placeNew(layout, free[0]);

  return (
    <>
      <div className="table-edit-bar" role="toolbar" aria-label={t('Schirm einrichten')}>
        {card ? (
          <>
            <strong className="table-edit-name">{label(card.id)} · {t('{w} breit, {h} hoch', { w: share(card.w), h: tn(card.h, '{n} Zeile', '{n} Zeilen') })}</strong>
            <div className="table-edit-group" role="group" aria-label={t('Verschieben')}>
              <button type="button" className="btn small ghost" disabled={!can({ x: card.x - 1 })} aria-label={t('{name} nach links', { name: label(card.id) })} onClick={() => change({ x: card.x - 1 })}>←</button>
              <button type="button" className="btn small ghost" disabled={!can({ x: card.x + 1 })} aria-label={t('{name} nach rechts', { name: label(card.id) })} onClick={() => change({ x: card.x + 1 })}>→</button>
              <button type="button" className="btn small ghost" disabled={!can({ y: card.y - 1 })} aria-label={t('{name} nach oben', { name: label(card.id) })} onClick={() => change({ y: card.y - 1 })}>↑</button>
              <button type="button" className="btn small ghost" disabled={!can({ y: card.y + 1 })} aria-label={t('{name} nach unten', { name: label(card.id) })} onClick={() => change({ y: card.y + 1 })}>↓</button>
            </div>
            <div className="table-edit-group" role="group" aria-label={t('Größe')}>
              <button type="button" className="btn small ghost" disabled={!can({ w: card.w - 1 })} onClick={() => change({ w: card.w - 1 })}>{t('Schmaler')}</button>
              <button type="button" className="btn small ghost" disabled={!can({ w: card.w + 1 })} onClick={() => change({ w: card.w + 1 })}>{t('Breiter')}</button>
              <button type="button" className="btn small ghost" disabled={!can({ h: card.h - 1 })} onClick={() => change({ h: card.h - 1 })}>{t('Niedriger')}</button>
              <button type="button" className="btn small ghost" disabled={!can({ h: card.h + 1 })} onClick={() => change({ h: card.h + 1 })}>{t('Höher')}</button>
            </div>
            <button type="button" className="btn small ghost" disabled={layout.length <= 1}
              onClick={() => { onChange(layout.filter((c) => c.id !== card.id)); setSelected(null); }}>{t('Vom Schirm nehmen')}</button>
          </>
        ) : <span className="muted small">{t('Tippe eine Karte an, um sie zu verschieben oder ihre Größe zu ändern.')}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn small ghost" onClick={() => { onChange(defaultLayout()); setSelected('plan'); }}>{t('Zurücksetzen')}</button>
        <button type="button" className="btn small" onClick={onDone}>{t('Fertig')}</button>
      </div>
      {free.length > 0 && <div className="table-edit-bar">
        {free.map((id) => (
          <button key={id} type="button" className="btn small dashed" disabled={!anyRoom} onClick={() => add(id)}>
            {t('{name} dazulegen', { name: label(id) })}
          </button>
        ))}
        {!anyRoom && <span className="muted small">{t('Alle Karten sind schon so klein wie möglich. Nimm erst eine vom Schirm.')}</span>}
      </div>}
      <p className="muted small" style={{ margin: 0 }}>{t('Karte ziehen zum Verschieben, an der Ecke ziehen für die Größe. Gilt nur auf diesem Gerät.')}</p>
      <div ref={grid} className="table-grid editing" onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}>
        {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => (
          <span key={i} className="table-cell" aria-hidden style={{ gridColumn: (i % GRID_COLS) + 1, gridRow: Math.floor(i / GRID_COLS) + 1 }} />
        ))}
        {layout.map((c) => {
          const shown = drag?.id === c.id ? drag.preview : c;
          const cls = ['table-edit-card', selected === c.id ? 'selected' : '', drag?.id === c.id ? (drag.ok ? 'dragging' : 'dragging blocked') : ''].join(' ');
          return (
            <div key={c.id} className={cls} style={area(shown)} onPointerDown={(e) => start(e, c, 'move')}>
              <button type="button" className="table-edit-select" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}
                onPointerDown={(e) => start(e, c, 'move')}>
                <strong>{label(c.id)}</strong>
                <span className="small">{share(shown.w)} · {tn(shown.h, '{n} Zeile', '{n} Zeilen')}</span>
              </button>
              <span className="table-edit-resize" aria-hidden onPointerDown={(e) => start(e, c, 'resize')} />
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * SL-Schirm: alles für den Spielabend auf einen Blick, für Tablet quer oder Laptop. Die SL legt die Karten im Raster
 * selbst zurecht (Größe und Platz). Nur für die Spielleitung.
 */
export function TablePage() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [nextNumber, setNextNumber] = useState(1);
  const [error, setError] = useState<unknown>(null);
  const [layout, setLayoutState] = useState<Layout>(loadLayout);
  const [editing, setEditing] = useState(false);
  const [popup, setPopup] = useState<PanelId | null>(null);
  /** Nach dem Schließen des Fensters laden die Karten neu (dort kann sich etwas geändert haben) */
  const [round, setRound] = useState(0);
  const compactRef = useRef<Partial<Record<PanelId, boolean>>>({});
  const [bibleQuery, setBibleQuery] = useState('');
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const wide = useWide();

  useEffect(() => {
    Promise.all([api.campaign(campaignId), api.sessions(campaignId)]).then(([c, s]) => {
      rememberCampaign(c);
      setCampaign(c);
      setNextNumber(Math.max(0, ...s.map((x) => x.number ?? 0)) + 1);
    }).catch(setError);
  }, [campaignId]);

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    saveLayout(l);
  };
  const onCompact = useRef((id: PanelId, c: boolean) => { compactRef.current[id] = c; }).current;
  const closePopup = useRef(() => { setPopup(null); setRound((r) => r + 1); }).current;

  /** Ein Modul zeigen: liegt es groß auf dem Schirm, dort; sonst im Fenster */
  const show = (id: PanelId) => {
    const onScreen = layout.some((c) => c.id === id);
    if (!onScreen || compactRef.current[id] !== false) setPopup(id);
  };
  const openEntry = (id: string) => {
    setBibleQuery('');
    setFocusEntryId(null);
    window.setTimeout(() => setFocusEntryId(id), 0);
    show('bible');
  };
  const openDoc = (id: string | null) => {
    setDocId(id);
    if (id) show('docs');
  };

  const panel = (id: PanelId, compact: boolean) => {
    if (!campaign) return null;
    switch (id) {
      case 'plan':
        return apiAtLeast('0.4.12')
          ? <PlanPanel campaignId={campaign.id} nextNumber={nextNumber} onEntry={openEntry} onDoc={openDoc} compact={compact} />
          : <div className="table-panel-body"><div className="muted small">{t('Kapitelpläne kann dein Server noch nicht speichern. Nach dem nächsten Update des Servers sind sie da.')}</div></div>;
      case 'docs':
        return <DocsPanel campaignId={campaign.id} docId={docId} onDoc={openDoc} compact={compact} />;
      case 'bible':
        return <BiblePanel campaignId={campaign.id} members={campaign.members} query={bibleQuery} onQuery={setBibleQuery}
          focusEntryId={focusEntryId} compact={compact} onEntry={openEntry} />;
      case 'group':
        return <GroupPanel campaign={campaign} onEntry={openEntry} compact={compact} />;
      case 'notes':
        return <NotesPanel campaignId={campaign.id} nextNumber={nextNumber} compact={compact} />;
      case 'clock':
        return <ClockPanel campaignId={campaign.id} compact={compact} />;
      case 'links':
        return <LinksPanel campaign={campaign} onCampaign={setCampaign} compact={compact} />;
    }
  };

  const gm = campaign?.myRole === 'gm';

  return (
    <div className={editing ? 'table-screen editing' : 'table-screen'}>
      <header className="table-header">
        <Link className="btn ghost small" to={p(`/k/${campaignId}`)}><IconBack size={20} /> {t('Übersicht')}</Link>
        {/* Titelbild klein neben dem Namen – die Kopfzeile wird dadurch nicht höher */}
        {wide && campaign && hasCover(campaign) && (
          <div className="table-cover" aria-hidden><CampaignCover campaign={campaign} height={48} radius={8} /></div>
        )}
        {/* Mindestbreite für den Titel: am Handy rutschen die Knöpfe lieber in die nächste Zeile */}
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div className="overline">{campaign?.title ?? ' '}</div>
          <h1 className="table-title">{t('SL-Schirm')}</h1>
        </div>
        {gm && !editing && <SwitchCampaign current={campaignId} />}
        {gm && wide && !editing && (
          <button type="button" className="btn small outline" onClick={() => setEditing(true)}>{t('Schirm einrichten')}</button>
        )}
      </header>
      <ErrorBox error={error} />
      {!campaign && !error && <div className="empty">{t('Lade …')}</div>}
      {campaign && !gm && (
        <div className="empty">{t('Den SL-Schirm hat nur die Spielleitung. Was du über die Welt weißt, steht in der Bibel.')}</div>
      )}
      {gm && editing && wide && <Editor layout={layout} onChange={setLayout} onDone={() => setEditing(false)} />}
      {gm && !(editing && wide) && (
        <>
          <RecordingBar campaignId={campaign.id} />
          {wide ? (
            <div className="table-grid">
              {layout.map((c) => (
                <Card key={`${c.id}-${round}`} id={c.id} forceCompact={false} onCompact={onCompact} onExpand={() => setPopup(c.id)} style={area(c)}
                  edge={(c.x > 0 ? 'l' : '') + (c.y > 0 ? 't' : '')}>
                  {(compact) => panel(c.id, compact)}
                </Card>
              ))}
            </div>
          ) : (
            // Schmal: alle Karten untereinander, jede als Kurzfassung
            <div className="table-stack">
              {readingOrder(layout).map((c) => (
                <Card key={`${c.id}-${round}`} id={c.id} forceCompact onCompact={onCompact} onExpand={() => setPopup(c.id)}>
                  {(compact) => panel(c.id, compact)}
                </Card>
              ))}
            </div>
          )}
          {!wide && (
            <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
              {t('Weitere Karten wie Uhr, Notizzettel und Links legst du auf dem Tablet oder im Querformat dazu (Schirm einrichten).')}
            </p>
          )}
          {popup && <Popup title={label(popup)} onClose={closePopup}>{panel(popup, false)}</Popup>}
        </>
      )}
    </div>
  );
}
