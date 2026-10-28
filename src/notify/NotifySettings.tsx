import { useEffect, useState, type ReactNode } from 'react';
import { t, tk } from '../i18n';
import { claimLegacyCharacters } from '../characters/sync';
import {
  checkNotificationsNow, enableNotifications, notificationsAllowed, notifySettings, notifySupported,
  openNotificationSettings, saveNotifySettings, syncNotifier, type NotifyKinds
} from './notifier';

/** Hält den nativen Teil aktuell: beim Start und nach jeder An- oder Abmeldung */
export function NotifierSync() {
  useEffect(() => {
    // Charaktere aus 0.11 einem Konto zuordnen (auch im Browser)
    void claimLegacyCharacters();
    const own = () => void claimLegacyCharacters();
    window.addEventListener('session-chronik:connections', own);
    if (!notifySupported()) return () => window.removeEventListener('session-chronik:connections', own);
    void syncNotifier();
    const h = () => void syncNotifier();
    window.addEventListener('session-chronik:connections', h);
    return () => {
      window.removeEventListener('session-chronik:connections', h);
      window.removeEventListener('session-chronik:connections', own);
    };
  }, []);
  return null;
}

const KINDS: { key: keyof NotifyKinds; label: string }[] = [
  { key: 'recaps', label: tk('Neue Kapitel') },
  { key: 'comments', label: tk('Neue Kommentare') },
  { key: 'polls', label: tk('Terminabstimmungen') },
  { key: 'gm', label: tk('Für die Spielleitung: Kapitel zum Prüfen, mitgebrachte Welt') }
];

/** Einstellungen unter „Konten und Server“ (nur Android-App) */
/** Benachrichtigungen als aufklappbare Zeile (Konten und Server) */
export function NotifySettingsSection({ icon }: { icon?: ReactNode }) {
  const [s, setS] = useState(notifySettings);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { notificationsAllowed().then(setAllowed); }, []);
  if (!notifySupported()) return null;

  const toggle = async (on: boolean) => {
    if (on) {
      const ok = await enableNotifications();
      setAllowed(ok);
      setS(notifySettings());
    } else {
      setS(saveNotifySettings({ enabled: false, asked: true }));
    }
  };

  return (
    <details className="list-item">
      <summary className="list-row">
        {icon}
        <span className="lr-text">{t('Benachrichtigungen')}</span>
        <span className="lr-val">{s.enabled ? t('An') : t('Aus')}</span>
      </summary>
      <div className="list-body">
      <label className="check">
        <input type="checkbox" checked={s.enabled} onChange={(e) => toggle(e.target.checked)} />
        <span>{t('Bei Neuem in meinen Kampagnen benachrichtigen')}</span>
      </label>
      {s.enabled && KINDS.map((k) => (
        <label key={k.key} className="check" style={{ marginLeft: 28 }}>
          <input type="checkbox" checked={s.kinds[k.key]}
            onChange={(e) => setS(saveNotifySettings({ kinds: { ...s.kinds, [k.key]: e.target.checked } }))} />
          <span>{t(k.label)}</span>
        </label>
      ))}
      {s.enabled && allowed === false && (
        <div className="notice" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <span>{t('Android lässt Benachrichtigungen von Taleward gerade nicht zu.')}</span>
          <button type="button" className="btn small outline" onClick={() => openNotificationSettings()}>{t('Android-Einstellungen öffnen')}</button>
        </div>
      )}
      <span className="muted small">
        {t('Die App schaut etwa alle halbe Stunde bei deinen Servern nach – ohne fremden Dienst. Es kann also etwas dauern, bis eine Meldung kommt.')}
      </span>
      {s.enabled && (
        <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => checkNotificationsNow()}>
          {t('Jetzt nachsehen')}
        </button>
      )}
      </div>
    </details>
  );
}

/** Einmaliger Hinweis auf der Kampagnenliste */
export function NotifyPrompt() {
  const [s, setS] = useState(notifySettings);
  if (!notifySupported() || s.enabled || s.asked) return null;
  return (
    <div className="card">
      <strong>{t('Benachrichtigungen einschalten?')}</strong>
      <span className="muted small">{t('Dann sagt dir Taleward Bescheid, wenn ein neues Kapitel da ist, jemand kommentiert oder ein Termin abgestimmt wird.')}</span>
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small" onClick={async () => { await enableNotifications(); setS(notifySettings()); }}>{t('Einschalten')}</button>
        <button type="button" className="btn small ghost" onClick={() => setS(saveNotifySettings({ asked: true }))}>{t('Nicht jetzt')}</button>
      </div>
    </div>
  );
}
