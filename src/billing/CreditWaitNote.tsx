import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { currentConnection } from '../api/connections';
import type { CreditWait } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { IconInfo } from '../components/Icons';
import { ErrorBox } from '../components/Screen';
import { getLang, t } from '../i18n';
import { DIST } from '../update/updater';
import { canApprove, euro, waitReason } from './rules';

/** Betrag in der Sprache der App */
export const eur = (cents: number) => euro(cents, getLang());

/**
 * Warum ein Auftrag wegen des Guthabens wartet (Schnittstelle 0.4.25). Den Satz formuliert die App selbst: in der
 * Store-Fassung ohne Link und ohne Knopf zum Aufladen, sonst mit Weg zur Seite „Guthaben“ in der App.
 * Betrag, „Verarbeiten“ und der Weg zum Guthaben gibt es nur, wenn der Server die Kennungen mitschickt (zahlende SL).
 */
export function CreditWaitNote({ wait, onApproved }: { wait: CreditWait | null | undefined; onApproved?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!wait || done) return null;
  const reason = waitReason(wait.reason);
  const mine = !!wait.creditId;
  const amount = wait.estimateCents != null ? eur(wait.estimateCents) : null;
  const store = DIST === 'store';
  const creditPage = mine ? `/v/${currentConnection().id}/guthaben` : null;

  let text: string;
  switch (reason) {
    case 'approval':
      text = mine
        ? (amount ? t('Kostet voraussichtlich {amount}. Die Verarbeitung startet, sobald du sie freigibst.', { amount }) : t('Die Verarbeitung startet, sobald du sie freigibst.'))
        : t('Die Verarbeitung wartet auf die Freigabe der Spielleitung, die für die Kampagne zahlt.');
      break;
    case 'empty':
      text = mine
        ? (store ? t('Kein Guthaben, die Verarbeitung wartet. Du kannst es auf der Seite deines Servers aufladen.') : t('Kein Guthaben, die Verarbeitung wartet. Danach startet sie von selbst.'))
        : t('Das Guthaben der Spielleitung, die für die Kampagne zahlt, ist aufgebraucht. Die Verarbeitung wartet.');
      break;
    case 'too_low':
      text = mine
        ? (store
          ? t('Das Guthaben reicht voraussichtlich nicht ({amount}). Du kannst es auf der Seite deines Servers aufladen.', { amount: amount ?? '?' })
          : t('Das Guthaben reicht voraussichtlich nicht ({amount}). Danach startet die Verarbeitung von selbst.', { amount: amount ?? '?' }))
        : t('Das Guthaben der Spielleitung, die für die Kampagne zahlt, reicht voraussichtlich nicht. Die Verarbeitung wartet.');
      break;
    case 'no_payer':
      text = t('Für diese Kampagne zahlt gerade niemand. Unter „Kampagne verwalten“ kann eine Spielleitung die Zahlung übernehmen.');
      break;
    case 'pot':
      text = t('Das Guthaben der Organisation reicht gerade nicht oder wartet auf die Verwaltung. Die Verarbeitung startet danach von selbst.');
      break;
    default:
      text = t('Die Verarbeitung wartet auf das Guthaben.');
  }

  const approve = async () => {
    if (!wait.creditId || !wait.jobId) return;
    const q = amount
      ? t('Verarbeiten? Das kostet voraussichtlich {amount} aus deinem Guthaben.', { amount })
      : t('Verarbeiten? Die Kosten gehen von deinem Guthaben ab.');
    if (!(await confirmDialog(q, { confirmLabel: t('Verarbeiten') }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.approveCreditJob(wait.creditId, wait.jobId);
      setDone(true);
      onApproved?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="notice" role="status" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, color: 'var(--ink-muted)' }}><IconInfo /></span>
        <span>{text}</span>
      </div>
      <ErrorBox error={error} />
      {(canApprove(wait) || (creditPage && reason !== 'approval')) && (
        <div className="row wrap" style={{ gap: 8 }}>
          {canApprove(wait) && <button type="button" className="btn small" disabled={busy} onClick={approve}>{t('Verarbeiten')}</button>}
          {creditPage && reason !== 'approval' && <Link className="btn small outline" to={creditPage}>{t('Guthaben ansehen')}</Link>}
        </div>
      )}
    </div>
  );
}
