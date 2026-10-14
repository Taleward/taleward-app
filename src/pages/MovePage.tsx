import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { currentConnection, p } from '../api/connections';
import { isDeletedMember, type Campaign, type CampaignExport, type SessionSummary } from '../api/types';
import { formatDateFull } from '../components/format';
import { Avatar } from '../components/Avatar';
import { ErrorBox, Screen, rememberCampaign } from '../components/Screen';
import { t, tn } from '../i18n';

/** Größe lesbar: „48 MB“ */
export function sizeLabel(bytes: number | null | undefined): string {
  if (!bytes) return '';
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/**
 * Kampagne umziehen (Schnittstelle 0.4.8, nur SL): Datei taleward-kampagne/1 erstellen und herunterladen. Auf dem neuen
 * Server übernimmt die SL sie über die Kampagnenliste. Hier ändert sich dabei nichts.
 */
export function MovePage() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [exp, setExp] = useState<CampaignExport | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api.campaign(campaignId).then((c) => { rememberCampaign(c); setCampaign(c); }).catch(setError);
    // Kapitel in Arbeit bleiben beim Umzug hier – vorher zählen und sagen (Wunsch 14.10.)
    api.sessions(campaignId).then(setSessions).catch(() => undefined);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [campaignId]);

  const poll = (id: string) => {
    timer.current = window.setTimeout(async () => {
      try {
        const x = await api.exportStatus(campaignId, id);
        setExp(x);
        if (x.state === 'queued' || x.state === 'processing') poll(id);
      } catch (e) {
        setError(e);
      }
    }, 1500);
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const x = await api.startExport(campaignId);
      setExp(x);
      if (x.state !== 'ready' && x.state !== 'failed') poll(x.id);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // Ohne Aufnahme (created) gibt es nichts, das verloren ginge
  const unpublished = sessions?.filter((s) => s.state !== 'published' && s.state !== 'created').length ?? 0;
  const players = campaign?.members.filter((m) => m.role === 'player' && !isDeletedMember(m)) ?? [];
  const consented = players.filter((m) => m.moveConsentAt).length;
  const running = exp && (exp.state === 'queued' || exp.state === 'processing');
  const href = exp?.downloadUrl ? currentConnection().baseUrl + exp.downloadUrl : null;

  return (
    <Screen narrow back overline={campaign?.title ?? ' '} title={t('Kampagne umziehen')}>
      <ErrorBox error={error} />
      {campaign && campaign.myRole !== 'gm' && <div className="empty">{t('Das kann nur die Spielleitung.')}</div>}

      {campaign && campaign.myRole === 'gm' && (
        <>
          <section className="card">
            <h2>{t('So geht es')}</h2>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>{t('Hier eine Datei der Kampagne erstellen und herunterladen.')}</li>
              <li>{t('In der App beim neuen Server anmelden, dann unter „Konten und Server“ beim neuen Server „Kampagne aus Datei übernehmen“ wählen.')}</li>
              <li>{t('Alle bekommen dort einen freien Platz. Wer mit der Figur aus der eigenen Sammlung beitritt, setzt sich von selbst darauf.')}</li>
            </ol>
            <span className="muted small">{t('Hier auf „{server}“ bleibt alles, wie es ist. Löschen kannst du die Kampagne später selbst.', { server: currentConnection().name })}</span>
            <span className="muted small">{t('Auf dem neuen Server fängt jede Person mit einem eigenen Konto an und stimmt der Aufnahme dort neu zu. Cloud-Freigaben und Stimmprofile richtet ihr dort neu ein. Das ist Absicht: Zustimmungen und Freigaben gelten immer nur für einen Server.')}</span>
          </section>

          {unpublished > 0 && (
            <div className="card task">
              <strong>{tn(unpublished, '{n} Kapitel ist noch nicht veröffentlicht und bleibt hier.', '{n} Kapitel sind noch nicht veröffentlicht und bleiben hier.')}</strong>
              <span className="muted small">{t('Mit umziehen nur veröffentlichte Kapitel. Wenn du sie mitnehmen willst, veröffentliche sie vorher.')}</span>
              <Link className="btn small outline" style={{ alignSelf: 'flex-start' }} to={p(`/k/${campaignId}/chronik`)}>{t('Zur Chronik')}</Link>
            </div>
          )}

          <section className="card">
            <h2>{t('Wer seine Daten mitgibt')}</h2>
            {players.length === 0 ? (
              <span className="muted small">{t('Noch keine Spieler am Tisch.')}</span>
            ) : (
              <>
                {players.map((m) => (
                  <div key={m.id} className="row" style={{ gap: 10, minHeight: 48 }}>
                    <Avatar campaignId={campaign.id} member={m} size={40} />
                    <span style={{ flex: 1 }}>{m.characterName ?? m.displayName}<span className="muted small"> · {m.displayName}</span></span>
                    <span className={m.moveConsentAt ? 'pill moss' : 'pill'}>{m.moveConsentAt ? t('alles') : t('nur der Name')}</span>
                  </div>
                ))}
                <span className="muted small">
                  {tn(consented, '{n} von {total} hat zugestimmt.', '{n} von {total} haben zugestimmt.', { total: players.length })}{' '}
                  {consented < players.length && t('Ohne Zustimmung geht nur der Name der Figur mit. Den Haken setzt jede Person selbst auf der Übersicht unter „Am Tisch“ – frag am besten bei der nächsten Runde.')}
                </span>
              </>
            )}
          </section>

          <details className="card">
            <summary style={{ fontWeight: 700 }}>{t('Was mitgeht und was nicht')}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <span className="small"><strong>{t('Geht mit:')}</strong> {t('veröffentlichte Kapitel, die Bibel mit allem Geheimen, deine Unterlagen, Titelbild, die Plätze am Tisch und – mit Zustimmung – Charakterdaten und Kommentare.')}</span>
              <span className="small"><strong>{t('Bleibt hier:')}</strong> {t('Konten, Namen und E-Mail-Adressen, Einwilligungen, Stimmprofile, Aufnahmen, Abschriften, Vorschläge, Terminabstimmungen, Kapitel in Arbeit und die Freigaben für Cloud-Dienste.')}</span>
            </div>
          </details>

          <div className="card warn">
            <strong>{t('Die Datei enthält alles Geheime')}</strong>
            <span className="small">{t('Auch geheime Einträge und deine Notizen stecken darin. Gib sie niemandem weiter und lösch sie, wenn der Umzug geklappt hat.')}</span>
          </div>

          {!exp && (
            <button type="button" className="btn" disabled={busy} onClick={start}>{t('Datei erstellen')}</button>
          )}
          {running && (
            <section className="card" aria-live="polite">
              <strong>{t('Datei wird erstellt …')}</strong>
              <div className="progress"><div style={{ width: `${Math.round((exp!.progress ?? 0) * 100)}%` }} /></div>
              <span className="muted small">{t('Bei großen Kampagnen dauert das ein paar Minuten. Du kannst die Seite offen lassen.')}</span>
            </section>
          )}
          {exp?.state === 'ready' && href && (
            <section className="card">
              <strong>{t('Die Datei ist fertig')}</strong>
              <span className="muted small">
                {sizeLabel(exp.sizeBytes)}{exp.expiresAt ? ' · ' + t('herunterladbar bis {date}', { date: formatDateFull(exp.expiresAt) }) : ''}
              </span>
              <a className="btn" href={href} target="_blank" rel="noopener noreferrer" download>{t('Herunterladen')}</a>
              <span className="muted small">{t('Weiter geht es auf dem neuen Server: „Konten und Server“ → „Kampagne aus Datei übernehmen“.')}</span>
            </section>
          )}
          {exp?.state === 'failed' && (
            <section className="card warn">
              <strong>{t('Das hat nicht geklappt')}</strong>
              {exp.message && <span className="small">{exp.message}</span>}
              <button type="button" className="btn outline" disabled={busy} onClick={start}>{t('Noch einmal versuchen')}</button>
            </section>
          )}
        </>
      )}
    </Screen>
  );
}
