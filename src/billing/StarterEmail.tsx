import { useEffect, useState } from 'react';
import { apiFor, fetchServerInfo } from '../api/client';
import type { Connection } from '../api/connections';
import type { StarterCredit, User } from '../api/types';
import { t } from '../i18n';
import { eur } from './CreditWaitNote';
import { billingOn } from './rules';

/**
 * Beim ersten Anlegen einer Kampagne auf einem Server mit Guthaben: freiwillig nach der E-Mail-Adresse fragen
 * (ab 0.4.37 mit Startguthaben). Kein Pflichtfeld; leer lassen geht immer. Eingetragen wird erst nach dem Anlegen.
 */
export function StarterEmail({ conn, first, value, onChange }: { conn: Connection; first: boolean; value: string; onChange: (v: string) => void }) {
  const [state, setState] = useState<{ user: User; starter: StarterCredit | null } | null>(null);
  useEffect(() => {
    let alive = true;
    setState(null);
    (async () => {
      const info = await fetchServerInfo(conn.baseUrl).catch(() => null);
      if (!billingOn(info)) return;
      const api = apiFor(conn);
      const user = await api.me().catch(() => null);
      if (!user || user.email) return;
      const credits = await api.credits().catch(() => []);
      const starter = credits.find((c) => c.kind === 'account')?.starterCredit ?? null;
      if (alive) setState({ user, starter });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.id, conn.baseUrl]);
  if (!state) return null;
  const needs = state.starter?.status === 'needs_verified_email' && !!state.starter.amountCents;
  if (!first && !needs) return null;
  const hint = t('Damit dir der Server Bescheid sagen kann, wenn Guthaben fehlt.')
    + (needs ? ' ' + t('Mit bestätigter Adresse bekommst du {amount} zum Ausprobieren.', { amount: eur(state.starter!.amountCents!) }) : '');
  if (state.user.emailPending) {
    return <span className="muted small">{t('Der Bestätigungslink ist an {email} unterwegs.', { email: state.user.emailPending })} {needs ? t('Mit bestätigter Adresse bekommst du {amount} zum Ausprobieren.', { amount: eur(state.starter!.amountCents!) }) : ''}</span>;
  }
  return (
    <div className="field">
      <label htmlFor="cmail">{t('E-Mail-Adresse (freiwillig)')}</label>
      <input id="cmail" type="email" autoComplete="email" spellCheck={false} value={value} aria-describedby="cmail-hint" onChange={(e) => onChange(e.target.value)} />
      <span id="cmail-hint" className="muted small">{hint}</span>
    </div>
  );
}
