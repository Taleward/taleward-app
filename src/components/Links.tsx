import { Capacitor } from '@capacitor/core';
import { useState } from 'react';
import type { Link } from '../api/types';
import { t } from '../i18n';
import { confirmDialog } from './confirm';
import { LinkIcon } from '../links/LinkIcon';

/*
 * Links zu anderen Programmen (ab Schnittstelle 0.4.13): virtueller Spieltisch, Discord, Karte, Musik.
 * Öffnen sich immer außerhalb von Taleward; vor dem ersten Öffnen einer Adresse zeigt die App, wohin es geht.
 */

const SEEN_KEY = 'taleward.linksGeoeffnet';

/** Adresse prüfen wie der Server: nur http(s), keine Zugangsdaten. Gibt die bereinigte Adresse oder null zurück. */
export function cleanUrl(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = 'https://' + text;
  try {
    const u = new URL(text);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function seenHosts(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; }
}

/** Link außerhalb von Taleward öffnen; beim ersten Mal je Adresse vorher fragen */
export async function openLink(link: Link): Promise<void> {
  // Vor dem Öffnen dieselbe Prüfung wie bei der Eingabe (nur http/https, keine Zugangsdaten)
  const url = cleanUrl(link.url);
  if (!url) return;
  const host = hostOf(url);
  if (!seenHosts().includes(host)) {
    const ok = await confirmDialog(t('„{label}“ öffnen? Das führt zu {host}, außerhalb von Taleward.', { label: link.label, host }), { confirmLabel: t('Öffnen') });
    if (!ok) return;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenHosts(), host].slice(-200))); } catch { /* egal */ }
  }
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, toolbarColor: '#17313b' });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** Links als Knöpfe; zeigt Name und Adresse */
/** Nur Links mit gültiger Adresse anzeigen */
export function safeLinks(links: Link[] | undefined): Link[] {
  return (links ?? []).filter((l) => l && typeof l.label === 'string' && typeof l.url === 'string' && cleanUrl(l.url) !== null);
}

export function LinkButtons({ links: raw, small = true, compact }: { links: Link[] | undefined; small?: boolean; compact?: boolean }) {
  const links = safeLinks(raw);
  if (!links.length) return null;
  // Schmal (Übersicht): nur Name und Pfeil, die Adresse steht in der Rückfrage beim ersten Öffnen und im Screenreader-Namen
  if (compact) {
    return (
      <div className="row wrap" style={{ gap: 6 }}>
        {links.map((l) => (
          <button key={l.id} type="button" className="btn small ghost link-chip" onClick={() => openLink(l)}
            aria-label={t('{label} öffnen ({host})', { label: l.label, host: hostOf(l.url) })}>
            <LinkIcon url={l.url} size={16} />{l.label} <span aria-hidden>↗</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {links.map((l) => (
        <button key={l.id} type="button" className={small ? 'btn small outline link-btn' : 'btn outline link-btn'} onClick={() => openLink(l)}
          aria-label={t('{label} öffnen ({host})', { label: l.label, host: hostOf(l.url) })}>
          <LinkIcon url={l.url} size={20} />
          <span className="link-text">
            <span>{l.label}</span>
            <span className="link-host" aria-hidden>{hostOf(l.url)} ↗</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Links bearbeiten: Name, Adresse und (wo erlaubt) „auch für Spieler“. Speichert erst über onSave.
 * max: höchstens so viele Links; canShare: Teilen anbieten (nicht bei Szenen).
 */
export function LinkEditor({ links, max, canShare, saveLabel, onSave, onCancel }: {
  links: Link[];
  max: number;
  canShare: boolean;
  /** Beschriftung des Knopfs (Vorgabe „Speichern“) */
  saveLabel?: string;
  onSave: (links: Link[]) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [list, setList] = useState<Link[]>(links);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Eingetippten Link übernehmen; gibt die neue Liste zurück oder null, wenn etwas fehlt */
  const add = (): Link[] | null => {
    const clean = cleanUrl(url);
    if (!clean) { setProblem(t('Das ist keine gültige Adresse. Sie beginnt mit https:// und enthält keine Zugangsdaten.')); return null; }
    if (!label.trim()) { setProblem(t('Gib dem Link einen Namen, etwa „Discord“ oder „Karte“.')); return null; }
    const next = [...list, { id: crypto.randomUUID(), label: label.trim().slice(0, 60), url: clean, shared: false }];
    setList(next);
    setLabel('');
    setUrl('');
    setProblem(null);
    return next;
  };

  const save = async () => {
    // Halb Eingetipptes nicht verlieren
    let final = list;
    if (label.trim() || url.trim()) {
      const next = add();
      if (!next) return;
      final = next;
    }
    setBusy(true);
    try { await onSave(final); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((l) => (
        <div key={l.id} className="link-edit-row">
          <span style={{ flex: 1, minWidth: 0 }}>
            <LinkIcon url={l.url} size={16} /> <strong>{l.label}</strong> <span className="muted small">{hostOf(l.url)}</span>
          </span>
          {canShare && (
            <label className="check small" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!l.shared} onChange={(e) => setList((x) => x.map((y) => (y.id === l.id ? { ...y, shared: e.target.checked } : y)))} />
              <span>{t('Auch für Spieler')}</span>
            </label>
          )}
          <button type="button" className="btn small ghost" aria-label={t('{label} entfernen', { label: l.label })} onClick={() => setList((x) => x.filter((y) => y.id !== l.id))}>×</button>
        </div>
      ))}
      {list.length < max && (
        <div className="link-edit-new">
          <input type="text" aria-label={t('Name des Links')} placeholder={t('Name, z. B. Discord')} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          <input type="text" inputMode="url" autoCapitalize="off" spellCheck={false} aria-label={t('Adresse')} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button type="button" className="btn small outline" onClick={() => add()}>{t('Hinzufügen')}</button>
        </div>
      )}
      {problem && <span className="small" style={{ color: 'var(--siegel-text)' }}>{problem}</span>}
      {canShare && <span className="muted small">{t('Geteilte Links sehen auch die Spieler. Taleward öffnet Links nur außerhalb der App und merkt sich keine Zugangsdaten.')}</span>}
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small" disabled={busy} onClick={save}>{saveLabel ?? t('Speichern')}</button>
        {onCancel && <button type="button" className="btn small ghost" onClick={onCancel}>{t('Abbrechen')}</button>}
      </div>
    </div>
  );
}
