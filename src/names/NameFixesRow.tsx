import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Campaign, NameFix } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { Dialog } from '../components/Dialog';
import { formatDate } from '../components/format';
import { ErrorBox } from '../components/Screen';
import { t, tn } from '../i18n';
import { NameFixDialog } from './NameFixDialog';

/**
 * „Kampagne verwalten“ → Schreibweisen (nur SL, ab 0.4.31): bisherige Berichtigungen mit Rückgängig (24 h) und
 * „Nicht mehr erkennen“, dazu eine neue Berichtigung.
 */
export function NameFixesRow({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="list-row nav" onClick={() => setOpen(true)}>
        <span className="lr-text">{t('Schreibweisen')}<span className="lr-sub">{t('Einen Namen überall in der Kampagne berichtigen')}</span></span>
      </button>
      {open && <NameFixesDialog campaign={campaign} onClose={() => setOpen(false)} />}
    </>
  );
}

function NameFixesDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [fixes, setFixes] = useState<NameFix[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = () => api.nameFixes(campaign.id).then((r) => setFixes(r.fixes)).catch(setError);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [campaign.id]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try { await fn(); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const undo = (f: NameFix) => run(async () => {
    if (!(await confirmDialog(t('„{to}“ wieder zu „{from}“ machen? Stellen, die seitdem bearbeitet wurden, bleiben, wie sie sind.', { from: f.from, to: f.to }), { confirmLabel: t('Rückgängig') }))) return;
    const r = await api.undoNameFix(f.id);
    setNote(r.skipped.length
      ? tn(r.restored, 'Eine Stelle zurückgesetzt. Seitdem geändert und deshalb so geblieben: {places}.', '{n} Stellen zurückgesetzt. Seitdem geändert und deshalb so geblieben: {places}.', { places: r.skipped.map((x) => x.label).join(', ') })
      : tn(r.restored, 'Eine Stelle zurückgesetzt.', '{n} Stellen zurückgesetzt.'));
  });

  const forget = (f: NameFix) => run(async () => { await api.deleteNameFixRule(f.id); });

  if (adding) {
    return <NameFixDialog campaignId={campaign.id} campaignTitle={campaign.title} members={campaign.members}
      onClose={() => { setAdding(false); load(); }} />;
  }

  const name = (id: string) => campaign.members.find((m) => m.id === id)?.displayName ?? '';

  return (
    <Dialog title={t('Schreibweisen')} onClose={onClose}>
      <ErrorBox error={error} />
      {note && <div className="notice" role="status">{note}</div>}
      <button type="button" className="btn" onClick={() => setAdding(true)}>{t('Schreibweise berichtigen')}</button>
      {fixes && fixes.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('Noch keine Berichtigungen. Steht ein Name in mehreren Kapiteln falsch, berichtigst du ihn hier einmal für alle.')}</p>}
      {fixes && fixes.length > 0 && (
        <div className="list-box flat">
          {fixes.map((f) => (
            <div key={f.id} className="list-row" style={{ display: 'grid', gap: 2 }}>
              <span className="lr-text">„{f.from}“ → „{f.to}“
                <span className="lr-sub">
                  {f.undoneAt ? t('Rückgängig gemacht') : tn(f.changed, 'eine Stelle', '{n} Stellen')}
                  {' · '}{formatDate(f.createdAt, 'short')}{name(f.createdBy) ? ` · ${name(f.createdBy)}` : ''}
                  {f.rule ? ' · ' + t('wird erkannt') : ''}
                </span>
              </span>
              <span className="row wrap" style={{ gap: 12 }}>
                {f.undoUntil && !f.undoneAt && (
                  <button type="button" className="quiet-link small" disabled={busy} onClick={() => undo(f)}>{t('Rückgängig')}</button>
                )}
                {f.rule && (
                  <button type="button" className="quiet-link small" disabled={busy} onClick={() => forget(f)}>{t('Nicht mehr erkennen')}</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn ghost" onClick={onClose}>{t('Schließen')}</button>
    </Dialog>
  );
}
