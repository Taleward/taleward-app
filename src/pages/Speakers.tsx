import { apiAtLeast, currentConnection, p } from '../api/connections';
import { serverHasCharacters } from '../characters/sync';
import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, isApiError } from '../api/client';
import type { Campaign, Session, Speaker } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { IconPlay } from '../components/Icons';
import { ErrorBox, Screen } from '../components/Screen';
import { swapAssignment } from '../voice/swap';

const IGNORE = '__ignore';
const GUEST = 'guest:';

export function Speakers() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [speakers, setSpeakers] = useState<Speaker[] | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  // Gäste der Runde (aus der Anwesenheit); benennbar ab Schnittstelle 0.4.7
  const [guests, setGuests] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // Ab Schnittstelle 0.4.10: Zuordnung nach der Bestätigung ansehen und – solange das Kapitel auf Prüfung wartet – ändern
  const [session, setSession] = useState<Session | null>(null);
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const session = await api.session(sessionId);
        const [c, sp] = await Promise.all([api.campaign(session.campaignId), api.speakers(sessionId)]);
        setCampaign(c);
        setSpeakers(sp);
        const named = serverHasCharacters(currentConnection())
          ? [...new Set([...session.attendees.map((a) => a.guestName?.trim() ?? ''), ...sp.map((s) => s.assignedGuestName?.trim() ?? '')].filter(Boolean))]
          : [];
        setGuests(named);
        setSession(session);
        const start = Object.fromEntries(sp.map((s) => [s.id,
          s.assignedGuestName ? GUEST + s.assignedGuestName
            : s.assignedMemberId !== undefined ? (s.assignedMemberId ?? IGNORE)
              : s.suggestedMemberId ?? '']));
        setMapping(start);
        setInitial(start);
      } catch (e) {
        setError(e);
      }
    })();
  }, [sessionId]);

  const play = async (speakerId: string, index?: number) => {
    try {
      // Hörprobe mit Token laden, dann lokal abspielen
      let blob: Blob;
      try {
        blob = await api.speakerSample(sessionId, speakerId, index);
      } catch (e) {
        if (isApiError(e) && e.status === 410) throw new Error(t('Die Aufnahme ist schon gelöscht, Hörproben gibt es nicht mehr.'));
        throw e;
      }
      const url = URL.createObjectURL(blob);
      audio.current?.pause();
      audio.current = new Audio(url);
      await audio.current.play();
    } catch (e) {
      setError(e);
    }
  };

  const review = !!session && session.state !== 'awaiting_speakers' && apiAtLeast('0.4.10');
  const editable = !review || session?.state === 'awaiting_review';
  const changed = Object.keys(mapping).some((k) => mapping[k] !== initial[k]);

  const confirm = async () => {
    if (review && !(await confirmDialog(
      t('Zuordnung ändern und Kapitel neu schreiben? Taleward schreibt Kapitel und Vorschläge mit der neuen Zuordnung noch einmal. Deine Änderungen am Kapitel und deine Entscheidungen zu den Vorschlägen gehen dabei verloren.'),
      { confirmLabel: t('Neu schreiben'), danger: true }
    ))) return;
    setBusy(true);
    try {
      await api.assignSpeakers(
        sessionId,
        Object.entries(mapping).map(([speakerId, v]) => v.startsWith(GUEST)
          ? { speakerId, memberId: null, guestName: v.slice(GUEST.length) }
          : { speakerId, memberId: v === IGNORE ? null : v })
      );
      navigate(p(`/s/${sessionId}`), { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const complete = speakers?.every((s) => mapping[s.id]) ?? false;
  // Wem ist eine Stimme gerade zugeordnet (für den Hinweis „… ist aber X zugeordnet“)
  const assignedName = (v: string | undefined) => {
    if (!v || v === IGNORE) return null;
    if (v.startsWith(GUEST)) return v.slice(GUEST.length);
    const m = campaign?.members.find((x) => x.id === v);
    return m ? m.characterName ?? m.displayName : null;
  };
  const autoCount = speakers?.filter((s) => s.source === 'intro_round' || s.source === 'voice_match').length ?? 0;
  // Zwei Stimmen, deren Hinweise denselben Tausch meinen (2 ↔ 3): den Hinweis nur bei der ersten zeigen
  const shownHint = (s: Speaker) => {
    if (!s.hint || mapping[s.id] === s.hint.memberId || !campaign?.members.some((m) => m.id === s.hint!.memberId)) return false;
    const list = speakers ?? [];
    const idx = list.indexOf(s);
    return !list.slice(0, idx).some((o) => o.hint && o.hint.memberId === mapping[s.id] && s.hint!.memberId === mapping[o.id]);
  };

  return (
    <Screen narrow back title={review ? t('Stimmen prüfen') : t('Stimmen zuordnen')}
      overline={review && session ? t('Kapitel {n}', { n: session.number }) : t('Abschrift fertig')}>
      <ErrorBox error={error} />
      {review && (
        <p className="muted small" style={{ margin: 0 }}>
          {editable
            ? t('So sind die Stimmen zugeordnet. Stimmt etwas nicht, ändere es hier – Taleward schreibt das Kapitel dann neu.')
            : t('So waren die Stimmen zugeordnet.')}
        </p>
      )}
      {speakers && !review && (
        <p className="muted small" style={{ margin: 0 }}>
          {t('{n} Stimmen erkannt, {auto} davon automatisch zugeordnet.', { n: speakers.length, auto: autoCount })}
        </p>
      )}

      {speakers?.map((s) => {
        const unsure = !mapping[s.id];
        return (
          <div key={s.id} className={unsure ? 'card warn' : 'card'}>
            {/* Immer gleich aufgebaut: Name oben, darunter die Textproben mit eigener Hörprobe (ab 0.4.21 bis zu drei) */}
            <div className="card-title">{s.label}</div>
            <ul className="speaker-samples">
              {(s.samples?.length ? s.samples.slice(0, 3) : [{ text: s.sampleText }]).map((x, i, all) => (
                <li key={i}>
                  <button type="button" className="icon-btn" onClick={() => (s.samples?.length ? play(s.id, i) : play(s.id))}
                    aria-label={all.length > 1 ? t('Hörprobe {n} von {label} abspielen', { n: i + 1, label: s.label }) : t('Hörprobe {label} abspielen', { label: s.label })}>
                    <IconPlay />
                  </button>
                  <span className="quote">{x.text}</span>
                </li>
              ))}
            </ul>
            {s.source === 'voice_match' && <div className="muted small">{t('Über Stimmprofil erkannt')}</div>}
            {s.source === 'intro_round' && <div className="muted small">{t('Aus der Vorstellungsrunde')}</div>}
            {!review && s.suggestedMemberId && s.confidence < 0.8 && mapping[s.id] === s.suggestedMemberId && (
              <div className="small" style={{ color: 'var(--siegel-text)', fontWeight: 500 }}>{t('Unsicher – bitte prüfen.')}</div>
            )}
            {/* Ab 0.4.21: Anrede oder Selbstnennung passt nicht zur Zuordnung – nur, solange sie noch nicht passt */}
            {s.hint && shownHint(s) && (
              <div className="speaker-hint">
                <span>
                  {(() => {
                    const who = assignedName(mapping[s.id]);
                    const vars = { label: s.label, name: s.hint.name, who: who ?? '' };
                    if (s.hint.code === 'self_named') {
                      return who ? t('{label} nennt sich selbst „{name}“, ist aber {who} zugeordnet. Vertauscht?', vars)
                        : t('{label} nennt sich selbst „{name}“. Gehört die Stimme dorthin?', vars);
                    }
                    return who ? t('{label} wird oft mit „{name}“ angesprochen, ist aber {who} zugeordnet. Vertauscht?', vars)
                      : t('{label} wird oft mit „{name}“ angesprochen. Gehört die Stimme dorthin?', vars);
                  })()}
                </span>
                {editable && (
                  <button type="button" className="btn small outline" onClick={() => setMapping(swapAssignment(mapping, s.id, s.hint!.memberId))}>
                    {assignedName(mapping[s.id]) ? t('Tauschen') : t('Zuordnen')}
                  </button>
                )}
                {session?.state === 'published' && <span className="muted small">{t('Das Kapitel ist schon veröffentlicht, die Zuordnung lässt sich hier nicht mehr ändern.')}</span>}
              </div>
            )}
            <div className="field">
              <label htmlFor={`sp-${s.id}`}>{t('Person')}</label>
              <select id={`sp-${s.id}`} disabled={!editable} value={mapping[s.id] ?? ''} onChange={(e) => setMapping({ ...mapping, [s.id]: e.target.value })}>
                <option value="">{t('Bitte wählen …')}</option>
                {campaign?.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} · {m.characterName ?? t('Spielleitung')}
                  </option>
                ))}
                {guests.map((g) => <option key={g} value={GUEST + g}>{g} · {t('Gast')}</option>)}
                <option value={IGNORE}>{guests.length ? t('Ignorieren') : t('Gast / ignorieren')}</option>
              </select>
            </div>
            {unsure && <strong style={{ color: 'var(--seal)', fontSize: 'calc(15px * var(--ts))' }}>{t('Nicht automatisch erkannt – bitte auswählen.')}</strong>}
          </div>
        );
      })}

      {speakers?.length === 0 && (
        <div className="empty">{t('Noch keine Stimmen vom Server. Du kannst trotzdem weitermachen.')}</div>
      )}

      {speakers && !review && (
        <button type="button" className="btn" disabled={!complete || busy} onClick={confirm}>
          {busy ? t('Wird gesendet …') : t('Zusammenfassung erstellen')}
        </button>
      )}
      {speakers && review && editable && (
        <button type="button" className="btn" disabled={!complete || !changed || busy} onClick={confirm}>
          {busy ? t('Wird gesendet …') : t('Ändern und Kapitel neu schreiben')}
        </button>
      )}
    </Screen>
  );
}
