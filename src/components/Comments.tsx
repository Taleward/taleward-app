import { apiAtLeast } from '../api/connections';
import { isDeletedMember } from '../api/types';
import { confirmDialog } from './confirm';
import { Avatar } from './Avatar';
import { t } from '../i18n';
import { useEffect, useState } from 'react';
import { api, isApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Campaign, Comment } from '../api/types';
import { IconLock } from './Icons';
import { ErrorBox } from './Screen';
import { formatAgo } from './format';

/**
 * Kommentare unter einem Kapitel. Öffentliche sehen alle, private nur Absender und Empfänger.
 * Spieler schreiben privat nur an die Spielleitung, die Spielleitung an jede Person.
 */
export function Comments({ sessionId, campaign }: { sessionId: string; campaign: Campaign }) {
  const { user } = useAuth();
  const me = campaign.members.find((m) => m.userId === user?.id);
  const gm = campaign.myRole === 'gm';
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  // Ab 0.4.26 an mehrere Personen; vorher genau eine (Auswahlliste)
  const multi = apiAtLeast('0.4.26');
  const [privateTo, setPrivateTo] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const to = multi ? (privateTo ? chosen : []) : recipient ? [recipient] : [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    // Ohne Netz und ohne Kopie: still leer statt Fehler – der Hinweis oben sagt schon, dass der Server fehlt
    api.comments(sessionId).then(setList).catch((e) => (isApiError(e, 'network') ? setUnreachable(true) : setError(e)));
  }, [sessionId]);

  const name = (id: string | null) => campaign.members.find((m) => m.id === id)?.displayName ?? t('Unbekannt');
  const author = (id: string) => campaign.members.find((m) => m.id === id);
  const recipients = campaign.members.filter((m) => m.id !== me?.id && !isDeletedMember(m) && (gm || m.role === 'gm'));

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const k = await api.addComment(sessionId, text.trim(), to, multi);
      setList((l) => [...(l ?? []), k]);
      setText('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (k: Comment) => {
    try {
      const updated = await api.editComment(k.id, editText.trim());
      setList((l) => l?.map((x) => (x.id === k.id ? updated : x)) ?? null);
      setEditingId(null);
    } catch (e) {
      setError(e);
    }
  };

  const remove = async (k: Comment) => {
    if (!(await confirmDialog(t('Kommentar löschen?'), { confirmLabel: t('Löschen'), danger: true }))) return;
    try {
      await api.deleteComment(k.id);
      setList((l) => l?.filter((x) => x.id !== k.id) ?? null);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2>{t('Kommentare')}</h2>
      <ErrorBox error={error} />
      {unreachable && <span className="muted small">{t('Die Kommentare siehst du wieder, wenn der Server erreichbar ist.')}</span>}
      {list?.length === 0 && <div className="muted small">{t('Noch keine Kommentare.')}</div>}

      {list?.map((k) => {
        const own = k.authorMemberId === me?.id;
        const toIds = k.recipientMemberIds?.length ? k.recipientMemberIds : k.recipientMemberId ? [k.recipientMemberId] : [];
        const isPrivate = toIds.length > 0;
        const others = toIds.filter((id) => id !== me?.id).map(name).join(', ');
        return (
          <div key={k.id} className={isPrivate ? 'card secret' : 'card'} style={{ gap: 6 }}>
            <div className="row between small">
              <span className="row" style={{ gap: 8 }}>
                {author(k.authorMemberId) && <Avatar campaignId={campaign.id} member={author(k.authorMemberId)!} size={28} />}
                <strong>{own ? t('Du') : name(k.authorMemberId)}</strong>
              </span>
              <span className="muted">{formatAgo(k.createdAt)}{k.editedAt ? ' · ' + t('bearbeitet') : ''}</span>
            </div>
            {isPrivate && (
              <div className="row small muted" style={{ gap: 6 }}>
                <IconLock size={14} /> {own ? t('Privat an {name}', { name: toIds.map(name).join(', ') })
                  : others ? t('Privat an dich und {names}', { names: others }) : t('Privat an dich')}
              </div>
            )}
            {editingId === k.id ? (
              <>
                <label htmlFor={`edit-${k.id}`} className="muted small">{t('Kommentar bearbeiten')}</label>
                <textarea id={`edit-${k.id}`} value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="row">
                  <button type="button" className="btn small" disabled={!editText.trim()} onClick={() => saveEdit(k)}>{t('Speichern')}</button>
                  <button type="button" className="btn small ghost" onClick={() => setEditingId(null)}>{t('Abbrechen')}</button>
                </div>
              </>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap' }}>{k.text}</div>
            )}
            {editingId !== k.id && (own || gm) && (
              // Als leise Textlinks: zwei Knöpfe unter jedem Kommentar machen die Liste unruhig; die Rückfrage bleibt
              <div className="row comment-actions" style={{ gap: 16 }}>
                {own && (
                  <button type="button" className="linklike tap-link small" onClick={() => { setEditingId(k.id); setEditText(k.text); }}>
                    {t('Bearbeiten')}
                  </button>
                )}
                <button type="button" className="linklike tap-link small" onClick={() => remove(k)}>{t('Löschen')}</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="card">
        <label htmlFor="new-comment" className="muted small">{t('Dein Kommentar')}</label>
        <textarea id="new-comment" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={(multi ? privateTo : to.length > 0) ? t('Nur die gewählten Personen sehen das.') : t('Sehen alle am Tisch.')} />
        {multi ? (
          <div className="field" role="group" aria-labelledby="recipient-label">
            <span id="recipient-label" className="small">{t('Sichtbar für')}</span>
            <div className="segmented" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" aria-pressed={!privateTo} onClick={() => setPrivateTo(false)}>{t('Alle am Tisch')}</button>
              <button type="button" aria-pressed={privateTo} disabled={recipients.length === 0} onClick={() => setPrivateTo(true)}>{t('Nur ausgewählte')}</button>
            </div>
            {privateTo && recipients.map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" checked={chosen.includes(m.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, m.id] : c.filter((x) => x !== m.id)))} />
                <span>{m.displayName}{m.role === 'gm' ? ` (${t('Spielleitung')})` : m.characterName ? ` (${m.characterName})` : ''}</span>
              </label>
            ))}
          </div>
        ) : (
        <div className="field">
          <label htmlFor="recipient">{t('Sichtbar für')}</label>
          <select id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <option value="">{t('Alle am Tisch')}</option>
            {recipients.map((m) => (
              <option key={m.id} value={m.id}>
                {t('Nur {name}', { name: m.displayName })}{m.role === 'gm' ? ` (${t('Spielleitung')})` : m.characterName ? ` (${m.characterName})` : ''}
              </option>
            ))}
          </select>
        </div>
        )}
        <button type="button" className="btn small" disabled={!text.trim() || busy || (multi && privateTo && chosen.length === 0)} onClick={send}>
          {to.length ? t('Privat senden') : t('Kommentieren')}
        </button>
      </div>
    </section>
  );
}
