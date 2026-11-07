import { useState } from 'react';
import { api, isApiError } from '../api/client';
import { currentConnection, versionLess } from '../api/connections';
import type { Member, NameFix, NameFixPreview } from '../api/types';
import { confirmDialog } from '../components/confirm';
import { Dialog } from '../components/Dialog';
import { ErrorBox } from '../components/Screen';
import { t, tn } from '../i18n';
import { cleanName, excerptParts, nameFixProblem, NAME_FIX_MAX } from './nameFix';

/** Kann der Server Schreibweisen kampagnenweit berichtigen? (Schnittstelle ab 0.4.31) */
export function serverHasNameFix(): boolean {
  try {
    const v = currentConnection().apiVersion;
    return !!v && !versionLess(v, '0.4.31');
  } catch {
    return false;
  }
}

/** Ausschnitt mit hervorgehobenem Wort, ohne HTML aus Serverdaten */
export function Excerpt({ text }: { text: string }) {
  return <>{excerptParts(text).map((x, i) => (x.mark ? <mark key={i}>{x.text}</mark> : <span key={i}>{x.text}</span>))}</>;
}

/**
 * Schreibweise einmal berichtigen, gilt in der ganzen Kampagne (nur SL): Vorschau aller Fundstellen, abwählbar, dann
 * berichtigen. Charaktere, Kommentare und Vorschläge von Spielenden ändert der Server nie – sie stehen nur als Hinweis da.
 */
export function NameFixDialog({ campaignId, campaignTitle, members, from: initialFrom = '', to: initialTo = '', onClose, onDone }: {
  campaignId: string;
  campaignTitle: string;
  members: Member[];
  from?: string;
  to?: string;
  onClose: () => void;
  /** Nach dem Berichtigen oder Rückgängigmachen (Seite neu laden) */
  onDone?: () => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [preview, setPreview] = useState<NameFixPreview | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [rule, setRule] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<NameFix | null>(null);
  const [undone, setUndone] = useState<string | null>(null);

  const problem = nameFixProblem(from, to);
  const problemText = problem === 'same' ? t('Die beiden Schreibweisen sind gleich.')
    : problem === 'long' ? t('Höchstens {n} Zeichen.', { n: NAME_FIX_MAX })
      : null;

  const search = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const pv = await api.nameFixPreview(campaignId, cleanName(from), cleanName(to));
      setPreview(pv);
      setSkip(new Set(pv.hits.filter((h) => !h.preselected).map((h) => h.id)));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const chosen = preview ? preview.hits.filter((h) => !skip.has(h.id)) : [];
  const count = chosen.reduce((n, h) => n + h.count, 0);

  const fix = async () => {
    if (!preview) return;
    const ok = await confirmDialog(
      tn(count, '„{from}“ an einer Stelle in „{title}“ auf „{server}“ zu „{to}“ berichtigen?', '„{from}“ an {n} Stellen in „{title}“ auf „{server}“ zu „{to}“ berichtigen?',
        { from: preview.from, to: preview.to, title: campaignTitle, server: currentConnection().name }),
      { confirmLabel: t('Berichtigen') });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.nameFix(campaignId, { from: preview.from, to: preview.to, previewVersion: preview.previewVersion, skipHitIds: [...skip], rule });
      setDone(r);
      onDone?.();
    } catch (e) {
      if (isApiError(e, 'preview_stale')) {
        setNotice(t('Seit der Vorschau hat sich etwas geändert. Hier sind die Stellen von jetzt.'));
        await search();
      } else setError(e);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!done) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.undoNameFix(done.id);
      setUndone(r.skipped.length
        ? tn(r.restored, 'Eine Stelle zurückgesetzt. Seitdem geändert und deshalb so geblieben: {places}.', '{n} Stellen zurückgesetzt. Seitdem geändert und deshalb so geblieben: {places}.', { places: r.skipped.map((x) => x.label).join(', ') })
        : tn(r.restored, 'Eine Stelle zurückgesetzt.', '{n} Stellen zurückgesetzt.'));
      onDone?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.displayName ?? t('einer Person');

  if (done) {
    return (
      <Dialog title={t('Schreibweise berichtigen')} onClose={onClose}>
        <ErrorBox error={error} />
        <p role="status" style={{ margin: 0 }}>
          {undone ?? tn(done.changed, 'Eine Stelle berichtigt.', '{n} Stellen berichtigt.')}
        </p>
        {!undone && done.rule && (
          <p className="muted small" style={{ margin: 0 }}>{t('„Namen prüfen“ schlägt bei späteren Runden „{to}“ vor, wenn „{from}“ gehört wird.', { from: done.from, to: done.to })}</p>
        )}
        <button type="button" className="btn" onClick={onClose}>{t('Fertig')}</button>
        {!undone && done.undoUntil && (
          <button type="button" className="quiet-link" disabled={busy} onClick={undo}>{t('Rückgängig')}</button>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog title={t('Schreibweise berichtigen')} onClose={onClose}>
      <ErrorBox error={error} />
      {notice && <div className="notice" role="status">{notice}</div>}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="nf-from">{t('Falsch geschrieben')}</label>
        <input id="nf-from" type="text" maxLength={NAME_FIX_MAX} value={from} autoComplete="off"
          onChange={(e) => { setFrom(e.target.value); setPreview(null); }} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="nf-to">{t('Richtig')}</label>
        <input id="nf-to" type="text" maxLength={NAME_FIX_MAX} value={to} autoComplete="off"
          onChange={(e) => { setTo(e.target.value); setPreview(null); }} aria-describedby="nf-hint" />
        <span id="nf-hint" className="muted small">{problemText ?? t('Gilt danach in allen Kapiteln, der Bibel, offenen Vorschlägen und Abschriften.')}</span>
      </div>

      {!preview && (
        <button type="button" className="btn" disabled={busy || !!problem} onClick={search}>{t('Stellen suchen')}</button>
      )}

      {preview && (
        <>
          {preview.secretWarning && (
            <div className="notice warn" role="note">
              {t('„{to}“ steht bisher nur in Geheimem. In veröffentlichten Kapiteln lesen ihn danach alle. Diese Stellen sind deshalb nicht ausgewählt.', { to: preview.to })}
            </div>
          )}
          {preview.hits.length === 0
            ? <p className="muted" style={{ margin: 0 }}>{t('„{from}“ kommt in dieser Kampagne nirgends vor.', { from: preview.from })}</p>
            : (
              <div className="namefix-hits" role="group" aria-label={t('Fundstellen')}>
                {preview.hits.map((h) => (
                  <div key={h.id} className="namefix-hit">
                    <label className="check">
                      <input type="checkbox" checked={!skip.has(h.id)}
                        onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(h.id); else n.add(h.id); return n; })} />
                      <span>{h.label} <span className="muted">· {tn(h.count, 'eine Stelle', '{n} Stellen')}</span></span>
                    </label>
                    {!!h.excerpts?.length && (
                      <details>
                        <summary className="small">{t('Zeigen')}</summary>
                        {h.excerpts.map((x, i) => <p key={i} className="small" style={{ margin: '4px 0 0' }}><Excerpt text={x} /></p>)}
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}

          {(preview.untouched.characters.length > 0 || preview.untouched.comments > 0 || preview.untouched.playerProposals > 0) && (
            <div className="muted small" style={{ display: 'grid', gap: 4 }}>
              {[...new Set(preview.untouched.characters.map((c) => c.memberId))].map((id) => (
                <span key={id}>{t('Im Charakter von {name} – nur diese Person kann es ändern.', { name: nameOf(id) })}</span>
              ))}
              {preview.untouched.comments > 0 && <span>{tn(preview.untouched.comments, 'Ein Kommentar nennt es noch so.', '{n} Kommentare nennen es noch so.')}</span>}
              {preview.untouched.playerProposals > 0 && <span>{tn(preview.untouched.playerProposals, 'Ein Vorschlag von Spielenden nennt es noch so. Berichtige ihn beim Übernehmen.', '{n} Vorschläge von Spielenden nennen es noch so. Berichtige sie beim Übernehmen.')}</span>}
            </div>
          )}

          {preview.hits.length > 0 && (
            <>
              <label className="check">
                <input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} />
                <span>{t('Künftig erkennen')} <span className="muted small">– {t('„Namen prüfen“ schlägt dann die richtige Schreibweise vor.')}</span></span>
              </label>
              <button type="button" className="btn" disabled={busy || count === 0} onClick={fix}>
                {tn(count, 'Eine Stelle berichtigen', '{n} Stellen berichtigen')}
              </button>
            </>
          )}
        </>
      )}
      <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>{t('Abbrechen')}</button>
    </Dialog>
  );
}
