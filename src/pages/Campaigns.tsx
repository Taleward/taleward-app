import { listCharacters } from '../characters/store';
import { serverHasCharacters } from '../characters/sync';
import { LinkInput } from '../components/LinkInput';
import { NotifyPrompt } from '../notify/NotifySettings';
import { MusterNotice } from '../components/Muster';
import { UpdateNotices } from '../components/UpdateNotices';
import type { GameSystem } from '../api/types';
import { GameSystemFields } from '../components/GameSystemFields';
import type { CampaignSummary } from '../api/types';
import { NewDot } from '../components/Screen';
import { CampaignCover, hasCover } from '../covers/CampaignCover';
import { getLang, t, tn } from '../i18n';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiFor, fetchServerInfo } from '../api/client';
import { isMusterUrl } from '../api/muster';
import { offlineSince } from '../api/readCopy';
import { APP_VERSION, MIN_API_VERSION, hasValidToken, parseInvite, sameServerHost, updateConnection, versionLess, type Connection } from '../api/connections';
import { IconInfo } from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { Divider, ErrorBox, Screen } from '../components/Screen';
import { Missing } from '../components/Missing';
import { formatDate, formatDateTime } from '../components/format';

const newCount = (c: CampaignSummary) => (c.unread ? c.unread.recaps + c.unread.comments + c.unread.bible : 0);

/** „Neu: 1 Recap · 3 Kommentare · Bibel ergänzt“ */
function newSummary(c: CampaignSummary): string {
  const u = c.unread!;
  const parts: string[] = [];
  if (u.recaps) parts.push(tn(u.recaps, '{n} neues Kapitel', '{n} neue Kapitel'));
  if (u.comments) parts.push(tn(u.comments, '{n} Kommentar', '{n} Kommentare'));
  if (u.bible) parts.push(tn(u.bible, '{n} Bibeleintrag', '{n} Bibeleinträge'));
  return t('Neu: {list}', { list: parts.join(' · ') });
}

// Monogramm ohne Titelbild: immer tinte (Siegelrot ist keine Zierde)
const SEAL_COLORS = ['var(--tinte)'];

type Entry = { conn: Connection; c: CampaignSummary };

export function Campaigns() {
  const { active, connections } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState<Connection[]>([]);
  const [offline, setOffline] = useState<{ conn: Connection; since: string }[]>([]);
  const [mode, setMode] = useState<'none' | 'new' | 'join'>('none');
  const [value, setValue] = useState('');
  const [serverId, setServerId] = useState<string>('');
  const [language, setLanguage] = useState<'de' | 'en'>(getLang());
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [systemName, setSystemName] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const location = useLocation();
  // Das Formular steht unter der Liste: beim Öffnen dorthin scrollen, damit man es auf dem Handy sieht
  useEffect(() => {
    setTried(false);
    if (mode === 'none') return;
    const id = window.setTimeout(() => document.getElementById('cval')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    return () => window.clearTimeout(id);
  }, [mode]);
  // Beitritt über einen Einladungslink ist gescheitert (z. B. Code abgelaufen, zu viele Versuche): Feld mit dem Link
  // öffnen und die Meldung des Servers zeigen, damit man es gleich oder später noch einmal versuchen kann
  useEffect(() => {
    const st = location.state as { joinError?: string; invite?: string } | null;
    if (!st?.joinError) return;
    setMode('join');
    setValue(st.invite ?? '');
    setActionError(new Error(st.joinError));
    navigate('.', { replace: true, state: null });
    // Feld steht unten auf der Seite: dorthin scrollen, damit die Meldung nicht übersehen wird
    window.setTimeout(() => document.getElementById('cval')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  }, [location.state, navigate]);
  const multi = connections.length > 1;
  const expired = connections.filter((c) => !hasValidToken(c));

  // Kampagnen aller Server laden; ein nicht erreichbarer Server blockiert die anderen nicht
  useEffect(() => {
    let alive = true;
    Promise.all(active.map(async (conn) => {
      // Erst die Server-Info: Schnittstellen- und App-Versionen aktuell halten
      try {
        const info = await fetchServerInfo(conn.baseUrl);
        const appInfo = {
          minAppVersion: info.minAppVersion ?? null, latestAppVersion: info.latestAppVersion ?? null,
          appDownloadUrl: info.appDownloadUrl ?? null, releaseNotes: info.releaseNotes ?? null,
          appDownloadSha256: info.appDownloadSha256 ?? null, appDownloadSizeBytes: info.appDownloadSizeBytes ?? null
        };
        const tooOld = !!appInfo.minAppVersion && versionLess(APP_VERSION, appInfo.minAppVersion);
        updateConnection(conn.id, { apiVersion: info.apiVersion, name: info.name, operator: info.operator, appInfo, appOutdated: tooOld, serverId: info.serverId ?? conn.serverId ?? null });
        if (tooOld || versionLess(info.apiVersion, MIN_API_VERSION)) return { conn, list: [] as CampaignSummary[], ok: true };
      } catch {
        /* Info nicht erreichbar – dann merkt es gleich die Kampagnenliste */
      }
      try {
        const list = await apiFor(conn).campaigns();
        // Nicht erreichbar, aber Lesekopie vorhanden: Kampagnen zeigen, mit Hinweis auf den Stand
        return { conn, list, ok: true, offline: offlineSince(conn.id) };
      } catch {
        return { conn, list: [] as CampaignSummary[], ok: false };
      }
    })).then((results) => {
      if (!alive) return;
      setEntries(results.flatMap((r) => r.list.map((c) => ({ conn: r.conn, c }))));
      setFailed(results.filter((r) => !r.ok).map((r) => r.conn));
      setOffline(results.flatMap((r) => ('offline' in r && r.offline ? [{ conn: r.conn, since: r.offline }] : [])));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.map((c) => c.id + c.token).join()]);

  const targetServer = () => active.find((c) => c.id === serverId) ?? active[0];

  const missing = !value.trim()
    ? (mode === 'new' ? t('Bitte einen Namen für die Kampagne eingeben.') : t('Bitte den Einladungslink oder -code einfügen.'))
    : null;

  const submit = async () => {
    setActionError(null);
    setTried(true);
    if (missing) {
      document.getElementById('cval')?.focus();
      return;
    }
    if (mode === 'join') {
      const invite = parseInvite(value);
      if (!invite) {
        setActionError(new Error(t('Das ist weder ein Einladungslink noch ein Einladungscode.')));
        return;
      }
      // Link zu einem Server, mit dem die App noch nicht verbunden ist: dort erst Konto anlegen oder anmelden
      const known = invite.baseUrl
        ? active.find((c) => c.baseUrl === invite.baseUrl) ?? active.find((c) => sameServerHost(c.baseUrl, invite.baseUrl!))
        : targetServer();
      if (!known) {
        navigate(`/verbinden?invite=${encodeURIComponent(value.trim())}`);
        return;
      }
      try {
        const c = await apiFor(known).joinCampaign(invite.code);
        navigate(`/v/${known.id}/k/${c.id}/willkommen`);
      } catch (e) {
        setActionError(e);
      }
      return;
    }
    const conn = targetServer();
    try {
      const c = await apiFor(conn).createCampaign(value.trim(), '', language, system, system === 'other' ? systemName.trim() || null : null);
      navigate(`/v/${conn.id}/k/${c.id}`);
    } catch (e) {
      setActionError(e);
    }
  };

  const loading = entries === null;
  const names = [...new Set(active.map((c) => c.user?.displayName).filter(Boolean))].join(', ');
  // Nur die Musterkampagne verbunden: kein echtes Konto – der nächste Schritt ist ein eigener Server (Design-Prüfung 08.10.)
  const onlyMuster = active.length > 0 && active.every((c) => isMusterUrl(c.baseUrl));

  return (
    <Screen overline={onlyMuster ? t('Musterkampagne') : names ? t('Angemeldet als {name}', { name: names }) : ' '} title={t('Deine Kampagnen')} nav={false}>
      <UpdateNotices connections={connections} />
      <NotifyPrompt />
      <MusterNotice />
      {expired.map((c) => (
        <Link key={c.id} to={`/verbinden?server=${encodeURIComponent(c.baseUrl)}`} className="card warn">
          <strong>{t('Anmeldung bei „{name}“ abgelaufen', { name: c.name })}</strong>
          <span className="muted small">{t('Tippen, um dich neu anzumelden.')}</span>
        </Link>
      ))}
      {offline.map(({ conn: c, since }) => (
        <div key={c.id} className="notice" role="status">
          <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
          <span>{t('„{name}“ ist gerade nicht erreichbar. Du siehst den Stand vom {date} und kannst lesen, aber nichts ändern.', { name: c.name, date: formatDateTime(since) })}</span>
        </div>
      ))}
      {failed.map((c) => (
        <div key={c.id} className="notice">
          <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
          <span>{t('„{name}“ ist gerade nicht erreichbar.', { name: c.name })}</span>
        </div>
      ))}
      {loading && <div className="empty">{t('Lade Kampagnen …')}</div>}
      {entries?.length === 0 && failed.length === 0 && <div className="empty">{t('Du bist noch in keiner Kampagne. Leg eine an oder tritt mit einem Einladungscode bei.')}</div>}

      <div className="grid-cards">
      {entries?.filter(({ c }) => !c.archivedAt).map(({ conn, c }, i) => (
        <Link key={conn.id + c.id} to={`/v/${conn.id}/k/${c.id}`} className="card">
          {hasCover(c) && (
            <div style={{ margin: '-16px -16px 4px' }}>
              <CampaignCover campaign={c} conn={conn} height={96} radius="calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0 0" />
            </div>
          )}
          {multi && <span className="overline">{c.organization?.name ?? conn.name}</span>}
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <h2 style={{ fontSize: 19 }}>{c.title}</h2>
            {!hasCover(c) && (
              <div className="monogram" style={{ background: SEAL_COLORS[i % SEAL_COLORS.length] }} aria-hidden>
                {c.title.replace(/^(Die|Der|Das|The|A|An)\s+/i, '').charAt(0)}
              </div>
            )}
          </div>
          <div className="muted small">
            {c.myRole === 'gm'
              ? tn(c.memberCount - 1, 'Du leitest · {n} Spieler', 'Du leitest · {n} Spieler')
              : c.myCharacterName ? t('Du spielst {name}', { name: c.myCharacterName }) : t('Du spielst noch ohne Charakter')}
            {' · '}
            {tn(c.publishedSessionCount, '{n} Kapitel', '{n} Kapitel')}
          </div>
          {newCount(c) > 0 && (
            <div className="row small" style={{ gap: 8, color: 'var(--seal)', fontWeight: 700 }}>
              <NewDot label={t('Neues in dieser Kampagne')} />
              <span>{newSummary(c)}</span>
            </div>
          )}
          {/* Infos als Textzeile, Etiketten nur für Dinge, die etwas von dir wollen */}
          {c.nextSessionAt && Date.parse(c.nextSessionAt) > Date.now() ? (
            <div className="small">{t('Nächste Runde')}: <strong>{formatDateTime(c.nextSessionAt)}</strong></div>
          ) : c.lastPublishedAt ? (
            <div className="muted small">{t('Letztes Kapitel')}: {formatDate(c.lastPublishedAt)}</div>
          ) : null}
          {(c.pendingReviewCount > 0 || c.datePollNeedsMyVote) && (
            <div className="row wrap" style={{ gap: 8 }}>
              {c.pendingReviewCount > 0 && <span className="pill brass">{tn(c.pendingReviewCount, '{n} Kapitel zu prüfen', '{n} Kapitel zu prüfen')}</span>}
              {c.datePollNeedsMyVote && <span className="pill brass">{t('Termin abstimmen')}</span>}
            </div>
          )}
        </Link>
      ))}
      </div>
      {/* Abgeschlossene Kampagnen eingeklappt darunter */}
      {(entries?.filter(({ c }) => c.archivedAt).length ?? 0) > 0 && (
        <details className="card" style={{ gap: 12 }}>
          <summary style={{ fontWeight: 700 }}>
            {t('Abgeschlossen ({n})', { n: entries!.filter(({ c }) => c.archivedAt).length })}
          </summary>
          {entries!.filter(({ c }) => c.archivedAt).map(({ conn, c }) => (
            <Link key={conn.id + c.id} to={`/v/${conn.id}/k/${c.id}`} className="row between" style={{ minHeight: 48, color: 'var(--ink)', textDecoration: 'none' }}>
              <span style={{ font: '700 17px/22px var(--font-serif)' }}>{c.title}</span>
              <span className="muted small">{tn(c.publishedSessionCount, '{n} Kapitel', '{n} Kapitel')}</span>
            </Link>
          ))}
        </details>
      )}

      <Divider />

      <div className="list-actions">
      {mode === 'none' ? (
        <>
          {onlyMuster ? (
            <Link className="btn" to="/verbinden">{t('Mit einem Server verbinden')}</Link>
          ) : (
            <button className="btn" type="button" onClick={() => { setMode('new'); setValue(''); }}>
              {t('Neue Kampagne anlegen')}
            </button>
          )}
          <button className="btn outline" type="button" onClick={() => { setMode('join'); setValue(''); }}>
            {t('Einladung annehmen')}
          </button>
        </>
      ) : (
        <div className="card">
          <div className="field">
            <label htmlFor="cval">{mode === 'new' ? t('Name der Kampagne') : t('Einladungslink oder -code')}</label>
            {mode === 'join'
              ? <LinkInput id="cval" value={value} onChange={setValue} autoFocus />
              : <input id="cval" type="text" value={value} autoFocus onChange={(e) => setValue(e.target.value)} />}
          </div>
          {(mode === 'new' || (mode === 'join' && !parseInvite(value)?.baseUrl)) && active.length > 1 && (
            <div className="field">
              <label htmlFor="cserver">{t('Auf welchem Server?')}</label>
              <select id="cserver" value={serverId || active[0].id} onChange={(e) => setServerId(e.target.value)}>
                {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {mode === 'new' && (
            <GameSystemFields idPrefix="new" system={system} systemName={systemName}
              onChange={(s, n) => { setSystem(s); setSystemName(n); }} />
          )}
          {mode === 'new' && (
            <div className="field">
              <label htmlFor="clang">{t('Sprache der Runde (für Kapitel)')}</label>
              <select id="clang" value={language} onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </div>
          )}
          <ErrorBox error={actionError} />
          <Missing text={missing} shown={tried} />
          <div className="row">
            <button className="btn small" type="button" disabled={mode === 'new' && active.length === 0} onClick={submit}>
              {mode === 'new' ? t('Anlegen') : t('Beitreten')}
            </button>
            <button className="btn small ghost" type="button" onClick={() => setMode('none')}>
              {t('Abbrechen')}
            </button>
          </div>
        </div>
      )}

      <div className="row wrap" style={{ justifyContent: 'center', gap: 4 }}>
        {active.some(serverHasCharacters) || listCharacters().length > 0
          ? <Link className="btn ghost small" to="/charaktere">{t('Meine Charaktere')}</Link> : null}
        <Link className="btn ghost small" to="/konto">{t('Konten und Server')}</Link>
      </div>
      </div>
    </Screen>
  );
}
