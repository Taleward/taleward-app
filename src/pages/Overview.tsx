import { VoiceProfileHint } from '../components/VoiceProfileHint';
import { Tour } from '../tour/Tour';
import { cloudUse, providerLabel, useServerInfo } from '../components/CloudNotice';
import { AnalysisPendingCard, AnalysisSwitch } from '../components/CharacterAnalysis';
import { DataSummary } from '../components/DataSummary';
import { NowList, type NowItem } from '../components/NowList';
import { PrepCard } from '../components/PrepCard';
import { useTermsNotice } from '../components/Terms';
import { prepWhen } from '../prep/prep';
import { isDeletedMember } from '../api/types';
import { LockNote, SettingsLog, useCampaignSettings } from '../components/CampaignSettings';
import { PayerSection } from '../billing/PayerSection';
import { InviteBox } from '../components/InviteBox';
import { confirmDialog } from '../components/confirm';
import { PENDING_LABEL } from './Chronicle';
import { GameSystemFields, systemLabel } from '../components/GameSystemFields';
import { apiAtLeast, currentConnection, p } from '../api/connections';
import { isMusterUrl } from '../api/muster';
import { MemberJoinedCard, OpenSeatDialog, OrphanNoticeCard, SeatClaimedCard } from '../components/Seats';
import { characterIncomplete } from '../components/CharacterForm';
import { Avatar } from '../components/Avatar';
import { hasCover } from '../covers/CampaignCover';
import { CoverPicker } from '../covers/CoverPicker';
import { getLang, t, tn } from '../i18n';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Campaign, CharacterAnalysis, GameSystem, GmNotice, Member, ServerInfo, SessionSummary, Usage } from '../api/types';
import { IconCheck, IconInfo, IconLock, IconPencil, IconScreen } from '../components/Icons';
import { LinkButtons, safeLinks } from '../components/Links';
import { MusterBanner } from '../components/Muster';
import { EmailNudge } from '../components/EmailNudge';
import { Divider, ErrorBox, Screen, rememberCampaign } from '../components/Screen';
import { formatDateFull, formatDateTime } from '../components/format';
import { CONSENT_STANDING, CONSENT_SUMMARY } from '../consent';

/** Startseite einer Kampagne: Stand, Welt-Hintergrund, Mitspielende, Einladen. */
const needsMe = (state: SessionSummary['state']) => state === 'awaiting_speakers' || state === 'awaiting_review' || state === 'failed';

export function Overview() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pickingCover, setPickingCover] = useState(false);
  // Für die Zeile „… möchte den Hintergrund von … auswerten lassen“ in „Jetzt dran“
  const [analyses, setAnalyses] = useState<CharacterAnalysis[]>([]);

  const load = async () => {
    try {
      const [c, s] = await Promise.all([api.campaign(campaignId), api.sessions(campaignId)]);
      rememberCampaign(c);
      setCampaign(c);
      setSessions(s);
    } catch (e) {
      setError(e);
    }
  };

  useEffect(() => {
    setCampaign(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const gm = campaign?.myRole === 'gm';
  const wantsAnalyses = gm && apiAtLeast('0.4.18') && !!campaign?.gmNotices?.some((n) => n.code === 'character_analysis_pending');
  useEffect(() => {
    if (!wantsAnalyses) return;
    api.characterAnalyses(campaignId).then(setAnalyses).catch(() => undefined);
  }, [campaignId, wantsAnalyses, campaign]);
  const { user } = useAuth();
  // Neue Nutzungsbedingungen (ab 0.4.22): hier als Zeile in „Jetzt dran“, die Karte selbst steht auf der Kampagnenliste
  const termsNotice = useTermsNotice(currentConnection());
  const me = campaign?.members.find((m) => m.userId === user?.id);
  const serverInfo = useServerInfo();
  const pending = sessions?.filter((s) => s.state !== 'published') ?? [];
  const needMe = pending.filter((s) => needsMe(s.state));
  const working = pending.filter((s) => !needsMe(s.state));
  // Gerade aus einer Umzugsdatei übernommen: einmal sagen, wie es hier weitergeht
  const imported = !!(useLocation().state as { imported?: boolean } | null)?.imported;
  const latest = sessions?.find((s) => s.state === 'published');
  // Vorbereitung auf die nächste Runde (nur SL, sobald ein Termin steht); am Spieltag ganz oben
  const prep = gm && campaign && !campaign.archivedAt && sessions ? prepWhen(campaign.nextSessionAt, new Date()) : 'none';
  const prepCard = prep !== 'none' && campaign && sessions ? <PrepCard campaign={campaign} sessions={sessions} phase={prep} /> : null;

  return (
    <Screen backTo={{ to: '/', label: t('Alle Kampagnen') }} overline={gm ? t('Du leitest') : campaign?.myCharacterName ? t('Du spielst {name}', { name: campaign.myCharacterName }) : ' '} title={campaign?.title ?? ' '} hero={{ campaign, large: true }}>
      <ErrorBox error={error} />
      {!campaign && !error && <div className="empty">{t('Lade …')}</div>}

      {campaign && (
        <>
          {gm && !pickingCover && !campaign.archivedAt && (
            <div className="overview-tools" style={{ marginTop: hasCover(campaign) ? -6 : 0 }}>
              <Link className="btn small accent" to={p(`/k/${campaignId}/tisch`)} data-tour="schirm"><IconScreen /> {t('SL-Schirm')}</Link>
            </div>
          )}
          {gm && pickingCover && <CoverPicker campaign={campaign} onChanged={setCampaign} onClose={() => setPickingCover(false)} />}

          {(campaign.description || systemLabel(campaign.system, campaign.systemName)) && (
            <p className="muted" style={{ margin: 0 }}>
              {systemLabel(campaign.system, campaign.systemName) && <strong>{systemLabel(campaign.system, campaign.systemName)}</strong>}
              {systemLabel(campaign.system, campaign.systemName) && campaign.description ? ' · ' : ''}
              {campaign.description}
            </p>
          )}

          <MusterBanner />
          <EmailNudge conn={currentConnection()} />
          {campaign.archivedAt && (
            <div className="notice"><strong>{t('Abgeschlossen')}</strong>&nbsp;{t('– nur noch zum Nachlesen, keine neuen Kapitel.')}</div>
          )}
          <div className="split">
          <div className="a">
          {/* Zuerst, was jetzt zu tun ist: Zustimmung (nur wenn sie fehlt), Charakter, offenes Kapitel, Termin, neuer Recap */}
          {gm && imported && (
            <div className="notice" role="status" style={{ flexDirection: 'column', gap: 4 }}>
              <strong>{t('Die Kampagne ist umgezogen.')}</strong>
              <span className="small">{t('Hier braucht jede Person ein eigenes Konto und stimmt neu zu. Cloud-Freigaben und Stimmprofile richtet ihr neu ein.')}</span>
            </div>
          )}
          {/* Frische Kampagne der SL: „So fängst du an“ trägt den Hauptknopf, die eigene Zustimmung steht ruhiger daneben */}
          {me && !me.recordingConsentAt && <RecordingConsent campaign={campaign} onChanged={load} quiet={gm && sessions?.length === 0} />}
          {gm && sessions?.length === 0 && <FirstSteps campaign={campaign} onCover={() => { setPickingCover(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
          {prep === 'today' && prepCard}
          <NowList items={[
            ...(termsNotice ? [{ key: 'terms', label: t('Neue Nutzungsbedingungen bei „{name}“', { name: currentConnection().name }), detail: termsNotice, hideDetailTitle: true }] : []),
            ...nowItems(campaign, me, gm, needMe, serverInfo, analyses, load)
          ]} />

          {/* Stand der Kampagne: Der Server arbeitet gerade (keine Aufgabe, nur zur Info) */}
          {gm && working.length > 0 && needMe.length === 0 && (
            <Link to={p(`/s/${working[0].id}`)} className="card">
              <div className="row between">
                <strong>{t('Kapitel {n}', { n: working[0].number })}</strong>
                <span className="pill">
                  {PENDING_LABEL[working[0].state] ? t(PENDING_LABEL[working[0].state]!) : working[0].state}
                </span>
              </div>
              <span className="muted small">
                {t('Der Server arbeitet. Tippen für den Fortschritt.')}
                {working.length > 1 ? ' ' + t('Insgesamt {n} Kapitel in Arbeit.', { n: working.length }) : ''}
              </span>
            </Link>
          )}
          {prep === 'upcoming' && prepCard}
          {/* Nächste Runde – fehlt die eigene Stimme ohne festen Termin, steht es schon in „Jetzt dran“; die
              Vorbereitung der SL nennt den Termin selbst */}
          {prep === 'none' && !(campaign.datePollNeedsMyVote && !campaign.nextSessionAt) && (
          <Link to={p(`/k/${campaignId}/termin`)} className="card">
            <span className="overline">{t('Nächste Runde')}</span>
            {campaign.nextSessionAt
              ? <strong style={{ fontFamily: 'var(--display)', fontSize: 'calc(19px * var(--ts))' }}>{formatDateTime(campaign.nextSessionAt)}</strong>
              : <strong>{campaign.datePollNeedsMyVote ? t('Terminabstimmung läuft') : t('Noch kein Termin')}</strong>}
            <span className="muted small">
              {campaign.datePollNeedsMyVote ? t('Sag, welche Termine dir passen.') : gm ? t('Termin abstimmen oder Stand ansehen') : t('Terminabstimmung ansehen')}
            </span>
          </Link>
          )}


          {latest && (
            <Link to={p(`/s/${latest.id}/recap`)} className="card">
              <div className="row between">
                <span className="overline">{t('Zuletzt gespielt')} · {t('Kapitel {n}', { n: latest.number })}</span>
                {!!campaign.unread?.recaps && <span className="pill seal">{t('Neu')}</span>}
              </div>
              <strong>{latest.title ?? t('Kapitel {n}', { n: latest.number })}</strong>
              <span className="muted small">
                {t('Kapitel lesen')}
                {!!latest.unreadComments && ` · ${tn(latest.unreadComments, '{n} neuer Kommentar', '{n} neue Kommentare')}`}
              </span>
            </Link>
          )}
          {/* Die SL hat dafür „So fängst du an“ */}
          {sessions?.length === 0 && !gm && (
            <div className="notice">
              <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
              <span>{t('Noch kein Kapitel veröffentlicht.')}</span>
            </div>
          )}

          {/* Cloud steht unter „Kampagne verwalten → Deine Daten“ und bei der Aufnahme; findbar reicht (Benjamin 28.10.) */}
          {/* Spielende sehen „Die Welt“ erst, wenn die SL etwas eingetragen hat */}
          {(gm || !!campaign.worldInfo?.trim() || safeLinks(campaign.links).some((l) => l.shared)) && <Divider />}
          {safeLinks(campaign.links).some((l) => l.shared) && (
            <section className="overview-links" aria-labelledby="group-links">
              <span className="overline" id="group-links">{t('Links der Gruppe')}</span>
              <LinkButtons links={(campaign.links ?? []).filter((l) => l.shared)} compact />
            </section>
          )}
          {(gm || !!campaign.worldInfo?.trim()) && <div id="world"><WorldInfo campaign={campaign} onSaved={setCampaign} /></div>}
          </div>

          <div className="b">
          <Divider />
          {/* Stimmprofil ist freiwillig: erst wenn die Zustimmung steht und (bei der SL) die erste Runde aufgenommen ist */}
          <Members campaign={campaign} onChanged={load} voiceHint={!!me?.recordingConsentAt && !(gm && sessions?.length === 0)} />

          {me && <CampaignManage campaign={campaign} me={me} info={serverInfo} onChanged={load} onPickCover={() => {
            setPickingCover(true);
            document.querySelector('.screen-main')?.scrollTo({ top: 0, behavior: 'smooth' });
          }} />}
          </div>
          </div>
          {/* Einmal je Gerät und Rolle: kurz zeigen, wo was ist (nicht in abgeschlossenen Kampagnen) */}
          {!campaign.archivedAt && <Tour role={gm ? 'gm' : 'player'} />}
        </>
      )}
    </Screen>
  );
}

/** „Wer war das?“ – schmales Suchfeld oben, springt in die Bibel (fehlertolerant, siehe search/fuzzy.ts) */
/**
 * „So fängst du an“ (SL, solange es kein Kapitel gibt): die Reihenfolge bis zum ersten Kapitel – einladen, Welt
 * (freiwillig), erste Runde aufnehmen. Der nächste offene Schritt ist der Hauptknopf; Titelbild als leiser Link darunter.
 * Verschwindet mit dem ersten Kapitel oder über „Ausblenden“. Antwort auf „Ich wusste nicht, wo ich anfangen soll“.
 */
function FirstSteps({ campaign, onCover }: { campaign: Campaign; onCover: () => void }) {
  const navigate = useNavigate();
  const key = `taleward.firstSteps.hidden.${campaign.id}`;
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const players = campaign.members.filter((m) => m.role === 'player' && !isDeletedMember(m) && m.userId).length;
  const steps = [
    { label: t('Mitspielende einladen'), detail: t('Per Link oder QR-Code. Wer kein Konto hat, kommt am Abend als Gast dazu.'), done: players > 0,
      go: () => document.getElementById('invite')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
    { label: t('Die Welt beschreiben'), detail: t('Freiwillig, ein paar Sätze reichen. Hilft beim Schreiben der Kapitel.'), done: !!campaign.worldInfo?.trim(),
      go: () => window.dispatchEvent(new Event(EDIT_WORLD)) },
    { label: t('Erste Runde aufnehmen'), detail: t('Am Spielabend unter „Aufnahme“. Jede Person am Tisch stimmt dort selbst zu, danach schreibt der Server das Kapitel.'), done: false,
      go: () => navigate(p(`/k/${campaign.id}/aufnahme`)) }
  ];
  if (hidden) return null;
  const nextIndex = steps.findIndex((s) => !s.done);
  const hide = () => {
    try { localStorage.setItem(key, '1'); } catch { /* egal */ }
    setHidden(true);
  };
  return (
    <section className="card task" aria-labelledby="first-steps" data-tour="first-steps">
      <strong id="first-steps">{t('So fängst du an')}</strong>
      <span className="muted small">{t('Drei Schritte bis zum ersten Kapitel. Alles andere kann warten.')}</span>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((s, i) => (
          <li key={s.label} className="row" style={{ minHeight: 48, gap: 10, alignItems: 'flex-start' }}>
            <span aria-hidden style={{ width: 24, flexShrink: 0, display: 'inline-flex', justifyContent: 'center', paddingTop: 2, fontWeight: 700, color: s.done ? 'var(--salbei)' : 'var(--ink-muted)' }}>
              {s.done ? <IconCheck size={18} /> : i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>{s.label}{s.done && <span className="visually-hidden"> – {t('erledigt')}</span>}</span>
              {!s.done && <span className="muted small">{s.detail}</span>}
            </span>
            {!s.done && (
              <button type="button" className={i === nextIndex ? 'btn small' : 'btn small outline'} aria-label={t('Los: {step}', { step: s.label })} onClick={s.go}>{t('Los')}</button>
            )}
          </li>
        ))}
      </ol>
      <div className="row wrap" style={{ gap: 16 }}>
        {!hasCover(campaign) && <button type="button" className="linklike small" style={{ minHeight: 48 }} onClick={onCover}>{t('Titelbild wählen')}</button>}
        <button type="button" className="linklike small muted" style={{ minHeight: 48 }} onClick={hide}>{t('Ausblenden')}</button>
      </div>
    </section>
  );
}

/** Eigene, stehende Zustimmung zu Aufnahmen in dieser Kampagne. Ohne Zustimmung: auffällig oben. */
export function RecordingConsent({ campaign, onChanged, quiet, row }: { campaign: Campaign; onChanged: () => void; quiet?: boolean; row?: boolean }) {
  const { user } = useAuth();
  // Frist und Cloud-Dienst gehören in den Wortlaut, den die Person bestätigt
  const info = useServerInfo();
  const cloud = cloudUse(info, campaign);
  const consentCtx = { retention: info?.audioRetention, cloudProvider: cloud.transcription?.provider ?? null, summaryProvider: cloud.summary?.provider ?? null };
  const me = campaign.members.find((m) => m.userId === user?.id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!me) return null;
  const granted = !!me.recordingConsentAt;

  const change = async (value: boolean) => {
    if (!value && !(await confirmDialog(t('Zustimmung widerrufen? Ab sofort kann nicht mehr aufgenommen werden, solange du am Tisch sitzt. Bereits veröffentlichte Zusammenfassungen bleiben bestehen.'), { confirmLabel: t('Widerrufen'), danger: true }))) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.setRecordingConsent(campaign.id, value);
      // Antwortet der Server ohne die Änderung, nicht still weitermachen, sondern sagen, dass es nicht geklappt hat
      if (saved && typeof saved === 'object' && !!saved.recordingConsentAt !== value) {
        throw new Error(t('Der Server hat die Zustimmung nicht gespeichert. Bitte später noch einmal versuchen.'));
      }
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // Unter „Kampagne verwalten“ als Zeile, aufgeklappt ohne eigene Karte
  if (row && granted && !open) {
    return (
      <button type="button" className="list-row nav" onClick={() => setOpen(true)}>
        <span className="lr-text">{t('Aufnahmen')}
          <span className="lr-sub">{t('Zugestimmt seit {date}', { date: formatDateFull(me.recordingConsentAt!) })}</span>
        </span>
        <span className="lr-val">{t('Ändern')}</span>
      </button>
    );
  }

  if (granted && !open) {
    return (
      <button type="button" className="row between" onClick={() => setOpen(true)}
        style={{ minHeight: 44, background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--ink-soft)', cursor: 'pointer', textAlign: 'left' }}>
        <span className="small">{t('Du hast Aufnahmen zugestimmt (seit {date}).', { date: formatDateFull(me.recordingConsentAt!) })}</span>
        <span className="small" style={{ color: 'var(--seal)', fontWeight: 700 }}>{t('Ändern')}</span>
      </button>
    );
  }

  return (
    <section className={row ? 'list-body consent-open' : granted ? 'card' : 'card warn'}>
      {row ? <strong>{t('Aufnahmen')}</strong> : <h2>{t('Aufnahmen')}</h2>}
      <p style={{ margin: 0 }}>{CONSENT_SUMMARY(consentCtx)}</p>
      <details>
        <summary className="small" style={{ fontWeight: 700 }}>{t('Genauer Wortlaut')}</summary>
        <p className="small" style={{ margin: '4px 0 0' }}>{CONSENT_STANDING(campaign.title, consentCtx)}</p>
      </details>
      <ErrorBox error={error} />
      {granted ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn small outline" disabled={busy} onClick={() => change(false)}>{t('Zustimmung widerrufen')}</button>
          <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>{t('Schließen')}</button>
        </div>
      ) : (
        <>
          <button type="button" className={quiet ? 'btn outline' : 'btn'} disabled={busy} onClick={() => change(true)}>{t('Ich stimme zu')}</button>
          <p className="muted small" style={{ margin: 0 }}>
            {t('Ohne Zustimmung wird nicht aufgenommen, solange du am Tisch sitzt.')}
          </p>
        </>
      )}
    </section>
  );
}

/** „Los: Die Welt beschreiben“ öffnet gleich das Formular */
const EDIT_WORLD = 'taleward:edit-world';

export function WorldInfo({ campaign, onSaved }: { campaign: Campaign; onSaved: (c: Campaign) => void }) {
  const gm = campaign.myRole === 'gm';
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [world, setWorld] = useState(campaign.worldInfo ?? '');
  const [language, setLanguage] = useState<'de' | 'en'>(campaign.language ?? 'de');
  const [system, setSystem] = useState<GameSystem | null>(campaign.system ?? null);
  const [systemName, setSystemName] = useState(campaign.systemName ?? '');
  // Namenshilfe (ab 0.4.6): nur vorhanden, wenn der Server sie der SL mitschickt
  const [hotwords, setHotwords] = useState<string[]>(campaign.hotwords ?? []);
  const [newWord, setNewWord] = useState('');
  const addWord = () => {
    const w = newWord.trim();
    if (w && !hotwords.includes(w) && hotwords.length < 200) setHotwords([...hotwords, w]);
    setNewWord('');
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [showAll, setShowAll] = useState(false);
  const paragraphs = (campaign.worldInfo ?? '').split(/\n\s*\n/).filter((p) => p.trim());
  // Einklappen merkt sich die App je Kampagne (nur auf diesem Gerät)
  const closedKey = `session-chronik.worldClosed.${campaign.id}`;
  const [closed, setClosed] = useState(() => {
    try { return localStorage.getItem(closedKey) === '1'; } catch { return false; }
  });
  const toggleClosed = () => {
    const next = !closed;
    setClosed(next);
    setShowAll(false);
    try { if (next) localStorage.setItem(closedKey, '1'); else localStorage.removeItem(closedKey); } catch { /* egal */ }
  };
  const long = paragraphs.length > 1 || (paragraphs[0]?.length ?? 0) > 280;
  useEffect(() => {
    if (!gm) return;
    const open = () => {
      setEditing(true);
      window.setTimeout(() => {
        const el = document.getElementById('w-info');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus({ preventScroll: true });
      }, 50);
    };
    window.addEventListener(EDIT_WORLD, open);
    return () => window.removeEventListener(EDIT_WORLD, open);
  }, [gm]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.updateCampaign(campaign.id, {
        description: description.trim(), worldInfo: world.trim(), language,
        system, systemName: system === 'other' ? systemName.trim() || null : null,
        ...(campaign.hotwords !== undefined ? { hotwords } : {})
      }));
      setEditing(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <section className="card">
        <h2>{t('Kampagne und Welt bearbeiten')}</h2>
        <div className="field">
          <label htmlFor="w-desc">{t('Kurzbeschreibung (erscheint oben)')}</label>
          <input id="w-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="w-info">{t('Hintergrund für alle Mitspielenden')}</label>
          <textarea id="w-info" rows={10} value={world} onChange={(e) => setWorld(e.target.value)}
            placeholder={t('Was die Charaktere zu Beginn über die Welt wissen: Ort, Lage, Götter, Regeln am Tisch …')} />
        </div>
        <GameSystemFields idPrefix="w" system={system} systemName={systemName}
          onChange={(s, n) => { setSystem(s); setSystemName(n); }} />
        <div className="field">
          <label htmlFor="w-lang">{t('Sprache der Runde (für Kapitel)')}</label>
          <select id="w-lang" value={language} onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="notice">
          <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
          <span>{t('Sehen alle Spieler. Geheimes gehört in die Bibel.')}</span>
        </div>
        {campaign.hotwords !== undefined && (
          <div className="field">
            <label htmlFor="w-hot" className="row" style={{ gap: 6 }}><IconLock size={14} /> {t('Namenshilfe für die Transkription')}</label>
            <span className="muted small">{t('Namen aus euren Runden, damit die Transkription sie erkennt. Nur du siehst sie.')}</span>
            {hotwords.length > 0 && (
              <div className="term-choices">
                {hotwords.map((w) => (
                  <button key={w} type="button" className="btn small outline" aria-label={t('{name} entfernen', { name: w })}
                    onClick={() => setHotwords(hotwords.filter((x) => x !== w))}>
                    {w} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              <input id="w-hot" type="text" maxLength={40} value={newWord} placeholder={t('z. B. Kaltenfurt')}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } }} />
              <button type="button" className="btn small outline" disabled={!newWord.trim() || hotwords.length >= 200} onClick={addWord}>{t('Hinzufügen')}</button>
            </div>
          </div>
        )}
        <ErrorBox error={error} />
        <div className="row">
          <button type="button" className="btn small" disabled={busy} onClick={save}>{busy ? t('Speichern …') : t('Speichern')}</button>
          <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>{t('Abbrechen')}</button>
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>
          <button type="button" className="fold-toggle" aria-expanded={!closed} aria-controls="world-text" onClick={toggleClosed}>
            {t('Die Welt')}
            <span aria-hidden="true" className="fold-chevron">›</span>
          </button>
        </h2>
        {gm && (
          <button type="button" className="btn ghost square" aria-label={t('Die Welt bearbeiten')} title={t('Die Welt bearbeiten')} onClick={() => setEditing(true)}>
            <IconPencil />
          </button>
        )}
      </div>
      {closed ? null : paragraphs.length > 0 ? (
        <div id="world-text" className="card recap" style={{ gap: 12 }}>
          {showAll
            ? paragraphs.map((p, i) => <p key={i}>{p}</p>)
            : <p className={long ? 'clamp-4' : undefined}>{paragraphs[0]}</p>}
          {long && (
            <button type="button" className="btn small quiet" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(!showAll)}>
              {showAll ? t('Weniger anzeigen') : t('Weiterlesen')}
            </button>
          )}
        </div>
      ) : (
        <div id="world-text" className="muted small">
          {gm ? t('Noch leer. Trag hier ein, was alle über die Welt wissen sollen.') : t('Die Spielleitung hat noch keinen Hintergrund eingetragen.')}
        </div>
      )}
    </section>
  );
}

function Members({ campaign, onChanged, voiceHint }: { campaign: Campaign; onChanged: () => void; voiceHint: boolean }) {
  const { user } = useAuth();
  const me = campaign.members.find((m) => m.userId === user?.id);
  const gm = me?.role === 'gm';
  const [seat, setSeat] = useState<Member | null>(null);
  const label = (m: Member) => (m.role === 'gm' ? t('Spielleitung') : m.characterName ?? t('noch ohne Charakter'));
  const active = campaign.members.filter((m) => m.openSeat || !isDeletedMember(m));
  const former = campaign.members.filter((m) => !m.openSeat && isDeletedMember(m));

  return (
    <section data-tour="members" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2>{t('Am Tisch')}</h2>
      <div className="card" style={{ gap: 2, padding: '8px 12px' }}>
        {active.map((m) => m.openSeat ? (
          // Offener Platz nach einem Umzug: Die SL kann gezielt einladen oder sich selbst daraufsetzen
          gm ? (
            <button key={m.id} type="button" className="row" onClick={() => setSeat(m)}
              style={{ minHeight: 52, gap: 10, background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--ink)', font: 'inherit', cursor: 'pointer' }}>
              <Avatar campaignId={campaign.id} member={m} size={40} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span>{m.characterName ?? (m.role === 'gm' ? t('Spielleitung') : t('Offener Platz'))}</span>
                <span className="muted small">{t('noch frei · tippen zum Einladen')}</span>
              </span>
              <span aria-hidden style={{ color: 'var(--ink-faint)' }}>›</span>
            </button>
          ) : (
            <div key={m.id} className="row muted" style={{ minHeight: 52, gap: 10 }}>
              <Avatar campaignId={campaign.id} member={m} size={40} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span>{m.characterName ?? t('Offener Platz')}</span>
                <span className="small">{t('noch frei')}</span>
              </span>
            </div>
          )
        ) : (
          <Link key={m.id} to={p(`/k/${campaign.id}/charakter/${m.id}`)} className="row"
            style={{ minHeight: 52, gap: 10, color: 'var(--ink)', textDecoration: 'none' }}>
            <Avatar campaignId={campaign.id} member={m} size={40} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span>{label(m)}</span>
              <span className="muted small">{m.displayName}{m === me ? ` (${t('du')})` : ''}</span>
            </span>
            <span aria-hidden style={{ color: 'var(--ink-faint)' }}>›</span>
          </Link>
        ))}
        {/* Einladen als letzte Zeile am Tisch statt als eigener großer Knopf */}
        {gm && <div id="invite" data-tour="invite"><InviteBox row campaignId={campaign.id} campaignTitle={campaign.title} /></div>}
      </div>
      {/* Ausgetretene und gelöschte Konten bleiben im Hintergrund (Kapitel, Kommentare), stehen aber nicht mehr am Tisch */}
      {former.length > 0 && (
        <details className="card" style={{ gap: 2, padding: '8px 12px' }}>
          <summary className="muted small" style={{ fontWeight: 700 }}>
            {t('Ehemalige ({n})', { n: former.length })}
          </summary>
          {former.map((m) => (
            <div key={m.id} className="row muted" style={{ minHeight: 48, gap: 10, opacity: 0.7 }}>
              <Avatar campaignId={campaign.id} member={m} size={32} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span>{m.characterName ?? t('Gelöschtes Konto')}</span>
                <span className="small">{m.leftAt ? t('Nicht mehr dabei') : t('Gelöschtes Konto')}</span>
              </span>
            </div>
          ))}
        </details>
      )}
      {/* Eigener Charakter und Umzugs-Haken: über die eigene Zeile oben (Charakterseite) */}
      {me && voiceHint && !isMusterUrl(currentConnection().baseUrl) && <VoiceProfileHint />}
      {seat && <OpenSeatDialog campaign={campaign} seat={seat} onClose={() => setSeat(null)} onDone={() => { setSeat(null); onChanged(); }} />}
    </section>
  );
}

/**
 * „Meine Charakterdaten dürfen bei einem Umzug mit“ (0.4.8). Standard aus; ohne Zustimmung geht bei einem Umzug nur
 * der Platz mit (Figurenname), nicht Beschreibung, Hintergrund, Bild und Kommentare.
 */
export function MoveConsent({ campaign, me, onChanged }: { campaign: Campaign; me: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const toggle = async (granted: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.setMoveConsent(campaign.id, granted);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  // Als Zeile mit Häkchen (steht in der Liste unter dem eigenen Charakter)
  return (
    <>
      <label className="list-row check-row">
        <input type="checkbox" checked={!!me.moveConsentAt} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        <span className="lr-text">{t('Meine Charakterdaten dürfen bei einem Umzug mit')}
          <span className="lr-sub">{t('Dann gehen Beschreibung, Hintergrund, Bild und deine öffentlichen Kommentare mit. Sonst nur der Name deiner Figur.')}</span>
        </span>
      </label>
      <ErrorBox error={error} />
    </>
  );
}

/** Verbrauch dieses Monats; zahlt der Betreiber der Kampagne (SL). Älterer Server: Zeile fehlt einfach */
function UsageRow({ campaignId }: { campaignId: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    api.usage(campaignId).then(setUsage).catch(() => undefined);
  }, [campaignId]);
  if (!usage) return null;
  const dec = (v: string) => (getLang() === 'de' ? v.replace('.', ',') : v);
  const hours = dec((usage.audioSeconds / 3600).toFixed(1));
  const cost = usage.costEstimateCents != null && !isMusterUrl(currentConnection().baseUrl)
    ? ' · ' + t('ca. {eur} €', { eur: dec((usage.costEstimateCents / 100).toFixed(2)) }) : '';
  return (
    <div className="list-row">
      <span className="lr-text">{t('Verbrauch')}
        <span className="lr-sub">{t('Diesen Monat: {sessions}, {hours} h Aufnahme', { sessions: tn(usage.sessions, '{n} Kapitel', '{n} Kapitel'), hours }) + cost}</span>
      </span>
    </div>
  );
}


export { InviteBox };

/**
 * Unten auf der Übersicht: Cloud-Dienste der Kampagne erlauben (SL, nur wenn der Betreiber sie eingerichtet hat),
 * Kampagne abschließen/wieder aufnehmen oder löschen (SL), Kampagne verlassen (alle, die letzte SL nur, wenn es eine
 * zweite gibt). Schnittstelle 0.4.5.
 */
function CampaignManage({ campaign, me, info, onChanged, onPickCover }: { campaign: Campaign; me: Member; info: ServerInfo | null; onChanged: () => void; onPickCover: () => void }) {
  const navigate = useNavigate();
  const gm = me.role === 'gm';
  const otherGms = campaign.members.filter((m) => m.role === 'gm' && m.id !== me.id && !isDeletedMember(m)).length;
  // Musterkampagne: Übergeben und Umziehen gibt es dort nicht sinnvoll (alles nur im Gerät)
  const muster = isMusterUrl(currentConnection().baseUrl);
  const [deleting, setDeleting] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      after ? after() : onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const archive = async (value: boolean) => {
    const q = value
      ? t('Kampagne abschließen? Sie bleibt zum Nachlesen erhalten, neue Kapitel gibt es dann nicht mehr. Du kannst sie später wieder aufnehmen.')
      : t('Kampagne wieder aufnehmen?');
    if (await confirmDialog(q, { confirmLabel: value ? t('Abschließen') : t('Wieder aufnehmen') })) {
      run(() => api.updateCampaign(campaign.id, { archived: value }));
    }
  };

  // Cloud-Dienste: Einschalten nur nach Rückfrage, Ausschalten sofort
  const externalProvider = providerLabel(info?.externalTranscription, info?.externalTranscriptionInfo);
  const primary = info?.externalTranscriptionMode === 'primary';
  const summaryProvider = providerLabel(info?.cloudSummary, info?.cloudSummaryInfo);
  const server = currentConnection().name;
  const setCloud = async (field: 'allowExternalTranscription' | 'allowCloudSummary', value: boolean, provider: string) => {
    if (value) {
      const q = field === 'allowExternalTranscription'
        ? (primary
          ? t('Transkription über {provider} für „{campaign}“ auf „{server}“ erlauben? Die Stimmen der Runde verlassen dann euren Server. Sag es vorher allen am Tisch.', { provider, campaign: campaign.title, server })
          : t('Transkription über {provider} für „{campaign}“ auf „{server}“ als Ausweichlösung erlauben? Nur wenn 24 Stunden lang kein Worker erreichbar ist, verlassen die Stimmen der Runde dann euren Server (wenige Cent pro Stunde Aufnahme). Sag es vorher allen am Tisch.', { provider, campaign: campaign.title, server }))
        : t('Zusammenfassung über {provider} für „{campaign}“ auf „{server}“ erlauben? Text der Runde und Unterlagen gehen dann dorthin, keine Stimmen. Sag es vorher allen am Tisch.', { provider, campaign: campaign.title, server });
      if (!(await confirmDialog(q, { confirmLabel: t('Erlauben') }))) return;
    }
    run(() => settings.change(field, value), () => undefined);
  };

  const settings = useCampaignSettings(campaign, onChanged);

  const leave = async () => {
    if (await confirmDialog(t('Kampagne verlassen? Du siehst sie danach nicht mehr. Deine Kommentare bleiben stehen. Zurück geht es nur mit einer neuen Einladung.'), { confirmLabel: t('Verlassen'), danger: true })) {
      run(() => api.removeMember(campaign.id, me.id), () => navigate('/', { replace: true }));
    }
  };

  const cloudRow = (field: 'allowExternalTranscription' | 'allowCloudSummary', provider: string, label: string, sub: string) => (
    settings.lock(field) !== 'unavailable' && (
      <label className="list-row check-row">
        <input type="checkbox" checked={settings.values[field]} disabled={busy || !!settings.lock(field)}
          onChange={(e) => setCloud(field, e.target.checked, provider)} />
        <span className="lr-text">{label}<span className="lr-sub">{sub}</span><LockNote lock={settings.lock(field)} /></span>
      </label>
    )
  );
  const withSettings = gm && (externalProvider || summaryProvider || (!muster && apiAtLeast('0.4.18')));

  return (
    <details className="card manage" style={{ gap: 10 }}>
      <summary style={{ fontWeight: 700 }}>{t('Kampagne verwalten')}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      <ErrorBox error={error} />
      {gm && settings.conflict && (
        <div className="notice" role="status">{t('Inzwischen hat jemand die Einstellungen geändert. Hier ist der neue Stand, bitte noch einmal wählen.')}</div>
      )}
      {withSettings && (
        <>
          <h3 className="list-head">{t('Für alle am Tisch')}</h3>
          <div className="list-box flat">
            {summaryProvider && cloudRow('allowCloudSummary', summaryProvider,
              t('Kapitel über {provider} schreiben', { provider: summaryProvider }), t('Auch Unterlagen. Nur Text, keine Stimmen.'))}
            {externalProvider && cloudRow('allowExternalTranscription', externalProvider,
              t('Abschrift über {provider}', { provider: externalProvider }),
              primary ? t('Die Stimmen der Runde gehen dorthin.') : t('Nur wenn 24 Stunden kein Worker da ist.'))}
            {/* Musterkampagne: kein Server, der auswerten könnte */}
            {!muster && apiAtLeast('0.4.18') && (
              <AnalysisSwitch campaign={{ ...campaign, allowCharacterAnalysis: settings.values.allowCharacterAnalysis }} info={info}
                busy={busy || !!settings.lock('allowCharacterAnalysis')} note={<LockNote lock={settings.lock('allowCharacterAnalysis')} />}
                onChange={(value) => run(() => settings.change('allowCharacterAnalysis', value), () => undefined)} />
            )}
            {settings.hasLog && <SettingsLog campaign={campaign} />}
          </div>
        </>
      )}
      <h3 className="list-head">{t('Deine Daten')}</h3>
      <div className="list-box flat">
        {me.recordingConsentAt && <RecordingConsent campaign={campaign} onChanged={onChanged} row />}
        <DataSummary campaign={campaign} info={info} gm={gm} />
      </div>
      {gm && (
        <>
          <h3 className="list-head">{t('Kampagne')}</h3>
          <div className="list-box flat">
            <button type="button" className="list-row nav" onClick={onPickCover}>
              <span className="lr-text">{hasCover(campaign) ? t('Titelbild ändern') : t('Titelbild wählen')}</span>
            </button>
            {!muster && campaign.billing && <PayerSection campaign={campaign} me={me} onChanged={onChanged} />}
            <UsageRow campaignId={campaign.id} />
          </div>
        </>
      )}
      {gm && !muster && (
        <>
          <h3 className="list-head">{t('Weitergeben')}</h3>
          <div className="list-box flat">
            <Link className="list-row" to={p(`/k/${campaign.id}/spielleitung`)}><span className="lr-text">{t('Spielleitung übergeben')}</span></Link>
            {apiAtLeast('0.4.8') && (
              <Link className="list-row" to={p(`/k/${campaign.id}/umziehen`)}><span className="lr-text">{t('Kampagne umziehen')}</span></Link>
            )}
          </div>
        </>
      )}
      {gm && <h3 className="list-head">{t('Beenden')}</h3>}
      <div className="list-box flat">
        {gm && (
          <button type="button" className="list-row nav" disabled={busy} onClick={() => archive(!campaign.archivedAt)}>
            <span className="lr-text">{campaign.archivedAt ? t('Wieder aufnehmen') : t('Kampagne abschließen')}</span>
          </button>
        )}
        {gm && !deleting && (
          <button type="button" className="list-row nav danger" onClick={() => setDeleting(true)}>
            <span className="lr-text">{t('Kampagne löschen …')}</span>
          </button>
        )}
        {(!gm || otherGms > 0) && (
          <button type="button" className="list-row nav danger" disabled={busy} onClick={leave}>
            <span className="lr-text">{t('Kampagne verlassen')}</span>
          </button>
        )}
      </div>
      {gm && otherGms === 0 && <span className="muted small">{t('Verlassen geht, sobald jemand anderes leitet.')}</span>}
      {gm && deleting && (
        <div className="card warn" style={{ gap: 8 }}>
          <strong>{t('Kampagne endgültig löschen')}</strong>
          <span className="small">{t('Gelöscht werden alle Kapitel, Aufnahmen, die Bibel, Kommentare und Bilder – für alle. Das lässt sich nicht rückgängig machen.')}</span>
          <div className="field">
            <label htmlFor="del-title">{t('Zur Bestätigung den Titel eingeben: {title}', { title: campaign.title })}</label>
            <input id="del-title" type="text" value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn danger" disabled={busy || confirmTitle.trim() !== campaign.title}
              onClick={() => run(() => api.deleteCampaign(campaign.id, confirmTitle.trim()), () => navigate('/', { replace: true }))}>
              {t('Endgültig löschen')}
            </button>
            <button type="button" className="btn outline" onClick={() => setDeleting(false)}>{t('Abbrechen')}</button>
          </div>
        </div>
      )}
      </div>
    </details>
  );
}

/**
 * Beitritt und „bleibt verborgen“ zur selben Person in eine Karte: Der Hinweis
 * hidden_entries_for_newcomer wandert in die Karte member_joined derselben Person.
 */
function mergeJoinNotices(list: GmNotice[]): { notice: GmNotice; hidden?: GmNotice }[] {
  const joined = new Set(list.filter((n) => n.code === 'member_joined').map((n) => n.memberId));
  return list
    .filter((n) => !(n.code === 'hidden_entries_for_newcomer' && joined.has(n.memberId)))
    .map((n) => ({
      notice: n,
      hidden: n.code === 'member_joined' ? list.find((x) => x.code === 'hidden_entries_for_newcomer' && x.memberId === n.memberId) : undefined
    }));
}

/**
 * Aufgaben für „Jetzt dran“: Kapitel, die auf die SL warten, mitgebrachte Welt, Hinweise an
 * die SL, eigener Charakter, Terminabstimmung. Hinweise klappen ihre Entscheidung auf, alles andere führt zur Seite.
 */
function nowItems(campaign: Campaign, me: Member | undefined, gm: boolean, needMe: SessionSummary[], info: ServerInfo | null, analyses: CharacterAnalysis[], onDone: () => void): NowItem[] {
  const items: NowItem[] = [];
  if (gm) {
    for (const s of needMe) {
      items.push({
        key: 's-' + s.id,
        label: t('Kapitel {n}', { n: s.number }) + ' · ' + (PENDING_LABEL[s.state] ? t(PENDING_LABEL[s.state]!) : s.state),
        // Fertig geschrieben: gleich zur Prüfung, nicht erst über den Fortschritt
        to: p(s.state === 'awaiting_review' ? `/s/${s.id}/freigabe` : `/s/${s.id}`)
      });
    }
    if (campaign.openCharacterProposals) {
      items.push({
        key: 'world',
        label: t('Mitgebrachte Welt') + ' · ' + tn(campaign.openCharacterProposals, '{n} offen', '{n} offen'),
        to: p(`/k/${campaign.id}/mitgebracht`)
      });
    }
    for (const { notice, hidden } of mergeJoinNotices(campaign.gmNotices ?? [])) {
      const item = noticeItem(campaign, notice, hidden, info, analyses, onDone);
      if (item) items.push(item);
    }
  }
  if (characterIncomplete(me)) {
    items.push({ key: 'me', label: t('Dein Charakter ist noch unvollständig'), to: p(`/k/${campaign.id}/charakter/${me!.id}?bearbeiten=1`) });
  }
  if (campaign.datePollNeedsMyVote) {
    items.push({ key: 'poll', label: t('Nächste Runde') + ' · ' + t('Abstimmen'), to: p(`/k/${campaign.id}/termin`) });
  }
  return items;
}

/** Hinweis an die SL (ab 0.4.7) als Zeile; dieselben Bedingungen wie in den Karten, damit keine leere Zeile bleibt */
function noticeItem(campaign: Campaign, notice: GmNotice, hidden: GmNotice | undefined, info: ServerInfo | null, analyses: CharacterAnalysis[], onDone: () => void): NowItem | null {
  const m = campaign.members.find((x) => x.id === notice.memberId);
  const key = 'n-' + notice.id;
  switch (notice.code) {
    case 'character_analysis_pending':
    {
      if (!apiAtLeast('0.4.18') || !m || isDeletedMember(m)) return null;
      // Ist die Auswertung geladen, sagt die Zeile schon, worum es geht, und die Karte wiederholt es nicht
      const a = analyses.find((x) => x.id === notice.analysisId);
      const name = m.characterName ?? m.displayName;
      const label = !a ? t('{person} bittet um eine Auswertung', { person: m.displayName })
        : a.source === 'backstory' ? t('{person} möchte den Hintergrund von {name} auswerten lassen', { person: m.displayName, name })
          : t('{person} möchte den Charakterbogen „{title}“ auswerten lassen', { person: m.displayName, title: a.title });
      return { key, label, hideDetailTitle: !!a,
        detail: <AnalysisPendingCard campaign={campaign} notice={notice} info={info} onDone={onDone} /> };
    }
    case 'seat_claimed':
      if (!m) return null;
      return { key, hideDetailTitle: true, label: t('{person} spielt jetzt {figure}', { person: m.displayName, figure: m.characterName ?? t('einen Platz') }),
        detail: <SeatClaimedCard campaign={campaign} notice={notice} onDone={onDone} /> };
    case 'character_orphaned': {
      if (!notice.entryIds[0]) return null;
      const figure = m?.characterName ?? t('die Figur');
      const deleted = !!m && (!!m.deletedAt || m.userId === '');
      return { key, hideDetailTitle: true,
        label: deleted ? t('Das Konto hinter {figure} wurde gelöscht', { figure }) : t('{person} hat die Runde verlassen', { person: m?.displayName || t('Ein Spieler') }),
        detail: <OrphanNoticeCard campaign={campaign} notice={notice} onDone={onDone} /> };
    }
    case 'member_joined':
      if (!m || isDeletedMember(m)) return null;
      return { key, hideDetailTitle: true, label: t('{person} ist der Kampagne beigetreten', { person: m.displayName }),
        detail: <MemberJoinedCard campaign={campaign} notice={notice} hidden={hidden} onDone={onDone} /> };
    case 'hidden_entries_for_newcomer':
      return { key, hideDetailTitle: true, label: t('{name} ist neu am Tisch', { name: m ? m.characterName ?? m.displayName : t('Ein neues Mitglied') }),
        detail: <NewcomerNoticeCard campaign={campaign} notice={notice} onDone={onDone} /> };
    default:
      return null;
  }
}

function NewcomerNoticeCard({ campaign, notice, onDone }: { campaign: Campaign; notice: GmNotice; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const m = campaign.members.find((x) => x.id === notice.memberId);
  const name = m ? m.characterName ?? m.displayName : t('Ein neues Mitglied');
  const dismiss = async () => {
    setBusy(true);
    try {
      await api.dismissGmNotice(campaign.id, notice.id);
      onDone();
    } catch {
      setBusy(false);
    }
  };
  if (notice.code !== 'hidden_entries_for_newcomer') return null;
  return (
    <div className="card">
      <strong>{t('{name} ist neu am Tisch', { name })}</strong>
      <span className="muted small">
        {tn(notice.entryIds.length,
          '{n} Eintrag der Bibel ist nur für einige Spieler sichtbar – für {name} bleibt er verborgen, bis du ihn freigibst.',
          '{n} Einträge der Bibel sind nur für einige Spieler sichtbar – für {name} bleiben sie verborgen, bis du sie freigibst.', { name })}
      </span>
      <div className="row wrap" style={{ gap: 8 }}>
        <Link className="btn small outline" to={p(`/k/${campaign.id}/bibel`)}>{t('Zur Bibel')}</Link>
        <button type="button" className="btn small ghost" disabled={busy} onClick={dismiss}>{t('Erledigt')}</button>
      </div>
    </div>
  );
}
