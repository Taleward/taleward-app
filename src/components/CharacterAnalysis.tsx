import { useEffect, useRef, useState } from 'react';
import { api, isApiError } from '../api/client';
import { currentConnection } from '../api/connections';
import type { Campaign, CampaignDocument, CharacterAnalysis, GmNotice, Member, ServerInfo } from '../api/types';
import { isDeletedMember } from '../api/types';
import { confirmDialog } from './confirm';
import { providerLabel } from './CloudNotice';
import { ErrorBox } from './Screen';
import { MAX_MB } from '../pages/DocumentsPage';
import { t, tk, tn } from '../i18n';
import { analysisReader } from '../characters/analysisReader';

/*
 * Charakterbögen und Hintergründe auswerten (Schnittstelle 0.4.18): Die SL schaltet es je Kampagne ein, die Spielerin
 * gibt Bogen oder Hintergrund ab, die SL stimmt jeder Auswertung einzeln zu. Ergebnis sind Vorschläge unter
 * „Mitgebrachte Welt“ – die Spielerin sieht nur den Stand, nie die Vorschläge.
 */

/** Ohne Angabe des Servers (vor 0.4.19) gelten 3 Bögen wie in 0.4.18 – der Server meldet sonst 409 sheet_limit */
const DEFAULT_MAX_SHEETS = 3;
const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Wer liest mit: Cloud-Anbieter (nur mit Freigabe der SL für die Kampagne) oder das lokale Modell des Servers */
function reader(info: ServerInfo | null, campaign: Campaign, usesCloud?: boolean): string {
  const who = analysisReader({ usesCloud, allowCloudSummary: !!campaign.allowCloudSummary, infoKnown: !!info, serverHasCloud: !!info?.cloudSummary });
  if (who === 'maybe_cloud') return t('Für diese Kampagne ist die Cloud erlaubt, ausgewertet wird also möglicherweise dort.');
  if (who === 'local') return t('Ausgewertet wird mit dem Modell eures Servers, nichts geht in die Cloud.');
  const provider = providerLabel(info?.cloudSummary, info?.cloudSummaryInfo);
  return provider ? t('Ausgewertet wird in der Cloud über {provider}.', { provider }) : t('Ausgewertet wird in der Cloud.');
}

const STATE: Record<CharacterAnalysis['state'], string> = {
  awaiting_gm: tk('Wartet auf die Spielleitung'),
  rejected: tk('Von der Spielleitung abgelehnt'),
  queued: tk('Wird gleich ausgewertet'),
  processing: tk('Wird ausgewertet'),
  done: tk('Ausgewertet – die Spielleitung entscheidet über die Vorschläge'),
  failed: tk('Auswertung fehlgeschlagen')
};

/** Schalter unter „Kampagne verwalten“ (nur SL) */
export function AnalysisSwitch({ campaign, info, busy, onChange }: {
  campaign: Campaign; info: ServerInfo | null; busy: boolean; onChange: (value: boolean) => void;
}) {
  const toggle = async (value: boolean) => {
    if (value) {
      // Frage zuerst (wird Überschrift der Rückfrage), Erklärung in normaler Schrift darunter (Design-Prüfung 14.10.)
      const q = t('Charakterbögen und Hintergründe in „{campaign}“ auf „{server}“ auswerten lassen? Jede Auswertung startet erst, wenn du zustimmst. {reader}', {
        campaign: campaign.title, server: currentConnection().name, reader: reader(info, campaign)
      });
      if (!(await confirmDialog(q, { confirmLabel: t('Erlauben') }))) return;
    }
    onChange(value);
  };
  return (
    <div className="field">
      <label className="check" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" checked={!!campaign.allowCharacterAnalysis} disabled={busy}
          onChange={(e) => toggle(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
        <span>{t('Charakterbögen und Hintergründe auswerten lassen')}</span>
      </label>
      <span className="muted small">
        {t('Daraus werden Vorschläge für die Bibel – Familie, Heimat, alte Feinde –, über die du entscheidest. Du stimmst jeder Auswertung einzeln zu.')}
      </span>
    </div>
  );
}

/** Hinweis an die SL: jemand möchte Bogen oder Hintergrund auswerten lassen */
export function AnalysisPendingCard({ campaign, notice, info, onDone }: { campaign: Campaign; notice: GmNotice; info: ServerInfo | null; onDone: () => void }) {
  const [analysis, setAnalysis] = useState<CharacterAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    api.characterAnalyses(campaign.id).then((list) => setAnalysis(list.find((a) => a.id === notice.analysisId) ?? null)).catch(() => undefined);
  }, [campaign.id, notice.analysisId]);
  const m = campaign.members.find((x) => x.id === notice.memberId);
  if (!m || isDeletedMember(m) || !analysis || analysis.state !== 'awaiting_gm') return null;
  const name = m.characterName ?? m.displayName;

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.decideCharacterAnalysis(analysis.id, approve);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <strong>
        {analysis.source === 'backstory'
          ? t('{person} möchte den Hintergrund von {name} auswerten lassen', { person: m.displayName, name })
          : t('{person} möchte den Charakterbogen „{title}“ auswerten lassen', { person: m.displayName, title: analysis.title })}
      </strong>
      <span className="muted small">
        {t('Daraus werden Vorschläge für die Bibel, über die du entscheidest.')}{' '}
        {reader(info, campaign, analysis.usesCloud)}
        {analysis.pagesLimited ? ' ' + (campaign.characterSheetLimits
          ? t('Ausgewertet werden nur die ersten {n} Seiten.', { n: campaign.characterSheetLimits.maxPages })
          : t('Ausgewertet werden nur die ersten Seiten.')) : ''}
      </span>
      <ErrorBox error={error} />
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small outline" disabled={busy} onClick={() => decide(true)}>{t('Auswerten')}</button>
        <button type="button" className="btn small outline" disabled={busy} onClick={() => decide(false)}>{t('Ablehnen')}</button>
      </div>
    </div>
  );
}

/** Auf der eigenen Charakterseite: Bogen und Hintergrund der SL zur Auswertung geben, Stand sehen */
export function MyAnalyses({ campaign, me, info }: { campaign: Campaign; me: Member; info: ServerInfo | null }) {
  const [analyses, setAnalyses] = useState<CharacterAnalysis[] | null>(null);
  const [sheets, setSheets] = useState<CampaignDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Grenzen vom Server (ab 0.4.19), sonst die von 0.4.18 ohne Zahlen im Text
  const limits = campaign.characterSheetLimits ?? null;
  const maxSheets = limits?.maxSheets ?? DEFAULT_MAX_SHEETS;

  const load = () => Promise.all([api.characterAnalyses(campaign.id), api.documents(campaign.id)])
    .then(([list, docs]) => {
      setAnalyses(list.filter((a) => a.memberId === me.id));
      setSheets(docs.filter((d) => d.kind === 'character_sheet' && d.uploadedByMemberId === me.id));
    })
    .catch(setError);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  // Läuft gerade etwas, alle paar Sekunden nachsehen
  const running = analyses?.some((a) => a.state === 'queued' || a.state === 'processing');
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(new Error(t('Die Datei ist zu groß (höchstens {mb} MB).', { mb: MAX_MB })));
      return;
    }
    run(() => api.uploadDocument(campaign.id, file, 'character_sheet', file.name.replace(/\.[^.]+$/, '')));
  };

  const removeSheet = async (d: CampaignDocument) => {
    if (await confirmDialog(t('Charakterbogen „{title}“ löschen? Vorschläge, die die Spielleitung schon übernommen hat, bleiben.', { title: d.title }), { confirmLabel: t('Löschen'), danger: true })) {
      run(() => api.deleteDocument(d.id));
    }
  };

  const backstory = analyses?.find((a) => a.source === 'backstory');
  const backstoryOpen = backstory && ['awaiting_gm', 'queued', 'processing'].includes(backstory.state);
  const byDoc = (id: string) => analyses?.find((a) => a.documentId === id);

  return (
    <section className="card" style={{ gap: 10 }}>
      <h2>{t('Für die Spielleitung auswerten')}</h2>
      <span className="muted small">
        {t('Aus deinem Hintergrund und deinem Charakterbogen werden Vorschläge für die Bibel, über die die Spielleitung entscheidet. Was geheim ist, sehen nur sie und du. Ausgewertet wird erst, wenn sie zustimmt.')}{' '}
        {reader(info, campaign)}
      </span>
      <ErrorBox error={error} />

      {me.characterBackstory?.trim() ? (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span className="small">
            <strong>{t('Hintergrund')}</strong>
            {backstory && <span className="muted"> · {t(STATE[backstory.state])}</span>}
          </span>
          {!backstoryOpen && (
            <button type="button" className="btn small outline" disabled={busy}
              onClick={() => run(() => api.requestBackstoryAnalysis(campaign.id).catch((e) => { if (!isApiError(e, 'analysis_pending')) throw e; }))}>
              {backstory ? t('Neuen Stand abgeben') : t('Zur Auswertung abgeben')}
            </button>
          )}
        </div>
      ) : (
        <span className="muted small">{t('Noch kein Hintergrund. Schreib ihn in deiner Sammlung, dann kannst du ihn hier abgeben.')}</span>
      )}

      {sheets.map((d) => {
        const a = d.analysisId ? byDoc(d.id) : undefined;
        return (
          <div key={d.id} className="row between wrap" style={{ gap: 8 }}>
            <span className="small">
              <strong>{d.title}</strong>
              <span className="muted"> · {a ? t(STATE[a.state]) : t('Nur gespeichert')}</span>
              {a?.state === 'failed' && a.message && <span className="muted"> – {a.message}</span>}
            </span>
            <button type="button" className="btn small ghost" disabled={busy} onClick={() => removeSheet(d)}>{t('Löschen')}</button>
          </div>
        );
      })}
      {limits?.maxSheets === 0 ? (
        <span className="muted small">{t('In dieser Kampagne werden keine Charakterbögen angenommen.')}</span>
      ) : sheets.length < maxSheets ? (
        <>
          <button type="button" className="btn outline" disabled={busy} onClick={() => picker.current?.click()}>
            {busy ? t('Lade hoch …') : t('Charakterbogen abgeben')}
          </button>
          <input ref={picker} type="file" hidden accept={ACCEPT} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="muted small">
            {limits
              ? tn(limits.maxSheets, 'PDF, Word oder Text, höchstens {n} Bogen. Ausgewertet werden die ersten {pages} Seiten.',
                'PDF, Word oder Text, höchstens {n} Bögen. Ausgewertet werden die ersten {pages} Seiten.', { pages: limits.maxPages })
              : t('PDF, Word oder Text. Ausgewertet werden nur die ersten Seiten.')}
          </span>
        </>
      ) : (
        <span className="muted small">{t('Mehr Bögen gehen nicht. Lösch einen, um einen neuen abzugeben.')}</span>
      )}
    </section>
  );
}
