import { CreditWaitNote } from '../billing/CreditWaitNote';
import { confirmDialog } from '../components/confirm';
import { p } from '../api/connections';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Campaign, CampaignDocument, DocumentKind } from '../api/types';
import { IconInfo } from '../components/Icons';
import { ErrorBox, Screen, rememberCampaign } from '../components/Screen';
import { formatDate } from '../components/format';
import { t, tk, tn } from '../i18n';

const KINDS: { value: DocumentKind; label: string; hint: string }[] = [
  { value: 'gm', label: tk('SL-Unterlage'), hint: tk('Alles bleibt geheim. Du gibst später gezielt frei.') },
  { value: 'mixed', label: tk('Gemischt'), hint: tk('Taleward schlägt vor, was Spieler wissen dürfen. Geheim bleibt es trotzdem, bis du freigibst.') },
  { value: 'handout', label: tk('Spielerhandout'), hint: tk('Karten, Briefe, Gerüchte für die Spieler.') }
];

export const DOC_STATE: Record<CampaignDocument['state'], string> = {
  queued: tk('Wartet auf den Server'),
  processing: tk('Wird ausgewertet'),
  awaiting_review: tk('Vorschläge prüfen'),
  done: tk('In die Bibel übernommen'),
  failed: tk('Fehlgeschlagen')
};

export const MAX_MB = 50;

/** SL-Unterlagen hochladen und auswerten lassen (nur SL). */
export function DocumentsPage() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [docs, setDocs] = useState<CampaignDocument[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DocumentKind>('gm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = () => api.documents(campaignId).then(setDocs).catch(setError);

  useEffect(() => {
    api.campaign(campaignId).then((c) => { rememberCampaign(c); setCampaign(c); }).catch(setError);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Solange etwas ausgewertet wird, regelmäßig nachfragen
  const running = docs?.some((d) => d.state === 'queued' || d.state === 'processing');
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const upload = async () => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(new Error(t('Die Datei ist zu groß (höchstens {n} MB).', { n: MAX_MB })));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadDocument(campaignId, file, kind, title.trim() || file.name);
      setFile(null);
      setTitle('');
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: CampaignDocument) => {
    if (!(await confirmDialog(t('Unterlage „{title}“ löschen? Bereits übernommene Bibeleinträge bleiben erhalten.', { title: d.title }), { confirmLabel: t('Löschen'), danger: true }))) return;
    try {
      await api.deleteDocument(d.id);
      await load();
    } catch (e) {
      setError(e);
    }
  };

  if (campaign && campaign.myRole !== 'gm') {
    return <Screen back title={t('Unterlagen')}><div className="empty">{t('Das darf nur die Spielleitung.')}</div></Screen>;
  }

  return (
    <Screen back overline={campaign?.title ?? ' '} title={t('Unterlagen')} hero={{ campaign }}>
      <ErrorBox error={error} />
      <p className="muted" style={{ margin: 0 }}>
        {t('Aus Abenteuern und Notizen entstehen Vorschläge für die Bibel. Alles bleibt geheim, bis du es freigibst.')}
      </p>

      <section className="card">
        <h2>{t('Neue Unterlage')}</h2>
        <label className="btn outline">
          {file ? file.name : t('Datei wählen (PDF, Word, Text)')}
          <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} />
        </label>
        <div className="field">
          <label htmlFor="doc-title">{t('Titel')}</label>
          <input id="doc-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend className="muted small" style={{ marginBottom: 4 }}>{t('Was ist das für ein Dokument?')}</legend>
          {KINDS.map((k) => (
            <label key={k.value} className="check" style={{ alignItems: 'flex-start' }}>
              <input type="radio" name="kind" checked={kind === k.value} onChange={() => setKind(k.value)} style={{ marginTop: 3 }} />
              <span><strong>{t(k.label)}</strong><br /><span className="muted small">{t(k.hint)}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="notice">
          <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}><IconInfo /></span>
          <span>{t('Tipp: Geheime Abschnitte mit „[SL]“ markieren.')}</span>
        </div>
        <button type="button" className="btn" disabled={!file || busy} onClick={upload}>
          {busy ? t('Wird hochgeladen …') : t('Auswerten lassen')}
        </button>
        <span className="muted small">{t('Gescannte Seiten ohne Text gehen noch nicht.')}</span>
      </section>

      {docs && docs.length > 0 && <h2>{t('Deine Unterlagen')}</h2>}
      <div className="grid-cards">
      {docs?.map((d) => (
        <div key={d.id} className={d.state === 'awaiting_review' || d.state === 'failed' ? 'card warn' : 'card'}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div className="card-title">{d.title}</div>
            <span className="pill">{d.kind === 'character_sheet' ? t('Charakterbogen') : t(KINDS.find((k) => k.value === d.kind)?.label ?? 'Sonstiges')}</span>
          </div>
          <div className="muted small">
            {d.fileName} · {d.sizeBytes < 1e5 ? `${Math.max(1, Math.round(d.sizeBytes / 1e3))} kB` : `${(d.sizeBytes / 1e6).toFixed(1)} MB`}{d.pageCount ? ' · ' + tn(d.pageCount, '{n} Seite', '{n} Seiten') : ''} · {formatDate(d.createdAt)}
          </div>
          <div className="small"><strong>{t(DOC_STATE[d.state])}</strong>{d.state === 'failed' && d.message ? ` – ${d.message}` : ''}</div>
          {/* Hinweis des Servers beim Warten, z. B. „Die SL hat das für diese Kampagne noch nicht erlaubt …“ */}
          {d.message && (d.state === 'queued' || d.state === 'processing') && !d.creditWait && <div className="muted small">{d.message}</div>}
          {d.state === 'queued' && d.creditWait && <CreditWaitNote wait={d.creditWait} />}
          {d.progress !== null && (d.state === 'processing' || d.state === 'queued') && (
            <div className="progress"><div style={{ width: `${d.progress * 100}%` }} /></div>
          )}
          <div className="row wrap" style={{ gap: 8 }}>
            {d.state === 'awaiting_review' && (
              <Link className="btn small" to={p(`/k/${campaignId}/unterlagen/${d.id}`)}>
                {tn(d.openProposalCount, '{n} Vorschlag prüfen', '{n} Vorschläge prüfen')}
              </Link>
            )}
            {d.state === 'done' && <span className="muted small">{tn(d.proposalCount, '{n} Vorschlag', '{n} Vorschläge')}</span>}
            {d.state === 'failed' && (
              <button type="button" className="btn small outline" onClick={() => api.retryDocument(d.id).then(load).catch(setError)}>{t('Erneut versuchen')}</button>
            )}
            <button type="button" className="linklike tap-link small" style={{ marginLeft: 'auto' }} onClick={() => remove(d)}>{t('Löschen')}</button>
          </div>
        </div>
      ))}
      </div>
    </Screen>
  );
}
