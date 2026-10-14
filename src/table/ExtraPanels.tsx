import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { apiAtLeast, currentConnectionId } from '../api/connections';
import type { Campaign, ChapterPlan, Link } from '../api/types';
import { LinkButtons, LinkEditor } from '../components/Links';
import { ErrorBox } from '../components/Screen';
import { getLang, t } from '../i18n';
import { currentPlan } from './currentPlan';

/*
 * Weitere Module für den SL-Schirm: Links, Uhr und Notizzettel. Jedes hat eine kleine (compact) und eine große Ansicht.
 */

const store = {
  get<T>(key: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ }
  }
};
const scoped = (name: string, campaignId: string) => `taleward.${name}.${currentConnectionId() ?? '-'}:${campaignId}`;

/** Links der Kampagne: Spieltisch, Discord, Karte, Musik. Geteilte sehen auch die Spieler auf ihrer Übersicht. */
export function LinksPanel({ campaign, onCampaign, compact }: { campaign: Campaign; onCampaign: (c: Campaign) => void; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!apiAtLeast('0.4.13')) {
    return <div className="table-panel-body"><div className="muted small">{t('Links kann dein Server noch nicht speichern. Nach dem nächsten Update des Servers sind sie da.')}</div></div>;
  }
  const links = campaign.links ?? [];
  const save = async (next: Link[]) => {
    setError(null);
    try {
      onCampaign(await api.updateCampaign(campaign.id, { links: next }));
      setEditing(false);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="table-panel-body">
      <ErrorBox error={error} />
      {editing && !compact
        ? <LinkEditor links={links} max={20} canShare onSave={save} onCancel={() => setEditing(false)} />
        : (
          <>
            {links.length === 0 && <span className="muted small">{t('Noch keine Links. Zum Beispiel der virtuelle Spieltisch, der Sprachkanal, eine Karte oder Musik.')}</span>}
            <LinkButtons links={links} />
            {links.some((l) => l.shared) && !compact && <span className="muted small">{t('Mit „Auch für Spieler“ markierte Links sehen alle am Tisch auf ihrer Übersicht.')}</span>}
            {!compact && <button type="button" className="btn small dashed" onClick={() => setEditing(true)}>{links.length ? t('Links bearbeiten') : t('Link hinzufügen')}</button>}
          </>
        )}
    </div>
  );
}

interface Evening {
  /** Tag, für den der Rest gilt; am nächsten Tag beginnt alles neu */
  date: string;
  start: string | null;
  end: string | null;
}

const today = () => new Date().toLocaleDateString('sv');
const hm = (d: Date) => d.toLocaleTimeString(getLang() === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
/** Dauer als „1 h 36 min“ bzw. „54 min“ – nicht wie eine Uhrzeit (Design-Prüfung 09.10.) */
function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? t('{h} h {m} min', { h, m: m % 60 }) : t('{m} min', { m });
}

/** Uhr für den Abend: wie spät, wie lange schon gespielt, wie viel Zeit bis zum geplanten Ende. Nur auf diesem Gerät. */
export function ClockPanel({ campaignId, compact }: { campaignId: string; compact?: boolean }) {
  const key = scoped('abend', campaignId);
  const [now, setNow] = useState(() => new Date());
  const [ev, setEv] = useState<Evening>(() => {
    const saved = store.get<Evening | null>(key, null);
    return saved && saved.date === today() ? saved : { date: today(), start: null, end: null };
  });
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const update = (change: Partial<Evening>) => {
    const next = { ...ev, ...change, date: today() };
    setEv(next);
    store.set(key, next);
  };

  const start = ev.start ? new Date(ev.start) : null;
  let end: Date | null = null;
  if (ev.end) {
    const [h, m] = ev.end.split(':').map(Number);
    end = new Date(now);
    end.setHours(h, m, 0, 0);
    if (start && end < start) end.setDate(end.getDate() + 1); // Ende nach Mitternacht
  }
  const left = end ? end.getTime() - now.getTime() : null;

  const elapsed = start ? now.getTime() - start.getTime() : null;
  // Anteil des Abends, der schon vorbei ist (nur mit Beginn und Ende)
  const share = start && end ? Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / Math.max(1, end.getTime() - start.getTime()))) : null;
  const over = left !== null && left < 0;
  const startNow = () => update({ start: new Date().toISOString() });

  return (
    <div className="table-panel-body table-clock-body">
      <div className="table-clock-stats">
        <div className="table-clock-stat">
          <span className="overline">{t('Jetzt')}</span>
          <span className="table-clock" aria-live="off">{hm(now)}</span>
        </div>
        {!start && (
          <div className="table-clock-stat" style={{ alignSelf: 'center', alignItems: 'flex-start' }}>
            <button type="button" className="btn small outline" onClick={startNow}>{t('Runde beginnt jetzt')}</button>
          </div>
        )}
        {elapsed !== null && (
          <div className="table-clock-stat">
            <span className="overline">{t('Runde läuft seit')}</span>
            <span className="table-clock-value">{span(elapsed)}</span>
          </div>
        )}
        {left !== null && (
          <div className={over ? 'table-clock-stat over' : 'table-clock-stat'}>
            <span className="overline">{over ? t('Über der Zeit') : t('Noch bis {end}', { end: ev.end! })}</span>
            <span className="table-clock-value">{span(Math.abs(left))}</span>
          </div>
        )}
      </div>
      {share !== null && (
        <div className={over ? 'table-clock-bar over' : 'table-clock-bar'} role="progressbar" aria-label={t('Verlauf des Abends')}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
          <span style={{ width: `${share * 100}%` }} />
        </div>
      )}
      {!compact && (
        <>
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
            {start && <button type="button" className="btn small ghost" onClick={() => update({ start: null })}>{t('Beginn zurücksetzen')}</button>}
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`clock-end-${campaignId}`}>{t('Geplantes Ende')}</label>
              <input id={`clock-end-${campaignId}`} type="time" value={ev.end ?? ''} onChange={(e) => update({ end: e.target.value || null })} />
            </div>
          </div>
          <span className="muted small">{t('Gilt nur für heute und nur auf diesem Gerät.')}</span>
        </>
      )}
    </div>
  );
}

/**
 * Notizzettel für die Runde. Ab Schnittstelle 0.4.13 im Plan der nächsten Runde gespeichert (nur für dich, auf allen
 * Geräten, nie im Kapitel); bei älteren Servern nur auf diesem Gerät.
 */
export function NotesPanel({ campaignId, nextNumber, compact }: { campaignId: string; nextNumber: number; compact?: boolean }) {
  const online = apiAtLeast('0.4.13');
  const localKey = scoped('notizen', campaignId);
  const [text, setText] = useState<string | null>(online ? null : store.get(localKey, ''));
  const [plan, setPlan] = useState<ChapterPlan | null>(null);
  const [state, setState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const planRef = useRef<ChapterPlan | null>(null);
  planRef.current = plan;

  useEffect(() => {
    if (!online) return;
    currentPlan(campaignId, nextNumber, false).then((pl) => { setPlan(pl); setText(pl?.tableNotes ?? ''); }).catch((e) => { setError(e); setText(''); });
  }, [campaignId, nextNumber, online]);

  const flush = async () => {
    if (pending.current === null) return;
    const value = pending.current;
    pending.current = null;
    if (!online) { store.set(localKey, value); setState('saved'); return; }
    setState('saving');
    try {
      const pl = planRef.current ?? await currentPlan(campaignId, nextNumber, true);
      const u = await api.updatePlan(pl!.id, { tableNotes: value || null });
      setPlan(u);
      setError(null);
      setState(pending.current === null ? 'saved' : 'dirty');
    } catch (e) {
      setError(e);
      pending.current = pending.current ?? value;
      setState('dirty');
    }
  };

  // Beim Verlassen nichts verlieren
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); flush(); }, // eslint-disable-line react-hooks/exhaustive-deps
    []);

  const change = (v: string) => {
    setText(v);
    pending.current = v;
    setState('dirty');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 1200);
  };

  return (
    <div className="table-panel-body">
      <ErrorBox error={error} />
      {text === null
        ? <div className="muted small">{t('Lade …')}</div>
        : (
          <textarea className="table-notes" aria-label={t('Notizen zur Runde')} rows={compact ? 3 : 10} value={text}
            placeholder={t('Was dir während der Runde einfällt …')} onChange={(e) => change(e.target.value)} onBlur={() => flush()} />
        )}
      <span className="muted small" role="status">
        {state === 'saving' ? t('Speichert …') : state === 'dirty' ? t('Noch nicht gespeichert') : online
          ? (plan ? t('Gespeichert im Plan „{title}“. Nur für dich, fließt nie in ein Kapitel.', { title: plan.title }) : t('Wird mit der ersten Notiz im Plan der nächsten Runde gespeichert.'))
          : t('Nur auf diesem Gerät gespeichert, bis dein Server Notizen kann.')}
      </span>
    </div>
  );
}
