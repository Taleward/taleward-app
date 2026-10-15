import { useState } from 'react';
import { api } from '../api/client';
import { currentConnection, p } from '../api/connections';
import { Link } from 'react-router-dom';
import { isDeletedMember, type Campaign, type GmNotice, type Member } from '../api/types';
import { t, tn } from '../i18n';
import { copyText, inviteLink, shareInvite } from '../invite';
import { confirmDialog } from './confirm';
import { Dialog } from './Dialog';
import { formatDate, formatDateFull } from './format';
import { ErrorBox } from './Screen';
import { useServerInfo } from './CloudNotice';

/*
 * Plätze und Figuren (Schnittstelle 0.4.8/0.4.9):
 * - offene Plätze nach einem Umzug: Einladung für genau diesen Platz oder „Das bin ich“
 * - Hinweis „Platz eingenommen“ (seat_claimed)
 * - Figur eines ausgetretenen Spielers: als NSC weiterführen oder einem anderen Spieler geben (character_orphaned)
 * - Hinweis „ist beigetreten“ (member_joined, ab 0.4.14): passt oder wieder entfernen
 */

/** Spieler, die eine Figur übernehmen können: aktiv, Rolle player, noch ohne eigene Figur */
export function playersWithoutFigure(campaign: Campaign): Member[] {
  return campaign.members.filter((m) => m.role === 'player' && !isDeletedMember(m) && !m.characterName && !m.characterId);
}

/** Auswahl, wer eine Figur weiterspielt */
export function AssignFigureDialog({ campaign, entryId, figureName, onDone, onClose }: {
  campaign: Campaign; entryId: string; figureName: string; onDone: () => void; onClose: () => void;
}) {
  const candidates = playersWithoutFigure(campaign);
  const [pick, setPick] = useState<string>(candidates[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const target = candidates.find((m) => m.id === pick);

  const save = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api.assignEntry(entryId, target.id);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog title={t('Wer spielt {name} weiter?', { name: figureName })} onClose={onClose}>
      {candidates.length === 0 ? (
        <span className="muted">{t('Gerade hat niemand am Tisch einen freien Platz für eine Figur. Lade zuerst jemanden ein; die Figur wartet so lange.')}</span>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {candidates.map((m) => (
              <label key={m.id} className="check" style={{ minHeight: 48 }}>
                <input type="radio" name="assign" checked={pick === m.id} onChange={() => setPick(m.id)} />
                <span>{m.displayName}</span>
              </label>
            ))}
          </div>
          <span className="muted small">
            {t('Name, Beschreibung und alle Erwähnungen in der Bibel gehen mit. Hintergrund und Bild der früheren Person bleiben bei ihr. {name} kann die Figur danach in die eigene Sammlung übernehmen.', { name: target?.displayName ?? '' })}
          </span>
        </>
      )}
      <ErrorBox error={error} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {candidates.length > 0 && (
          <button type="button" className="btn" disabled={busy || !target} onClick={save}>
            {t('{name} übergeben', { name: figureName })}
          </button>
        )}
        <button type="button" className="btn outline" onClick={onClose}>{t('Abbrechen')}</button>
      </div>
    </Dialog>
  );
}

/** Karte für die SL: Ein Spieler hat die Runde verlassen – was wird aus seiner Figur? */
export function OrphanNoticeCard({ campaign, notice, onDone }: { campaign: Campaign; notice: GmNotice; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const m = campaign.members.find((x) => x.id === notice.memberId);
  const deleted = !!m && (!!m.deletedAt || m.userId === '');
  const person = m?.displayName || t('Ein Spieler');
  const figure = m?.characterName ?? t('die Figur');
  const entryId = notice.entryIds[0];

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const toNpc = async () => {
    if (await confirmDialog(t('{figure} als NSC weiterführen? Name, Beschreibung und alle Erwähnungen bleiben in der Bibel. Du kannst die Figur später trotzdem einem Spieler geben.', { figure }), { confirmLabel: t('Als NSC weiterführen') })) {
      run(() => api.entryToNpc(entryId));
    }
  };

  if (!entryId) return null;
  return (
    <div className="card warn">
      <strong>{deleted ? t('Das Konto hinter {figure} wurde gelöscht', { figure }) : t('{person} hat die Runde verlassen', { person })}</strong>
      <span className="muted small">{t('Was wird aus {figure}? Die Geschichte der Figur bleibt in der Kampagne, egal wie du dich entscheidest.', { figure })}</span>
      <ErrorBox error={error} />
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small outline" disabled={busy} onClick={toNpc}>{t('Als NSC weiterführen')}</button>
        <button type="button" className="btn small outline" disabled={busy} onClick={() => setAssigning(true)}>{t('Einem Spieler geben')}</button>
        <button type="button" className="btn small ghost" disabled={busy} onClick={() => run(() => api.dismissGmNotice(campaign.id, notice.id))}>{t('Später')}</button>
      </div>
      {assigning && (
        <AssignFigureDialog campaign={campaign} entryId={entryId} figureName={figure}
          onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); onDone(); }} />
      )}
    </div>
  );
}

/** Karte für die SL: Jemand hat nach einem Umzug einen offenen Platz eingenommen */
export function SeatClaimedCard({ campaign, notice, onDone }: { campaign: Campaign; notice: GmNotice; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const m = campaign.members.find((x) => x.id === notice.memberId);
  if (!m) return null;
  const figure = m.characterName ?? t('einen Platz');

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const release = async () => {
    // Vor dem Freigeben sagen, was bei der Person bleibt
    const q = t('Platz von {figure} in „{campaign}“ auf „{server}“ wieder freigeben? {person} braucht danach eine neue Einladung. Die Figur bleibt am Platz, mit allem, was sie in der Kampagne erlebt hat.',
      { figure, person: m.displayName, campaign: campaign.title, server: currentConnection().name });
    const list = [
      { label: t('Gelöscht'), text: t('Hintergrund am Platz, offene Auswertungen') },
      { label: t('Bleibt beim ehemaligen Mitglied'), text: t('Charakterbögen, Vorschläge, Kommentare') }
    ];
    if (await confirmDialog(q, { confirmLabel: t('Platz freigeben'), danger: true, list })) {
      run(() => api.releaseSeat(campaign.id, m.id));
    }
  };

  return (
    <div className="card">
      <strong>{t('{person} spielt jetzt {figure}', { person: m.displayName, figure })}</strong>
      <span className="muted small">{t('{person} hat den Platz aus der umgezogenen Kampagne eingenommen. Passt das?', { person: m.displayName })}</span>
      <ErrorBox error={error} />
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small outline" disabled={busy} onClick={() => run(() => api.dismissGmNotice(campaign.id, notice.id))}>{t('Passt')}</button>
        <button type="button" className="btn small danger outline" disabled={busy} onClick={release}>{t('Platz freigeben')}</button>
      </div>
    </div>
  );
}

/**
 * Jemand ist der Kampagne beigetreten (member_joined, ab Schnittstelle 0.4.14). Die SL bestätigt oder entfernt die
 * Person wieder.
 */
export function MemberJoinedCard({ campaign, notice, hidden, onDone }: {
  campaign: Campaign; notice: GmNotice;
  /** Hinweis „bleibt verborgen“ zur selben Person – steht dann in dieser Karte statt in einer eigenen */
  hidden?: GmNotice;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const m = campaign.members.find((x) => x.id === notice.memberId);
  if (!m || isDeletedMember(m)) return null;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog(
      t('{person} aus „{campaign}“ auf „{server}“ entfernen? {person} sieht danach nichts mehr aus der Kampagne und braucht für die Rückkehr eine neue Einladung.', { person: m.displayName, campaign: campaign.title, server: currentConnection().name }),
      { confirmLabel: t('Entfernen'), danger: true }
    );
    if (ok) run(() => api.removeMember(campaign.id, m.id));
  };

  return (
    <div className="card">
      <strong>{t('{person} ist der Kampagne beigetreten', { person: m.displayName })}</strong>
      <span className="muted small">
        {formatDate(notice.createdAt)}{m.characterName ? ' · ' + t('spielt {figure}', { figure: m.characterName }) : ''}
        {' · '}{t('Kennst du die Person? Sonst entferne sie wieder.')}
      </span>
      {hidden && (
        <span className="muted small">
          {tn(hidden.entryIds.length,
            '{n} Eintrag der Bibel ist nur für einige Spieler sichtbar – für {name} bleibt er verborgen, bis du ihn freigibst.',
            '{n} Einträge der Bibel sind nur für einige Spieler sichtbar – für {name} bleiben sie verborgen, bis du sie freigibst.', { name: m.displayName })}
        </span>
      )}
      <ErrorBox error={error} />
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small outline" disabled={busy}
          onClick={() => run(() => Promise.all([notice, hidden].filter((x): x is GmNotice => !!x).map((x) => api.dismissGmNotice(campaign.id, x.id))))}>
          {t('Passt so')}
        </button>
        {hidden && <Link className="btn small ghost" to={p(`/k/${campaign.id}/bibel`)}>{t('Zur Bibel')}</Link>}
        <button type="button" className="btn small danger outline" disabled={busy} onClick={remove}>{t('Entfernen')}</button>
      </div>
    </div>
  );
}

/** Offener Platz nach einem Umzug: Einladung genau für diesen Platz oder selbst übernehmen */
export function OpenSeatDialog({ campaign, seat, onDone, onClose }: { campaign: Campaign; seat: Member; onDone: () => void; onClose: () => void }) {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const name = seat.characterName ?? (seat.role === 'gm' ? t('Spielleitung') : t('Offener Platz'));
  const info = useServerInfo();

  const createInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.seatInvite(campaign.id, seat.id);
      setInvite({ code: r.code, expiresAt: r.expiresAt, link: inviteLink(currentConnection(), r.code, (info ?? (await api.info().catch(() => null)))?.publicUrl) });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const take = async () => {
    if (!(await confirmDialog(t('Das bist du? Du übernimmst den Platz „{name}“ mit allem, was dazugehört (Anwesenheit, Erwähnungen, Kommentare).', { name }), { confirmLabel: t('Ja, das bin ich') }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.takeSeat(campaign.id, seat.id);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const message = t('Dein Platz als {name} in „{title}“ wartet auf dich:', { name, title: campaign.title });

  return (
    <Dialog title={name} onClose={onClose}>
      <span className="muted small">
        {t('Dieser Platz kommt aus der umgezogenen Kampagne und ist noch frei. Wer mit der Figur aus der eigenen Sammlung beitritt, setzt sich von selbst hierher. Sonst hilft eine Einladung genau für diesen Platz.')}
      </span>
      {invite ? (
        <div className="notice" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <span className="small" style={{ wordBreak: 'break-all' }}>{invite.link}</span>
          <span className="muted small">{t('Gilt einmal und nur für diesen Platz, bis {date}.', { date: formatDateFull(invite.expiresAt) })}</span>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn small" onClick={async () => { if (!(await shareInvite(t('Einladung zu Taleward'), message, invite.link))) setCopied(true); }}>{t('Teilen')}</button>
            <button type="button" className="btn small outline" onClick={() => copyText(`${message}\n${invite.link}`).then(() => setCopied(true)).catch(setError)}>
              {copied ? t('Kopiert') : t('Link kopieren')}
            </button>
          </div>
        </div>
      ) : null}
      <ErrorBox error={error} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!invite && <button type="button" className="btn" disabled={busy} onClick={createInvite}>{t('Einladung für diesen Platz')}</button>}
        <button type="button" className="btn outline" disabled={busy} onClick={take}>{t('Das bin ich')}</button>
        <button type="button" className="btn ghost" onClick={onClose}>{t('Schließen')}</button>
      </div>
    </Dialog>
  );
}
