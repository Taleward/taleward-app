import { isDeletedMember } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { p } from '../api/connections';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { CampaignDocument, Entry, Member, Proposal } from '../api/types';
import { ProposalCard } from '../components/ProposalCard';
import { ErrorBox, Screen } from '../components/Screen';
import { t, tn } from '../i18n';

/** Vorschläge aus einer Unterlage prüfen und in die Bibel übernehmen. */
export function DocumentReview() {
  const { campaignId = '', documentId = '' } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<CampaignDocument | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [players, setPlayers] = useState<Member[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [applyWorld, setApplyWorld] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([api.document(documentId), api.documentProposals(documentId)])
      .then(([d, p]) => {
        setDoc(d);
        setProposals(p);
        // Einträge für „Dort ergänzen?“ (wie sichtbar der vorhandene Eintrag ist)
        if (p.some((x) => x.action === 'create' && x.match)) api.entries(campaignId).then(setEntries).catch(() => undefined);
      })
      .catch(setError);
    api.campaign(campaignId).then((c) => setPlayers(c.members.filter((m) => m.role === 'player' && !isDeletedMember(m)))).catch(() => undefined);
  }, [documentId, campaignId]);

  const open = proposals?.filter((p) => p.decision === 'open').length ?? 0;
  const accepted = proposals?.filter((p) => p.decision === 'accepted').length ?? 0;

  const apply = async () => {
    if (open > 0 && !(await confirmDialog(tn(open, '{n} Vorschlag ist noch offen und wird verworfen. Trotzdem übernehmen?', '{n} Vorschläge sind noch offen und werden verworfen. Trotzdem übernehmen?'), { confirmLabel: t('Übernehmen') }))) return;
    setBusy(true);
    try {
      await api.applyDocument(documentId, applyWorld);
      navigate(p(`/k/${campaignId}/unterlagen`), { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  // Schnell durchgehen: alles Offene auf einmal übernehmen oder verwerfen
  const bulk = (decision: 'accepted' | 'rejected') =>
    Promise.all((proposals ?? []).filter((p) => p.decision === 'open').map((p) => api.decide(p.id, { decision })))
      .then((updated) => setProposals((list) => list?.map((x) => updated.find((u) => u.id === x.id) ?? x) ?? null))
      .catch(setError);

  return (
    <Screen back overline={doc?.title ?? ' '} title={t('Vorschläge prüfen')}>
      <ErrorBox error={error} />
      <p className="muted small" style={{ margin: 0 }}>
        {t('Der Kasten „Nur SL“ bleibt geheim. Mit „Bearbeiten“ verschiebst du Sätze.')}
      </p>

      {proposals && open > 1 && (
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn small moss outline" onClick={() => bulk('accepted')}>{t('Alle offenen übernehmen')}</button>
          <button type="button" className="btn small outline" onClick={() => bulk('rejected')}>{t('Alle offenen verwerfen')}</button>
        </div>
      )}

      <div className="grid-cards">
      {proposals?.map((p) => (
        <ProposalCard key={p.id} proposal={p} players={players} entries={entries} onError={setError}
          onChange={(u) => setProposals((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null)} />
      ))}
      </div>
      {proposals?.length === 0 && <div className="empty">{t('In dieser Unterlage wurde nichts für die Bibel gefunden.')}</div>}

      {doc?.worldInfoSuggestion && (
        <section className="card">
          <h2>{t('Vorschlag für den Welt-Hintergrund')}</h2>
          <div className="recap" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {doc.worldInfoSuggestion.split(/\n\s*\n/).map((para, i) => <p key={i} style={{ fontSize: 'calc(16px * var(--ts))' }}>{para}</p>)}
          </div>
          <label className="check">
            <input type="checkbox" checked={applyWorld} onChange={(e) => setApplyWorld(e.target.checked)} />
            <span>{t('An den Welt-Hintergrund anhängen (sehen alle Spieler)')}</span>
          </label>
        </section>
      )}

      {proposals && (
        <>
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            {t('{done} von {total} Vorschlägen geprüft', { done: proposals.length - open, total: proposals.length })}
          </p>
          <button type="button" className="btn" disabled={busy || (accepted === 0 && !applyWorld)} onClick={apply}>
            {busy ? t('Wird übernommen …') : tn(accepted, '{n} Eintrag in die Bibel übernehmen', '{n} Einträge in die Bibel übernehmen')}
          </button>
        </>
      )}
    </Screen>
  );
}
