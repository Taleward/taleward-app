import { confirmDialog } from '../components/confirm';
import { isDeletedMember } from '../api/types';
import { currentConnection, currentConnectionId, p } from '../api/connections';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Campaign, Member } from '../api/types';
import { blobToPortrait, characterForCampaign, createCharacter, updateCharacter } from '../characters/store';
import { linkOutdated, pushToCampaign, serverHasCharacters } from '../characters/sync';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { CharacterForm, MissingHint, missingParts } from '../components/CharacterForm';
import { IconLock } from '../components/Icons';
import { Divider, ErrorBox, Screen, rememberCampaign } from '../components/Screen';
import { t } from '../i18n';
import { MoveConsent } from './Overview';
import { apiAtLeast } from '../api/connections';
import { MyAnalyses } from '../components/CharacterAnalysis';
import { useServerInfo } from '../components/CloudNotice';

/** Charakterseite: großes Bild, Name, Kurzbeschreibung; Hintergrund nur für die Person selbst und die SL. */
export function CharacterPage() {
  const { campaignId = '', memberId = '' } = useParams();
  const { user } = useAuth();
  const info = useServerInfo();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = () =>
    api.campaign(campaignId).then((c) => {
      rememberCampaign(c);
      setCampaign(c);
    }).catch(setError);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const [busy, setBusy] = useState(false);
  const [manageError, setManageError] = useState<unknown>(null);
  const navigate = useNavigate();

  const member = campaign?.members.find((m) => m.id === memberId);
  const own = !!member && member.userId === user?.id;
  const otherGms = campaign?.members.filter((m) => m.role === 'gm' && m.id !== memberId && !isDeletedMember(m)).length ?? 0;
  const name = member ? member.characterName ?? member.displayName : '';

  // Aus „Dein Charakter ist noch unvollständig“: gleich bearbeiten – in der Sammlung, wenn er dort liegt
  const [params] = useSearchParams();
  const editNow = params.get('bearbeiten') === '1';
  useEffect(() => {
    if (!editNow || !campaign || !member || !own) return;
    const connId = currentConnectionId() ?? currentConnection().id;
    const linked = member.role === 'player' && serverHasCharacters(currentConnection()) ? characterForCampaign(connId, campaign.id) : null;
    if (linked && linked.links.some((l) => l.connId === connId && l.campaignId === campaign.id)) {
      navigate(`/charaktere/${linked.id}?bearbeiten=1`, { replace: true });
    } else {
      setEditing(true);
    }
  }, [editNow, !!campaign, !!member, own]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeRole = async (role: 'gm' | 'player') => {
    const q = role === 'gm'
      ? t('{name} zur Spielleitung machen? Die Person sieht dann alles Geheime dieser Kampagne.', { name: member!.displayName })
      : own ? t('SL-Rolle abgeben? Du siehst dann nur noch, was Spieler sehen.') : t('{name} die SL-Rolle entziehen?', { name: member!.displayName });
    if (!(await confirmDialog(q, { confirmLabel: role === 'gm' ? t('Zur Spielleitung machen') : own ? t('SL-Rolle abgeben') : t('SL-Rolle entziehen') }))) return;
    setBusy(true);
    setManageError(null);
    try {
      await api.updateMember(campaignId, memberId, { role });
      await load();
    } catch (e) {
      setManageError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog(t('{name} aus der Kampagne entfernen? Die Person sieht die Kampagne danach nicht mehr. Ihre Kommentare bleiben stehen.', { name }), { confirmLabel: t('Entfernen'), danger: true }))) return;
    setBusy(true);
    try {
      await api.removeMember(campaignId, memberId);
      navigate(p(`/k/${campaignId}`), { replace: true });
    } catch (e) {
      setManageError(e);
      setBusy(false);
    }
  };

  const title = member ? member.characterName ?? member.displayName : ' ';

  return (
    <Screen narrow back overline={campaign?.title ?? ' '} title={member?.role === 'gm' ? member.displayName : title}>
      <ErrorBox error={error} />
      {campaign && !member && !error && <div className="empty">{t('Nicht gefunden.')}</div>}
      {campaign && member && (editing ? (
        <section className="card">
          {editNow && member.role === 'player' && (
            <MissingHint parts={missingParts({ name: member.characterName, summary: member.characterSummary, portrait: !!member.portraitUpdatedAt })} />
          )}
          <CharacterForm campaign={campaign} member={member} submitLabel={t('Speichern')}
            onSaved={() => { setEditing(false); load(); }}
            secondary={{ label: t('Abbrechen'), onClick: () => setEditing(false) }} />
        </section>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Avatar campaignId={campaign.id} member={member} size={160} />
            <div className="muted">
              {member.role === 'gm' ? t('Spielleitung') : t('gespielt von {name}', { name: member.displayName })}
            </div>
          </div>
          {member.role !== 'gm' && (
            member.characterSummary
              ? <div className="card recap"><p>{member.characterSummary}</p></div>
              : <div className="muted small" style={{ textAlign: 'center' }}>{own ? t('Noch keine Kurzbeschreibung.') : t('Noch keine Beschreibung.')}</div>
          )}
          {member.characterBackstory && (
            <section className="card secret">
              <h2 className="row" style={{ gap: 8 }}><IconLock /> {t('Hintergrund')}</h2>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{member.characterBackstory}</p>
              <div className="muted small">{own ? t('Sehen nur du und die Spielleitung.') : t('Nur für dich als Spielleitung sichtbar.')}</div>
            </section>
          )}
          {own && (
            <>
              <Divider />
              {member.role === 'player' && serverHasCharacters(currentConnection())
                ? <CollectionActions campaign={campaign} member={member} onChanged={load} onEdit={() => setEditing(true)} />
                : (
                  <button type="button" className="btn outline" onClick={() => setEditing(true)}>
                    {member.role === 'gm' ? t('Bild ändern') : t('Charakter bearbeiten')}
                  </button>
                )}
              {member.role === 'player' && apiAtLeast('0.4.8') && <MoveConsent campaign={campaign} me={member} onChanged={load} />}
              {member.role === 'player' && campaign.allowCharacterAnalysis && apiAtLeast('0.4.18') && <MyAnalyses campaign={campaign} me={member} info={info} />}
            </>
          )}
          {/* Mitglieder verwalten (nur SL): Rolle ändern, entfernen */}
          {campaign.myRole === 'gm' && !isDeletedMember(member) && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Divider />
              <h2>{t('Rolle in der Kampagne')}</h2>
              <ErrorBox error={manageError} />
              {member.role === 'player' && (
                <button type="button" className="btn outline" disabled={busy} onClick={() => changeRole('gm')}>{t('Zur Spielleitung machen')}</button>
              )}
              {member.role === 'gm' && (otherGms > 0 ? (
                <button type="button" className="btn outline" disabled={busy} onClick={() => changeRole('player')}>
                  {own ? t('SL-Rolle abgeben') : t('SL-Rolle entziehen')}
                </button>
              ) : own && <span className="muted small">{t('Du bist die einzige Spielleitung. Ernenne erst eine zweite, dann kannst du die Rolle abgeben.')}</span>)}
              {!own && (
                <button type="button" className="btn danger outline" disabled={busy} onClick={remove}>{t('Aus der Kampagne entfernen')}</button>
              )}
            </section>
          )}
        </>
      ))}
    </Screen>
  );
}

/**
 * Eigener Charakter auf Servern ab 0.4.7: Bearbeitet wird in der Sammlung. Ältere Charaktere (vor der Sammlung
 * angelegt) lassen sich einmal übernehmen; danach gilt der Stand aus der App.
 */
function CollectionActions({ campaign, member, onChanged, onEdit }: { campaign: Campaign; member: Member; onChanged: () => void; onEdit: () => void }) {
  const navigate = useNavigate();
  const connId = currentConnectionId() ?? currentConnection().id;
  const linked = characterForCampaign(connId, campaign.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const link = linked?.links.find((l) => l.connId === connId && l.campaignId === campaign.id);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const adopt = () => run(async () => {
    const c = createCharacter({ name: member.characterName ?? member.displayName, summary: member.characterSummary, backstory: member.characterBackstory });
    if (member.portraitUpdatedAt) {
      try {
        const blob = await api.portrait(campaign.id, member.id, 'full');
        const size = await squareOf(blob);
        updateCharacter(c.id, await blobToPortrait(blob, size));
      } catch { /* ohne Bild weiter */ }
    }
    await pushToCampaign(c.id, { connId, campaignId: campaign.id, campaignTitle: campaign.title, memberId: member.id });
    onChanged();
    navigate(`/charaktere/${c.id}`);
  });

  if (linked && link) {
    return (
      <>
        <ErrorBox error={error} />
        {linkOutdated(linked, link) && (
          <button type="button" className="btn" disabled={busy}
            onClick={() => run(async () => { await pushToCampaign(linked.id, link); onChanged(); })}>
            {busy ? t('Schicke …') : t('Neuen Stand aus der Sammlung schicken')}
          </button>
        )}
        <Link className="btn outline" to={`/charaktere/${linked.id}`}>{t('In meiner Sammlung öffnen')}</Link>
      </>
    );
  }
  if (member.characterId) {
    return <span className="muted small" style={{ textAlign: 'center' }}>{t('Dieser Charakter liegt in der Sammlung auf einem anderen Gerät.')}</span>;
  }
  return (
    <>
      <ErrorBox error={error} />
      {member.characterName ? (
        <>
          <button type="button" className="btn outline" disabled={busy} onClick={adopt}>{busy ? t('Übernehme …') : t('In meine Sammlung übernehmen')}</button>
          <span className="muted small">{t('Dann kannst du ihn in andere Kampagnen mitnehmen, Notizen führen und Welt mitbringen.')}</span>
        </>
      ) : (
        <Link className="btn outline" to="/charaktere">{t('Aus meiner Sammlung wählen')}</Link>
      )}
      <button type="button" className="btn ghost" disabled={busy} onClick={onEdit}>{t('Nur hier bearbeiten')}</button>
    </>
  );
}

/** Mittiger, quadratischer Ausschnitt eines Bildes */
async function squareOf(blob: Blob): Promise<{ x: number; y: number; size: number }> {
  const bmp = await createImageBitmap(blob);
  const size = Math.min(bmp.width, bmp.height);
  const r = { x: Math.round((bmp.width - size) / 2), y: Math.round((bmp.height - size) / 2), size };
  bmp.close();
  return r;
}
