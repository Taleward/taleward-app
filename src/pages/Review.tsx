import { isDeletedMember } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { apiAtLeast, p } from '../api/connections';
import { t, tn } from '../i18n';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, isApiError } from '../api/client';
import type { Entry, Member, Proposal, Recap, Session } from '../api/types';
import { ProposalCard } from '../components/ProposalCard';
import { IconLock } from '../components/Icons';
import { ErrorBox, Screen, useWorkspace } from '../components/Screen';
import { fromEditText, toEditText } from '../review/parts';
import { RecapReviewView, jumpToFirstFlagged, jumpToParagraph, reportSentence, reviewNeedsAttention } from '../components/RecapReviewView';
import { SecretWarnings, secretByParagraph, secretNames } from '../review/SecretWarnings';
import { namesSkipped, serverHasNameCheck } from './NamesPage';
import { ParagraphHint, RevisionBox, RevisionDraft, paragraphRef, revisionOpen } from '../review/Revision';
import { mentions } from '../review/mentions';

export function Review() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [players, setPlayers] = useState<Member[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  // Namen zu den Hinweisen auf Geheimes (ab 0.4.21), falls der Server sie nicht mitschickt
  const [entries, setEntries] = useState<Entry[]>([]);
  // Unsichere Namen (ab 0.4.6): eigener Schritt davor; übersprungen → hier nur noch als Hinweis
  const [termCount, setTermCount] = useState(0);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const recapOrNull = api.recap(sessionId).catch((e) => {
      if (isApiError(e) && e.status === 404) return null;
      throw e;
    });
    Promise.all([api.session(sessionId), recapOrNull, api.proposals(sessionId), api.gmNote(sessionId)])
      .then(([s, r, p, n]) => {
        setSession(s);
        api.campaign(s.campaignId).then((c) => {
          setMembers(c.members);
          setPlayers(c.members.filter((m) => m.role === 'player' && !isDeletedMember(m)));
        }).catch(() => undefined);
        setRecap(r);
        // Einträge auch für „Dort ergänzen?“ (wie sichtbar der vorhandene Eintrag ist)
        if (r?.gmWarnings?.some((w) => !w.names?.length) || p.some((x) => x.action === 'create' && x.match)) {
          api.entries(s.campaignId).then(setEntries).catch(() => undefined);
        }
        setProposals(p);
        setNote(n.text);
      })
      .catch(setError);
    if (serverHasNameCheck()) {
      api.uncertainTerms(sessionId).then((u) => {
        if (u.terms.length > 0 && !namesSkipped(sessionId)) navigate(p(`/s/${sessionId}/namen`), { replace: true });
        else setTermCount(u.terms.length);
      }).catch(() => undefined); // Namensprüfung ist freiwillig – Fehler hier stören das Prüfen nicht
    }
  }, [sessionId, navigate]);


  const saveNote = async () => {
    if (noteSaved) return;
    try {
      await api.saveGmNote(sessionId, note);
      setNoteSaved(true);
    } catch (e) {
      setError(e);
    }
  };

  const openCount = proposals?.filter((p) => p.decision === 'open').length ?? 0;

  const bulk = (decision: 'accepted' | 'rejected') =>
    Promise.all((proposals ?? []).filter((p) => p.decision === 'open').map((p) => api.decide(p.id, { decision })))
      .then((updated) => setProposals((list) => list?.map((x) => updated.find((u) => u.id === x.id) ?? x) ?? null))
      .catch(setError);

  // Ab Schnittstelle 0.4.10: aus der vorhandenen Abschrift neu schreiben lassen (z. B. nach einem Server-Update)
  const canRewrite = apiAtLeast('0.4.10');
  const rewrite = async () => {
    const ok = await confirmDialog(
      t('Kapitel {n} neu schreiben? Taleward schreibt Kapitel und Vorschläge aus der vorhandenen Abschrift noch einmal. Deine Änderungen am Kapitel und deine Entscheidungen zu den Vorschlägen gehen dabei verloren. Die SL-Notiz bleibt.', { n: session?.number ?? '' }),
      { confirmLabel: t('Neu schreiben'), danger: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      await saveNote();
      await api.resummarize(sessionId);
      navigate(p(`/s/${sessionId}`), { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const publish = async () => {
    // Eine Rückfrage für beides: Geheimes im Kapitel (ab 0.4.21) und noch offene Vorschläge
    const secrets = recap ? secretNames(recap, entries) : [];
    const reasons = [
      recap?.gmWarnings?.length ? (secrets.length
        ? t('Das Kapitel nennt noch Geheimes ({names}). Die Spieler lesen es so.', { names: secrets.join(', ') })
        : t('Das Kapitel nennt noch Geheimes. Die Spieler lesen es so.')) : '',
      openCount > 0 ? tn(openCount, '{n} Vorschlag ist noch offen und wird verworfen.', '{n} Vorschläge sind noch offen und werden verworfen.') : ''
    ].filter(Boolean);
    if (reasons.length && !(await confirmDialog(reasons.join(' ') + ' ' + t('Trotzdem veröffentlichen?'), { confirmLabel: t('Veröffentlichen') }))) return;
    setBusy(true);
    try {
      await saveNote();
      const s = await api.publish(sessionId);
      navigate(p(`/k/${s.campaignId}/chronik`), { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  // Breit (ab 1200 px, Arbeitsplatz): links das Kapitel, rechts die Vorschläge mit fester Fußzeile; beide scrollen für sich.
  // Schmal: alles untereinander in dieser Reihenfolge.
  const wide = useWorkspace();
  // Fährt man über einen Vorschlag, werden die Absätze hervorgehoben, in denen er vorkommt
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);

  const tools = [
    termCount > 0 && (
      <button key="names" type="button" className="btn small subtle" onClick={() => navigate(p(`/s/${sessionId}/namen`))}>
        {tn(termCount, '{n} unsicheren Namen prüfen', '{n} unsichere Namen prüfen')}
      </button>
    ),
    canRewrite && (
      <button key="voices" type="button" className="btn small subtle" onClick={() => navigate(p(`/s/${sessionId}/stimmen`))}>
        {t('Stimmen prüfen')}
      </button>
    )
  ].filter(Boolean);

  return (
    <Screen
      back
      wide
      overline={<span className="row" style={{ gap: 6 }}><IconLock size={14} /> {session ? t('Kapitel {n}', { n: session.number }) + ' · ' + t('nur für dich') : t('Nur für dich')}</span>}
      title={t('Kapitel prüfen')}
    >
      <ErrorBox error={error} />

      <div className="split review-split">
      <div className="a">
      {/* Werkzeuge als eine schmale Zeile */}
      {tools.length > 0 && <div className="review-tools">{tools}</div>}
      {recap && <SecretWarnings recap={recap} entries={entries} onJump={jumpToParagraph} />}
      {recap && <RecapEditor sessionId={sessionId} recap={recap} members={members} onSaved={setRecap} onError={setError}
        alwaysOpen={wide} highlight={hoverTitle} secretAt={secretByParagraph(recap, entries)} />}
      {/* Verwirft alle Änderungen – darum leise am Ende, nicht oben bei den Prüfwerkzeugen */}
      {canRewrite && proposals && (
        <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start', marginTop: 8 }} disabled={busy} onClick={rewrite}>
          {t('Kapitel neu schreiben')}
        </button>
      )}
      </div>

      <div className="b">
      <div className="review-proposals-head">
        <div className="row between wrap" style={{ gap: 8 }}>
          <strong>{proposals ? t('Vorschläge ({n})', { n: proposals.length }) : t('Vorschläge')}</strong>
          {/* Bei vielen Vorschlägen: alles Offene auf einmal entscheiden */}
          {proposals && openCount > 1 && (
            <span className="row wrap" style={{ gap: 4 }}>
              <button type="button" className="btn small subtle" onClick={() => bulk('accepted')}>{t('Alle offenen übernehmen')}</button>
              <button type="button" className="btn small subtle" onClick={() => bulk('rejected')}>{t('Alle offenen verwerfen')}</button>
            </span>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>{t('Nur Übernommenes kommt in die Bibel.')}</p>
      </div>

      <div className="review-proposals">
      {proposals?.map((p) => (
        <div key={p.id} onMouseEnter={() => setHoverTitle(p.title)} onMouseLeave={() => setHoverTitle(null)}
          onFocus={() => setHoverTitle(p.title)} onBlur={() => setHoverTitle(null)}>
          <ProposalCard proposal={p} players={players} entries={entries} onError={setError}
            onChange={(u) => setProposals((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null)} />
        </div>
      ))}

      {proposals?.length === 0 && (
        <div className="empty">{t('Für dieses Kapitel gibt es keine Vorschläge für die Bibel.')}</div>
      )}
      </div>

      {/* Fußzeile: SL-Notiz zum Aufklappen, Stand und Veröffentlichen – im Arbeitsplatz immer sichtbar */}
      {proposals && (
        <div className="review-foot">
          {/* Schmal offen, wenn schon etwas drinsteht; im Arbeitsplatz zu, damit die Vorschläge Platz haben */}
          <details className="card secret" open={(!wide && !!note.trim()) || undefined}>
            <summary className="row" style={{ gap: 8, fontFamily: 'var(--display)', fontWeight: 700 }}>
              <IconLock /> {t('Geheime SL-Notiz')}
              {note.trim() && <span className="muted small" style={{ fontFamily: 'var(--font-sans)', fontWeight: 400 }}>· {t('ausgefüllt')}</span>}
            </summary>
            <textarea
              id="gm-note"
              aria-label={t('Geheime SL-Notiz')}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setNoteSaved(false);
              }}
              onBlur={saveNote}
              style={{ background: 'var(--paper-raised)' }}
            />
            <div className="muted small">{t('Erscheint nie im Kapitel oder in der Spieleransicht.')}{noteSaved ? '' : ' ' + t('Wird beim Verlassen des Feldes gespeichert.')}</div>
          </details>
          <div className="review-publish">
            <span className="muted">
              {t('{done} von {total} Vorschlägen geprüft', { done: proposals.length - openCount, total: proposals.length })}
            </span>
            <button type="button" className="btn" disabled={busy} onClick={publish}>
              {busy ? t('Wird veröffentlicht …') : t('Kapitel veröffentlichen')}
            </button>
          </div>
        </div>
      )}
      </div>
      </div>
    </Screen>
  );
}

/**
 * Recap-Entwurf vor dem Veröffentlichen: lesen und bei Bedarf korrigieren (Titel, Text, offene Fäden) –
 * z. B. falsch geschriebene Namen. Der Server nimmt Änderungen nur bis zum Veröffentlichen an.
 */
function RecapEditor({ sessionId, recap, members, onSaved, onError, alwaysOpen = false, highlight = null, secretAt }: {
  sessionId: string;
  recap: Recap;
  members: Member[];
  /** Arbeitsplatz: Kapitel immer offen, nicht zum Zuklappen */
  alwaysOpen?: boolean;
  /** Titel eines Vorschlags – Absätze, in denen er vorkommt, werden hervorgehoben */
  highlight?: string | null;
  /** Absätze mit Geheimem (ab 0.4.21) */
  secretAt?: Map<number, string>;
  onSaved: (r: Recap) => void;
  onError: (e: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(recap.title);
  // Ab 0.4.17 stehen Zwischenüberschriften beim Bearbeiten als eigene Zeile „# Titel“ im Text
  const withParts = apiAtLeast('0.4.17');
  const [text, setText] = useState(() => (withParts ? toEditText(recap.text, recap.parts) : recap.text));
  const [threads, setThreads] = useState(recap.openThreads.join('\n'));
  const [busy, setBusy] = useState(false);
  const canRevise = apiAtLeast('0.4.15') && !recap.publishedAt;
  // Korrektur per Hinweis (ab 0.4.15): Hinweise je Absatz sammeln, dazu die Zeile am Ende; abgeschickt wird alles auf einmal
  const [hints, setHints] = useState<Record<number, string>>({});
  const [endHint, setEndHint] = useState('');
  const [focus, setFocus] = useState<{ index: number; key: number } | null>(null);
  const paras = recap.text.split(/\n\s*\n/);
  const pick = (index: number) => {
    setHints((h) => (index in h ? h : { ...h, [index]: '' }));
    setFocus((f) => ({ index, key: (f?.key ?? 0) + 1 }));
  };
  const filled = Object.entries(hints).filter(([, v]) => v.trim()).sort(([a], [b]) => Number(a) - Number(b));
  const collected = filled.map(([i, v]) => paragraphRef(paras[Number(i)] ?? '') + v.trim()).join('\n');
  const clearHints = () => { setHints({}); setEndHint(''); setFocus(null); };

  const save = async () => {
    setBusy(true);
    try {
      const threadList = threads.split('\n').map((x) => x.trim()).filter(Boolean);
      onSaved(await api.updateRecap(sessionId, withParts
        ? { title: title.trim(), ...fromEditText(text), openThreads: threadList }
        : { title: title.trim(), text: text.trim(), openThreads: threadList }));
      setEditing(false);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const selfEdit = () => { setTitle(recap.title); setText(withParts ? toEditText(recap.text, recap.parts) : recap.text); setThreads(recap.openThreads.join('\n')); setEditing(true); };

  if (editing) {
    return (
      <section className="card">
        <h2>{t('Kapitel bearbeiten')}</h2>
        <div className="field">
          <label htmlFor="rc-title">{t('Titel')}</label>
          <input id="rc-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rc-text">{t('Text')}</label>
          <textarea id="rc-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="muted small">{t('Absätze durch eine Leerzeile trennen.')}</span>
          {withParts && (recap.parts?.length ?? 0) > 0 && (
            <span className="muted small">{t('Zeilen mit # davor sind Zwischenüberschriften. Du kannst sie ändern, verschieben oder löschen.')}</span>
          )}
        </div>
        <div className="field">
          <label htmlFor="rc-threads">{t('Offene Fäden (einer pro Zeile)')}</label>
          <textarea id="rc-threads" rows={4} value={threads} onChange={(e) => setThreads(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn small" disabled={busy || !title.trim() || !text.trim()} onClick={save}>{t('Speichern')}</button>
          <button type="button" className="btn small outline" onClick={() => setEditing(false)}>{t('Abbrechen')}</button>
        </div>
      </section>
    );
  }

  const head = (
        <span style={{ flex: 1 }}>
          <strong>{t('Entwurf:')}</strong> {recap.title}
          {recap.review?.state === 'done' && (alwaysOpen && reviewNeedsAttention(recap)
            ? <button type="button" className="linklike muted small tap-link" onClick={() => jumpToFirstFlagged(recap)}>{reportSentence(recap)}</button>
            : <span className="muted small" style={{ display: 'block' }}>{reportSentence(recap)}</span>)}
        </span>
  );
  const body = (
    <>
      {/* Mit Gegenprüfung (ab 0.4.6) je Absatz eine Randmarke mit Belegen, sonst der reine Text; liegt ein
          Korrektur-Entwurf vor (ab 0.4.15), das Kapitel mit den Änderungen im Text */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {recap.revision?.state === 'ready'
          ? <RevisionDraft recap={recap} />
          : <RecapReviewView sessionId={sessionId} recap={recap} members={members} showReport={false} secretAt={secretAt}
              highlight={highlight ? mentions(highlight) : undefined}
              onPick={canRevise && !revisionOpen(recap) ? pick : undefined}
              after={(i) => (canRevise && !revisionOpen(recap) && i in hints ? (
                <ParagraphHint value={hints[i]} focusKey={focus?.index === i ? focus.key : 0}
                  onChange={(v) => setHints((h) => ({ ...h, [i]: v }))}
                  onRemove={() => setHints((h) => { const { [i]: _gone, ...rest } = h; return rest; })} />
              ) : null)} />}
      </div>
      {recap.openThreads.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {recap.openThreads.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      {/* Ab 0.4.15: die ruhige Zeile am Ende (oder der laufende Auftrag / die Entscheidung) */}
      {canRevise && (
        <div style={{ marginTop: 12 }}>
          <RevisionBox sessionId={sessionId} recap={recap} onRecap={onSaved} note={endHint} setNote={setEndHint}
            collected={collected} count={filled.length} onSent={clearHints} onSelfEdit={selfEdit} />
        </div>
      )}
      {!canRevise && (
        <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start', marginTop: 10 }} onClick={selfEdit}>
          {t('Kapitel bearbeiten')}
        </button>
      )}
    </>
  );

  // Arbeitsplatz: Kapitel immer offen; sonst zum Aufklappen (klappt bei Stellen zum Ansehen von selbst auf)
  if (alwaysOpen) {
    return <section className="card recap-sheet"><div className="recap-sheet-head">{head}</div>{body}</section>;
  }
  return (
    <details className="card" open={reviewNeedsAttention(recap) || !!recap.revision || !!recap.gmWarnings?.length || undefined}>
      <summary>{head}</summary>
      {/* Am Handy liegt der Satz in der Kopfzeile zum Aufklappen; der Sprung steht deshalb darunter */}
      {recap.review?.state === 'done' && reviewNeedsAttention(recap) && (
        <button type="button" className="linklike small tap-link" style={{ alignSelf: 'flex-start' }} onClick={() => jumpToFirstFlagged(recap)}>
          {t('Zur ersten Stelle')}
        </button>
      )}
      {body}
    </details>
  );
}
