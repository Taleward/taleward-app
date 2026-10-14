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

  const play = async (speakerId: string) => {
    try {
      // Hörprobe mit Token laden, dann lokal abspielen
      let blob: Blob;
      try {
        blob = await api.speakerSample(sessionId, speakerId);
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
  const autoCount = speakers?.filter((s) => s.source === 'intro_round' || s.source === 'voice_match').length ?? 0;

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
            <div className="row">
              <button type="button" className="icon-btn" aria-label={t('Hörprobe {label} abspielen', { label: s.label })} onClick={() => play(s.id)}>
                <IconPlay />
              </button>
              <div style={{ flex: 1 }}>
                <div className="card-title">{s.label}</div>
                <div className="quote">{s.sampleText}</div>
                {s.source === 'voice_match' && <div className="muted small">{t('Über Stimmprofil erkannt')}</div>}
                {s.source === 'intro_round' && <div className="muted small">{t('Aus der Vorstellungsrunde')}</div>}
                {!review && s.suggestedMemberId && s.confidence < 0.8 && mapping[s.id] === s.suggestedMemberId && (
                  <div className="small" style={{ color: 'var(--siegel-text)', fontWeight: 500 }}>{t('Unsicher – bitte prüfen.')}</div>
                )}
              </div>
            </div>
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
            {unsure && <strong style={{ color: 'var(--seal)', fontSize: 15 }}>{t('Nicht automatisch erkannt – bitte auswählen.')}</strong>}
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
