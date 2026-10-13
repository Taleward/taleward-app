import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { appTooOld, serverTooOld, getConnection, hasValidToken, setCurrentConnection } from '../api/connections';
import { UpdateAction } from './UpdateNotices';
import { t } from '../i18n';
import { allSafeIds } from '../api/pathGuard';

/**
 * Alles unter /v/<id>/… gehört zu einem Server. Setzt die aktuelle Verbindung,
 * bevor die Seite rendert, damit api.* den richtigen Server und das richtige Token nutzt.
 */
export function ConnectionScope({ children }: { children: ReactNode }) {
  const params = useParams();
  const conn = params.conn ?? '';
  // Kennungen aus der Adresse (auch aus Links von außen) nie ungeprüft an den Server geben
  if (!allSafeIds(params)) return <Navigate to="/" replace />;
  const c = getConnection(conn);
  if (!c) {
    return (
      <div className="screen"><main className="screen-main">
        <div className="empty">{t('Dieser Server ist in der App nicht (mehr) eingerichtet.')}</div>
        <Link className="btn" to="/">{t('Zu deinen Kampagnen')}</Link>
      </main></div>
    );
  }
  if (!hasValidToken(c)) {
    return (
      <div className="screen"><main className="screen-main">
        <div className="empty">{t('Deine Anmeldung bei „{name}“ ist abgelaufen.', { name: c.name })}</div>
        <Link className="btn" to={`/verbinden?server=${encodeURIComponent(c.baseUrl)}`}>{t('Neu anmelden')}</Link>
      </main></div>
    );
  }
  if (serverTooOld(c) && !appTooOld(c)) {
    return (
      <div className="screen"><main className="screen-main" style={{ justifyContent: 'center' }}>
        <div className="card warn">
          <strong>{t('„{name}“ ist veraltet', { name: c.name })}</strong>
          <span className="small">{t('Der Server nutzt Schnittstelle {v}. Diese App unterstützt Server erst ab einer neueren Fassung – der Betreiber muss aktualisieren. Deine anderen Server laufen normal weiter.', { v: c.apiVersion ?? '?' })}</span>
        </div>
        <Link className="btn outline" to="/">{t('Zu deinen Kampagnen')}</Link>
      </main></div>
    );
  }
  if (appTooOld(c)) {
    return (
      <div className="screen"><main className="screen-main" style={{ justifyContent: 'center' }}>
        <div className="card warn">
          <strong>{t('Taleward ist für „{name}“ zu alt', { name: c.name })}</strong>
          <span className="small">{t('Bitte installiere die neue Version, dann geht es hier weiter.')}</span>
          <UpdateAction className="btn" offer={{ url: c.appInfo?.appDownloadUrl ?? null, sha256: c.appInfo?.appDownloadSha256, size: c.appInfo?.appDownloadSizeBytes }} />
        </div>
        <Link className="btn outline" to="/">{t('Zu deinen Kampagnen')}</Link>
      </main></div>
    );
  }
  setCurrentConnection(c.id);
  return <>{children}</>;
}
