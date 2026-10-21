import { confirmDialog } from '../components/confirm';
import { pickReadingText, readingTextsFor } from '../voice/readingTexts';
import { formatDateFull } from '../components/format';
import { getLang, t, tn } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { VoiceProfile as Profile } from '../api/types';
import { IconInfo, IconMic } from '../components/Icons';
import { MicDenied } from '../components/MicDenied';
import { ErrorBox, Screen } from '../components/Screen';
import { createRecorder, fileExtension, type Recorder } from '../recorder/recorder';

const MIN_SECONDS = 20;
const MAX_SECONDS = 40;



type Phase = 'idle' | 'recording' | 'sending';

export function VoiceProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [consent, setConsent] = useState(false);
  const [learn, setLearn] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [redo, setRedo] = useState(false);
  const lang = getLang();
  // Zufälliger Vorlesetext, damit nicht alle immer denselben Text lesen
  const [textIndex, setTextIndex] = useState(() => pickReadingText(lang));
  const readingText = readingTextsFor(lang)[textIndex];
  const recorder = useRef<Recorder | null>(null);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);

  // Pegelanzeige beim Einsprechen (ca. 20 Mal pro Sekunde)
  useEffect(() => {
    if (phase !== 'recording') return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last > 50) {
        const l = recorder.current?.level?.() ?? 0;
        setLevel(l);
        setPeak((p) => Math.max(l, p * 0.96));
        last = ts;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    api.voiceProfile().then(setProfile).catch(setError);
  }, []);

  // Während der Server rechnet, Status nachfragen
  useEffect(() => {
    if (profile?.status !== 'processing') return;
    const t = setTimeout(() => api.voiceProfile().then(setProfile).catch(setError), 2000);
    return () => clearTimeout(t);
  }, [profile]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 'recording' && seconds >= MAX_SECONDS) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, phase]);

  useEffect(() => () => { recorder.current?.stop(); }, []);

  const start = async () => {
    setError(null);
    setMicDenied(false);
    try {
      recorder.current = createRecorder();
      await recorder.current.start();
      setSeconds(0);
      setPhase('recording');
    } catch (e) {
      if (e instanceof Error && e.name === 'NotAllowedError') setMicDenied(true);
      else setError(e);
    }
  };

  const cancel = async () => {
    await recorder.current?.stop();
    recorder.current = null;
    setPhase('idle');
  };

  const finish = async () => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setPhase('sending');
    try {
      const blob = await rec.stop();
      const p = await api.createVoiceProfile(blob, `stimmprofil.${fileExtension(blob.type)}`, learn);
      setProfile(p);
      setRedo(false);
      setConsent(false);
    } catch (e) {
      setError(e);
    } finally {
      setPhase('idle');
    }
  };

  const toggleLearn = async (value: boolean) => {
    try {
      setProfile(await api.updateVoiceProfile(value));
    } catch (e) {
      setError(e);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog(t('Stimmprofil und alles daraus Gelernte endgültig löschen?'), { confirmLabel: t('Löschen'), danger: true }))) return;
    try {
      await api.deleteVoiceProfile();
      setProfile(await api.voiceProfile());
    } catch (e) {
      setError(e);
    }
  };

  const showSetup = profile && (profile.status === 'none' || profile.status === 'failed' || redo);

  return (
    <Screen narrow back overline={t('Freiwillig')} title={t('Mein Stimmprofil')} nav={false}>
      <ErrorBox error={error} />
      {micDenied && <MicDenied />}
      {!profile && !error && <div className="empty">{t('Lade …')}</div>}

      {profile?.status === 'processing' && (
        <div className="card">
          <strong>{t('Stimmprofil wird berechnet')}</strong>
          <div className="muted small">{profile.message ?? t('Das dauert einen Moment. Du kannst die Seite verlassen.')}</div>
        </div>
      )}

      {profile?.status === 'ready' && !redo && (
        <>
          <div className="card">
            <div className="row between">
              <strong>{t('Stimmprofil aktiv')}</strong>
              <span className="pill moss">{t('bereit')}</span>
            </div>
            <div className="muted small">
              {t('Angelegt am {date}.', { date: formatDateFull(profile.createdAt!) })}
              {profile.learnedSessionCount > 0 && ' ' + tn(profile.learnedSessionCount, 'Seitdem aus {n} Session dazugelernt.', 'Seitdem aus {n} Sessions dazugelernt.')}
            </div>
            <div className="muted small">{t('In neuen Aufnahmen wird deine Stimme jetzt auch ohne Vorstellungsrunde erkannt.')}</div>
          </div>
          <label className="check card" style={{ flexDirection: 'row' }}>
            <input type="checkbox" checked={profile.learnFromSessions} onChange={(e) => toggleLearn(e.target.checked)} />
            <span>{t('Aus bestätigten Stimmzuordnungen dazulernen')}</span>
          </label>
          <button type="button" className="btn outline" onClick={() => setRedo(true)}>{t('Neu aufnehmen')}</button>
          <button type="button" className="btn danger outline" onClick={remove}>{t('Stimmprofil löschen')}</button>
        </>
      )}

      {profile?.status === 'failed' && !redo && (
        <div className="error" role="alert">{profile.message ?? t('Das Stimmprofil konnte nicht berechnet werden. Nimm es bitte neu auf.')}</div>
      )}

      {showSetup && phase === 'idle' && (
        <>
          <p style={{ margin: 0 }}>
            {t('Der Server erkennt dich dann in Aufnahmen, auch ohne Vorstellungsrunde. Dafür liest du einmal einen kurzen Text vor.')}
          </p>
          <div className="notice">
            <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
            <span>{t('Ein Stimmabdruck ist ein biometrisches Datum. Gespeichert wird nur er, keine Aufnahme – jederzeit löschbar.')}</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
            <span>{t('Aus bestätigten Stimmzuordnungen dazulernen (empfohlen)')}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t('Ich willige ein, dass mein Stimmabdruck (biometrisches Datum) gespeichert wird.')}</span>
          </label>
          <div className="card recap">
            <div className="row between">
              <span className="overline">{t('Dein Vorlesetext')}</span>
              <button type="button" className="btn ghost small" onClick={() => setTextIndex(pickReadingText(lang, textIndex))}>
                {t('Anderer Text')}
              </button>
            </div>
            <p>{readingText}</p>
          </div>
          <button type="button" className="btn" disabled={!consent} onClick={start}>
            <IconMic size={20} /> {t('Aufnahme starten')}
          </button>
          {redo && <button type="button" className="btn ghost" onClick={() => setRedo(false)}>{t('Abbrechen')}</button>}
        </>
      )}

      {phase === 'recording' && (
        <>
          <p className="muted" style={{ margin: 0 }}>{t('Lies in normaler Lautstärke vor, so wie am Spieltisch.')}</p>
          <div className="card recap">
            <p>{readingText}</p>
          </div>
          <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--paper-sunken)', overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.round(level * 100)}%`, background: level > 0.9 ? 'var(--siegel)' : 'var(--salbei)', transition: 'width 60ms linear' }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.round(peak * 100)}%`, width: 2, background: 'var(--ink-muted)' }} />
            </div>
            <span className="muted small">
              {peak < 0.12 ? t('Etwas lauter oder näher ans Handy.') : level > 0.9 ? t('Etwas leiser – es übersteuert.') : t('Pegel passt.')}
            </span>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={seconds} aria-valuemin={0} aria-valuemax={MIN_SECONDS}>
            <div style={{ width: `${Math.min(100, (seconds / MIN_SECONDS) * 100)}%`, background: seconds >= MIN_SECONDS ? 'var(--moss)' : undefined }} />
          </div>
          <div className="muted small" style={{ textAlign: 'center' }}>
            {seconds < MIN_SECONDS ? t('Noch mindestens {n} Sekunden', { n: MIN_SECONDS - seconds }) : t('Lang genug – beende, wenn du fertig bist.')}
          </div>
          <button type="button" className="btn" disabled={seconds < MIN_SECONDS} onClick={finish}>{t('Fertig')}</button>
          <button type="button" className="btn outline" onClick={cancel}>{t('Abbrechen')}</button>
        </>
      )}

      {phase === 'sending' && <div className="empty">{t('Wird gesendet …')}</div>}
    </Screen>
  );
}
