import { currentConnectionId, getConnection, p } from '../api/connections';
import { isMusterUrl } from '../api/muster';
import { t } from '../i18n';
import { useEffect, useState, type ReactNode } from 'react';
import type { Unread } from '../api/types';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { OfflineNotice } from './OfflineNotice';
import { IconBack, IconBook, IconMic, IconScroll, IconShield } from './Icons';
import { CampaignCover, hasCover } from '../covers/CampaignCover';

type CoverInfo = Parameters<typeof hasCover>[0];

interface Props {
  overline?: ReactNode;
  title: ReactNode;
  back?: boolean;
  /** Fester Rücksprung (statt "eine Seite zurück"), z. B. zur Kampagnenliste */
  backTo?: { to: string; label: string };
  nav?: boolean;
  /** Innerhalb einer Kampagne: Titelbild als Kopf (groß auf der Übersicht, flach sonst) */
  hero?: { campaign: CoverInfo | null | undefined; large?: boolean };
  /** Schmale Seiten (Aufnahme, Formulare) bleiben auch auf breiten Bildschirmen mittig und schmal */
  narrow?: boolean;
  /** Arbeitsplatz (z. B. Kapitel prüfen): ab 1200 px volle Breite, Spalten scrollen für sich */
  wide?: boolean;
  children: ReactNode;
}

export function Screen({ overline: givenOverline, title, back, backTo, nav = true, hero, narrow, wide, children }: Props) {
  const navigate = useNavigate();
  // In der Musterkampagne steht das im Kopf jeder Seite, damit niemand sie für echt hält
  const connId = useLocation().pathname.match(/^\/v\/([^/]+)/)?.[1];
  const muster = !!connId && isMusterUrl(getConnection(connId)?.baseUrl);
  const overline = muster && typeof givenOverline === 'string' && givenOverline.trim()
    ? `${t('Musterkampagne')} · ${givenOverline}` : givenOverline;
  const withHero = !!hero?.campaign && hasCover(hero.campaign);
  // Breite Bildschirme: Navigation links statt unten (siehe theme.css, .screen.with-nav)
  const cls = ['screen', nav ? 'with-nav' : '', narrow ? 'narrow' : '', wide ? 'wide' : ''].filter(Boolean).join(' ');
  if (withHero) {
    return (
      <div className={cls}>
        <main className="screen-main" style={{ paddingTop: 0 }}>
          <div className={hero!.large ? 'hero large' : 'hero'}>
            <CampaignCover campaign={hero!.campaign!} height="100%" />
            <div className="hero-shade" />
            {(back || backTo) && (backTo
              ? <Link className="hero-back" to={backTo.to}><IconBack size={18} /> {backTo.label}</Link>
              : <button type="button" className="hero-back" onClick={() => navigate(-1)}><IconBack size={18} /> {t('Zurück')}</button>)}
            <div className="hero-text">
              {overline && <div className="overline">{overline}</div>}
              <h1>{title}</h1>
            </div>
            <span className="ribbon" aria-hidden />
          </div>
          <OfflineNotice connId={connId} />
          {children}
        </main>
        {nav && <BottomNav />}
      </div>
    );
  }
  return (
    <div className={cls}>
      <header className="screen-header">
        {back && (
          <button type="button" className="btn ghost small back" onClick={() => navigate(-1)}>
            <IconBack size={20} /> {t('Zurück')}
          </button>
        )}
        {backTo && (
          <Link className="btn ghost small back" to={backTo.to}>
            <IconBack size={20} /> {backTo.label}
          </Link>
        )}
        {overline && <div className="overline">{overline}</div>}
        <h1>{title}</h1>
      </header>
      <main className="screen-main"><OfflineNotice connId={connId} />{children}</main>
      {nav && <BottomNav />}
    </div>
  );
}

/** Breiter Bildschirm (Arbeitsplatz ab 1200 px), folgt Größenänderungen */
export const WORKSPACE = '(min-width: 1200px)';
export function useWorkspace(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WORKSPACE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WORKSPACE);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Untere Leiste – nur innerhalb einer Kampagne. Auf der Kampagnenliste und im Profil gibt es sie nicht,
 * damit man nicht ohne gewählte Kampagne auf Aufnahme, Chronik oder Bibel landet.
 */
function BottomNav() {
  const { campaignId } = useParams();
  const conn = currentConnectionId();
  const current = campaignId ?? (conn ? sessionStorageGet('lastCampaign.' + conn) : null);
  if (!current || !conn) return null;
  const c = p(`/k/${current}`);
  // Aufnahmen macht nur die SL; Rolle merkt sich die App beim Laden der Kampagne
  const isPlayer = sessionStorageGet(`role.${conn}:${current}`) === 'player';
  const [unread, setUnread] = useState(() => storedUnread(current));
  useEffect(() => {
    const update = () => setUnread(storedUnread(current));
    update();
    window.addEventListener('session-chronik:unread', update);
    return () => window.removeEventListener('session-chronik:unread', update);
  }, [current]);
  const dot = <NewDot style={{ position: 'absolute', top: -2, right: -4 }} />;
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined);
  return (
    <nav className="bottom-nav" aria-label={t('Kampagnennavigation')}>
      <NavLink to={c} end className={cls}>
        <IconShield /> <span>{t('Übersicht')}</span>
      </NavLink>
      {!isPlayer && (
        <NavLink to={`${c}/aufnahme`} className={cls}>
          <IconMic /> <span>{t('Aufnahme')}</span>
        </NavLink>
      )}
      <NavLink to={`${c}/chronik`} className={cls}>
        <span style={{ position: 'relative', display: 'inline-flex' }}><IconScroll />{unread.recaps + unread.comments > 0 && dot}</span>
        <span>{t('Chronik')}</span>
      </NavLink>
      <NavLink to={`${c}/bibel`} className={cls}>
        <span style={{ position: 'relative', display: 'inline-flex' }}><IconBook />{unread.bible > 0 && dot}</span>
        <span>{t('Bibel')}</span>
      </NavLink>
    </nav>
  );
}

/** Merkt sich die zuletzt geöffnete Kampagne und die eigene Rolle darin (für die untere Leiste). */
// Gemerkte Werte sind pro Server getrennt – Kampagnen-IDs können sich auf verschiedenen Servern gleichen
const scopedKey = (name: string, campaignId: string) => `${name}.${currentConnectionId() ?? '-'}:${campaignId}`;

export function rememberCampaign(c: { id: string; myRole: string; unread?: Unread }): void {
  sessionStorageSet('lastCampaign.' + (currentConnectionId() ?? '-'), c.id);
  sessionStorageSet(scopedKey('role', c.id), c.myRole);
  if (c.unread) sessionStorageSet(scopedKey('unread', c.id), JSON.stringify(c.unread));
}

export function storedUnread(campaignId: string): Unread {
  try {
    return { recaps: 0, comments: 0, bible: 0, ...JSON.parse(sessionStorageGet(scopedKey('unread', campaignId)) ?? '{}') };
  } catch {
    return { recaps: 0, comments: 0, bible: 0 };
  }
}

/** Nach dem Lesen: Zähler lokal sofort zurücksetzen, damit der Punkt in der Leiste verschwindet */
export function clearStoredUnread(campaignId: string, part: keyof Unread): void {
  sessionStorageSet(scopedKey('unread', campaignId), JSON.stringify({ ...storedUnread(campaignId), [part]: 0 }));
  window.dispatchEvent(new Event('session-chronik:unread'));
}

/** Roter Punkt für „hier ist etwas neu“ */
export function NewDot({ label, style }: { label?: string; style?: React.CSSProperties }) {
  return (
    <span role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--seal)', border: '2px solid var(--paper-raised)', display: 'inline-block', flexShrink: 0, ...style }} />
  );
}

export function sessionStorageGet(key: string): string | null {
  try {
    return sessionStorage.getItem('session-chronik.' + key);
  } catch {
    return null;
  }
}

export function sessionStorageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem('session-chronik.' + key, value);
  } catch {
    /* ignorieren */
  }
}

export function Divider() {
  return (
    <div className="divider" aria-hidden>
      <span />
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : t('Unbekannter Fehler.');
  return (
    <div className="error" role="alert">
      {msg}
    </div>
  );
}
