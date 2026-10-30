import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Campaign, CounterKind, CounterValue } from '../api/types';
import { Dialog } from '../components/Dialog';
import { IconMinus, IconPlus } from '../components/Icons';
import { ErrorBox } from '../components/Screen';
import { t, tn } from '../i18n';
import { counterId, counterPreset } from './counterPresets';

/*
 * Zähler am Charakter (Schnittstelle 0.4.28): LeP, AsP und Ähnliches. Freiwillig, standardmäßig aus; die SL schaltet
 * sie je Kampagne ein. Die Spielerin ändert ihre Stände selbst, die SL sieht sie. Kein Sprachmodell liest sie.
 */

const valueOf = (values: CounterValue[] | undefined, kindId: string) => values?.find((v) => v.kindId === kindId);

/** Nur lesen: für die SL auf der Charakterseite und im SL-Schirm */
export function CountersLine({ kinds, values }: { kinds: CounterKind[]; values?: CounterValue[] }) {
  const shown = kinds.map((k) => ({ k, v: valueOf(values, k.id) })).filter((x) => x.v);
  if (!shown.length) return null;
  return (
    <span className="counters-line">
      {shown.map(({ k, v }) => (
        <span key={k.id} title={k.hint ?? undefined}>
          <strong>{k.label}</strong> {v!.value}{v!.max != null ? ` / ${v!.max}` : ''}
        </span>
      ))}
    </span>
  );
}

/** Eigene Zähler mit − und +; gespeichert wird kurz nach dem letzten Tippen */
export function MyCounters({ campaignId, kinds, initial }: { campaignId: string; kinds: CounterKind[]; initial?: CounterValue[] }) {
  const [values, setValues] = useState<CounterValue[]>(() => kinds.map((k) => valueOf(initial, k.id) ?? { kindId: k.id, value: 0, max: null }));
  const [state, setState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const timer = useRef<number | null>(null);
  const latest = useRef(values);

  const save = () => {
    setState('saving');
    api.setCounters(campaignId, latest.current).then(() => setState('saved')).catch(() => setState('failed'));
  };
  const update = (kindId: string, change: Partial<CounterValue>) => {
    const next = values.map((v) => (v.kindId === kindId ? { ...v, ...change } : v));
    latest.current = next;
    setValues(next);
    setState('saving');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 700);
  };
  // Beim Verlassen nicht Gespeichertes noch losschicken
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); api.setCounters(campaignId, latest.current).catch(() => undefined); } }, [campaignId]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 className="list-head">{t('Zähler')}</h2>
      <div className="list-box">
        {kinds.map((k) => {
          const v = values.find((x) => x.kindId === k.id)!;
          const low = v.max != null && v.max > 0 && v.value <= v.max / 4;
          return (
            <div key={k.id} className="list-row counter-row">
              <span className="lr-text">{k.label}{k.hint && k.hint !== k.label && <span className="lr-sub">{k.hint}</span>}</span>
              <button type="button" className="btn outline square" aria-label={t('{name} um eins senken', { name: k.label })} onClick={() => update(k.id, { value: v.value - 1 })}><IconMinus size={18} /></button>
              <input type="number" inputMode="numeric" className={low ? 'counter-value low' : 'counter-value'} aria-label={k.label} value={v.value}
                onChange={(e) => update(k.id, { value: Number.isFinite(e.target.valueAsNumber) ? Math.round(e.target.valueAsNumber) : 0 })} />
              <button type="button" className="btn outline square" aria-label={t('{name} um eins erhöhen', { name: k.label })} onClick={() => update(k.id, { value: v.value + 1 })}><IconPlus size={18} /></button>
              <label className="counter-max">
                <span>{t('von')}</span>
                <input type="number" inputMode="numeric" aria-label={t('Höchstwert {name}', { name: k.label })} value={v.max ?? ''}
                  onChange={(e) => update(k.id, { max: Number.isFinite(e.target.valueAsNumber) ? Math.max(0, Math.round(e.target.valueAsNumber)) : null })} />
              </label>
            </div>
          );
        })}
      </div>
      <span className="muted small" role="status">
        {state === 'failed' ? t('Nicht gespeichert – keine Verbindung. Ändere einen Wert, dann versucht es die App erneut.')
          : state === 'saving' ? t('Wird gespeichert …') : t('Siehst du und die Spielleitung.')}
      </span>
    </section>
  );
}

/** SL: Zähler einschalten und Arten festlegen (Kampagne verwalten) */
export function CounterKindsRow({ campaign, kinds, onSave, busy }: {
  campaign: Campaign;
  kinds: CounterKind[];
  onSave: (kinds: CounterKind[]) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="list-row nav" disabled={busy} onClick={() => setOpen(true)}>
        <span className="lr-text">{t('Zähler am Charakter')}
          <span className="lr-sub">{kinds.length ? kinds.map((k) => k.label).join(', ') : t('Aus. Zum Beispiel LeP und AsP, die Spielende selbst mitzählen.')}</span>
        </span>
        <span className="lr-val">{t('Ändern')}</span>
      </button>
      {open && <CounterKindsDialog campaign={campaign} kinds={kinds} onClose={() => setOpen(false)} onSave={onSave} />}
    </>
  );
}

function CounterKindsDialog({ campaign, kinds, onSave, onClose }: {
  campaign: Campaign;
  kinds: CounterKind[];
  onSave: (kinds: CounterKind[]) => Promise<void>;
  onClose: () => void;
}) {
  const [list, setList] = useState<CounterKind[]>(() => (kinds.length ? kinds : counterPreset(campaign.system, campaign.language)));
  const [on, setOn] = useState(kinds.length > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const edit = (i: number, change: Partial<CounterKind>) => setList(list.map((k, j) => (j === i ? { ...k, ...change } : k)));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const clean = on ? list.map((k) => ({ ...k, label: k.label.trim(), hint: k.hint?.trim() || null })).filter((k) => k.label) : [];
      await onSave(clean);
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog title={t('Zähler am Charakter')} onClose={onClose}>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>{t('Spielende zählen mit')}</span>
      </label>
      {on && (
        <>
          <span className="muted small">{t('Jede Spielerin ändert ihre Werte selbst, du siehst sie auf dem SL-Schirm. Nichts davon kommt ins Kapitel.')}</span>
          {list.map((k, i) => (
            <div key={k.id} className="row" style={{ gap: 6, alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '0 0 30%', margin: 0 }}>
                <label htmlFor={`ck-l-${i}`}>{t('Kurz')}</label>
                <input id={`ck-l-${i}`} type="text" maxLength={24} value={k.label} onChange={(e) => edit(i, { label: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label htmlFor={`ck-h-${i}`}>{t('Bedeutung')}</label>
                <input id={`ck-h-${i}`} type="text" maxLength={60} value={k.hint ?? ''} onChange={(e) => edit(i, { hint: e.target.value })} />
              </div>
              <button type="button" className="btn ghost square" aria-label={t('{name} entfernen', { name: k.label || t('Zähler') })}
                onClick={() => setList(list.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="row wrap" style={{ gap: 8 }}>
            {list.length < 8 && (
              <button type="button" className="btn small outline" onClick={() => setList([...list, { id: counterId(t('Zähler'), list.map((k) => k.id)), label: '', hint: null }])}>
                {t('Zähler hinzufügen')}
              </button>
            )}
            <button type="button" className="quiet-link" onClick={() => setList(counterPreset(campaign.system, campaign.language))}>{t('Vorlage für dieses Spielsystem')}</button>
          </div>
          {kinds.some((k) => !list.some((x) => x.id === k.id)) && (
            <span className="muted small">{tn(kinds.filter((k) => !list.some((x) => x.id === k.id)).length,
              'Ein entfernter Zähler verliert seine Stände bei allen.', 'Entfernte Zähler verlieren ihre Stände bei allen.')}</span>
          )}
        </>
      )}
      <ErrorBox error={error} />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={busy} onClick={save}>{t('Speichern')}</button>
        <button type="button" className="btn outline" onClick={onClose}>{t('Abbrechen')}</button>
      </div>
    </Dialog>
  );
}
