import type { ServerInfo, User } from '../api/types';

/*
 * Was ein Konto auf einem Server darf: Konto anlegen (Registrierungsart) und eigene Kampagnen anlegen (SL-Freigabe,
 * ab Schnittstelle 0.4.23). Die App zeigt damit nur den passenden Weg – durchsetzen tut es der Server.
 */

export type RegistrationMode = 'invite_only' | 'code' | 'open' | 'closed';

/** Registrierungsart laut /info; unbekannte Werte wie invite_only (so verlangt es die Schnittstelle) */
export function registrationMode(info: Pick<ServerInfo, 'registration'> | null | undefined): RegistrationMode | null {
  if (!info) return null;
  const r: string = info.registration;
  return r === 'closed' || r === 'code' || r === 'open' ? r : 'invite_only';
}

/** Braucht das Konto-Anlegen einen Code? Bei open nicht (eine Einladung geht trotzdem) */
export function codeRequired(mode: RegistrationMode | null): boolean {
  return mode !== 'open';
}

/**
 * Welches Feld der Code im Registrieren-Aufruf ist. Bei `code` kann er eine Kampagneneinladung oder der allgemeine
 * Registrierungscode sein – isInvite sagt, ob er sich als Einladung herausgestellt hat.
 */
export function registrationCodes(mode: RegistrationMode | null, code: string, isInvite: boolean): { inviteCode?: string; registrationCode?: string } {
  const c = code.trim();
  if (!c) return {};
  if (mode === 'code' && !isInvite) return { registrationCode: c };
  return { inviteCode: c };
}

export type GmState = 'ok' | 'none' | 'pending' | 'rejected';

/** Darf dieses Konto auf diesem Server eigene Kampagnen anlegen – und wenn nicht, wo steht die Anfrage? */
export function gmState(info: Pick<ServerInfo, 'gmApproval'> | null | undefined, user: Pick<User, 'gmPermission'> | null | undefined): GmState {
  if (!info || info.gmApproval !== 'required' || !user) return 'ok';
  const p = user.gmPermission;
  if (p === undefined || p === 'granted') return 'ok';
  if (p === 'pending' || p === 'rejected') return p;
  return 'none'; // none und unbekannte Werte
}

/** Wartet eine neue Fassung der Nutzungsbedingungen auf Zustimmung? */
export function termsOutdated(info: Pick<ServerInfo, 'termsVersion'> | null | undefined, user: Pick<User, 'termsAcceptedVersion'> | null | undefined): boolean {
  if (!info?.termsVersion || !user) return false;
  return (user.termsAcceptedVersion ?? 0) < info.termsVersion;
}
