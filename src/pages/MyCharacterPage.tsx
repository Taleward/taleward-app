import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFor } from '../api/client';
import { activeConnections, type Connection } from '../api/connections';
import type { CampaignSummary, CharacterStatus } from '../api/types';
import { characterFile, saveOrShare } from '../characters/backup';
import { CharacterEditor } from '../characters/CharacterEditor';
import { STATUS_LABEL, worldState } from '../characters/labels';
import { CharacterPortrait } from '../characters/Portrait';
import { deleteCharacter, getCharacter, onCharactersChanged, STATUS_ORDER, updateCharacter, type CharacterLink, type WorldItem } from '../characters/store';
import { fetchChronicle, linkOutdated, pushToCampaign, refreshWorld, releaseFromCampaign, serverHasCharacters } from '../characters/sync';
import { WorldItemDialog } from '../characters/WorldItemDialog';
import { confirmDialog } from '../components/confirm';
import { formatDate } from '../components/format';
import { IconLock } from '../components/Icons';
import { ENTRY_KIND } from '../components/ProposalCard';
import { Divider, ErrorBox, Screen } from '../components/Screen';
import { MissingHint, missingParts } from '../components/CharacterForm';
import { t, tn } from '../i18n';

/** Ein Charakter der Sammlung: Stammdaten, private Notizen, mitgebrachte Welt, Kampagnen und Abschriften. */
export function MyCharacterPage() {
  const { characterId = '' } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(() => getCharacter(characterId));
  // Aus „Dein Charakter ist noch unvollständig“ (über die Kampagne): gleich im Formular, mit Hinweis
  const [params] = useSearchParams();
  const editNow = params.get('bearbeiten') === '1';
  const [editing, setEditing] = useState(editNow);
  const [worldItem, setWorldItem] = useState<WorldItem | null | undefined>(undefined);
  const [notes, setNotes] = useState(c?.notes ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [picking, setPicking] = useState(false);
  const [fileError, setFileError] = useState<unknown>(null);

  useEffect(() => onCharactersChanged(() => setC(getCharacter(characterId))), [characterId]);
  // Stand der eingereichten Einträge still nachladen
  useEffect(() => {
    const ch = getCharacter(characterId);
    ch?.links.filter((l) => l.submitted && Object.keys(l.submitted).length).forEach((l) => refreshWorld(ch.id, l).catch(() => undefined));
  }, [characterId]);

  if (!c) {
    return (
      <Screen nav={false} backTo={{ to: '/charaktere', label: t('Meine Charaktere') }} title={t('Nicht gefunden.')}>
        <Link className="btn" to="/charaktere">{t('Meine Charaktere')}</Link>
      </Screen>
    );
  }

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: CharacterStatus) => {
    if (status === c.status) return;
    if (status === 'deceased' && !(await confirmDialog(t('{name} als verstorben markieren? Das lässt sich jederzeit zurücknehmen.', { name: c.name }), { confirmLabel: t('Verstorben') }))) return;
    updateCharacter(c.id, { status });
  };

  const release = async (l: CharacterLink) => {
    if (!(await confirmDialog(t('{name} von „{campaign}“ lösen? Dort bleibt der bisherige Stand stehen, er wird nur nicht mehr abgeglichen.', { name: c.name, campaign: l.campaignTitle }), { confirmLabel: t('Lösen') }))) return;
    run('release:' + l.campaignId, () => releaseFromCampaign(c.id, l));
  };

  const shareFile = async () => {
    setFileError(null);
    try { await saveOrShare(characterFile(c), c.name); } catch (e) { setFileError(e); }
  };

  const remove = async () => {
    const q = c.links.length
      ? t('{name} aus deiner Sammlung löschen? In den Kampagnen bleibt der letzte Stand stehen. Private Notizen und Chroniken sind dann weg.', { name: c.name })
      : t('{name} aus deiner Sammlung löschen? Private Notizen und Chroniken sind dann weg.', { name: c.name });
    if (!(await confirmDialog(q, { confirmLabel: t('Löschen'), danger: true }))) return;
    deleteCharacter(c.id);
    navigate('/charaktere', { replace: true });
  };

  const chronicles = Object.values(c.chronicles).sort((a, b) => b.takenAt.localeCompare(a.takenAt));

  return (
    <Screen narrow nav={false} backTo={{ to: '/charaktere', label: t('Meine Charaktere') }}
      overline={[c.system, t(STATUS_LABEL[c.status])].filter(Boolean).join(' · ')} title={c.name}>
      <ErrorBox error={error} />
      {editing ? (
        <section className="card">
          {/* Zustand: selten gebraucht, darum nur hier; gilt sofort, oben steht er als Abzeichen */}
          <div className="field" style={{ margin: '0 0 12px' }}>
            <span className="label" id="status-label">{t('Status')}</span>
            <div className="segmented" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-labelledby="status-label">
              {STATUS_ORDER.map((s) => (
                <button key={s} type="button" aria-pressed={c.status === s} onClick={() => setStatus(s)}>{t(STATUS_LABEL[s])}</button>
              ))}
            </div>
          </div>
          {editNow && <MissingHint parts={missingParts({ name: c.name, summary: c.summary, portrait: !!c.portrait })} />}
          <CharacterEditor character={c} submitLabel={t('Speichern')} onSaved={() => setEditing(false)}
            secondary={{ label: t('Abbrechen'), onClick: () => setEditing(false) }} />
        </section>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <CharacterPortrait id={c.id} name={c.name} portrait={c.portrait} meta={c.portraitMeta} size={152} faded={c.status !== 'active'} />
            {c.nickname && <div className="muted">„{c.nickname}“</div>}
          </div>
          {c.summary
            ? <div className="card recap"><p>{c.summary}</p></div>
            : <div className="muted small" style={{ textAlign: 'center' }}>{t('Noch keine Kurzbeschreibung.')}</div>}
          {c.backstory && (
            <section className="card secret">
              <h2 className="row" style={{ gap: 8 }}><IconLock /> {t('Hintergrund')}</h2>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.backstory}</p>
              <div className="muted small">{t('Sehen nur du und die Spielleitung.')}</div>
            </section>
          )}
          <button type="button" className="btn outline" onClick={() => setEditing(true)}>{t('Charakter bearbeiten')}</button>
        </>
      )}

      {/* Private Notizen */}
      <section className="card">
        <h2 className="row" style={{ gap: 8 }}><IconLock /> {t('Private Notizen')}</h2>
        <textarea rows={4} value={notes} aria-label={t('Private Notizen')} onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== c.notes && updateCharacter(c.id, { notes })}
          placeholder={t('Pläne, Verdachte, offene Rechnungen …')} />
        <span className="muted small">{t('Nur für dich – verlässt nie dieses Gerät.')}</span>
      </section>

      {/* Mitgebrachte Welt */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Divider />
        <h2>{t('Mitgebrachte Welt')}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {t('Familie, Heimat, alte Feinde, ein Erbstück: Was dein Charakter mitbringt, geht als Vorschlag an die Spielleitung.')}
        </p>
        {c.world.map((w) => (
          <button key={w.id} type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
            onClick={() => setWorldItem(w)}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <strong>{w.name}</strong>
              <span className="row" style={{ gap: 6 }}>
                {w.secret && <span className="pill"><IconLock size={12} /> {t('Geheim')}</span>}
                <span className="pill">{t(ENTRY_KIND[w.type])}</span>
              </span>
            </div>
            {w.relation && <span className="muted small">{w.relation}</span>}
            <span className="small" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{w.summary}</span>
            {c.links.map((l) => {
              const s = worldState(w, l);
              return s && (
                <span key={l.connId + l.campaignId} className="small" style={{ color: s.tone === 'seal' ? 'var(--seal)' : s.tone === 'ok' ? 'var(--ok, inherit)' : 'var(--ink-faint)' }}>
                  {l.campaignTitle}: {s.label}
                </span>
              );
            })}
          </button>
        ))}
        <button type="button" className="btn outline" onClick={() => setWorldItem(null)}>{t('Eintrag hinzufügen')}</button>
      </section>

      {/* Kampagnen */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Divider />
        <h2>{t('Kampagnen')}</h2>
        {c.links.length === 0 && (
          <p className="muted small" style={{ margin: 0 }}>{t('Noch in keiner Kampagne. Du kannst ihn beim Beitritt wählen oder hier einsetzen.')}</p>
        )}
        {c.links.map((l) => {
          const outdated = linkOutdated(c, l);
          const k = l.connId + ':' + l.campaignId;
          return (
            <div key={k} className={outdated ? 'card warn' : 'card'}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <Link to={`/v/${l.connId}/k/${l.campaignId}`} style={{ font: '700 17px/22px var(--font-serif)', color: 'var(--ink)' }}>{l.campaignTitle}</Link>
                <span className={outdated ? 'pill seal' : 'pill'}>{outdated ? t('Neuer Stand') : t('Aktuell')}</span>
              </div>
              <span className="muted small">{l.serverName}</span>
              <div className="row wrap" style={{ gap: 8 }}>
                {outdated && (
                  <button type="button" className="btn small" disabled={!!busy}
                    onClick={() => run('push:' + k, () => pushToCampaign(c.id, l))}>
                    {busy === 'push:' + k ? t('Schicke …') : t('Stand schicken')}
                  </button>
                )}
                <button type="button" className="btn small outline" disabled={!!busy}
                  onClick={() => run('chron:' + k, () => fetchChronicle(c.id, l))}>
                  {busy === 'chron:' + k ? t('Lade …') : t('Chronik sichern')}
                </button>
                <button type="button" className="btn small ghost" disabled={!!busy} onClick={() => release(l)}>{t('Von der Kampagne lösen')}</button>
              </div>
            </div>
          );
        })}
        {picking
          ? <CampaignPicker linked={c.links} onCancel={() => setPicking(false)}
              onPick={(conn, camp) => run('link', async () => {
                await attach(conn, camp, c.id, c.name);
                setPicking(false);
              })} busy={busy === 'link'} />
          : c.status === 'active' && <button type="button" className="btn outline" onClick={() => setPicking(true)}>{t('In einer Kampagne einsetzen')}</button>}
      </section>

      {/* Abschriften */}
      {chronicles.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Divider />
          <h2>{t('Chroniken')}</h2>
          <p className="muted small" style={{ margin: 0 }}>{t('Was dein Charakter erlebt hat – bleibt in der Sammlung, auch wenn die Kampagne endet.')}</p>
          {chronicles.map((ch) => {
            const read = ch.sessions.filter((s) => s.recap);
            return (
              <details key={ch.campaign.id + ch.server.url} className="card" style={{ gap: 10 }}>
                <summary>
                  <span style={{ flex: 1 }}>
                    <strong>{ch.campaign.title}</strong>
                    <span className="muted small"> · {tn(read.length, '{n} Kapitel', '{n} Kapitel')} · {t('Stand {date}', { date: formatDate(ch.takenAt) })}</span>
                  </span>
                </summary>
                {read.map((s) => (
                  <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="overline">{t('Kapitel {n}', { n: s.number })} · {formatDate(s.playedAt)}</span>
                    <strong>{s.recap!.title}</strong>
                    <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{s.recap!.text}</p>
                  </div>
                ))}
                {ch.mentions.length > 0 && (
                  <>
                    <span className="overline">{t('Erwähnt bei')}</span>
                    {ch.mentions.map((m) => <span key={m.entryId} className="small"><strong>{m.name}</strong> · {t(ENTRY_KIND[m.entryType])}</span>)}
                  </>
                )}
              </details>
            );
          })}
        </section>
      )}

      <Divider />
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2>{t('Als Datei weitergeben')}</h2>
        <span className="small">{t('Zum Beispiel auf dein Tablet oder ein neues Handy: Dort unter „Meine Charaktere“ → „Sammlung sichern“ → „Aus Datei zurückholen“. Die Datei enthält auch deine privaten Notizen und Chroniken.')}</span>
        <ErrorBox error={fileError} />
        <button type="button" className="btn outline" style={{ alignSelf: 'flex-start' }} onClick={shareFile}>{t('{name} als Datei speichern', { name: c.name })}</button>
      </section>
      <button type="button" className="btn danger outline" onClick={remove}>{t('Aus der Sammlung löschen')}</button>

      {worldItem !== undefined && <WorldItemDialog character={c} item={worldItem} onClose={() => setWorldItem(undefined)} />}
    </Screen>
  );
}

/** Charakter in eine Kampagne setzen, in der man schon Mitglied ist (ersetzt den bisherigen Charakter dort) */
async function attach(conn: Connection, camp: CampaignSummary, characterId: string, name: string) {
  const api = apiFor(conn);
  const full = await api.campaign(camp.id);
  const me = full.members.find((m) => m.userId === conn.user?.id);
  if (!me) throw new Error(t('Nicht gefunden.'));
  if (me.characterName && me.characterId !== characterId) {
    if (!(await confirmDialog(t('In „{campaign}“ spielst du bisher {old}. Durch {name} ersetzen?', { campaign: camp.title, old: me.characterName, name }), { confirmLabel: t('Ersetzen') }))) return;
    if (me.characterId) await api.releaseMyCharacter(camp.id);
  }
  await pushToCampaign(characterId, { connId: conn.id, campaignId: camp.id, campaignTitle: camp.title, memberId: me.id });
}

function CampaignPicker({ linked, onPick, onCancel, busy }: {
  linked: CharacterLink[];
  onPick: (conn: Connection, c: CampaignSummary) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [items, setItems] = useState<{ conn: Connection; c: CampaignSummary }[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const conns = activeConnections().filter(serverHasCharacters);
    Promise.all(conns.map((conn) => apiFor(conn).campaigns().then((list) => list.map((c) => ({ conn, c }))).catch(() => [])))
      .then((all) => setItems(all.flat().filter(({ conn, c }) => c.myRole === 'player' && !c.archivedAt
        && !linked.some((l) => l.connId === conn.id && l.campaignId === c.id))))
      .catch(setError);
  }, [linked]);

  return (
    <div className="card">
      <strong>{t('In welcher Kampagne?')}</strong>
      <ErrorBox error={error} />
      {!items && <span className="muted small">{t('Lade Kampagnen …')}</span>}
      {items?.length === 0 && <span className="muted small">{t('Keine passende Kampagne. Es zählen Kampagnen, in denen du spielst, auf Servern ab Schnittstelle 0.4.7.')}</span>}
      {items?.map(({ conn, c }) => (
        <button key={conn.id + c.id} type="button" className="btn outline" disabled={busy} onClick={() => onPick(conn, c)}>
          {c.title}{c.myCharacterName ? ` · ${t('bisher {name}', { name: c.myCharacterName })}` : ''}
        </button>
      ))}
      <button type="button" className="btn ghost small" onClick={onCancel}>{t('Abbrechen')}</button>
    </div>
  );
}
