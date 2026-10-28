import { useState, type ReactNode } from 'react';
import { t, tk } from './i18n';
import { syncSystemBars } from './display/systemBars';

/** Thema der App: folgt dem Handy (Standard) oder fest „Pergament“ (hell) bzw. „Spielabend“ (dunkel). */
export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'taleward.theme';

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemeMode(mode: ThemeMode = getThemeMode()): void {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  syncSystemBars();
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignorieren */
  }
  applyThemeMode(mode);
}

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: tk('Wie das Handy') },
  { value: 'light', label: tk('Pergament (hell)') },
  { value: 'dark', label: tk('Spielabend (dunkel)') }
];

export function ThemeSwitch() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  return (
    <div className="field">
      <label htmlFor="theme">{t('Darstellung')}</label>
      <select id="theme" value={mode} onChange={(e) => { const m = e.target.value as ThemeMode; setMode(m); setThemeMode(m); }}>
        {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
      </select>
      <span className="muted small">{t('Spielabend ist für gedimmtes Licht am Tisch gedacht.')}</span>
    </div>
  );
}

/** Darstellung als Zeile in einer Liste (Konten und Server) */
export function ThemeRow({ icon }: { icon?: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  return (
    <label className="list-row">
      {icon}
      <span className="lr-text">{t('Darstellung')}</span>
      <select value={mode} onChange={(e) => { const m = e.target.value as ThemeMode; setMode(m); setThemeMode(m); }}>
        {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
      </select>
    </label>
  );
}
