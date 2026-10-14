import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_VERSION, activeConnections, serverKnowsAppVersion } from '../api/connections';
import { isMusterUrl } from '../api/muster';
import { getLang, t } from '../i18n';

/*
 * Benachrichtigungen, Stufe 1: ohne Push-Dienst. Android prüft im Hintergrund etwa alle 30 Minuten die
 * Kampagnenlisten aller angemeldeten Server (native-android/CheckWorker.java) und meldet Neues. Diese Datei hält die
 * Einstellungen und gibt Server, Anmeldungen und Texte an den nativen Teil weiter. Nur in der Android-App.
 * Stufe 2 (später, mit Play Store): echtes Push über FCM – die Einstellungen hier bleiben gleich.
 */

export interface NotifyKinds {
  recaps: boolean;
  comments: boolean;
  polls: boolean;
  /** Für die Spielleitung: Kapitel zum Prüfen, mitgebrachte Welt */
  gm: boolean;
}

export interface NotifySettings {
  enabled: boolean;
  kinds: NotifyKinds;
  /** Hinweis auf der Kampagnenliste schon beantwortet */
  asked: boolean;
}

interface NotifierPlugin {
  configure(o: Record<string, unknown>): Promise<void>;
  status(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  checkNow(): Promise<void>;
  openSettings(): Promise<void>;
}

const Notifier = registerPlugin<NotifierPlugin>('Notifier');
const KEY = 'taleward.notify';
const DEFAULTS: NotifySettings = { enabled: false, asked: false, kinds: { recaps: true, comments: true, polls: true, gm: true } };

/** Gibt es Benachrichtigungen in dieser Fassung? (nur Android-App) */
export const notifySupported = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export function notifySettings(): NotifySettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return s ? { ...DEFAULTS, ...s, kinds: { ...DEFAULTS.kinds, ...(s.kinds ?? {}) } } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveNotifySettings(change: Partial<NotifySettings>): NotifySettings {
  const next = { ...notifySettings(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Speicher nicht verfügbar */
  }
  void syncNotifier();
  return next;
}

/** Texte für den nativen Teil – in der Sprache der App */
function texts() {
  return {
    channel: t('Neues aus deinen Kampagnen'),
    recapOne: t('Neues Kapitel in „{title}“'),
    recapMany: t('{n} neue Kapitel in „{title}“'),
    recapBody: t('Tippen zum Lesen.'),
    commentOne: t('Neuer Kommentar in „{title}“'),
    commentMany: t('{n} neue Kommentare in „{title}“'),
    commentBody: t('Tippen zum Lesen.'),
    poll: t('Terminabstimmung in „{title}“'),
    pollBody: t('Sag, welche Termine dir passen.'),
    review: t('Kapitel bereit zum Prüfen'),
    reviewBody: t('In „{title}“ wartet ein Kapitel auf dich.'),
    brought: t('Mitgebrachte Welt in „{title}“'),
    broughtBody: t('Die Charaktere bringen Einträge für die Bibel mit.')
  };
}

/** Einstellungen und angemeldete Server an Android geben (beim Start und nach jeder An- oder Abmeldung) */
export async function syncNotifier(): Promise<void> {
  if (!notifySupported()) return;
  const s = notifySettings();
  try {
    await Notifier.configure({
      enabled: s.enabled,
      kinds: s.kinds,
      lang: getLang(),
      appVersion: APP_VERSION,
      texts: texts(),
      // Die Musterkampagne lebt nur in der App; ihr Server ist für Android nicht erreichbar
      servers: activeConnections().filter((c) => !isMusterUrl(c.baseUrl)).map((c) => ({ id: c.id, baseUrl: c.baseUrl, token: c.token, sendAppVersion: serverKnowsAppVersion(c) }))
    });
  } catch {
    /* ältere App ohne nativen Teil */
  }
}

/** Einschalten: Erlaubnis einholen (Android 13+), dann speichern. Liefert, ob Android Benachrichtigungen zulässt. */
export async function enableNotifications(): Promise<boolean> {
  let granted = false;
  try {
    granted = (await Notifier.requestPermission()).granted;
  } catch {
    granted = false;
  }
  saveNotifySettings({ enabled: granted, asked: true });
  return granted;
}

export async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await Notifier.status()).granted;
  } catch {
    return false;
  }
}

export const openNotificationSettings = () => Notifier.openSettings().catch(() => undefined);
export const checkNotificationsNow = () => Notifier.checkNow().catch(() => undefined);
