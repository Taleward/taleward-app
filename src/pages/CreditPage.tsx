import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isApiError } from '../api/client';
import { currentConnection } from '../api/connections';
import type { Credit, CreditBooking, CreditWaitingJob, ServerInfo } from '../api/types';
import { eur } from '../billing/CreditWaitNote';
import { billingOn, parseEuro, topUpUrl, vouchersAllowed, waitReason } from '../billing/rules';
import { confirmDialog } from '../components/confirm';
import { formatDate } from '../components/format';
import { ErrorBox, Screen } from '../components/Screen';
import { getLang, t, tk, tn } from '../i18n';
import { DIST } from '../update/updater';

/**
 * Guthaben auf einem Server (Schnittstelle 0.4.25): Stand, wartende Aufträge mit „Verarbeiten“, Einstellungen,
 * Gutschein und Buchungen. Bezahlt wird nie hier – „Guthaben aufladen“ öffnet nur in der Fassung von der Website die
 * Aufladeseite des Servers im Browser; die Store-Fassung zeigt keinen Weg dorthin.
 */
export function CreditPage() {
  const conn = currentConnection();
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [credits, setCredits] = useState<Credit[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    api.info().then(setInfo).catch(() => undefined);
    api.credits().then(setCredits).catch((e) => { setError(e); setCredits([]); });
  }, []);
  useEffect(load, [load]);

  const off = (info && !billingOn(info)) || isApiError(error) && error.status === 404;
  return (
    <Screen narrow backTo={{ to: '/konto', label: t('Konten und Server') }} overline={conn.name} title={t('Guthaben')} nav={false}>
      {off ? (
        <p className="muted" style={{ margin: 0 }}>{t('Dieser Server rechnet nicht über Guthaben ab.')}</p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {t('Damit bezahlt die Spielleitung die Verarbeitung ihrer Runden: Abschrift, Kapitel und Unterlagen. Für Spielende kostenlos.')}
          </p>
          {!credits && !error && <p className="muted">{t('Wird geladen …')}</p>}
          {!off && <ErrorBox error={error} />}
          {credits?.map((c) => <CreditCard key={c.id} credit={c} info={info} baseUrl={conn.baseUrl} onChanged={load} />)}
        </>
      )}
    </Screen>
  );
}

async function openOutside(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, toolbarColor: '#17313b' });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

const STATUS: Record<string, string> = {
  low: tk('Das Guthaben wird knapp.'),
  empty: tk('Kein Guthaben mehr. Neue Verarbeitungen warten, bis wieder etwas da ist.'),
  negative: tk('Im Minus. Neue Verarbeitungen warten, bis das Guthaben wieder über null ist.')
};

function CreditCard({ credit, info, baseUrl, onChanged }: { credit: Credit; info: ServerInfo | null; baseUrl: string; onChanged: () => void }) {
  const [waiting, setWaiting] = useState<CreditWaitingJob[] | null>(null);
  const [bookings, setBookings] = useState<CreditBooking[] | null>(null);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const url = credit.canManage ? topUpUrl(info, baseUrl, DIST) : null;
  const pot = credit.kind === 'organization';

  const loadLists = useCallback(() => {
    api.creditWaiting(credit.id).then(setWaiting).catch(() => setWaiting([]));
    api.creditBookings(credit.id).then((b) => { setBookings(b); setMore(b.length >= 30); }).catch(() => setBookings([]));
  }, [credit.id]);
  useEffect(loadLists, [loadLists]);

  const loadMore = async () => {
    const last = bookings?.[bookings.length - 1];
    if (!last) return;
    try {
      const next = await api.creditBookings(credit.id, last.id);
      setBookings([...(bookings ?? []), ...next]);
      setMore(next.length >= 30);
    } catch (e) {
      setError(e);
    }
  };

  const approve = async (job: CreditWaitingJob) => {
    if (!(await confirmDialog(t('Verarbeiten? Das kostet voraussichtlich {amount} aus deinem Guthaben.', { amount: eur(job.estimateCents) }), { confirmLabel: t('Verarbeiten') }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.approveCreditJob(credit.id, job.jobId);
      loadLists();
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" style={{ gap: 12 }}>
      <span className="overline">{pot ? t('Guthaben von {name}', { name: credit.organizationName ?? t('der Organisation') }) : t('Dein Guthaben')}</span>
      <div style={{ fontFamily: 'var(--font-serif, Alegreya, serif)', fontSize: 34, lineHeight: 1.1 }} aria-live="polite">{eur(credit.balanceCents)}</div>
      {STATUS[credit.status] && <span className="small" style={{ fontWeight: 700 }}>{t(STATUS[credit.status])}</span>}
      {url && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button type="button" className="btn" onClick={() => openOutside(url)}>{t('Guthaben aufladen')}</button>
          <span className="muted small">{t('Öffnet die Seite des Servers im Browser. Bezahlt wird dort, nicht in der App.')}</span>
        </div>
      )}
      {!url && credit.canManage && DIST === 'store' && credit.status !== 'good' && (
        <span className="muted small">{t('Aufladen kannst du auf der Seite deines Servers.')}</span>
      )}
      {!credit.canManage && (
        <span className="muted small">{t('Aufladen, Freigeben und Einstellungen gehen beim Guthaben der Organisation nur auf der Seite des Servers, mit zweitem Faktor.')}</span>
      )}
      <ErrorBox error={error} />

      {waiting && waiting.length > 0 && (
        <>
          <h3 style={{ margin: '6px 0 0' }}>{tn(waiting.length, 'Wartet ({n})', 'Warten ({n})')}</h3>
          {waiting.map((w) => (
            <div key={w.jobId} className="row wrap" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 8, alignItems: 'center' }}>
              <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                <span>{jobLabel(w.jobKind)}</span>
                <span className="muted small"> · {[w.campaignTitle, w.sessionNumber != null ? t('Kapitel {n}', { n: w.sessionNumber }) : null, w.documentTitle].filter(Boolean).join(' · ')}</span>
                <br />
                <span className="muted small">{t('etwa {amount}', { amount: eur(w.estimateCents) })} · {t(WAIT_SHORT[waitReason(w.reason)])}</span>
              </span>
              {waitReason(w.reason) === 'approval' && credit.canManage && (
                <button type="button" className="btn small outline" disabled={busy} onClick={() => approve(w)}>{t('Verarbeiten')}</button>
              )}
            </div>
          ))}
        </>
      )}

      {credit.canManage && <CreditSettings credit={credit} onSaved={onChanged} />}
      {credit.canManage && vouchersAllowed(DIST) && <Voucher credit={credit} onDone={() => { loadLists(); onChanged(); }} />}

      <h3 style={{ margin: '6px 0 0' }}>{t('Buchungen')}</h3>
      {bookings && bookings.length === 0 && <span className="muted small">{t('Noch keine Buchungen.')}</span>}
      {bookings?.map((b) => (
        <div key={b.id} className="row" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 6, alignItems: 'baseline' }}>
          <span className="muted small" style={{ width: 64, flexShrink: 0 }}>{formatDate(b.createdAt)}</span>
          <span className="small" style={{ flex: 1, minWidth: 0 }}>{bookingLabel(b)}</span>
          <span className="small" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: b.amountCents > 0 ? 700 : 400 }}>
            {b.amountCents > 0 ? '+' : ''}{eur(b.amountCents)}
          </span>
        </div>
      ))}
      {bookings && bookings.length > 0 && more && (
        <button type="button" className="btn small quiet" style={{ alignSelf: 'flex-start' }} onClick={loadMore}>{t('Ältere anzeigen')}</button>
      )}
    </section>
  );
}

const WAIT_SHORT: Record<string, string> = {
  approval: tk('wartet auf „Verarbeiten“'),
  empty: tk('wartet auf Guthaben'),
  too_low: tk('Guthaben reicht voraussichtlich nicht'),
  no_payer: tk('niemand zahlt'),
  pot: tk('wartet auf die Verwaltung'),
  other: tk('wartet')
};

const JOBS: Record<string, string> = {
  transcribe: tk('Abschrift'),
  summarize: tk('Kapitel schreiben'),
  revise: tk('Kapitel überarbeiten'),
  document: tk('Unterlage auswerten')
};
const jobLabel = (kind: string) => t(JOBS[kind] ?? 'Verarbeitung');

function bookingLabel(b: CreditBooking): string {
  const withReason = (label: string) => (b.reason ? `${label}: ${b.reason}` : label);
  switch (b.kind) {
    case 'payment': return t('Aufgeladen');
    case 'credit': return withReason(t('Gutschrift'));
    case 'voucher': return t('Gutschein');
    case 'chargeback': return t('Rückbuchung');
    case 'refund': return t('Erstattung');
    case 'correction': return withReason(t('Korrektur'));
    case 'usage': {
      const u = b.usage;
      const parts = [jobLabel(u?.jobKind ?? ''), u?.campaignTitle, u?.sessionNumber != null ? t('Kapitel {n}', { n: u.sessionNumber }) : null, u?.documentTitle];
      return parts.filter(Boolean).join(' · ');
    }
    default: return b.reason ?? t('Buchung');
  }
}

function CreditSettings({ credit, onSaved }: { credit: Credit; onSaved: () => void }) {
  const lang = getLang();
  const asText = (cents: number) => (cents / 100).toFixed(2).replace('.', lang === 'de' ? ',' : '.');
  const [threshold, setThreshold] = useState(asText(credit.approvalThresholdCents));
  const [pages, setPages] = useState(String(credit.sheetMaxPages));
  const [sheets, setSheets] = useState(String(credit.sheetsPerPlayer));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const cents = parseEuro(threshold);
  const pagesN = Number(pages), sheetsN = Number(sheets);
  const valid = cents !== null && cents <= 100000 && Number.isInteger(pagesN) && pagesN >= 1 && pagesN <= 2000 && Number.isInteger(sheetsN) && sheetsN >= 0 && sheetsN <= 50;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateCreditSettings(credit.id, { approvalThresholdCents: cents, sheetMaxPages: pagesN, sheetsPerPlayer: sheetsN });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="more">
      <summary>{t('Einstellungen')}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        <div className="field">
          <label htmlFor={`thr-${credit.id}`}>{t('Vorher fragen ab (Euro)')}</label>
          <input id={`thr-${credit.id}`} type="text" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          <span className="muted small">{t('Kostet eine Verarbeitung voraussichtlich mehr, wartet sie auf dein „Verarbeiten“.')}</span>
        </div>
        <div className="field">
          <label htmlFor={`pg-${credit.id}`}>{t('Seiten je Charakterbogen')}</label>
          <input id={`pg-${credit.id}`} type="text" inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`sh-${credit.id}`}>{t('Charakterbögen je Spielerin und Kampagne')}</label>
          <input id={`sh-${credit.id}`} type="text" inputMode="numeric" value={sheets} onChange={(e) => setSheets(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        {!valid && <span className="small" role="alert">{t('Bitte gültige Werte eintragen.')}</span>}
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn small outline" disabled={busy || !valid} onClick={save}>{t('Speichern')}</button>
          {saved && <span className="small" role="status">{t('Gespeichert.')}</span>}
        </div>
      </div>
    </details>
  );
}

function Voucher({ credit, onDone }: { credit: Credit; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const redeem = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.redeemVoucher(credit.id, code.trim());
      setResult(t('{amount} gutgeschrieben.', { amount: eur(r.amountCents) }));
      setCode('');
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="more">
      <summary>{t('Gutschein einlösen')}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <div className="field">
          <label htmlFor={`vc-${credit.id}`}>{t('Code')}</label>
          <input id={`vc-${credit.id}`} type="text" autoCapitalize="characters" autoComplete="off" maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        {result && <span className="small" role="status">{result}</span>}
        <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start' }} disabled={busy || !code.trim()} onClick={redeem}>{t('Einlösen')}</button>
      </div>
    </details>
  );
}

/** Kurze Zeile mit Weg zum Guthaben, z. B. unter „Konten und Server“ */
export function CreditLink({ connId }: { connId: string }) {
  return <Link className="btn small outline" to={`/v/${connId}/guthaben`}>{t('Guthaben')}</Link>;
}
