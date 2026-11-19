import { safeLink } from '../api/safeUrl';
import { useState } from 'react';
import { APP_VERSION, appTooOld, serverTooOld, versionLess, type Connection } from '../api/connections';
import { getLang, t } from '../i18n';
import { officialDownloadUrl, usableOffer } from '../update/offer';
import { DIST, PLAY_STORE_URL, canSelfUpdate, downloadAndInstall, installDownloaded, openInstallSettings } from '../update/updater';

const DISMISS_KEY = 'taleward.updateDismissed';

interface Offer {
  version: string;
  url: string | null;
  sha256: string | null;
  size: number | null;
  notes: string | null;
}

/** Die neueste Fassung gewinnt: höchste latestAppVersion aller Server, geladen vom Server, der sie anbietet */
function newestOffer(conns: Connection[]): Offer | null {
  let best: Offer | null = null;
  for (const c of conns) {
    const v = c.appInfo?.latestAppVersion;
    if (v && versionLess(APP_VERSION, v) && (!best || versionLess(best.version, v))) {
      best = {
        version: v, url: c.appInfo?.appDownloadUrl ?? null, sha256: c.appInfo?.appDownloadSha256 ?? null,
        size: c.appInfo?.appDownloadSizeBytes ?? null, notes: c.appInfo?.releaseNotes ?? null
      };
    }
  }
  return best;
}

/** „Was ist neu“ kommt als Markdown: Überschriften weglassen, Aufzählungen mit Punkt */
export function plainNotes(notes: string): string {
  return notes.split('\n')
    .filter((l) => !/^\s*#{1,6}\s/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, '• '))
    .join('\n')
    .trim();
}

/** Fehler des nativen Teils in eigenen Worten (DE/EN); unbekannte mit der Meldung des Geräts */
function updateError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'wrong_package' || code === 'wrong_signature' || code === 'not_an_app') {
    return t('Diese Datei ist keine Taleward-Fassung mit unserer Signatur. Sie wurde gelöscht und nicht installiert.');
  }
  if (code === 'checksum_mismatch') return t('Die heruntergeladene Datei ist beschädigt (Prüfsumme stimmt nicht).');
  if (code === 'no_checksum' || code === 'insecure_url') return t('Dieser Server bietet die neue Fassung nicht sicher an. Lade sie von taleward.org.');
  return e instanceof Error ? e.message : String(e);
}

/** Offizielle Bezugsquelle (Website) – immer ein zweiter Weg neben dem Angebot eines Servers */
export function OfficialDownload({ className = 'btn small outline' }: { className?: string }) {
  if (DIST === 'store') return null;
  return <a className={className} href={officialDownloadUrl(getLang())} target="_blank" rel="noopener noreferrer">{t('Von taleward.org laden')}</a>;
}

/** Download-Knopf als echter Link – öffnet im Browser des Handys */
export function DownloadButton({ url, className = 'btn small' }: { url: string; className?: string }) {
  const href = safeLink(url);
  if (!href) return null;
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{t('Herunterladen')}</a>;
}

/**
 * Aktualisieren je nach Fassung: APK-Fassung lädt und öffnet den Installationsdialog, Play-Store-Fassung verweist
 * in den Store, im Browser ein einfacher Download-Link.
 */
export function UpdateAction({ offer, className = 'btn small' }: { offer: { url: string | null; sha256?: string | null; size?: number | null }; className?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'permission' | 'installing' | 'error'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (DIST === 'store') {
    return <a className={className} href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">{t('Update im Play Store')}</a>;
  }
  // A26: nur Angebote mit https (http im Heimnetz) und Prüfsumme; sonst die offizielle Quelle
  const usable = usableOffer(offer);
  if (!usable) return <OfficialDownload className={className} />;
  if (!canSelfUpdate()) return <DownloadButton url={usable.url} className={className} />;

  const start = async () => {
    setState('loading');
    setError(null);
    try {
      const r = await downloadAndInstall({ url: usable.url, sha256: usable.sha256, sizeBytes: offer.size }, setProgress);
      setState(r === 'needs_permission' ? 'permission' : 'installing');
    } catch (e) {
      setError(updateError(e));
      setState('error');
    }
  };

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="small">{t('Lädt die neue Fassung …')}</span>
        <div className="progress"><div style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>
      </div>
    );
  }
  if (state === 'permission') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="small">{t('Android fragt einmal, ob Taleward Apps installieren darf. Erlauben, zurückkommen, dann „Installieren“.')}</span>
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn small outline" onClick={() => openInstallSettings()}>{t('Erlauben')}</button>
          <button type="button" className={className} onClick={async () => setState((await installDownloaded()) === 'installing' ? 'installing' : 'permission')}>
            {t('Installieren')}
          </button>
        </div>
      </div>
    );
  }
  if (state === 'installing') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="small">{t('Im Installationsdialog auf „Installieren“ tippen. Danach startet Taleward neu.')}</span>
        <span className="muted small">{t('Sperrt das Telefon die Installation (bei Samsung „Automatische Sperre“ unter Sicherheit und Datenschutz), diese kurz ausschalten und danach wieder einschalten.')}</span>
      </div>
    );
  }
  return (
    <>
      {error && <div className="error" role="alert">{error}</div>}
      <button type="button" className={className} onClick={start}>{state === 'error' ? t('Noch einmal versuchen') : t('Jetzt aktualisieren')}</button>
    </>
  );
}

/** Hinweise in der Kampagnenliste: neue Version (wegklickbar), App zu alt, Server veraltet (bleiben) */
export function UpdateNotices({ connections }: { connections: Connection[] }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY); } catch { return null; }
  });
  // Web-Fassung ist immer aktuell; die Play-Store-Fassung aktualisiert der Store selbst (der Server kennt oft schon
  // eine neuere Fassung, als der Store gerade verteilt) – in beiden kein Hinweis auf neue Versionen
  const offer = DIST === 'web' || DIST === 'store' ? null : newestOffer(connections);
  const blocked = connections.filter(appTooOld);
  const outdatedServers = connections.filter((c) => serverTooOld(c) && !appTooOld(c));

  return (
    <>
      {blocked.map((c) => (
        <div key={c.id} className="card warn">
          <strong>{t('Taleward ist für „{name}“ zu alt', { name: c.name })}</strong>
          <span className="small">
            {t('Der Server verlangt mindestens Version {min}, du hast {v}. Die Kampagnen dort sind gesperrt, bis du aktualisierst.', {
              min: c.appInfo?.minAppVersion ?? '?', v: APP_VERSION
            })}
          </span>
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
            <UpdateAction offer={{ url: c.appInfo?.appDownloadUrl ?? null, sha256: c.appInfo?.appDownloadSha256, size: c.appInfo?.appDownloadSizeBytes }} />
            {usableOffer({ url: c.appInfo?.appDownloadUrl, sha256: c.appInfo?.appDownloadSha256 }) && <OfficialDownload />}
          </div>
        </div>
      ))}
      {outdatedServers.map((c) => (
        <div key={c.id} className="card warn">
          <strong>{t('„{name}“ ist veraltet', { name: c.name })}</strong>
          <span className="small">{t('Der Server nutzt Schnittstelle {v}. Diese App unterstützt Server erst ab einer neueren Fassung – der Betreiber muss aktualisieren. Deine anderen Server laufen normal weiter.', { v: c.apiVersion ?? '?' })}</span>
        </div>
      ))}
      {offer && dismissed !== offer.version && blocked.length === 0 && (
        <div className="card">
          <div className="row between">
            <strong>{t('Taleward {v} ist da', { v: offer.version })}</strong>
            <span className="muted small">{t('du hast {v}', { v: APP_VERSION })}</span>
          </div>
          {offer.notes && <span className="small" style={{ whiteSpace: 'pre-wrap' }}>{plainNotes(offer.notes)}</span>}
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
            <UpdateAction offer={{ url: offer.url, sha256: offer.sha256, size: offer.size }} />
            <button type="button" className="btn small outline" onClick={() => {
              try { localStorage.setItem(DISMISS_KEY, offer.version); } catch { /* egal */ }
              setDismissed(offer.version);
            }}>{t('Später')}</button>
          </div>
        </div>
      )}
    </>
  );
}
