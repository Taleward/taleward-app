import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { apiAtLeast, p } from '../api/connections';
import { isDeletedMember, type Campaign, type Entry, type Member, type Proposal } from '../api/types';
import { Avatar } from '../components/Avatar';
import { IconCheck } from '../components/Icons';
import { SecretBox } from '../components/VisTag';
import { t, tk, tn } from '../i18n';
import { Popup } from './Popup';

const STATUS: Record<string, string> = { retired: tk('im Ruhestand'), deceased: tk('verstorben') };

/**
 * Die Gruppe am Tisch (Tippen auf eine Person zeigt alles zum Charakter): wer spielt wen, Kurzbeschreibung, Hintergrund (nur SL), Zustimmung zur Aufnahme und
 * mitgebrachte Welt, die noch in keinem Kapitel vorkam (Aufhänger).
 */
export function GroupPanel({ campaign, onEntry, compact }: {
  campaign: Campaign;
  onEntry: (entryId: string) => void;
  /** Kleine Karte: Wappen und Zustimmung; Tippen auf ein Wappen zeigt den Charakter */
  compact?: boolean;
}) {
  const [brought, setBrought] = useState<Proposal[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Member | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);

  useEffect(() => {
    if (!apiAtLeast('0.4.7')) return;
    api.characterProposals(campaign.id).then(setBrought).catch(() => setBrought([]));
    api.entries(campaign.id).then(setEntries).catch(() => setEntries([]));
  }, [campaign.id]);

  const players = campaign.members.filter((m) => m.role === 'player' && !isDeletedMember(m));
  const unused = (memberId: string) => brought
    .filter((b) => b.submittedByMemberId === memberId && b.decision === 'accepted' && b.targetEntryId)
    .map((b) => entries.find((e) => e.id === b.targetEntryId))
    .filter((e): e is Entry => !!e && !e.firstSessionNumber);
  const pending = (memberId: string) => brought.filter((b) => b.submittedByMemberId === memberId && b.decision === 'open').length;

  const popup = detail && (
    <Popup title={detail.characterName ?? detail.displayName} onClose={closeDetail}>
      <CharacterInfo campaign={campaign} member={detail} entries={entries} brought={brought}
        onEntry={(id) => { setDetail(null); onEntry(id); }} />
    </Popup>
  );

  if (!players.length) return <div className="table-panel-body"><div className="empty">{t('Noch niemand am Tisch. Lade Mitspielende über die Übersicht ein.')}</div></div>;

  if (compact) {
    const agreed = players.filter((m) => m.recordingConsentAt).length;
    return (
      <div className="table-panel-body">
        <div className="table-group-compact">
          {players.map((m) => (
            <button key={m.id} type="button" className="table-group-face" title={m.characterName ?? m.displayName} onClick={() => setDetail(m)}
              aria-label={t('{name} ({player}), {consent}. Charakter ansehen.', { name: m.characterName ?? t('Noch ohne Charakter'), player: m.displayName, consent: m.recordingConsentAt ? t('Zugestimmt') : t('Ohne Zustimmung') })}>
              <Avatar campaignId={campaign.id} member={m} size={44} />
              <span className={m.recordingConsentAt ? 'table-consent yes' : 'table-consent'} aria-hidden>{m.recordingConsentAt ? <IconCheck size={12} /> : '!'}</span>
            </button>
          ))}
        </div>
        <span className="small muted">{t('{n} von {total} haben der Aufnahme zugestimmt.', { n: agreed, total: players.length })}</span>
        {popup}
      </div>
    );
  }

  return (
    <div className="table-panel-body">
      {players.map((m) => {
        const isOpen = open === m.id;
        const hooks = unused(m.id);
        const waiting = pending(m.id);
        return (
          <section key={m.id} className="table-entry open">
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <button type="button" className="table-member-open" onClick={() => setDetail(m)} aria-label={t('Charakter {name} ansehen', { name: m.characterName ?? m.displayName })}>
                <Avatar campaignId={campaign.id} member={m} size={48} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                  <strong>{m.characterName ?? t('Noch ohne Charakter')}</strong>
                  <span className="muted small">{m.displayName}</span>
                </span>
              </button>
              {m.recordingConsentAt
                ? <span className="pill moss"><IconCheck /> {t('Zugestimmt')}</span>
                : <span className="pill">{t('Ohne Zustimmung')}</span>}
            </div>
            {m.characterSummary && <p className="small" style={{ margin: 0 }}>{m.characterSummary}</p>}
            {m.characterBackstory && (
              isOpen
                ? <SecretBox><span style={{ whiteSpace: 'pre-wrap' }}>{m.characterBackstory}</span></SecretBox>
                : <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(m.id)}>{t('Hintergrund zeigen')}</button>
            )}
            {hooks.length > 0 && (
              <div className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="muted">{t('Mitgebracht, kam noch in keinem Kapitel vor:')}</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {hooks.map((e) => <button key={e.id} type="button" className="btn small outline" onClick={() => onEntry(e.id)}>{e.name}</button>)}
                </div>
              </div>
            )}
            {waiting > 0 && (
              <Link className="small tap-link" to={p(`/k/${campaign.id}/mitgebracht`)}>
                {tn(waiting, '{n} mitgebrachter Eintrag wartet auf dich', '{n} mitgebrachte Einträge warten auf dich')}
              </Link>
            )}
          </section>
        );
      })}
      {popup}
    </div>
  );
}

/** Alles zu einem Charakter auf einen Blick (nur SL): Beschreibung, Hintergrund, Erwähnungen, mitgebrachte Welt */
function CharacterInfo({ campaign, member: m, entries, brought, onEntry }: {
  campaign: Campaign;
  member: Member;
  entries: Entry[];
  brought: Proposal[];
  onEntry: (entryId: string) => void;
}) {
  const pc = entries.find((e) => e.type === 'pc' && e.holderMemberId === m.id);
  const mine = brought.filter((b) => b.submittedByMemberId === m.id && b.decision === 'accepted' && b.targetEntryId)
    .map((b) => entries.find((e) => e.id === b.targetEntryId))
    .filter((e): e is Entry => !!e);
  const waiting = brought.filter((b) => b.submittedByMemberId === m.id && b.decision === 'open').length;
  const items = entries.filter((e) => e.type === 'item' && e.holderMemberId === m.id);
  return (
    <div className="table-panel-body">
      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
        <Avatar campaignId={campaign.id} member={m} size={96} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{m.characterName ?? t('Noch ohne Charakter')}{m.characterNickname ? ` „${m.characterNickname}“` : ''}</h3>
          <span className="muted small">{t('gespielt von {name}', { name: m.displayName })}{m.characterStatus && STATUS[m.characterStatus] ? ' · ' + t(STATUS[m.characterStatus]) : ''}</span>
          <span>
            {m.recordingConsentAt
              ? <span className="pill moss"><IconCheck /> {t('Zugestimmt')}</span>
              : <span className="pill">{t('Ohne Zustimmung')}</span>}
          </span>
        </div>
      </div>
      {m.characterSummary && <p style={{ margin: 0 }}>{m.characterSummary}</p>}
      {m.characterBackstory && <SecretBox><span style={{ whiteSpace: 'pre-wrap' }}>{m.characterBackstory}</span></SecretBox>}
      {pc && (pc.mentions?.length ?? 0) > 0 && (
        <section className="table-scene">
          <strong>{t('In den Kapiteln')}</strong>
          {pc.mentions.slice(-6).map((x, i) => (
            <span key={i} className="small"><span className="muted">{t('Kapitel {n}', { n: x.sessionNumber })}:</span> {x.note}</span>
          ))}
        </section>
      )}
      {items.length > 0 && (
        <div className="small"><span className="muted">{t('Trägt bei sich:')}</span>{' '}
          {items.map((e, i) => <span key={e.id}>{i > 0 ? ', ' : ''}<button type="button" className="linklike" onClick={() => onEntry(e.id)}>{e.name}</button></span>)}
        </div>
      )}
      {mine.length > 0 && (
        <div className="small" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="muted">{t('Mitgebrachte Welt')}</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {mine.map((e) => (
              <button key={e.id} type="button" className="btn small outline" onClick={() => onEntry(e.id)}>
                {e.name}{!e.firstSessionNumber ? ' · ' + t('noch nicht vorgekommen') : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      {waiting > 0 && (
        <Link className="small tap-link" to={p(`/k/${campaign.id}/mitgebracht`)}>
          {tn(waiting, '{n} mitgebrachter Eintrag wartet auf dich', '{n} mitgebrachte Einträge warten auf dich')}
        </Link>
      )}
      <Link className="btn small outline" style={{ alignSelf: 'flex-start' }} to={p(`/k/${campaign.id}/charakter/${m.id}`)}>{t('Zur Charakterseite')}</Link>
    </div>
  );
}
