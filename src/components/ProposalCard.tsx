import { SecretBox, VisTag } from './VisTag';
import { useState } from 'react';
import { api } from '../api/client';
import type { EntryType, Member, Proposal, ProposalDecision, Visibility } from '../api/types';
import { Dialog } from './Dialog';
import { PlayerPicker } from './PlayerPicker';
import { t, tk } from '../i18n';
import { IconEye, IconLock } from './Icons';

export const ENTRY_KIND: Record<EntryType, string> = {
  npc: tk('NSC'),
  location: tk('Ort'),
  quest: tk('Quest'),
  item: tk('Beute'),
  faction: tk('Fraktion'),
  other: tk('Sonstiges'),
  pc: tk('Spielercharakter')
};

function formatStart(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')} h`;
}

/**
 * Ein Bibel-Vorschlag zum Prüfen – aus einer Session oder einer Unterlage.
 * Zeigt getrennt, was Spieler erfahren und was nur die SL sieht; beides lässt sich vor dem Übernehmen bearbeiten.
 */
export function ProposalCard({ proposal: p, players = [], onChange, onError }: {
  proposal: Proposal;
  /** Spieler der Kampagne für „Sichtbar für …“ */
  players?: Member[];
  onChange: (p: Proposal) => void;
  onError: (e: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);
  const hidden = p.hiddenFromMemberIds ?? [];
  const visibleIds = p.suggestedVisibility === 'gm_only' ? [] : players.filter((m) => !hidden.includes(m.id)).map((m) => m.id);
  const [pick, setPick] = useState<string[]>(visibleIds);
  const hiddenNames = players.filter((m) => p.suggestedVisibility === 'public' && hidden.includes(m.id)).map((m) => m.characterName ?? m.displayName);
  const applyPick = () => {
    setPicking(false);
    // Niemand = ganz geheim; alle = öffentlich; einige = öffentlich, vor den übrigen verborgen
    const change = pick.length === 0
      ? { visibility: 'gm_only' as Visibility, hiddenFromMemberIds: [] }
      : { visibility: 'public' as Visibility, hiddenFromMemberIds: players.filter((m) => !pick.includes(m.id)).map((m) => m.id) };
    patch(change, { ...p, suggestedVisibility: change.visibility, hiddenFromMemberIds: change.hiddenFromMemberIds, publicSuggested: false });
  };
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [detail, setDetail] = useState(p.detail);
  const [gmNotes, setGmNotes] = useState(p.gmNotes ?? '');

  const patch = async (change: Parameters<typeof api.decide>[1], optimistic: Proposal) => {
    onChange(optimistic);
    try {
      onChange(await api.decide(p.id, change));
    } catch (e) {
      onError(e);
      onChange(p);
    }
  };

  const decide = (decision: ProposalDecision) => {
    const next = p.decision === decision ? 'open' : decision;
    patch({ decision: next }, { ...p, decision: next });
  };

  const save = async () => {
    const change = { title: title.trim(), detail: detail.trim(), gmNotes: gmNotes.trim() };
    await patch(change, { ...p, ...change });
    setEditing(false);
  };

  const flagged = p.flags.includes('joke_suspected') || p.flags.includes('low_confidence') || p.flags.includes('evidence_not_found');
  const secretEntry = p.suggestedVisibility === 'gm_only';
  const ev = p.evidence[0];

  return (
    <div className={flagged ? 'card warn' : 'card'}>
      <div className="row between wrap" style={{ gap: 6 }}>
        <span className="muted small" style={{ fontWeight: 700 }}>
          {t(ENTRY_KIND[p.entryType])} · {p.action === 'create' ? t('neu') : p.action === 'reveal' ? t('wird bekannt') : t('ergänzt')}
        </span>
        <span className="row wrap" style={{ gap: 6 }}>
          {p.flags.includes('joke_suspected') && <span className="pill seal">{t('Vermutlich Scherz')}</span>}
          {!p.flags.includes('joke_suspected') && p.flags.includes('evidence_not_found') && <span className="pill seal">{t('Beleg in der Abschrift nicht gefunden')}</span>}
          {!p.flags.includes('joke_suspected') && !p.flags.includes('evidence_not_found') && p.flags.includes('low_confidence') && <span className="pill seal">{t('Unsicher')}</span>}
          {p.flags.includes('contradicts_bible') && <span className="pill brass">{t('Widerspricht der Bibel')}</span>}
          {p.action === 'reveal'
            ? <span className="row" style={{ gap: 4 }}><VisTag gm /> → <VisTag gm={false} /></span>
            : <VisTag gm={secretEntry} />}
          {hiddenNames.length > 0 && <span className="small" style={{ color: 'var(--siegel-text)' }}>{t('nicht für {names}', { names: hiddenNames.join(', ') })}</span>}
        </span>
      </div>

      {editing ? (
        <>
          <div className="field">
            <label htmlFor={`pt-${p.id}`}>{t('Titel')}</label>
            <input id={`pt-${p.id}`} type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`pd-${p.id}`}>{t('Was Spieler wissen')}</label>
            <textarea id={`pd-${p.id}`} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`pg-${p.id}`} className="row" style={{ gap: 6 }}><IconLock size={14} /> {t('Nur SL')}</label>
            <textarea id={`pg-${p.id}`} value={gmNotes} onChange={(e) => setGmNotes(e.target.value)} />
          </div>
          <div className="row">
            <button type="button" className="btn small" disabled={!title.trim()} onClick={save}>{t('Speichern')}</button>
            <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>{t('Abbrechen')}</button>
          </div>
        </>
      ) : (
        <>
          <div className="card-title">{p.title}</div>
          {p.detail && (
            <div className="small">
              <span className="muted" style={{ fontWeight: 700 }}>{secretEntry ? t('Beschreibung:') : t('Spieler erfahren:')}</span> {p.detail}
            </div>
          )}
          {p.gmNotes && (
            <SecretBox>{p.gmNotes}</SecretBox>
          )}
          {p.publicSuggested && secretEntry && (
            <div className="notice" style={{ flexDirection: 'column', gap: 6 }}>
              <span><strong>{t('Die KI hält das für Spielerwissen.')}</strong>{p.visibilityReason ? ' ' + p.visibilityReason : ''}</span>
              <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start' }}
                onClick={() => patch({ visibility: 'public' }, { ...p, suggestedVisibility: 'public', publicSuggested: false })}>
                {t('Für Spieler freigeben')}
              </button>
            </div>
          )}
          {p.visibilityReason && !(p.publicSuggested && secretEntry) && <div className="muted small">{t('Warum so eingestuft:')} {p.visibilityReason}</div>}
          {ev && (
            <div className="quote">
              {t('„{q}“', { q: ev.quote.replace(/^[„"]|[“"]$/g, '') })}{' '}
              <span style={{ fontStyle: 'normal' }}>
                ({ev.page != null ? t('S. {n}', { n: ev.page }) : ev.start != null ? formatStart(ev.start) : ''})
              </span>
            </div>
          )}
          {picking && (
            <Dialog title={t('Sichtbar für')} onClose={() => setPicking(false)}>
              <PlayerPicker players={players} selected={pick} onChange={setPick} />
              <p className="muted small" style={{ margin: 0 }}>{t('Niemand ausgewählt = nur SL.')}</p>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn" style={{ flex: 1 }} onClick={applyPick}>{t('Übernehmen')}</button>
                <button type="button" className="btn outline" onClick={() => setPicking(false)}>{t('Abbrechen')}</button>
              </div>
            </Dialog>
          )}
        </>
      )}

      {/* Eine Zeile: die Entscheidung als Knöpfe, Sichtbarkeit und Bearbeiten als leise Links daneben */}
      {!editing && (
        <div className="proposal-actions">
          <button type="button" className={p.decision === 'accepted' ? 'btn small moss' : 'btn small moss outline'}
            aria-pressed={p.decision === 'accepted'} onClick={() => decide('accepted')}>
            {t('Übernehmen')}
          </button>
          <button type="button" className={p.decision === 'rejected' ? 'btn small' : 'btn small outline'}
            aria-pressed={p.decision === 'rejected'} onClick={() => decide('rejected')}>
            {t('Verwerfen')}
          </button>
          <span className="proposal-links">
            {players.length > 0 && (
              <button type="button" className="btn small subtle" onClick={() => { setPick(visibleIds); setPicking(true); }}>
                <IconEye size={16} /> {t('Sichtbar für …')}
              </button>
            )}
            <button type="button" className="btn small subtle" onClick={() => setEditing(true)}>{t('Bearbeiten')}</button>
          </span>
        </div>
      )}
    </div>
  );
}
