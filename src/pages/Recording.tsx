import { setRecordingActive } from '../recorder/activity';
import { cloudUse, useServerInfo } from '../components/CloudNotice';
import { isDeletedMember } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { brandMarkShapes } from '../components/Wordmark';
import { currentConnection, p } from '../api/connections';
import { Avatar } from '../components/Avatar';
import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Attendee, Member } from '../api/types';
import { blobFile, uploadSessionAudio, type UploadFile } from '../api/upload';
import { ConsentHandover } from '../components/ConsentHandover';
import { IconCheck, IconMic } from '../components/Icons';
import { CONSENT_ON_SITE } from '../consent';
import { ErrorBox, Screen, rememberCampaign } from '../components/Screen';
import { useAsync } from '../components/useAsync';
import { BackgroundRecorder, hasNativeRecorder, nativeUploadFiles, type NativeStatus } from '../recorder/native';
import { createRecorder, fileExtension, type Recorder } from '../recorder/recorder';
import { leftoverRecordings, loadRecording, removeRecording, type StoredRecording } from '../recorder/webStore';

const native = hasNativeRecorder();

// Einfarbiges Zeichen aus den Markendateien; fehlt es, bleibt einfach das Mikrofon
// Inverse Fassung = Original für dunklen Grund: Körper hell (hier Pergament), Lesezeichen im hellen Siegelrot
const MARK = brandMarkShapes('taleward-mark-inverse.svg');

type Phase = 'prepare' | 'recording' | 'uploading';

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

const who = (m: Member) => `${m.displayName} · ${m.characterName ?? t('Spielleitung')}`;

export function Recording() {
  const { campaignId = '' } = useParams();
  const navigate = useNavigate();
  const { data: campaign, error: loadError } = useAsync(() => api.campaign(campaignId), [campaignId]);

  const [present, setPresent] = useState<Record<string, boolean>>({});
  // Vor Ort selbst bestätigte Zustimmungen (Mitglied ohne App-Zustimmung) und Gäste ohne Konto
  const [onSite, setOnSite] = useState<Record<string, string>>({});
  const [guests, setGuests] = useState<{ name: string; consentAt: string }[]>([]);
  const [guestName, setGuestName] = useState('');
  const serverInfo = useServerInfo();
  const [addingGuest, setAddingGuest] = useState(false);
  const [handover, setHandover] = useState<{ memberId?: string; name: string } | null>(null);
  const [phase, setPhase] = useState<Phase>('prepare');
  // Zurück-Taste warnt, solange aufgenommen wird
  useEffect(() => {
    setRecordingActive(phase === 'recording');
    return () => setRecordingActive(false);
  }, [phase]);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [discordFiles, setDiscordFiles] = useState<{ file: File; memberId: string }[]>([]);
  const [leftover, setLeftover] = useState<NativeStatus | null>(null);
  // Browser: Aufnahme aus dem Zwischenspeicher des Geräts, die noch nicht hochgeladen ist
  const [webLeftover, setWebLeftover] = useState<StoredRecording | null>(null);
  const [batteryOk, setBatteryOk] = useState(true);

  const recorder = useRef<Recorder | null>(null);
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    if (!campaign) return;
    rememberCampaign(campaign);
    setPresent(Object.fromEntries(campaign.members.filter((m) => !isDeletedMember(m)).map((m) => [m.id, true])));
  }, [campaign]);

  // Web: Zeit selbst zählen. Nativ: Zustand vom Aufnahmedienst holen (auch Pause über die Benachrichtigung)
  useEffect(() => {
    if (phase !== 'recording') return;
    if (!native) {
      if (paused) return;
      const t = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => clearInterval(t);
    }
    const t = setInterval(async () => {
      const st = await BackgroundRecorder.getStatus();
      if (st.state === 'recording' || st.state === 'paused') {
        setElapsed(Math.floor(st.elapsedMs / 1000));
        setPaused(st.state === 'paused');
      } else if (st.state === 'stopped') {
        // Dienst wurde beendet (z. B. vom System) – Aufnahme bleibt erhalten
        setPhase('prepare');
        setLeftover(st);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase, paused]);

  // Nativ: laufende oder liegengebliebene Aufnahme wiederfinden, Akku-Einstellung prüfen
  useEffect(() => {
    if (!native) return;
    BackgroundRecorder.getStatus().then((st) => {
      if ((st.state === 'recording' || st.state === 'paused') && st.sessionId) {
        sessionId.current = st.sessionId;
        setElapsed(Math.floor(st.elapsedMs / 1000));
        setPaused(st.state === 'paused');
        setPhase('recording');
      } else if (st.state === 'stopped') {
        setLeftover(st);
      }
    });
    BackgroundRecorder.isIgnoringBatteryOptimizations().then((r) => setBatteryOk(r.value));
    const onFocus = () => BackgroundRecorder.isIgnoringBatteryOptimizations().then((r) => setBatteryOk(r.value));
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  // Browser: nach Absturz, geschlossenem Fenster oder gescheitertem Hochladen liegengebliebene Aufnahme finden
  useEffect(() => {
    if (native) return;
    leftoverRecordings(currentConnection().id).then((list) => setWebLeftover(list[0] ?? null)).catch(() => undefined);
  }, []);

  // Browser: Verlässt jemand die Seite während der Aufnahme (z. B. Zurück), Aufnahme sauber beenden – sie bleibt im
  // Gerät und wird beim nächsten Öffnen zum Hochladen angeboten
  useEffect(() => () => {
    const r = recorder.current;
    recorder.current = null;
    if (r && r.state !== 'idle') r.stop().catch(() => undefined);
  }, []);

  // Browser: Schließen des Fensters während der Aufnahme nachfragen (der Ton bis hierher bleibt trotzdem im Gerät)
  useEffect(() => {
    if (native || phase !== 'recording') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  if (loadError) return <Screen narrow title={t('Aufnahme')}><ErrorBox error={loadError} /></Screen>;
  if (!campaign) return <Screen narrow title={t('Aufnahme')}><div className="empty">{t('Lade …')}</div></Screen>;

  if (campaign.myRole !== 'gm') {
    return (
      <Screen narrow overline={campaign.title} title={t('Aufnahme')}>
        <div className="empty">{t('Aufnahmen startet die SL. Das Kapitel findest du danach in der Chronik.')}</div>
      </Screen>
    );
  }

  const presentMembers = campaign.members.filter((m) => present[m.id]);
  const cloud = cloudUse(serverInfo, campaign);
  const hasConsent = (m: Member) => !!m.recordingConsentAt || !!onSite[m.id];
  const missing = presentMembers.filter((m) => !hasConsent(m));
  const allConsented = presentMembers.length + guests.length > 0 && missing.length === 0;
  const attendees: Attendee[] = [
    ...presentMembers.map((m): Attendee =>
      m.recordingConsentAt
        ? { memberId: m.id, consent: true, consentSource: 'app' }
        : { memberId: m.id, consent: !!onSite[m.id], consentSource: 'on_site', consentAt: onSite[m.id] ?? null }
    ),
    ...guests.map((g): Attendee => ({ guestName: g.name, consent: true, consentSource: 'on_site', consentAt: g.consentAt }))
  ];

  const confirmHandover = () => {
    if (!handover) return;
    const at = new Date().toISOString();
    if (handover.memberId) setOnSite({ ...onSite, [handover.memberId]: at });
    else setGuests([...guests, { name: handover.name, consentAt: at }]);
    setGuestName('');
    setAddingGuest(false);
    setHandover(null);
  };

  const ensureSession = async () => {
    if (sessionId.current) return sessionId.current;
    const s = await api.createSession(campaignId, new Date().toISOString(), attendees);
    sessionId.current = s.id;
    return s.id;
  };

  /** storedId: Aufnahme im Zwischenspeicher des Browsers – nach erfolgreichem Hochladen löschen, sonst wieder anbieten */
  const upload = async (source: 'table' | 'discord', files: UploadFile[], existingSessionId?: string, storedId?: string | null) => {
    setPhase('uploading');
    setProgress(0);
    setError(null);
    try {
      const id = existingSessionId ?? (await ensureSession());
      await uploadSessionAudio(id, source, files, setProgress);
      if (native && existingSessionId) await BackgroundRecorder.discard({ sessionId: id }).catch(() => undefined);
      if (storedId) await removeRecording(storedId).catch(() => undefined);
      navigate(p(`/s/${id}`), { replace: true });
    } catch (e) {
      const kept = storedId ? (await leftoverRecordings(currentConnection().id).catch(() => [])).find((r) => r.id === storedId) : undefined;
      setError(new Error(
        (e instanceof Error ? e.message + ' ' : '') +
        (native && existingSessionId ? t('Die Aufnahme bleibt auf dem Handy gespeichert, du kannst es später erneut versuchen.')
          : kept ? t('Die Aufnahme bleibt in diesem Browser gespeichert, du kannst es später erneut versuchen.') : '')
      ));
      if (native && existingSessionId) {
        const st = await BackgroundRecorder.getStatus();
        if (st.state === 'stopped') setLeftover(st);
      }
      if (kept) setWebLeftover(kept);
      setPhase('prepare');
    }
  };

  const uploadLeftover = (st: NativeStatus) => {
    setLeftover(null);
    upload('table', nativeUploadFiles(st.files), st.sessionId);
  };

  const discardLeftover = async (st: NativeStatus) => {
    if (!(await confirmDialog(t('Diese Aufnahme endgültig vom Handy löschen?'), { confirmLabel: t('Löschen'), danger: true }))) return;
    await BackgroundRecorder.discard({ sessionId: st.sessionId! });
    setLeftover(null);
  };

  const uploadWebLeftover = async (r: StoredRecording) => {
    setWebLeftover(null);
    const blob = await loadRecording(r);
    upload('table', [blobFile(blob, `aufnahme.${fileExtension(blob.type)}`)], r.sessionId, r.id);
  };

  const discardWebLeftover = async (r: StoredRecording) => {
    if (!(await confirmDialog(t('Diese Aufnahme endgültig aus diesem Browser löschen?'), { confirmLabel: t('Löschen'), danger: true }))) return;
    await removeRecording(r.id);
    setWebLeftover((await leftoverRecordings(currentConnection().id).catch(() => []))[0] ?? null);
  };

  // Eine liegengebliebene Aufnahme – vom Handy (Android-App) oder aus dem Browser
  const pending = leftover
    ? { title: leftover.title, elapsedMs: leftover.elapsedMs, bytes: leftover.files.reduce((n, f) => n + f.sizeBytes, 0), error: leftover.error,
        upload: () => uploadLeftover(leftover), discard: () => discardLeftover(leftover) }
    : webLeftover
      ? { title: webLeftover.title, elapsedMs: webLeftover.elapsedMs, bytes: webLeftover.bytes, error: undefined,
          upload: () => uploadWebLeftover(webLeftover), discard: () => discardWebLeftover(webLeftover) }
      : null;

  const start = async () => {
    setError(null);
    try {
      const id = await ensureSession();
      if (native) {
        await BackgroundRecorder.start({
          sessionId: id,
          title: campaign.title,
          labels: [t('Aufnahme läuft'), t('Aufnahme pausiert'), t('Pausieren'), t('Fortsetzen')]
        });
      } else {
        recorder.current = createRecorder({ connId: currentConnection().id, sessionId: id, campaignId, title: campaign.title });
        await recorder.current.start();
      }
      setElapsed(0);
      setPaused(false);
      setPhase('recording');
    } catch (e) {
      setError(e instanceof Error && (e.name === 'NotAllowedError' || (e as { code?: string }).code === 'NotAllowedError')
        ? new Error(t('Kein Zugriff aufs Mikrofon. Erlaube ihn in den App-Einstellungen.'))
        : e);
    }
  };

  const togglePause = async () => {
    if (native) {
      const st = paused ? await BackgroundRecorder.resume() : await BackgroundRecorder.pause();
      setPaused(st.state === 'paused');
      return;
    }
    if (!recorder.current) return;
    if (paused) recorder.current.resume();
    else recorder.current.pause();
    setPaused(!paused);
  };

  const stop = async () => {
    if (!(await confirmDialog(t('Aufnahme beenden und hochladen?'), { confirmLabel: t('Beenden und hochladen'), cancelLabel: t('Weiter aufnehmen') }))) return;
    if (native) {
      const st = await BackgroundRecorder.stop();
      if (st.state !== 'stopped' || !st.sessionId) {
        setError(new Error(t('Die Aufnahme enthält keine Daten.')));
        setPhase('prepare');
        return;
      }
      await upload('table', nativeUploadFiles(st.files), st.sessionId);
      return;
    }
    if (!recorder.current) return;
    const storedId = recorder.current.storedId;
    const blob = await recorder.current.stop();
    recorder.current = null;
    await upload('table', [blobFile(blob, `aufnahme.${fileExtension(blob.type)}`)], undefined, storedId);
  };

  const pickFile = (file: File | undefined) => {
    if (file) upload('table', [blobFile(file, file.name)]);
  };

  const pickDiscord = (files: FileList | null) => {
    if (!files) return;
    setDiscordFiles(
      Array.from(files).map((file) => {
        // Craig benennt Spuren nach Discord-Namen – passenden Namen vorschlagen
        const guess = presentMembers.find((m) => file.name.toLowerCase().includes(m.displayName.toLowerCase()));
        return { file, memberId: guess?.id ?? '' };
      })
    );
  };

  const titleForPhase = phase === 'recording' ? t('Aufnahme läuft') : phase === 'uploading' ? t('Wird hochgeladen') : t('Neues Kapitel aufnehmen');

  return (
    <Screen narrow overline={campaign.title} title={titleForPhase} nav={phase === 'prepare'} hero={{ campaign }}>
      <ErrorBox error={error} />

      {phase === 'prepare' && pending && (
        <div className="card warn">
          <h2>{t('Aufnahme noch nicht hochgeladen')}</h2>
          <div className="muted small">
            {t('{title}: {time} aufgenommen, {mb} MB.', {
              title: pending.title ?? t('Runde'),
              time: formatTime(Math.floor(pending.elapsedMs / 1000)),
              mb: Math.max(1, Math.round(pending.bytes / 1e6))
            })}
            {pending.error ? ' ' + t('Grund für den Abbruch: {reason}', { reason: pending.error }) : ''}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn small" style={{ flex: 1 }} onClick={pending.upload}>{t('Jetzt hochladen')}</button>
            <button type="button" className="btn small outline" style={{ flex: 1 }} onClick={pending.discard}>{t('Verwerfen')}</button>
          </div>
        </div>
      )}

      {phase === 'prepare' && !native && /Android|iPhone|iPad/i.test(navigator.userAgent) && (
        <div className="notice">{t('Im Browser stoppt die Aufnahme, wenn der Bildschirm ausgeht. Für lange Runden am Handy die Android-App nutzen.')}</div>
      )}
      {phase === 'prepare' && native && !batteryOk && (
        <div className="notice" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{t('Akku-Optimierung ist an – die Aufnahme kann abbrechen.')}</span>
          <button type="button" className="btn small outline" onClick={() => BackgroundRecorder.requestIgnoreBatteryOptimizations()}>
            {t('Ausschalten')}
          </button>
        </div>
      )}

      {phase === 'prepare' && (
        <>
          <section className="card" style={{ gap: 0 }}>
            <div className="row between" style={{ marginBottom: 4 }}>
              <h2>{t('Am Tisch')}</h2>
              <span className="muted small">{t('{ready} von {total} bereit', { ready: presentMembers.length - missing.length + guests.length, total: presentMembers.length + guests.length })}</span>
            </div>
            {campaign.members.filter((m) => !isDeletedMember(m)).map((m) => (
              <div key={m.id} className="row" style={{ minHeight: 56, gap: 10, borderTop: '1px solid var(--line)' }}>
                <label className="check" style={{ flex: 1, minWidth: 0, gap: 10 }}>
                  <input type="checkbox" checked={!!present[m.id]} aria-label={t('{name} ist da', { name: m.displayName })}
                    onChange={(e) => setPresent({ ...present, [m.id]: e.target.checked })} />
                  <Avatar campaignId={campaign.id} member={m} size={32} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, opacity: present[m.id] ? 1 : 0.5 }}>
                    <span>{m.displayName}</span>
                    <span className="muted small">{m.characterName ?? t('Spielleitung')}</span>
                  </span>
                </label>
                {present[m.id] && (hasConsent(m)
                  ? <span className="pill moss"><IconCheck /> {t('Zugestimmt')}</span>
                  : <button type="button" className="btn small outline" onClick={() => setHandover({ memberId: m.id, name: m.displayName })}>
                      {t('Zustimmen lassen')}
                    </button>)}
              </div>
            ))}
            {guests.map((g) => (
              <div key={g.name} className="row" style={{ minHeight: 56, gap: 10, borderTop: '1px solid var(--line)' }}>
                <span style={{ flex: 1 }}>{g.name} <span className="muted small">· {t('Gast')}</span></span>
                <span className="pill moss"><IconCheck /> {t('Zugestimmt')}</span>
                <button type="button" className="btn small danger outline" aria-label={t('{name} entfernen', { name: g.name })}
                  onClick={() => setGuests(guests.filter((x) => x !== g))}>×</button>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              {addingGuest ? (
                <div className="row" style={{ gap: 8 }}>
                  <input type="text" aria-label={t('Name des Gasts')} placeholder={t('Name des Gasts')} value={guestName} autoFocus onChange={(e) => setGuestName(e.target.value)} />
                  <button type="button" className="btn small" disabled={!guestName.trim() || guests.some((g) => g.name === guestName.trim())}
                    onClick={() => setHandover({ name: guestName.trim() })}>
                    {t('Weiter')}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn small quiet" onClick={() => setAddingGuest(true)}>+ {t('Gast')}</button>
              )}
            </div>
          </section>

          {missing.length > 0 && (
            <p className="small" style={{ margin: 0, color: 'var(--siegel-text)', fontWeight: 500 }}>
              {t('Es fehlt noch: {names}.', { names: missing.map((m) => m.displayName).join(', ') })}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <button type="button" className="rec-button" disabled={!allConsented} onClick={start} aria-label={t('Aufnahme starten')}>
              <IconMic size={48} />
            </button>
            <div className="muted small" style={{ textAlign: 'center' }}>
              {allConsented ? t('Aufnahme starten') : t('Wartet auf alle Zustimmungen')}
            </div>
            <div className="muted small" style={{ textAlign: 'center' }}>{t('Tipp: Zu Beginn sagt jede Person Name und Charakter.')}</div>
            {cloud.transcription?.primary && (
              <div className="small" style={{ textAlign: 'center', fontWeight: 500 }}>
                {t('Diese Aufnahme wird über {provider} transkribiert.', { provider: cloud.transcription.provider })}
              </div>
            )}
          </div>

          <details className="card">
            <summary style={{ fontWeight: 700 }}>{t('Vorhandene Aufnahme hochladen')}</summary>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="file-table">{t('Tischaufnahme (eine Datei)')}</label>
              <input id="file-table" type="file" accept="audio/*" disabled={!allConsented} onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="file-discord">{t('Discord-Spuren (eine Datei pro Person)')}</label>
              <input id="file-discord" type="file" accept="audio/*" multiple disabled={!allConsented} onChange={(e) => pickDiscord(e.target.files)} />
            </div>
            {discordFiles.map((d, i) => (
              <div key={d.file.name} className="field">
                <label htmlFor={`df-${i}`}>{d.file.name}</label>
                <select
                  id={`df-${i}`}
                  value={d.memberId}
                  onChange={(e) => setDiscordFiles(discordFiles.map((x, j) => (j === i ? { ...x, memberId: e.target.value } : x)))}
                >
                  <option value="">{t('Person wählen …')}</option>
                  {presentMembers.map((m) => <option key={m.id} value={m.id}>{who(m)}</option>)}
                </select>
              </div>
            ))}
            {discordFiles.length > 0 && (
              <button
                type="button"
                className="btn small"
                disabled={discordFiles.some((d) => !d.memberId)}
                onClick={() => upload('discord', discordFiles.map((d) => blobFile(d.file, d.file.name, d.memberId)))}
              >
                {t('Spuren hochladen')}
              </button>
            )}
            {!allConsented && <p className="muted small" style={{ margin: 0 }}>{t('Auch dafür müssen alle zugestimmt haben.')}</p>}
          </details>
        </>
      )}

      {phase === 'recording' && (
        <>
          {/* Großer Knopf in der Mitte – aus der Entfernung am Tisch erkennbar */}
          <div style={{ flex: 1, minHeight: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <button type="button" className={paused ? 'rec-button big' : 'rec-button big recording'} onClick={togglePause}
              aria-label={paused ? t('Aufnahme fortsetzen') : t('Aufnahme pausieren')}>
              {/* Läuft: Mikrofon und Taleward-Zeichen (einfarbig weiß) wechseln sich im Takt des Pulsierens ab */}
              <span className="rec-swap" aria-hidden>
                {/* Mikrofon als Linien, die sich „wegzeichnen“ und wieder erscheinen */}
                <svg className="rec-mic" viewBox="0 0 24 24" width="112" height="112" fill="none" stroke="currentColor"
                  strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path pathLength={1} d="M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z" />
                  <path pathLength={1} d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <path pathLength={1} d="M12 19v3" />
                </svg>
                {/* Zeichen: erst die Umrisse als Linien, dann füllt es sich – wie das Mikrofon, nur umgekehrt */}
                {!paused && MARK && (
                  <svg className="rec-mark" viewBox="0 0 512 512" width="128" height="128">
                    <svg x="0" y="0" width="512" height="512" viewBox={MARK.viewBox}>
                      <g transform={MARK.transform}>
                        {MARK.paths.map((p, i) => (
                          <g key={i}>
                            <path className="mk-fill" d={p.d} fill={i === 0 ? 'currentColor' : p.fill} />
                            <path className="mk-line" d={p.d} fill="none" stroke={i === 0 ? 'currentColor' : p.fill} strokeWidth={1.6}
                              vectorEffect="non-scaling-stroke" pathLength={1} strokeLinecap="round" strokeLinejoin="round" />
                          </g>
                        ))}
                      </g>
                    </svg>
                  </svg>
                )}
              </span>
            </button>
            <div className="rec-time big">{formatTime(elapsed)}</div>
            <div className="muted">{paused ? t('Pausiert – tippen zum Fortsetzen') : t('Tippen für eine Pause')}</div>
          </div>
          <button type="button" className="btn" onClick={stop}>
            {t('Beenden und hochladen')}
          </button>
          <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
            {native ? t('Läuft auch bei ausgeschaltetem Bildschirm weiter.') : t('Im Browser: App geöffnet lassen.')}
          </p>
        </>
      )}

      {phase === 'uploading' && (
        <div className="card">
          <div className="row between">
            <strong>{t('Aufnahme wird hochgeladen')}</strong>
            <span className="muted">{Math.round(progress * 100)} %</span>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="muted small" style={{ margin: 0 }}>{t('Bricht die Verbindung ab, geht es danach von selbst weiter.')}</p>
        </div>
      )}
      {handover && (
        <ConsentHandover
          name={handover.name}
          text={CONSENT_ON_SITE(campaign.title, { retention: serverInfo?.audioRetention, cloudProvider: cloud.transcription?.provider ?? null, summaryProvider: cloud.summary?.provider ?? null })}
          onConsent={confirmHandover}
          onCancel={() => setHandover(null)}
        />
      )}
    </Screen>
  );
}
