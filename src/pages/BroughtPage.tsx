import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { isDeletedMember, type Campaign, type CharacterAnalysis, type Entry, type Proposal } from '../api/types';
import { apiAtLeast } from '../api/connections';
import { Avatar } from '../components/Avatar';
import { ProposalCard } from '../components/ProposalCard';
import { ErrorBox, Screen } from '../components/Screen';
import { t, tn } from '../i18n';

/**
 * Mitgebrachte Welt prüfen (SL, ab 0.4.7): Vorschläge aus den Charakteren der Spieler – Familie, Heimat, alte Feinde.
 * Anders als bei Kapiteln wirkt jede Entscheidung sofort; es gibt nichts zu veröffentlichen.
 */
export function BroughtPage() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [analyses, setAnalyses] = useState<CharacterAnalysis[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([api.campaign(campaignId), api.characterProposals(campaignId)])
      .then(([c, list]) => {
        setCampaign(c);
        setProposals(list);
        // Einträge für „Dort ergänzen?“: wie sichtbar der vorhandene Eintrag ist (Geheimes nie in Sichtbareres)
        if (list.some((x) => x.action === 'create' && x.match)) api.entries(campaignId).then(setEntries).catch(() => undefined);
      })
      .catch(setError);
    // Ab 0.4.18: woher ein Vorschlag stammt (Hintergrund oder Charakterbogen)
    if (apiAtLeast('0.4.18')) api.characterAnalyses(campaignId).then(setAnalyses).catch(() => undefined);
  }, [campaignId]);

  const origin = (p: Proposal) => {
    const a = p.analysisId ? analyses.find((x) => x.id === p.analysisId) : undefined;
    if (!p.analysisId) return null;
    if (a?.source === 'sheet') return t('Aus dem Charakterbogen „{title}“', { title: a.title });
    if (a?.source === 'backstory') return t('Aus dem Hintergrund');
    return t('Aus Charakterbogen oder Hintergrund');
  };

  const players = campaign?.members.filter((m) => m.role === 'player' && !isDeletedMember(m)) ?? [];
  const open = proposals?.filter((p) => p.decision === 'open') ?? [];
  const decided = proposals?.filter((p) => p.decision !== 'open') ?? [];
  const bySubmitter = [...new Set(open.map((p) => p.submittedByMemberId ?? ''))];
  const update = (next: Proposal) => setProposals((list) => list?.map((x) => (x.id === next.id ? next : x)) ?? null);

  return (
    <Screen back overline={campaign?.title ?? ' '} title={t('Mitgebrachte Welt')}>
      <ErrorBox error={error} />
      {/* Erklärung nur, wenn es etwas zu entscheiden gibt */}
      {open.length > 0 && <p className="muted small" style={{ margin: 0 }}>
        {t('Übernehmen legt den Eintrag gleich in der Bibel an. Vorher kannst du alles bearbeiten.')}
        {analyses.length > 0 && ' ' + t('Vorschläge aus Charakterbögen und Hintergründen sind zunächst nur für dich und die Spielerin sichtbar.')}
      </p>}
      {proposals && open.length === 0 && <div className="empty">{t('Nichts Neues mitgebracht.')}</div>}

      {campaign && bySubmitter.map((id) => {
        const m = campaign.members.find((x) => x.id === id);
        const mine = open.filter((p) => (p.submittedByMemberId ?? '') === id);
        return (
          <section key={id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              {m && <Avatar campaignId={campaign.id} member={m} size={40} />}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 'calc(18px * var(--ts))' }}>{m?.characterName ?? m?.displayName ?? t('Unbekannt')}</strong>
                <span className="muted small">
                  {m ? t('gespielt von {name}', { name: m.displayName }) + ' · ' : ''}
                  {tn(mine.length, '{n} Vorschlag', '{n} Vorschläge')}
                </span>
              </div>
            </div>
            {mine.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {origin(p) && <span className="muted small">{origin(p)}</span>}
                {p.relation && <span className="muted small">{t('Beziehung: {relation}', { relation: p.relation })}</span>}
                <ProposalCard proposal={p} players={players.filter((x) => x.id !== p.submittedByMemberId)} entries={entries} onError={setError} onChange={update} />
              </div>
            ))}
          </section>
        );
      })}

      {decided.length > 0 && (
        <details className="card" style={{ gap: 10 }}>
          <summary style={{ fontWeight: 700 }}>{t('Bereits entschieden ({n})', { n: decided.length })}</summary>
          {decided.map((p) => {
            const m = campaign?.members.find((x) => x.id === p.submittedByMemberId);
            return (
              <div key={p.id} className="row between" style={{ gap: 8 }}>
                <span className="small"><strong>{p.title}</strong>{m ? ` · ${m.characterName ?? m.displayName}` : ''}</span>
                <span className="pill">{p.decision === 'accepted' ? t('Übernommen') : t('Abgelehnt')}</span>
              </div>
            );
          })}
        </details>
      )}
    </Screen>
  );
}
