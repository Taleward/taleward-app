import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Campaign, Entry, Member, PlayerProposal, PlayerProposalType } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { formatDate } from '../components/format';
import { IconLock } from '../components/Icons';
import { ENTRY_KIND } from '../components/ProposalCard';
import { ErrorBox } from '../components/Screen';
import { t, tk } from '../i18n';
import { HolderSelect, NOBODY, figureName } from './HolderSelect';

/*
 * Vorschläge von Spielenden für die Bibel (Schnittstelle 0.4.28). Spielende sehen nur ihre eigenen; die SL entscheidet.
 * Nichts davon geht an ein Sprachmodell. Wo ein Eintrag geheim ist, verrät die App nichts: Ein Vorschlag, der in einen
 * verborgenen Eintrag eingeht, heißt für die Urheberin nur „übernommen“.
 */

export const PROPOSE_TYPES: PlayerProposalType[] = ['npc', 'location', 'quest', 'item', 'faction', 'other'];

const STATE: Record<PlayerProposal['state'], string> = {
  open: tk('Wartet auf die Spielleitung'),
  accepted: tk('Übernommen'),
  rejected: tk('Nicht übernommen'),
  withdrawn: tk('Zurückgezogen'),
  closed: tk('Die Spielleitung hat ihn gesehen')
};

/** Spielerin schlägt vor: neuer Eintrag oder Ergänzung zu einem Eintrag, den sie sieht */
export function ProposeForm({ campaignId, target, initialType, onDone }: {
  campaignId: string;
  target?: Entry;
  initialType?: PlayerProposalType;
  onDone: (created: PlayerProposal | null) => void;
}) {
  const [type, setType] = useState<PlayerProposalType>(
    (target && PROPOSE_TYPES.includes(target.type as PlayerProposalType) ? target.type as PlayerProposalType : initialType) ?? 'npc');
  const [title, setTitle] = useState(target?.name ?? '');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.addPlayerProposal(campaignId, { entryType: type, title: title.trim(), detail: detail.trim(), targetEntryId: target?.id ?? null }));
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>{target ? t('Ergänzung vorschlagen') : t('Eintrag vorschlagen')}</h2>
      {!target && (
        <>
          <div className="field">
            <label htmlFor="pp-type">{t('Art')}</label>
            <select id="pp-type" value={type} onChange={(e) => setType(e.target.value as PlayerProposalType)}>
              {PROPOSE_TYPES.map((x) => <option key={x} value={x}>{t(ENTRY_KIND[x])}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pp-title">{t('Name')}</label>
            <input id="pp-title" type="text" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="pp-detail">{target ? t('Was weißt du noch über „{name}“?', { name: target.name }) : t('Was weißt du darüber?')}</label>
        <textarea id="pp-detail" maxLength={2000} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <span className="muted small">{t('Die Spielleitung entscheidet, was in die Bibel kommt. Nur du und sie sehen deinen Vorschlag.')}</span>
      <ErrorBox error={error} />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn small" disabled={busy || !title.trim() || (!!target && !detail.trim())} onClick={send}>{t('Vorschlagen')}</button>
        <button type="button" className="btn small ghost" onClick={() => onDone(null)}>{t('Abbrechen')}</button>
      </div>
    </div>
  );
}

/** Eigene Vorschläge der Spielerin mit Stand */
export function MyProposals({ list, href, onChanged }: { list: PlayerProposal[]; href: (entryId: string) => string; onChanged: () => void }) {
  const [error, setError] = useState<unknown>(null);
  if (!list.length) return null;
  const withdraw = async (p: PlayerProposal) => {
    if (!(await confirmDialog(t('Vorschlag „{title}“ zurückziehen?', { title: p.title }), { confirmLabel: t('Zurückziehen') }))) return;
    setError(null);
    api.withdrawPlayerProposal(p.id).then(onChanged).catch(setError);
  };
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 className="list-head">{t('Deine Vorschläge')}</h2>
      <ErrorBox error={error} />
      <div className="list-box">
        {list.map((p) => {
          // Unbekannter Zustand (neuerer Server): neutral wie „gesehen“
          const sub = [t(STATE[p.state] ?? STATE.closed), formatDate(p.decidedAt ?? p.createdAt)].join(' · ');
          return p.state === 'accepted' && p.resultEntryId ? (
            <Link key={p.id} className="list-row nav" to={href(p.resultEntryId)}>
              <span className="lr-text">{p.title}<span className="lr-sub">{sub}</span></span>
            </Link>
          ) : (
            <div key={p.id} className="list-row">
              <span className="lr-text">{p.title}<span className="lr-sub">{sub}</span></span>
              {p.state === 'open' && <button type="button" className="quiet-link" onClick={() => withdraw(p)}>{t('Zurückziehen')}</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** SL: offene Vorschläge der Spielenden, je einer mit „Übernehmen“ und „Ablehnen“ */
export function GmPlayerProposals({ campaign, list, entries, players, onChanged }: {
  campaign: Campaign;
  list: PlayerProposal[];
  entries: Entry[];
  players: Member[];
  onChanged: () => void;
}) {
  const open = list.filter((p) => p.state === 'open');
  if (!open.length) return <div className="empty">{t('Keine offenen Vorschläge von Spielenden.')}</div>;
  return (
    <>
      {open.map((p) => (
        <GmProposalCard key={p.id} p={p} author={campaign.members.find((m) => m.id === p.authorMemberId)} entries={entries} players={players} onChanged={onChanged} />
      ))}
    </>
  );
}

function GmProposalCard({ p, author, entries, players, onChanged }: { p: PlayerProposal; author?: Member; entries: Entry[]; players: Member[]; onChanged: () => void }) {
  const [deciding, setDeciding] = useState(false);
  const [type, setType] = useState<PlayerProposalType>(p.entryType);
  const [title, setTitle] = useState(p.title);
  const [detail, setDetail] = useState(p.detail ?? '');
  const [into, setInto] = useState(p.targetEntryId ?? '');
  const [secret, setSecret] = useState(false);
  const [holder, setHolder] = useState(NOBODY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const target = p.targetEntryId ? entries.find((e) => e.id === p.targetEntryId) : undefined;
  const who = author ? figureName(author) : t('Jemand');

  const decide = async (accept: boolean) => {
    if (!accept && !(await confirmDialog(t('Vorschlag „{title}“ ablehnen? {name} sieht nur „Die Spielleitung hat ihn gesehen“.', { title: p.title, name: who }), { confirmLabel: t('Ablehnen') }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.decidePlayerProposal(p.id, accept ? {
        decision: 'accept', entryType: type, title: title.trim(), detail: detail.trim(),
        mergeIntoEntryId: into || null,
        ...(into ? {} : { visibility: secret ? 'gm_only' : 'public', ...(type === 'item' ? { holderMemberId: holder === NOBODY ? null : holder } : {}) })
      } : { decision: 'reject' });
      onChanged();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <span className="muted small">
        {t('{name} schlägt vor', { name: who })} · {target ? t('Ergänzung zu „{entry}“', { entry: target.name }) : t(ENTRY_KIND[p.entryType])} · {formatDate(p.createdAt)}
      </span>
      {!deciding ? (
        <>
          <strong>{p.title}</strong>
          {p.detail && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.detail}</p>}
          <ErrorBox error={error} />
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn small outline" disabled={busy} onClick={() => setDeciding(true)}>{t('Übernehmen …')}</button>
            <button type="button" className="quiet-link" disabled={busy} onClick={() => decide(false)}>{t('Ablehnen')}</button>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`gp-into-${p.id}`}>{t('Wohin?')}</label>
            <select id={`gp-into-${p.id}`} value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="">{t('Neuer Eintrag')}</option>
              {entries.filter((e) => e.type !== 'pc').map((e) => <option key={e.id} value={e.id}>{t('Ergänzen: {name}', { name: e.name })}</option>)}
            </select>
          </div>
          {(() => {
            const e = into ? entries.find((x) => x.id === into) : undefined;
            const hidden = e && (e.visibility === 'gm_only' || (e.hiddenFromMemberIds ?? []).length > 0);
            return hidden ? <span className="muted small">{t('Der Eintrag ist nicht für alle sichtbar. Der Text landet in deiner SL-Notiz; {name} sieht nur „Die Spielleitung hat ihn gesehen“.', { name: who })}</span> : null;
          })()}
          {!into && (
            <>
              <div className="field">
                <label htmlFor={`gp-type-${p.id}`}>{t('Art')}</label>
                <select id={`gp-type-${p.id}`} value={type} onChange={(e) => setType(e.target.value as PlayerProposalType)}>
                  {PROPOSE_TYPES.map((x) => <option key={x} value={x}>{t(ENTRY_KIND[x])}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`gp-title-${p.id}`}>{t('Name')}</label>
                <input id={`gp-title-${p.id}`} type="text" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor={`gp-detail-${p.id}`}>{t('Text')}</label>
            <textarea id={`gp-detail-${p.id}`} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
          {!into && type === 'item' && players.length > 0 && <HolderSelect id={`gp-holder-${p.id}`} players={players} value={holder} onChange={setHolder} />}
          {!into && (
            <label className="check">
              <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
              <span className="row" style={{ gap: 6 }}><IconLock size={14} /> {t('Erst nur für die Spielleitung')}</span>
            </label>
          )}
          {!into && secret && (
            <span className="muted small">{t('{name} sieht dann nur „Die Spielleitung hat ihn gesehen“.', { name: who })}</span>
          )}
          <ErrorBox error={error} />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn small" disabled={busy || (!into && !title.trim())} onClick={() => decide(true)}>{t('Übernehmen')}</button>
            <button type="button" className="btn small ghost" onClick={() => setDeciding(false)}>{t('Abbrechen')}</button>
          </div>
        </>
      )}
    </div>
  );
}
