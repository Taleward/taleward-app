import { useState } from 'react';
import { api } from '../api/client';
import { currentConnection } from '../api/connections';
import type { Campaign, Member } from '../api/types';
import { isDeletedMember } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { ErrorBox } from '../components/Screen';
import { t } from '../i18n';

/**
 * Wer zahlt für die Kampagne (Schnittstelle 0.4.25, nur SL und nur mit Guthaben): Zahlung an eine andere SL abgeben
 * oder übernehmen. Unter „Kampagne verwalten“.
 */
export function PayerSection({ campaign, me, onChanged }: { campaign: Campaign; me: Member; onChanged: () => void }) {
  const billing = campaign.billing!;
  const otherGms = campaign.members.filter((m) => m.role === 'gm' && m.id !== me.id && m.userId && !m.leftAt && !isDeletedMember(m));
  const [target, setTarget] = useState(otherGms[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const name = (id: string | null | undefined) => campaign.members.find((m) => m.id === id)?.displayName ?? t('eine andere Spielleitung');
  const server = currentConnection().name;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    if (await confirmDialog(t('Zahlung für „{campaign}“ auf „{server}“ übernehmen? Ab dann gehen die Kosten der Verarbeitung von deinem Guthaben ab.', { campaign: campaign.title, server }), { confirmLabel: t('Übernehmen') })) {
      run(() => api.acceptPayment(campaign.id));
    }
  };
  const offer = async () => {
    if (await confirmDialog(t('Zahlung an {name} abgeben? Bis {name} übernimmt, zahlst du weiter.', { name: name(target) }), { confirmLabel: t('Anbieten') })) {
      run(() => api.offerPayment(campaign.id, target));
    }
  };

  let line: string;
  if (billing.paidBy === 'organization') line = t('Bezahlt wird aus dem Guthaben der Organisation.');
  else if (billing.paidBy === 'nobody') line = t('Gerade zahlt niemand für diese Kampagne. Neue Verarbeitungen warten, bis eine Spielleitung übernimmt.');
  else if (billing.isMe) line = t('Die Kosten der Verarbeitung gehen von deinem Guthaben ab.');
  else line = t('Die Kosten der Verarbeitung gehen vom Guthaben von {name} ab.', { name: name(billing.payerMemberId) });

  return (
    <>
      <span className="overline" style={{ marginTop: 6 }}>{t('Wer zahlt')}</span>
      <span className="small">{line}</span>
      <ErrorBox error={error} />
      {(billing.paidBy === 'nobody' || (billing.paidBy === 'gm' && !billing.isMe && billing.offeredToMemberId === me.id)) && (
        <>
          {billing.paidBy === 'gm' && <span className="small">{t('{name} möchte dir die Zahlung übergeben.', { name: name(billing.payerMemberId) })}</span>}
          <button type="button" className="btn outline" disabled={busy} onClick={accept}>{t('Zahlung übernehmen')}</button>
        </>
      )}
      {billing.paidBy === 'gm' && billing.isMe && billing.offeredToMemberId && (
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <span className="small" style={{ flex: '1 1 160px' }}>{t('Angeboten an {name}, noch nicht übernommen.', { name: name(billing.offeredToMemberId) })}</span>
          <button type="button" className="btn small outline" disabled={busy} onClick={() => run(() => api.offerPayment(campaign.id, null))}>{t('Angebot zurücknehmen')}</button>
        </div>
      )}
      {billing.paidBy === 'gm' && billing.isMe && !billing.offeredToMemberId && otherGms.length > 0 && (
        <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 160px', margin: 0 }}>
            <label htmlFor="payer-target" className="small">{t('Zahlung abgeben an')}</label>
            <select id="payer-target" value={target} onChange={(e) => setTarget(e.target.value)}>
              {otherGms.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </select>
          </div>
          <button type="button" className="btn small outline" disabled={busy || !target} onClick={offer}>{t('Anbieten')}</button>
        </div>
      )}
    </>
  );
}
